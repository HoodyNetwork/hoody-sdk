// Every request the vault page may make, declared once. The two routes that carry a value (read one entry,
// write one entry) are core's (vaultKeyRoute, vaultKeyPutRoute: declared secret, shared with the realm
// nicknames in core/realm.ts); the page always calls them with a scrub of its own (data.ts).
//
// /vault is base-only (core/api.ts BASE_ONLY): the partition is chosen by the realm_id query alone. Global sends
// none; a realm sends its 24-hex id (logic.ts partitionQuery). Nothing here carries a value: the list and the
// stats are metadata, and a delete or a clear sends only a name.
import { defineRoute, vaultKeyPutRoute, vaultKeyRoute } from '@core';

const p = { scope: 'base', query: ['realm_id'] } as const;

export const routes = {
  list: defineRoute({ method: 'GET', path: '/vault/keys', ...p }),
  stats: defineRoute({ method: 'GET', path: '/vault/stats', ...p }),
  read: vaultKeyRoute,
  put: vaultKeyPutRoute,
  remove: defineRoute({ method: 'DELETE', path: '/vault/keys/:key', ...p, codes: ['INSUFFICIENT_PERMISSIONS'] }),
  clear: defineRoute({ method: 'DELETE', path: '/vault', ...p, codes: ['INSUFFICIENT_PERMISSIONS'] }),
} as const;
