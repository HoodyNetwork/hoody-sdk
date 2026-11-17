// Vitest: approver edge cases, each as a scenario against the real manager over the fake daemon.
// A: a grant names the session it belongs to. B: a removed capability steers nothing. C: only {status:"ok"} closes a decision.
// D: a closed handle is not demand. E: a 410 retires the capability it names, whatever its role. F: the backed-off retry after a
// Take over. Also: reset leaves no capability for a reopened session, and the hidden gap reads both clocks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKEW, TTL, type Custody } from './approver-custody';
import { createApproverManager, type ApproverHandle, type ApproverManager, type ApproverRef } from './approver';
import { fakeDaemon } from './approver.fakedaemon';
import { fail, ok } from './approver.fakecore';

const REF: ApproverRef = { computer: 'c1', realm: 'r1', sid: 's1' };
const KEY = 'c1|s1';
let T = 0;
let W = 5_000_000;
let d: ReturnType<typeof fakeDaemon>;
let m: ApproverManager;
let cus!: Custody;

const adv = async (ms: number): Promise<void> => {
  for (let left = ms; left > 0; left -= 2000) { const s = Math.min(2000, left); T += s; W += s; await vi.advanceTimersByTimeAsync(s); }
};
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };
const count = (op: string, id?: string, header?: string): number => d.sent.filter((x) => x.op === op && (id === undefined || x.id === id) && (header === undefined || x.header === header)).length;
const TIMEOUT = { ok: false as const, err: { kind: 'failed' as const, code: 'timeout', status: 0, retryAfter: null, details: {} } };

beforeEach(() => {
  vi.useFakeTimers();
  T = 1000; W = 5_000_000;
  d = fakeDaemon(() => W);
  m = createApproverManager({ api: () => d.api, routes: d.routes, clock: { mono: () => T, wall: () => W }, account: () => 'acct1', holder: 'hub-test', claim: d.core.claim, spy: (c) => { cus = c; } });
});
afterEach(() => { m.reset(); vi.useRealTimers(); });

const open = async (strict = true, ref = REF): Promise<ApproverHandle> => { const h = m.open(ref, { strict }); await flush(); return h; };
/** A decision spent on the held lease; its answer is delivered by the test. */
function spendDecision(h: ApproverHandle, cap: string): { header: string; ticket: never } {
  const dec = h.decide({ n: 'confirm' } as never)!;
  d.core.spend(dec.ticket);
  return { header: cap, ticket: dec.ticket as never };
}

describe('A: a grant belongs to the session its answer names', () => {
  it('an attach for s1 whose answer names s2 is held and retired under s2; s1 and its own capability are untouched', async () => {
    const h = await open(false);
    d.net.mode = 'hold';                                             // s2's release is not answered yet: the grant stays in custody
    const t = h.mintTicket({ n: 'attach' } as never, null)!;
    const s = d.core.spend(t, { attach: 's1' })!;
    d.core.deliver(s, ok({ session_id: 's2', approver_lease: { lease: 'CAPX', generation: 3 } }));
    await flush();
    expect(cus.caps('c1|s2').map((c) => c.role)).toEqual(['retire']);
    expect(cus.caps(KEY)).toEqual([]);
    d.net.mode = 'ok'; d.releaseHeld(); await flush();
    expect(d.sent.filter((x) => x.header === 'CAPX').map((x) => `${x.op}:${x.id}`)).toEqual(['release:s2']);
    expect(count('release', 's1')).toBe(0);
  });
  it('a refusal on s2 for that capability cannot remove a capability held for s1', async () => {
    const h = await open(true);
    const cap = d.leaseOf('s1')!.cap;
    const t = h.mintTicket({ n: 'attach' } as never, null)!;
    const s = d.core.spend(t, { attach: 's1' })!;
    d.core.deliver(s, ok({ session_id: 's2', approver_lease: { lease: 'CAPX', generation: 3 } }));
    await flush();
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['cur']);
    expect(d.leaseOf('s1')!.cap).toBe(cap);
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('D: a closed handle is not demand', () => {
  it('a create answer that arrives after the sid-less handle closed is given back; nothing is armed', async () => {
    const h = m.open({ computer: 'c1', realm: 'r1', sid: null }, { strict: true });
    const t = h.mintTicket({ n: 'create' } as never, 'k1')!;
    const s = d.core.spend(t, {})!;
    h.close(); await flush();
    d.core.deliver(s, ok({ session_id: 's7', approver_lease: { lease: 'CAPNEW', generation: 4 } }));
    await flush();
    expect(m.state({ computer: 'c1', realm: 'r1', sid: 's7' }).phase).not.toBe('held');
    expect(d.sent.filter((x) => x.header === 'CAPNEW').map((x) => `${x.op}:${x.id}`)).toEqual(['release:s7']);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('B: a removed capability steers nothing', () => {
  it('a decision that answers late for a removed capability does not rotate the replacement', async () => {
    const h = await open();
    const capA = d.leaseOf('s1')!.cap;
    const d1 = spendDecision(h, capA);
    const d2 = spendDecision(h, capA);
    d.leases.delete('s1');                                           // the agent no longer knows A
    d.core.deliver(d1, fail(409, 'approver_lease_invalid'));       // A is removed by this proof
    await flush();
    expect(m.state(REF).phase).toBe('held');
    const acquires = count('acquire');
    expect(acquires).toBe(2);
    await adv(TTL);                                                  // past A's old sure life
    d.core.deliver(d2, TIMEOUT);
    await flush();
    expect(count('acquire'), 'the old ghost starts no acquire').toBe(acquires);
    expect(m.state(REF).phase).toBe('held');
  });
  it('a renew of a removed capability: the acquire that replaces it waits for the renew, then runs; the late 404 meets nothing and the grant is kept', async () => {
    const h = await open();
    const capA = d.leaseOf('s1')!.cap;
    d.unlive(); d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                                // A's renew is sent; the agent's 404 is held
    d.relive();
    const dec = spendDecision(h, capA);
    d.leases.delete('s1');
    d.core.deliver(dec, fail(409, 'approver_lease_invalid'));       // A is removed (the decision is not queued: it is not an acquire or a PATCH)
    await flush();
    expect(cus.caps(KEY)).toEqual([]);
    expect(count('acquire'), 'one outstanding request per record: the replacing acquire waits behind the renew').toBe(1);
    expect(m.state(REF).phase).toBe('acquiring');
    d.net.mode = 'ok'; d.releaseHeld(); await flush();               // the renew's answer, then the acquire
    expect(count('acquire')).toBe(2);
    expect(m.state(REF).phase).toBe('held');
    const capB = d.leaseOf('s1')!.cap;
    expect(count('release', 's1', capB)).toBe(0);
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['cur']);
  });
});

describe('a renew of a removed capability is not the end of the story (decisions and attach grants are not queued)', () => {
  it('its 404 arriving after another capability was granted for the session steers nothing: the new capability stays current', async () => {
    const h = await open();
    const capA = d.leaseOf('s1')!.cap;
    d.unlive(); d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                                // A's renew is sent; the agent's 404 is held
    d.relive();
    const dec = spendDecision(h, capA);
    d.leases.delete('s1');
    d.core.deliver(dec, fail(409, 'approver_lease_invalid'));       // A is removed by the decision's proof
    await flush();
    const t = h.mintTicket({ n: 'attach' } as never, null)!;
    const s = d.core.spend(t, { attach: 's1' })!;
    d.core.deliver(s, ok(d.mintAnswer('s1')));                      // an attach grants B while the renew is still out
    await flush();
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['cur']);
    d.net.mode = 'ok'; d.releaseHeld(); await flush();               // A's renew answers 404 now
    expect(m.state(REF).phase).toBe('held');
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['cur']);
    expect(d.sent.filter((x) => x.op === 'release' || x.op === 'acquire').map((x) => `${x.op}:${x.header}`), 'the stale 404 retires and rotates nothing').toEqual(['acquire:null']);
  });
});

describe('a retired-but-held Cap\'s renew is not the current request when an attach grant has made another Cap current', () => {
  it('its 404 arriving after the grant retires and releases nothing', async () => {
    const h = await open();
    d.unlive(); d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                                // A's renew is sent; the agent's 404 is held
    d.relive(); d.net.mode = 'timeout';
    m.hide(); await flush();                                         // A is retired; its DELETEs go unanswered, so A stays in custody
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['retire']);
    m.show(); await flush();                                         // the acquire waits behind the renew
    d.leases.delete('s1');
    const t = h.mintTicket({ n: 'attach' } as never, null)!;
    const s = d.core.spend(t, { attach: 's1' })!;
    d.core.deliver(s, ok(d.mintAnswer('s1')));                      // an attach grants B: B is current
    await flush();
    const capB = d.leaseOf('s1')!.cap;
    expect(cus.caps(KEY).map((c) => c.role).sort()).toEqual(['cur', 'retire']);
    d.net.mode = 'ok'; d.releaseHeld(); await flush();               // A's renew answers 404 now
    expect(count('release', 's1', capB), 'B is not released by A\'s old 404').toBe(0);
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('a renew in flight when its capability is retired (one outstanding request per record)', () => {
  it('the acquire that rotates the retired capability waits for the renew; its late 404 meets nothing and the replacement is untouched', async () => {
    await open();
    d.unlive(); d.net.mode = 'hold';
    await adv((TTL - SKEW) / 2 + 10);                              // A's renew is sent; the agent's 404 is held
    d.relive(); d.net.mode = 'timeout';
    m.hide(); await flush();                                       // A is retired; its release is not processed, so A stays held
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['retire']);
    d.net.mode = 'ok';
    m.show(); await flush();                                       // the acquire (proof A) is made but waits behind the held renew
    expect(count('acquire')).toBe(1);
    expect(m.state(REF).phase).toBe('acquiring');
    d.releaseHeld(); await flush();                                // A's old renew answers now; then the acquire rotates it: B is cur
    expect(count('acquire')).toBe(2);
    const capB = d.leaseOf('s1')!.cap;
    expect(cus.caps(KEY).map((c) => c.role)).toContain('cur');
    expect(count('release', 's1', capB)).toBe(0);
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('E: a 410 retires the capability it names whatever its role', () => {
  it('a decision answering expired after its capability became a probe sends that capability\'s release', async () => {
    const h = await open();
    const capA = d.leaseOf('s1')!.cap;
    const dec = spendDecision(h, capA);
    d.net.mode = 'hold';
    const t = h.mintTicket({ n: 'attach' } as never, null)!;
    const s = d.core.spend(t, { attach: 's1' })!;
    d.core.deliver(s, ok({ session_id: 's1', approver_lease: { lease: 'CAPZ', generation: 9 } }));
    await flush();
    expect(cus.caps(KEY).map((c) => c.role).sort()).toEqual(['probe', 'probe']);
    d.core.deliver(dec, fail(410, 'approver_lease_expired'));
    await flush();
    expect(count('release', 's1', capA)).toBeGreaterThan(0);
  });
});

describe('F: an unknown acquire after Take over is retried with the backoff', () => {
  it('from failing: no immediate second acquire; one after the backoff', async () => {
    d.net.mode = 'timeout';
    await open();
    await adv(1100); await adv(2100);
    const p = m.takeOver(REF); await flush(); await p;
    const n0 = count('acquire');
    await flush();
    expect(count('acquire')).toBe(n0);
    await adv(5000);
    expect(count('acquire')).toBeGreaterThan(n0);
  });
  it('from elsewhere: a retry is armed', async () => {
    d.leases.set('s1', { cap: 'OTHER', holder: 'x', expires: W + TTL, generation: 9 });
    await open();
    expect(m.state(REF).phase).toBe('elsewhere');
    d.net.mode = 'timeout';
    const p = m.takeOver(REF); await flush(); await p;
    const n0 = count('acquire');
    await adv(5000);
    expect(count('acquire')).toBeGreaterThan(n0);
  });
});

describe('reset leaves no capability for a reopened session', () => {
  it('after reset, reopening the same session does not show held from the old epoch\'s capability', async () => {
    await open();
    m.reset();
    const h2 = m.open(REF, { strict: true });
    expect(m.state(REF).phase).not.toBe('held');
    expect(h2.decide({ n: 'confirm' } as never)).toBeNull();
    await flush();
    expect(count('acquire')).toBe(2);
  });
});
