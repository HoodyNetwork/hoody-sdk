// The realms page's routes: every computer of the account (base host, page by page), one computer's fresh realms,
// and a computer's whole realm set. A realm itself has no route: its name lives in the vault (core setRealmAlias).
import { REALM_LIMIT_CODE, accountContainersRoute, defineRoute } from '@core';

export const routes = {
  // Core's own route object for the account-wide list (fixture rules match by route object).
  computers: accountContainersRoute,
  computer: defineRoute({ method: 'GET', path: '/computers/:id', scope: 'base' }),
  // A new realm past the account's Realm limit is refused (nothing changed).
  setRealms: defineRoute({ method: 'PUT', path: '/computers/:id', scope: 'base', body: ['realm_ids'], codes: [REALM_LIMIT_CODE] }),
} as const;
