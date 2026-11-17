// The terminal sibling of chat-attention.web.ts: whether the Hub is shown, from the host env (hostEnv().visible() and
// its change event) instead of document.visibilityState. A terminal host is always shown today; a host that knows
// better (a hidden pane) reports it through the same two members.
import { useEffect, useState } from 'react';
import type * as Web from './chat-attention.web';
import { hostEnv } from './host-env';

export const useVisible: typeof Web.useVisible = () => {
  const [v, setV] = useState(() => hostEnv().visible());
  useEffect(() => hostEnv().onVisibilityChange(() => { setV(hostEnv().visible()); }), []);
  return v;
};
