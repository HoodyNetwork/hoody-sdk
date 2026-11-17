// The Hub's own origin in the terminal: the web Hub's origin the host was given (hostEnv().pageAddress), else ''
// (no origin: a widget address is then judged on its own, as with an unreadable location on the web).
import { hostEnv } from '@core';
import type * as Web from './store.web';

export const hubOrigin: typeof Web.hubOrigin = () => hostEnv().pageAddress?.origin ?? '';
