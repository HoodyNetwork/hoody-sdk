// The settle half of the approver's rules: what a settled acquire, renew, release
// or decision does to its record. Removal of a capability is custody's (approver-custody.ts); these only move the record's own state
// and ask the manager's actions (SettleKit) to arm, retire, probe or look again. No capability is ever seen here.
import type { providers } from '@core';
import type { Attempt, Cap, Class, Clock, Custody } from './approver-custody';
import type { Rec, Tm } from './approver-rec';
import { backoff, delBackoff, later, stop } from './approver-timing';

type Settled<T> = providers.Settled<T>;
/** The manager's own actions and reads the settle rows call. */
export interface SettleKit {
  cus: Custody; clock: Clock;
  alive(r: Rec): boolean; caps(r: Rec): readonly Cap[]; probes(r: Rec): Cap[]; cur(r: Rec): Cap | null;
  sureOf(c: Cap): boolean; sureEnd(c: Cap): number; tm(c: Cap): Tm; clearTimers(c: Cap, which: Array<keyof Tm>): void;
  auto(r: Rec): void; RT(r: Rec): void; retireAll(r: Rec): void; RET(r: Rec, c: Cap): void; lapse(r: Rec, c: Cap): void; verify(r: Rec, c: Cap): void;
  ARM(r: Rec, c: Cap): void; REN(r: Rec, c: Cap): void; PROBE(r: Rec, c: Cap): void; DEL(r: Rec, c: Cap): void; post(r: Rec): void;
}
export interface Settlers {
  acquire(r: Rec, a: Attempt, cls: Class): void;
  patch(r: Rec, a: Attempt, c: Cap, res: Settled<unknown>, cls: Class, removed: Cap | null): void;
  release(r: Rec, a: Attempt, c: Cap, cls: Class, removed: Cap | null): void;
  decide(r: Rec, a: Attempt, c: Cap, cls: Class, removed: Cap | null): void;
}

export function createSettlers(k: SettleKit): Settlers {
  const { cus, clock, alive, caps, probes, cur, sureOf, sureEnd, tm, clearTimers, auto, RT, retireAll, RET, lapse, verify, ARM, REN, PROBE, DEL, post } = k;
  function later2(c: Cap, a: Attempt): void {
    if (c.stale || !a.anchor) return;
    if (!c.at || c.at.gap !== a.anchor.gap || a.anchor.seq > c.at.seq) c.at = a.anchor; // an older gap's anchor is unsure: a current one replaces it
  }
  function settleAcquire(r: Rec, a: Attempt, cls: Class): void {
    if (r.acq !== a) return;
    r.acq = null;
    if (cls === 'granted') return; // intake left it as it left it
    if (cls === 'held' || cls === 'invalid') {
      if (probes(r).length > 0) return;
      const c = cur(r);
      if (c && !c.lapsed) return;
      if (cls === 'invalid') { const left = caps(r).filter((x) => x.role === 'retire'); if (left.length > 0) { auto(r); return; } }
      if (c) RET(r, c);   // a lapsed cur the agent no longer honours is given back, so the record is E (no cur) and waits for a person
      r.why = 'elsewhere'; if (a.explicit) r.refusedAt = clock.wall();
      return;
    }
    if (cls === 'gone') { retireAll(r); r.why = 'gone'; return; }
    if (probes(r).length > 0) return;
    const c = cur(r);
    if (c && !c.lapsed) return;
    // Unknown, or a 2xx that took no grant, and nothing usable left: the backed-off retry, whatever the Take over before it reset
    r.fails = Math.max(1, r.fails);
    RT(r);
  }
  function settlePatch(r: Rec, a: Attempt, c: Cap, res: Settled<unknown>, cls: Class, removed: Cap | null): void {
    // Only the request that is the Cap's current one steers the record: a retired-but-held Cap's old renew can still be out when an
    // attach grant (not queued) has made another Cap current. Evidence about the Cap itself (below) applies whatever it was.
    const current = c.patch === a;
    if (current) c.patch = null;
    void removed;
    if (cls === 'ok') {
      if (c.role === 'probe') { c.okSeq = a.sentSeq; later2(c, a); }
      else if (current && c.role === 'cur' && !c.lapsed) {
        later2(c, a);
        if (sureOf(c)) { r.fails = 0; c.tries = 0; ARM(r, c); } else verify(r, c);
      }
      return;
    }
    if (cls === 'gone') { if (current) { retireAll(r); r.why = 'gone'; } return; }
    if (cls === 'invalid' || cls === 'expired') {
      if (cls === 'expired') RET(r, c);   // a 409 invalid was removed by custody (its proof); a 410 only retires
      return;
    }
    // unknown (not sent, a timeout, a 5xx, a 400, a ghost)
    if (!current || !res || c.removed) return;
    if (c.role === 'probe') { c.tries += 1; tm(c).probeRetry = later(backoff(c.tries), () => { tm(c).probeRetry = null; if (!alive(r) || c.role !== 'probe' || !cus.held(c)) return; PROBE(r, c); post(r); }); return; }
    if (c.role !== 'cur' || c.lapsed) return;
    if (c.stale) { if (sureOf(c)) clearTimers(c, ['renewAt']); else lapse(r, c); return; }
    if (sureOf(c)) { c.tries += 1; const wait = Math.min(backoff(c.tries), Math.max(0, sureEnd(c))); clearTimers(c, ['renewAt']); tm(c).renewAt = later(wait, () => { tm(c).renewAt = null; if (!alive(r) || c.role !== 'cur' || c.lapsed || c.stale || !cus.held(c)) return; REN(r, c); post(r); }); }
    else verify(r, c);
  }
  function settleRelease(r: Rec, a: Attempt, c: Cap, cls: Class, removed: Cap | null): void {
    if (removed === c) { tm(c).delRetry = stop(tm(c).delRetry); return; }
    if (c.del !== a) return;
    c.del = null; c.dels += 1;
    if (cls === 'ok' || !cus.held(c)) return;
    tm(c).delRetry = later(delBackoff(c.dels), () => { tm(c).delRetry = null; if (!alive(r) || c.role !== 'retire' || !cus.held(c)) return; DEL(r, c); post(r); });
  }
  function settleDecide(r: Rec, _a: Attempt, c: Cap, cls: Class, removed: Cap | null): void {
    void removed;
    if (cls === 'expired') RET(r, c);   // retirement evidence applies to the Cap it names, whatever its role now
    if (c.role !== 'cur') return;   // a demoted Cap's late decision never steers the record
    const lapsedNow = c.lapsed;
    if (cls === 'invalid' || cls === 'expired') {
      r.why = lapsedNow ? 'failing' : 'none';
      return;
    }
    if (cls === 'required') { if (!lapsedNow) verify(r, c); return; }
    if (c.stale && !lapsedNow) { if (sureOf(c)) clearTimers(c, ['renewAt']); else lapse(r, c); }
  }
  return { acquire: settleAcquire, patch: settlePatch, release: settleRelease, decide: settleDecide };
}
