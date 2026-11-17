// The "make a key" cue in the terminal: no pointer to watch and no document to move focus in (the terminal's focus
// system owns the keyboard). The cue still marks the keys part "here" (LinkTab) and ends after its watch time, as on
// the web; the focus move is a no-op.
import type * as Web from './keysCue';

export type { KeysCue } from './keysCue';

const CUE_WATCH_MS = 10_000;

export const keysCueFor: typeof Web.keysCueFor = (key, opener) => {
  let watching = true;
  const timer = setTimeout(() => { watching = false; }, CUE_WATCH_MS);
  const end = () => { watching = false; clearTimeout(timer); };
  return { key, opener, acted: () => !watching, end };
};
export const focusAfterDialogs: typeof Web.focusAfterDialogs = () => {};
export const cancelJob: typeof Web.cancelJob = () => {};
