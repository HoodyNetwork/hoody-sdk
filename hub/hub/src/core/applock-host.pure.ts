// The passcode gate host's ids, attribute and timings (split out of applock-host.ts so the terminal build shares them;
// the contract is at the top of applock-host.ts, which re-exports every name here).

export const LOCK_HOST_ID = 'hub-lock-host';
export const LOCKED_ATTR = 'data-hub-locked';
export const IDLE_TICK_MS = 15_000;
/** The app's React root: a dialog inside it is the page's own, never one that hides the page. */
export const APP_ROOT_ID = 'root';
/** The mutations that can open, close or hide a dialog. */
export const MODAL_WATCH: MutationObserverInit = { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'style', 'open'] };

export interface LockHostOptions {
  /** Focus when the element focused before the lock is gone (the shell's page title). */
  fallbackFocus?: () => void;
  /** Replaces setInterval/clearInterval (tests). */
  every?: (fn: () => void, ms: number) => () => void;
}
