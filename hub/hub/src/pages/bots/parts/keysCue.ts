// The "make a key" cue after a first link: the pointer watch and the focus move that waits for
// dialogs to close. Moved out of LinkTab.tsx so the terminal (keysCue.term.ts) answers without a document.

/** How long a cue watches for the person's pointer: past it, focus is no longer moved for them. */
const CUE_WATCH_MS = 10_000;

/** A first link made now: the Bot that owes the "make a key" cue, where the keyboard was when its
 *  drawer opened (`opener`, where the drawer hands it back), and whether the person has pressed a pointer since the
 *  create was done. `acted()` is also true once the watch is over (`end()`, or CUE_WATCH_MS). A key the person pressed
 *  shows where it put focus, which focusAfterDialogs checks; no key listener is needed (page keys belong to
 *  usePageShortcuts). */
export interface KeysCue {
  readonly key: string;
  readonly opener: Element | null;
  acted: () => boolean;
  end: () => void;
}

export function keysCueFor(key: string, opener: Element | null): KeysCue {
  let acted = false;
  let watching = true;
  const end = () => {
    if (!watching) return;
    watching = false;
    document.removeEventListener('pointerdown', act, true);
    clearTimeout(timer);
  };
  const act = () => {
    acted = true;
    end();
  };
  document.addEventListener('pointerdown', act, true);
  const timer = setTimeout(end, CUE_WATCH_MS);
  return { key, opener, acted: () => acted || !watching, end };
}

/** Focus is still where the closing drawer and the kit put it, not where the person did: nowhere, inside a dialog, on
 *  the drawer's opener (its restore) or on the page title (the kit's return when the opener is gone). */
function focusUnclaimed(opener: Element | null): boolean {
  const a = document.activeElement;
  if (a === null || a === document.body || !a.isConnected) return true;
  return a === opener || a.closest('[role="dialog"]') !== null || a.hasAttribute('data-hub-title');
}

/** Focus what `get` finds once no dialog is on screen and two frames have passed: a closing drawer keeps the keyboard
 *  inside it until it unmounts, then hands it back to its opener in the next frame (react-aria's focus restore), so a
 *  focus moved earlier would be lost. Never over the person: the job stops at their first pointer press, and places
 *  focus only while it is unclaimed (focusUnclaimed). A dialog still open after about a second (60 frames) leaves focus
 *  where it is. `job.raf` is the pending frame, for the caller's cleanup. */
export function focusAfterDialogs(get: () => HTMLElement | null | undefined, cue: Pick<KeysCue, 'acted' | 'opener'>, job: { on: boolean; raf: number }, frames = 60, settle = 2): void {
  if (!job.on || cue.acted()) return;
  const open = document.querySelector('[role="dialog"]') !== null;
  if (open || settle > 0) {
    if (frames <= 0) return;
    job.raf = window.requestAnimationFrame(() => focusAfterDialogs(get, cue, job, frames - 1, open ? 2 : settle - 1));
    return;
  }
  if (focusUnclaimed(cue.opener)) get()?.focus();
}

/** Stops a focusAfterDialogs job's pending frame (the caller's cleanup). */
export const cancelJob = (job: { raf: number }): void => window.cancelAnimationFrame(job.raf);
