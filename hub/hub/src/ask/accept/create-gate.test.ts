// The REAL core api() and liveIO with a transport fake. A session create names its computer; a
// gateway below session protocol 3 or without computer_binding ignores that member. So liveIO.create reads /version and sends the create
// only through gatedCreate: against a gateway that does not bind, NOTHING goes out, and the journaled entry stays unresolved (unknown, kept
// for the by-key read, same key, same body) instead of being cleared. Against protocol 3 with computer_binding the create goes out once.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { boot, calls, onFetch, TARGET, UID, R1 } from '../../core/test/env';
import { setIdentity } from '../../core/ctx';
import { gatedCreate, liveIO } from '../data';
import { createBody } from '../logic';
import { Journal, SendToken, guardIO, type Op } from '../journal';
import { resetPageForTests } from '../journal/testing';

const on = (name: string) => ({ name, supported: true, available: true });
const CAPS = ['turn_idempotency', 'session_state', 'gate_envelope', 'computer_binding'];
const V3 = { api_version: '1', session_protocol_version: 3, capabilities: CAPS.map(on) };
const path = (c: { url: string }) => new URL(c.url).pathname.replace('/api/v1/agent', '');
const creates = () => calls.filter((c) => c.method === 'POST' && path(c) === '/sessions');
const versions = () => calls.filter((c) => c.method === 'GET' && path(c) === '/version');
afterEach(() => { calls.length = 0; });

function serve(version: { status: number; body?: unknown }) {
  onFetch((c) => {
    if (c.method === 'GET' && path(c) === '/version') return version;
    if (c.method === 'POST' && path(c) === '/sessions') return { status: 201, body: { session_id: 's1', started: { realm_selector: R1, computer_id: TARGET.container.id, owner_fingerprint: 'fp' } } };
    return { status: 404, body: { code: 'not_found' } };
  });
}
async function send(version: { status: number; body?: unknown }) {
  resetPageForTests();
  boot();
  serve(version);
  setIdentity({ id: UID, banned: false });
  const j = new Journal();
  const g = guardIO(liveIO(TARGET), { acct: UID, container: TARGET.container.id }) as any;
  const key = j.mint('create' as any)!;
  const op = { acct: UID, container: TARGET.container.id, h: 'atlas.tlas', r: R1, route: 'create', key } as Op;
  const a = j.admit(op, new SendToken()) as any;
  expect('kind' in a, JSON.stringify(a)).toBe(false);
  const body = createBody(R1, TARGET.container.id)!;
  const out: any = await j.post(a, (t) => g.create(body, key, R1, [t]));
  return { j, out, body, key };
}

const closed: Array<[string, { status: number; body?: unknown }]> = [
  ['protocol 2 with every capability', { status: 200, body: { ...V3, session_protocol_version: 2 } }],
  ['no protocol version', { status: 200, body: { ...V3, session_protocol_version: undefined } }],
  ['protocol 3 without computer_binding', { status: 200, body: { ...V3, capabilities: CAPS.filter((n) => n !== 'computer_binding').map(on) } }],
  ['computer_binding listed but not available', { status: 200, body: { ...V3, capabilities: CAPS.map((n) => ({ ...on(n), available: n !== 'computer_binding' })) } }],
  ['a version that cannot be read (503)', { status: 503, body: {} }],
  ['a version that is not an object', { status: 200, body: 'ok' }],
];

describe('liveIO.create against a gateway that does not bind a session to its computer', () => {
  for (const [name, version] of closed) {
    it(`${name}: no create leaves; the entry stays unresolved (unknown, kept, same key)`, async () => {
      const { j, out, key } = await send(version);
      expect(creates(), 'nothing was sent: ' + JSON.stringify(calls.map((c) => c.method + ' ' + path(c)))).toHaveLength(0);
      expect(versions().length).toBeGreaterThanOrEqual(1);
      expect(out).toMatchObject({ kind: 'sent', v: { t: 'unknown' } });
      expect(j.pending().some((e: any) => e.k === key), 'the entry is kept for the by-key read').toBe(true);
    });
  }
});

describe('liveIO.create against protocol 3 with computer_binding', () => {
  it('sends the create once, under the key, with the body unchanged', async () => {
    const { out, body, key } = await send({ status: 200, body: V3 });
    expect(creates()).toHaveLength(1);
    expect(creates()[0]!.headers['idempotency-key']).toBe(key);
    expect(creates()[0]!.body).toEqual(JSON.parse(JSON.stringify(body)));
    expect(out).toMatchObject({ kind: 'sent', v: { t: 'settled' } });
  });
  it('protocol 4 passes too', async () => {
    await send({ status: 200, body: { ...V3, session_protocol_version: 4 } });
    expect(creates()).toHaveLength(1);
  });
});

describe('gatedCreate itself', () => {
  const sendable = () => { let n = 0; return { f: async () => ++n, n: () => n }; };
  it('does not call send unless the version binds; the refusal is pending, never a definite refusal', async () => {
    for (const v of [null, {}, { session_protocol_version: 2, capabilities: [on('computer_binding')] }, { session_protocol_version: 3, capabilities: [] }]) {
      const s = sendable();
      await expect(gatedCreate(async () => v, s.f), JSON.stringify(v)).rejects.toMatchObject({ pending: true, gate: 'computer_binding' });
      expect(s.n()).toBe(0);
    }
    const s = sendable();
    await expect(gatedCreate(async () => { throw new Error('x'); }, s.f)).rejects.toMatchObject({ pending: true, code: 'COMPUTER_BINDING_UNREADABLE' });
    expect(s.n()).toBe(0);
  });
  it('a dead context (stale, superseded) passes through as it is, so the caller drops it', async () => {
    const s = sendable();
    await expect(gatedCreate(async () => { throw { stale: true }; }, s.f)).rejects.toEqual({ stale: true });
    await expect(gatedCreate(async () => { throw { superseded: true }; }, s.f)).rejects.toEqual({ superseded: true });
    expect(s.n()).toBe(0);
  });
  it('sends when the version binds', async () => {
    const s = sendable();
    expect(await gatedCreate(async () => V3, s.f)).toBe(1);
  });
});
