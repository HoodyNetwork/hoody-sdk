// Vitest: the reading half of the approver lease. The capability is read out of every copy, blanked in every copy,
// and never survives a reader.
import { afterEach, describe, expect, it } from 'vitest';
import { claimTickets, resetTickets, type Ticket, type TicketBind } from '../ticket';
import { installTransport, type Transport } from '../transport';
import { AGENT, boot, R1, TARGET } from '../test/env';
import { APPROVER_TTL_MS, approverApi, approverEpochOf, approverErrorOf, approverGenerationOf, approverGrantsOf, approverRoutes, blankApproverGrants } from './approver';

const kitSource = (import.meta.glob('../kit.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['../kit.ts'] ?? '';
const create = () => ({ session_id: 's1', approver_lease: { lease: 'CAP-A', generation: 3 }, started: { approver_lease: { token: 'CAP-A', generation: 3 } } });

describe('grants', () => {
  it('reads the acquire answer, both copies of a create answer, once each', () => {
    expect(approverGrantsOf({ lease: 'CAP-1' })).toEqual(['CAP-1']);
    expect(approverGrantsOf(create())).toEqual(['CAP-A']);
    expect(approverGrantsOf({ lease: 'X', approver_lease: { lease: 'Y' }, started: { approver_lease: { token: 'X' } } })).toEqual(['X', 'Y']);
  });
  it('drops what is not header-safe: blank, space, control, non-ASCII, over 512, non-strings', () => {
    for (const bad of ['', 'a b', 'a\nb', 'é', 'x'.repeat(513), 5, null, {}]) expect(approverGrantsOf({ lease: bad })).toEqual([]);
    expect(approverGrantsOf({ lease: 'x'.repeat(512) })).toHaveLength(1);
  });
  it('reads nothing from a non-object, an array, or an unrelated field', () => {
    for (const v of [null, undefined, 'CAP', 5, [], [{ lease: 'CAP' }], { token: 'CAP' }, { started: 'CAP' }, { approver_lease: 'CAP' }]) expect(approverGrantsOf(v)).toEqual([]);
  });
  it('blanking empties every copy and leaves the rest', () => {
    const r = create();
    blankApproverGrants(r);
    expect(r).toEqual({ session_id: 's1', approver_lease: { lease: '', generation: 3 }, started: { approver_lease: { token: '', generation: 3 } } });
    expect(approverGrantsOf(r)).toEqual([]);
    const a = { lease: 'C', info: { epoch: 'e1' } };
    blankApproverGrants(a);
    expect(a).toEqual({ lease: '', info: { epoch: 'e1' } });
  });
  it('blanking tolerates anything', () => {
    for (const v of [null, undefined, 3, 'x', [], {}, { started: null }, { approver_lease: [] }]) expect(() => blankApproverGrants(v)).not.toThrow();
  });
});

describe('epoch, generation, error', () => {
  it('epoch: info.epoch first, then epoch; bounded; strings only', () => {
    expect(approverEpochOf({ info: { epoch: 'a' }, epoch: 'b' })).toBe('a');
    expect(approverEpochOf({ epoch: 'b' })).toBe('b');
    for (const v of [null, {}, { epoch: '' }, { epoch: 3 }, { epoch: 'x'.repeat(129) }, { info: { epoch: 1 } }]) expect(approverEpochOf(v)).toBeNull();
  });
  it('generation: any carrier, safe non-negative integers only', () => {
    expect(approverGenerationOf({ generation: 4 })).toBe(4);
    expect(approverGenerationOf({ info: { generation: 0 } })).toBe(0);
    expect(approverGenerationOf(create())).toBe(3);
    for (const v of [null, {}, { generation: -1 }, { generation: 1.5 }, { generation: '2' }, { generation: 2 ** 60 }]) expect(approverGenerationOf(v)).toBeNull();
  });
  it('error: only the two codes the agent sends', () => {
    expect(approverErrorOf({ approver_lease_error: 'approver_lease_held' })).toBe('held');
    expect(approverErrorOf({ approver_lease_error: 'approver_lease_required' })).toBe('required');
    for (const v of [null, {}, { approver_lease_error: 'other' }, { approver_lease_error: 1 }]) expect(approverErrorOf(v)).toBeNull();
  });
});

describe('constants', () => {
  it('the lease lasts 10 minutes on the agent', () => { expect(APPROVER_TTL_MS).toBe(600_000); });
  it('the lease outlives at least ten of core\'s request timeouts (a stale renew must be able to land and be bounded)', () => {
    const m = /const TIMEOUT = (\d[\d_]*);/.exec(kitSource);
    expect(m, 'kit.ts names its request TIMEOUT').not.toBeNull();
    expect(APPROVER_TTL_MS).toBeGreaterThanOrEqual(10 * Number(m![1]!.replace(/_/g, '')));
  });
});

// ---- the three routes and their settled Api (through real core) ----
type Req = { url: string; init: RequestInit };
let reqs: Req[] = [];
let reply: (r: Req) => { status: number; body?: unknown } = () => ({ status: 200, body: {} });
const tr: Transport = {
  hoody: () => Promise.reject(new Error('x')),
  fetch(url, init) {
    const r = { url, init };
    reqs.push(r);
    const a = reply(r);
    return Promise.resolve(new Response(JSON.stringify(a.body ?? {}), { status: a.status, headers: { 'content-type': 'application/json' } }));
  },
};
let spends: string[] = [];
let mint: (b: TicketBind) => Ticket;
function page() {
  boot({ realm: R1 }); reqs = []; spends = []; reply = () => ({ status: 200, body: {} });
  installTransport(tr);
  mint = claimTickets('lease', { check: () => true, spend: () => { spends.push('s'); return 'CAP-1'; } });
}
afterEach(() => { installTransport(null); resetTickets(); });
const tk = (route: unknown, sid = 's1') => mint({ route: route as never, container: TARGET.container.id, sid, idem: null });
const header = (r: Req): string | null => new Headers(r.init.headers as HeadersInit).get('X-Hoody-Approver-Lease');

describe('approverRoutes declare a required lease ticket and the agent codes', () => {
  it('acquire POST, renew PATCH, release DELETE, all on /sessions/:id/approver-lease, lease required', () => {
    expect([approverRoutes.acquire.method, approverRoutes.renew.method, approverRoutes.release.method]).toEqual(['POST', 'PATCH', 'DELETE']);
    for (const r of Object.values(approverRoutes)) { expect(r.path).toBe('/sessions/:id/approver-lease'); expect(r.tickets).toEqual({ lease: 'required' }); }
    expect(approverRoutes.acquire.refuses).toEqual(['approver_lease_held', 'approver_lease_invalid', 'not_found']);
    expect(approverRoutes.renew.refuses).toEqual(['approver_lease_invalid', 'approver_lease_expired', 'not_found']);
    expect(approverRoutes.release.refuses).toEqual(['approver_lease_invalid', 'approver_lease_expired', 'not_found']);
  });
});

describe('approverApi', () => {
  it('acquire: POST with holder and ttl; the header is the lease spend, nothing else', async () => {
    page();
    const r = await approverApi(TARGET).acquire('s1', R1, 'tab-1', tk(approverRoutes.acquire));
    expect(r.ok).toBe(true);
    expect(reqs[0]!.url).toBe(`${AGENT}/sessions/s1/approver-lease?realm=${R1}`);
    expect(reqs[0]!.init.method).toBe('POST');
    expect(JSON.parse(String(reqs[0]!.init.body))).toEqual({ holder: 'tab-1', ttl_ms: APPROVER_TTL_MS });
    expect(header(reqs[0]!)).toBe('CAP-1');
  });
  it('a blank or non-string holder is not sent: the ticket stays unspent and nothing leaves', async () => {
    page();
    for (const h of ['', '   ', undefined as unknown as string]) {
      const r = await approverApi(TARGET).acquire('s1', R1, h, tk(approverRoutes.acquire));
      expect(r).toMatchObject({ ok: false, err: { kind: 'not_sent' } });
    }
    expect(reqs).toHaveLength(0);
    expect(spends).toHaveLength(0);
  });
  it('renew: PATCH with the ttl; release: DELETE, keepalive only when asked', async () => {
    page();
    await approverApi(TARGET).renew('s1', R1, tk(approverRoutes.renew));
    await approverApi(TARGET).release('s1', R1, tk(approverRoutes.release), true);
    await approverApi(TARGET).release('s1', R1, tk(approverRoutes.release), false);
    expect([reqs[0]!.init.method, JSON.parse(String(reqs[0]!.init.body))]).toEqual(['PATCH', { ttl_ms: APPROVER_TTL_MS }]);
    expect(reqs[1]!.init.method).toBe('DELETE');
    expect(reqs[1]!.init.keepalive).toBe(true);
    expect(reqs[2]!.init.keepalive ?? false).toBe(false);
    expect(reqs.map(header)).toEqual(['CAP-1', 'CAP-1', 'CAP-1']);
  });
  it('a call with no ticket is refused unsent by core and settles as not sent', async () => {
    page();
    const r = await approverApi(TARGET).renew('s1', R1, undefined as unknown as Ticket);
    expect(r).toMatchObject({ ok: false, err: { kind: 'not_sent' } });
    expect(reqs).toHaveLength(0);
  });
  it('answered refusals settle with their status and code, never throw', async () => {
    page();
    reply = () => ({ status: 409, body: { code: 'approver_lease_held', message: 'x' } });
    expect(await approverApi(TARGET).acquire('s1', R1, 'tab', tk(approverRoutes.acquire))).toMatchObject({ ok: false, err: { status: 409, code: 'approver_lease_held', kind: 'failed' } });
    reply = () => ({ status: 410, body: { code: 'approver_lease_expired', message: 'x' } });
    expect(await approverApi(TARGET).renew('s1', R1, tk(approverRoutes.renew))).toMatchObject({ ok: false, err: { status: 410, code: 'approver_lease_expired' } });
  });
});
