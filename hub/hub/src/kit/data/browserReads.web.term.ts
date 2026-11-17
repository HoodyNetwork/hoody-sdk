// The terminal sibling of browserReads.web.ts: a terminal host has no browser history, canvas or agent, so each read
// answers "none" and each write does nothing. Callers already ask only on a web page (hostEnv().browserPage); this file
// keeps the terminal build from reaching a browser global at all.
import type * as Web from './browserReads.web';

export const browserEntryState: typeof Web.browserEntryState = () => null;
export const replaceBrowserEntryState: typeof Web.replaceBrowserEntryState = () => undefined;
export const measuringCanvas: typeof Web.measuringCanvas = () => null;
export const browserAgent: typeof Web.browserAgent = () => undefined;
