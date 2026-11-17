// Vitest: a proof is retired, and a Cap is sent, only for its own record, and the queue (one acquire or PATCH outstanding per record,
// the rest queued in order and judged again at the head; DELETE and decisions are not queued), each as a scenario against the real
// manager over the fake daemon.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKEW, TTL, type Custody } from './approver-custody';
import { createApproverManager, type ApproverApi, type ApproverHandle, type ApproverManager, type ApproverRef } from './approver';
import { fakeDaemon } from './approver.fakedaemon';
import { ok } from './approver.fakecore';

const REF: ApproverRef = { computer: 'c1', realm: 'r1', sid: 's1' };
const KEY = 'c1|s1';
let T = 0;
let W = 5_000_000;
let d: ReturnType<typeof fakeDaemon>;
let m: ApproverManager;
let cus!: Custody;
/** When set, the next acquire is answered with a grant that names another session (the answer the Hub must not misfile). */
let foreign: { sid: string; cap: string } | null = null;
/** How many renews reached the Api (a queued renew that is dropped never gets that far; one refused by the check does). */
let renewCalls = 0;

const adv = async (ms: number): Promise<void> => {
  for (let left = ms; left > 0; left -= 2000) { const s = Math.min(2000, left); T += s; W += s; await vi.advanceTimersByTimeAsync(s); }
};
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };
const sentOf = (op: string, id?: string, header?: string): number => d.sent.filter((x) => x.op === op && (id === undefined || x.id === id) && (header === undefined || x.header === header)).length;
const roles = (key = KEY): string[] => cus.caps(key).map((c) => c.role);

beforeEach(() => {
  vi.useFakeTimers();
  T = 1000; W = 5_000_000; foreign = null; renewCalls = 0;
  d = fakeDaemon(() => W);
  const api: ApproverApi = {
    ...d.api,
    renew: (id, realm, t) => { renewCalls += 1; return d.api.renew(id, realm, t); },
    acquire: async (id, realm, holder, t) => {
      if (!foreign) return d.api.acquire(id, realm, holder, t);
      const f = foreign; foreign = null;
      const s = d.core.spend(t);
      if (!s) return { ok: false as const, err: { kind: 'not_sent' as const, code: 'not_sent', status: 0, retryAfter: null, details: {} } };
      const reply = ok({ session_id: f.sid, approver_lease: { lease: f.cap, generation: 3 } });
      d.sent.push({ op: 'acquire', id, header: s.header, at: T, tag: 'foreign', res: 'ok' });
      d.core.deliver(s, reply);
      return reply;
    },
  };
  m = createApproverManager({ api: () => api, routes: d.routes, clock: { mono: () => T, wall: () => W }, account: () => 'acct1', holder: 'hub-test', claim: d.core.claim, spy: (c) => { cus = c; } });
});
afterEach(() => { m.reset(); vi.useRealTimers(); });

const open = async (strict = true): Promise<ApproverHandle> => { const h = m.open(REF, { strict }); await flush(); return h; };
function mintGrant(h: ApproverHandle, cap: string, generation: number): void {
  const t = h.mintTicket({ n: 'attach' } as never, null)!;
  const s = d.core.spend(t, { attach: 's1' })!;
  d.core.deliver(s, ok({ session_id: 's1', approver_lease: { lease: cap, generation } }));
}

describe('a proof is retired, and a Cap is sent, only in the record it belongs to', () => {
  it('an acquire that presents A for s1 and is answered with a grant for s2: s2 retires only its own grant, A stays s1\'s and the rotation is retried', async () => {
    await open();
    const capA = d.leaseOf('s1')!.cap;
    d.net.mode = 'timeout';
    await adv((TTL - SKEW) / 2 + 10);                              // the renew is a ghost: A is stale and will lapse
    foreign = { sid: 's2', cap: 'CAPX' };
    await adv((TTL - SKEW) / 2 + 100);                             // A lapses; the acquire presents A and is answered with a grant naming s2
    expect(d.sent.filter((x) => x.tag === 'foreign').length).toBe(1);
    expect(roles(), 'A is still s1\'s, lapsed and cur: it was not retired in s2\'s record').toEqual(['cur']);
    expect(d.sent.filter((x) => x.id === 's2' && x.header === capA), 'A is never sent on s2').toEqual([]);
    expect(roles('c1|s2'), 's2 has no handle: its grant is retired (the release is not yet answered)').toEqual(['retire']);
    d.net.mode = 'ok';
    await adv(30_000); await flush();
    expect([...new Set(d.sent.filter((x) => x.header === 'CAPX').map((x) => `${x.op}:${x.id}`))], 'CAPX is only ever released, and on s2').toEqual(['release:s2']);
    expect(roles('c1|s2'), 's2\'s 409 removed only the grant it carried').toEqual([]);
    expect(d.sent.filter((x) => x.op === 'acquire' && x.header === capA && x.id === 's1').length, 'A was presented again, on s1, after the backoff').toBe(2);
    expect(m.state(REF).phase).toBe('held');
    expect(roles()).toEqual(['cur']);
  });
});

describe('one acquire or PATCH outstanding per record; the others queue in order', () => {
  it('a queued renew for a Cap that is removed before it reaches the head never leaves', async () => {
    const h = await open();
    const capA = d.leaseOf('s1')!.cap;
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // A's renew is on the wire, its answer held
    mintGrant(h, 'CAPM', 5); await flush();                        // a second Cap: A and CAPM are probed, one at a time
    expect(sentOf('renew', 's1'), 'only A\'s renew is out, CAPM\'s probe waits').toBe(1);
    d.net.mode = 'ok';
    m.hide(); await flush();                                       // both are retired; their releases (not queued) go out and remove them
    expect(sentOf('release', 's1', 'CAPM'), 'the release is not queued behind the renew').toBeGreaterThan(0);
    expect(roles()).toEqual([]);
    d.releaseHeld(); await flush();                                // A's renew settles: the queue is judged
    expect(sentOf('renew', 's1', 'CAPM'), 'the renew queued for a removed Cap never left').toBe(0);
    expect(sentOf('renew', 's1', capA)).toBe(1);
    expect(renewCalls, 'the dropped renew was never handed to the Api').toBe(1);
  });

  it('requests go out one at a time and in order: an acquire made behind a renew is sent when the renew settles', async () => {
    await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // the renew is out (its answer held)
    m.hide(); await flush();                                       // retired
    m.show(); await flush();                                       // an acquire is wanted
    expect(d.sent.filter((x) => x.op === 'renew' || x.op === 'acquire').map((x) => x.op), 'the acquire waits').toEqual(['acquire', 'renew']);
    expect(m.state(REF).phase).toBe('acquiring');
    d.net.mode = 'ok'; d.releaseHeld(); await flush();
    expect(d.sent.filter((x) => x.op === 'renew' || x.op === 'acquire').map((x) => x.op)).toEqual(['acquire', 'renew', 'acquire']);
    expect(m.state(REF).phase).toBe('held');
  });

  it('the bound: an acquire behind a renew is sent when that renew settles, and what is shown is the new lease\'s own life, never the old one\'s', async () => {
    await open();
    const first = m.state(REF).expiresAt!;
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // the renew is out and not answered
    await adv((TTL - SKEW) / 2 + 1000);                            // past the sure end of the first lease: shown as acquiring, whatever waits
    expect(W, 'the sure end has passed').toBeGreaterThan(first);
    expect(m.state(REF).phase, 'the lapse is not deferred by the queue').toBe('acquiring');
    expect(m.state(REF).expiresAt).toBeUndefined();
    expect(sentOf('acquire'), 'the acquire has not been sent: it waits for the renew').toBe(1);
    const settledAt = W;
    d.net.mode = 'ok'; d.releaseHeld(); await flush();             // the renew settles (core\'s 30 s timeout bounds how long this takes)
    expect(sentOf('acquire'), 'sent at the instant the renew settled').toBe(2);
    expect(d.sent.filter((x) => x.op === 'acquire').at(-1)!.at).toBe(W);
    expect(m.state(REF).phase).toBe('held');
    expect(m.state(REF).expiresAt, 'the shown end is the new request\'s own send time plus the sure life').toBe(settledAt + TTL - SKEW);
  });

  it('a takeover waiting on a queued acquire is released when the acquire is dropped because a lease arrived', async () => {
    const h = await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // the renew is out
    m.hide(); await flush();
    m.show(); await flush();                                       // the acquire waits behind the renew
    let done = false;
    void m.takeOver(REF).then(() => { done = true; });
    await flush();
    expect(done).toBe(false);
    mintGrant(h, 'CAPN', 7); await flush();                        // a lease arrives by another door while it waits
    d.net.mode = 'ok'; d.releaseHeld(); await flush();
    expect(done, 'the dropped acquire\'s waiter was released').toBe(true);
  });

  it('a release is not queued behind a renew: the pagehide keepalive goes out at once', async () => {
    await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);
    m.releaseAll(); await flush();
    expect(sentOf('release', 's1'), 'the DELETE went while the renew was still out').toBeGreaterThan(0);
    expect(d.heldCount()).toBeGreaterThan(0);
  });

  it('a record with a request outstanding is not forgotten: a handle reopened meanwhile queues its acquire behind it', async () => {
    const h = await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // the renew is out
    d.net.mode = 'ok';
    h.close(); await flush();                                      // no demand: A is retired and released; the record has no Cap left
    expect(roles()).toEqual([]);
    const h2 = m.open(REF, { strict: true }); await flush();
    expect(h2.sid).toBe('s1');
    expect(sentOf('acquire'), 'the acquire waits for the renew still on the wire').toBe(1);
    d.net.mode = 'ok'; d.releaseHeld(); await flush();
    expect(sentOf('acquire')).toBe(2);
    expect(m.state(REF).phase).toBe('held');
  });

  it('an account change drops what waits unsent: nothing leaves afterwards and a takeover waiting on it is released', async () => {
    const h = await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);
    mintGrant(h, 'CAPM', 5); await flush();                        // CAPM's probe waits behind A's renew
    m.hide(); await flush(); m.show(); await flush();
    let done = false;
    void m.takeOver(REF).then(() => { done = true; });
    await flush();
    const before = d.sent.length;
    m.accountChanged(); await flush();
    expect(done, 'the waiter was released by the account change').toBe(true);
    d.net.mode = 'ok'; d.releaseHeld(); await flush();
    expect(d.sent.length, 'nothing of the old account left after the change').toBe(before);
  });

  it('a queued acquire whose demand is gone when it reaches the head is dropped unsent', async () => {
    const h = await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // the renew is out
    m.hide(); await flush();
    m.show(); await flush();                                       // the acquire waits behind the renew
    h.close(); await flush();                                      // and its demand goes
    d.net.mode = 'ok'; d.releaseHeld(); await flush();
    expect(sentOf('acquire'), 'no acquire left for a record nobody wants').toBe(1);
  });

  it('an account change releases a takeover waiting on the acquire that is already on the wire', async () => {
    await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // the renew is out
    m.hide(); await flush();
    m.show(); await flush();                                       // the acquire waits behind the renew
    let done = false;
    void m.takeOver(REF).then(() => { done = true; });
    d.releaseHeldAt(0); await flush();                             // the renew settles: the acquire is sent (its reply is held too)
    expect(sentOf('acquire')).toBe(2);
    expect(done).toBe(false);
    m.accountChanged(); await flush();
    expect(done, 'the waiter of the acquire on the wire was released by the account change').toBe(true);
  });
});

describe('the fake daemon\'s counters (the oracle): a request counts in the generation it was sent in', () => {
  it('an old-account reply does not lower the new account\'s counts', async () => {
    const f = fakeDaemon(() => W);
    const mint = f.core.claim('lease', { check: () => true, spend: () => 'H', settled: () => undefined });
    const tk = (): never => mint({ route: f.routes.acquire, container: 'c1', sid: 's1', idem: null } as never) as never;
    f.net.mode = 'hold';
    const old = f.api.acquire('s1', 'r1', 'hub', tk());
    await flush();
    f.forgetInflight();
    const a2 = f.api.acquire('s1', 'r1', 'hub', tk());
    await flush();
    f.releaseHeldAt(0);
    await old; await flush();
    const a3 = f.api.acquire('s1', 'r1', 'hub', tk());
    await flush();
    expect(f.stats.maxOut, 'two of the new account\'s requests are out at once').toBe(2);
    expect(f.stats.maxAcqInflight).toBe(2);
    f.releaseHeld(); await a2; await a3;
  });
});

describe('the retry schedule of renews (verify after a gap, probes): 1 s, 2 s, 5 s, written out here, not read from backoff()', () => {
  const renewTimes = (header?: string): number[] => d.sent.filter((x) => x.op === 'renew' && (header === undefined || x.header === header)).map((x) => x.at);
  const gaps = (xs: number[]): number[] => xs.slice(1).map((x, i) => x - xs[i]!);
  const fine = async (ms: number): Promise<void> => { for (let left = ms; left > 0; left -= 500) { T += 500; W += 500; await vi.advanceTimersByTimeAsync(500); } };
  it('a verifying renew that keeps being refused with a 400 is retried after 1 s, 2 s, 5 s', async () => {
    await open();
    d.net.mode = 'bad';
    m.gap(); await flush();                                         // the sure life is unsure now: one verifying renew at once
    await fine(12_000);
    expect(gaps(renewTimes()).slice(0, 3)).toEqual([1000, 2000, 5000]);
  });
  it('a current renew that keeps being refused with a 400 is retried after 1 s, 2 s, 5 s', async () => {
    await open();
    d.net.mode = 'bad';
    await adv((TTL - SKEW) / 2 - 1000);
    const before = renewTimes().length;
    await fine(14_000);
    expect(before).toBe(0);
    expect(gaps(renewTimes()).slice(0, 3)).toEqual([1000, 2000, 5000]);
  });
  it('a probe that keeps being refused with a 400 is retried after 1 s, 2 s, 5 s', async () => {
    const h = await open();
    d.net.mode = 'bad';
    mintGrant(h, 'CAPM', 5); await flush();                        // two Caps: both are probed, one at a time, and both are refused
    await fine(40_000);
    const caps = [...new Set(d.sent.filter((x) => x.op === 'renew').map((x) => x.header!))];
    expect(caps.length).toBe(2);
    for (const c of caps) expect(gaps(renewTimes(c)).slice(0, 3), `probe retries of ${c}`).toEqual([1000, 2000, 5000].slice(0, Math.min(3, gaps(renewTimes(c)).length)));
    expect(Math.max(...caps.map((c) => renewTimes(c).length)), 'the probes were retried').toBeGreaterThanOrEqual(4);
  });
});
