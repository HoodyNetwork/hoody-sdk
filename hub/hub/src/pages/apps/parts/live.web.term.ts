// live.ts's storage hearing in the terminal: another context's writes come from hostEnv().onExternalChange; the
// handler reads only the key (null = the area was cleared), as the web StorageEvent gives it.
import { hostEnv } from '@core';
import type * as Web from './live.web';

export const listenStorage: typeof Web.listenStorage = (on) =>
  hostEnv().onExternalChange((_area, key) => on({ key } as StorageEvent));
