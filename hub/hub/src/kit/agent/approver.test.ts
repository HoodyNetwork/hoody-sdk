// Vitest: the approver lease manager (rows 1-27 of the event x control-state table) against a fake daemon, under the
// stand-in for core's ticket steps and fake timers. The capability is only ever seen as a header in the daemon's `sent` log.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKEW, TTL, type Cap, type Custody } from './approver-custody';
import { createApproverManager, tix, type ApproverHandle, type ApproverManager, type ApproverRef } from './approver';
import { fakeDaemon } from './approver.fakedaemon';
import { fail, ok } from './approver.fakecore';

const REF: ApproverRef = { computer: 'c1', realm: 'r1', sid: 's1' };
const KEY = 'c1|s1';
let T = 0;
let W = 5_000_000;
let d: ReturnType<typeof fakeDaemon>;
let m: ApproverManager;
let acct = 'acct1';

const adv = async (ms: number): Promise<void> => {
  for (let left = ms; left > 0; left -= 2000) { const s = Math.min(2000, left); T += s; W += s; await vi.advanceTimersByTimeAsync(s); }
};
const flush = async (): Promise<void> => { for (let i = 0; i < 6; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };
const sentOps = (): string[] => d.sent.map((s) => s.op);

beforeEach(() => {
  vi.useFakeTimers();
  T = 1000; W = 5_000_000; acct = 'acct1';
  d = fakeDaemon(() => W);
  m = createApproverManager({ api: () => d.api, routes: d.routes, clock: { mono: () => T, wall: () => W }, account: () => acct, holder: 'hub-test', claim: d.core.claim, spy: (c) => { cus = c; } });
});
afterEach(() => { m.reset(); vi.useRealTimers(); });

let cus!: Custody;
const open = async (strict = true, ref = REF): Promise<ApproverHandle> => { const h = m.open(ref, { strict }); await flush(); return h; };

describe('open and close (rows 1, 2)', () => {
  it('a Strict open acquires (no header) and shows held with the lease generation', async () => {
    await open();
    expect(d.sent).toMatchObject([{ op: 'acquire', header: null }]);
    expect(m.state(REF)).toMatchObject({ phase: 'held', generation: 1 });
  });
  it('a non-Strict open sends nothing', async () => {
    await open(false);
    expect(d.sent).toEqual([]);
    expect(m.state(REF).phase).toBe('none');
  });
  it('strict turning on while open acquires; turning off releases', async () => {
    const h = await open(false);
    h.setStrict(true); await flush();
    expect(m.state(REF).phase).toBe('held');
    h.setStrict(false); await flush();
    expect(sentOps()).toEqual(['acquire', 'release']);
    expect(d.leaseOf('s1')).toBeNull();
    expect(m.state(REF).phase).toBe('none');
  });
  it('the last close releases the lease with its own capability and forgets the record', async () => {
    const h = await open();
    const cap = d.leaseOf('s1')!.cap;
    h.close(); await flush();
    expect(d.sent.at(-1)).toMatchObject({ op: 'release', header: cap });
    expect(d.leaseOf('s1')).toBeNull();
    expect(m.state(REF).phase).toBe('none');
  });
  it('two handles share one lease; only the last close releases', async () => {
    const a = await open(); const b = await open();
    expect(sentOps()).toEqual(['acquire']);
    a.close(); await flush();
    expect(sentOps()).toEqual(['acquire']);
    b.close(); await flush();
    expect(sentOps()).toEqual(['acquire', 'release']);
  });
});

describe('renewal and sure life (rows 13, 18, 19)', () => {
  it('renews at half the sure life with the held capability, and stays held', async () => {
    await open();
    const cap = d.leaseOf('s1')!.cap;
    await adv((TTL - SKEW) / 2 + 10);
    expect(d.sent.at(-1)).toMatchObject({ op: 'renew', header: cap });
    expect(m.state(REF).phase).toBe('held');
    await adv(TTL * 3);
    expect(m.state(REF).phase).toBe('held');
    expect(sentOps().filter((o) => o === 'acquire')).toHaveLength(1);
  });
  it('a renew that cannot be proven (timeout) leaves it held while sure, then lapses and rotates once the sure life ends', async () => {
    await open();
    d.net.mode = 'timeout';
    await adv((TTL - SKEW) / 2 + 10);
    expect(m.state(REF).phase).toBe('held');
    d.net.mode = 'ok';
    await adv(TTL);
    expect(sentOps()).toContain('acquire');
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('another holder (rows 10, 5)', () => {
  it('an acquire met by held shows elsewhere and sends nothing more by itself', async () => {
    d.leases.set('s1', { cap: 'OTHER', holder: 'x', expires: W + TTL, generation: 9 });
    await open();
    expect(m.state(REF).phase).toBe('elsewhere');
    await adv(60_000);
    expect(sentOps()).toEqual(['acquire']);
  });
  it('Take over while the other lease lives is refused and stamps refusedAt; after it ends it is held', async () => {
    d.leases.set('s1', { cap: 'OTHER', holder: 'x', expires: W + TTL, generation: 9 });
    await open();
    const p = m.takeOver(REF); await flush();
    expect((await p).phase).toBe('elsewhere');
    expect(m.state(REF).refusedAt).toBeDefined();
    d.leases.clear();
    const q = m.takeOver(REF); await flush();
    expect((await q).phase).toBe('held');
  });
});

describe('failure and backoff (rows 12, 20)', () => {
  it('an unknown acquire answer retries after 1 s, then 2 s, with no capability invented', async () => {
    d.net.mode = 'timeout';
    await open();
    expect(m.state(REF).phase).toBe('failing');
    await adv(1000); expect(sentOps()).toEqual(['acquire', 'acquire']);
    await adv(1999); expect(sentOps()).toHaveLength(2);
    await adv(1); expect(sentOps()).toHaveLength(3);
    d.net.mode = 'ok';
    await adv(5000);
    expect(m.state(REF).phase).toBe('held');
  });
  it('a 404 on the acquire shows gone and waits for a person', async () => {
    d.unlive();
    await open();
    expect(m.state(REF).phase).toBe('gone');
    await adv(60_000);
    expect(sentOps()).toEqual(['acquire']);
  });
});

describe('page hide and show, sleep (rows 3, 4, 23)', () => {
  it('pagehide retires the lease with a keepalive release; pageshow acquires again with the retired proof when it still lives', async () => {
    await open();
    const cap = d.leaseOf('s1')!.cap;
    d.net.mode = 'timeout';
    m.hide(); await flush();
    expect(d.sent.filter((s) => s.op === 'release').some((s) => s.keepalive === true && s.header === cap)).toBe(true);
    d.net.mode = 'ok';
    m.show(); await flush();
    expect(d.sent.at(-1)).toMatchObject({ op: 'acquire', header: cap });
    expect(m.state(REF).phase).toBe('held');
  });
  it('a gap makes the anchor unsure: the display drops to acquiring until one renew answers', async () => {
    await open();
    m.gap();
    expect(m.state(REF).phase).toBe('acquiring');
    await flush();
    expect(sentOps().at(-1)).toBe('renew');
    expect(m.state(REF).phase).toBe('held');
  });
  it('a clock disagreement beyond SKEW seen at the 30 s tick is a gap', async () => {
    await open();
    W += 2 * SKEW; // wall jumps, mono does not
    await vi.advanceTimersByTimeAsync(30_000); T += 30_000; W += 30_000;
    await flush();
    expect(sentOps()).toContain('renew');
  });
  it('a sleep past the lease: the verifying renew gets 410 and one acquire follows with the old capability as proof', async () => {
    await open();
    const cap = d.leaseOf('s1')!.cap;
    W += TTL + 1000; T += 1000; // mono paused
    m.gap(); await flush();
    expect(sentOps().slice(-3)).toEqual(['renew', 'release', 'acquire']);
    expect(d.sent.at(-3)).toMatchObject({ header: cap });
    expect(d.sent.at(-1)).toMatchObject({ header: cap });
    expect(m.state(REF).phase).toBe('held');
  });
});

describe('probes', () => {
  it('two grants at once are both probed; the one the agent does not know is removed by its 409, the other promoted', async () => {
    d.net.mode = 'hold'; // the acquire is processed by the agent but its reply is held
    const h = m.open(REF, { strict: true });
    await flush();
    d.net.mode = 'ok';
    // meanwhile an attach answer of the same session hands over another capability
    const t = h.mintTicket({ n: 'attach' } as never, null)!;
    const s = d.core.spend(t, { attach: 's1' })!;
    d.core.deliver(s, ok({ session_id: 's1', approver_lease: { lease: 'CAPM', generation: 2 } }));
    await flush();
    d.releaseHeld(); await flush(); await flush();
    expect(m.state(REF).phase).toBe('held');
    expect(d.sent.filter((x) => x.op === 'renew').map((x) => x.header)).toContain('CAPM');
    expect(d.sent.filter((x) => x.op === 'renew').map((x) => x.header)).toContain('CAP1');
    d.sent.length = 0;
    await adv((TTL - SKEW) / 2 + 10);
    expect(d.sent.at(-1)).toMatchObject({ op: 'renew', header: 'CAP1' });
  });
});

describe('epoch', () => {
  it('a new epoch in a read triggers a verifying renew, never a removal', async () => {
    await open();
    d.restart();
    const before = sentOps().length;
    m.noteEpoch(REF, 'e-new', m.stamp()); await flush();
    expect(sentOps().length).toBeGreaterThan(before);
  });
});

describe('account change and reset (rows 26, 27)', () => {
  it('abandons the old account\'s capabilities with no request; old handles are inert', async () => {
    const h = await open();
    const n = d.sent.length;
    acct = 'acct2'; m.accountChanged(); await flush();
    expect(d.sent).toHaveLength(n);
    expect(m.state(REF).phase).toBe('none');
    expect(h.mintTicket({} as never, null)).toBeNull();
    expect(h.decide({} as never)).toBeNull();
  });
  it('reset makes the old epoch inert: no late timer sends anything', async () => {
    await open();
    m.reset();
    const n = d.sent.length;
    await adv(TTL * 2);
    expect(d.sent).toHaveLength(n);
  });
});

describe('decisions', () => {
  it('decide() gives a ticket and lease_generation only while displayed held; its header is the cur', async () => {
    const h = await open();
    const cap = d.leaseOf('s1')!.cap;
    const dec = h.decide({ n: 'confirm' } as never)!;
    expect(dec.lease_generation).toBe(1);
    expect(d.core.spend(dec.ticket)?.header).toBe(cap);
    m.gap();
    expect(h.decide({ n: 'confirm' } as never)).toBeNull();
  });
  it('a decision refused invalid removes the capability and the chat looks again', async () => {
    const h = await open();
    const dec = h.decide({ n: 'confirm' } as never)!;
    d.leases.get('s1')!.cap = 'ROTATED';
    d.core.send(dec.ticket, fail(409, 'approver_lease_invalid')); await flush();
    expect(sentOps().filter((o) => o === 'acquire').length).toBeGreaterThanOrEqual(2);
  });
  it('tix drops absent tickets', async () => {
    const h = await open();
    const dec = h.decide({ n: 'confirm' } as never)!;
    expect(tix(null, dec.ticket, undefined)).toEqual([dec.ticket]);
    expect(tix(null)).toEqual([]);
  });
});

describe('minting from a create or attach answer', () => {
  it('a sid-less handle mints a create ticket, the answer binds it and puts the capability into custody', async () => {
    const h = m.open({ computer: 'c1', realm: 'r1', sid: null }, { strict: true });
    const t = h.mintTicket({ n: 'create' } as never, 'k1')!;
    expect(t).not.toBeNull();
    const s = d.core.spend(t, {})!;
    d.core.deliver(s, ok({ session_id: 's7', approver_lease: { lease: 'CAPNEW', generation: 4 }, started: { approver_lease: { token: 'CAPNEW' } } }));
    await flush();
    expect(h.sid).toBe('s7');
    expect(m.state({ computer: 'c1', realm: 'r1', sid: 's7' })).toMatchObject({ phase: expect.stringMatching(/held|acquiring/) });
  });
  it('a create body that names attach is refused by the guard, unsent', async () => {
    const h = m.open({ computer: 'c1', realm: 'r1', sid: null }, { strict: true });
    expect(d.core.spend(h.mintTicket({ n: 'create' } as never, 'k1')!, { attach: 's9' })).toBeNull();
  });
  it('a closed handle mints nothing', async () => {
    const h = m.open({ computer: 'c1', realm: 'r1', sid: null }, { strict: true });
    h.close();
    expect(h.mintTicket({} as never, null)).toBeNull();
  });
});

describe('no capability anywhere visible', () => {
  it('states, subscriber payloads and handle fields never contain a capability', async () => {
    const seen: string[] = [];
    m.subscribe((k, s) => seen.push(JSON.stringify([k, s])));
    const h = await open();
    const cap = d.leaseOf('s1')!.cap;
    await adv(TTL);
    const all = [...seen, JSON.stringify(m.state(REF)), JSON.stringify({ sid: h.sid })].join('|');
    expect(all).not.toContain(cap);
    expect(all).not.toMatch(/CAP\d/);
  });
});

describe('named scenarios beyond the table basics', () => {
  it('a renew answered 400 (not a ghost) is retried with backoff while the life is sure, and the display stays held', async () => {
    await open();
    const cap = d.leaseOf('s1')!.cap;
    d.net.mode = 'bad';
    await adv((TTL - SKEW) / 2 + 10);
    const first = d.sent.filter((x) => x.op === 'renew').length;
    expect(first).toBe(1);
    await adv(1500);
    expect(d.sent.filter((x) => x.op === 'renew' && x.header === cap).length).toBe(2);
    expect(m.state(REF).phase).toBe('held');
  });
  it('a renew that does not answer is a ghost: the cap is stale, never renewed again, and rotated when its sure life ends', async () => {
    await open();
    const cap = d.leaseOf('s1')!.cap;
    d.net.mode = 'timeout';
    await adv((TTL - SKEW) / 2 + 10);
    d.net.mode = 'ok';
    await adv(3000);
    expect(d.sent.filter((x) => x.op === 'renew' && x.header === cap)).toHaveLength(1);
    expect(m.state(REF).phase).toBe('held');
    await adv(TTL / 2);
    expect(d.sent.some((x) => x.op === 'acquire' && x.header === cap)).toBe(true);
    expect(d.leaseOf('s1')!.cap).not.toBe(cap);
  });
  it('renews are spaced at half the sure life: about six in three lease lives, never a tight loop', async () => {
    await open();
    await adv(TTL * 3);
    const n = d.sent.filter((x) => x.op === 'renew').length;
    expect(n).toBeGreaterThanOrEqual(5);
    expect(n).toBeLessThanOrEqual(8);
  });
  it('a rotation (the lapse of a stale cur) releases the old capability and never renews it afterwards', async () => {
    const h = await open();
    const old = d.leaseOf('s1')!.cap;
    const dec = h.decide({ n: 'confirm' } as never)!;
    d.net.mode = 'timeout';
    d.core.spend(dec.ticket); // sent, never answered: a ghost makes the cap stale
    d.core.deliver({ header: old, ticket: dec.ticket }, { ok: false, err: { kind: 'failed', code: 'timeout', status: 0, retryAfter: null, details: {} } });
    d.net.mode = 'ok';
    await flush();
    const renewsBefore = d.sent.filter((x) => x.op === 'renew' && x.header === old).length;
    m.gap(); await flush(); // unsure and stale: lapse at once, one acquire with the cap as proof
    expect(d.sent.filter((x) => x.op === 'renew' && x.header === old).length).toBe(renewsBefore);
    const acq = d.sent.find((x, i) => x.op === 'acquire' && i > 0);
    expect(acq?.header).toBe(old);
    expect(d.sent.some((x) => x.op === 'release' && x.header === old)).toBe(true);
    expect(d.leaseOf('s1')!.cap).not.toBe(old);
    expect(m.state(REF).phase).toBe('held');
  });
  it('a grant that arrives when nobody wants it is given back at once', async () => {
    d.net.mode = 'hold';
    const h = m.open(REF, { strict: true }); await flush();
    d.net.mode = 'ok';
    h.close(); await flush();
    d.releaseHeld(); await flush(); await flush();
    expect(d.sent.at(-1)).toMatchObject({ op: 'release' });
    expect(d.leaseOf('s1')).toBeNull();
    expect(cus.caps(KEY)).toHaveLength(0);
  });
  it('an acquire answered 404 while a lapsed cur is in custody retires it and shows gone', async () => {
    await open();
    const cap = d.leaseOf('s1')!.cap;
    d.net.mode = 'timeout';
    await adv((TTL - SKEW) / 2 + 10); // the renew is a ghost: the cap is stale
    d.net.mode = 'ok';
    d.unlive();
    m.gap(); await flush(); // stale and unsure: lapse, then the automatic acquire meets 404
    expect(d.sent.some((x) => x.op === 'acquire' && x.header === cap)).toBe(true);
    expect(m.state(REF).phase).toBe('gone');
    expect(cus.caps(KEY).length).toBeGreaterThan(0);
    expect(cus.caps(KEY).every((c) => c.role === 'retire')).toBe(true);
  });
  it('a renew answered 404 retires the capability, shows gone, and the release is retried until the session is back', async () => {
    await open();
    d.unlive();
    await adv((TTL - SKEW) / 2 + 10);
    expect(m.state(REF).phase).toBe('gone');
    expect(d.sent.some((x) => x.op === 'release')).toBe(true);
    expect(cus.caps(KEY)).toHaveLength(1);
    d.relive();
    await adv(10_000);
    expect(cus.caps(KEY)).toHaveLength(0);
    expect(m.state(REF).phase).toBe('gone');
  });
  it('pagehide sends a keepalive release even for a capability whose earlier release is still being retried', async () => {
    const h = await open();
    const cap = d.leaseOf('s1')!.cap;
    d.net.mode = 'timeout';
    h.close(); await flush();
    expect(d.sent.filter((x) => x.op === 'release')).toHaveLength(1);
    d.sent.length = 0;
    m.hide(); await flush();
    expect(d.sent.filter((x) => x.op === 'release' && x.keepalive === true && x.header === cap).length).toBeGreaterThanOrEqual(1);
  });
  it('a restore with no pagehide (a gap) makes a live capability unsure and verifies it', async () => {
    await open();
    d.sent.length = 0;
    m.show(); await flush();
    expect(m.state(REF).phase).toBe('held');
    expect(d.sent.map((x) => x.op)).toEqual(['renew']);
  });
  it('Take over while the lease is held does nothing', async () => {
    await open();
    d.sent.length = 0;
    const s = await m.takeOver(REF);
    expect(s.phase).toBe('held');
    expect(d.sent).toEqual([]);
  });
  it('after an account change a new open for the new account acquires normally', async () => {
    await open();
    acct = 'acct2'; m.accountChanged(); await flush();
    expect(cus.keys()).toEqual([]);
    d.sent.length = 0;
    await open();
    expect(sentOpsOnly()).toEqual(['acquire']);
  });
});
const sentOpsOnly = (): string[] => d.sent.map((x) => x.op);
void (undefined as unknown as Cap);
