// routePerms.ts: what a shared-access (token) session needs on the Hoody API for each base and realm route the Hub
// declares. Keyed `METHOD /template` exactly as defineRoute declares it. An entry with a comment states the server
// check it mirrors, so a change on either side is checked against the other
// (routePerms.test.ts: every declared base/realm route has an entry; every entry names a declared route).
//
// Need:
//   - a leaf ('computers.actions.restart'): the token must hold exactly that leaf (the server's check
//     walks the dotted path and wants `true` at its end; a parent `true` grants nothing);
//   - several leaves: all of them;
//   - { param, map }: the leaf depends on that path segment (the lifecycle verb); a value not in the map needs nothing
//     known here (the server answers for it);
//   - 'never': no auth token is served (sign-in-session-only routes, the 2FA group, account writes);
//   - { realmBound: 'never', leaf }: a token limited to realms is refused outright; an unrestricted one needs `leaf`;
//   - null: nothing beyond computers.read and projects.read, which every valid session holds.
// 'resources.vault' and 'resources.events' also need the token's vault_access / event_access flags: token.ts
// capsOf reads those pairs, as the server does.
// Checks that depend on a body value (an SSH key in a computer update, kit features at create, a snapshot source on
// a copy) are not modelled: the server refuses those itself and tokenRefused names the leaf from its answer.

export type RouteNeed =
  | string
  | readonly string[]
  | { readonly param: string; readonly map: Readonly<Record<string, string>> }
  | 'never'
  | { readonly realmBound: 'never'; readonly leaf: string | null }
  | null;

export const ROUTE_PERMS: Readonly<Record<string, RouteNeed>> = {
  'GET /realms': 'resources.realms',
  // also needs the token flag vault_access=true (same check)
  'GET /vault/keys/:key': 'resources.vault',
  // also needs the token flag vault_access=true (same check); the terminal's alias read-back (term/app/live-wire.ts)
  'GET /vault/keys/hoody.realm-aliases': 'resources.vault',
  // also needs the token flag vault_access=true (same check)
  'PUT /vault/keys/:key': 'resources.vault',
  // projects.read only
  'GET /projects': null,
  // self-introspection, exempt from the token-management gate
  'GET /auth/tokens/me': null,
  // computers.read only; ?include_proxy_permissions (not sent) would need resources.proxy_aliases
  'GET /computers': null,
  //  · Hub test-fixture marker route (never sent); no server route exists. Fixture builds only: fixture-boot.ts declares
  //    it, and a production build has no fixture boot (hub:build's fixture-marker scan)
  ...(__HUB_FIXTURES__ ? { 'GET /__fixture/session': null, 'GET /__fixture/realms': null } : {}),
  // realm-bound tokens refused outright; unrestricted tokens need resources.read_account
  'GET /notifications/summary': { realmBound: 'never', leaf: 'resources.read_account' },
  // realm-bound tokens refused outright; unrestricted tokens need resources.read_account
  'GET /notifications': { realmBound: 'never', leaf: 'resources.read_account' },
  // every auth token refused (2FA group hook)
  'POST /users/auth/2fa/verify-setup': 'never',
  // every auth token refused
  'DELETE /users/auth/2fa': 'never',
  // no gate; profile reduced to the identity allowlist without resources.read_account
  'GET /users/auth/me': null,
  // unauthenticated
  'GET /ip': null,
  // authenticate only (a signed-in caller; no token leaf)
  'GET /ip/lookup': null,
  'GET /proxy/aliases': 'resources.proxy_aliases',
  'POST /proxy/aliases': 'resources.proxy_aliases',
  'PATCH /proxy/aliases/:id/state': 'resources.proxy_aliases',
  'DELETE /proxy/aliases/:id': 'resources.proxy_aliases',
  'PATCH /proxy/aliases/:id': 'resources.proxy_aliases',
  'GET /offers': 'financial.server_rental.view_marketplace',
  'GET /servers/available': 'financial.server_rental.view_marketplace',
  // the owner-or-token guard refuses Basic/impersonation only
  'POST /offers/:id/reserve': 'financial.server_rental.rent_servers',
  'POST /servers/:id/rent': 'financial.server_rental.rent_servers',
  'GET /reservations': 'financial.billing.read',
  'GET /reservations/:id': 'financial.billing.read',
  // no gate; amount/transaction omitted without financial.billing.read, capacity gauge never shown to tokens
  'GET /rentals': null,
  // realm-bound tokens refused outright; unrestricted tokens need financial.wallet.read
  'GET /wallet/balances': { realmBound: 'never', leaf: 'financial.wallet.read' },
  'GET /wallet/payment-availability': 'financial.wallet.read',
  // refused on a realm host; every auth token refused
  'GET /wallet/github-bonus': 'never',
  // every auth token refused
  'GET /wallet/payments/card/intents/:id': 'never',
  // every auth token refused
  'GET /wallet/payments/crypto/intents/:id': 'never',
  // balances in the answer hidden without financial.wallet.read or for realm-bound tokens
  'POST /wallet/transfers': 'financial.wallet.transfer',
  // refused on a realm host; every auth token refused
  'POST /wallet/github-bonus/claim': 'never',
  // every auth token refused
  'POST /wallet/payments/card/checkout': 'never',
  // every auth token refused
  'POST /wallet/payments/crypto/invoice': 'never',
  // unauthenticated
  'GET /meta/subserver-plans': null,
  'GET /subserver-plans': 'financial.server_rental.view_marketplace',
  // cap.used dropped for realm-bound tokens
  'GET /subserver-subscriptions/quote': 'financial.billing.read',
  // the same check as the purchase quote
  'GET /subserver-subscriptions/regions': 'financial.billing.read',
  'POST /subserver-subscriptions': 'financial.subscriptions.purchase',
  'GET /subserver-subscriptions/:id/quote': 'financial.billing.read',
  'POST /subserver-subscriptions/:id/pay': 'financial.subscriptions.purchase',
  'POST /subserver-subscriptions/:id/upgrade': 'financial.subscriptions.purchase',
  // needed for both on and off
  'PUT /subserver-subscriptions/:id/auto-renew': 'financial.subscriptions.purchase',
  'GET /subserver-subscriptions': 'financial.billing.read',
  'GET /subserver-subscriptions/:id': 'financial.billing.read',
  'GET /users/me/free-tier-status': 'resources.read_account',
  // every auth token refused
  'POST /users/me/redeem-invite': 'never',
  // refused on a realm host; every auth token refused
  'POST /users/me/retry-setup': 'never',
  // refused on a realm host; every auth token refused
  'POST /users/me/email-change': 'never',
  // same guards as the request
  'DELETE /users/me/email-change': 'never',
  // delegation gate; the child cannot exceed the creator (TOKEN_CEILING_EXCEEDED)
  'POST /auth/tokens': 'resources.create_tokens',
  // leaf by :op
  'POST /computers/:id/:op': { param: 'op', map: { 'start': 'computers.actions.start', 'resume': 'computers.actions.start', 'stop': 'computers.actions.stop', 'force-stop': 'computers.actions.stop', 'pause': 'computers.actions.stop', 'restart': 'computers.actions.restart' } },
  // computers.read only; ?include_proxy_permissions (not sent) would need resources.proxy_aliases
  'GET /computers/:id': null,
  // computers.read only
  'GET /computers/:id/stats': null,
  // computers.read only
  'GET /projects/:pid/stats': null,
  // no gate; money fields omitted without financial.billing.read
  'GET /servers': null,
  // realm-bound tokens refused outright; unrestricted tokens need only computers.read
  'GET /users/me/free-ai-usage': { realmBound: 'never', leaf: null },
  'GET /computers/:id/proxy/permissions': 'resources.proxy_aliases',
  // body-conditional: realm_ids (pages/computers setRealms, pages/realms) → refused outright for realm-bound tokens, unrestricted tokens need only computers.update; non-empty ssh_public_key → also resources.ssh_keys, null (removal) needs nothing more; ai:true (not sent) → computers.features.ai; name → computers.update only
  'PUT /computers/:id': 'computers.update',
  // turning KVM on also needs computers.features.kvm (body-conditional: kvm true); turning it off needs nothing more
  'PUT /computers/:id/kvm': 'computers.update',
  // computers.read only (values would need computers.features.env_values; the Hub wipes them unread)
  'GET /computers/:id/env': null,
  'PUT /computers/:id/env/:key': 'computers.update',
  'DELETE /computers/:id/env/:key': 'computers.update',
  // computers.read too (always held); source_snapshot (snapshots copyFrom) → also computers.features.snapshots; copy_firewall_rules → resources.firewalls, copy_network_rules → computers.features.networking (not sent by the Hub); kvm → computers.features.kvm; a realm-bound token needs a realm host
  'POST /computers/:id/copy': 'computers.create',
  'DELETE /computers/:id': 'computers.delete',
  // conditional: ai:true → computers.features.ai, hoody_kit:true → computers.features.hoody_kit (omitted flags default off for a token lacking them); kvm:true → computers.features.kvm; non-empty ssh_public_key → resources.ssh_keys; a realm-bound token may not put realm_ids other than the request realm
  'POST /projects/:pid/computers': 'computers.create',
  'POST /projects': 'projects.create',
  'PUT /projects/:pid': 'projects.update',
  'DELETE /projects/:pid': 'projects.delete',
  // computers.read only
  'GET /projects/:pid/computers': null,
  // projects.read only; ?include_permissions (not sent by the Hub) would need one of projects.members.*
  'GET /projects/:pid': null,
  // the server takes any one of
  // projects.members.invite/remove/change_roles (no OR form here: one of them is recorded); no realm-scope check on
  // this read. The Hub sends it on account sessions only (pages/computers/parts/projectPerms.logic.ts, key sessions)
  'GET /projects/:pid/permissions': 'projects.members.invite',
  // write rate limit + the credential-mint guard (2FA);
  // the leaf, plus unscoped project authority: a realm scope or
  // a realm-limited token is refused outright
  'POST /projects/:pid/permissions': { realmBound: 'never', leaf: 'projects.members.invite' },
  // write rate limit; then the leaf, unscoped authority
  'PUT /projects/:pid/permissions/:mid': { realmBound: 'never', leaf: 'projects.members.change_roles' },
  // write rate limit; then the leaf, unscoped authority
  'DELETE /projects/:pid/permissions/:mid': { realmBound: 'never', leaf: 'projects.members.remove' },
  // the read returns the
  // credentials that open every computer of the project: any realm scope or realm-limited token is refused outright
  'GET /projects/:pid/proxy/permissions': { realmBound: 'never', leaf: 'resources.proxy_aliases' },
  // write rate limit +
  // the credential-mint guard; then the leaf,
  // then the manage check: unscoped project authority, as the read
  'PUT /projects/:pid/proxy/permissions': { realmBound: 'never', leaf: 'resources.proxy_aliases' },
  // the same guards; then the leaf,
  // then the manage check
  'DELETE /projects/:pid/proxy/permissions': { realmBound: 'never', leaf: 'resources.proxy_aliases' },
  'GET /computers/:id/firewall/rules': 'resources.firewalls',
  'POST /computers/:id/firewall/reset': 'resources.firewalls',
  'POST /computers/:id/firewall/ingress': 'resources.firewalls',
  'POST /computers/:id/firewall/egress': 'resources.firewalls',
  'DELETE /computers/:id/firewall/ingress': 'resources.firewalls',
  'DELETE /computers/:id/firewall/egress': 'resources.firewalls',
  'PATCH /computers/:id/firewall/ingress': 'resources.firewalls',
  'PATCH /computers/:id/firewall/egress': 'resources.firewalls',
  'PUT /computers/:id/proxy/permissions': 'resources.proxy_aliases',
  'PUT /computers/:id/proxy/permissions/groups/:groupName/password': 'resources.proxy_aliases',
  'PUT /computers/:id/proxy/permissions/groups/:groupName/token': 'resources.proxy_aliases',
  'PUT /computers/:id/proxy/permissions/permissions/:groupName': 'resources.proxy_aliases',
  'PATCH /computers/:id/proxy/permissions/default': 'resources.proxy_aliases',
  // "Use only the project's rules"
  'DELETE /computers/:id/proxy/permissions': 'resources.proxy_aliases',
  'DELETE /computers/:id/proxy/permissions/groups/:groupName': 'resources.proxy_aliases',
  // refused on a realm host; every auth token refused
  'GET /rentals/:id/runtime': 'never',
  // every auth token refused
  'GET /servers/:id/available-commands': 'never',
  // every auth token refused
  'POST /servers/:id/execute-command': 'never',
  // plus computers.read (always held)
  'GET /computers/:id/snapshots': 'computers.features.snapshots',
  'POST /computers/:id/snapshots': ['computers.update', 'computers.features.snapshots'],
  'DELETE /computers/:id/snapshots/:name': ['computers.update', 'computers.features.snapshots'],
  // server declares PUT; PATCH reaches it through the global PUT→PATCH alias
  'PATCH /computers/:id/snapshots/:name': ['computers.update', 'computers.features.snapshots'],
  // server declares PUT; PATCH via the PUT→PATCH alias
  'PATCH /computers/:id/snapshots/:name/alias': ['computers.update', 'computers.features.snapshots'],
  // Storage shares (pages/files/shares/routes.ts). Every handler checks resources.storage_shares first; the
  // owner of both computers only on top (others 403/404).
  'POST /computers/:id/storage/shares': 'resources.storage_shares',
  'GET /computers/:id/storage/shares': 'resources.storage_shares',
  'GET /computers/:id/storage/shares/:shareId': 'resources.storage_shares',
  'PATCH /computers/:id/storage/shares/:shareId': 'resources.storage_shares',
  'DELETE /storage/shares/:shareId': 'resources.storage_shares',
  'GET /computers/:id/storage/incoming': 'resources.storage_shares',
  'GET /storage/incoming': 'resources.storage_shares',
  'GET /storage/shares': 'resources.storage_shares',
  'PATCH /computers/:id/storage/incoming/:shareId/mount': 'resources.storage_shares',
  // owner-only on top (collaborators refused)
  'GET /bot-urls': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'GET /bot-urls/:id': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'GET /bot-urls/suggest-label': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'POST /bot-urls': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'PATCH /bot-urls/:id': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'POST /bot-urls/:id/repoint': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'DELETE /bot-urls/:id': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'POST /bot-urls/:id/panic': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'POST /bot-urls/:id/keys': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'PATCH /bot-urls/:id/keys/:keyId': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'POST /bot-urls/:id/keys/:keyId/rotate': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'DELETE /bot-urls/:id/keys/:keyId': 'resources.bot_urls',
  // owner-only on top (collaborators refused)
  'POST /bot-urls/:id/keys/revoke-all': 'resources.bot_urls',
  // delegation gate; lists only the token\'s own subtree
  'GET /auth/tokens': 'resources.create_tokens',
  // every auth token refused
  'GET /users/auth/2fa/status': 'never',
  // refused on a realm host; every auth token refused
  'GET /users/auth/sessions': 'never',
  // account write: every auth token refused
  'PUT /users/:id': 'never',
  // every auth token refused
  'POST /users/auth/2fa/setup': 'never',
  // every auth token refused
  'POST /users/auth/2fa/backup-codes/regenerate': 'never',
  // every auth token refused
  'PUT /users/auth/2fa/token-gate': 'never',
  // refused on a realm host; every auth token refused
  'DELETE /users/auth/sessions/:id': 'never',
  // refused on a realm host; every auth token refused
  'POST /users/auth/sessions/revoke-others': 'never',
  'GET /users/me/security-history': 'resources.read_account',
  // refused on a realm host; every auth token refused
  'PUT /notifications/:id/read': 'never',
  // refused on a realm host; every auth token refused
  'PUT /notifications/read-all': 'never',
  // realm-bound tokens refused outright; unrestricted tokens need resources.read_account
  'GET /abuse-notices': { realmBound: 'never', leaf: 'resources.read_account' },
  // realm-bound tokens refused outright; unrestricted tokens need resources.read_account
  'GET /abuse-notices/:id': { realmBound: 'never', leaf: 'resources.read_account' },
  // every auth token refused
  'POST /abuse-notices/:id/messages': 'never',
  // also needs the token flag event_access=true
  'GET /events': 'resources.events',
  // also the token flag event_access must not be false
  'GET /users/auth/activity': 'resources.events',
  // computers.read only
  'GET /computers/:cid': null,
  // not a delegation route: every auth token refused
  'GET /auth/tokens/templates': 'never',
  // delegation gate; own subtree only
  'GET /auth/tokens/:id': 'resources.create_tokens',
  // delegation gate; own subtree only
  'POST /auth/tokens/:id/copy': 'resources.create_tokens',
  // delegation gate; own subtree only (both the setEnabled and the update declarations)
  'PUT /auth/tokens/:id': 'resources.create_tokens',
  // delegation gate; own subtree only
  'DELETE /auth/tokens/:id': 'resources.create_tokens',
  // also needs the token flag vault_access=true (same check)
  'GET /vault/keys': 'resources.vault',
  // also needs the token flag vault_access=true (same check)
  'GET /vault/stats': 'resources.vault',
  // also needs the token flag vault_access=true (same check)
  'DELETE /vault/keys/:key': 'resources.vault',
  // also needs the token flag vault_access=true (same check)
  'DELETE /vault': 'resources.vault',
  // served by POST /computers/:id/:operation
  'POST /computers/:id/start': 'computers.actions.start',
  // realm-bound tokens refused outright; unrestricted tokens need financial.wallet.read
  'GET /referrals/me': { realmBound: 'never', leaf: 'financial.wallet.read' },
  // every auth token refused
  'GET /referrals/me/codes/check': 'never',
  // every auth token refused
  'POST /referrals/me': 'never',
  // every auth token refused
  'POST /referrals/me/codes': 'never',
  // every auth token refused
  'DELETE /referrals/me/codes/:code': 'never',
  // refused on a realm host; realm-bound tokens refused outright; resources.support, every member route
  'GET /support/tickets': { realmBound: 'never', leaf: 'resources.support' },
  // as above
  'GET /support/tickets/:id': { realmBound: 'never', leaf: 'resources.support' },
  // as above
  'POST /support/tickets': { realmBound: 'never', leaf: 'resources.support' },
  // as above
  'POST /support/tickets/:id/messages': { realmBound: 'never', leaf: 'resources.support' },
  // as above
  'POST /support/tickets/:id/close': { realmBound: 'never', leaf: 'resources.support' },
  // as above
  'GET /support/limits': { realmBound: 'never', leaf: 'resources.support' },
};

/** What a token lacks for one call: the first leaf it does not hold, 'never' (no token is served), or null (it may
 *  send). `holds(leaf)` answers for the session's caps; `realmBound` is whether the token is limited to realms; `path`
 *  is the filled path (a { param } need reads its segment). A route with no entry needs nothing known here. */
export function lackOf(method: string, template: string, path: string, holds: (leaf: string) => boolean, realmBound: boolean): string | 'never' | null {
  if (!Object.hasOwn(ROUTE_PERMS, method + ' ' + template)) return null;
  const need = ROUTE_PERMS[method + ' ' + template];
  if (need === null || need === undefined) return null;
  if (need === 'never') return 'never';
  if (typeof need === 'string') return holds(need) ? null : need;
  if (Array.isArray(need)) { for (const l of need as readonly string[]) if (!holds(l)) return l; return null; }
  if ('realmBound' in need) return realmBound ? 'never' : need.leaf && !holds(need.leaf) ? need.leaf : null;
  const p = need as { param: string; map: Readonly<Record<string, string>> };
  const at = template.split('/').indexOf(':' + p.param);
  const seg = at === -1 ? undefined : path.split('/')[at];
  const leaf = seg !== undefined && Object.hasOwn(p.map, seg) ? p.map[seg] : undefined;
  return leaf && !holds(leaf) ? leaf : null;
}

/** Leaves the server checks on a body value only (not modelled above): named when its 403 says so. */
export const BODY_LEAVES: readonly string[] = [
  'resources.ssh_keys', 'computers.features.ai', 'computers.features.hoody_kit', 'computers.features.kvm',
  'computers.features.snapshots', 'computers.features.networking', 'computers.features.env_values',
  'computers.actions.exec', 'computers.actions.logs',
];

/** Every leaf the table names, and the body-checked ones (labels: kit/states/strings.en.json perm.<leaf>.do and
 *  .right; routePerms.test.ts holds them together). */
/** The server's own fixed 403 sentences that name one right each, so a refusal names the
 *  right the server checked, never one guessed from caps that may be stale. Exact match only. Three sentences are
 *  left out because one sentence covers several rights: "to authorize computers" (computers.read and
 *  computers.actions.exec in one loop), "to manage project members"
 *  (any of three), "to manage environment variables" (the right is a
 *  parameter): those refusals read in the general words. The plain form
 *  "This token does not have permission: <leaf>" is read by token.ts. */
export const LACKS_SENTENCES: Readonly<Record<string, string>> = {
  'This token does not have permission to access activity logs': 'resources.events',
  'This token does not have permission to access computer snapshots': 'computers.features.snapshots',
  'This token does not have permission to access events': 'resources.events',
  'This token does not have permission to buy or change subscriptions': 'financial.subscriptions.purchase',
  'This token does not have permission to change project member roles': 'projects.members.change_roles',
  'This token does not have permission to copy firewall rules': 'resources.firewalls',
  'This token does not have permission to copy network rules': 'computers.features.networking',
  'This token does not have permission to create AI-enabled computers': 'computers.features.ai',
  'This token does not have permission to create computers': 'computers.create',
  'This token does not have permission to create hoody_kit-enabled computers': 'computers.features.hoody_kit',
  'This token does not have permission to create projects': 'projects.create',
  'This token does not have permission to delete computers': 'computers.delete',
  'This token does not have permission to delete projects': 'projects.delete',
  'This token does not have permission to download invoices': 'financial.billing.download_invoices',
  'This token does not have permission to enable AI features on computers': 'computers.features.ai',
  'This token does not have permission to enable KVM (computers.features.kvm).': 'computers.features.kvm',
  'This token does not have permission to extend rentals': 'financial.server_rental.extend_rentals',
  'This token does not have permission to generate invoices': 'financial.billing.download_invoices',
  'This token does not have permission to invite project members': 'projects.members.invite',
  'This token does not have permission to list realms': 'resources.realms',
  'This token does not have permission to manage Bot URLs': 'resources.bot_urls',
  'This token does not have permission to manage SSH keys': 'resources.ssh_keys',
  'This token does not have permission to manage computer snapshots': 'computers.features.snapshots',
  'This token does not have permission to manage firewall rules': 'resources.firewalls',
  'This token does not have permission to manage payment methods': 'financial.billing.manage_payment_methods',
  'This token does not have permission to manage proxy aliases': 'resources.proxy_aliases',
  'This token does not have permission to manage proxy permissions': 'resources.proxy_aliases',
  'This token does not have permission to manage storage shares': 'resources.storage_shares',
  'This token does not have permission to modify computer networking': 'computers.features.networking',
  'This token does not have permission to provision projects': 'projects.update',
  'This token does not have permission to read billing': 'financial.billing.read',
  'This token does not have permission to read computers': 'computers.read',
  'This token does not have permission to read projects': 'projects.read',
  'This token does not have permission to read proxy permissions': 'resources.proxy_aliases',
  'This token does not have permission to read reservations': 'financial.billing.read',
  'This token does not have permission to remove project members': 'projects.members.remove',
  'This token does not have permission to rent servers': 'financial.server_rental.rent_servers',
  'This token does not have permission to spend wallet funds': 'financial.wallet.transfer',
  'This token does not have permission to transfer wallet funds': 'financial.wallet.transfer',
  'This token does not have permission to update computers': 'computers.update',
  'This token does not have permission to update its public profile': 'resources.auth_token_public_profile',
  'This token does not have permission to update projects': 'projects.update',
  'This token does not have permission to view computer logs': 'computers.actions.logs',
  'This token does not have permission to view invoices': 'financial.billing.read',
  'This token does not have permission to view referral credit': 'financial.wallet.read',
  'This token does not have permission to view the marketplace': 'financial.server_rental.view_marketplace',
  'This token does not have permission to view the server rental marketplace': 'financial.server_rental.view_marketplace',
  'This token does not have permission to view wallet balances': 'financial.wallet.read',
  'This token does not have permission to view wallet transactions': 'financial.billing.read',
};

export function routeLeaves(): readonly string[] {
  const out = new Set<string>([...BODY_LEAVES, ...Object.values(LACKS_SENTENCES)]);
  for (const need of Object.values(ROUTE_PERMS)) {
    if (need === null || need === 'never') continue;
    if (typeof need === 'string') out.add(need);
    else if (Array.isArray(need)) for (const l of need as readonly string[]) out.add(l);
    else if ('realmBound' in need) { if (need.leaf) out.add(need.leaf); }
    else for (const l of Object.values((need as { map: Record<string, string> }).map)) out.add(l);
  }
  return [...out].sort();
}
