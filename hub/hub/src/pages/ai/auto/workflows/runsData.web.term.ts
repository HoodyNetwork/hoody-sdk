// runsData.web.term: the terminal's page visibility for useRuns. A terminal session's screen is shown while it runs, so
// the host env answers visible; a change it reports (none today) is followed, as data.web.term's useVisible does.
import { useEffect, useState } from 'react';
import type * as Web from './runsData.web';
import { hostEnv } from '../../../../core/host-env';

export const useTabVisible: typeof Web.useTabVisible = () => {
  const [v, setV] = useState(() => hostEnv().visible());
  useEffect(() => hostEnv().onVisibilityChange(() => setV(hostEnv().visible())), []);
  return v;
};
