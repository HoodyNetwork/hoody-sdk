// The broadcaster's page visibility in the terminal: the host's (hostEnv().visible / onVisibilityChange).
import { hostEnv } from '@core';
import type * as Web from './broadcaster.web';

export const docVisibility: typeof Web.docVisibility = () => ({
  hidden: () => !hostEnv().visible(),
  on: (fn) => hostEnv().onVisibilityChange(fn),
});
