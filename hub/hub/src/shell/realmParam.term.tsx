// A realm asked for by a link (?open_realm=), in a terminal: the web's rules (realmParam.shared.tsx) on a memory
// history, which has no browser moves of its own (no popstate). RealmWait draws the page area's skeleton while the
// shell switches; the switch line in the status bar is the one announcement, as on the web.
import type * as Web from './realmParam';
import { Skeleton } from '@kit/states/States';
import { createUseRealmParam } from './realmParam.shared';
import { Box } from '../term/prim';

export { OPEN_REALM } from './realmParam.shared';

export const useRealmParam: typeof Web.useRealmParam = createUseRealmParam(() => () => {});

export const RealmWait: typeof Web.RealmWait = () => (
  <Box dir="column" grow={1}>
    <Skeleton variant="detail" rows={8} />
  </Box>
);
