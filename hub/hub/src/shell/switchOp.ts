// The realm switches the shell starts (the realm menu, a ?open_realm= link) all go through startSwitch, so the switch
// line's Cancel and Escape can end the running one, whichever part of the shell started it.
// - startSwitch(target) is core's beginSwitch. Core's own `done` waits for the probe to end, even once the switch
//   can no longer commit, so the `done` returned here settles false at once when the switch is cancelled here, or as
//   soon as another switch takes over (core's switchRevision moves: a newer switch from anyone, or the account
//   ending). A waiter, such as a ?open_realm= link withholding the page, never waits on an obsolete probe. A switch core
//   refuses is returned as core gave it.
// - cancelSwitch() cancels the newest switch the shell started, while it is still core's pending switch: nothing
//   started since, by anyone (core's switchRevision has not moved), and core still shows a switch pending. It
//   answers whether it cancelled. A switch started outside the shell, or after this one, is never cancelled here.
import { beginSwitch, snapshot, subscribe, type SwitchOp, switchRevision } from '@core/shell';

interface Started {
  op: SwitchOp;
  rev: number;
  finish: (ok: boolean) => void;
}

let newest: Started | null = null;

function cancelStarted(s: Started): boolean {
  // A newer switch (the shell's or anyone's) moved the revision; one that ended cleared `switching`.
  if (switchRevision() !== s.rev || snapshot().switching === null) return false;
  s.op.cancel();
  s.finish(false);
  return true;
}

/** Start a realm switch the shell can cancel (see the header). */
export function startSwitch(target: string): SwitchOp {
  const before = switchRevision();
  const op = beginSwitch(target);
  const rev = switchRevision();
  if (rev === before) return op;
  let resolve = (_ok: boolean): void => undefined;
  const done = new Promise<boolean>((r) => {
    resolve = r;
  });
  let stop = (): void => undefined;
  const started: Started = {
    op,
    rev,
    finish: (ok) => {
      stop();
      if (newest === started) newest = null;
      resolve(ok);
    },
  };
  newest = started;
  // Core calls its listeners on every change, and every started switch (and the account ending) is a change.
  stop = subscribe(() => {
    if (switchRevision() !== rev) started.finish(false);
  });
  void op.done.then(started.finish, () => started.finish(false));
  return { done, cancel: () => void cancelStarted(started) };
}

/** Cancel the shell's running switch; true when there was one to cancel. */
export function cancelSwitch(): boolean {
  return newest !== null && cancelStarted(newest);
}
