// Vitest: the per-job stop store. Rows only from the per-session list (a Stop is never offered on a
// job that list did not name); one new key per press, the target captured at send; only positive evidence settles, and
// Already-ended reads "not running now"; 422 is unknown (debug note without the key); Check again reads the list and never
// sends; a press is gated by the activation capability at the moment it is made.
import { describe, expect, it, vi } from 'vitest';
import type { Capability } from './capability';
import { createShellJobStops, type ChatRef, type JobStopTarget, type ShellJobStopDeps } from './shellJobStop';

const chat: ChatRef = { computer: 'atlas', realm: '0123456789abcdef01234567', sid: 's-1' };
const row = (jobId: string, state = 'running', o: Record<string, unknown> = {}) => ({ job_id: jobId, command: `cmd ${jobId}`, started_ms: 1, state, last_line: '', remote: false, ...o });
const list = (...items: unknown[]) => ({ ok: true as const, body: { items } });
const ans = (jobId: string, o: Record<string, unknown>) => ({ ok: true, status: 200, body: { job_id: jobId, already_ended: false, remote: false, duplicate: false, ...o } });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const p = new Promise<T>((r) => { resolve = r; });
  return { p, resolve };
}

function harness(o: Partial<ShellJobStopDeps> & { lists?: unknown[]; replies?: unknown[]; gate?: () => Capability } = {}) {
  const lists = [...(o.lists ?? [list(row('bg-1'))])];
  const replies = [...(o.replies ?? [])];
  const sent: Array<{ target: JobStopTarget; key: string }> = [];
  const reads: ChatRef[] = [];
  let n = 0;
  const debug = vi.fn();
  const deps: ShellJobStopDeps = {
    chat,
    list: o.list ?? (async (c) => { reads.push(c); const x = lists.length > 1 ? lists.shift() : lists[0]; if (x instanceof Error) throw x; return x as { ok: true; body: unknown }; }),
    stop: o.stop ?? (async (target, key) => { sent.push({ target, key }); const x = replies.shift(); if (x instanceof Error) throw x; return x; }),
    newKey: o.newKey ?? (() => `k-${++n}`),
    can: o.gate ?? (() => ({ ok: true })),
    debug,
  };
  return { store: createShellJobStops(deps), sent, reads, debug };
}

describe('rows come only from the per-session list', () => {
  it('before any read there is no row and no Stop', async () => {
    const { store, sent } = harness();
    expect(store.snapshot().rows).toBeNull();
    expect(await store.stop('bg-1')).toEqual({ k: 'refused', why: 'not_listed' });
    expect(sent).toEqual([]);
  });
  it('a job the list did not name (a stream-only id, another session\'s job) can never be stopped', async () => {
    const { store, sent } = harness({ lists: [list(row('bg-1'))] });
    await store.refresh();
    expect(store.canStop('bg-1')).toEqual({ k: 'ok' });
    expect(store.canStop('other-session-job')).toEqual({ k: 'refused', why: 'not_listed' });
    expect(await store.stop('other-session-job')).toEqual({ k: 'refused', why: 'not_listed' });
    expect(sent).toEqual([]);
  });
  it('an ended job offers no Stop; a running or unknown one does', async () => {
    const { store } = harness({ lists: [list(row('a', 'ended'), row('b', 'running'), row('c', 'unknown'))] });
    await store.refresh();
    expect(store.canStop('a')).toEqual({ k: 'refused', why: 'not_running' });
    expect(store.canStop('b')).toEqual({ k: 'ok' });
    expect(store.canStop('c')).toEqual({ k: 'ok' });
  });
  it('an unreadable read keeps the rows it had and says so; a readable one replaces them', async () => {
    const { store } = harness({ lists: [list(row('a')), { ok: false }, list(row('b')), new Error('x'), list(row('a'), row('a'))] });
    await store.refresh();
    await store.refresh();
    expect(store.snapshot()).toMatchObject({ listUnreadable: true });
    expect(store.snapshot().rows?.map((r) => r.jobId)).toEqual(['a']);
    await store.refresh();
    expect(store.snapshot()).toMatchObject({ listUnreadable: false });
    expect(store.snapshot().rows?.map((r) => r.jobId)).toEqual(['b']);
    await store.refresh(); // a throw
    expect(store.snapshot().listUnreadable).toBe(true);
    await store.refresh(); // two rows with one id: nothing trusted
    expect(store.snapshot().rows?.map((r) => r.jobId)).toEqual(['b']);
  });
  it('an older read that answers after a newer one never replaces its rows', async () => {
    const d1 = deferred<{ ok: true; body: unknown }>(), d2 = deferred<{ ok: true; body: unknown }>();
    const queue = [d1, d2];
    const { store } = harness({ list: () => queue.shift()!.p });
    const r1 = store.refresh(), r2 = store.refresh();
    d2.resolve(list(row('new')));
    await r2;
    d1.resolve(list(row('old')));
    await r1;
    expect(store.snapshot().rows?.map((r) => r.jobId)).toEqual(['new']);
  });
});

describe('a press', () => {
  it('sends one request per press with a NEW key, bound to the captured target {computer, realm, sid, jobId}', async () => {
    const { store, sent } = harness({ replies: [ans('bg-1', { outcome: 'failed', reason: 'still_running', remote: true }), ans('bg-1', { outcome: 'stopped' })] });
    await store.refresh();
    await store.stop('bg-1');
    await store.stop('bg-1');
    expect(sent).toEqual([{ target: { ...chat, jobId: 'bg-1' }, key: 'k-1' }, { target: { ...chat, jobId: 'bg-1' }, key: 'k-2' }]);
  });
  it('is refused while its stop is on its way (one request, nothing resent)', async () => {
    const d = deferred<unknown>();
    const sent: string[] = [];
    const { store } = harness({ stop: (_t, k) => { sent.push(k); return d.p; } });
    await store.refresh();
    const p = store.stop('bg-1');
    expect(store.snapshot().attempts.get('bg-1')).toEqual({ phase: 'sending' });
    expect(await store.stop('bg-1')).toEqual({ k: 'refused', why: 'busy' });
    d.resolve(ans('bg-1', { outcome: 'stopped' }));
    await p;
    expect(sent).toEqual(['k-1']);
  });
  it('is checked against the activation gate at the moment it is made', async () => {
    let gate: Capability = { ok: true };
    const { store, sent } = harness({ gate: () => gate, replies: [ans('bg-1', { outcome: 'stopped' })] });
    await store.refresh();
    expect(store.canStop('bg-1')).toEqual({ k: 'ok' });
    gate = { ok: false, reason: 'prerequisites', missing: ['journal'] };
    expect(await store.stop('bg-1')).toEqual({ k: 'refused', why: 'capability', capability: gate });
    expect(sent).toEqual([]);
  });

  const CASES: Array<[string, unknown, unknown]> = [
    ['stopped', ans('bg-1', { outcome: 'stopped' }), { phase: 'settled', evidence: 'stopped' }],
    ['already ended: not running now, never "stopped"', ans('bg-1', { outcome: 'stopped', already_ended: true }), { phase: 'settled', evidence: 'not_running' }],
    ['failed, still running', ans('bg-1', { outcome: 'failed', reason: 'still_running', remote: true }), { phase: 'settled', evidence: 'running', reason: 'still_running' }],
    ['failed, unsafe record', ans('bg-1', { outcome: 'failed', reason: 'unsafe_record', remote: true }), { phase: 'settled', evidence: 'running', reason: 'unsafe_record' }],
    ['503: not sent', { ok: false, status: 503, code: 'service_unavailable' }, { phase: 'settled', evidence: 'not_sent' }],
    ['404: gone', { ok: false, status: 404, code: 'bash_job_not_found' }, { phase: 'settled', evidence: 'gone' }],
    ['422: unknown (our one-key contract broke)', { ok: false, status: 422, code: 'idempotency_key_reused' }, { phase: 'unknown', checking: false }],
    ['outcome unknown', ans('bg-1', { outcome: 'unknown', reason: 'unconfirmed' }), { phase: 'unknown', checking: false }],
    ['a lost answer (the operation threw)', new Error('lost'), { phase: 'unknown', checking: false }],
    ['an answer for another job', ans('bg-2', { outcome: 'stopped' }), { phase: 'unknown', checking: false }],
    ['a contradictory answer', ans('bg-1', { outcome: 'stopped', reason: 'still_running' }), { phase: 'unknown', checking: false }],
  ];
  for (const [name, reply, view] of CASES) {
    it(`${name} -> ${JSON.stringify(view)}`, async () => {
      const { store } = harness({ replies: [reply] });
      await store.refresh();
      const r = await store.stop('bg-1');
      expect(r).toEqual({ k: 'sent', view });
      expect(store.snapshot().attempts.get('bg-1')).toEqual(view);
    });
  }
  it('a 422 leaves a debug note that names the job and never the key', async () => {
    const { store, debug } = harness({ replies: [{ ok: false, status: 422, code: 'idempotency_key_reused' }], newKey: () => 'SECRET-KEY-1' });
    await store.refresh();
    await store.stop('bg-1');
    expect(debug).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(debug.mock.calls)).toContain('bg-1');
    expect(JSON.stringify(debug.mock.calls)).not.toContain('SECRET-KEY-1');
  });
  it('no debug note for any other answer', async () => {
    const { store, debug } = harness({ replies: [{ ok: false, status: 503, code: 'service_unavailable' }] });
    await store.refresh();
    await store.stop('bg-1');
    expect(debug).not.toHaveBeenCalled();
  });
  it('after an unknown, a new press is a new key (never a resend of the old one)', async () => {
    const { store, sent } = harness({ replies: [new Error('lost'), ans('bg-1', { outcome: 'stopped' })] });
    await store.refresh();
    await store.stop('bg-1');
    expect(store.canStop('bg-1')).toEqual({ k: 'ok' });
    await store.stop('bg-1');
    expect(sent.map((s) => s.key)).toEqual(['k-1', 'k-2']);
    expect(store.snapshot().attempts.get('bg-1')).toEqual({ phase: 'settled', evidence: 'stopped' });
  });
});

describe('Check again reads, never sends', () => {
  async function unknownThen(...lists: unknown[]) {
    const h = harness({ lists: [list(row('bg-1')), ...lists], replies: [new Error('lost')] });
    await h.store.refresh();
    await h.store.stop('bg-1');
    return h;
  }
  it('the job listed as ended -> not running now; the read is the per-session list of the captured chat', async () => {
    const { store, sent, reads } = await unknownThen(list(row('bg-1', 'ended')));
    await store.check('bg-1');
    expect(store.snapshot().attempts.get('bg-1')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(sent).toHaveLength(1);
    expect(reads).toEqual([chat, chat]);
  });
  it.each([
    ['still running', list(row('bg-1', 'running'))],
    ['its state unknown', list(row('bg-1', 'unknown'))],
    ['absent from the list', list(row('bg-9', 'ended'))],
    ['an unreadable list', { ok: false }],
    ['a read that throws', new Error('x')],
  ])('%s -> stays unknown, nothing sent', async (_n, l) => {
    const { store, sent } = await unknownThen(l);
    await store.check('bg-1');
    expect(store.snapshot().attempts.get('bg-1')).toEqual({ phase: 'unknown', checking: false });
    expect(sent).toHaveLength(1);
  });
  it('is "checking" while the read is out, which also holds a press back', async () => {
    const d = deferred<{ ok: true; body: unknown }>();
    let first = true;
    const h = harness({ list: async () => { if (first) { first = false; return list(row('bg-1')); } return d.p; }, replies: [new Error('lost')] });
    await h.store.refresh();
    await h.store.stop('bg-1');
    const c = h.store.check('bg-1');
    expect(h.store.snapshot().attempts.get('bg-1')).toEqual({ phase: 'unknown', checking: true });
    expect(await h.store.stop('bg-1')).toEqual({ k: 'refused', why: 'busy' });
    await h.store.check('bg-1'); // a second check while one is out reads nothing more
    d.resolve(list(row('bg-1', 'ended')));
    await c;
    expect(h.store.snapshot().attempts.get('bg-1')).toEqual({ phase: 'settled', evidence: 'not_running' });
    expect(h.sent).toHaveLength(1);
  });
  it('a Check read that a newer read overtook settles nothing, even when it names the job ended', async () => {
    const dCheck = deferred<{ ok: true; body: unknown }>(), dNewer = deferred<{ ok: true; body: unknown }>();
    const queue = [async () => list(row('bg-1')), () => dCheck.p, () => dNewer.p];
    const h = harness({ list: async () => queue.shift()!(), replies: [new Error('lost')] });
    await h.store.refresh();
    await h.store.stop('bg-1');
    const c = h.store.check('bg-1');
    const r = h.store.refresh();
    dNewer.resolve(list(row('bg-1', 'unknown')));
    await r;
    dCheck.resolve(list(row('bg-1', 'ended')));
    await c;
    expect(h.store.snapshot().rows?.[0]?.state).toBe('unknown');
    expect(h.store.snapshot().attempts.get('bg-1')).toEqual({ phase: 'unknown', checking: false });
    expect(h.sent).toHaveLength(1);
  });
  it('an open attempt keeps the row it was pressed on when a newer list no longer names the job', async () => {
    const { store } = await unknownThen(list());
    await store.check('bg-1');
    expect(store.snapshot().rows).toEqual([]);
    expect(store.snapshot().attemptRows.get('bg-1')).toMatchObject({ jobId: 'bg-1', command: 'cmd bg-1' });
    expect(store.canStop('bg-1')).toEqual({ k: 'refused', why: 'not_listed' });
  });
  it('does nothing for a job with no unknown attempt (no read, no send)', async () => {
    const h = harness({ replies: [ans('bg-1', { outcome: 'stopped' })] });
    await h.store.refresh();
    await h.store.check('bg-1');
    await h.store.stop('bg-1');
    await h.store.check('bg-1');
    expect(h.reads).toHaveLength(1);
    expect(h.sent).toHaveLength(1);
  });
});

describe('subscribe', () => {
  it('tells subscribers on each change, and the snapshot is stable between changes', async () => {
    const { store } = harness({ replies: [ans('bg-1', { outcome: 'stopped' })] });
    const fn = vi.fn();
    const off = store.subscribe(fn);
    await store.refresh();
    const s1 = store.snapshot();
    expect(store.snapshot()).toBe(s1);
    await store.stop('bg-1');
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(3);
    off();
    await store.refresh();
    const calls = fn.mock.calls.length;
    await store.refresh();
    expect(fn.mock.calls.length).toBe(calls);
  });
});
