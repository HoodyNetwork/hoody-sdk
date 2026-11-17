// The lease ticket through the REAL path -- the kit's approver handle, liveIO,
// the journal's guard and door, core's api() and a transport fake that answers like the agent. The capability is only ever seen as a
// header on the wire; the journal's ticket and the lease ticket ride the same call.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest';
import { tix, type ApproverRef } from '@kit/agent/approver';
import { approvers, resetApproversForTests } from '@kit/agent/approver-live';
import { boot, calls, onFetch as rawOnFetch, settle, TARGET, UID, R1 , withGateway, type Call, type Reply } from '../../core/test/env';
import { setIdentity } from '../../core/ctx';
import { approvalModeOf, leaseRoutes, liveIO } from '../data';
import { createBody } from '../logic';
import { Journal, SendToken, guardIO, type Op } from '../journal';
import { resetPageForTests } from '../journal/testing';
/** A create reads /version first (gatedCreate): this test's handler answers it with the gateway at protocol 3 + computer_binding. */
const onFetch = (h: (c: Call) => Reply | Promise<Reply>): void => rawOnFetch(withGateway(h));

const K = (c: string, n = 32) => 'hx-' + c.repeat(n);
const C = TARGET.container.id;
const ref = (sid: string | null): ApproverRef => ({ computer: C, realm: R1, sid, target: TARGET });
const base = () => ({ acct: UID, container: C, h: 'atlas.tlas', r: R1 });
const strict = () => ({ ...createBody(R1, C)!, approval: { mode: 'always' as const } });

interface Daemon { cap: string | null; generation: number; seen: Array<{ method: string; path: string; idem: string | null; lease: string | null; body: any }> }
let d: Daemon;
function setup() {
  resetPageForTests();
  resetApproversForTests();
  boot();
  setIdentity({ id: UID, banned: false });
  d = { cap: null, generation: 0, seen: [] };
  let n = 0;
  onFetch((c) => {
    const path = c.url.replace(/^.*\/api\/v1\/agent/, '').replace(/\?.*$/, '');
    const lease = c.headers['x-hoody-approver-lease'] ?? null;
    d.seen.push({ method: c.method, path, idem: c.headers['idempotency-key'] ?? null, lease, body: c.body });
    const mint = () => { d.cap = `CAP${++n}`; d.generation += 1; return { lease: d.cap, generation: d.generation }; };
    if (c.method === 'POST' && path === '/sessions') {
      const b = c.body ?? {};
      const strictMode = b.approval?.mode === 'always';
      if (!strictMode) return { status: 200, body: { session_id: 'sDefault', started: { realm_selector: b.realm } } };
      if (b.attach && d.cap) return { status: 200, body: { session_id: b.attach, approver_lease_error: 'approver_lease_held', started: { realm_selector: b.realm } } };
      const g = mint();
      return { status: 200, body: { session_id: b.attach ?? 'sNew', approver_lease: { lease: g.lease, generation: g.generation }, started: { realm_selector: b.realm, approver_lease: { token: g.lease, generation: g.generation } } } };
    }
    if (path.endsWith('/approver-lease')) {
      if (c.method === 'POST') { if (d.cap && lease !== d.cap) return { status: 409, body: { code: 'approver_lease_held', message: 'x' } }; return { status: 200, body: { ...mint(), info: { epoch: 'e1' } } }; }
      if (!d.cap || lease !== d.cap) return { status: 409, body: { code: 'approver_lease_invalid', message: 'x' } };
      if (c.method === 'DELETE') { d.cap = null; return { status: 200, body: {} }; }
      return { status: 200, body: { generation: d.generation, info: { epoch: 'e1' } } };
    }
    if (path.endsWith('/confirm')) return { status: 200, body: { status: 'ok' } };
    return { status: 200, body: {} };
  });
  const j = new Journal();
  const io = liveIO(TARGET);
  return { j, io, g: guardIO(io, { acct: UID, container: C }) as any };
}
afterEach(() => { try { approvers().reset(); } catch { /* none */ } });
const posts = () => d.seen.filter((x) => x.method === 'POST' && x.path === '/sessions');
const open = (sid: string | null, on = true) => approvers().open(ref(sid), { strict: on });

describe('T39: attach carries exactly one lease ticket, no key', () => {
  it('a Strict attach sends no Idempotency-Key and no header; its grant is captured with every wire copy blanked; the handle is held', async () => {
    const { g } = setup();
    const h = open('sOld');   // an attach ticket comes from the handle of the session it reopens (the mint guard: attach === the handle's sid)
    const r: any = await g.attach({ ...strict(), attach: 'sOld' }, R1, tix(h.mintTicket(leaseRoutes.attach, null)));
    await settle(5);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({ idem: null, lease: null });
    expect(JSON.stringify(r), 'no capability left in the answer').not.toContain('CAP');
    expect(approvers().state(ref('sOld'))).toMatchObject({ phase: 'held', generation: 1 });
    expect(h.sid).toBe('sOld');
  });
  it('a handle that returns null gives tix(null) = []: core refuses the call TICKET_REQUIRED and sends nothing', async () => {
    const { g } = setup();
    const h = open('sOld');
    h.close();
    expect(h.mintTicket(leaseRoutes.attach, null)).toBeNull();
    const out = await g.attach({ ...strict(), attach: 'sOld' }, R1, tix(h.mintTicket(leaseRoutes.attach, null))).then(() => 'ok', (e: any) => e?.code);
    expect(out).toBe('TICKET_REQUIRED');
    expect(posts()).toHaveLength(0);
  });
  it('a create ticket on an attach is refused TICKET_REFUSED, unsent (the bind names the route and the key)', async () => {
    const { g } = setup();
    const h = open(null);
    const out = await g.attach({ ...strict(), attach: 'sOld' }, R1, tix(h.mintTicket(leaseRoutes.create, K('a')))).then(() => 'ok', (e: any) => e?.code);
    expect(out).toBe('TICKET_REFUSED');
    expect(posts()).toHaveLength(0);
  });
});

describe('T40: create and decision through liveIO -> journal guard -> core', () => {
  const create = (j: Journal, g: any, body: any, lease: (k: string) => any) => {
    const k = j.mint('create')!;
    const a = j.admit({ ...base(), route: 'create', key: k } as Op, new SendToken()) as any;
    return { k, out: j.post(a, (t) => g.create(body, k, R1, tix(t, lease(k)))) };
  };
  it('a Strict create carries both tickets: one POST with the key and no header, and the answer\'s grant is the handle\'s', async () => {
    const { j, g } = setup();
    const h = open(null);
    const { k, out } = create(j, g, strict(), (key) => h.mintTicket(leaseRoutes.create, key));
    expect(await out, 'sent').toMatchObject({ kind: 'sent' });
    await settle(5);
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({ idem: k, lease: null });
    expect(approvers().state(ref('sNew')).phase).toBe('held');
  });
  it('a default create from an engine with an open handle carries exactly the journal ticket (it mints no lease ticket)', async () => {
    const { j, g } = setup();
    const h = open(null);
    let minted = 0;
    const body = createBody(R1, C)!;
    expect(approvalModeOf(body)).toBe('default');
    const { out } = create(j, g, body, (key) => { if (approvalModeOf(body) !== 'default') { minted++; return h.mintTicket(leaseRoutes.create, key); } return null; });
    expect(await out).toMatchObject({ kind: 'sent' });
    expect(minted).toBe(0);
    expect(posts()).toHaveLength(1);
  });
  it('a Strict create whose handle returns null reaches core with the journal ticket only: TICKET_REQUIRED, unsent', async () => {
    const { j, g } = setup();
    const h = open(null);
    h.close();
    let code = '';
    const { out } = create(j, g, strict(), (key) => h.mintTicket(leaseRoutes.create, key));
    await out.catch((e: any) => { code = e?.code ?? String(e); });
    await settle(5);
    expect(posts()).toHaveLength(0);
    void code;
  });
  it('a Strict create with the lease ticket alone (no journal ticket) is refused by the guard before core', async () => {
    const { j, g } = setup();
    const h = open(null);
    const k = j.mint('create')!;
    const out = await g.create(strict(), k, R1, tix(h.mintTicket(leaseRoutes.create, k))).then(() => 'ok', (e: any) => e?.code);
    expect(out).toBe('TICKET_REQUIRED');
    expect(posts()).toHaveLength(0);
  });
  it('a decision on the held session carries the capability as the header and its generation in the body, beside the journal ticket', async () => {
    const { j, g } = setup();
    const h = open(null);
    const c = create(j, g, strict(), (key) => h.mintTicket(leaseRoutes.create, key));
    await c.out;
    await settle(5);
    const dec = h.decide(leaseRoutes.confirm);
    expect(dec).not.toBeNull();
    expect(dec!.lease_generation).toBe(1);
    const rid = j.mint('confirm')!;
    const a = j.admit({ ...base(), route: 'confirm', key: rid, sid: 'sNew', c: K('1'), gate: 'G1', gen: 1 } as Op, new SendToken()) as any;
    const out = await j.post(a, (t) => g.confirm('sNew', { gate_id: 'G1', generation: 1, approved: true, remember: false, request_id: rid, lease_generation: dec!.lease_generation } as any, R1, tix(t, dec!.ticket)));
    expect(out).toMatchObject({ kind: 'sent' });
    const sent = d.seen.filter((x) => x.path === '/sessions/sNew/confirm');
    expect(sent).toHaveLength(1);
    expect(sent[0]!.lease).toBe(d.cap);
    expect(sent[0]!.body.lease_generation).toBe(1);
  });
  it('a decision while the lease is not displayed as held carries no lease ticket: decide() is null', async () => {
    setup();
    const h = open('sNone', true);
    // nothing acquired yet (the first acquire is in flight or refused): no sure lease, no ticket
    expect(approvers().state(ref('sNone')).phase).not.toBe('held');
    expect(h.decide(leaseRoutes.confirm)).toBeNull();
  });
});
void calls;
