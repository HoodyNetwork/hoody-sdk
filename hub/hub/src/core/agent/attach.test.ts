// attachApi: the three attachment-lease routes go to the right URLs with the right bodies, outcomes are
// settled (410 and 404 are readable by status), and leaseOf reads only a real grant.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { onPending, type PendingNotice } from '../api';
import { bump } from '../ctx';
import { installTransport, type Transport } from '../transport';
import { AGENT, boot, R1, R2, TARGET } from '../test/env';
import { attachApi, leaseOf } from './attach';
import { sessionApi } from './session';

type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let reply: (r: Req) => { status: number; body?: unknown; headers?: Record<string, string> } = () => ({ status: 200, body: {} });
let lost = false;
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch(url, init) {
    const r = { url, init };
    reqs.push(r);
    if (lost) return Promise.reject(new TypeError('Failed to fetch'));
    const a = reply(r);
    return Promise.resolve(new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'content-type': 'application/json', ...(a.headers || {}) } }));
  },
};
function page() { boot({ realm: R1 }); reqs = []; lost = false; reply = () => ({ status: 200, body: {} }); installTransport(tr); }
afterEach(() => installTransport(null));

describe('attachApi', () => {
  it('acquire: POST /sessions/:id/attachments; the lease comes back as a grant', async () => {
    page();
    reply = () => ({ status: 201, body: { lease_id: 'L1', expires_at: '2026-10-27T17:30:00Z' } });
    const r = await attachApi(TARGET).acquire('s1', R1);
    expect(reqs[0]!.url).toBe(`${AGENT}/sessions/s1/attachments?realm=${R1}`);
    expect(reqs[0]!.init.method).toBe('POST');
    expect(r.ok && leaseOf(r.body, 0)).toEqual({ id: 'L1', expiresAt: Date.parse('2026-10-27T17:30:00Z') });
  });
  it('the call goes to the conversation\'s own realm, not the page\'s', async () => {
    page();
    await attachApi(TARGET).acquire('s1', R2);
    await attachApi(TARGET).release('s1', 'L1', R2);
    expect(reqs[0]!.url).toBe(`${AGENT}/sessions/s1/attachments?realm=${R2}`);
    expect(reqs[1]!.url).toBe(`${AGENT}/sessions/s1/attachments/L1?realm=${R2}`);
  });
  it('a ttl rides the body; none sends no ttl', async () => {
    page();
    await attachApi(TARGET).acquire('s1', R1, 60000);
    await attachApi(TARGET).acquire('s1', R1);
    expect(JSON.parse(String(reqs[0]!.init.body))).toEqual({ ttl_ms: 60000 });
    expect(String(reqs[1]!.init.body ?? '')).not.toContain('ttl_ms');
  });
  it('renew: PATCH the lease; release: DELETE it, no body', async () => {
    page();
    await attachApi(TARGET).renew('s1', 'L1', R1);
    await attachApi(TARGET).release('s1', 'L1', R1);
    expect([reqs[0]!.init.method, reqs[0]!.url]).toEqual(['PATCH', `${AGENT}/sessions/s1/attachments/L1?realm=${R1}`]);
    expect([reqs[1]!.init.method, reqs[1]!.url]).toEqual(['DELETE', `${AGENT}/sessions/s1/attachments/L1?realm=${R1}`]);
    expect(reqs[1]!.init.body ?? null).toBeNull();
  });
  it('410 attachment_expired and 404 settle with their status, never throw', async () => {
    page();
    reply = () => ({ status: 410, body: { code: 'attachment_expired', message: 'x' } });
    const a = await attachApi(TARGET).renew('s1', 'L1', R1);
    expect(a).toMatchObject({ ok: false, err: { status: 410, code: 'attachment_expired', kind: 'failed' } });
    reply = () => ({ status: 404, body: { code: 'not_found', message: 'x' } });
    const b = await attachApi(TARGET).acquire('s1', R1);
    expect(b).toMatchObject({ ok: false, err: { status: 404 } });
  });
  it('leaseOf: needs a lease id; a missing or bad expiry becomes a short one, never a long guess', () => {
    expect(leaseOf(null, 0)).toBeNull();
    expect(leaseOf({ expires_at: '2026-01-01T00:00:00Z' }, 0)).toBeNull();
    expect(leaseOf({ lease_id: '' }, 0)).toBeNull();
    expect(leaseOf({ lease_id: 'x'.repeat(200) }, 0)).toBeNull();
    expect(leaseOf({ lease_id: 'L', expires_at: 'soon' }, 1000)).toEqual({ id: 'L', expiresAt: 121000 });
  });
});

describe('leaseOf with an expiry that cannot be used', () => {
  it('an expiry not after now (a clock ahead of the agent) is the default hold from now, not the past', () => {
    const now = Date.parse('2026-10-27T17:00:00Z');
    expect(leaseOf({ lease_id: 'L1', expires_at: '2026-10-27T16:59:00Z' }, now)).toEqual({ id: 'L1', expiresAt: now + 120000 });
    expect(leaseOf({ lease_id: 'L1', expires_at: '2026-10-27T17:00:00Z' }, now)).toEqual({ id: 'L1', expiresAt: now + 120000 });
  });
  it('a future expiry is kept; a missing or unreadable one is the default hold; a body without a lease id is null', () => {
    const now = Date.parse('2026-10-27T17:00:00Z');
    expect(leaseOf({ lease_id: 'L1', expires_at: '2026-10-27T17:01:00Z' }, now)?.expiresAt).toBe(now + 60000);
    expect(leaseOf({ lease_id: 'L1' }, now)?.expiresAt).toBe(now + 120000);
    expect(leaseOf({ lease_id: 'L1', expires_at: 'soon' }, now)?.expiresAt).toBe(now + 120000);
    expect(leaseOf({ expires_at: '2026-10-27T17:01:00Z' }, now)).toBeNull();
  });
});

// A lease call is made by the manager, never pressed by the person: when its answer is lost, the shell must not say "a
// change may have gone through" (that notice is once per context and would hide a real one). The lease only keeps a
// conversation open, so the manager's own retry is the whole recovery.
describe('a lease call nobody pressed raises no shell notice', () => {
  let notices: PendingNotice[] = [];
  let off: () => void = () => {};
  beforeEach(() => { notices = []; off = onPending((n) => notices.push(n)); });
  afterEach(() => { off(); });
  const CALLS: Array<[string, () => Promise<unknown>]> = [
    ['acquire', () => attachApi(TARGET).acquire('s1', R1)],
    ['renew', () => attachApi(TARGET).renew('s1', 'L1', R1)],
    ['release', () => attachApi(TARGET).release('s1', 'L1', R1)],
    ['release (keepalive)', () => attachApi(TARGET).release('s1', 'L1', R1, true)],
  ];
  const LOST: Array<[string, () => { status: number; body?: unknown }]> = [
    ['500', () => ({ status: 500, body: { code: 'internal', message: 'x' } })],
    ['502', () => ({ status: 502 })],
    ['503 with Retry-After', () => ({ status: 503, body: { code: 'unavailable', message: 'x' }, headers: { 'retry-after': '3' } })],
    ['504', () => ({ status: 504 })],
  ];
  for (const [name, run] of CALLS) {
    for (const [what, answer] of LOST) {
      it(`${name} answered ${what}: unknown to the caller, no notice`, async () => {
        page();
        reply = () => answer();
        const r = await run();
        expect(r).toMatchObject({ ok: false, err: { kind: 'pending' } });
        expect(notices).toEqual([]);
      });
    }
    it(`${name} whose connection is lost: unknown to the caller, no notice`, async () => {
      page();
      lost = true;
      const r = await run();
      expect(r).toMatchObject({ ok: false, err: { kind: 'pending' } });
      expect(reqs.length).toBe(1);
      expect(notices).toEqual([]);
    });
    it(`${name} refused (404, 410) or answered 200: no notice`, async () => {
      page();
      for (const status of [404, 410, 200]) { reply = () => ({ status, body: {} }); await run(); }
      expect(notices).toEqual([]);
    });
  }
  it('an Api without a target (the context\'s computer) is covered the same way', async () => {
    boot({ realm: R1, target: TARGET });
    reqs = []; lost = false; installTransport(tr);
    reply = () => ({ status: 503 });
    for (const run of [() => attachApi().acquire('s1', R1), () => attachApi().renew('s1', 'L1', R1), () => attachApi().release('s1', 'L1', R1)]) {
      expect(await run()).toMatchObject({ ok: false, err: { kind: 'pending' } });
    }
    expect(reqs.length).toBe(3);
    expect(reqs[0]!.url.startsWith(AGENT)).toBe(true);
    expect(notices).toEqual([]);
  });
  it('a lost lease answer raises nothing, and a person\'s own change that is lost afterwards still raises its notice', async () => {
    page();
    reply = () => ({ status: 503 });
    await attachApi(TARGET).acquire('s1', R1);
    expect(notices).toEqual([]);
    // a pressed change (the rename route) that is lost raises the one notice
    const r = await sessionApi(TARGET).rename('s1', 'x', R1);
    expect(r).toMatchObject({ ok: false, err: { kind: 'pending' } });
    expect(notices.length).toBe(1);
  });
  // Known exception, kept visible: `recovers` only holds while the context lives. A call whose context ended before its
  // answer (the realm switched or the person signed out while it was on its way) is reported by core like any change
  // that went out. A "background" call flag that never notifies is not built yet.
  it('known exception: a release answered after its context ended still raises the one notice', async () => {
    page();
    let go: () => void = () => {};
    const gate = new Promise<void>((r) => { go = r; });
    const hold: Transport = { hoody: tr.hoody, fetch: async (url, init, meta) => { await gate; return tr.fetch(url, init, meta); } };
    installTransport(hold);
    reply = () => ({ status: 200, body: {} });
    const p = attachApi(TARGET).release('s1', 'L1', R1);
    await Promise.resolve();
    bump('switch');
    go();
    await p;
    expect(notices.length).toBe(1);
  });
});
