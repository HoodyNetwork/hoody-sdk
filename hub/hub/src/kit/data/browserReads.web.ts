// browserReads.web.ts: the browser globals the kit's data pieces read, in one place: the history entry's own state
// (DataTableView keeps a table's held row there), a canvas to measure text (DataTableLayout) and the browser's agent
// (Steps picks the reader's system). Callers ask only where hostEnv().browserPage says the Hub is a web page; the
// terminal sibling (browserReads.web.term.ts) answers "none" to each, so no browser global is read there.

/** The browser's own state of the current history entry; null when there is none. */
export function browserEntryState(): unknown {
  return typeof window === 'undefined' ? null : (window.history.state as unknown);
}

/** Replaces the browser's own state of the current history entry, keeping its address, through the prototype's
 *  replaceState, which the router's wrapper does not see: the router is told nothing (no navigation, no reload). */
export function replaceBrowserEntryState(state: unknown): void {
  if (typeof window === 'undefined') return;
  History.prototype.replaceState.call(window.history, state, '');
}

/** A 2D canvas context to measure text with; null when the page has none (a test without canvas). */
export function measuringCanvas(): CanvasRenderingContext2D | null {
  return typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
}

/** The browser's agent (its user agent and touch points); undefined outside a browser. */
export function browserAgent(): Pick<Navigator, 'userAgent' | 'maxTouchPoints'> | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator;
}
