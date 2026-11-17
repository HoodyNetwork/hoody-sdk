// The approver lease of a Strict chat: one record per (computer, session), driven by
// the 27 rows of the event x control-state table. The capability itself is in approver-custody.ts and never leaves it except as
// a lease ticket's header; nothing here (state, subscribers, timers, logs) holds it. Removal needs a proof (custody); time,
// order, epochs and reads only probe, renew, verify or look again. Shapes: approver-types.ts; record shapes: approver-rec.ts; the settle
// rows: approver-settle.ts; timers: approver-timing.ts; words and the holder id: approver-words.ts; the page's one manager: approver-live.ts.
import type { Ticket } from '@core';
import { agent } from '@core';
import type { providers } from '@core';
import { SKEW, TTL, createCustody, sureNow, type Attempt, type Cap, type Class, type Clock, type Custody } from './approver-custody';
import { TICK_MS, backoff, later, stop, type T } from './approver-timing';
import { tabHolder } from './approver-words';
import type { Ctl, Handle, Rec, Tm } from './approver-rec';
import { createQueue } from './approver-queue';
import { createSettlers } from './approver-settle';
import type { ApproverDeps, ApproverManager, ApproverPhase, ApproverRef, ApproverRoutes, ApproverState } from './approver-types';

export * from './approver-types';
export * from './approver-words';
type Settled<T> = providers.Settled<T>;

export function createApproverManager(deps: ApproverDeps): ApproverManager {
  const clock: Clock = deps.clock ?? { mono: () => performance.now(), wall: () => Date.now() };
  const account = deps.account ?? ((): string => 'acct');
  const holder = deps.holder ?? tabHolder();
  let mgr = 1, acctEpoch = 0, gapGen = 0, hidden = false, shown = account();
  let ref0 = { m: clock.mono(), w: clock.wall() };
  let tick: T | null = null;
  const recs = new Map<string, Rec>();
  const subs = new Set<(key: string, s: ApproverState) => void>();
  const tms = new WeakMap<Cap, Tm>();
  const handleOf = new WeakMap<Attempt, Handle>();
  const waiters = new WeakMap<Attempt, Array<() => void>>();

  const cus: Custody = createCustody({
    clock, gapGen: () => gapGen, account: () => shown, acctEpoch: () => acctEpoch, mgr: () => mgr,
    onAnswer: (a, raw) => onAnswer(a, raw), onSettled: (a, r, cls, removed) => onSettled(a, r, cls, removed), ...(deps.claim ? { claim: deps.claim } : {}),
  });
  deps.spy?.(cus);
  const tm = (c: Cap): Tm => { let t = tms.get(c); if (!t) { t = { renewAt: null, lapse: null, probeRetry: null, delRetry: null }; tms.set(c, t); } return t; };
  const sureOf = (c: Cap): boolean => sureNow(c, clock, gapGen);
  const want = (r: Rec): boolean => !hidden && [...r.hs].some((h) => h._strict);
  const caps = (r: Rec): readonly Cap[] => cus.caps(r.key);
  const live = (r: Rec): Cap[] => caps(r).filter((c) => c.role !== 'retire');
  const cur = (r: Rec): Cap | null => caps(r).find((c) => c.role === 'cur') ?? null;
  const probes = (r: Rec): Cap[] => caps(r).filter((c) => c.role === 'probe');
  const alive = (r: Rec): boolean => recs.get(r.key) === r;
  const ctl = (r: Rec, ghost: Cap | null = null): Ctl => {
    if (r.acq) return 'Q';
    const cs = ghost ? [...caps(r), ghost] : caps(r);
    if (cs.some((c) => c.role === 'probe')) return 'P';
    const c = cs.find((x) => x.role === 'cur');
    if (c) return c.lapsed ? 'X' : 'H';
    return r.why === 'elsewhere' ? 'E' : r.why === 'failing' ? 'F' : r.why === 'gone' ? 'G' : 'N';
  };

  // ---- state and subscribers ----
  function stateOf(r: Rec): ApproverState {
    const c = cur(r);
    let phase: ApproverPhase;
    if (c && !c.lapsed && sureOf(c)) phase = 'held';
    else if (r.acq || probes(r).length > 0 || (c && !c.lapsed)) phase = 'acquiring';
    else if (c) phase = 'expired';
    else phase = r.why;
    const s: ApproverState = { phase };
    if (phase === 'held' && c) {
      if (c.generation !== null) s.generation = c.generation;
      if (c.at) s.expiresAt = c.at.w + TTL - SKEW;
    }
    if (r.refusedAt !== undefined && (phase === 'elsewhere' || phase === 'acquiring')) s.refusedAt = r.refusedAt;
    return s;
  }
  function emit(r: Rec): void {
    if (!alive(r)) return;
    const s = stateOf(r), j = JSON.stringify(s);
    if (j === r.last) return;
    r.last = j;
    for (const f of [...subs]) f(r.key, s);
  }
  function forgetIfIdle(r: Rec): void {
    if (r.hs.size > 0 || caps(r).length > 0 || r.acq || r.retry || r.out) return;
    recs.delete(r.key);
  }
  function post(r: Rec): void { if (!alive(r)) return; resolveProbes(r); rec(r); forgetIfIdle(r); emit(r); syncTick(); }
  function recOf(ref: ApproverRef, sid: string | null = ref.sid): Rec | null {
    if (sid === null) return null;
    const key = `${ref.computer}|${sid}`;
    let r = recs.get(key);
    if (!r) {
      r = { key, ref: { ...ref, sid }, hs: new Set(), why: 'none', fails: 0, out: null, q: [], acq: null, retry: null, newest: 0, lastEpoch: null, lastEpochSeq: 0, last: '' };
      recs.set(key, r);
    }
    return r;
  }

  // ---- requests ----
  const bind = (r: Rec): { container: string; sid: string; idem: null } => ({ container: r.ref.computer, sid: r.ref.sid!, idem: null });
  function settleLate(a: Attempt, res: Settled<unknown>): void { cus.settleUnsent(a, res); }
  const NOT_SENT: Settled<unknown> = { ok: false, err: { kind: 'not_sent', code: 'not_sent', status: 0, retryAfter: null, details: {} } };
  function fire(r: Rec, a: Attempt, route: ApproverRoutes[keyof ApproverRoutes], call: (t: Ticket) => Promise<Settled<unknown>>): void {
    const t = cus.ticket(a, { route, ...bind(r) });
    void call(t).then((res) => settleLate(a, res), () => settleLate(a, NOT_SENT));
  }
  const sendAcquire = (r: Rec, a: Attempt): void => fire(r, a, deps.routes.acquire, (t) => deps.api(r.ref).acquire(r.ref.sid!, r.ref.realm, holder, t));
  const sendRenew = (r: Rec, a: Attempt): void => fire(r, a, deps.routes.renew, (t) => deps.api(r.ref).renew(r.ref.sid!, r.ref.realm, t));
  const sendRelease = (r: Rec, a: Attempt, keepalive: boolean): void => fire(r, a, deps.routes.release, (t) => deps.api(r.ref).release(r.ref.sid!, r.ref.realm, t, keepalive));

  // ---- actions ----
  function ACQ(r: Rec, explicit = false): void {
    if (!want(r)) return;
    if (r.acq) { if (explicit) r.acq.explicit = true; return; }
    const retired = caps(r).filter((c) => c.role === 'retire').sort((x, y) => y.seq - x.seq)[0] ?? null;
    const a = cus.attempt('acquire', { container: r.ref.computer, key: r.key, proof: cur(r) ?? retired, explicit });
    r.acq = a;
    r.retry = stop(r.retry);
    if (!explicit) r.fails += 1;
    submit(r, a, sendAcquire);
  }
  function RT(r: Rec): void {
    if (!want(r)) return;
    r.retry = stop(r.retry);
    if (!cur(r)) r.why = 'failing';
    r.retry = later(backoff(Math.max(1, r.fails)), () => { r.retry = null; if (!alive(r) || !want(r) || r.acq) return; ACQ(r); post(r); });
  }
  function auto(r: Rec): void { if (!want(r)) return; if (r.fails === 0) ACQ(r); else RT(r); }
  function REN(r: Rec, c: Cap): void {
    if (c.patch || c.removed || !cus.held(c)) return;
    const a = cus.attempt('patch', { container: r.ref.computer, key: r.key, cap: c });
    c.patch = a;
    submit(r, a, sendRenew);
  }
  function PROBE(r: Rec, c: Cap): void { REN(r, c); }
  function DEL(r: Rec, c: Cap): void {
    if (c.del || !cus.held(c)) return;
    const a = cus.attempt('release', { container: r.ref.computer, key: r.key, cap: c });
    c.del = a;
    sendRelease(r, a, hidden);
  }
  function KDEL(r: Rec): void {
    for (const c of caps(r)) { if (c.role !== 'retire') continue; sendRelease(r, cus.attempt('release', { container: r.ref.computer, key: r.key, cap: c }), true); }
  }
  function clearTimers(c: Cap, which: Array<keyof Tm>): void { const t = tm(c); for (const k of which) t[k] = stop(t[k]); }
  function RET(r: Rec, c: Cap): void {
    if (c.role === 'retire') { DEL(r, c); return; }
    c.role = 'retire';
    clearTimers(c, ['renewAt', 'lapse', 'probeRetry']);
    c.patch = null;
    DEL(r, c);
  }
  function retireAll(r: Rec): void { for (const c of live(r)) RET(r, c); }
  function lapse(r: Rec, c: Cap): void {
    c.lapsed = true; c.patch = null;
    clearTimers(c, ['renewAt', 'lapse']);
    emit(r);
    if (!r.acq) auto(r);
  }
  function sureEnd(c: Cap): number { return c.at ? Math.min(c.at.m + TTL - SKEW - clock.mono(), c.at.w + TTL - SKEW - clock.wall()) : 0; }
  function ARM(r: Rec, c: Cap): void {
    const t = tm(c);
    clearTimers(c, ['renewAt', 'lapse']);
    const left = sureEnd(c);
    if (left <= 0) { lapse(r, c); return; }
    t.lapse = later(left, () => {
      t.lapse = null;
      if (!alive(r) || c.role !== 'cur' || c.lapsed || !cus.held(c)) return;
      if (sureOf(c)) ARM(r, c); else lapse(r, c);
      post(r);
    });
    if (!c.stale) t.renewAt = later(left / 2, () => { t.renewAt = null; if (!alive(r) || c.role !== 'cur' || c.lapsed || c.stale || !cus.held(c)) return; REN(r, c); post(r); });
  }
  function verify(r: Rec, c: Cap): void {
    if (c.stale) { lapse(r, c); return; }
    if (c.patch || tm(c).renewAt) return;
    if (c.tries === 0) { c.tries += 1; REN(r, c); return; }
    tm(c).renewAt = later(backoff(c.tries), () => { tm(c).renewAt = null; if (!alive(r) || c.role !== 'cur' || c.lapsed || !cus.held(c)) return; c.tries += 1; REN(r, c); post(r); });
  }
  function promote(r: Rec, c: Cap): void {
    c.role = 'cur'; c.lapsed = false; r.why = 'none'; r.refusedAt = undefined; r.retry = stop(r.retry);
    clearTimers(c, ['probeRetry']);
    if (sureOf(c)) { r.fails = 0; c.tries = 0; ARM(r, c); } else if (c.stale) lapse(r, c); else verify(r, c);
  }
  function toProbe(c: Cap): void { c.role = 'probe'; c.okSeq = null; clearTimers(c, ['renewAt', 'lapse']); }
  function probe(r: Rec, c: Cap): void { if (!c.patch) PROBE(r, c); }
  function intake(r: Rec, g: Cap, a: Attempt): void {
    r.newest = Math.max(r.newest, g.seq);
    // a rotated proof is retired in the record it belongs to, never in the record a foreign-session grant landed in
    if (a.op === 'acquire' && a.proof && a.proof.key === r.key && cus.held(a.proof) && a.proof.role !== 'retire') RET(r, a.proof);
    if (!want(r)) { RET(r, g); return; }
    const others = live(r).filter((c) => c !== g);
    if (others.length === 0) { promote(r, g); return; }
    r.retry = stop(r.retry);
    for (const c of [...others, g]) { toProbe(c); probe(r, c); }
  }
  function resolveProbes(r: Rec): void {
    const ps = probes(r);
    if (ps.length === 0) return;
    const fresh = ps.filter((c) => c.okSeq !== null && c.okSeq >= r.newest);
    if (ps.length === 1 && live(r).length === 1 && fresh.length === 1) { promote(r, ps[0]!); return; }
    if (fresh.length > 1) for (const c of fresh) c.okSeq = null;
    for (const c of ps) if (!(c.okSeq !== null && c.okSeq >= r.newest) && !c.patch && !tm(c).probeRetry) probe(r, c);
  }
  function rec(r: Rec): void {
    if (!want(r)) { r.retry = stop(r.retry); return; }
    if (r.acq || probes(r).length > 0) return;
    const c = cur(r);
    if (c && !c.lapsed) {
      if (sureOf(c)) { if (!tm(c).lapse || (!c.stale && !c.patch && !tm(c).renewAt)) ARM(r, c); } else if (c.stale) lapse(r, c); else verify(r, c);
      return;
    }
    if (!c && (r.why === 'elsewhere' || r.why === 'gone')) return;
    if (!r.retry) auto(r);
  }
  function look(r: Rec): void {
    if (!want(r)) return;
    if (r.why !== 'none') r.why = 'none';
    r.fails = 0; r.retry = stop(r.retry);
    rec(r);
  }
  function unwant(r: Rec): void { r.retry = stop(r.retry); retireAll(r); }

  // ---- events: answer hook, settle, gap, epoch ----
  function onAnswer(a: Attempt, raw: unknown): void {
    const sid = raw && typeof raw === 'object' ? (raw as { session_id?: unknown }).session_id : undefined;
    const h = handleOf.get(a);
    // The session the answer names owns the grant, whatever the handle asked for; a bound handle keeps its own session.
    const key = typeof sid === 'string' && sid ? `${a.container}|${sid}` : a.key;
    if (key === null) return;
    const ref = h ? { ...h._ref, sid: key.slice(a.container.length + 1) } : { computer: a.container, realm: '', sid: key.slice(a.container.length + 1) };
    const r = recOf(ref);
    if (!r) return;
    if (h && h._open && !h._bound) { h._bound = true; h._sid = ref.sid; h._ref = ref; r.hs.add(h); }
    const pre = ctl(r);
    for (const g of a.granted) intake(r, g, a);
    const err = agent.approverErrorOf(raw);
    if (err === 'held') { if (pre === 'N' || pre === 'F' || pre === 'G') { if (pre === 'F') r.retry = stop(r.retry); r.why = 'elsewhere'; } }
    else if (err === 'required') {
      if (pre === 'H') { const c = cur(r); if (c) verify(r, c); }
      else if (pre === 'X' || pre === 'F') { r.retry = stop(r.retry); auto(r); }
      else if (pre === 'E' || pre === 'G') { r.why = 'none'; auto(r); }
      else if (pre === 'N') auto(r);
    }
    const e = agent.approverEpochOf(raw);
    if (e !== null && a.sentSeq !== null) epochSeen(r, e, a.sentSeq);
    post(r);
  }
  function epochSeen(r: Rec, e: string, seq: number): void {
    if (seq <= r.lastEpochSeq && r.lastEpoch !== null) return;
    const prev = r.lastEpoch;
    r.lastEpoch = e; r.lastEpochSeq = Math.max(r.lastEpochSeq, seq);
    if (prev === null || prev === e) return;
    const pre = ctl(r);
    if (pre === 'N') ACQ(r);
    else if (pre === 'P') { for (const c of probes(r)) if (!c.patch) PROBE(r, c); }
    else if (pre === 'H') { const c = cur(r)!; c.at = null; clearTimers(c, ['renewAt', 'lapse']); verify(r, c); }
    else if (pre === 'X' || pre === 'E' || pre === 'F' || pre === 'G') { if (pre !== 'X') r.why = 'none'; r.retry = stop(r.retry); ACQ(r); }
  }
  const { submit, drain, flush } = createQueue({ cus, want, caps, cur, waiters, post });
  const settlers = createSettlers({ cus, clock, alive, caps, probes, cur, sureOf, sureEnd, tm, clearTimers, auto, RT, retireAll, RET, lapse, verify, ARM, REN, PROBE, DEL, post });
  function onSettled(a: Attempt, res: Settled<unknown>, cls: Class, removed: Cap | null): void {
    const waitersOf = waiters.get(a);
    const r = a.key !== null ? recs.get(a.key) : undefined;
    try {
      if (!r || !alive(r)) return;
      if (a.op === 'acquire') settlers.acquire(r, a, cls);
      // A renew's or decision's answer is fenced by the Cap it carried. Decisions and attach grants are not queued, so a Cap can be
      // removed (and another granted) while its renew is out: that answer has nothing left to steer.
      else if (a.op === 'patch' && a.cap) { if (removed === a.cap || cus.held(a.cap)) settlers.patch(r, a, a.cap, res, cls, removed); }
      else if (a.op === 'release' && a.cap) settlers.release(r, a, a.cap, cls, removed);
      else if (a.op === 'decide' && a.cap) { if (removed === a.cap || cus.held(a.cap)) settlers.decide(r, a, a.cap, cls, removed); }
      post(r);
      if (r.out === a) drain(r);
    } finally { if (waitersOf) for (const f of waitersOf) f(); }
  }
  function gapNow(): void {
    gapGen += 1;
    ref0 = { m: clock.mono(), w: clock.wall() };
    for (const r of [...recs.values()]) {
      const c = cur(r);
      if (c && !c.lapsed) { clearTimers(c, ['renewAt', 'lapse']); verify(r, c); }
      post(r);
    }
  }
  function detectGap(): void {
    const dm = clock.mono() - ref0.m, dw = clock.wall() - ref0.w;
    if (Math.abs(dw - dm) > SKEW) gapNow();
  }
  function syncTick(): void {
    const some = [...recs.values()].some((r) => cur(r) !== null);
    if (some && !tick) tick = later(TICK_MS, () => { tick = null; detectGap(); for (const r of [...recs.values()]) post(r); syncTick(); });
    else if (!some && tick) tick = stop(tick);
  }

  // ---- handles ----
  function makeHandle(ref: ApproverRef, strict: boolean): Handle {
    const h: Handle = {
      _sid: ref.sid, _open: true, _strict: strict, _acct: shown, _acctEpoch: acctEpoch, _mgr: mgr, _ref: ref, _bound: ref.sid !== null,
      get sid() { return h._sid; },
      setStrict(on) {
        if (!h._open || !live2(h)) return;
        const r = h._sid !== null ? recs.get(`${ref.computer}|${h._sid}`) : undefined;
        const was = r ? want(r) : false;
        h._strict = on;
        if (!r) return;
        detectGap();
        if (!was && want(r)) look(r); else if (was && !want(r)) unwant(r);
        post(r);
      },
      mintTicket(route, idem) {
        if (!h._open || !live2(h)) return null;
        const create = h._sid === null;
        const a = cus.attempt('mint', {
          container: ref.computer, key: h._sid !== null ? `${ref.computer}|${h._sid}` : null,
          guard: (call) => { const b = call.body as { attach?: unknown } | null | undefined; const att = b && typeof b === 'object' ? b.attach : undefined; return h._open && live2(h) && (create ? h._sid === null && att === undefined : att === h._sid); },
        });
        handleOf.set(a, h);
        // POST /sessions has no :id: core binds a create or attach call to a null session whoever the handle is bound to.
        return cus.ticket(a, { route, container: ref.computer, sid: null, idem });
      },
      decide(route) {
        if (!h._open || !live2(h) || h._sid === null) return null;
        detectGap();
        const r = recs.get(`${ref.computer}|${h._sid}`);
        const c = r ? cur(r) : null;
        if (!r || !c || c.lapsed || !sureOf(c)) return null;
        const a = cus.attempt('decide', { container: ref.computer, key: r.key, cap: c });
        const ticket = cus.ticket(a, { route, container: ref.computer, sid: h._sid, idem: null });
        return c.generation !== null ? { ticket, lease_generation: c.generation } : { ticket };
      },
      close() {
        if (!h._open) return;
        h._open = false;
        const r = h._sid !== null && h._bound ? recs.get(`${ref.computer}|${h._sid}`) : undefined;
        if (!r) return;
        r.hs.delete(h);
        if (!want(r)) unwant(r);
        post(r);
      },
    };
    return h;
  }
  function live2(h: Handle): boolean { return h._mgr === mgr && h._acct === shown && h._acctEpoch === acctEpoch; }

  const self: ApproverManager = {
    open(ref, o) {
      detectGap();
      const h = makeHandle(ref, o?.strict === true);
      const r = recOf(ref);
      if (r) { const was = want(r); r.hs.add(h); if (!was && want(r)) look(r); post(r); }
      return h;
    },
    state(ref) { const r = ref.sid !== null ? recs.get(`${ref.computer}|${ref.sid}`) : undefined; return r ? stateOf(r) : { phase: 'none' }; },
    takeOver(ref) {
      const r = ref.sid !== null ? recs.get(`${ref.computer}|${ref.sid}`) : undefined;
      if (!r || !want(r)) return Promise.resolve(self.state(ref));
      detectGap();
      const pre = ctl(r);
      if (pre === 'Q') { r.acq!.explicit = true; }
      else if (pre === 'N' || pre === 'E' || pre === 'G') { r.fails = 0; ACQ(r, true); }
      else if (pre === 'X' || pre === 'F') { r.retry = stop(r.retry); r.fails = 0; ACQ(r, true); }
      const a = r.acq;
      post(r);
      if (!a) return Promise.resolve(self.state(ref));
      return new Promise((res) => { const l = waiters.get(a) ?? []; l.push(() => res(self.state(ref))); waiters.set(a, l); });
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    stamp: () => cus.stamp(),
    noteEpoch(ref, epoch, stamp) { const r = ref.sid !== null ? recs.get(`${ref.computer}|${ref.sid}`) : undefined; if (!r || !alive(r)) return; detectGap(); epochSeen(r, epoch, stamp); post(r); },
    gap() { gapNow(); },
    hide() {
      hidden = true;
      for (const r of [...recs.values()]) { r.retry = stop(r.retry); retireAll(r); KDEL(r); post(r); }
    },
    show() {
      gapNow();
      hidden = false;
      for (const r of [...recs.values()]) { look(r); post(r); }
    },
    accountChanged() {
      const old = shown;
      acctEpoch += 1; shown = account();
      cus.abandon(old);
      const all = [...recs.values()];
      recs.clear();
      for (const r of all) { r.retry = stop(r.retry); flush(r); }
      tick = stop(tick);
    },
    releaseAll() { self.hide(); },
    resume() { self.show(); },
    reset() {
      mgr += 1;
      cus.abandon(shown);
      const all = [...recs.values()];
      recs.clear();
      for (const r of all) { r.retry = stop(r.retry); flush(r); } tick = stop(tick); hidden = false;
    },
  };
  return self;
}

/** Drops absent tickets, so a call without its lease ticket reaches core without one and is refused unsent. */
export function tix(...ts: readonly (Ticket | null | undefined)[]): Ticket[] { return ts.filter((t): t is Ticket => !!t); }
