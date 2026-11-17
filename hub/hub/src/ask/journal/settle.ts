// settle.ts: settle(v), the ONE consumer of verdicts. post, observe, checkById and
// check all call it; there is no optional callback.
//   - admitted, unknown: nothing.
//   - a create, settled: the chat record moves to the new session (or is marked unavailable) FIRST; only with the `Kept` that
//     records.ts minted does the entry's removal proof exist. A handoff the store did not keep is owed and retried by sweep().
//   - a turn, settled or notAdmitted: the record holds the turn (turnKept) or fences its key (turnFenced) FIRST; only with the TurnKept
//     records.ts minted does the entry's removal proof exist (the entry is the evidence that a first message may have left).
//   - anything else (closed, a settled command/decision/answer): the entry is removed under its verdict.
// ONE async step, `once`, does the whole settlement of an entry for every route; every retry (an owed one included) repeats it, so no
// removal-only proof is ever queued for a turn or a create. The entry's store (req, or mig for a migrated member or a source row) is
// read from the scan, never from the verdict.
import type { Entries } from './entries';
import type { Records } from './records';
import { currentAccount } from './storage';
import { fromCreateKept, fromTurnKept, fromVerdict, isVerdict, type Kept, type RemovalProof, type StoreName, type Verdict } from './proof';
import type { Entry } from './types';

export type Settled = 'none' | 'done' | 'owed';

export class Settler {
  constructor(private readonly entries: Entries, private readonly records: Records) {}

  /** `realm`: the realm of the entry the verdict is about (a create's record is named by it). Given for a create, it makes `done` mean the
   *  record is at its session (or marked unavailable) NOW, whether or not the entry was still there: an entry that is gone says nothing
   *  about the record (another tab removed it, its move may not have been kept). Without it, a settled create whose entry is gone is
   *  'none': absence alone never authorizes anything. `alive`: the asker still wants it (a Check that Stop tracking ended does not).
   *  Once false nothing more is written: each record write looks at it under its lock, the entry's removal right before it, and an
   *  owed retry looks at it first and is dropped (the answer is then 'none'). A record write already made stays (it records what the
   *  server proved). */
  async settle(v: Verdict, realm?: string, alive?: () => boolean): Promise<Settled> {
    if (!isVerdict(v)) return 'none';
    if (v.t === 'admitted' || v.t === 'unknown') return 'none';
    const dead = (): boolean => !!alive && !alive();
    if (dead()) return 'none';
    const sc = this.entries.scan(v.h);
    if (sc.s !== 'ok' || sc.acct !== v.acct) return this.owedFor(v, realm, alive);
    const e = sc.entries.find((x) => x.k === v.k);
    if (!e) {
      if (v.t === 'settled' && v.route === 'create') return realm !== undefined ? this.handoffOnly(v, realm, alive) : 'none';
      return 'done';                                    // already gone: a removal is idempotent
    }
    const store: StoreName = e.m ? 'mig' : 'req';
    if (await this.once(v, e, store, alive)) return 'done';
    if (dead()) return 'none';
    const acct = v.acct;
    this.entries.owe(acct, () => dead() || (currentAccount() === acct && this.once(v, e, store, alive)));
    return fromVerdictOrKept(v) ? 'owed' : 'none';
  }

  /** One attempt at the whole settlement of an entry, owing nothing: true when the entry is gone. */
  private async once(v: Verdict, e: Entry, store: StoreName, alive?: () => boolean): Promise<boolean> {
    const remove = (p: RemovalProof | null): boolean => !!p && !(alive && !alive()) && this.entries.removeNow(p);
    if (v.t === 'settled' && v.route === 'create') {
      return remove(fromCreateKept(v, await this.handoff(v, e.r, alive), store));
    }
    if (v.route === 'turn') {
      if (e.s === null) return false;
      let tk;
      if (v.t === 'settled') {
        const id = (v.body as { turn_id?: unknown } | null)?.turn_id;
        if (typeof id !== 'string' || id === '') return false;
        tk = await this.records.turnKept(v.h, e.r, e.s, e.c, v.k, id, alive);
      } else if (v.t === 'notAdmitted') tk = await this.records.turnFenced(v.h, e.r, e.s, e.c, v.k, alive);
      else return false;
      return remove(fromTurnKept(v, tk, store));
    }
    return remove(fromVerdict(v, store));
  }

  /** A verdict whose entry could not be looked at now: the whole settlement is owed (retried in its own account). */
  private owedFor(v: Verdict, realm: string | undefined, alive?: () => boolean): Settled {
    this.entries.owe(v.acct, async () => {
      // An asker that stopped is owed nothing: the item is dropped (true), never run.
      if (alive && !alive()) return true;
      if (currentAccount() !== v.acct) return false;
      const sc = this.entries.scan(v.h);
      if (sc.s !== 'ok' || sc.acct !== v.acct) return false;
      const e = sc.entries.find((x) => x.k === v.k);
      if (e) return this.once(v, e, e.m ? 'mig' : 'req', alive);
      // The entry has gone (another tab): a create's record handoff is repeated all the same, as handoffOnly does.
      if (v.t === 'settled' && v.route === 'create' && realm !== undefined) return !!(await this.handoff(v, realm, alive));
      return true;
    });
    return 'owed';
  }

  /** The record side of a settled create: removed when the reply was refused, moved to its session, or marked unavailable. The Kept it
   *  returns is minted only by records.ts, after the store kept the change. */
  private handoff(v: Verdict, realm: string, alive?: () => boolean): Promise<Kept | null> {
    if (v.why === 'refused') return v.sid ? this.records.refuseCreate(v.h, realm, v.k, v.sid, alive) : Promise.resolve(null);
    return v.sid ? this.records.moveCreate(v.h, realm, v.k, v.sid, alive) : this.records.markUnavailable(v.h, realm, v.k, alive);
  }

  /** The entry is gone; the create's record handoff is repeated (it is idempotent) and counts only with the Kept it returns. */
  private async handoffOnly(v: Verdict, realm: string, alive?: () => boolean): Promise<Settled> {
    const hand = async (): Promise<boolean> => !!(await this.handoff(v, realm, alive));
    if (await hand()) return 'done';
    if (alive && !alive()) return 'none';
    this.entries.owe(v.acct, async () => (alive && !alive()) || (currentAccount() === v.acct && hand()));
    return 'owed';
  }
}

/** Whether a removal can exist for this verdict at all (a verdict nothing can remove under is not owed). */
function fromVerdictOrKept(v: Verdict): boolean {
  if (v.route === 'turn' || (v.t === 'settled' && v.route === 'create')) return true;
  return !!fromVerdict(v, 'req');
}
