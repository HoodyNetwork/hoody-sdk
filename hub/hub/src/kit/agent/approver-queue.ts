// One acquire or PATCH outstanding per record.
// A request made while another is on the wire waits here, in order, and is judged again when it reaches the head: if its Cap was
// removed or no longer wants it, its record closed or went, the want is gone, a usable lease has arrived (acquire), or the epoch or account changed, it is dropped unsent
// (its ticket is never minted, so nothing leaves). Releases (DELETE, also the pagehide keepalive) and decisions never queue here.
import type { Attempt, Cap, Custody } from './approver-custody';
import type { Rec } from './approver-rec';

export interface QueueKit {
  cus: Custody; want(r: Rec): boolean; caps(r: Rec): readonly Cap[]; cur(r: Rec): Cap | null;
  waiters: WeakMap<Attempt, Array<() => void>>; post(r: Rec): void;
}
export interface Queue {
  /** Sends at once when the record has nothing outstanding, else waits behind it. */
  submit(r: Rec, a: Attempt, send: (r: Rec, a: Attempt) => void): void;
  /** The outstanding request settled: the next one that still stands goes out. */
  drain(r: Rec): void;
  /** The record goes (reset, account change): everything waiting is dropped unsent, and the waiters of what is on the wire are released. */
  flush(r: Rec): void;
}

export function createQueue(k: QueueKit): Queue {
  const { cus, want, caps, cur, waiters, post } = k;
  function headOk(r: Rec, a: Attempt): boolean {
    // (a reset or an account change flushes the queue with its records, so only the request's own condition is left to judge)
    if (a.op === 'acquire') {
      const c = cur(r);
      // a usable lease (or a probe of candidates) arrived while this waited: the acquire has no reason left
      if (r.acq !== a || !want(r) || (c && !c.lapsed) || caps(r).some((x) => x.role === 'probe')) return false;
      a.proof = c ?? caps(r).filter((x) => x.role === 'retire').sort((x, y) => y.seq - x.seq)[0] ?? null;
      return true;
    }
    return !!a.cap && a.cap.patch === a && cus.held(a.cap) && (a.cap.role === 'cur' || a.cap.role === 'probe');
  }
  const wake = (a: Attempt): void => { for (const f of waiters.get(a) ?? []) f(); };
  function dropUnsent(r: Rec, a: Attempt): void {
    if (a.op === 'acquire') { if (r.acq === a) r.acq = null; } else if (a.cap && a.cap.patch === a) a.cap.patch = null;
    a.settled = true;
    wake(a);
  }
  function drain(r: Rec): void {
    r.out = null;
    let dropped = false;
    while (!r.out && r.q.length > 0) {
      const e = r.q.shift()!;
      if (headOk(r, e.a)) { r.out = e.a; e.send(r, e.a); } else { dropUnsent(r, e.a); dropped = true; }
    }
    if (dropped) post(r);
  }
  return {
    submit(r, a, send) { if (r.out) { r.q.push({ a, send }); return; } r.out = a; send(r, a); },
    drain,
    flush(r) {
      for (const e of r.q.splice(0)) dropUnsent(r, e.a);
      if (r.out) { wake(r.out); r.out = null; }   // a fenced reply never reaches the manager: its waiters are released here
    },
  };
}
