// core/run-open leftover terminals: a terminal the machine made and could
// not prove closed is never dropped silently (C9). Every refusal that created a terminal keeps its code and notSent (the
// app never ran) and adds `leftover` when the DELETE was not proven (2xx, 404 gone, 409 already replaced); close() does
// the same after a proven end. discard(leftover) sends only that DELETE and says removed only on the same proof.
import { describe, expect, it } from 'vitest';
import { FakeKits, type Sent } from './fakeKits';
import { createRunOpen, route, type RunSend } from './index';

const COMPUTER = { project: 'p1', computer_id: 'c0ffee' };
function send(k: FakeKits): RunSend {
  return (target, method, path, query, body) => {
    if (route(target.kit, target.index, method, path, query ?? {}, body) !== null) return Promise.reject({ notSent: true, code: 'ROUTE_REFUSED' });
    return k.send(target, method, path, query as Record<string, string>, body) as ReturnType<RunSend>;
  };
}
const machine = (k: FakeKits) => createRunOpen({ send: send(k), now: k.now, sleep: k.sleep, random: k.random, computer: COMPUTER });
const isDelete = (s: Sent) => s.method === 'DELETE' && /^\/api\/v1\/terminal\/\d+$/.test(s.path);
type Verdict = ReturnType<FakeKits['faults'][number]>;
/** The next DELETE answers `v` (an answer, or a send failure) instead of the kit. */
const failDelete = (k: FakeKits, v: Verdict) => k.faults.push((s) => (isDelete(s) ? v : undefined));
const tracked = (k: FakeKits) => k.of('/api/v1/terminal/execute').filter((s) => s.target.index !== 0);

const UNPROVEN: [string, Verdict][] = [
  ['a 503', { status: 503, body: { error: 'unavailable', code: 'UNAVAILABLE' } }],
  ['a 403', { status: 403, body: { error: 'forbidden', code: 'FORBIDDEN' } }],
  ['no answer', 'drop-request'],
  ['the answer lost', 'drop-reply'],
  ['never sent', 'not-sent'],
];
const PROVEN: [string, Verdict | null][] = [
  ['deleted (200)', null],
  ['already gone (404)', { status: 404, body: { error: 'session_not_found', code: 'SESSION_NOT_FOUND' } }],
  ['already replaced (409)', { status: 409, body: { error: 'incarnation_mismatch', code: 'INCARNATION_MISMATCH' } }],
];

/** The four open() refusals that made a terminal first: each sets the kit up and opens. */
const SITES: [string, string, (k: FakeKits) => ReturnType<ReturnType<typeof createRunOpen>['open']>][] = [
  ['the create answered another user', 'unsafe_setup', (k) => ((k.createAs = { user: 'user', uid: 0 }), machine(k).open({ app: 'htop' }))],
  ['the create started another shell', 'shell_unavailable', (k) => ((k.createShellEcho = 'none'), machine(k).open({ app: 'htop', shell: 'bash' }))],
  ['aborted after the create', 'cancelled', (k) => {
    const ac = new AbortController();
    k.faults.push((s) => (s.path === '/api/v1/terminal/create' ? (ac.abort(), undefined) : undefined));
    return machine(k).open({ app: 'htop' }, { signal: ac.signal });
  }],
  ['a definite execute refusal (barrier refused)', 'not_durable', (k) => machine(k).open({ app: 'htop' }, { beforeExecute: () => false })],
];

describe('a refusal after a create keeps a terminal it could not prove closed', () => {
  for (const [site, code, run] of SITES) {
    it.each(UNPROVEN)(`leftover_on_unconfirmed_cleanup: ${site}, the DELETE %s: same code, notSent, plus the leftover`, async (_w, v) => {
      const k = new FakeKits();
      failDelete(k, v);
      const r = await run(k);
      expect([r.ok, r.code, r.notSent, r.state, r.handle]).toEqual([false, code, true, undefined, undefined]);
      expect(tracked(k)).toHaveLength(0);
      const del = k.sent.filter(isDelete);
      expect(del).toHaveLength(1);
      expect(r.leftover).toEqual({ terminal_id: del[0]!.target.index, incarnation: del[0]!.query!.incarnation, computer: COMPUTER, launch_tag: expect.stringMatching(/^[0-9a-f]{16}$/) });
    });
    it.each(PROVEN)(`no_leftover_on_proven_cleanup: ${site}, the DELETE %s: no leftover`, async (_w, v) => {
      const k = new FakeKits();
      if (v) failDelete(k, v);
      const r = await run(k);
      expect([r.code, r.notSent]).toEqual([code, true]);
      expect(r.leftover).toBeUndefined();
    });
  }

  it('a refusal before any create (resolve, ports) has no leftover and sends no DELETE', async () => {
    const k = new FakeKits();
    k.resolve = { status: 200, body: { status: 'error', error: 'nope' } };
    const r = await machine(k).open({ app: 'htop' });
    expect(r.leftover).toBeUndefined();
    expect(k.sent.filter(isDelete)).toHaveLength(0);
  });

  it('a create answered without an incarnation keeps its old answer (it cannot be deleted at all)', async () => {
    const k = new FakeKits();
    k.createAs = { user: 'user', uid: 1000, incarnation: null };
    const r = await machine(k).open({ app: 'htop' });
    expect([r.code, (r as { terminal_id?: number }).terminal_id, r.leftover]).toEqual(['unsafe_setup', 8001, undefined]);
    expect(k.sent.filter(isDelete)).toHaveLength(0);
  });
});

describe('discard(leftover) sends only the DELETE and says removed only on proof', () => {
  async function left(k: FakeKits) {
    failDelete(k, { status: 503, body: { error: 'unavailable', code: 'UNAVAILABLE' } });
    const r = await machine(k).open({ app: 'htop' }, { beforeExecute: () => false });
    if (!r.leftover) throw new Error('no leftover');
    return r.leftover;
  }

  it.each(UNPROVEN)('discard_unconfirmed_keeps_leftover: the DELETE %s: remove_unconfirmed; a later discard removes it', async (_w, v) => {
    const k = new FakeKits();
    const lo = await left(k);
    const before = k.sent.length;
    failDelete(k, v);
    const r = await machine(k).discard(lo);
    expect([r.ok, r.code, r.state]).toEqual([false, 'remove_unconfirmed', undefined]);
    // Only the DELETE of that terminal at that incarnation: no signal, no read, no execute.
    const mine = k.sent.slice(before);
    expect(mine.map((s) => [s.method, s.path, s.target.index, s.query?.incarnation])).toEqual([['DELETE', `/api/v1/terminal/${lo.terminal_id}`, lo.terminal_id, lo.incarnation]]);
    expect(k.sessions.has(lo.terminal_id)).toBe(v !== 'drop-reply');
    const again = await machine(k).discard(lo);
    expect([again.ok, again.code]).toEqual([true, 'removed']);
    expect(k.sessions.has(lo.terminal_id)).toBe(false);
  });

  it.each(PROVEN)('discard_proven: the DELETE %s: removed', async (_w, v) => {
    const k = new FakeKits();
    const lo = await left(k);
    if (v) failDelete(k, v);
    const r = await machine(k).discard(lo);
    expect([r.ok, r.code]).toEqual([true, 'removed']);
  });

  it('discard_legacy_band: close() of a launch made before, in 15001-19999, whose DELETE was not proven: its leftover is removed by discard (that DELETE alone)', async () => {
    const k = new FakeKits();
    const o = await machine(k).open({ app: 'htop' });
    // Move the launch to the old band, as if an earlier Hub had made it there (band.test.ts does the same).
    const from = o.handle!.terminal_id, to = 15001;
    k.sessions.set(to, k.sessions.get(from)!);
    k.sessions.delete(from);
    for (const w of k.workloads) if (w.terminal_id === String(from)) w.terminal_id = String(to);
    const old = { ...o.handle!, terminal_id: to, display: to };
    await machine(k).status(old);
    failDelete(k, { status: 503, body: { error: 'unavailable', code: 'UNAVAILABLE' } });
    const c = await machine(k).close(old);
    expect(c.leftover).toMatchObject({ terminal_id: to });
    const before = k.sent.length;
    const r = await machine(k).discard(c.leftover!);
    expect([r.ok, r.code]).toEqual([true, 'removed']);
    expect(k.sent.slice(before).map((s) => [s.method, s.path])).toEqual([['DELETE', `/api/v1/terminal/${to}`]]);
    expect(k.sessions.has(to)).toBe(false);
  });

  it('a leftover of another computer, or one that does not check, sends nothing', async () => {
    const k = new FakeKits();
    const lo = await left(k);
    const before = k.sent.length;
    const other = await machine(k).discard({ ...lo, computer: { project: 'p1', computer_id: 'other' } });
    expect([other.ok, other.code, other.notSent]).toEqual([false, 'wrong_computer', true]);
    for (const bad of [null, {}, { ...lo, incarnation: 'x' }, { ...lo, terminal_id: 7 }, { ...lo, terminal_id: '8001' }]) {
      const r = await machine(k).discard(bad as never);
      expect([r.ok, r.code, r.notSent]).toEqual([false, 'invalid_handle', true]);
    }
    expect(k.sent.length).toBe(before);
  });
});

describe('close() after a proven end keeps a terminal it could not prove closed', () => {
  it.each(UNPROVEN)('close_leftover: the final DELETE %s: stopped (the app ended) plus the leftover', async (_w, v) => {
    const k = new FakeKits();
    const o = await machine(k).open({ app: 'htop' });
    await machine(k).status(o.handle!);
    failDelete(k, v);
    const c = await machine(k).close(o.handle!);
    expect([c.ok, c.state, c.code]).toEqual([true, 'stopped', 'stopped']);
    expect(c.leftover).toEqual({ terminal_id: o.handle!.terminal_id, incarnation: o.handle!.incarnation, computer: COMPUTER, launch_tag: o.handle!.launch_tag });
  });

  it.each(PROVEN)('close_no_leftover: the final DELETE %s: stopped, no leftover', async (_w, v) => {
    const k = new FakeKits();
    const o = await machine(k).open({ app: 'htop' });
    await machine(k).status(o.handle!);
    if (v) failDelete(k, v);
    const c = await machine(k).close(o.handle!);
    expect([c.state, c.leftover]).toEqual(['stopped', undefined]);
  });
});
