// The Boards store's lock manager in the terminal: the host's (hostEnv().locks), or undefined where it has none
// (callers then store nothing, as in a browser without Web Locks).
import { hostEnv } from '@core';
import type * as Web from './locks.web';

export const browserLocks: typeof Web.browserLocks = () => (hostEnv().locks ?? undefined) as LockManager | undefined;
