// The terminal sibling of ask.web.ts: a terminal is never the phone sheet, and it draws and focuses its own dock
// (term/shell/AskDock), so there is no dock element to search.
import type * as Web from './ask.web';

export const phoneNow: typeof Web.phoneNow = () => false;

export const focusDockControl: typeof Web.focusDockControl = () => undefined;

/** A terminal has no animation frame: the panel's own focus, when it is registered, takes it at once. */
export const afterDockDrawn: typeof Web.afterDockDrawn = (fn) => fn();
