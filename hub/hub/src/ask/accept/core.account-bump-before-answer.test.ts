// The account fence on a late answer and the `settled`
// hook on a decision. Nothing here reads a capability; the daemon fake keeps the truth and the tests read the wire and the page's state.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tix, type ApproverRef } from '@kit/agent/approver';
import { approvers, resetApproversForTests } from '@kit/agent/approver-live';
import { boot, microFlush, onFetch as rawOnFetch, settle, TARGET, UID, OTHER, R1 , withGateway, type Call, type Reply } from '../../core/test/env';
import { bump, setIdentity } from '../../core/ctx';
import { installTransport } from '../../core/transport';
import { leaseRoutes, liveIO } from '../data';
import { createBody } from '../logic';
import { Journal, SendToken, guardIO, type Op } from '../journal';
import { resetPageForTests } from '../journal/testing';
/** A create reads /version first (gatedCreate): this test's handler answers it with the gateway at protocol 3 + computer_binding. */
const onFetch = (h: (c: Call) => Reply | Promise<Reply>): void => rawOnFetch(withGateway(h));

const C = TARGET.container.id;
const ref = (sid: string | null): ApproverRef => ({ computer: C, realm: R1, sid, target: TARGET });
const base = () => ({ acct: UID, container: C, h: 'atlas.tlas', r: R1 });
const strict = () => ({ ...createBody(R1, C)!, approval: { mode: 'always' as const } });
const K = (c: string, n = 32) => 'hx-' + c.repeat(n);

interface Seen { method: string; path: string; lease: string | null; body: any }
interface Daemon { cap: string | null; generation: number; seen: Seen[]; confirm: (s: Seen) => { status: number; body: any } | 'hang'; onPost: (path: string) => void; strip: boolean }
let d: Daemon;

/** The daemon fake, behind a transport that ignores the page's abort: an answer the page has already left still arrives. */
function setup() {
  resetPageForTests();
  resetApproversForTests();
  boot();
  setIdentity({ id: UID, banned: false });
  d = { cap: null, generation: 0, seen: [], confirm: () => ({ status: 200, body: { status: 'ok' } }), onPost: () => {}, strip: false };
  let n = 0;
  onFetch((c) => {
    const path = c.url.replace(/^.*\/api\/v1\/agent/, '').replace(/\?.*$/, '');
    const lease = c.headers['x-hoody-approver-lease'] ?? null;
    const s: Seen = { method: c.method, path, lease, body: c.body };
    d.seen.push(s);
    const mint = () => { d.cap = `CAP${++n}`; d.generation += 1; return { lease: d.cap, generation: d.generation }; };
    d.onPost(path);
    if (c.method === 'POST' && path === '/sessions') {
      const g = mint();
      return { status: 200, body: { session_id: c.body?.attach ?? 'sNew', approver_lease: { lease: g.lease, generation: g.generation }, started: { realm_selector: c.body?.realm, approver_lease: { token: g.lease, generation: g.generation } } } };
    }
    if (path.endsWith('/approver-lease')) {
      if (c.method === 'POST') { if (d.cap && lease !== d.cap) return { status: 409, body: { code: 'approver_lease_held', message: 'x' } }; return { status: 200, body: { ...mint(), info: { epoch: 'e1' } } }; }
      if (!d.cap || lease !== d.cap) return { status: 409, body: { code: 'approver_lease_invalid', message: 'x' } };
      if (c.method === 'DELETE') { d.cap = null; return { status: 200, body: {} }; }
      return { status: 200, body: { generation: d.generation, info: { epoch: 'e1' } } };
    }
    if (path.endsWith('/confirm')) { const r = d.confirm(s); return r === 'hang' ? { status: 200, body: {}, delayMs: 10 * 60_000 } : r; }
    return { status: 200, body: {} };
  });
  // The page's abort must not stop the fake from answering: this is the late answer the fence is about.
  installTransport({
    hoody: () => Promise.reject(new Error('x')),
    fetch: (url, init) => globalThis.fetch(url, d.strip ? { ...init, signal: undefined } : init),
  });
  const j = new Journal();
  const io = liveIO(TARGET);
  return { j, g: guardIO(io, { acct: UID, container: C }) as any };
}
afterEach(() => { try { approvers().reset(); } catch { /* none */ } installTransport(null); vi.useRealTimers(); });
const leasePaths = (m?: string) => d.seen.filter((x) => x.path.endsWith('/approver-lease') && (!m || x.method === m));

describe('T38: an account bump before the answer hook', () => {
  it('a create answer that arrives after the bump is blanked, custody stays empty, nothing is scheduled; old handles are inert', async () => {
    const { j, g } = setup();
    const h = approvers().open(ref(null), { strict: true });
    d.strip = true;
    d.onPost = (path) => { if (path === '/sessions') { setIdentity({ id: OTHER, banned: false }); bump('account'); } };
    const k = j.mint('create')!;
    const a = j.admit({ ...base(), route: 'create', key: k } as Op, new SendToken()) as any;
    let answer: any = 'none';
    await j.post(a, (t) => g.create(strict(), k, R1, tix(t, h.mintTicket(leaseRoutes.create, k)))).then((o: any) => { answer = o; }, (e: any) => { answer = e; });
    await settle(5);
    expect(d.seen.filter((x) => x.path === '/sessions')).toHaveLength(1);
    expect(d.cap, 'the daemon did grant it').not.toBeNull();
    expect(JSON.stringify(answer), 'no capability in what the caller gets').not.toContain('CAP');
    expect(approvers().state(ref('sNew')).phase, 'custody took nothing').not.toBe('held');
    expect(h.mintTicket(leaseRoutes.create, K('b'))).toBeNull();
    expect(h.decide(leaseRoutes.confirm)).toBeNull();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(leasePaths(), 'nothing scheduled: no acquire, renew or release').toHaveLength(0);
  });
  it('a ticket minted before the bump is refused TICKET_REFUSED, unsent', async () => {
    const { g } = setup();
    const h = approvers().open(ref('sOld'), { strict: true });
    const t = h.mintTicket(leaseRoutes.attach, null);
    expect(t).not.toBeNull();
    setIdentity({ id: OTHER, banned: false });
    bump('account');
    const out = await g.attach({ ...strict(), attach: 'sOld' }, R1, tix(t)).then(() => 'ok', (e: any) => e?.code);
    expect(out).toBe('TICKET_REFUSED');
    expect(d.seen.filter((x) => x.path === '/sessions')).toHaveLength(0);
  });
  it('the settle of an acquire sent before the bump changes nothing: no held record, no later request', async () => {
    setup();
    d.strip = true;
    d.onPost = (path) => { if (path.endsWith('/approver-lease')) { setIdentity({ id: OTHER, banned: false }); bump('account'); } };
    const h = approvers().open(ref('sAcq'), { strict: true });
    await settle(10);
    expect(leasePaths('POST')).toHaveLength(1);
    expect(approvers().state(ref('sAcq')).phase).not.toBe('held');
    expect(h.decide(leaseRoutes.confirm)).toBeNull();
    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(20 * 60_000);
    expect(leasePaths(), 'only the one acquire ever went out').toHaveLength(1);
  });
});

describe('T48: the settled hook through real core', () => {
  const flush = async () => { await vi.advanceTimersByTimeAsync(0); await microFlush(100); };
  async function held() {
    vi.useFakeTimers();
    const s = setup();
    const h = approvers().open(ref(null), { strict: true });
    const k = s.j.mint('create')!;
    const a = s.j.admit({ ...base(), route: 'create', key: k } as Op, new SendToken()) as any;
    await s.j.post(a, (t: any) => s.g.create(strict(), k, R1, tix(t, h.mintTicket(leaseRoutes.create, k))));
    await flush();
    expect(approvers().state(ref('sNew')).phase).toBe('held');
    return { ...s, h };
  }
  const decide = async (s: any, h: any, n: string) => {
    const dec = h.decide(leaseRoutes.confirm);
    expect(dec).not.toBeNull();
    const rid = s.j.mint('confirm')!;
    const a = s.j.admit({ ...base(), route: 'confirm', key: rid, sid: 'sNew', c: K(n), gate: 'G' + n, gen: 1 } as Op, new SendToken()) as any;
    return s.j.post(a, (t: any) => s.g.confirm('sNew', { gate_id: 'G' + n, generation: 1, approved: true, remember: false, request_id: rid, lease_generation: dec!.lease_generation } as any, R1, tix(t, dec!.ticket)));
  };

  it('a decision refused approver_lease_invalid removes the capability through the hook, with no caller call', async () => {
    const s = await held();
    d.confirm = () => ({ status: 409, body: { code: 'approver_lease_invalid', message: 'x' } });
    await decide(s, s.h, '1').catch(() => {});
    await flush();
    expect(approvers().state(ref('sNew')).phase, 'no longer displayed held').not.toBe('held');
    expect(s.h.decide(leaseRoutes.confirm)).toBeNull();
  });

  it('a call refused unsent after spend closes its attempt: no ghost, the lease stays held and renews go on', async () => {
    const s = await held();
    const dec = s.h.decide(leaseRoutes.confirm);
    expect(dec).not.toBeNull();
    // The ticket's own call is refused unsent by core AFTER admission spent it: the body names a path the route refuses (core: bad input).
    const rid = s.j.mint('confirm')!;
    const a = s.j.admit({ ...base(), route: 'confirm', key: rid, sid: 'sNew', c: K('2'), gate: 'G2', gen: 1 } as Op, new SendToken()) as any;
    const out = await s.j.post(a, (t: any) => s.g.confirm('sNew', { gate_id: 'G2', generation: 1, approved: true, remember: false, request_id: rid, lease_generation: dec!.lease_generation } as any, R1, tix(t, dec!.ticket)))
      .then(() => 'ok', (e: any) => e?.kind ?? e?.code ?? 'err');
    void out;
    const before = leasePaths('PATCH').length;
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(approvers().state(ref('sNew')).phase).toBe('held');
    expect(leasePaths('PATCH').length, 'renews go on: nothing made the capability stale').toBeGreaterThan(before);
  });

  it('a decision answered HTTP 202 pending is a ghost, not a close: the capability is stale and no renew follows it', async () => {
    const s = await held();
    d.confirm = () => ({ status: 202, body: { status: 'pending' } });
    const rid = s.j.mint('confirm')!;
    const dec = s.h.decide(leaseRoutes.confirm);
    const a = s.j.admit({ ...base(), route: 'confirm', key: rid, sid: 'sNew', c: K('4'), gate: 'G4', gen: 1 } as Op, new SendToken()) as any;
    await s.j.post(a, (t: any) => s.g.confirm('sNew', { gate_id: 'G4', generation: 1, approved: true, remember: false, request_id: rid, lease_generation: dec!.lease_generation } as any, R1, tix(t, dec!.ticket))).then(() => 'ok', (e: any) => e);
    await flush();
    expect(d.seen.some((x) => x.path.endsWith('/confirm'))).toBe(true);
    const renewsBefore = leasePaths('PATCH').length;
    await vi.advanceTimersByTimeAsync(520_000);
    expect(leasePaths('PATCH').length, 'no renew after the pending decision').toBe(renewsBefore);
    d.cap = null;
    const acquiresBefore = leasePaths('POST').length;
    await vi.advanceTimersByTimeAsync(100_000);
    expect(leasePaths('POST').length - acquiresBefore, 'one acquire after the lapse').toBe(1);
  });

  it('a decision that times out makes the capability stale: no renew after it, a lapse, then exactly one acquire', async () => {
    const s = await held();
    d.confirm = () => 'hang';
    const rid = s.j.mint('confirm')!;
    const dec = s.h.decide(leaseRoutes.confirm);
    const a = s.j.admit({ ...base(), route: 'confirm', key: rid, sid: 'sNew', c: K('3'), gate: 'G3', gen: 1 } as Op, new SendToken()) as any;
    const call = s.j.post(a, (t: any) => s.g.confirm('sNew', { gate_id: 'G3', generation: 1, approved: true, remember: false, request_id: rid, lease_generation: dec!.lease_generation } as any, R1, tix(t, dec!.ticket))).then(() => 'ok', (e: any) => e);
    await vi.advanceTimersByTimeAsync(45_000);
    await call;
    const renewsBefore = leasePaths('PATCH').length;
    const acquiresBefore = leasePaths('POST').length;
    await vi.advanceTimersByTimeAsync(520_000);   // past the half-life where an ordinary renew would go, before the lapse
    expect(leasePaths('PATCH').length, 'no renew after the unresolved decision').toBe(renewsBefore);
    expect(leasePaths('POST').length, 'and no acquire before the lapse').toBe(acquiresBefore);
    d.cap = null;   // the agent let it lapse
    await vi.advanceTimersByTimeAsync(100_000);
    expect(leasePaths('POST').length - acquiresBefore, 'one acquire after the lapse').toBe(1);
    expect(approvers().state(ref('sNew')).phase).toBe('held');
  });
});
