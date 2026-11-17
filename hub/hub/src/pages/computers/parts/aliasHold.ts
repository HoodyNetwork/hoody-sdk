// Who sent an alias change the Remove alias drawer sees under the shared lock (core aliasLock), when core cannot
// tell (a change recorded before core named senders: heldBy undefined). Scripts' enable/disable names the alias
// with its new state ({alias, enabled}); a remove names only the alias and is taken as this page's.
import type { HeldFrom } from '@core';
import { links as scriptsLinks } from '../../scripts/links';

export function aliasSender(identity: Readonly<Record<string, unknown>>): HeldFrom | null {
  return typeof identity.enabled === 'boolean' ? { page: 'scripts', path: scriptsLinks.list } : null;
}
