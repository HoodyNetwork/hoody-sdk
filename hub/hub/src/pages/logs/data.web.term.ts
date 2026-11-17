// The Logs controller's readings in the terminal: shown = the host's visibility (hostEnv().visible()); online
// is not known to a terminal, so it counts as online and a failed read says so itself.
import { hostEnv } from '@core';
import type * as Web from './data.web';

export const pageVisible: typeof Web.pageVisible = () => hostEnv().visible();
export const browserOnline: typeof Web.browserOnline = () => true;
/** A terminal is never a page opened from a file. */
export const fileOriginPage: typeof Web.fileOriginPage = () => false;
