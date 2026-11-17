// Vitest: named scenarios that pin the manager's rows against mutation.
// Same harness as approver.test.ts: the real manager over the fake daemon under the
// stand-in for core's ticket steps and fake timers; a capability is only ever seen as a header in the daemon's `sent` log.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKEW, TTL, type Custody } from './approver-custody';
import { createApproverManager, type ApproverHandle, type ApproverManager, type ApproverRef } from './approver';
import { fakeDaemon } from './approver.fakedaemon';
import { ok } from './approver.fakecore';

const REF: ApproverRef = { computer: 'c1', realm: 'r1', sid: 's1' };
const KEY = 'c1|s1';
let T = 0;
let W = 5_000_000;
let d: ReturnType<typeof fakeDaemon>;
let m: ApproverManager;
let cus!: Custody;

/** Both clocks and the timers move together. */
const adv = async (ms: number): Promise<void> => {
  for (let left = ms; left > 0; left -= 2000) { const s = Math.min(2000, left); T += s; W += s; await vi.advanceTimersByTimeAsync(s); }
};
/** Only the timers move: the clocks stand still (a timer that fires while the clocks still say the life is sure). */
const advTimers = async (ms: number): Promise<void> => { await vi.advanceTimersByTimeAsync(ms); };
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };
const ops = (): string[] => d.sent.map((s) => s.op);
const count = (op: string, header?: string): number => d.sent.filter((x) => x.op === op && (header === undefined || x.header === header)).length;
const TIMEOUT = { ok: false as const, err: { kind: 'failed' as const, code: 'timeout', status: 0, retryAfter: null, details: {} } };

beforeEach(() => {
  vi.useFakeTimers();
  T = 1000; W = 5_000_000;
  d = fakeDaemon(() => W);
  m = createApproverManager({ api: () => d.api, routes: d.routes, clock: { mono: () => T, wall: () => W }, account: () => 'acct1', holder: 'hub-test', claim: d.core.claim, spy: (c) => { cus = c; } });
});
afterEach(() => { m.reset(); vi.useRealTimers(); });

const open = async (strict = true): Promise<ApproverHandle> => { const h = m.open(REF, { strict }); await flush(); return h; };
const capOf = (): string => d.leaseOf('s1')!.cap;
/** The decision on the held lease is sent and never answered: its capability is stale (a ghost). */
function ghostDecision(h: ApproverHandle, cap: string): void {
  const dec = h.decide({ n: 'confirm' } as never)!;
  d.core.spend(dec.ticket);
  d.core.deliver({ header: cap, ticket: dec.ticket }, TIMEOUT);
}
/** A second capability for the session arrives in a create/attach answer (another tab's grant on the same lease). */
function mintGrant(h: ApproverHandle, cap: string, generation: number): void {
  const t = h.mintTicket({ n: 'attach' } as never, null)!;
  const s = d.core.spend(t, { attach: 's1' })!;
  d.core.deliver(s, ok({ session_id: 's1', approver_lease: { lease: cap, generation } }));
}

describe('an answer to a request that is no longer the capability\'s current one', () => {
  it('a renew that was in flight when its capability was retired answers 404 after a new capability is held: the new one is untouched', async () => {
    await open();
    d.unlive(); d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                      // the renew is sent, the agent's 404 is held
    d.relive(); d.net.mode = 'ok';
    m.hide(); await flush();                                 // the old capability is retired (its renew detached) and released
    m.show(); await flush();                                 // a new lease is wanted, but the old renew is still the record's one outstanding request
    expect(m.state(REF).phase).toBe('acquiring');
    expect(count('acquire')).toBe(1);
    d.releaseHeld(); await flush();                          // the old renew's 404 arrives now, then the acquire runs
    expect(count('acquire')).toBe(2);
    expect(m.state(REF).phase).toBe('held');
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['cur']);
  });
});

describe('a renew answer for a capability retired meanwhile', () => {
  it('a renew 2xx that arrives after the capability was retired does not make it current again', async () => {
    await open();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                      // renew sent, its 2xx is held
    d.net.mode = 'timeout';
    m.hide(); await flush();                                 // retired; its release is not answered, so the capability stays in custody
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['retire']);
    d.releaseHeld(); await flush();
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['retire']);
  });
  it('pagehide sends its keepalive release even while the capability\'s earlier release is still in flight', async () => {
    const h = await open();
    const cap = capOf();
    d.net.mode = 'hold';
    h.close(); await flush();                                // release in flight
    expect(count('release', cap)).toBe(1);
    m.hide(); await flush();
    expect(d.sent.filter((x) => x.op === 'release' && x.keepalive === true && x.header === cap)).toHaveLength(1);
  });
});

describe('falling demand while an acquire is in flight', () => {
  it('the lapsed capability is released at once, not when the acquire answers', async () => {
    const h = await open();
    const old = capOf();
    ghostDecision(h, old);
    d.net.mode = 'hold';
    m.gap(); await flush();                                  // stale and unsure: lapse, one acquire (held in flight) with the old capability as proof
    expect(count('acquire')).toBe(2);
    h.setStrict(false); await flush();
    expect(count('release', old)).toBe(1);
  });
});

describe('looking again resets the other-holder and gone verdicts', () => {
  it('after "elsewhere", a pagehide/pageshow cycle acquires again once the other lease is gone', async () => {
    d.leases.set('s1', { cap: 'OTHER', holder: 'x', expires: W + TTL, generation: 9 });
    await open();
    expect(m.state(REF).phase).toBe('elsewhere');
    d.leases.clear();
    m.hide(); await flush(); m.show(); await flush();
    expect(m.state(REF).phase).toBe('held');
    expect(count('acquire')).toBe(2);
  });
  it('after "gone", a pagehide/pageshow cycle acquires again once the session is back', async () => {
    d.unlive();
    await open();
    expect(m.state(REF).phase).toBe('gone');
    d.relive();
    m.hide(); await flush(); m.show(); await flush();
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('an unsure grant does not reset the failure count', () => {
  it('the acquire after a lapse keeps its backoff when an earlier acquire had failed and the grant crossed a gap', async () => {
    d.net.mode = 'timeout';
    await open();                                            // fails = 1
    d.net.mode = 'hold';
    await adv(1000);                                         // the retry is in flight
    expect(count('acquire')).toBe(2);
    m.gap();                                                 // a gap while it flies: its grant will be unsure
    d.net.mode = 'timeout';                                  // the verifying renew will not answer
    d.releaseHeld(); await flush();
    expect(cus.caps(KEY)).toHaveLength(1);
    expect(count('renew')).toBe(1);
    expect(count('acquire'), 'the lapse waits out its backoff').toBe(2);
    await adv(1999); expect(count('acquire')).toBe(2);
    await adv(1); expect(count('acquire')).toBe(3);
  });
});

describe('the hook of an acquire answer leaves the acquire open until it settles', () => {
  it('a rotation whose answer names a new epoch does not also verify the capability it just took', async () => {
    await open();
    d.restart();                                             // the agent's epoch changes, its leases are gone
    m.gap(); await flush();                                  // unsure: one verifying renew (409: the record is gone, the proof removes it), one acquire (a new epoch)
    expect(ops()).toEqual(['acquire', 'renew', 'acquire']);
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('two capabilities at once', () => {
  it('a renew in flight is not sent twice when a second capability arrives and both are probed', async () => {
    const h = await open();
    const cap = capOf();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                      // the renew is in flight
    d.net.mode = 'ok';
    mintGrant(h, 'CAPM', 5); await flush();
    expect(count('renew', cap)).toBe(1);
  });
  it('probes go one at a time: the first probe to answer is not promoted while another probe is still to be sent', async () => {
    await open();                                            // CAP1 is the lease the agent knows
    d.net.mode = 'hold';                                     // CAPM (unknown to the agent) and CAP1 are probed; replies are held
    const h2 = m.open({ ...REF }, { strict: true });
    mintGrant(h2, 'CAPM', 5); await flush();
    expect(d.heldCount(), 'one probe on the wire, the other waits').toBe(1);
    expect(d.sent.filter((x) => x.op === 'renew').map((x) => x.header)).toEqual(['CAP1']);
    d.releaseHeld(); await flush();                          // CAP1 answers 2xx; then CAPM's probe is sent (and held)
    expect(d.sent.filter((x) => x.op === 'renew').map((x) => x.header)).toEqual(['CAP1', 'CAPM']);
    expect(m.state(REF).phase, 'CAPM is still being probed').toBe('acquiring');
    d.net.mode = 'ok'; d.releaseHeld(); await flush();       // CAPM answers 409: it is removed, CAP1 is promoted
    expect(m.state(REF).phase).toBe('held');
    expect(cus.caps(KEY)).toHaveLength(1);
  });
});

describe('a stale capability\'s life is not extended by a late renew answer', () => {
  it('a renew sent before a ghost decision answers 2xx after it: no further renew, and the rotation comes at the original end of the sure life', async () => {
    const h = await open();
    const cap = capOf();
    d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                      // renew in flight
    d.net.mode = 'ok';
    ghostDecision(h, cap);                                   // a decision sent after it is never answered: the capability is stale
    const timers = vi.getTimerCount();                       // the lapse timer and the 30 s tick: no renew timer
    d.releaseHeld(); await flush();                          // the renew's 2xx
    expect(vi.getTimerCount(), 'no renew timer is armed for a stale capability').toBe(timers);
    expect(count('renew', cap)).toBe(1);
    await adv((TTL - SKEW) / 2 - 20);                      // just short of the original end of the sure life
    expect(count('renew', cap), 'a stale capability is not renewed').toBe(1);
    expect(count('acquire')).toBe(1);
    await adv(5000);                                         // past it
    expect(count('acquire'), 'rotated at the original end').toBe(2);
    expect(count('renew', cap)).toBe(1);
  });
  it('a lapse timer that fires while the clocks still say the life is sure looks again instead of lapsing', async () => {
    await open();
    d.net.mode = 'timeout';
    await advTimers((TTL - SKEW) / 2 + 10);                // the renew is a ghost: stale
    d.net.mode = 'ok';
    await advTimers(TTL * 2);                                // the lapse timer fires, the clocks have not moved
    expect(count('acquire')).toBe(1);
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('a lapse starts the next acquire at once', () => {
  it('a stale capability whose sure life ended while no timer ran is replaced as soon as the record is looked at', async () => {
    const h = await open();
    ghostDecision(h, capOf());
    T += TTL + 1000; W += TTL + 1000;                        // the clocks agree and moved past the life; no timer ran
    m.open(REF, { strict: true }); await flush();            // anything that looks at the record
    expect(count('acquire')).toBe(2);
  });
});
