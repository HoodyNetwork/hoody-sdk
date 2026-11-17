// When a drawer's held change stops being shown, that alone does not say why: core's read-back proved it (automatic
// or Check again), the person's own Dismiss freed it, another tab or page dismissed it, or the drawer moved to another
// computer. A drawer whose form could send the same change again must not treat every end as proof. This watch
// decides each end of a shown hold: `judge` (the drawer reads the computer fresh) for every end except the person's
// own Dismiss that core accepted for exactly the hold shown, which is `release`d (nothing to prove: the person said it
// did not go through). A change of subject (another computer, or the drawer closed) drops everything, including a
// Dismiss still out: the hold of the computer shown before is not this one's to judge. A Dismiss core refused while
// the hold ended anyway (a proof freed it meanwhile) is judged like any other end. A newer hold shown (another token)
// drops a Dismiss still out for the older one, and `drop` (unmount) drops everything: a late answer then does
// nothing. Until an end is judged or released the drawer keeps its form locked (it only learns of an end through
// `seen`); judge and release carry the hold they are for, so the drawer acts only while that hold is its own.

/** The held change as the drawer showed it: its computer, the set it sent, and core's token for that send. */
export interface ShownHold { computer: string; realms: string[]; hold: string | undefined }

export interface HoldWatch {
  /** Each committed change of the hold shown for `subject` (the drawer's computer), or null: called from an effect. */
  seen(now: ShownHold | null, subject: string | undefined): void;
  /** The person's warned Dismiss of the hold shown: `run` is core's dismiss; answers whether core freed it. */
  dismiss(run: () => Promise<boolean>): Promise<boolean>;
  /** The drawer unmounted: nothing still out (a Dismiss answer) judges or releases anything. */
  drop(): void;
}

export function holdWatch(on: { judge: (was: ShownHold) => void; release: (was: ShownHold) => void }): HoldWatch {
  let shown: ShownHold | null = null;
  let subject: string | undefined;
  // A Dismiss in flight (or answered) for the token shown when it was pressed: `freed` is core's answer once known;
  // `ended` is the hold's end seen meanwhile, judged only if core refused.
  let dz: { token: string | undefined; computer: string; freed: boolean | null; ended: ShownHold | null } | null = null;

  return {
    seen(now, subj) {
      if (subj !== subject) { subject = subj; shown = null; dz = null; }
      if (now && now.computer === subj) {
        // A newer hold (another token): a Dismiss still out, or answered, for the older one is not this one's.
        if (dz && dz.token !== now.hold) dz = null;
        shown = now;
        return;
      }
      const was = shown;
      shown = null;
      if (!was || was.computer !== subj) return;
      if (dz && dz.computer === was.computer && dz.token === was.hold) {
        if (dz.freed === true) { dz = null; on.release(was); return; }
        if (dz.freed === null) { dz.ended = was; return; }
        dz = null;
      }
      on.judge(was);
    },
    async dismiss(run) {
      const was = shown;
      if (!was) return run();
      const mine = { token: was.hold, computer: was.computer, freed: null as boolean | null, ended: null as ShownHold | null };
      dz = mine;
      let freed = false;
      try { freed = await run(); } finally {
        // dz !== mine: the subject changed meanwhile (or a newer Dismiss took over): nothing here is this one's.
        if (dz === mine) {
          if (freed) {
            // The end, if it was already seen, was this Dismiss's own: nothing to judge.
            if (mine.ended) { dz = null; on.release(mine.ended); } else dz = { ...mine, freed: true };
          } else {
            dz = null;
            if (mine.ended) on.judge(mine.ended);
          }
        }
      }
      return freed;
    },
    drop() {
      // Not final (a development double mount drops and remounts): what is out now is forgotten, later seen() works.
      shown = null;
      dz = null;
    },
  };
}

/** Two realm lists name the same realms: as sets, both ways (a repeated id counts once). */
export const sameSet = (a: string[], b: string[]): boolean => a.every((r) => b.includes(r)) && b.every((r) => a.includes(r));
