// The snapshot requests of the computers page, declared once. Nothing else leaves this folder.
// A snapshot is taken synchronously and has no idempotency key, so a lost answer is read back through the list,
// never sent again. A computer made from a snapshot is the API's copy with source_snapshot (asynchronous: the new
// computer shows in the list as copying), proved by its name in the list like the page's own copy. A deleted snapshot
// is proved by a fresh list without it. A restore is proved by the snapshot's moved last_used_at, a rename by the new
// alias in a fresh list.
import { defineRoute } from '@core';

export const snapshotRoutes = {
  list: defineRoute({ method: 'GET', path: '/computers/:id/snapshots', scope: 'realm' }),
  create: defineRoute({ method: 'POST', path: '/computers/:id/snapshots', scope: 'realm', body: ['alias', 'expiry'] }),
  remove: defineRoute({ method: 'DELETE', path: '/computers/:id/snapshots/:name', scope: 'realm' }),
  // A restore replaces the computer's files and settings with the snapshot's: sent once, a lost answer is read back
  // through the snapshot's last_used_at, which the API moves when a restore reaches it.
  restore: defineRoute({ method: 'PATCH', path: '/computers/:id/snapshots/:name', scope: 'realm', body: [] }),
  rename: defineRoute({ method: 'PATCH', path: '/computers/:id/snapshots/:name/alias', scope: 'realm', body: ['alias'] }),
  copyFrom: defineRoute({
    method: 'POST', path: '/computers/:id/copy', scope: 'realm', body: ['name', 'target_project_id', 'target_server_id', 'source_snapshot'],
  }),
} as const;
