// held.ts: the run's one held change (run.ts RunHold) over core's holdAttempt, the durable cross-tab hold core keeps
// for a send that must not go out twice (the same held changes the launcher's Open and Keys' create use). One lock
// per computer: while a run there is unsettled a new one is refused (HELD). The meta is the run's plain data (keys
// and step, never a secret); each save is a compare-and-set on its version, one at a time.
import { attemptFor, holdAttempt, type AttemptHold, type Target } from '@core';
import type { Admit, RunHold } from './run';

/** The sender's name in core's holds: only it frees them. */
export const BY = 'apps.github';
const ID = /^[A-Za-z0-9_.-]{1,64}$/;

/** The computer's lock, or null for an id the lock cannot name (nothing is admitted then). */
export function lockFor(on: Target): string | null {
  const p = on.project.id, c = on.container.id;
  return ID.test(p) && ID.test(c) ? `${BY}:${p}/${c}` : null;
}

/** The sending leases of this page, by hold id: shared by every handle of a hold (a run built by resume shares them with any
 *  earlier instance). The hold's sending stamp ends only here, when the count returns to 0 (`AttemptHold.sent`). */
const leases = new Map<string, number>();

function wrap(h: AttemptHold, version: number): RunHold {
  let v = version;
  let chain: Promise<unknown> = Promise.resolve();
  return {
    id: h.id,
    key: h.key,
    version: () => v,
    save: (meta, sending) => {
      const p = chain.then(() => h.update(meta, v, sending ? { sending: true } : undefined)).then(
        (ok) => { if (ok) v++; return ok; },
        () => false,
      );
      chain = p;
      return p;
    },
    lease: () => {
      leases.set(h.id, (leases.get(h.id) ?? 0) + 1);
      let done = false;
      return () => {
        if (done) return;
        done = true;
        const n = (leases.get(h.id) ?? 1) - 1;
        if (n > 0) { leases.set(h.id, n); return; }
        leases.delete(h.id);
        h.sent();
      };
    },
    release: () => h.release(),
    // The warned Dismiss as core's guarded free (as Keys' holds): decided inside the store lock on the
    // version the person saw, refused while any send of it may still be out (this tab's own stamp after a reload
    // included, until it is stale). Never deletes a version that may still be sending.
    dismiss: (shown) => h.free('dismissed', { metaVersion: shown.metaVersion }).catch(() => 'unresolved' as const),
  };
}

export function admitOn(on: Target): Admit {
  return (meta, realm) => {
    const lock = lockFor(on);
    if (!lock) return Promise.resolve({ refused: 'storage' as const });
    return holdAttempt(lock, { by: BY, meta, realm }).then(
      (r) => (r.ok ? { hold: wrap(r.hold, 0) } : { refused: r.code === 'HELD' ? ('held' as const) : ('storage' as const) }),
      () => ({ refused: 'storage' as const }),
    );
  };
}

/** A stored hold's handle after a reload (null: gone, another account's, or another sender's). */
export function heldHandle(id: string, metaVersion: number): RunHold | null {
  const h = attemptFor(id, BY);
  return h ? wrap(h, metaVersion) : null;
}
