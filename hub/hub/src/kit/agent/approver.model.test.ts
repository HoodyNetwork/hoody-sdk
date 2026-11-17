// Vitest: the adversarial model test. Seeded random runs of the whole manager against
// the fake daemon: restarts, cold restores, a 404 window, lost and held replies, requests processed LATER with their entry-time sample
// (a renew or a decision answered as a timeout), real decisions that touch the lease, create and attach mints (some naming another
// session), sleeps with mono paused, wall steps, the R7 move, hide/show, Take over, account change. The safety properties S1-S9 are
// checked after every step and the waits (W1 to W3) at quiescence. Ground truth comes from the fake daemon (`couldEverVerify`: the
// verifier it still holds, and every request that sampled the time while the lease lived and has yet to be processed).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKEW, TTL, type Cap, type Custody } from './approver-custody';
import { createApproverManager, type ApproverHandle, type ApproverManager, type ApproverRef } from './approver';
import { fakeDaemon, type DecideHow } from './approver.fakedaemon';
import { ok, type Spent } from './approver.fakecore';

const SEEDS = Number(process.env.APPROVER_SEEDS ?? 2000);
const STEPS = 40;
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const REF: ApproverRef = { computer: 'c1', realm: 'r1', sid: 's1' };
/** The retry waits, written out here so a changed backoff cannot move the oracle with it. */
const STEPS_MS = [1000, 2000, 5000, 10_000, 30_000];
const PURE = new Set(['adv', 'held', 'late', 'slow', 'net', 'auto']);   // steps with no person action, demand edge, epoch change or other holder
let live: ApproverManager | null = null;
afterEach(() => { live?.reset(); live = null; vi.useRealTimers(); });

async function seedRun(seed: number): Promise<void> {
  vi.useFakeTimers();
  const r = rng(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const calm = seed % 2 === 0;
  let T = 1000, W = 5_000_000, D = 5_000_000, acct = 'acct1', lost = false, sawGone = false, r7 = false, mints = 0, acctSent = -1;
  const d = fakeDaemon(() => D, () => Date.now(), () => pick([30_000, 120_000, 400_000, 700_000, 1_500_000]));   // `at` is the timers' own clock, so the spacing of two requests is exact
  let cus!: Custody;
  const seen: string[] = [];
  const trace: string[] = [];
  const m = createApproverManager({ api: () => d.api, routes: d.routes, clock: { mono: () => T, wall: () => W }, account: () => acct, holder: 'hub-m', claim: d.core.claim, spy: (c) => { cus = c; } });
  live = m;
  m.subscribe((k, s) => seen.push(JSON.stringify([k, s])));
  const handles: ApproverHandle[] = [];
  const mintQ: Array<{ s: Spent; answer: unknown; sid: string }> = [];
  const heldSids = new Set<string>();   // sessions whose create/attach answer said the lease is held elsewhere
  const abandonedCaps = new Set<Cap>();   // the Caps an account change took without proof: only their removal is exempt from S4/W2
  const expired = new Map<string, number>();   // leases the 'expire' step ended at the daemon -> the expiry it gave them: no display can know it, so S5 skips them until a later extension revives the lease
  const edgeMarks: number[] = [];   // d.sent.length at each step with a person action, demand edge, epoch change or other holder
  const grantMarks: number[] = [];   // d.sent.length when a mint's grant was delivered (a sure grant resets `fails`)
  // header -> Cap object, learned when a ticket is spent (the only place a value meets a Cap); the role it had when it was spent
  const known = new Map<Cap, string>();
  const spends: Array<{ op: string; role: string | undefined }> = [];
  const spend = d.core.spend.bind(d.core);
  d.core.spend = (t, body) => {
    const s = spend(t, body);
    if (s && s.header) {
      const a = cus.attemptOf(t);
      const c = a?.op === 'acquire' ? a.proof : a?.cap;
      if (c) known.set(c, s.header);
      if (a) spends.push({ op: a.op, role: c?.role });
    }
    return s;
  };
  const flush = async (): Promise<void> => { for (let i = 0; i < 8; i++) await Promise.resolve(); await vi.advanceTimersByTimeAsync(0); };
  // S5: displayed held => the capability's real expiry (the daemon's live record, kept current by every renew, decision and expiry) is after the real now. Both
  // sessions, sampled after every 10 s (calm seeds 20 s) of timers, not only between steps: a shortened lease is wrong from the moment the
  // display outlives it. A held display with an open handle must also offer a decision ticket (held without a ticket is a mismatch).
  const s5 = (where: string): void => {
    if (lost || r7) return;
    for (const sid of ['s1', 's2']) {
      const h = handles.find((x) => x.sid === sid);
      if (!h || m.state({ ...REF, sid }).phase !== 'held') continue;
      const dec = h.decide({ n: 'confirm' } as never);
      // asking for a ticket reads the clocks (a gap the tick has not yet seen is found now): held with no ticket must then not still be held
      if (!dec) { expect(m.state({ ...REF, sid }).phase, `S5 held without a decision ticket (seed ${seed}, ${where}, ${sid})`).not.toBe('held'); continue; }
      const hd = d.decideCall(dec.ticket, sid, 'notSent');
      const rec = d.leaseOf(sid);
      if (hd && expired.get(hd) === d.expiryOf(hd)) continue;
      expect(d.expiryOf(hd ?? '') > D, `S5 held but the capability's real expiry has passed (seed ${seed}, ${where}, ${sid}) hd=${hd} rec=${JSON.stringify(rec)} exp=${d.expiryOf(hd ?? '')} D=${D} trace=${trace.slice(-10).join(' ')} log=${d.log.slice(-8).join(' ')}`).toBe(true);
    }
  };
  const chunk = calm ? 20_000 : 10_000;
  const adv = async (ms: number): Promise<void> => { for (let left = ms; left > 0; left -= chunk) { const s = Math.min(chunk, left); T += s; W += s; D += s; await vi.advanceTimersByTimeAsync(s); d.runDue(); s5('adv'); } await flush(); };
  const deliverMint = (): void => {
    const q = mintQ.shift();
    if (!q) return;
    if (JSON.stringify(q.answer).includes('approver_lease"')) grantMarks.push(d.sent.length);
    if (JSON.stringify(q.answer).includes('approver_lease_held')) heldSids.add(q.sid);
    d.core.deliver(q.s, ok(q.answer));
    expect(JSON.stringify(q.answer), `S3 a delivered answer still holds a capability (seed ${seed})`).not.toMatch(/CAP\d/);
  };
  const mint = (h: ApproverHandle, kind: 'create' | 'attach'): void => {
    const t = h.mintTicket({ n: kind } as never, kind === 'create' ? `k${++mints}` : null);
    if (!t) return;
    const s = d.core.spend(t, kind === 'create' ? {} : { attach: h.sid });
    if (!s) return;
    const named = r() < 0.2 ? 's2' : (h.sid ?? 's1');
    mintQ.push({ s, answer: d.mintAnswer(named), sid: named });
    if (r() < 0.6) deliverMint();
  };

  const step = async (): Promise<void> => {
    // Even seeds are calm (no restart, hide, sleep or wall step): long stretches of renews and decisions with delayed requests, which is where
    // an extending request processed much later matters. Odd seeds draw every step.
    const which = calm ? pick(['open', 'adv', 'adv', 'adv', 'adv', 'decide', 'decide', 'decide', 'decide', 'late', 'slow', 'net', 'epoch', 'attach', 'mint', 'take'] as const) : pick(['open', 'open', 'close', 'strict', 'hide', 'show', 'take', 'adv', 'adv', 'adv', 'sleep', 'r7', 'wall', 'restart', 'cold', 'expire', 'gone', 'net', 'net', 'held', 'late', 'slow', 'decide', 'decide', 'epoch', 'acct', 'gap', 'create', 'attach', 'mint'] as const);
    d.ctx.tag = which;
    if (!PURE.has(which)) edgeMarks.push(d.sent.length);
    trace.push(which + ':' + d.sent.length + '@' + Date.now());
    switch (which) {
      case 'open': handles.push(m.open(REF, { strict: r() < 0.8 })); acctSent = -1; break;
      case 'close': { const h = handles.shift(); h?.close(); break; }
      case 'strict': pick(handles)?.setStrict(r() < 0.6); break;
      case 'hide': m.hide(); break;
      case 'show': m.show(); break;
      case 'take': void m.takeOver(REF); break;
      case 'adv': await adv(pick(calm ? [30_000, 120_000, 400_000, 800_000] : [1000, 5000, 30_000, 120_000, 400_000])); break;
      case 'sleep': { const x = pick([20_000, TTL / 2, TTL + 5000]); W += x; D += x; T += 10; m.gap(); break; }
      case 'r7': { const x = pick([3000, 20_000]); D += x; T += 10; r7 = true; break; }
      case 'wall': W += pick([-2 * SKEW, SKEW + 1, 2 * SKEW]); break;
      case 'restart': d.restart(); break;
      case 'cold': d.coldRestore(); break;
      case 'expire': for (const id of ['s1', 's2']) { const l = d.leaseOf(id); if (l) expired.set(l.cap, D - 1); } d.expireAll(); break;
      case 'gone': if (r() < 0.5) { d.unlive(); sawGone = true; } else d.relive(); break;
      case 'net': { const mode = pick(['ok', 'ok', 'timeout', 'lost', 'hold', 'late', 'late'] as const); if (mode === 'lost') lost = true; d.net.mode = mode; if (mode !== 'hold') d.releaseHeld(); break; }
      case 'held': d.releaseHeld(); break;
      case 'late': d.processLate(Math.floor(r() * Math.max(1, d.lateCount()))); break;
      case 'slow': d.processSlow(Math.floor(r() * Math.max(1, d.slowCount()))); break;
      case 'decide': {
        const h = pick(handles);
        const dec = h?.decide({ n: 'confirm' } as never);
        if (dec && h?.sid) d.decideCall(dec.ticket, h.sid, pick(['ok', 'ok', 'pending', 'pending', 'gate_pending', 'gate_pending', 'late', 'slow', 'slow', 'timeout', 'notSent'] as DecideHow[]));
        break;
      }
      case 'epoch': m.noteEpoch(REF, d.info().epoch, m.stamp()); break;
      case 'acct': if (r() < 0.15) { for (const c of known.keys()) if (cus.held(c)) abandonedCaps.add(c); acct = acct === 'acct1' ? 'acct2' : 'acct1'; m.accountChanged(); d.forgetInflight(); grantMarks.push(d.sent.length); handles.length = 0; mintQ.length = 0; acctSent = d.sent.length; } break;
      case 'gap': m.gap(); break;
      case 'create': { const h = m.open({ computer: 'c1', realm: 'r1', sid: null }, { strict: r() < 0.7 }); handles.push(h); acctSent = -1; mint(h, 'create'); break; }
      case 'attach': { const h = pick(handles.filter((x) => x.sid !== null)); if (h) mint(h, 'attach'); break; }
      case 'mint': deliverMint(); break;
    }
    d.ctx.tag = 'auto';   // whatever the step's own call did synchronously was a person action or an edge; what follows it is automatic
    await flush();
  };

  const checked = new Set<Cap>();
  let spendsSeen = 0;
  const safety = (): void => {
    // S1: renew, release and decision are sent only with a header; S2: the Cap's role when its ticket was spent permitted that route
    for (const s of d.sent) { if (s.op !== 'acquire') expect(s.header, `S1 ${s.op} without header (seed ${seed})`).not.toBeNull(); }
    for (; spendsSeen < spends.length; spendsSeen++) {
      const x = spends[spendsSeen]!;
      const allowed = x.op === 'patch' ? ['cur', 'probe'] : x.op === 'release' ? ['retire'] : x.op === 'decide' ? ['cur'] : ['cur', 'retire'];
      expect(allowed, `S2 ${x.op} spent on a ${x.role} Cap (seed ${seed})`).toContain(x.role);
    }
    // S3: no capability string in any state or subscriber payload
    expect([...seen, JSON.stringify(m.state(REF))].join('|'), `S3 (seed ${seed})`).not.toMatch(/CAP\d/);
    // S4: every capability that left custody is dead in ground truth, delayed requests included (an account change abandons without proof)
    for (const [c, v] of known) if (!cus.held(c) && !checked.has(c)) { checked.add(c); if (!abandonedCaps.has(c)) expect(d.couldEverVerify(v), `S4 removed ${v} could still verify (seed ${seed})`).toBe(false); }
    // S6: at most one cur, never cur and probes together
    for (const key of ['c1|s1', 'c1|s2']) {
      const cs = cus.caps(key);
      expect(cs.filter((c) => c.role === 'cur').length, `S6 (seed ${seed})`).toBeLessThanOrEqual(1);
      if (cs.some((c) => c.role === 'cur')) expect(cs.some((c) => c.role === 'probe'), `S6b (seed ${seed})`).toBe(false);
    }
    // S7: at most one acquire in flight per record, and at most one acquire or renew (client side: sent and not yet settled)
    expect(d.stats.maxOut, `S7b (seed ${seed}) ${trace.slice(-12).join(' ')}`).toBeLessThanOrEqual(1);
    expect(d.stats.maxAcqInflight, `S7 (seed ${seed}) ${trace.slice(-12).join(' ')} ${d.log.slice(-8).join(' ')} ACQ ${d.sent.filter((x) => x.op === 'acquire').map((x) => x.tag + '@' + x.at + ':' + x.res + ':' + x.header).join(' ')}`).toBeLessThanOrEqual(1);
    // S8: with no person action, demand edge, epoch change or other holder, an automatic acquire after one whose outcome is unknown waits its
    // backoff, and the wait grows with each unknown outcome in a row (1 s, 2 s, 5 s, 10 s, then 30 s); an edge or a grant starts the count again
    for (const sid of ['s1', 's2']) {
      const acqs = d.sent.filter((x) => x.op === 'acquire' && x.id === sid);
      const idx = (i: number): number => d.sent.indexOf(acqs[i]!);
      const marked = (marks: number[], i: number): boolean => marks.some((g) => g > idx(i - 1) && g <= idx(i));
      let k = 0;
      for (let i = 1; i < acqs.length; i++) {
        const link = PURE.has(acqs[i]!.tag) && ['unprocessed', 'late', 'lost'].includes(acqs[i - 1]!.res) && !marked(grantMarks, i);
        k = !link ? 0 : marked(edgeMarks, i) || k === 0 ? 1 : k + 1;
        const gap = acqs[i]!.at - acqs[i - 1]!.at;
        if (link) expect(gap, `S8 ${sid} acquire ${i} (${acqs[i]!.tag}) came ${gap} ms after one that answered ${acqs[i - 1]!.res}, link ${k} (seed ${seed}) ${trace.slice(-12).join(' ')} ALL ${d.sent.map((x) => x.op + ':' + x.tag + ':' + x.res + ':' + x.header).join(' ')}`).toBeGreaterThanOrEqual(STEPS_MS[Math.min(k, STEPS_MS.length) - 1]! - 1);
      }
    }
    // S9: after an account change nothing of the old account is held or sent
    if (acctSent >= 0) { expect(d.sent.length, `S9 a request after the account change (seed ${seed})`).toBe(acctSent); expect(cus.caps('c1|s1').length, `S9 custody (seed ${seed})`).toBe(0); }
  };
  for (let i = 0; i < STEPS; i++) {
    await step();
    safety();
    s5(`step ${i}`);
  }
  // quiescence: heal the network and the clocks, deliver and process everything, run 2 x TTL of timers
  d.ctx.tag = 'quiesce';
  d.net.mode = 'ok'; d.releaseHeld(); d.relive(); m.show(); await flush();
  while (mintQ.length) deliverMint();
  while (d.processLate() || d.processSlow()) await flush();
  await adv(2 * TTL);
  await adv(60_000);
  safety();
  const dump = (sid: string): string => JSON.stringify({ sid, phase: m.state({ ...REF, sid }).phase, caps: cus.caps('c1|' + sid).map((c) => ({ role: c.role, lapsed: c.lapsed, stale: c.stale, patch: !!c.patch, del: !!c.del, dels: c.dels, tries: c.tries, v: known.get(c) })), daemon: d.leaseOf(sid), handles: handles.length, tail: d.sent.slice(-8).map((x) => x.op + ':' + x.header + ':' + x.res), trace: trace.slice(-14).join(' '), log: d.log.slice(-10) });
  for (const sid of ['s1', 's2']) {
    const st = m.state({ ...REF, sid });
    const wanted = handles.some((x) => (x as unknown as { _strict: boolean })._strict && x.sid === sid);
    if (!lost) {
      if (wanted) {
        // W1: want => held, or a justified wait (E after an acquire answered held, G after a 404)
        expect(['held', 'gone', 'elsewhere'], `W1 phase ${st.phase} (seed ${seed}) ${dump(sid)}`).toContain(st.phase);
        if (st.phase === 'gone') expect(sawGone, `W1 gone without a 404 (seed ${seed})`).toBe(true);
        if (st.phase === 'elsewhere') expect(heldSids.has(sid) || d.sent.some((x) => x.op === 'acquire' && x.id === sid && x.res === '409'), `W1 elsewhere without a held answer for ${sid} (seed ${seed})`).toBe(true);
      } else {
        // W2: no want => the daemon holds no live lease whose capability was ever in custody
        const l = d.leaseOf(sid);
        expect(l === null || ![...known].some(([c, v]) => v === l.cap && !abandonedCaps.has(c)), `W2 (seed ${seed}) ${dump(sid)}`).toBe(true);
      }
    }
    // W3: custody holds at most the cur
    expect(cus.caps('c1|' + sid).map((c) => c.role).filter((x) => x !== 'cur'), `W3 (seed ${seed}) ${dump(sid)}`).toEqual([]);
    expect(cus.caps('c1|' + sid).length, `W3 (seed ${seed}) ${dump(sid)}`).toBeLessThanOrEqual(1);
  }
  m.reset();
}

describe('the model test', () => {
  it(`${SEEDS} seeded runs keep every safety property and reach a justified wait`, async () => {
    for (let seed = Number(process.env.APPROVER_SEED ?? 1); seed <= (process.env.APPROVER_SEED ? Number(process.env.APPROVER_SEED) : SEEDS); seed++) {
      try { await seedRun(seed); } catch (e) { throw new Error(`seed ${seed}: ${(e as Error).message}`); } finally { live?.reset(); vi.useRealTimers(); }
    }
  }, 600_000);
});
