// The browser-only part of the Logs page's data.ts (split out so the rest of data.ts is shared with the terminal build):
// the readings the logs controller asks the page for.
import { isStandalone } from '@core';

/** Whether the page is shown now (the logs controller's `visible`). */
export const pageVisible = (): boolean => document.visibilityState !== 'hidden';

/** Whether the browser says it is online (the logs controller's `online`). */
export const browserOnline = (): boolean => navigator.onLine;

/** Whether this is the one-file Hub opened from a file on this device (the logs controller's `fileOrigin`): its requests
 *  carry `Origin: null`, which the computer's programs answer and its logs service may not. */
export const fileOriginPage = (): boolean => {
  if (!isStandalone()) return false;
  try { return window.location.protocol === 'file:' || window.origin === 'null'; } catch { return false; }
};
