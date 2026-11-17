// allChats.web.term: in a terminal the screen is always shown, so the change feed reconnects at once (the host env's
// visibility, which a later host may make real).
import type * as Web from './allChats.web';
import { hostEnv } from '../../../core/host-env';

export const whenVisible: typeof Web.whenVisible = (go) => {
  const env = hostEnv();
  if (env.visible()) { go(); return () => {}; }
  let off = (): void => {};
  off = env.onVisibilityChange(() => { if (env.visible()) { off(); go(); } });
  return () => off();
};
