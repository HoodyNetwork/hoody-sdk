// Vitest: the historical failures of the lease design as named regressions, each
// against the real manager over the fake daemon, which samples the time at a request's ENTRY and may process the request much later.
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
const adv = async (ms: number): Promise<void> => { for (let left = ms; left > 0; left -= 2000) { const s = Math.min(2000, left); T += s; W += s; await vi.advanceTimersByTimeAsync(s); } };
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };
const count = (op: string, header?: string): number => d.sent.filter((x) => x.op === op && (header === undefined || x.header === header)).length;
const open = async (): Promise<ApproverHandle> => { const h = m.open(REF, { strict: true }); await flush(); return h; };
const half = (TTL - SKEW) / 2;

beforeEach(() => {
  vi.useFakeTimers();
  T = 1000; W = 5_000_000;
  d = fakeDaemon(() => W, () => T);
  m = createApproverManager({ api: () => d.api, routes: d.routes, clock: { mono: () => T, wall: () => W }, account: () => 'acct1', holder: 'hub-test', claim: d.core.claim, spy: (c) => { cus = c; } });
});
afterEach(() => { m.reset(); vi.useRealTimers(); });

describe('a renew that samples early and is processed after the lease ended', () => {
  it('the timed-out renew makes the cap stale: no renew after it, one rotation at the lapse, and its late run changes nothing', async () => {
    await open();
    const capA = d.leaseOf('s1')!.cap;
    d.net.mode = 'late';
    await adv(half + 10);                                          // the renew is sent, samples the time and is answered as a timeout
    d.net.mode = 'ok';
    expect(d.lateCount()).toBe(1);
    const renews = count('renew');
    await adv(TTL - SKEW - half - 20);                             // up to the sure end: no renew went after the ghost
    expect(count('renew'), 'no renew after the ghost').toBe(renews);
    await adv(30_000);                                             // the lapse rotated it
    const capG = d.leaseOf('s1')!.cap;
    expect(capG).not.toBe(capA);
    expect(count('acquire')).toBe(2);
    d.processLate();                                               // the old renew runs now, against the rotated record
    await flush();
    expect(d.leaseOf('s1')!.cap).toBe(capG);
    expect(m.state(REF).phase).toBe('held');
    expect(count('release', capG)).toBe(0);
  });
});

describe('a decision answered gate_decision_pending is still running', () => {
  it.each(['gate_pending', 'pending', 'late'] as const)('%s: the cap is stale, no renew follows, the rotation happens, the late run changes nothing', async (how) => {
    const h = await open();
    const capA = d.leaseOf('s1')!.cap;
    await adv(100_000);
    const dec = h.decide({ n: 'confirm' } as never)!;
    d.decideCall(dec.ticket, 's1', how);
    await flush();
    const renews = count('renew');
    await adv(half);
    expect(count('renew'), 'no renew after the unresolved decision').toBe(renews);
    await adv(TTL);
    const capG = d.leaseOf('s1')!.cap;
    expect(capG).not.toBe(capA);
    d.processLate();
    await flush();
    expect(d.leaseOf('s1')!.cap).toBe(capG);
    expect(count('release', capG)).toBe(0);
  });
  it('a decision answered {status:"ok"} closes: renews go on and nothing rotates', async () => {
    const h = await open();
    const dec = h.decide({ n: 'confirm' } as never)!;
    d.decideCall(dec.ticket, 's1', 'ok');
    await flush();
    await adv(TTL * 2);
    expect(count('acquire')).toBe(1);
    expect(count('renew')).toBeGreaterThan(2);
  });
});

describe('a cold restore with an old incarnation\'s acquire still in flight', () => {
  it('B is promoted when A\'s delayed grant arrives; A is removed by its 409; no DELETE ever carries B', async () => {
    const h = await open();                                         // A is cur
    m.hide(); await flush();                                         // A is given back
    d.net.mode = 'hold'; m.show(); await flush();                    // the acquire is processed and its reply is held
    expect(d.heldCount()).toBe(1);
    d.net.mode = 'ok';
    d.coldRestore();                                                 // a new incarnation: no record, generation from 0
    const t = h.mintTicket({ n: 'attach' } as never, null)!;
    const s = d.core.spend(t, { attach: 's1' })!;
    d.core.deliver(s, ok(d.mintAnswer('s1')));                       // B, generation 1
    await flush();
    const capB = d.leaseOf('s1')!.cap;
    d.releaseHeld(); await flush();                                  // the acquire's reply arrives late
    await adv(5000);
    expect(m.state(REF).phase).toBe('held');
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['cur']);
    expect(d.leaseOf('s1')!.cap).toBe(capB);
    expect(count('release', capB)).toBe(0);
  });
});

describe('a renew sampled before the lease ended extends it after a failed DELETE', () => {
  it('a retired cap stays retired with its DELETE retrying; the late extension is never mistaken for a removal', async () => {
    const h = await open();
    const capA = d.leaseOf('s1')!.cap;
    d.net.mode = 'late';
    await adv(half + 10);                                            // a renew samples the time and stays unprocessed
    d.net.mode = 'timeout';
    h.close(); await flush();                                        // A is retired; its DELETE is not processed
    expect(cus.caps(KEY).map((c) => c.role)).toEqual(['retire']);
    await adv(TTL);                                                  // past A's expiry on the daemon: the verifier is still held
    d.net.mode = 'ok';
    expect(d.couldEverVerify(capA), 'a delayed extension could still revive it').toBe(true);
    expect(cus.caps(KEY).length, 'not removed on the strength of the timeouts').toBe(1);
    d.processLate(); await flush();                                  // the renew extends A to sample + TTL
    await adv(120_000);                                              // the DELETE retries and lands
    expect(cus.caps(KEY)).toEqual([]);
    expect(d.couldEverVerify(capA)).toBe(false);
  });
});
