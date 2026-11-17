// Acceptance, group CORE: the REAL core api() and liveIO with a transport fake. Every keyed route
// carries exactly one journal ticket; attach carries none; the destination of an io is frozen at creation.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, calls, onFetch as rawOnFetch, settle, TARGET, UID, R1 , withGateway, type Call, type Reply } from '../../core/test/env';
import { setIdentity } from '../../core/ctx';
import { destOf, liveIO } from '../data';
import { createBody } from '../logic';
import { Journal, SendToken, guardIO, textDigest, type Op } from '../journal';
import { resetPageForTests } from '../journal/testing';
/** A create reads /version first (gatedCreate): this test's handler answers it with the gateway at protocol 3 + computer_binding. */
const onFetch = (h: (c: Call) => Reply | Promise<Reply>): void => rawOnFetch(withGateway(h));

const K = (c: string, n = 32) => 'hx-' + c.repeat(n);
const base = () => ({ acct: UID, container: TARGET.container.id, h: 'atlas.tlas', r: R1 });
let live = false;
afterEach(() => { live = false; });
function setup() {
  resetPageForTests();
  boot();
  setIdentity({ id: UID, banned: false });
  onFetch(() => ({ status: 200, body: { session_id: 's1', turn_id: 't1', command_id: 'c1', state: 'committed', status: 'ok', ok: true } }));
  live = true;
  void live;
  const j = new Journal();
  const io = liveIO(TARGET);
  return { j, io, g: guardIO(io, { acct: UID, container: TARGET.container.id }) as any };
}
const ops: Array<[string, (k: string) => Op, (g: any, k: string, t: any) => Promise<unknown>]> = [
  ['create', (k) => ({ ...base(), route: 'create', key: k }) as Op, (g, k, t) => g.create(createBody(R1, TARGET.container.id)!, k, R1, [t])],
  ['turn', (k) => ({ ...base(), route: 'turn', key: k, sid: 's1', c: K('1'), files: false }) as Op, (g, k, t) => g.turn('s1', 'hi', k, R1, undefined, undefined, [t])],
  ['command', (k) => ({ ...base(), route: 'command', key: k, sid: 's1', c: K('1'), cmd: 'message' }) as Op, (g, k, t) => g.command('s1', 'hi', k, R1, [t])],
  ['interrupt', (k) => ({ ...base(), route: 'command', key: k, sid: 's1', c: K('1'), cmd: 'interrupt', td: textDigest('hi') }) as Op, (g, k, t) => g.interrupt('s1', 'hi', k, R1, [t])],
  ['confirm', (k) => ({ ...base(), route: 'confirm', key: k, sid: 's1', c: K('1'), gate: 'G1', gen: 1 }) as Op, (g, k, t) => g.confirm('s1', { gate_id: 'G1', generation: 1, approved: true, remember: false, request_id: k } as any, R1, [t])],
  ['answer', (k) => ({ ...base(), route: 'answer', key: k, sid: 's1', c: K('1'), gate: 'G1', gen: 1 }) as Op, (g, k, t) => g.answer('s1', { gate_id: 'G1', generation: 1, answer: 'x' } as any, R1, [t])],
];

describe('every keyed route leaves through liveIO -> guard -> core with exactly one journal ticket', () => {
  for (const [route, mk, call] of ops) {
    it(`${route}: one wire request through the door; the same call without the ticket is TICKET_REQUIRED and sends nothing`, async () => {
      const { j, g } = setup();
      const k = j.mint((route === 'interrupt' ? 'command' : route) as any)!;
      const a = j.admit(mk(k), new SendToken()) as any;
      expect('kind' in a, JSON.stringify(a)).toBe(false);
      const before = calls.length;
      const out = await j.post(a, (t) => call(g, k, t));
      await settle(5);
      expect(out, JSON.stringify(out)).toMatchObject({ kind: 'sent' });
      const sent = calls.slice(before).filter((c) => c.method === 'POST');
      expect(sent).toHaveLength(1);
      if (route !== 'confirm' && route !== 'answer') expect(sent[0]!.headers['Idempotency-Key'] ?? sent[0]!.headers['idempotency-key']).toBe(k);
      const n = calls.length;
      const bare = await call(g, K('9'), undefined).then(() => 'resolved', (e: any) => e?.code ?? String(e));
      expect(bare).toBe('TICKET_REQUIRED');
      expect(calls.length).toBe(n);
    });
  }
});

describe('the wire body of each command kind', () => {
  const send = async (cmd: 'message' | 'interrupt' | 'stop') => {
    const { j, g } = setup();
    const k = j.mint('command')!;
    const a = j.admit({ ...base(), route: 'command', key: k, sid: 's1', c: K('1'), cmd, ...(cmd === 'interrupt' ? { td: textDigest('forget it') } : {}) } as Op, new SendToken()) as any;
    const before = calls.length;
    const out = await j.post(a, (t) => (cmd === 'interrupt' ? g.interrupt('s1', 'forget it', k, R1, [t]) : cmd === 'message' ? g.command('s1', 'forget it', k, R1, [t]) : g.stop('s1', k, R1, [t])));
    await settle(5);
    expect(out, JSON.stringify(out)).toMatchObject({ kind: 'sent' });
    return calls.slice(before).filter((c) => c.method === 'POST').map((c) => c.body);
  };
  it('an interrupt carries its kind and its text, and no on_gate (the agent refuses an interrupt that names one)', async () => {
    expect(await send('interrupt')).toEqual([{ kind: 'interrupt', text: 'forget it' }]);
  });
  it('a message carries on_gate wait (it never declines a waiting approval), and a stop no text', async () => {
    expect(await send('message')).toEqual([{ kind: 'message', text: 'forget it', on_gate: 'wait' }]);
    expect(await send('stop')).toEqual([{ kind: 'stop' }]);
  });
});

describe('attach is not journaled', () => {
  it('routes.attach is not journaled: the guard passes it through, and it needs the lease ticket, so without one core refuses it unsent', async () => {
    const { g } = setup();
    const before = calls.length;
    const r = await g.attach({ ...createBody(R1, TARGET.container.id)!, attach: 's1' } as any, R1).then(() => 'ok', (e: any) => e?.code ?? String(e));
    await settle(5);
    expect(r).toBe('TICKET_REQUIRED');
    expect(calls.slice(before).filter((c) => c.method === 'POST'), 'nothing left').toHaveLength(0);
  });
  it('a create whose body carries attach is refused by core (ROUTE_BODY), unsent', async () => {
    const { j, g } = setup();
    const k = j.mint('create')!;
    const a = j.admit(ops[0]![1](k), new SendToken()) as any;
    const before = calls.length;
    let code = '';
    await j.post(a, (t) => g.create({ ...createBody(R1, TARGET.container.id)!, attach: 's1' } as any, k, R1, [t]).then(() => undefined, (e: any) => { code = e?.code ?? String(e); }));
    expect(['ROUTE_BODY', 'TICKET_REFUSED'], 'refused unsent (the guard in front of core, or core)').toContain(code);
    expect(calls.length).toBe(before);
  });
});

describe('the destination of an io is frozen when it is made', () => {
  it('mutating the caller\'s target afterwards changes neither destOf nor the URL of any later request', async () => {
    resetPageForTests();
    boot();
    setIdentity({ id: UID, banned: false });
    onFetch(() => ({ status: 200, body: { ok: true } }));
    const t: any = { project: { id: TARGET.project.id }, container: { id: TARGET.container.id, server_name: TARGET.container.server_name } };
    const io = liveIO(t);
    t.container.id = 'cEVIL'; t.container.server_name = 'svEVIL'; t.project.id = 'pEVIL';
    expect(destOf(io)).toBe(TARGET.container.id);
    const before = calls.length;
    await io.health().catch(() => undefined);
    await settle(5);
    const urls = calls.slice(before).map((c) => c.url);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u).not.toMatch(/EVIL/i);
  });
});
