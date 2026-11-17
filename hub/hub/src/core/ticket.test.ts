// Vitest: the ticket seam, core steps 1-7 (array check, required kinds, exact bind match, issuer checks,
// spend, answer, settled) and the approver-lease core tests. Real api() and a
// recorded fetch; the issuers are test doubles.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { api, onPending, openMutations, outcomeOf, type HubError } from './api';
import { bump, capture } from './ctx';
import { admit, inflightCount, isIdemKey, send as kitSend } from './kit';
import { build, defineRoute, type Route } from './routes';
import { admitTickets, answerTickets, checkTickets, claimTickets, declaredTickets, resetTickets, settleTickets, type Ticket, type TicketBind, type TicketCall, type TicketIssuer, type TicketSettled } from './ticket';
import { boot, calls, onFetch, R1, TARGET } from './test/env';

const S = '/sessions/:id';
const IDEM = 'hub-AAAAAAAAAAAAAAAAAAAAAA';
const leaseRt = defineRoute<unknown, { ttl_ms: number }>({ method: 'PATCH', path: `${S}/approver-lease`, scope: 'agent', body: ['ttl_ms'], tickets: { lease: 'required' } });
const releaseRt = defineRoute({ method: 'DELETE', path: `${S}/approver-lease`, scope: 'agent', tickets: { lease: 'required' } });
const decideRt = defineRoute<unknown, { approved: boolean }>({ method: 'POST', path: `${S}/confirm`, scope: 'agent', body: ['approved'], tickets: { journal: 'required', lease: 'optional' } });
const createRt = defineRoute<unknown, { approval?: { mode: string } }>({ method: 'POST', path: '/sessions', scope: 'agent', body: ['approval'], idem: true,
  tickets: { journal: 'required', lease: (b) => (b as { approval?: { mode?: string } })?.approval?.mode !== 'default' } });
const plainRt = defineRoute({ method: 'GET', path: `${S}/state`, scope: 'agent' });
const baseRt = defineRoute({ method: 'GET', path: '/computers', scope: 'realm' });

type Log = string[];
let log: Log;
let mintJ: (b: TicketBind) => Ticket;
let mintL: (b: TicketBind) => Ticket;
let lease: { value: string | null; check: (t: Ticket, c: TicketCall) => boolean };
let seen: TicketCall[];
let answers: unknown[];
let settledSeen: Array<{ who: string; r: TicketSettled }>;

function issuers(): { j: TicketIssuer; l: TicketIssuer } {
  return {
    j: {
      check: (_t, c) => { log.push('check:journal'); seen.push(c); return true; },
      spend: () => { log.push('spend:journal'); return null; },
      answer: () => { log.push('answer:journal'); },
      settled: (_t, r) => { log.push('settled:journal'); settledSeen.push({ who: 'journal', r }); },
    },
    l: {
      check: (t, c) => { log.push('check:lease'); seen.push(c); return lease.check(t, c); },
      spend: () => { log.push('spend:lease'); return lease.value; },
      answer: (_t, raw) => { log.push('answer:lease'); answers.push(JSON.parse(JSON.stringify(raw))); (raw as { lease?: string }).lease = ''; },
      settled: (_t, r) => { log.push('settled:lease'); settledSeen.push({ who: 'lease', r }); },
    },
  };
}
const bindFor = (route: Route, o: Partial<TicketBind> = {}): TicketBind => ({ route, container: TARGET.container.id, sid: 's1', idem: null, ...o });
const call = (route: Route, tickets: unknown, o: Record<string, unknown> = {}) => api(route as never, { params: { id: 's1' }, tickets, ...o } as never);
/** The context dies while the answer's body is being read: the answer is complete, nothing aborted the transport. */
function bumpWhileReading(): () => void {
  const real = globalThis.fetch;
  globalThis.fetch = (async (u: string, i?: RequestInit) => {
    const r = await real(u, i);
    const text = await r.text();
    return new Response(new ReadableStream({ pull(c) { bump('switch'); c.enqueue(new TextEncoder().encode(text)); c.close(); } }), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return () => { globalThis.fetch = real; };
}
const err = async (p: Promise<unknown>): Promise<HubError> => p.then(() => { throw new Error('resolved'); }, (e: HubError) => e);

beforeEach(() => {
  boot({ realm: R1 });
  log = []; seen = []; answers = []; settledSeen = [];
  lease = { value: 'CAP-1', check: () => true };
  const { j, l } = issuers();
  mintJ = claimTickets('journal', j);
  mintL = claimTickets('lease', l);
  onFetch(() => ({ status: 200, body: { ok: true, lease: 'GRANT-1' } }));
});
afterEach(() => { resetTickets(); });

describe('claimTickets', () => {
  it('a second claim of a kind throws; an invalid issuer throws; reset retires old mints and tickets', () => {
    expect(() => claimTickets('journal', issuers().j)).toThrow();
    expect(() => claimTickets('lease', issuers().l)).toThrow();
    expect(() => claimTickets('lease', {} as never)).toThrow();
    expect(() => claimTickets('other' as never, issuers().j)).toThrow();
    const old = mintL(bindFor(leaseRt));
    resetTickets();
    expect(() => mintL(bindFor(leaseRt))).toThrow();
    claimTickets('lease', issuers().l);
    return expect(err(call(leaseRt, [old], { body: { ttl_ms: 1 } }))).resolves.toMatchObject({ code: 'TICKET_REFUSED', kind: 'not_sent' });
  });
  it('a bind needs a route, a computer and string-or-null sid and idem', () => {
    for (const b of [null, {}, { route: leaseRt, container: '', sid: null, idem: null }, { route: leaseRt, container: 'c1', sid: 5, idem: null }, { route: leaseRt, container: 'c1', sid: null, idem: 5 }, { container: 'c1', sid: null, idem: null }]) {
      expect(() => mintL(b as never)).toThrow();
    }
  });
  it('a ticket is opaque, frozen and not forgeable', async () => {
    const t = mintL(bindFor(leaseRt));
    expect(Object.isFrozen(t)).toBe(true);
    expect(Object.keys(t)).toEqual([]);
    for (const forged of [{}, Object.freeze({}), { bind: bindFor(leaseRt) }, Object.create(null), t.constructor]) {
      expect(await err(call(leaseRt, [forged], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    }
    expect(calls).toHaveLength(0);
  });
});

describe('a required kind is missing, or a ticket is not valid', () => {
  it('no ticket on a route that requires one: TICKET_REQUIRED, unsent', async () => {
    for (const given of [undefined, [], ]) {
      expect(await err(call(leaseRt, given, { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REQUIRED', kind: 'not_sent' });
    }
    expect(await err(call(releaseRt, undefined))).toMatchObject({ code: 'TICKET_REQUIRED' });
    expect(calls).toHaveLength(0);
    expect(log).toEqual([]);
  });
  it('a foreign, spent, duplicate-kind or null element, or a non-array: TICKET_REFUSED, unsent', async () => {
    const a = mintL(bindFor(leaseRt)), b = mintL(bindFor(leaseRt));
    await call(leaseRt, [a], { body: { ttl_ms: 1 } });
    expect(calls).toHaveLength(1);
    for (const given of [[a], [b, b], [b, mintL(bindFor(leaseRt))], [null], [undefined], [b, null], 'ticket', { 0: b, length: 1 }, [b, b, b], 5]) {
      expect(await err(call(leaseRt, given, { body: { ttl_ms: 1 } })), JSON.stringify(given)).toMatchObject({ code: 'TICKET_REFUSED', kind: 'not_sent' });
    }
    expect(calls).toHaveLength(1);
  });
  it('a refusal at step 1-3 spends nothing: the same ticket goes on a corrected call', async () => {
    const t = mintL(bindFor(leaseRt));
    expect(await err(call(leaseRt, [t, null], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(log).toEqual([]);
    await call(leaseRt, [t], { body: { ttl_ms: 1 } });
    expect(calls).toHaveLength(1);
  });
});

describe('the bind must match exactly; single use', () => {
  it.each([
    ['another route object with the same shape', (r: Route) => ({ route: defineRoute({ method: r.method, path: r.path, scope: 'agent', body: ['ttl_ms'], tickets: { lease: 'required' } }) as Route })],
    ['another computer', () => ({ container: 'c2' })],
    ['another session', () => ({ sid: 's2' })],
    ['a sid-less ticket', () => ({ sid: null })],
    ['an idempotency key the call lacks', () => ({ idem: IDEM })],
  ])('%s: TICKET_REFUSED, unsent, nothing checked or spent', async (_n, over) => {
    const t = mintL(bindFor(leaseRt, over(leaseRt as Route)));
    expect(await err(call(leaseRt, [t], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
    expect(log).toEqual([]);
  });
  it('idem null must match a call with a key as a mismatch; a key must equal the call\'s', async () => {
    const withKey = defineRoute<unknown, { approved: boolean }>({ method: 'POST', path: `${S}/message`, scope: 'agent', body: ['approved'], idem: true, tickets: { journal: 'required' } });
    expect(await err(call(withKey, [mintJ(bindFor(withKey, { idem: null }))], { body: { approved: true }, idem: IDEM }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(await err(call(withKey, [mintJ(bindFor(withKey, { idem: 'hub-' + 'B'.repeat(22) }))], { body: { approved: true }, idem: IDEM }))).toMatchObject({ code: 'TICKET_REFUSED' });
    await call(withKey, [mintJ(bindFor(withKey, { idem: IDEM }))], { body: { approved: true }, idem: IDEM });
    expect(calls).toHaveLength(1);
  });
  it('the sid is the call\'s params.id; a path without one binds null', async () => {
    const noSid = defineRoute({ method: 'POST', path: '/hooks/reload', scope: 'agent', tickets: { journal: 'optional' } });
    await api(noSid as never, { tickets: [mintJ(bindFor(noSid, { sid: null }))] } as never);
    expect(calls).toHaveLength(1);
    expect(await err(api(noSid as never, { tickets: [mintJ(bindFor(noSid, { sid: 's1' }))] } as never))).toMatchObject({ code: 'TICKET_REFUSED' });
  });
  it('single use, whatever the outcome', async () => {
    const t = mintL(bindFor(leaseRt));
    onFetch(() => ({ status: 409, body: { code: 'approver_lease_invalid', message: 'x', details: {} } }));
    await err(call(leaseRt, [t], { body: { ttl_ms: 1 } }));
    expect(calls).toHaveLength(1);
    onFetch(() => ({ status: 200, body: {} }));
    expect(await err(call(leaseRt, [t], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(calls).toHaveLength(1);
  });
});

describe('undeclared kinds, and tickets on base or realm routes', () => {
  it('a kind the route does not declare: TICKET_REFUSED', async () => {
    expect(await err(call(leaseRt, [mintJ(bindFor(leaseRt))], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(await err(call(plainRt, [mintL(bindFor(plainRt))]))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
  });
  it('any ticket on a base or realm route: TICKET_REFUSED (an empty list is no ticket)', async () => {
    const t = mintL({ route: baseRt, container: TARGET.container.id, sid: null, idem: null });
    expect(await err(api(baseRt as never, { tickets: [t] } as never))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(await err(api(baseRt as never, { tickets: 'x' } as never))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
    await api(baseRt as never, { tickets: [] } as never);
    expect(calls).toHaveLength(1);
  });
  it('an optional kind may be left out; a route that declares none takes none', async () => {
    await call(decideRt, [mintJ(bindFor(decideRt))], { body: { approved: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.headers['x-hoody-approver-lease']).toBeUndefined();
    await call(plainRt, undefined);
    expect(calls).toHaveLength(2);
  });
  it('defineRoute validates the declaration: agent routes only, known kinds, a Need', () => {
    expect(() => defineRoute({ method: 'GET', path: '/x', scope: 'realm', tickets: { lease: 'required' } })).toThrow(/tickets/);
    for (const bad of [{}, [], 'required', { other: 'required' }, { lease: 'maybe' }, { lease: true }, { lease: null }]) {
      expect(() => defineRoute({ method: 'POST', path: `${S}/x`, scope: 'agent', tickets: bad as never })).toThrow(/ROUTE_INVALID: tickets/);
    }
    expect(defineRoute({ method: 'POST', path: `${S}/x`, scope: 'agent', tickets: { journal: 'optional', lease: () => true } }).tickets).toMatchObject({ journal: 'optional' });
    expect(defineRoute({ method: 'POST', path: `${S}/y`, scope: 'agent' }).tickets).toBeNull();
  });
});

describe('the header: the lease ticket\'s spend is the only source', () => {
  it('a spent lease value is sent as X-Hoody-Approver-Lease on any declaring route', async () => {
    await call(leaseRt, [mintL(bindFor(leaseRt))], { body: { ttl_ms: 1 } });
    await call(releaseRt, [mintL(bindFor(releaseRt))]);
    await call(decideRt, [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))], { body: { approved: true } });
    expect(calls.map((c) => c.headers['x-hoody-approver-lease'])).toEqual(['CAP-1', 'CAP-1', 'CAP-1']);
  });
  it('a null spend adds no header', async () => {
    lease.value = null;
    await call(leaseRt, [mintL(bindFor(leaseRt))], { body: { ttl_ms: 1 } });
    expect(calls[0]!.headers['x-hoody-approver-lease']).toBeUndefined();
  });
  it('a caller cannot supply it: a header map is ignored, a query field refused', async () => {
    await call(plainRt, undefined, { headers: { 'X-Hoody-Approver-Lease': 'forged' } });
    expect(calls[0]!.headers['x-hoody-approver-lease']).toBeUndefined();
    expect(await err(call(plainRt, undefined, { query: { lease: 'forged' } }))).toMatchObject({ code: 'ROUTE_QUERY' });
  });
  it.each(['', 'a b', 'a\r\nX: 1', 'é', 'x'.repeat(513), 5, {}])('a spend value %j that is not a header-safe token refuses the call and the tickets stay spent', async (v) => {
    lease.value = v as never;
    const t = mintL(bindFor(leaseRt));
    expect(await err(call(leaseRt, [t], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED', kind: 'not_sent' });
    expect(calls).toHaveLength(0);
    lease.value = 'CAP-1';
    expect(await err(call(leaseRt, [t], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
  });
  it('a throwing spend refuses the call, tickets spent', async () => {
    const { j, l } = issuers();
    resetTickets();
    claimTickets('journal', j);
    const mint = claimTickets('lease', { ...l, spend: () => { throw new Error('boom'); } });
    expect(await err(call(leaseRt, [mint(bindFor(leaseRt))], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(calls).toHaveLength(0);
  });
});

describe('check-all-then-spend, in order journal then lease', () => {
  it('both checks run before either spend; spends run journal first whatever the array order', async () => {
    await call(decideRt, [mintL(bindFor(decideRt)), mintJ(bindFor(decideRt))], { body: { approved: true } });
    expect(log.slice(0, 4).sort()).toEqual(['check:journal', 'check:lease', 'spend:journal', 'spend:lease']);
    expect(log.indexOf('spend:journal')).toBeGreaterThan(Math.max(log.indexOf('check:journal'), log.indexOf('check:lease')));
    expect(log.indexOf('spend:lease')).toBeGreaterThan(log.indexOf('spend:journal'));
  });
  it('the spend order is journal then lease for either array order', async () => {
    for (const lease1st of [true, false]) {
      log.length = 0;
      const tj = mintJ(bindFor(decideRt)), tl = mintL(bindFor(decideRt));
      await call(decideRt, lease1st ? [tl, tj] : [tj, tl], { body: { approved: true } });
      expect(log.filter((x) => x.startsWith('spend'))).toEqual(['spend:journal', 'spend:lease']);
    }
  });
  it('one failing check spends nothing: both tickets stay usable', async () => {
    const tj = mintJ(bindFor(decideRt)), tl = mintL(bindFor(decideRt));
    lease.check = () => false;
    expect(await err(call(decideRt, [tj, tl], { body: { approved: true } }))).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(log.filter((x) => x.startsWith('spend'))).toEqual([]);
    expect(calls).toHaveLength(0);
    lease.check = () => true;
    log.length = 0;
    await call(decideRt, [tj, tl], { body: { approved: true } });
    expect(calls).toHaveLength(1);
  });
  it('a throwing check is false', async () => {
    lease.check = () => { throw new Error('boom'); };
    expect(await err(call(leaseRt, [mintL(bindFor(leaseRt))], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'TICKET_REFUSED' });
  });
  it('the issuer sees the very call: route, computer, sid, idem, realm and the parsed body', async () => {
    await call(decideRt, [mintJ(bindFor(decideRt))], { body: { approved: true } });
    expect(seen[0]).toMatchObject({ route: decideRt, container: 'c1', sid: 's1', idem: null, realm: R1, body: { approved: true } });
  });
});

describe('settleTickets runs the hooks once however often it is called', () => {
  it('a second settle of the same spent set is ignored', () => {
    const adm = admitTickets(declaredTickets({ journal: 'required' }), [mintJ(bindFor(decideRt))], { route: decideRt, container: TARGET.container.id, sid: 's1', idem: null, realm: R1 }, '{}');
    expect(adm.ok).toBe(true);
    if (!adm.ok) return;
    settleTickets(adm.spent, { ok: true, body: {} });
    settleTickets(adm.spent, { ok: true, body: {} });
    expect(log.filter((x) => x === 'settled:journal')).toHaveLength(1);
  });
});

describe('the function form of Need', () => {
  const create = (mode: string | undefined, tickets: unknown) => api(createRt as never, { body: mode ? { approval: { mode } } : {}, idem: IDEM, tickets } as never);
  const bind = { route: createRt as Route, container: 'c1', sid: null, idem: IDEM };
  it('a Strict body without a lease ticket is TICKET_REQUIRED; a default body passes without one; with one it passes too', async () => {
    expect(await err(create('always', [mintJ(bind)]))).toMatchObject({ code: 'TICKET_REQUIRED', kind: 'not_sent' });
    expect(calls).toHaveLength(0);
    await create('default', [mintJ(bind)]);
    expect(calls).toHaveLength(1);
    await create('always', [mintJ(bind), mintL(bind)]);
    expect(calls).toHaveLength(2);
  });
  it('the function judges the body as sent (parsed from the JSON), and a throw means required', async () => {
    const seenBodies: unknown[] = [];
    const rt = defineRoute<unknown, { a: number }>({ method: 'POST', path: `${S}/z`, scope: 'agent', body: ['a'], tickets: { lease: (b) => { seenBodies.push(b); return false; } } });
    await api(rt as never, { params: { id: 's1' }, body: { a: 1 } } as never);
    expect(seenBodies).toEqual([{ a: 1 }]);
    const boom = defineRoute<unknown, { a: number }>({ method: 'POST', path: `${S}/w`, scope: 'agent', body: ['a'], tickets: { lease: () => { throw new Error('boom'); } } });
    expect(await err(api(boom as never, { params: { id: 's1' }, body: { a: 1 } } as never))).toMatchObject({ code: 'TICKET_REQUIRED' });
  });
  it('a function-form kind that is not required still takes a ticket when given one', async () => {
    const fn = defineRoute<unknown, { approved: boolean }>({ method: 'POST', path: `${S}/confirm2`, scope: 'agent', body: ['approved'], tickets: { lease: () => false } });
    await api(fn as never, { params: { id: 's1' }, body: { approved: true }, tickets: [mintL(bindFor(fn))] } as never);
    expect(calls[0]!.headers['x-hoody-approver-lease']).toBe('CAP-1');
  });
});

describe('the body an issuer judges is a frozen copy parsed from what is sent', () => {
  it('a check that tries to mutate call.body changes nothing on the wire', async () => {
    resetTickets();
    claimTickets('journal', issuers().j);
    const mint = claimTickets('lease', {
      check: (_t, c) => { try { (c.body as { ttl_ms: number }).ttl_ms = 999; } catch { /* frozen */ } try { (c as { body: unknown }).body = {}; } catch { /* frozen */ } return true; },
      spend: () => 'CAP-1',
    });
    await call(leaseRt, [mint(bindFor(leaseRt))], { body: { ttl_ms: 5 } });
    expect(calls[0]!.body).toEqual({ ttl_ms: 5 });
  });
  it('one issuer cannot change the body another issuer judges, nested values included', async () => {
    resetTickets();
    let lateSaw: unknown;
    const mj = claimTickets('journal', { check: (_t, c) => { try { (c.body as { approved: boolean }).approved = false; } catch { /* frozen */ } try { (c.body as { n: { x: number } }).n.x = 9; } catch { /* frozen */ } return true; }, spend: () => null });
    const ml = claimTickets('lease', { check: (_t, c) => { lateSaw = JSON.parse(JSON.stringify(c.body)); return true; }, spend: () => 'CAP-1' });
    const nestedRt = defineRoute<unknown, { approved: boolean; n: { x: number } }>({ method: 'POST', path: `${S}/confirm-nested`, scope: 'agent', body: ['approved', 'n'], tickets: { journal: 'required', lease: 'optional' } });
    const b = bindFor(nestedRt);
    await call(nestedRt, [mj(b), ml(b)], { body: { approved: true, n: { x: 1 } } });
    expect(lateSaw).toEqual({ approved: true, n: { x: 1 } });
  });
  it('a body whose toJSON changes between calls cannot make the checked body differ from the sent one', async () => {
    let n = 0;
    const body = { ttl_ms: 5, toJSON() { return { ttl_ms: ++n }; } };
    await call(leaseRt, [mintL(bindFor(leaseRt))], { body });
    expect((seen.at(-1)!.body as { ttl_ms: number }).ttl_ms).toBe(calls[0]!.body.ttl_ms);
  });
});

describe('the answer hook (step 6)', () => {
  it('runs on a success answer before the caller\'s scrub, and blanks what it takes', async () => {
    let scrubSaw: unknown;
    const r = await call(leaseRt, [mintL(bindFor(leaseRt))], { body: { ttl_ms: 1 }, scrub: (raw: unknown) => { scrubSaw = JSON.parse(JSON.stringify(raw)); } });
    expect(answers).toEqual([{ ok: true, lease: 'GRANT-1' }]);
    expect(scrubSaw).toMatchObject({ lease: '' });
    expect(JSON.stringify(r)).not.toContain('GRANT-1');
  });
  it('is called for each spent ticket that has one, journal first, once', async () => {
    await call(decideRt, [mintL(bindFor(decideRt)), mintJ(bindFor(decideRt))], { body: { approved: true } });
    expect(log.filter((x) => x.startsWith('answer'))).toEqual(['answer:journal', 'answer:lease']);
  });
  it('runs even when the context dies right after the answer was read (a post-read bump)', async () => {
    onFetch(() => ({ status: 200, body: { lease: 'GRANT-2' } }));
    const undo = bumpWhileReading();
    try { await err(call(leaseRt, [mintL(bindFor(leaseRt))], { body: { ttl_ms: 1 } })); } finally { undo(); }
    expect(answers).toEqual([{ lease: 'GRANT-2' }]);
  });
  it('is never called for a transport that was aborted, or an error answer', async () => {
    const ac = new AbortController();
    onFetch(async () => { ac.abort(); return { status: 200, body: { lease: 'GRANT-3' }, delayMs: 20 }; });
    await err(call(leaseRt, [mintL(bindFor(leaseRt))], { body: { ttl_ms: 1 }, signal: ac.signal }));
    onFetch(() => ({ status: 409, body: { code: 'approver_lease_invalid', message: 'x', details: {} } }));
    await err(call(leaseRt, [mintL(bindFor(leaseRt))], { body: { ttl_ms: 1 } }));
    expect(answers).toEqual([]);
  });
  it('a throwing hook is SCRUB_FAILED, and the caller never sees the answer', async () => {
    resetTickets();
    const { j } = issuers();
    claimTickets('journal', j);
    const mint = claimTickets('lease', { check: () => true, spend: () => 'CAP-1', answer: () => { throw new Error('boom'); } });
    expect(await err(call(leaseRt, [mint(bindFor(leaseRt))], { body: { ttl_ms: 1 } }))).toMatchObject({ code: 'SCRUB_FAILED' });
  });
});

describe('refusals stay definite after ctx death; recovers suppresses the notice only while the ctx lives', () => {
  const notices: unknown[] = [];
  let off: () => void;
  beforeEach(() => { notices.length = 0; off = onPending((n) => notices.push(n)); });
  afterEach(() => off());
  const cas = defineRoute<unknown, { v: string }>({ method: 'PUT', path: '/workflows/:name', scope: 'agent', body: ['v'], refuses: ['revision_conflict'] });
  it('a listed refusal answered after the context died stays a definite refusal (notApplied), not pending', async () => {
    onFetch(() => ({ status: 409, body: { code: 'revision_conflict', message: 'x', details: {} } }));
    const undo = bumpWhileReading();
    const e = await err(api(cas as never, { params: { name: 'a' }, body: { v: '1' } } as never)).finally(undo);
    expect(e).toMatchObject({ code: 'revision_conflict', notApplied: true });
    expect(e.pending).toBeUndefined();
  });
  it('a change answered after its ctx died is pending; recovers suppresses the notice only while the ctx lives', async () => {
    onFetch(() => ({ status: 500, body: { code: 'boom' } }));
    const recovers = await err(api(cas as never, { params: { name: 'a' }, body: { v: '1' }, recovers: true } as never));
    expect(recovers).toMatchObject({ kind: 'pending' });
    expect(notices).toHaveLength(0);
    onFetch(() => ({ status: 500, body: { code: 'boom' } }));
    const undo = bumpWhileReading();
    const dead = await err(api(cas as never, { params: { name: 'a' }, body: { v: '1' }, recovers: true } as never)).finally(undo);
    expect(dead).toMatchObject({ kind: 'pending' });
    expect(notices).toHaveLength(1);
  });
});

describe('settled (step 7), exactly once per spent ticket, in spend order, on every outcome', () => {
  const run = (route: Route, tickets: Ticket[], o: Record<string, unknown> = {}) => call(route, tickets, { body: route === leaseRt ? { ttl_ms: 1 } : { approved: true }, ...o });
  const both = (): Ticket[] => [mintL(bindFor(decideRt)), mintJ(bindFor(decideRt))];
  const settledLog = () => log.filter((x) => x.startsWith('settled'));
  it('a 2xx: after the answer hooks, before the caller\'s promise settles; the same value the caller gets', async () => {
    const v = await run(decideRt, both());
    log.push('caller');
    expect(log.slice(-4)).toEqual(['answer:lease', 'settled:journal', 'settled:lease', 'caller']);
    expect(settledSeen.map((s) => s.who)).toEqual(['journal', 'lease']);
    expect(settledSeen[0]!.r).toEqual({ ok: true, body: v });
  });
  it.each([
    ['an answered refusal', () => onFetch(() => ({ status: 409, body: { code: 'approver_lease_invalid', message: 'x', details: {} } }))],
    ['a 5xx', () => onFetch(() => ({ status: 500, body: { code: 'boom' } }))],
    ['a network failure', () => onFetch(() => ({ status: 0, network: true }))],
  ])('%s', async (_n, arm) => {
    arm();
    const e = await err(run(decideRt, both()));
    log.push('caller');
    expect(settledLog()).toEqual(['settled:journal', 'settled:lease']);
    expect(log.at(-1)).toBe('caller');
    expect(settledSeen[0]!.r).toMatchObject({ ok: false });
    expect((settledSeen[0]!.r as { err: unknown }).err).toMatchObject({ code: e.code });
  });
  it('an abort (the caller\'s signal) settles it, with no answer hook', async () => {
    const ac = new AbortController();
    onFetch(async () => ({ status: 200, body: {}, delayMs: 200 }));
    const p = err(run(decideRt, both(), { signal: ac.signal }));
    await new Promise((r) => setTimeout(r, 20));
    ac.abort();
    await p;
    expect(settledLog()).toEqual(['settled:journal', 'settled:lease']);
    expect(log.filter((x) => x.startsWith('answer'))).toEqual([]);
  });
  it('a context that dies mid-flight settles it (abort on a bump)', async () => {
    onFetch(async () => ({ status: 200, body: {}, delayMs: 200 }));
    const p = err(run(decideRt, both()));
    await new Promise((r) => setTimeout(r, 20));
    bump('switch');
    await p;
    expect(settledLog()).toEqual(['settled:journal', 'settled:lease']);
  });
  it('a call refused unsent after spend (a lease value that is not header-safe) settles both spent tickets', async () => {
    lease.value = 'a b';
    const e = await err(run(decideRt, both()));
    expect(e).toMatchObject({ code: 'TICKET_REFUSED' });
    expect(settledLog()).toEqual(['settled:journal', 'settled:lease']);
    expect((settledSeen[0]!.r as { err: { kind: string } }).err.kind).toBe('not_sent');
  });
  it('a call refused before anything was spent settles nothing', async () => {
    await err(run(decideRt, [null as never]));
    await err(call(leaseRt, undefined, { body: { ttl_ms: 1 } }));
    lease.check = () => false;
    await err(run(decideRt, both()));
    expect(settledLog()).toEqual([]);
  });
  it('exactly once: a second use of the same ticket settles nothing', async () => {
    const ts = both();
    await run(decideRt, ts);
    await err(run(decideRt, ts));
    expect(settledLog()).toEqual(['settled:journal', 'settled:lease']);
  });
  it('a throwing settled hook is ignored: the caller\'s outcome is unchanged and the other ticket still settles', async () => {
    resetTickets();
    const mintJ2 = claimTickets('journal', { check: () => true, spend: () => null, settled: () => { log.push('settled:journal'); throw new Error('boom'); } });
    const mintL2 = claimTickets('lease', issuers().l);
    const v = await run(decideRt, [mintL2(bindFor(decideRt)), mintJ2(bindFor(decideRt))]);
    expect(v).toMatchObject({ ok: true });
    expect(settledLog()).toEqual(['settled:journal', 'settled:lease']);
  });
  it('only a spent ticket settles: an unspent one in a refused call does not', async () => {
    const tj = mintJ(bindFor(decideRt)), tl = mintL(bindFor(decideRt));
    lease.check = () => false;
    await err(run(decideRt, [tj, tl]));
    expect(settledLog()).toEqual([]);
  });
});

describe('isIdemKey', () => {
  it('accepts a kit key and an agent key, nothing else', () => {
    for (const k of [IDEM, 'hx-' + 'a'.repeat(32), 'x', 'a'.repeat(255)]) expect(isIdemKey(k), k).toBe(true);
    for (const k of ['', 'a'.repeat(256), 'a b', 'é', 5, null, undefined, {}]) expect(isIdemKey(k), String(k)).toBe(false);
  });
});

describe('the bind is judged against what is sent', () => {
  it('a session id that changes between the path and the admission cannot move a ticket to another session', async () => {
    const params = { id: 's2' };
    const body = { approved: true, toJSON() { params.id = 's1'; return { approved: true }; } };
    const e = await err(api(decideRt as never, { params, body, tickets: [mintJ(bindFor(decideRt))] } as never)); // tickets are for s1, the path is /sessions/s2/...
    expect(e).toMatchObject({ code: 'TICKET_REFUSED', kind: 'not_sent' });
    expect(calls).toHaveLength(0);
    expect(log.filter((x) => x.startsWith('spend'))).toEqual([]);
  });
  it('the same call with tickets for the session in the path goes to that session', async () => {
    const params = { id: 's2' };
    const body = { approved: true, toJSON() { params.id = 's1'; return { approved: true }; } };
    await api(decideRt as never, { params, body, tickets: [mintJ(bindFor(decideRt, { sid: 's2' }))] } as never);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('/sessions/s2/confirm');
    expect(seen[0]!.sid).toBe('s2');
  });
  it('a computer id getter that answers c1 and then c2: the request goes to the computer the issuers saw (a send is required)', async () => {
    let n = 0;
    const target = { project: { id: 'p1' }, container: { get id() { return n++ === 0 ? 'c1' : 'c2'; }, server_name: 'sv1' } };
    await call(decideRt, [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))], { target, body: { approved: true } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('p1-c1-');
    expect(seen.map((x) => x.container)).toEqual(['c1', 'c1']);
  });
  it('a computer id that is not a primitive string (an object that converts differently each time) names no computer: refused unsent, nothing spent', async () => {
    for (const make of [
      () => { let n = 0; return { [Symbol.toPrimitive]: () => (n++ === 0 ? 'c2' : 'c1') }; },
      () => { let n = 0; return { toString: () => (n++ === 0 ? 'c2' : 'c1') }; },
      () => ({ valueOf: () => 'c1', toString: () => 'c1' }),
      () => 7,
    ]) {
      calls.length = 0; seen.length = 0; log.length = 0;
      const target = { project: { id: 'p1' }, container: { id: make(), server_name: 'sv1' } };
      const e = await err(call(decideRt, [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))], { target, body: { approved: true } }));
      expect(e).toMatchObject({ kind: 'not_sent' });
      expect(calls).toHaveLength(0);
      expect(log.filter((x) => x.startsWith('spend') || x.startsWith('check'))).toEqual([]);
    }
  });
  it('a call without tickets to a computer whose id is not a string is not sent either (the URL is built from primitives only)', async () => {
    let n = 0;
    const target = { project: { id: 'p1' }, container: { id: { toString: () => (n++ === 0 ? 'c2' : 'c1') }, server_name: 'sv1' } };
    const e = await err(api(plainRt as never, { params: { id: 's1' }, target } as never));
    expect(e).toMatchObject({ kind: 'not_sent' });
    expect(calls).toHaveLength(0);
  });
  it('a project id or server name that is not a string is refused the same way', async () => {
    for (const target of [
      { project: { id: { toString: () => 'p1' } }, container: { id: 'c1', server_name: 'sv1' } },
      { project: { id: 'p1' }, container: { id: 'c1', server_name: { toString: () => 'sv1' } } },
    ]) {
      const e = await err(call(decideRt, [mintJ(bindFor(decideRt))], { target, body: { approved: true } }));
      expect(e).toMatchObject({ kind: 'not_sent' });
      expect(calls).toHaveLength(0);
    }
  });
  it('valid string ids are sent, as ever (control)', async () => {
    await call(decideRt, [mintJ(bindFor(decideRt))], { target: { project: { id: 'p1' }, container: { id: 'c1', server_name: 'sv1' } }, body: { approved: true } });
    expect(calls).toHaveLength(1);
  });
});

describe('a synchronous failure after the tickets are spent is still settled', () => {
  it('a transport that throws synchronously: both issuers settle once, the caller gets the failure', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error('sync transport'); }) as unknown as typeof fetch;
    try {
      const e = await err(call(decideRt, [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))], { body: { approved: true } }));
      expect(e).toBeDefined();
      expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']);
      expect(settledSeen.every((x) => x.r.ok === false)).toBe(true);
    } finally { globalThis.fetch = real; }
  });
  it('an input whose signal getter throws after admission: nothing sent, the tickets stay unspent (no hook runs) and serve a retry', async () => {
    const tk = [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))];
    const input = { params: { id: 's1' }, body: { approved: true }, tickets: tk, get signal(): AbortSignal { throw new Error('signal'); } };
    const e = await err(api(decideRt as never, input as never));
    expect(e).toBeDefined();
    expect(calls).toHaveLength(0);
    expect(settledSeen).toEqual([]);
    expect(log.filter((x) => x.startsWith('spend:'))).toEqual([]);
    await call(decideRt, tk, { body: { approved: true } });
    expect(calls).toHaveLength(1);
    expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']);
  });
});

describe('one issuer\'s hook cannot hide the answer or the outcome from the other', () => {
  it('a journal answer hook that throws: the lease hook still takes the grant and blanks it; the caller gets SCRUB_FAILED; both settle', async () => {
    resetTickets();
    const l = issuers().l;
    const mj = claimTickets('journal', { check: () => true, spend: () => null, answer: () => { throw new Error('first'); }, settled: (_t, r) => { settledSeen.push({ who: 'journal', r }); } });
    const ml = claimTickets('lease', { ...l, settled: (_t, r) => { settledSeen.push({ who: 'lease', r }); } });
    const b = bindFor(decideRt);
    const e = await err(call(decideRt, [mj(b), ml(b)], { body: { approved: true } }));
    expect(e).toMatchObject({ code: 'SCRUB_FAILED' });
    expect(answers).toEqual([{ ok: true, lease: 'GRANT-1' }]);
    expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']);
  });
  it('a settled hook that is a throwing getter changes nothing for the caller and does not stop the other issuer', async () => {
    resetTickets();
    const l = issuers().l;
    const mj = claimTickets('journal', { check: () => true, spend: () => null, get settled(): never { throw new Error('getter'); } } as never);
    const ml = claimTickets('lease', l);
    const b = bindFor(decideRt);
    const v = await call(decideRt, [mj(b), ml(b)], { body: { approved: true } });
    expect(v).toBeDefined();
    expect(log.filter((x) => x === 'settled:lease')).toHaveLength(1);
  });
});

describe('every synchronous failure after the spend reaches step 7 and leaves nothing behind', () => {
  it('a context whose liveness check throws (after admission): rejection, nothing sent, the tickets stay unspent', async () => {
    const ctx = capture();
    Object.defineProperty(ctx, 'gen', { get() { throw new Error('gen'); } });
    const tk = [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))];
    const e = await err(api(decideRt as never, { params: { id: 's1' }, body: { approved: true }, ctx, tickets: tk } as never));
    expect(e).toBeDefined();
    expect(calls).toHaveLength(0);
    expect(settledSeen).toEqual([]);
    await call(decideRt, tk, { body: { approved: true } });
    expect(calls).toHaveLength(1);
  });
  it('a transport that throws synchronously releases its timer, inflight entry and abort listener, and clears the open change', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error('sync transport'); }) as unknown as typeof fetch;
    const ac = new AbortController();
    let added = 0, removed = 0;
    const add = ac.signal.addEventListener.bind(ac.signal), rem = ac.signal.removeEventListener.bind(ac.signal);
    ac.signal.addEventListener = ((t: string, f: never, o?: never) => { if (t === 'abort') added++; return add(t, f, o); }) as never;
    ac.signal.removeEventListener = ((t: string, f: never, o?: never) => { if (t === 'abort') removed++; return rem(t, f, o); }) as never;
    const before = inflightCount();
    try {
      const e = await err(api(decideRt as never, { params: { id: 's1' }, body: { approved: true }, signal: ac.signal, tickets: [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))] } as never));
      expect(e).toBeDefined();
      expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']);
      expect(inflightCount()).toBe(before);
      expect(openMutations()).toHaveLength(0);
      expect(added).toBeGreaterThan(0);
      expect(removed).toBe(added);
    } finally { globalThis.fetch = real; }
  });
});

describe('one boundary; foreign throwables are never trusted; the outcome is fixed by phase', () => {
  const two = () => [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))];
  const send = (o: Record<string, unknown> = {}) => api(decideRt as never, { params: { id: 's1' }, body: { approved: true }, tickets: two(), ...o } as never);
  /** setTimeout/clearTimeout balance, counted around a call. */
  function timers() {
    const st = globalThis.setTimeout, ct = globalThis.clearTimeout, live = new Set<unknown>();
    globalThis.setTimeout = ((f: never, ms?: number, ...a: never[]) => { const t = st(f, ms, ...a); live.add(t); return t; }) as never;
    globalThis.clearTimeout = ((t: never) => { live.delete(t); return ct(t); }) as never;
    return { live, undo: () => { globalThis.setTimeout = st; globalThis.clearTimeout = ct; } };
  }
  const failedSettled = () => { expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']); expect(settledSeen.every((x) => x.r.ok === false)).toBe(true); };

  it('(b) a thrown object whose properties throw when read: the caller gets an error of ours (an Error instance holding it as its cause); the unspent tickets settle nothing', async () => {
    const hostile = { get message(): string { throw new Error('read'); }, get code(): string { throw new Error('read'); } };
    const ctx = capture();
    Object.defineProperty(ctx, 'gen', { get() { throw hostile; } });
    const e = (await err(send({ ctx }))) as unknown as Error & { cause?: unknown };
    expect(e).toBeDefined();
    expect(e).toBeInstanceOf(Error);
    expect(e.cause).toBe(hostile);
    expect(e).toMatchObject({ code: 'CALL_FAILED', kind: 'unreachable' });
    expect(calls).toHaveLength(0);
    expect(settledSeen).toEqual([]);
  });
  it('(b) the same hostile throwable from a transport after the send: the outcome is the unknown one and both issuers settle once', async () => {
    const hostile = { get message(): string { throw new Error('read'); }, get code(): string { throw new Error('read'); } };
    const real = globalThis.fetch;
    globalThis.fetch = (() => { throw hostile; }) as unknown as typeof fetch;
    try {
      const e = await err(send());
      failedSettled();
      expect(settledSeen[0]!.r).toEqual({ ok: false, err: e });
      expect(settledSeen[1]!.r).toEqual({ ok: false, err: e });
    } finally { globalThis.fetch = real; }
  });

  it('(a) an abort listener registration that throws before registering: nothing leaks, the call is refused unsent, the tickets stay unspent and a retry with them succeeds', async () => {
    const t = timers();
    const sig = new AbortController().signal;
    sig.addEventListener = (() => { throw new Error('add'); }) as never;
    const before = inflightCount();
    const tk = two();
    try {
      const e = await err(send({ signal: sig, tickets: tk }));
      expect(e).toMatchObject({ kind: 'not_sent' });
      expect(calls).toHaveLength(0);
      expect(settledSeen).toEqual([]);
      expect(log.filter((x) => x.startsWith('spend:'))).toEqual([]);
      expect(inflightCount()).toBe(before);
      expect(t.live.size).toBe(0);
    } finally { t.undo(); }
    await send({ tickets: tk });
    expect(calls).toHaveLength(1);
    expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']);
  });

  it('(a) a registration that registers and then throws: the listener is removed, nothing leaks', async () => {
    const t = timers();
    const sig = new AbortController().signal;
    const add = sig.addEventListener.bind(sig), rem = sig.removeEventListener.bind(sig);
    let added = 0, removed = 0;
    sig.addEventListener = ((a: string, f: never, o?: never) => { add(a, f, o); added++; throw new Error('after'); }) as never;
    sig.removeEventListener = ((a: string, f: never, o?: never) => { removed++; rem(a, f, o); }) as never;
    const before = inflightCount();
    const tk = two();
    try {
      const e = await err(send({ signal: sig, tickets: tk }));
      expect(e).toBeDefined();
      expect(settledSeen).toEqual([]);
      expect(inflightCount()).toBe(before);
      expect(t.live.size).toBe(0);
      expect(removed).toBe(added);
    } finally { t.undo(); }
    await send({ tickets: tk });
    expect(calls).toHaveLength(1);
  });

  it('(a) a transport promise whose then throws: nothing leaks and the outcome is the unknown one', async () => {
    const t = timers();
    const real = globalThis.fetch;
    globalThis.fetch = (() => ({ get then(): never { throw new Error('then'); } })) as unknown as typeof fetch;
    const before = inflightCount();
    try {
      const e = await err(send());
      expect(e).toMatchObject({ kind: 'pending' });
      failedSettled();
      expect(inflightCount()).toBe(before);
      expect(t.live.size).toBe(0);
      expect(openMutations()).toHaveLength(0);
    } finally { globalThis.fetch = real; t.undo(); }
  });

  it('(c) a cleanup that throws after an unknown send does not change the outcome: still pending, still settled once', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error('sync transport'); }) as unknown as typeof fetch;
    const sig = new AbortController().signal;
    const rem = sig.removeEventListener.bind(sig);
    let removals = 0;
    sig.removeEventListener = ((a: string, f: never, o?: never) => { removals++; rem(a, f, o); throw { status: 400, code: 'LOCAL_CLEANUP_FAILURE' }; }) as never;
    try {
      const e = await err(send({ signal: sig }));
      expect(e).toMatchObject({ kind: 'pending' });
      failedSettled();
      expect(removals).toBeGreaterThan(0);
      expect(openMutations()).toHaveLength(0);
    } finally { globalThis.fetch = real; }
  });

  it('(c) the send is marked entered before the transport runs: a transport that throws is pending, never a definite refusal', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error('sync transport'); }) as unknown as typeof fetch;
    try {
      expect(await err(send())).toMatchObject({ kind: 'pending', pending: true });
    } finally { globalThis.fetch = real; }
  });
});

describe('the kit exchange fixes its outcome by phase', () => {
  const plan = () => {
    const built = build(plainRt, { params: { id: 's1' } });
    if ('refused' in built) throw new Error(built.refused);
    const a = admit(plainRt, built, { target: TARGET, realm: R1 });
    if ('refused' in a) throw new Error(a.refused);
    return a;
  };
  it('a transport that throws once the send hook ran: the request may have gone out (unreachable), and the hook ran once', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => { throw new Error('sync transport'); }) as unknown as typeof fetch;
    let sent = 0;
    try {
      expect(await err(kitSend(plan(), { onSend: () => { sent++; } }))).toMatchObject({ kind: 'unreachable', code: 'NETWORK' });
      expect(sent).toBe(1);
    } finally { globalThis.fetch = real; }
  });
  it('a setup that throws before the send hook: nothing went out (not_sent), the hook never ran', async () => {
    const sig = new AbortController().signal;
    sig.addEventListener = (() => { throw new Error('add'); }) as never;
    let sent = 0;
    expect(await err(kitSend(plan(), { signal: sig, onSend: () => { sent++; } }))).toMatchObject({ kind: 'not_sent', notSent: true });
    expect(sent).toBe(0);
    expect(calls).toHaveLength(0);
  });
  it('an input whose signal getter throws an object that cannot be read: an unsent refusal of ours, the tickets stay unspent', async () => {
    const hostile = { get message(): string { throw new Error('read'); } };
    const input = { params: { id: 's1' }, body: { approved: true }, tickets: [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))], get signal(): AbortSignal { throw hostile; } };
    const e = await err(api(decideRt as never, input as never));
    expect(e).toMatchObject({ notSent: true, code: 'NETWORK' });
    expect(calls).toHaveLength(0);
    expect(settledSeen).toEqual([]);
  });
});

describe('the exchange keeps its timeout', () => {
  it('a request nobody answers is aborted at the route\'s timeout: unreachable TIMEOUT, tickets settled, nothing left in flight', async () => {
    const slow = defineRoute<unknown, { approved: boolean }>({ method: 'POST', path: `${S}/slow`, scope: 'agent', body: ['approved'], timeoutMs: 30, tickets: { journal: 'required' } });
    onFetch(() => ({ status: 200, body: {}, delayMs: 5000 }));
    const before = inflightCount();
    const e = await err(api(slow as never, { params: { id: 's1' }, body: { approved: true }, tickets: [mintJ(bindFor(slow))] } as never));
    expect(e).toMatchObject({ code: 'TIMEOUT' });
    expect(settledSeen.map((x) => x.who)).toEqual(['journal']);
    expect(inflightCount()).toBe(before);
  });
});

describe('only a failure the exchange made from a Response it read is an answered failure', () => {
  const two = () => [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))];
  const wrap = (err: unknown) => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async (...a: Parameters<typeof fetch>) => { try { return await orig(...a); } finally { throw err; } }) as typeof fetch;
    return () => { globalThis.fetch = orig; };
  };
  it('a transport wrapper that fails after the request ran, with fields that look like a refusal: pending, never a definite failure', async () => {
    const undo = wrap(Object.assign(new Error('adapter cleanup failed'), { kind: 'bad_request', status: 400, code: 'LOCAL_CLEANUP_FAILURE' }));
    try {
      const e = await err(call(decideRt, two(), { body: { approved: true } }));
      expect(calls).toHaveLength(1);
      expect(e).toMatchObject({ kind: 'pending' });
      expect(outcomeOf(e as never, true)).not.toBe('failed');
      expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']);
    } finally { undo(); }
  });
  it('a plain object with a kind, thrown by the transport before any answer, is the same', async () => {
    const real = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject({ kind: 'conflict', status: 409, code: 'x' })) as unknown as typeof fetch;
    try {
      expect(await err(call(decideRt, two(), { body: { approved: true } }))).toMatchObject({ kind: 'pending' });
    } finally { globalThis.fetch = real; }
  });
  it('control: a real HTTP 400 answered by the server stays a definite refusal with its code', async () => {
    onFetch(() => ({ status: 400, body: { code: 'bad_thing', message: 'no', details: {} } }));
    const e = await err(call(decideRt, two(), { body: { approved: true } }));
    expect(e).toMatchObject({ status: 400, code: 'bad_thing' });
    expect(e).not.toMatchObject({ kind: 'pending' });
  });
  it('control: an answer the exchange read and found wrong keeps its own code (not a connection loss)', async () => {
    onFetch(() => ({ status: 200, text: 'not json', headers: { 'content-type': 'text/plain' } }));
    expect(await err(call(decideRt, two(), { body: { approved: true } }))).toMatchObject({ code: 'NOT_JSON' });
  });
});

const TIMEOUT_MS = 30000;
describe('every resource is set up before the tickets are spent', () => {
  const two = () => [mintJ(bindFor(decideRt)), mintL(bindFor(decideRt))];
  it('the order is timer, in-flight entry, abort listener, then spend (journal, lease), then the send', async () => {
    const st = globalThis.setTimeout, real = globalThis.fetch;
    globalThis.setTimeout = ((f: never, ms?: number, ...a: never[]) => { if (ms === TIMEOUT_MS) log.push('timer'); return st(f, ms, ...a); }) as never;
    const ac = new AbortController();
    const add = ac.signal.addEventListener.bind(ac.signal);
    ac.signal.addEventListener = ((t: string, f: never, o?: never) => { if (t === 'abort') log.push('listen'); return add(t, f, o); }) as never;
    const inner = globalThis.fetch;
    globalThis.fetch = ((...a: Parameters<typeof fetch>) => { log.push('fetch'); return inner(...a); }) as typeof fetch;
    try {
      await call(decideRt, two(), { body: { approved: true }, signal: ac.signal });
    } finally { globalThis.setTimeout = st; globalThis.fetch = real; }
    const order = log.filter((x) => ['listen', 'spend:journal', 'spend:lease', 'fetch'].includes(x));
    expect(order).toEqual(['listen', 'spend:journal', 'spend:lease', 'fetch']);
    expect(log.indexOf('timer')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('timer')).toBeLessThan(log.indexOf('spend:journal'));
    expect(log.indexOf('check:journal')).toBeLessThan(log.indexOf('listen'));
    expect(log.indexOf('check:lease')).toBeLessThan(log.indexOf('listen'));
  });
  it('a plan is checked at admission and spends nothing until it is sent', async () => {
    const built = build(decideRt, { params: { id: 's1' }, body: { approved: true } });
    if ('refused' in built) throw new Error(built.refused);
    const a = admit(decideRt, built, { target: TARGET, realm: R1, tickets: two(), sid: 's1' });
    if ('refused' in a) throw new Error(a.refused);
    expect(log.filter((x) => x.startsWith('check:'))).toEqual(['check:journal', 'check:lease']);
    expect(log.filter((x) => x.startsWith('spend:'))).toEqual([]);
    expect(a.headers['X-Hoody-Approver-Lease']).toBeUndefined();
    await kitSend(a);
    expect(log.filter((x) => x.startsWith('spend:'))).toEqual(['spend:journal', 'spend:lease']);
  });
  it('two plans admitted on the same tickets: the first send spends them, the second is refused unsent and spends nothing more', async () => {
    const tk = two();
    const mk = () => {
      const built = build(decideRt, { params: { id: 's1' }, body: { approved: true } });
      if ('refused' in built) throw new Error(built.refused);
      const a = admit(decideRt, built, { target: TARGET, realm: R1, tickets: tk, sid: 's1' });
      if ('refused' in a) throw new Error(a.refused);
      return a;
    };
    const p1 = mk(), p2 = mk();
    await kitSend(p1);
    expect(await err(kitSend(p2))).toMatchObject({ kind: 'not_sent', code: 'TICKET_REFUSED' });
    expect(calls).toHaveLength(1);
    expect(log.filter((x) => x.startsWith('spend:'))).toEqual(['spend:journal', 'spend:lease']);
  });
  it('a checked set that is not spent yet hears neither the answer nor the outcome', () => {
    const c = checkTickets(declaredTickets({ journal: 'required' }), [mintJ(bindFor(decideRt))], { route: decideRt, container: TARGET.container.id, sid: 's1', idem: null, realm: R1 }, '{}');
    if (!c.ok || !c.set) throw new Error('not checked');
    answerTickets(c.set, { x: 1 });
    settleTickets(c.set, { ok: true, body: {} });
    expect(log.filter((x) => x.startsWith('answer:') || x.startsWith('settled:') || x.startsWith('spend:'))).toEqual([]);
  });
  it('a setup failure that happens in a send leaves the tickets unspent: the same tickets then serve a retry', async () => {
    const tk = two();
    const bad = new AbortController().signal;
    bad.addEventListener = (() => { throw new Error('add'); }) as never;
    expect(await err(call(decideRt, tk, { body: { approved: true }, signal: bad }))).toMatchObject({ kind: 'not_sent' });
    expect(settledSeen).toEqual([]);
    expect(calls).toHaveLength(0);
    await call(decideRt, tk, { body: { approved: true } });
    expect(calls).toHaveLength(1);
    expect(log.filter((x) => x.startsWith('spend:'))).toEqual(['spend:journal', 'spend:lease']);
    expect(settledSeen.map((x) => x.who)).toEqual(['journal', 'lease']);
  });
  it('a spend that refuses after the setup: nothing is sent, everything is released, and the spent tickets settle once', async () => {
    resetTickets();
    const mj = claimTickets('journal', { check: () => true, spend: () => { throw new Error('spend'); }, settled: (_t, r) => { settledSeen.push({ who: 'journal', r }); } });
    const st = globalThis.setTimeout, ct = globalThis.clearTimeout, live = new Set<unknown>();
    globalThis.setTimeout = ((f: never, ms?: number, ...a: never[]) => { const h = st(f, ms, ...a); live.add(h); return h; }) as never;
    globalThis.clearTimeout = ((h: never) => { live.delete(h); return ct(h); }) as never;
    const ac = new AbortController();
    let added = 0, removed = 0;
    const add = ac.signal.addEventListener.bind(ac.signal), rem = ac.signal.removeEventListener.bind(ac.signal);
    ac.signal.addEventListener = ((a: string, f: never, o?: never) => { if (a === 'abort') added++; return add(a, f, o); }) as never;
    ac.signal.removeEventListener = ((a: string, f: never, o?: never) => { if (a === 'abort') removed++; return rem(a, f, o); }) as never;
    const before = inflightCount();
    try {
      const e = await err(call(decideRt, [mj(bindFor(decideRt))], { body: { approved: true }, signal: ac.signal }));
      expect(e).toMatchObject({ code: 'TICKET_REFUSED', kind: 'not_sent' });
    } finally { globalThis.setTimeout = st; globalThis.clearTimeout = ct; }
    expect(calls).toHaveLength(0);
    expect(live.size).toBe(0);
    expect(inflightCount()).toBe(before);
    expect(added).toBe(1);
    expect(removed).toBe(1);
    expect(settledSeen.map((x) => x.who)).toEqual(['journal']);
  });
});
