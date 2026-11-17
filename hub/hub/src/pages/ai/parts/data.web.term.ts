// data.web.term: the terminal's page visibility and online state for the AI pane. A terminal session is one process with
// its screen always shown, so the host env answers visible; online follows the env's lifecycle events (a terminal
// session reports none, so it reads online and the reads' own failures say otherwise).
import { useEffect, useState } from 'react';
import type * as Web from './data.web';
import { hostEnv } from '../../../core/host-env';

export const useVisible: typeof Web.useVisible = () => {
  const [v, setV] = useState(() => hostEnv().visible());
  useEffect(() => hostEnv().onVisibilityChange(() => setV(hostEnv().visible())), []);
  return v;
};

export const useOnline: typeof Web.useOnline = () => {
  const [v, setV] = useState(true);
  useEffect(() => {
    const a = hostEnv().onLifecycle('online', () => setV(true));
    const b = hostEnv().onLifecycle('offline', () => setV(false));
    return () => { a(); b(); };
  }, []);
  return v;
};
