// The storage share requests of the Files page, declared once. Nothing else leaves this folder.
// A share hands one folder of one computer to another computer of the same owner. The API has no idempotency key on
// create, so a create is sent once and a lost answer is read back through the source computer's list on
// source_path + target, never sent again: the row exists even after a 500 sync failure. Only the owner of both
// computers may share (the API answers 403/404 otherwise); a project-wide target is refused under a realm, so the Hub
// sends target_computer_id only.
import { defineRoute } from '@core';

export const shareRoutes = {
  // createStorageShare: 201 = configured, never mounted (a host applies it later).
  create: defineRoute({
    method: 'POST', path: '/computers/:id/storage/shares', scope: 'realm', body: ['source_path', 'mode', 'target_computer_id', 'expires_at'],
  }),
  // listStorageShares: the shares this computer gives; expired rows only with include_expired.
  list: defineRoute({ method: 'GET', path: '/computers/:id/storage/shares', scope: 'realm', query: ['include_expired'] }),
  // getStorageShareById: 404 when :id is not the share's source.
  get: defineRoute({ method: 'GET', path: '/computers/:id/storage/shares/:shareId', scope: 'realm' }),
  // updateStorageShare: enabled:true also retries a failed share.
  update: defineRoute({ method: 'PATCH', path: '/computers/:id/storage/shares/:shareId', scope: 'realm', body: ['mode', 'enabled', 'expires_at'] }),
  // deleteStorageShare: the row goes at once; access ends when the servers finish, usually within minutes.
  remove: defineRoute({ method: 'DELETE', path: '/storage/shares/:shareId', scope: 'realm' }),
  // getIncomingShares: the shares this computer receives (receiver view: no alias, label, description).
  incoming: defineRoute({ method: 'GET', path: '/computers/:id/storage/incoming', scope: 'realm' }),
  // getAllIncomingShares: every share the caller's computers receive.
  allIncoming: defineRoute({ method: 'GET', path: '/storage/incoming', scope: 'realm' }),
  // listAllStorageShares: every share the caller's computers give.
  allShares: defineRoute({ method: 'GET', path: '/storage/shares', scope: 'realm' }),
  // toggleIncomingShareMount: hide or show a received share on this computer. Not offered until the incoming rows
  // say which way it is set.
  mount: defineRoute({ method: 'PATCH', path: '/computers/:id/storage/incoming/:shareId/mount', scope: 'realm', body: ['mount'] }),
} as const;
