> _**SDK skill · `api` namespace** · ~45,493 tokens · hoody-sdk v1.0.0-beta.12_

# `api` — Platform control plane: identity, projects, containers, billing, vault

## Purpose

Control plane outside container kits. Owns identity (signup, login, OAuth, 2FA, auth tokens), project/container hierarchy, proxy permissions, network/firewall/storage, billing, rentals, encrypted user vault, pools. Also exposes account-wide notifications/events/activity inbox. All other namespaces depend on IDs/tokens minted here.

## When to use

- Authenticate users; mint auth tokens for headless sessions.
- Create/list/mutate/destroy projects, containers, snapshots, proxy-aliases.
- Grant/revoke project/container access; set proxy auth (password/token/JWT/IP).
- Wallet, billing, rental ops.
- User-scoped encrypted vault.
- Account-wide notification/event/activity queries.

## When NOT to use

- File I/O, shell/program, SQLite, GUI/browser, background processes, agent runtime — use `files`, `terminal`/`exec`, `sqlite`, `display`/`browser`, `daemon`, `agent` respectively.

## Prerequisites

- Control plane at `https://api.hoody.com`.
- Bearer token in `Authorization`. Mint via `authentication.login` (1d JWT / 7d refresh) or `authTokens.create` (long-lived, scopable).
- 2FA mutations have varying auth: `tfa.setup` needs password only; `tfa.verifySetup` needs OTP code only; `tfa.verify` needs `temp_token` + code; `tfa.disable` needs password + OTP **or** backup code; `tfa.regenerateBackupCodes` needs password + a **6-digit TOTP only** (`^\\d{6}$` — backup codes are rejected with 400).
- Project/container writes: project owner or matching permission row.
- Billing writes: registered payment method.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap (signup → verify → login [+2FA])

1. `client.api.authentication.signup`
2. `client.api.authentication.verifyEmail`
3. `client.api.authentication.login`
4. `client.api.tfa.verify` (if 2FA enabled — uses `temp_token`)
5. `client.api.authentication.getCurrentUser`

### 2. Mint a long-lived auth token

1. `client.api.authTokens.create`
2. `client.api.authTokens.list`
3. `client.api.authTokens.addRealm`
4. `client.api.authTokens.removeRealm`
5. `client.api.authTokens.copy`
6. `client.api.authTokens.delete`

### 3. Set up 2FA

1. `client.api.tfa.setup`
2. `client.api.tfa.verifySetup`
3. `client.api.tfa.getStatus`
4. `client.api.tfa.regenerateBackupCodes`
5. `client.api.tfa.setTokenGate`

### 4. Create first project + container

Read kit URLs by getting the container with `include_proxy_domains` set to `true` (`containers.get(id, { include_proxy_domains: "true" })`) — the `proxy_domains` array is only populated when `include_proxy_domains` is passed.
1. `client.api.realms.list`
2. `client.api.images.list`
3. `client.api.projects.create`
4. `client.api.containers.create`
5. `client.api.containers.manage`
6. `client.api.containers.get`

### 5. Grant another user access

Project-scope analogues live under `proxyPermissionsProject.*`.
1. `client.api.projects.listPermissions`
2. `client.api.projects.addPermission`
3. `client.api.projects.updatePermission`
4. `client.api.projects.removePermission`
5. `client.api.proxyPermissionsContainer.setPasswordGroup`
6. `client.api.proxyPermissionsContainer.setTokenGroup`
7. `client.api.proxyPermissionsContainer.setJwtGroup`
8. `client.api.proxyPermissionsContainer.updateState`

### 6. Container exposure & shares

1. `client.api.containers.updateNetworkConfig`
2. `client.api.containers.startNetwork`
3. `client.api.firewall.addEgressRule`
4. `client.api.firewall.addIngressRule`
5. `client.api.proxyAliases.create`
6. `client.api.proxyAliases.setState`
7. `client.api.storageShares.create`
8. `client.api.storageShares.listIncoming` (container-scoped)
9. `client.api.storageShares.toggleIncomingMount`
10. `client.api.storageShares.delete`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `client.api.containers.createSnapshot`
2. `client.api.containers.listSnapshots`
3. `client.api.containers.restoreSnapshot`
4. `client.api.containers.copy`
5. `client.api.containers.deleteSnapshot`
6. `client.api.env.list`
7. `client.api.env.set`
8. `client.api.env.bulkSet`
9. `client.api.env.delete`
10. `client.api.containers.setContainerKvm` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `client.api.containers.create`.

### 8. Billing: wallet → rent

1. `client.api.wallet.addPaymentMethod`
2. `client.api.wallet.setDefaultPaymentMethod`
3. `client.api.wallet.createStripeCheckout` (crypto: `client.api.wallet.createCryptoInvoice`)
4. `client.api.wallet.getStripePaymentIntent` (crypto: `client.api.wallet.getCryptoPaymentIntent`)
5. `client.api.wallet.getAggregateBalances`
6. `client.api.wallet.transferToAi`
7. `client.api.wallet.listTransactions`
8. `client.api.serverRental.browse`
9. `client.api.serverRental.rent`
10. `client.api.rentals.list`
11. `client.api.rentals.extend`
12. `client.api.serverCommands.execute`

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `authentication.logout` is a logout-ALL for JWTs — it bumps `session_generation`, invalidating every access + refresh JWT issued before that moment (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `authTokens.delete`). `authentication.refreshToken` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header — the generated SDK / CLI auto-refresh only send the body, so the typed call typically 401s; for headless flows mint a long-lived `authTokens.create` instead, or call refresh manually with both the body and the header set to the same refresh token.
- `authentication.getAvailableRegions` returns `r.data.regions` (single-wrapped, like every other endpoint — older docs incorrectly called it doubly-wrapped).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user, the controller silently overwrites the password and re-sends the verification email; for a verified user it's a no-op. Do NOT probe with this.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — like every other kit it accepts the bare per-container kit URL directly, with no auth headers. The `containers.authorize(id)` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- Auth tokens rejected on admin endpoints (JWT only); `x-impersonate-user` JWT only.
- `containers.manage` polymorphic: `POST /api/v1/containers/{id}/{operation}` from `ContainerOperation` enum (not body field).
- No admin concept on user-owned resources; permission row IS the authorization.
- Kit URL `<projectId>-<containerId>-<kit>-1.<server>.containers.hoody.com` IS the credential; watch containerId leakage.
- `proxyDiscovery.listContainerProxyServices` returns `services: []` often; pass `program: 'exec'` to `proxyAliases.create`.
- `wallet.listInvoices` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `utilities.getIpInfo` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `storageShares.listIncoming(id)` is container-scoped; pass `containerId`.
- `verifyEmail` body has `token` + optional `response_mode` + `code_challenge` only — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `tfa.verify`.
- KVM (`PUT /containers/{id}/kvm`, field `kvm` on create/responses) is rented/dedicated (bare-metal) servers ONLY — free tier is hard-refused with 403, and the container must be STOPPED to toggle (409 otherwise). Canonical field is `kvm`; `dev_kvm` is an input-only alias (`kvm` wins; both present and disagreeing → 400). Default off.

## Common errors

- 400 — schema validation; login: "Username or email, and password are required".
- 401 — Bearer missing/malformed. JWTs require the literal `Bearer ` prefix; `hdy_…` auth tokens are also accepted bare (`Authorization: hdy_…`).
- 403 — missing permission row or `resources.*` flag.
- 404 — missing resource OR 403 masked.
- 409 — uniqueness (duplicate username, proxy-alias).
- 412 / 428 — prior step needed (payment method, email verification, 2FA).
- 422 — semantic validation (password complexity, region, rental_days).
- 429 — login 1000/30min (failures only), signup 5/hour, refresh 30/30min.
- 400 — `events` socket.io may return "Session ID unknown" when the client session expires.
- Always-200 — `forgotPassword`, `resendVerification`, duplicate-`signup`; do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

**Accessor:** `client.api`  |  **Import:** `import * as api from 'hoody-sdk/api'`

### `client.api.activity` (4) — Activity Logs

#### `getStats` — Get activity stats

```typescript
client.api.activity.getStats()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/auth/activity/stats`
**CLI:** `hoody activity stats`

---

#### `list` — Get activity logs

```typescript
client.api.activity.list(page?: integer, limit?: integer, start_date?: string, end_date?: string, errors_only?: string, min_status?: integer, max_status?: integer, method?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number |
| `limit` | `integer` | query | No | Results per page |
| `start_date` | `string` | query | No | Filter logs after this date |
| `end_date` | `string` | query | No | Filter logs before this date |
| `errors_only` | `string` | query | No | Show only errors (status >= 400) |
| `min_status` | `integer` | query | No | Minimum status code |
| `max_status` | `integer` | query | No | Maximum status code |
| `method` | `string` | query | No | Filter by HTTP method |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/auth/activity`
**CLI:** `hoody activity logs`

---

#### `listAll` — Get activity logs (collect all pages)

```typescript
client.api.activity.listAll(page?: integer, limit?: integer, start_date?: string, end_date?: string, errors_only?: string, min_status?: integer, max_status?: integer, method?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number |
| `limit` | `integer` | query | No | Results per page |
| `start_date` | `string` | query | No | Filter logs after this date |
| `end_date` | `string` | query | No | Filter logs before this date |
| `errors_only` | `string` | query | No | Show only errors (status >= 400) |
| `min_status` | `integer` | query | No | Minimum status code |
| `max_status` | `integer` | query | No | Maximum status code |
| `method` | `string` | query | No | Filter by HTTP method |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/users/auth/activity`
**CLI:** `hoody activity logs`

---

#### `listIterator` — Get activity logs (async iterator)

```typescript
client.api.activity.listIterator(page?: integer, limit?: integer, start_date?: string, end_date?: string, errors_only?: string, min_status?: integer, max_status?: integer, method?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number |
| `limit` | `integer` | query | No | Results per page |
| `start_date` | `string` | query | No | Filter logs after this date |
| `end_date` | `string` | query | No | Filter logs before this date |
| `errors_only` | `string` | query | No | Show only errors (status >= 400) |
| `min_status` | `integer` | query | No | Minimum status code |
| `max_status` | `integer` | query | No | Maximum status code |
| `method` | `string` | query | No | Filter by HTTP method |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/users/auth/activity`
**CLI:** `hoody activity logs`

---

### `client.api.ai` (1) — AI

#### `listModels` — List available AI models (Hoody catalog)

```typescript
client.api.ai.listModels()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/ai/models`
**CLI:** `hoody ai list`

---

### `client.api.authTokens` (14) — Auth Tokens

#### `addRealm` — Add realm to auth token

```typescript
client.api.authTokens.addRealm(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Auth token ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ realm_id*: string, otp_code: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/tokens/{id}/add-realm`
**CLI:** `hoody auth realms add`

---

#### `copy` — Copy auth token

```typescript
client.api.authTokens.copy(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token |
| `data` | `object` | body | Yes |  |

**Body:** `{ alias: string, expires_at: string | "today" | "tomorrow" | number | null, otp_code: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/tokens/{id}/copy`
**CLI:** `hoody auth copy`

---

#### `create` — Create a new auth token

```typescript
client.api.authTokens.create(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ alias: string, public_key: string | null, public_storage: object | null, ip_whitelist: string[] | string, permission_template: string, permissions: { containers: object, projects: object, financial: object, resources: object, admin: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, deny_reauthorization: bool, expires_at: string | "today" | "tomorrow" | number, otp_code: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/tokens`
**CLI:** `hoody auth create`

---

#### `delete` — Delete auth token

```typescript
client.api.authTokens.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/auth/tokens/{id}`
**CLI:** `hoody auth delete`

---

#### `get` — Get auth token by ID

```typescript
client.api.authTokens.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/auth/tokens/{id}`
**CLI:** `hoody auth get`

---

#### `getCurrent` — Get current auth token details

```typescript
client.api.authTokens.getCurrent()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/auth/tokens/me`
**CLI:** `hoody auth get-current`

---

#### `getPublicProfile` — Get auth token public profile by public key

```typescript
client.api.authTokens.getPublicProfile(public_key: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `public_key` | `string` | path | Yes | ED25519 public key to resolve |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/auth/tokens/public-profiles/{public_key}`
**CLI:** `hoody auth profile by-public-key`

---

#### `list` — List auth tokens

```typescript
client.api.authTokens.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/auth/tokens`
**CLI:** `hoody auth list`

---

#### `listAll` — List auth tokens (collect all pages)

```typescript
client.api.authTokens.listAll()
```

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/auth/tokens`
**CLI:** `hoody auth list`

---

#### `listAuthTokenPermissionTemplates` — List permission templates

```typescript
client.api.authTokens.listAuthTokenPermissionTemplates()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/auth/tokens/templates`

---

#### `listIterator` — List auth tokens (async iterator)

```typescript
client.api.authTokens.listIterator()
```

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/auth/tokens`
**CLI:** `hoody auth list`

---

#### `removeRealm` — Remove realm from auth token

```typescript
client.api.authTokens.removeRealm(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Auth token ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ realm_id*: string, otp_code: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/tokens/{id}/remove-realm`
**CLI:** `hoody auth realms remove`

---

#### `update` — Update auth token

```typescript
client.api.authTokens.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token to update |
| `data` | `object` | body | Yes |  |

**Body:** `{ alias: string, public_key: string | null, public_storage: object | null, ip_whitelist: string[] | string, permissions: { containers: object, projects: object, financial: object, resources: object, admin: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, expires_at: string | "today" | "tomorrow" | number | null, is_enabled: bool, otp_code: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/auth/tokens/{id}`
**CLI:** `hoody auth update`

---

#### `updatePublicProfile` — Update current auth token public profile

```typescript
client.api.authTokens.updatePublicProfile(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ public_key: string | null, public_storage: object | null } (at least one of: public_key | public_storage required)`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/auth/tokens/me/public-profile`
**CLI:** `hoody auth profile update`

---

### `client.api.authentication` (28) — Authentication

#### `api_issueIdentityClaim` — Issue a fresh audience-bound identity claim

```typescript
client.api.authentication.api_issueIdentityClaim(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ audience*: string, expires_in: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/identity-claim`

---

#### `forgotPassword` — Request password reset

```typescript
client.api.authentication.forgotPassword(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ email*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/forgot-password`
**CLI:** `hoody auth password forgot`

---

#### `getAvailableRegions` — Get available server regions

```typescript
client.api.authentication.getAvailableRegions()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/auth/available-regions`
**CLI:** `hoody auth regions`

---

#### `getCurrentUser` — Get current user profile

```typescript
client.api.authentication.getCurrentUser()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/auth/me`
**CLI:** `hoody auth profile current`

---

#### `getCurrentUserAlias` — Get current user profile (alias of /users/auth/me)

```typescript
client.api.authentication.getCurrentUserAlias()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/me`

---

#### `getOAuthConfig` — Get the public sign-in configuration

```typescript
client.api.authentication.getOAuthConfig()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/auth/config`

---

#### `githubOAuthCallback` — GitHub OAuth callback

```typescript
client.api.authentication.githubOAuthCallback(code?: string, state: string, error?: string, error_description?: string, error_uri?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `code` | `string` | query | No |  |
| `state` | `string` | query | Yes |  |
| `error` | `string` | query | No | Provider-side failure code (e.g. access_denied). Present instead of `code` when the user declines. |
| `error_description` | `string` | query | No |  |
| `error_uri` | `string` | query | No |  |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/auth/github/callback`
**CLI:** `hoody auth oauth github callback`

---

#### `githubOAuthRedirect` — Redirect to GitHub OAuth

```typescript
client.api.authentication.githubOAuthRedirect(client?: string, intent?: string, redirect_uri: string, code_challenge: string, invite_code?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `client` | `string` | query | No | Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Folded into the signed OAuth state so it survives the provider round trip. Unrecognised values are recorded as "unknown". |
| `intent` | `string` | query | No | OAuth intent: login (default). "star_check" is accepted but ignored (retired). |
| `redirect_uri` | `string` | query | Yes | Frontend URL to redirect to after OAuth completes (must be on an allowed domain) |
| `code_challenge` | `string` | query | Yes | PKCE code_challenge (base64url SHA-256 of code_verifier). Required — all OAuth flows must use PKCE post-migration. |
| `invite_code` | `string` | query | No | Optional invite code ("coupon") captured from the signup link. Normalized and hashed at redirect time — only the hash travels in the OAuth state, never the raw code. Memorized hash-only on a NEW account and applied automatically; not validated here. |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/auth/github`
**CLI:** `hoody auth oauth github redirect`

---

#### `googleOAuthCallback` — Google OAuth callback

```typescript
client.api.authentication.googleOAuthCallback(code?: string, state: string, error?: string, error_description?: string, error_uri?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `code` | `string` | query | No |  |
| `state` | `string` | query | Yes |  |
| `error` | `string` | query | No | Provider-side failure code (e.g. access_denied). Present instead of `code` when the user declines. |
| `error_description` | `string` | query | No |  |
| `error_uri` | `string` | query | No |  |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/auth/google/callback`
**CLI:** `hoody auth oauth google callback`

---

#### `googleOAuthRedirect` — Redirect to Google OAuth

```typescript
client.api.authentication.googleOAuthRedirect(client?: string, redirect_uri: string, code_challenge: string, invite_code?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `client` | `string` | query | No | Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Folded into the signed OAuth state so it survives the provider round trip. Unrecognised values are recorded as "unknown". |
| `redirect_uri` | `string` | query | Yes | Frontend URL to redirect to after OAuth completes (must be on an allowed domain) |
| `code_challenge` | `string` | query | Yes | PKCE code_challenge (base64url SHA-256 of code_verifier). Required — all OAuth flows must use PKCE post-migration. |
| `invite_code` | `string` | query | No | Optional invite code ("coupon") captured from the signup link. Normalized and hashed at redirect time — only the hash travels in the OAuth state, never the raw code. Memorized hash-only on a NEW account and applied automatically; not validated here. |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/auth/google`
**CLI:** `hoody auth oauth google redirect`

---

#### `login` — Login with username and password

```typescript
client.api.authentication.login(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ username: string, email: string, password*: string, response_mode: "intent" | "tokens", client: string, code_challenge: string } (at least one of: username | email required)`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/login`
**CLI:** `hoody auth login`

---

#### `logout` — Logout

```typescript
client.api.authentication.logout()
```

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/logout`
**CLI:** `hoody auth logout`

---

#### `oauthAuthorize` — Begin a PKCE OAuth authorization

```typescript
client.api.authentication.oauthAuthorize(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code_challenge*: string, redirect_uri*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/authorize`

---

#### `oauthCancelIntent` — Cancel a pending OAuth AuthIntent or 2FA temp_token

```typescript
client.api.authentication.oauthCancelIntent()
```

**Returns:** `void`  |  **HTTP:** `POST /api/v1/auth/intent/cancel`

---

#### `oauthDeviceAuthorize` — Start the device-leg OAuth (cookie + ticket gated)

```typescript
client.api.authentication.oauthDeviceAuthorize(ticket: string, provider: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ticket` | `string` | query | Yes |  |
| `provider` | `string` | query | Yes |  |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/auth/device/authorize`

---

#### `oauthDeviceCode` — Start a device authorization flow (RFC-8628-inspired)

```typescript
client.api.authentication.oauthDeviceCode(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ client_name: string, client: string, code_challenge: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/device/code`

---

#### `oauthDeviceDeny` — Refuse the device ('Don't authorize')

```typescript
client.api.authentication.oauthDeviceDeny(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ ticket*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/device/deny`

---

#### `oauthDeviceLogin` — Password sign-in for the device authorize step (cookie + ticket gated)

```typescript
client.api.authentication.oauthDeviceLogin(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ ticket*: string, username: string, email: string, password*: string } (at least one of: username | email required)`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/device/login`

---

#### `oauthDeviceToken` — Poll for device-flow tokens (RFC-8628-inspired)

```typescript
client.api.authentication.oauthDeviceToken(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ device_code*: string, code_verifier: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/device/token`

---

#### `oauthDeviceVerifyCode` — Confirm a device user_code (verification page)

```typescript
client.api.authentication.oauthDeviceVerifyCode(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ user_code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/device/verify_code`

---

#### `oauthExchange` — Exchange a PKCE authorization code for tokens

```typescript
client.api.authentication.oauthExchange(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string, code_verifier*: string, redirect_uri*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/exchange`

---

#### `oauthLaunchInitiate` — Initiate OAuth popup-handoff launch

```typescript
client.api.authentication.oauthLaunchInitiate(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ provider*: "github" | "google", client: string, code_challenge*: string, state_id*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/launch/initiate`

---

#### `oauthLaunchStart` — Start OAuth popup-handoff via single-use ticket

```typescript
client.api.authentication.oauthLaunchStart(ticket: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `ticket` | `string` | query | Yes | One-shot ticket from /launch/initiate response |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/auth/launch/start`

---

#### `refreshToken` — Refresh access token

```typescript
client.api.authentication.refreshToken(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ refreshToken*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/refresh`
**CLI:** `hoody auth refresh`

---

#### `resendVerification` — Resend verification email

```typescript
client.api.authentication.resendVerification(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ email*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/resend-verification`
**CLI:** `hoody auth email resend`

---

#### `resetPassword` — Reset password

```typescript
client.api.authentication.resetPassword(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ token*: string, password*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/reset-password`
**CLI:** `hoody auth password reset`

---

#### `signup` — Sign up with email and password

```typescript
client.api.authentication.signup(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ email*: string, password*: string, region: string, invite_code: string, client: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/signup`
**CLI:** `hoody auth signup`

---

#### `verifyEmail` — Verify email address

```typescript
client.api.authentication.verifyEmail(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ client: string, token*: string, response_mode: "intent" | "tokens", code_challenge: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/auth/verify-email`
**CLI:** `hoody auth email verify`

---

### `client.api.containers` (29) — Containers

#### `authorize` — Authorize Container Access

```typescript
client.api.containers.authorize(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID (24-char hex) |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/authorize`
**CLI:** `hoody containers authorize`

---

#### `copy` — Copy a container

```typescript
client.api.containers.copy(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the source container to copy |
| `data` | `object` | body | Yes |  |

**Body:** `{ target_project_id*: string, target_server_id: string, name: string, ssh_public_key: string|null, source_snapshot: string, copy_firewall_rules: bool=false, copy_network_rules: bool=false, kvm: bool, dev_kvm: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/copy`
**CLI:** `hoody containers copy`

---

#### `create` — Create a new container

```typescript
client.api.containers.create(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ server_id*: string, name: string, color: string, container_image: string|null, ai: bool=true, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, hoody_kit: bool=true, dev_kit: bool, kvm: bool, dev_kvm: bool, autostart: bool=true, ramdisk: bool=true, cache: bool=true, cache_image: bool=false, prespawn: bool=false, bypass_prespawn: bool=false, realm_ids: string[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/projects/{id}/containers`
**CLI:** `hoody containers create`

---

#### `createSnapshot` — Create container snapshot

```typescript
client.api.containers.createSnapshot(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to create snapshot for |
| `data` | `object` | body | Yes |  |

**Body:** `{ alias: string, expiry: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots create`

---

#### `delete` — Delete a container

```typescript
client.api.containers.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to delete |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}`
**CLI:** `hoody containers delete`

---

#### `deleteSnapshot` — Delete container snapshot

```typescript
client.api.containers.deleteSnapshot(id: string, name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |
| `name` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/snapshots/{name}`
**CLI:** `hoody snapshots delete`

---

#### `get` — Get a container by ID

```typescript
client.api.containers.get(runtime?: string, include_proxy_domains?: string, include_proxy_permissions?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `string` | query | No | Include proxy domains (aliases) for this container. When true, adds a proxy_domains array to the container object. |
| `include_proxy_permissions` | `string` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}`
**CLI:** `hoody containers get`

---

#### `getNetworkConfig` — Get container network configuration

```typescript
client.api.containers.getNetworkConfig(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve network configuration for |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/network`
**CLI:** `hoody network get`

---

#### `getStats` — Get container resource statistics

```typescript
client.api.containers.getStats(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/stats`
**CLI:** `hoody containers stats`

---

#### `getStatusLogs` — Get status logs for a container

```typescript
client.api.containers.getStatusLogs(page?: number, limit?: number, sort_by?: string, sort_order?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/status-logs`
**CLI:** `hoody containers status-logs`

---

#### `list` — Get all containers

```typescript
client.api.containers.list(page?: number, limit?: number, sort_by?: string, sort_order?: string, realm_id?: string, runtime?: string, include_proxy_domains?: string, include_proxy_permissions?: string, include_prespawn?: string, include_expired?: string, include_deleting?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of containers to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort containers by |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `string` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `string` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `string` | query | No | Include prespawn containers in the listing. By default, prespawn containers are excluded from results. |
| `include_expired` | `string` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `string` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/`
**CLI:** `hoody containers list`

---

#### `listAll` — Get all containers (collect all pages)

```typescript
client.api.containers.listAll(page?: number, limit?: number, sort_by?: string, sort_order?: string, realm_id?: string, runtime?: string, include_proxy_domains?: string, include_proxy_permissions?: string, include_prespawn?: string, include_expired?: string, include_deleting?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of containers to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort containers by |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `string` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `string` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `string` | query | No | Include prespawn containers in the listing. By default, prespawn containers are excluded from results. |
| `include_expired` | `string` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `string` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/containers/`
**CLI:** `hoody containers list`

---

#### `listByProject` — Get all containers for a project

```typescript
client.api.containers.listByProject(page?: number, limit?: number, sort_by?: string, sort_order?: string, runtime?: string, include_proxy_domains?: string, include_proxy_permissions?: string, include_prespawn?: string, include_deleting?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `string` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `string` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `string` | query | No | Include prespawn containers in the listing. By default, prespawn containers are excluded. |
| `include_deleting` | `string` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/projects/{id}/containers`
**CLI:** `hoody containers list`

---

#### `listByProjectAll` — Get all containers for a project (collect all pages)

```typescript
client.api.containers.listByProjectAll(page?: number, limit?: number, sort_by?: string, sort_order?: string, runtime?: string, include_proxy_domains?: string, include_proxy_permissions?: string, include_prespawn?: string, include_deleting?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `string` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `string` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `string` | query | No | Include prespawn containers in the listing. By default, prespawn containers are excluded. |
| `include_deleting` | `string` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `id` | `string` | path | Yes |  |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/projects/{id}/containers`
**CLI:** `hoody containers list`

---

#### `listByProjectIterator` — Get all containers for a project (async iterator)

```typescript
client.api.containers.listByProjectIterator(page?: number, limit?: number, sort_by?: string, sort_order?: string, runtime?: string, include_proxy_domains?: string, include_proxy_permissions?: string, include_prespawn?: string, include_deleting?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `string` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `string` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `string` | query | No | Include prespawn containers in the listing. By default, prespawn containers are excluded. |
| `include_deleting` | `string` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `id` | `string` | path | Yes |  |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/projects/{id}/containers`
**CLI:** `hoody containers list`

---

#### `listIterator` — Get all containers (async iterator)

```typescript
client.api.containers.listIterator(page?: number, limit?: number, sort_by?: string, sort_order?: string, realm_id?: string, runtime?: string, include_proxy_domains?: string, include_proxy_permissions?: string, include_prespawn?: string, include_expired?: string, include_deleting?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of containers to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort containers by |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse. |
| `include_proxy_domains` | `string` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `string` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_prespawn` | `string` | query | No | Include prespawn containers in the listing. By default, prespawn containers are excluded from results. |
| `include_expired` | `string` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `string` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/containers/`
**CLI:** `hoody containers list`

---

#### `listSnapshots` — Get container snapshots

```typescript
client.api.containers.listSnapshots(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve snapshots for |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots list`

---

#### `listSnapshotsAll` — Get container snapshots (collect all pages)

```typescript
client.api.containers.listSnapshotsAll(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve snapshots for |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots list`

---

#### `listSnapshotsIterator` — Get container snapshots (async iterator)

```typescript
client.api.containers.listSnapshotsIterator(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve snapshots for |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots list`

---

#### `manage` — Manage container

```typescript
client.api.containers.manage(operation: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `operation` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/{operation}`
**CLI:** `hoody containers manage`

---

#### `removeNetworkConfig` — Remove container network configuration

```typescript
client.api.containers.removeNetworkConfig(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to remove network configuration from |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/network`
**CLI:** `hoody network delete`

---

#### `restoreSnapshot` — Restore container from snapshot

```typescript
client.api.containers.restoreSnapshot(id: string, name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to restore |
| `name` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/snapshots/{name}`
**CLI:** `hoody snapshots restore`

---

#### `setContainerKvm` — Enable or disable /dev/kvm (run VMs in the container)

```typescript
client.api.containers.setContainerKvm(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |
| `data` | `object` | body | Yes |  |

**Body:** `{ kvm: bool, dev_kvm: bool }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/kvm`
**CLI:** `hoody containers kvm`

---

#### `startNetwork` — Start container network proxy/blocking

```typescript
client.api.containers.startNetwork(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to start network for |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/network/start`
**CLI:** `hoody network start`

---

#### `stopNetwork` — Stop container network proxy/blocking

```typescript
client.api.containers.stopNetwork(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to stop network for |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/network/stop`
**CLI:** `hoody network stop`

---

#### `sync` — Sync a copied container with its source

```typescript
client.api.containers.sync(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to sync (must have been created via copy) |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/sync`
**CLI:** `hoody containers sync`

---

#### `update` — Update a container

```typescript
client.api.containers.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to update |
| `data` | `object` | body | Yes |  |

**Body:** `{ name: string, color: string, ai: bool, autostart: bool, ramdisk_scope: "container" | "project", ramdisk: bool, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, realm_ids: string[] }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}`
**CLI:** `hoody containers update`

---

#### `updateNetworkConfig` — Update container network configuration

```typescript
client.api.containers.updateNetworkConfig(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to configure network for |
| `data` | `object` | body | Yes |  |

**Body:** `{ type*: "socks5" | "http" | "https" | "block", proxy: string, country: string, city: string, region: string, comment: string, dns_servers: string[] }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/network`
**CLI:** `hoody network update`

---

#### `updateSnapshotAlias` — Update snapshot alias

```typescript
client.api.containers.updateSnapshotAlias(id: string, name: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |
| `name` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ alias*: string|null }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/snapshots/{name}/alias`
**CLI:** `hoody snapshots update-alias`

---

### `client.api.env` (4) — Container Environment

#### `bulkSet` — Bulk set container environment variables

```typescript
client.api.env.bulkSet(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ [key: string]: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/env`
**CLI:** `hoody containers env bulk-set`

---

#### `delete` — Delete a single environment variable

```typescript
client.api.env.delete(id: string, key: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `key` | `string` | path | Yes | Environment variable key |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/env/{key}`
**CLI:** `hoody containers env delete`

---

#### `list` — List container environment variables

```typescript
client.api.env.list(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/env`
**CLI:** `hoody containers env list`

---

#### `set` — Set a single environment variable

```typescript
client.api.env.set(id: string, key: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `key` | `string` | path | Yes | Environment variable key |
| `data` | `object` | body | Yes |  |

**Body:** `{ value*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/env/{key}`
**CLI:** `hoody containers env set`

---

### `client.api.events` (8) — Events

#### `bulkDelete` — Bulk delete events

```typescript
client.api.events.bulkDelete(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ event_type: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | …(69 values), resource_type: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | …(12 values), resource_id: string, before_date: string, realm_id: string }`

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/events`
**CLI:** `hoody events bulk-delete`

---

#### `cleanup` — Cleanup old events

```typescript
client.api.events.cleanup(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ retention_days*: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/events/cleanup`
**CLI:** `hoody events cleanup`

---

#### `delete` — Delete a single event

```typescript
client.api.events.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Event ID to delete |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/events/{id}`
**CLI:** `hoody events delete`

---

#### `get` — Get event details by ID

```typescript
client.api.events.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Event ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/events/{id}`
**CLI:** `hoody events get`

---

#### `getStats` — Get event statistics

```typescript
client.api.events.getStats(start_date?: string, end_date?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `start_date` | `string` | query | No | Start of time range |
| `end_date` | `string` | query | No | End of time range |
| `realm_id` | `string` | query | No | Filter by realm |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/events/stats`
**CLI:** `hoody events stats`

---

#### `list` — List event history

```typescript
client.api.events.list(limit?: integer, offset?: integer, sort_by?: string, sort_order?: string, event_type?: string, resource_type?: string, resource_id?: string, project_id?: string, container_id?: string, start_date?: string, end_date?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No | Number of events to return (max 500) |
| `offset` | `integer` | query | No | Number of events to skip |
| `sort_by` | `string` | query | No | Field to sort by |
| `sort_order` | `string` | query | No | Sort direction |
| `event_type` | `string` | query | No | Filter by specific event type |
| `resource_type` | `string` | query | No | Filter by resource type |
| `resource_id` | `string` | query | No | Filter by specific resource ID |
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `start_date` | `string` | query | No | Filter events after this timestamp |
| `end_date` | `string` | query | No | Filter events before this timestamp |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/events`
**CLI:** `hoody events list`

---

#### `listAll` — List event history (collect all pages)

```typescript
client.api.events.listAll(limit?: integer, offset?: integer, sort_by?: string, sort_order?: string, event_type?: string, resource_type?: string, resource_id?: string, project_id?: string, container_id?: string, start_date?: string, end_date?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No | Number of events to return (max 500) |
| `offset` | `integer` | query | No | Number of events to skip |
| `sort_by` | `string` | query | No | Field to sort by |
| `sort_order` | `string` | query | No | Sort direction |
| `event_type` | `string` | query | No | Filter by specific event type |
| `resource_type` | `string` | query | No | Filter by resource type |
| `resource_id` | `string` | query | No | Filter by specific resource ID |
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `start_date` | `string` | query | No | Filter events after this timestamp |
| `end_date` | `string` | query | No | Filter events before this timestamp |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/events`
**CLI:** `hoody events list`

---

#### `listIterator` — List event history (async iterator)

```typescript
client.api.events.listIterator(limit?: integer, offset?: integer, sort_by?: string, sort_order?: string, event_type?: string, resource_type?: string, resource_id?: string, project_id?: string, container_id?: string, start_date?: string, end_date?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No | Number of events to return (max 500) |
| `offset` | `integer` | query | No | Number of events to skip |
| `sort_by` | `string` | query | No | Field to sort by |
| `sort_order` | `string` | query | No | Sort direction |
| `event_type` | `string` | query | No | Filter by specific event type |
| `resource_type` | `string` | query | No | Filter by resource type |
| `resource_id` | `string` | query | No | Filter by specific resource ID |
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `start_date` | `string` | query | No | Filter events after this timestamp |
| `end_date` | `string` | query | No | Filter events before this timestamp |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/events`
**CLI:** `hoody events list`

---

### `client.api.firewall` (10) — Container Firewall

#### `addEgressRule` — Add Egress Rule

```typescript
client.api.firewall.addEgressRule(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, destination: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/firewall/egress`
**CLI:** `hoody firewall egress create`

---

#### `addIngressRule` — Add Ingress Rule

```typescript
client.api.firewall.addIngressRule(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, source: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/firewall/ingress`
**CLI:** `hoody firewall ingress create`

---

#### `list` — List container firewall rules

```typescript
client.api.firewall.list(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/firewall/rules`
**CLI:** `hoody firewall list`

---

#### `listAll` — List container firewall rules (collect all pages)

```typescript
client.api.firewall.listAll(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/containers/{id}/firewall/rules`
**CLI:** `hoody firewall list`

---

#### `listIterator` — List container firewall rules (async iterator)

```typescript
client.api.firewall.listIterator(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/containers/{id}/firewall/rules`
**CLI:** `hoody firewall list`

---

#### `removeEgressRule` — Remove Egress Rule(s)

```typescript
client.api.firewall.removeEgressRule(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, destination: string, source_port: string, description: string, state: "enabled" | "disabled"="enabled", icmp_type: string, icmp_code: string }`

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/firewall/egress`
**CLI:** `hoody firewall egress delete`

---

#### `removeIngressRule` — Remove Ingress Rule(s)

```typescript
client.api.firewall.removeIngressRule(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source: string, source_port: string, description: string, state: "enabled" | "disabled"="enabled", icmp_type: string, icmp_code: string }`

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/firewall/ingress`
**CLI:** `hoody firewall ingress delete`

---

#### `reset` — Reset container firewall

```typescript
client.api.firewall.reset(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/firewall/reset`
**CLI:** `hoody firewall reset`

---

#### `toggleEgressRule` — Toggle Egress Rule State

```typescript
client.api.firewall.toggleEgressRule(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, destination: string, description: string, icmp_type: string, icmp_code: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/containers/{id}/firewall/egress`
**CLI:** `hoody firewall egress toggle`

---

#### `toggleIngressRule` — Toggle Ingress Rule State

```typescript
client.api.firewall.toggleIngressRule(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, source: string, description: string, icmp_type: string, icmp_code: string }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/containers/{id}/firewall/ingress`
**CLI:** `hoody firewall ingress toggle`

---

### `client.api.images` (11) — Container Images

#### `getDetails` — Get public image details

```typescript
client.api.images.getDetails(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the public container image to retrieve details for |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/images/public/{id}`
**CLI:** `hoody images get`

---

#### `getIcon` — Get image icon

```typescript
client.api.images.getIcon(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container image to retrieve icon for |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/images/{id}/icon`
**CLI:** `hoody images icon`

---

#### `importFree` — Import free image

```typescript
client.api.images.importFree(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the public container image to import |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/images/import/{id}`
**CLI:** `hoody images import-free`

---

#### `list` — List user images

```typescript
client.api.images.list(page?: integer, limit?: integer, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort user images by - currently only supports creation date |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/images/user`
**CLI:** `hoody images mine`

---

#### `listAll` — List user images (collect all pages)

```typescript
client.api.images.listAll(page?: integer, limit?: integer, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort user images by - currently only supports creation date |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/images/user`
**CLI:** `hoody images mine`

---

#### `listIterator` — List user images (async iterator)

```typescript
client.api.images.listIterator(page?: integer, limit?: integer, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort user images by - currently only supports creation date |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/images/user`
**CLI:** `hoody images mine`

---

#### `listPublic` — List public images

```typescript
client.api.images.listPublic(os?: string, architecture?: string, min_price?: number, max_price?: number, min_rating?: number, max_rating?: number, search?: string, page?: integer, limit?: integer, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `os` | `string` | query | No | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | query | No | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | query | No | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | query | No | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | query | No | Minimum average rating filter - filters images with rating >= this value (0-5 stars) |
| `max_rating` | `number` | query | No | Maximum average rating filter - filters images with rating <= this value (0-5 stars) |
| `search` | `string` | query | No | Search term to filter images by name, description, or tags |
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/images/public`
**CLI:** `hoody images list`

---

#### `listPublicAll` — List public images (collect all pages)

```typescript
client.api.images.listPublicAll(os?: string, architecture?: string, min_price?: number, max_price?: number, min_rating?: number, max_rating?: number, search?: string, page?: integer, limit?: integer, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `os` | `string` | query | No | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | query | No | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | query | No | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | query | No | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | query | No | Minimum average rating filter - filters images with rating >= this value (0-5 stars) |
| `max_rating` | `number` | query | No | Maximum average rating filter - filters images with rating <= this value (0-5 stars) |
| `search` | `string` | query | No | Search term to filter images by name, description, or tags |
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/images/public`
**CLI:** `hoody images list`

---

#### `listPublicIterator` — List public images (async iterator)

```typescript
client.api.images.listPublicIterator(os?: string, architecture?: string, min_price?: number, max_price?: number, min_rating?: number, max_rating?: number, search?: string, page?: integer, limit?: integer, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `os` | `string` | query | No | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | query | No | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | query | No | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | query | No | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | query | No | Minimum average rating filter - filters images with rating >= this value (0-5 stars) |
| `max_rating` | `number` | query | No | Maximum average rating filter - filters images with rating <= this value (0-5 stars) |
| `search` | `string` | query | No | Search term to filter images by name, description, or tags |
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `string` | query | No | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `string` | query | No | Sort direction - ascending or descending |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/images/public`
**CLI:** `hoody images list`

---

#### `purchase` — Purchase image

```typescript
client.api.images.purchase(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the paid container image to purchase |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/images/purchase/{id}`
**CLI:** `hoody images purchase`

---

#### `rate` — Rate image

```typescript
client.api.images.rate(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container image to rate |
| `data` | `object` | body | Yes |  |

**Body:** `{ rating*: number }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/images/rate/{id}`
**CLI:** `hoody images rate`

---

### `client.api.meta` (2) — Meta

#### `getPublicKey` — Get Hoody API Signing Public Key

```typescript
client.api.meta.getPublicKey()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/meta/public-key`
**CLI:** `hoody meta get`

---

#### `getSocialStats` — Get Hoody Social Counters

```typescript
client.api.meta.getSocialStats()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/meta/social-stats`

---

### `client.api.notifications` (8) — Notifications

#### `list` — Get all notifications for the authenticated user

```typescript
client.api.notifications.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notifications/`
**CLI:** `hoody inbox list`

---

#### `listAll` — Get all notifications for the authenticated user (collect all pages)

```typescript
client.api.notifications.listAll()
```

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/notifications/`
**CLI:** `hoody inbox list`

---

#### `listIterator` — Get all notifications for the authenticated user (async iterator)

```typescript
client.api.notifications.listIterator()
```

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/notifications/`
**CLI:** `hoody inbox list`

---

#### `listPublic` — Get all public notifications

```typescript
client.api.notifications.listPublic()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/notifications/public`
**CLI:** `hoody inbox list-public`

---

#### `listPublicAll` — Get all public notifications (collect all pages)

```typescript
client.api.notifications.listPublicAll()
```

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/notifications/public`
**CLI:** `hoody inbox list-public`

---

#### `listPublicIterator` — Get all public notifications (async iterator)

```typescript
client.api.notifications.listPublicIterator()
```

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/notifications/public`
**CLI:** `hoody inbox list-public`

---

#### `markAllRead` — Mark all notifications as read

```typescript
client.api.notifications.markAllRead()
```

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/notifications/read-all`
**CLI:** `hoody inbox mark-all`

---

#### `markRead` — Mark a notification as read

```typescript
client.api.notifications.markRead(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the notification to mark as read |

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/notifications/{id}/read`
**CLI:** `hoody inbox mark`

---

### `client.api.poolInvitations` (3) — Pool Invitations

#### `accept` — Accept invitation

```typescript
client.api.poolInvitations.accept(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/pools/{id}/accept`
**CLI:** `hoody pools invitations accept`

---

#### `list` — List pending invitations

```typescript
client.api.poolInvitations.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/pools/invitations/pending`
**CLI:** `hoody pools invitations list`

---

#### `reject` — Reject invitation

```typescript
client.api.poolInvitations.reject(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/pools/{id}/reject`
**CLI:** `hoody pools invitations reject`

---

### `client.api.poolMembers` (3) — Pool Members

#### `invite` — Invite member

```typescript
client.api.poolMembers.invite(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ username*: string, role*: "admin" | "user" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/pools/{id}/members`
**CLI:** `hoody pools members invite`

---

#### `remove` — Remove member

```typescript
client.api.poolMembers.remove(id: string, userId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `userId` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/pools/{id}/members/{userId}`
**CLI:** `hoody pools members delete`

---

#### `updateRole` — Update member role

```typescript
client.api.poolMembers.updateRole(id: string, userId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `userId` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ role*: "admin" | "user" }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/pools/{id}/members/{userId}`
**CLI:** `hoody pools members update-role`

---

### `client.api.pools` (7) — Pools

#### `create` — Create pool

```typescript
client.api.pools.create(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, description: string, settings: object }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/pools`
**CLI:** `hoody pools create`

---

#### `delete` — Delete pool

```typescript
client.api.pools.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/pools/{id}`
**CLI:** `hoody pools delete`

---

#### `get` — Get pool details

```typescript
client.api.pools.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/pools/{id}`
**CLI:** `hoody pools get`

---

#### `list` — List user pools

```typescript
client.api.pools.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/pools`
**CLI:** `hoody pools list`

---

#### `listAll` — List user pools (collect all pages)

```typescript
client.api.pools.listAll()
```

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/pools`
**CLI:** `hoody pools list`

---

#### `listIterator` — List user pools (async iterator)

```typescript
client.api.pools.listIterator()
```

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/pools`
**CLI:** `hoody pools list`

---

#### `update` — Update pool

```typescript
client.api.pools.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ description: string, settings: object }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/pools/{id}`
**CLI:** `hoody pools update`

---

### `client.api.projects` (14) — Projects

#### `addPermission` — Grant project access

```typescript
client.api.projects.addPermission(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ user_id*: string, permission_level*: "read" | "edit" | "delete" }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions create`

---

#### `create` — Create a new project

```typescript
client.api.projects.create(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/projects/`
**CLI:** `hoody projects create`

---

#### `delete` — Delete project

```typescript
client.api.projects.delete(include_deleted_items?: boolean, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_deleted_items` | `boolean` | query | No | Include a lightweight list of deleted container IDs/names in the response for confirmation UX. |
| `id` | `string` | path | Yes | Project ID to delete |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/projects/{id}`
**CLI:** `hoody projects delete`

---

#### `get` — Get project by ID

```typescript
client.api.projects.get(include_permissions?: boolean, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_permissions` | `boolean` | query | No | Include project permissions with user details in response |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/projects/{id}`
**CLI:** `hoody projects get`

---

#### `getStats` — Get statistics for all containers in a project

```typescript
client.api.projects.getStats(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the project |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/projects/{id}/stats`
**CLI:** `hoody projects stats`

---

#### `list` — List all projects

```typescript
client.api.projects.list(page?: number, limit?: number, sort_by?: string, sort_order?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 100) |
| `sort_by` | `string` | query | No | Field to sort by |
| `sort_order` | `string` | query | No | Sort direction |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/projects/`
**CLI:** `hoody projects list`

---

#### `listAll` — List all projects (collect all pages)

```typescript
client.api.projects.listAll(page?: number, limit?: number, sort_by?: string, sort_order?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 100) |
| `sort_by` | `string` | query | No | Field to sort by |
| `sort_order` | `string` | query | No | Sort direction |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/projects/`
**CLI:** `hoody projects list`

---

#### `listIterator` — List all projects (async iterator)

```typescript
client.api.projects.listIterator(page?: number, limit?: number, sort_by?: string, sort_order?: string, realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 100) |
| `sort_by` | `string` | query | No | Field to sort by |
| `sort_order` | `string` | query | No | Sort direction |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/projects/`
**CLI:** `hoody projects list`

---

#### `listPermissions` — List project permissions

```typescript
client.api.projects.listPermissions(page?: number, limit?: number, sort_by?: string, sort_order?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions list`

---

#### `listPermissionsAll` — List project permissions (collect all pages)

```typescript
client.api.projects.listPermissionsAll(page?: number, limit?: number, sort_by?: string, sort_order?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions list`

---

#### `listPermissionsIterator` — List project permissions (async iterator)

```typescript
client.api.projects.listPermissionsIterator(page?: number, limit?: number, sort_by?: string, sort_order?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions list`

---

#### `removePermission` — Revoke project access

```typescript
client.api.projects.removePermission(id: string, permissionId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `permissionId` | `string` | path | Yes | Permission ID to remove |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/projects/{id}/permissions/{permissionId}`
**CLI:** `hoody projects permissions delete`

---

#### `update` — Update project

```typescript
client.api.projects.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID to update |
| `data` | `object` | body | Yes |  |

**Body:** `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}`
**CLI:** `hoody projects update`

---

#### `updatePermission` — Update project permission

```typescript
client.api.projects.updatePermission(id: string, permissionId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `permissionId` | `string` | path | Yes | Permission ID to update |
| `data` | `object` | body | Yes |  |

**Body:** `{ permission_level*: "read" | "edit" | "delete" }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}/permissions/{permissionId}`
**CLI:** `hoody projects permissions update`

---

### `client.api.proxyAliases` (8) — Proxy Aliases

#### `create` — Create a new proxy alias

```typescript
client.api.proxyAliases.create(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ container_id*: string, alias: string | null | false, program*: string, port: int, index: int, target_path: string|null, allow_path_override: bool=true, expires_at: string|null, enabled: bool=true }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/proxy/aliases`
**CLI:** `hoody proxy create`

---

#### `delete` — Delete proxy alias

```typescript
client.api.proxyAliases.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID to delete |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/proxy/aliases/{id}`
**CLI:** `hoody proxy delete`

---

#### `get` — Get proxy alias by ID

```typescript
client.api.proxyAliases.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/proxy/aliases/{id}`
**CLI:** `hoody proxy get`

---

#### `list` — List proxy aliases

```typescript
client.api.proxyAliases.list(project_id?: string, container_id?: string, realm_id?: string, enabled?: string, expired?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `string` | query | No | Filter by enabled status |
| `expired` | `string` | query | No | Filter by expiration: "true" = only expired, "false" = only non-expired |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/proxy/aliases`
**CLI:** `hoody proxy list`

---

#### `listAll` — List proxy aliases (collect all pages)

```typescript
client.api.proxyAliases.listAll(project_id?: string, container_id?: string, realm_id?: string, enabled?: string, expired?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `string` | query | No | Filter by enabled status |
| `expired` | `string` | query | No | Filter by expiration: "true" = only expired, "false" = only non-expired |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/proxy/aliases`
**CLI:** `hoody proxy list`

---

#### `listIterator` — List proxy aliases (async iterator)

```typescript
client.api.proxyAliases.listIterator(project_id?: string, container_id?: string, realm_id?: string, enabled?: string, expired?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `string` | query | No | Filter by enabled status |
| `expired` | `string` | query | No | Filter by expiration: "true" = only expired, "false" = only non-expired |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/proxy/aliases`
**CLI:** `hoody proxy list`

---

#### `setState` — Enable or disable proxy alias

```typescript
client.api.proxyAliases.setState(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ enabled*: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/proxy/aliases/{id}/state`
**CLI:** `hoody proxy set-state`

---

#### `update` — Update proxy alias

```typescript
client.api.proxyAliases.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID to update |
| `data` | `object` | body | Yes |  |

**Body:** `{ alias: string, program: string, port: int, index: int, target_path: string|null, allow_path_override: bool, expires_at: string | number | null, enabled: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/proxy/aliases/{id}`
**CLI:** `hoody proxy update`

---

### `client.api.proxyDiscovery` (5) — Proxy Discovery

#### `getContainerProxyService` — Get merged proxy view for a service

```typescript
client.api.proxyDiscovery.getContainerProxyService(id: string, service: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/services/{service}`
**CLI:** `hoody containers proxy discovery services get`

---

#### `getContainerProxySettings` — Get container proxy root settings

```typescript
client.api.proxyDiscovery.getContainerProxySettings(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/settings`
**CLI:** `hoody containers proxy settings get`

---

#### `listContainerProxyGroups` — List container proxy groups

```typescript
client.api.proxyDiscovery.listContainerProxyGroups(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/groups`
**CLI:** `hoody containers proxy discovery groups list`

---

#### `listContainerProxyServices` — List services referenced in proxy config

```typescript
client.api.proxyDiscovery.listContainerProxyServices(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/services`
**CLI:** `hoody containers proxy discovery services list`

---

#### `updateContainerProxySettings` — Update container proxy root settings

```typescript
client.api.proxyDiscovery.updateContainerProxySettings(id: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `if-match` | `string` | header | No | file:v<N> ETag precondition |
| `data` | `object` | body | Yes |  |

**Body:** `{ enable_proxy: bool, default: "allow" | "deny" }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/settings`
**CLI:** `hoody containers proxy settings update`

---

### `client.api.proxyHooks` (8) — Proxy Hooks

#### `addContainerProxyHook` — Append or insert a new hook

```typescript
client.api.proxyHooks.addContainerProxyHook(id: string, service: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `if-match` | `string` | header | No | file:v<N> ETag precondition |
| `data` | `object` | body | Yes |  |

**Body:** `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/proxy/hooks/{service}`
**CLI:** `hoody containers proxy hooks create`

---

#### `clearContainerProxyServiceHooks` — Clear all hooks for a service

```typescript
client.api.proxyHooks.clearContainerProxyServiceHooks(id: string, service: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `if-match` | `string` | header | No | file:v<N> ETag precondition |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/hooks/{service}`
**CLI:** `hoody containers proxy hooks clear-service`

---

#### `getContainerProxyHook` — Get a single hook by id

```typescript
client.api.proxyHooks.getContainerProxyHook(id: string, service: string, hookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`
**CLI:** `hoody containers proxy hooks get`

---

#### `listContainerProxyHooks` — List all proxy hooks for a container

```typescript
client.api.proxyHooks.listContainerProxyHooks(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/hooks`
**CLI:** `hoody containers proxy hooks list`

---

#### `listContainerProxyServiceHooks` — List hooks for a specific service

```typescript
client.api.proxyHooks.listContainerProxyServiceHooks(id: string, service: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/hooks/{service}`
**CLI:** `hoody containers proxy hooks list-service`

---

#### `moveContainerProxyHook` — Move a hook to a new position

```typescript
client.api.proxyHooks.moveContainerProxyHook(id: string, service: string, hookId: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |
| `if-match` | `string` | header | No | file:v<N> ETag precondition |
| `data` | `object` | body | Yes |  |

**Body:** `{ position*: int }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position`
**CLI:** `hoody containers proxy hooks move`

---

#### `removeContainerProxyHook` — Remove a hook

```typescript
client.api.proxyHooks.removeContainerProxyHook(id: string, service: string, hookId: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |
| `if-match` | `string` | header | No | file:v<N> ETag precondition |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`
**CLI:** `hoody containers proxy hooks delete`

---

#### `updateContainerProxyHook` — Replace a hook in place

```typescript
client.api.proxyHooks.updateContainerProxyHook(id: string, service: string, hookId: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |
| `if-match` | `string` | header | No | file:v<N> ETag precondition |
| `data` | `object` | body | Yes |  |

**Body:** `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`
**CLI:** `hoody containers proxy hooks update`

---

### `client.api.proxyPermissionsContainer` (13) — Proxy Permissions Container

#### `delete` — Delete container proxy permissions

```typescript
client.api.proxyPermissionsContainer.delete(id: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions`
**CLI:** `hoody containers proxy permissions delete`

---

#### `get` — Get container proxy permissions

```typescript
client.api.proxyPermissionsContainer.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/permissions`
**CLI:** `hoody containers proxy permissions get`

---

#### `removeAuthGroup` — Remove container authentication group

```typescript
client.api.proxyPermissionsContainer.removeAuthGroup(id: string, groupName: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `groupName` | `string` | path | Yes | Group name to remove |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions/groups/{groupName}`
**CLI:** `hoody containers proxy groups delete`

---

#### `removeGroup` — Remove all program permissions for a container group

```typescript
client.api.proxyPermissionsContainer.removeGroup(id: string, groupName: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `groupName` | `string` | path | Yes | Group name |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody containers proxy groups permissions clear`

---

#### `removeProgram` — Remove a single program permission for a container group

```typescript
client.api.proxyPermissionsContainer.removeProgram(id: string, groupName: string, program: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `groupName` | `string` | path | Yes | Group name |
| `program` | `string` | path | Yes | Program name (e.g., http, ssh, files) |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}`
**CLI:** `hoody containers proxy groups permissions delete`

---

#### `replace` — Replace container proxy permissions JSON

```typescript
client.api.proxyPermissionsContainer.replace(id: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ project*: string, container*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: ("user" | "admin")[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool, hooks: { [key: string]: { match*: object, script*: object, timeout: int }[] } }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions`
**CLI:** `hoody containers proxy permissions replace`

---

#### `setGroup` — Set container group program permission

```typescript
client.api.proxyPermissionsContainer.setGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ program*: string, access*: bool | number | number[] | string | "*" }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody containers proxy groups permissions set`

---

#### `setIpGroup` — Set IP authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setIpGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ range*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`
**CLI:** `hoody containers proxy groups ip set`

---

#### `setJwtGroup` — Set JWT authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setJwtGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt`
**CLI:** `hoody containers proxy groups jwt set`

---

#### `setPasswordGroup` — Set password authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setPasswordGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password`
**CLI:** `hoody containers proxy groups password set`

---

#### `setTokenGroup` — Set token authentication group (container)

```typescript
client.api.proxyPermissionsContainer.setTokenGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token`
**CLI:** `hoody containers proxy groups token set`

---

#### `updateDefault` — Update container default proxy permission policy

```typescript
client.api.proxyPermissionsContainer.updateDefault(id: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ default*: "allow" | "deny" }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/containers/{id}/proxy/permissions/default`
**CLI:** `hoody containers proxy default`

---

#### `updateState` — Update container proxy enable state

```typescript
client.api.proxyPermissionsContainer.updateState(id: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ enable_proxy*: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/containers/{id}/proxy/permissions/state`
**CLI:** `hoody containers proxy state`

---

### `client.api.proxyPermissionsProject` (13) — Proxy Permissions Project

#### `delete` — Delete project proxy permissions

```typescript
client.api.proxyPermissionsProject.delete(id: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions`
**CLI:** `hoody projects proxy permissions delete`

---

#### `get` — Get project proxy permissions

```typescript
client.api.proxyPermissionsProject.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/projects/{id}/proxy/permissions`
**CLI:** `hoody projects proxy permissions get`

---

#### `removeAuthGroup` — Remove project authentication group

```typescript
client.api.proxyPermissionsProject.removeAuthGroup(id: string, groupName: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `groupName` | `string` | path | Yes | Group name to remove |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions/groups/{groupName}`
**CLI:** `hoody projects proxy groups delete`

---

#### `removeGroup` — Remove all program permissions for a project group

```typescript
client.api.proxyPermissionsProject.removeGroup(id: string, groupName: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `groupName` | `string` | path | Yes | Group name |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody projects proxy groups permissions clear`

---

#### `removeProgram` — Remove a single program permission for a project group

```typescript
client.api.proxyPermissionsProject.removeProgram(id: string, groupName: string, program: string, if-match?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `groupName` | `string` | path | Yes | Group name |
| `program` | `string` | path | Yes | Program name (e.g., http, ssh, files) |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}`
**CLI:** `hoody projects proxy groups permissions delete`

---

#### `replace` — Replace project proxy permissions JSON

```typescript
client.api.proxyPermissionsProject.replace(id: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ project*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: ("user" | "admin")[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions`
**CLI:** `hoody projects proxy permissions replace`

---

#### `setGroup` — Set project group program permission

```typescript
client.api.proxyPermissionsProject.setGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ program*: string, access*: bool | number | number[] | string | "*" }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody projects proxy groups permissions set`

---

#### `setIpGroup` — Set IP authentication group (project)

```typescript
client.api.proxyPermissionsProject.setIpGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ range*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip`
**CLI:** `hoody projects proxy groups ip set`

---

#### `setJwtGroup` — Set JWT authentication group (project)

```typescript
client.api.proxyPermissionsProject.setJwtGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt`
**CLI:** `hoody projects proxy groups jwt set`

---

#### `setPasswordGroup` — Set password authentication group (project)

```typescript
client.api.proxyPermissionsProject.setPasswordGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password`
**CLI:** `hoody projects proxy groups password set`

---

#### `setTokenGroup` — Set token authentication group (project)

```typescript
client.api.proxyPermissionsProject.setTokenGroup(id: string, groupName: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token`
**CLI:** `hoody projects proxy groups token set`

---

#### `updateDefault` — Update project default proxy permission policy

```typescript
client.api.proxyPermissionsProject.updateDefault(id: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ default*: "allow" | "deny" }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/projects/{id}/proxy/permissions/default`
**CLI:** `hoody projects proxy default`

---

#### `updateState` — Update project proxy enable state

```typescript
client.api.proxyPermissionsProject.updateState(id: string, if-match?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `if-match` | `string` | header | No | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `object` | body | Yes |  |

**Body:** `{ enable_proxy*: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/projects/{id}/proxy/permissions/state`
**CLI:** `hoody projects proxy state`

---

### `client.api.realms` (1) — Realms

#### `list` — List your realm IDs

```typescript
client.api.realms.list(include_usage?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_usage` | `boolean` | query | No | Include resource counts per realm_id (projects, containers, servers, auth_tokens). Adds "usage" object to response data. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/realms/`
**CLI:** `hoody realms list`

---

### `client.api.rentals` (5) — Rentals

#### `extend` — Extend rental

```typescript
client.api.rentals.extend(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ expected_rental_end*: string, additional_days*: int, max_charge_cents: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/rentals/{id}/extend`
**CLI:** `hoody servers extend`

---

#### `get` — Get rental details

```typescript
client.api.rentals.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/rentals/{id}`
**CLI:** `hoody servers get-rental`

---

#### `list` — List user rentals

```typescript
client.api.rentals.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/rentals`
**CLI:** `hoody servers list-rentals`

---

#### `listAll` — List user rentals (collect all pages)

```typescript
client.api.rentals.listAll()
```

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/rentals`
**CLI:** `hoody servers list-rentals`

---

#### `listIterator` — List user rentals (async iterator)

```typescript
client.api.rentals.listIterator()
```

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/rentals`
**CLI:** `hoody servers list-rentals`

---

### `client.api.serverCommands` (4) — Server Commands

#### `execute` — Execute server command

```typescript
client.api.serverCommands.execute(serverId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `serverId` | `string` | path | Yes | Server ID to execute command on |
| `data` | `object` | body | Yes |  |

**Body:** `{ command_id: string, command_slug: string, parameters: object, wait: bool=true, timeout: number, confirmation_token: string } (exactly one of: command_id | command_slug required)`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/servers/{serverId}/execute-command`
**CLI:** `hoody servers exec`

---

#### `list` — Get available commands

```typescript
client.api.serverCommands.list(category?: string, risk_level?: string, serverId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter by command category |
| `risk_level` | `string` | query | No | Filter by maximum risk level |
| `serverId` | `string` | path | Yes | Server ID to get available commands for |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/servers/{serverId}/available-commands`
**CLI:** `hoody servers commands`

---

#### `listAll` — Get available commands (collect all pages)

```typescript
client.api.serverCommands.listAll(category?: string, risk_level?: string, serverId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter by command category |
| `risk_level` | `string` | query | No | Filter by maximum risk level |
| `serverId` | `string` | path | Yes | Server ID to get available commands for |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/servers/{serverId}/available-commands`
**CLI:** `hoody servers commands`

---

#### `listIterator` — Get available commands (async iterator)

```typescript
client.api.serverCommands.listIterator(category?: string, risk_level?: string, serverId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter by command category |
| `risk_level` | `string` | query | No | Filter by maximum risk level |
| `serverId` | `string` | path | Yes | Server ID to get available commands for |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/servers/{serverId}/available-commands`
**CLI:** `hoody servers commands`

---

### `client.api.serverRental` (14) — Server Rental

#### `browse` — Browse rental marketplace

```typescript
client.api.serverRental.browse(country?: string, region?: string, max_price_per_day?: number, available_durations?: array, min_cpu_cores?: number, min_cpu_score?: number, cpu_score_type?: string, min_ram_gb?: number, ram_types?: array, min_total_storage_gb?: number, disk_types?: array, min_bandwidth_mbps?: number, min_traffic_tb?: number, unlimited_traffic_only?: boolean, category?: string, featured_only?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `country` | `string` | query | No | Filter by country code (e.g., US, DE) |
| `region` | `string` | query | No | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | query | No | Maximum price per day in USD |
| `available_durations` | `array` | query | No | Filter servers that support these rental durations (days) |
| `min_cpu_cores` | `number` | query | No | Minimum CPU cores |
| `min_cpu_score` | `number` | query | No | Minimum CPU benchmark score |
| `cpu_score_type` | `string` | query | No | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | query | No | Minimum RAM in GB |
| `ram_types` | `array` | query | No | Filter by RAM types |
| `min_total_storage_gb` | `number` | query | No | Minimum total storage in GB |
| `disk_types` | `array` | query | No | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | query | No | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | query | No | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | query | No | Show only servers with unlimited traffic |
| `category` | `string` | query | No | Filter by server category |
| `featured_only` | `boolean` | query | No | Show only featured servers |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/servers/available`
**CLI:** `hoody servers marketplace`

---

#### `browseAll` — Browse rental marketplace (collect all pages)

```typescript
client.api.serverRental.browseAll(country?: string, region?: string, max_price_per_day?: number, available_durations?: array, min_cpu_cores?: number, min_cpu_score?: number, cpu_score_type?: string, min_ram_gb?: number, ram_types?: array, min_total_storage_gb?: number, disk_types?: array, min_bandwidth_mbps?: number, min_traffic_tb?: number, unlimited_traffic_only?: boolean, category?: string, featured_only?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `country` | `string` | query | No | Filter by country code (e.g., US, DE) |
| `region` | `string` | query | No | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | query | No | Maximum price per day in USD |
| `available_durations` | `array` | query | No | Filter servers that support these rental durations (days) |
| `min_cpu_cores` | `number` | query | No | Minimum CPU cores |
| `min_cpu_score` | `number` | query | No | Minimum CPU benchmark score |
| `cpu_score_type` | `string` | query | No | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | query | No | Minimum RAM in GB |
| `ram_types` | `array` | query | No | Filter by RAM types |
| `min_total_storage_gb` | `number` | query | No | Minimum total storage in GB |
| `disk_types` | `array` | query | No | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | query | No | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | query | No | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | query | No | Show only servers with unlimited traffic |
| `category` | `string` | query | No | Filter by server category |
| `featured_only` | `boolean` | query | No | Show only featured servers |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/servers/available`
**CLI:** `hoody servers marketplace`

---

#### `browseIterator` — Browse rental marketplace (async iterator)

```typescript
client.api.serverRental.browseIterator(country?: string, region?: string, max_price_per_day?: number, available_durations?: array, min_cpu_cores?: number, min_cpu_score?: number, cpu_score_type?: string, min_ram_gb?: number, ram_types?: array, min_total_storage_gb?: number, disk_types?: array, min_bandwidth_mbps?: number, min_traffic_tb?: number, unlimited_traffic_only?: boolean, category?: string, featured_only?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `country` | `string` | query | No | Filter by country code (e.g., US, DE) |
| `region` | `string` | query | No | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | query | No | Maximum price per day in USD |
| `available_durations` | `array` | query | No | Filter servers that support these rental durations (days) |
| `min_cpu_cores` | `number` | query | No | Minimum CPU cores |
| `min_cpu_score` | `number` | query | No | Minimum CPU benchmark score |
| `cpu_score_type` | `string` | query | No | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | query | No | Minimum RAM in GB |
| `ram_types` | `array` | query | No | Filter by RAM types |
| `min_total_storage_gb` | `number` | query | No | Minimum total storage in GB |
| `disk_types` | `array` | query | No | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | query | No | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | query | No | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | query | No | Show only servers with unlimited traffic |
| `category` | `string` | query | No | Filter by server category |
| `featured_only` | `boolean` | query | No | Show only featured servers |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/servers/available`
**CLI:** `hoody servers marketplace`

---

#### `get` — Get server details (alias for /rentals/:id)

```typescript
client.api.serverRental.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/servers/{id}`
**CLI:** `hoody servers get`

---

#### `getMyReservation` — One of your reservations

```typescript
client.api.serverRental.getMyReservation(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/reservations/{id}`

---

#### `getRentalRuntime` — Get live runtime info for a rented server or subserver

```typescript
client.api.serverRental.getRentalRuntime(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/rentals/{id}/runtime`

---

#### `getServerRuntime` — Get live runtime info (alias for /rentals/:id/runtime)

```typescript
client.api.serverRental.getServerRuntime(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/servers/{id}/runtime`

---

#### `list` — List user servers (alias for /rentals)

```typescript
client.api.serverRental.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/servers`
**CLI:** `hoody servers list`

---

#### `listAll` — List user servers (alias for /rentals) (collect all pages)

```typescript
client.api.serverRental.listAll()
```

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/servers`
**CLI:** `hoody servers list`

---

#### `listIterator` — List user servers (alias for /rentals) (async iterator)

```typescript
client.api.serverRental.listIterator()
```

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/servers`
**CLI:** `hoody servers list`

---

#### `listMyReservations` — Your reservations

```typescript
client.api.serverRental.listMyReservations(limit?: integer, offset?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/reservations`

---

#### `listServerOffers` — Browse machines available to order

```typescript
client.api.serverRental.listServerOffers()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/offers`

---

#### `rent` — Rent server

```typescript
client.api.serverRental.rent(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ pool_id: string, rental_days*: int, max_charge_cents: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/servers/{id}/rent`
**CLI:** `hoody servers rent`

---

#### `reserveServerOffer` — Reserve an offer (charges immediately)

```typescript
client.api.serverRental.reserveServerOffer(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ days*: number, max_charge_cents: number, idempotency_key*: string, pool_id: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/offers/{id}/reserve`

---

### `client.api.storageShares` (15) — Storage Shares

#### `create` — Create storage share

```typescript
client.api.storageShares.create(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Source container ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ source_path*: string, target_container_id: string, target_project_id: string, mode*: "readonly" | "readwrite", alias: string, label: string, description: string, enabled: bool, expires_at: number }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage create`

---

#### `delete` — Delete storage share

```typescript
client.api.storageShares.delete(shareId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `shareId` | `string` | path | Yes | Share ID (globally unique, no container ID needed) |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/storage/shares/{shareId}`
**CLI:** `hoody storage delete`

---

#### `get` — Get storage share

```typescript
client.api.storageShares.get(id: string, shareId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Source container ID |
| `shareId` | `string` | path | Yes | Share ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares/{shareId}`
**CLI:** `hoody storage get`

---

#### `list` — List storage shares

```typescript
client.api.storageShares.list(target_type?: string, label?: string, status?: string, enabled?: string, include_expired?: string, realm_id?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `target_type` | `string` | query | No | Filter by target type |
| `label` | `string` | query | No | Filter by label |
| `status` | `string` | query | No | Filter by status |
| `enabled` | `string` | query | No | Filter by enabled status |
| `include_expired` | `string` | query | No | Include expired shares (default: false) |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `id` | `string` | path | Yes | Source container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage list`

---

#### `listAll` — List storage shares (collect all pages)

```typescript
client.api.storageShares.listAll(target_type?: string, label?: string, status?: string, enabled?: string, include_expired?: string, realm_id?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `target_type` | `string` | query | No | Filter by target type |
| `label` | `string` | query | No | Filter by label |
| `status` | `string` | query | No | Filter by status |
| `enabled` | `string` | query | No | Filter by enabled status |
| `include_expired` | `string` | query | No | Include expired shares (default: false) |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `id` | `string` | path | Yes | Source container ID |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage list`

---

#### `listGlobal` — List all your storage shares

```typescript
client.api.storageShares.listGlobal(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/storage/shares`
**CLI:** `hoody storage list-all`

---

#### `listGlobalAll` — List all your storage shares (collect all pages)

```typescript
client.api.storageShares.listGlobalAll(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/storage/shares`
**CLI:** `hoody storage list-all`

---

#### `listGlobalIterator` — List all your storage shares (async iterator)

```typescript
client.api.storageShares.listGlobalIterator(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/storage/shares`
**CLI:** `hoody storage list-all`

---

#### `listIncoming` — Get incoming shares

```typescript
client.api.storageShares.listIncoming(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/incoming`
**CLI:** `hoody storage incoming list`

---

#### `listIncomingGlobal` — Get all incoming shares

```typescript
client.api.storageShares.listIncomingGlobal(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/storage/incoming`
**CLI:** `hoody storage incoming list-all`

---

#### `listIncomingGlobalAll` — Get all incoming shares (collect all pages)

```typescript
client.api.storageShares.listIncomingGlobalAll(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/storage/incoming`
**CLI:** `hoody storage incoming list-all`

---

#### `listIncomingGlobalIterator` — Get all incoming shares (async iterator)

```typescript
client.api.storageShares.listIncomingGlobalIterator(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/storage/incoming`
**CLI:** `hoody storage incoming list-all`

---

#### `listIterator` — List storage shares (async iterator)

```typescript
client.api.storageShares.listIterator(target_type?: string, label?: string, status?: string, enabled?: string, include_expired?: string, realm_id?: string, id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `target_type` | `string` | query | No | Filter by target type |
| `label` | `string` | query | No | Filter by label |
| `status` | `string` | query | No | Filter by status |
| `enabled` | `string` | query | No | Filter by enabled status |
| `include_expired` | `string` | query | No | Include expired shares (default: false) |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `id` | `string` | path | Yes | Source container ID |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage list`

---

#### `toggleIncomingMount` — Toggle incoming share mount

```typescript
client.api.storageShares.toggleIncomingMount(id: string, shareId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Target container ID (receiver container) |
| `shareId` | `string` | path | Yes | Share ID to toggle |
| `data` | `object` | body | Yes |  |

**Body:** `{ mount*: bool }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount`
**CLI:** `hoody storage incoming toggle-mount`

---

#### `update` — Update storage share

```typescript
client.api.storageShares.update(id: string, shareId: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Source container ID |
| `shareId` | `string` | path | Yes | Share ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ mode: "readonly" | "readwrite", alias: string|null, label: string|null, description: string|null, enabled: bool, expires_at: number|null }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/containers/{id}/storage/shares/{shareId}`
**CLI:** `hoody storage update`

---

### `client.api.tfa` (7) — Two-Factor Authentication

#### `disable` — Disable 2FA

```typescript
client.api.tfa.disable(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ password*: string, code*: string }`

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/users/auth/2fa`
**CLI:** `hoody auth 2fa disable`

---

#### `getStatus` — Get 2FA Status

```typescript
client.api.tfa.getStatus()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/auth/2fa/status`
**CLI:** `hoody auth 2fa status`

---

#### `regenerateBackupCodes` — Regenerate Backup Codes

```typescript
client.api.tfa.regenerateBackupCodes(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ password*: string, code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/2fa/backup-codes/regenerate`
**CLI:** `hoody auth 2fa regenerate`

---

#### `setTokenGate` — Set 2FA token gate preference

```typescript
client.api.tfa.setTokenGate(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ enabled*: bool, password: string, otp_code: string }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/users/auth/2fa/token-gate`
**CLI:** `hoody auth 2fa gate`

---

#### `setup` — Initialize 2FA Setup

```typescript
client.api.tfa.setup(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ password*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/2fa/setup`
**CLI:** `hoody auth 2fa setup`

---

#### `verify` — Verify 2FA Code During Login

```typescript
client.api.tfa.verify(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ temp_token: string, code*: string, response_mode: "intent" | "tokens", client: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/2fa/verify`
**CLI:** `hoody auth 2fa verify`

---

#### `verifySetup` — Complete 2FA Setup

```typescript
client.api.tfa.verifySetup(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/auth/2fa/verify-setup`
**CLI:** `hoody auth 2fa verify-setup`

---

### `client.api.users` (9) — Users

#### `get` — Get user by ID

```typescript
client.api.users.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | User ID to retrieve |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/{id}`
**CLI:** `hoody users get`

---

#### `getFreeTierStatus` — Get free-tier claim status

```typescript
client.api.users.getFreeTierStatus()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/me/free-tier-status`

---

#### `getSecurityHistory` — Get your account security history

```typescript
client.api.users.getSecurityHistory(page?: integer, limit?: integer, include_failed?: boolean, include_security?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number |
| `limit` | `integer` | query | No | Results per page |
| `include_failed` | `boolean` | query | No | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | query | No | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/users/me/security-history`

---

#### `getSecurityHistoryAll` — Get your account security history (collect all pages)

```typescript
client.api.users.getSecurityHistoryAll(page?: integer, limit?: integer, include_failed?: boolean, include_security?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number |
| `limit` | `integer` | query | No | Results per page |
| `include_failed` | `boolean` | query | No | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | query | No | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/users/me/security-history`

---

#### `getSecurityHistoryIterator` — Get your account security history (async iterator)

```typescript
client.api.users.getSecurityHistoryIterator(page?: integer, limit?: integer, include_failed?: boolean, include_security?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number |
| `limit` | `integer` | query | No | Results per page |
| `include_failed` | `boolean` | query | No | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | query | No | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/users/me/security-history`

---

#### `markOnboardingMilestone` — Mark an onboarding milestone as completed

```typescript
client.api.users.markOnboardingMilestone(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ milestone*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/me/onboarding`

---

#### `redeemInviteCode` — Redeem a beta invite code

```typescript
client.api.users.redeemInviteCode(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/me/redeem-invite`
**CLI:** `hoody users redeem-invite`

---

#### `retrySetup` — Retry free-tier account setup

```typescript
client.api.users.retrySetup(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ region: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/users/me/retry-setup`
**CLI:** `hoody users retry-setup`

---

#### `update` — Update user profile

```typescript
client.api.users.update(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | User ID to update |
| `data` | `object` | body | Yes |  |

**Body:** `{ alias: string, public_key: string, metadata: object, password: string, current_password: string, is_admin: bool, is_banned: bool }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/users/{id}`
**CLI:** `hoody users update`

---

### `client.api.utilities` (1) — Utilities

#### `getIpInfo` — Get IP Information

```typescript
client.api.utilities.getIpInfo()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/ip`
**CLI:** `hoody ip get`

---

### `client.api.vault` (8) — User Vault

#### `clear` — Clear entire vault

```typescript
client.api.vault.clear(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/vault`
**CLI:** `hoody vault clear`

---

#### `delete` — Delete vault key

```typescript
client.api.vault.delete(realm_id?: string, key: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `key` | `string` | path | Yes | Vault key name (alphanumeric, dots, underscores, hyphens) |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/vault/keys/{key}`
**CLI:** `hoody vault delete`

---

#### `get` — Get vault key

```typescript
client.api.vault.get(realm_id?: string, key: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `key` | `string` | path | Yes | Vault key name (alphanumeric, dots, underscores, hyphens) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/vault/keys/{key}`
**CLI:** `hoody vault get`

---

#### `getStats` — Get vault statistics

```typescript
client.api.vault.getStats(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/vault/stats`
**CLI:** `hoody vault stats`

---

#### `list` — List vault keys

```typescript
client.api.vault.list(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/vault/keys`
**CLI:** `hoody vault list`

---

#### `listAll` — List vault keys (collect all pages)

```typescript
client.api.vault.listAll(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/vault/keys`
**CLI:** `hoody vault list`

---

#### `listIterator` — List vault keys (async iterator)

```typescript
client.api.vault.listIterator(realm_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/vault/keys`
**CLI:** `hoody vault list`

---

#### `set` — Set vault key

```typescript
client.api.vault.set(realm_id?: string, key: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `key` | `string` | path | Yes | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `data` | `object` | body | Yes |  |

**Body:** `{ value*: string, metadata: object|null }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/vault/keys/{key}`
**CLI:** `hoody vault set`

---

### `client.api.waitlist` (2) — Waitlist

#### `waitlistEnrich` — Enrich an existing waitlist signup

```typescript
client.api.waitlist.waitlistEnrich(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ email*: string, interest: "dev" | "ai" | "saas" | "security" | "creative" | "productivity" | "it" | "other" | …(9 values), context: "individual" | "startup" | "medium" | "enterprise" | "academic" | "", industry: "softdev" | "saas" | "paas" | "cloud" | "ai-ml" | "datasci" | "cyber" | "devops" | …(29 values), role: "lead" | "manager" | "director" | "exec" | "founder" | "engineer" | "devops" | "ml" | …(14 values) }`

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/waitlist`

---

#### `waitlistJoin` — Join the Hoody waitlist

```typescript
client.api.waitlist.waitlistJoin(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ email*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/waitlist`

---

### `client.api.wallet` (34) — Wallet

#### `addPaymentMethod` — Add a new payment method

```typescript
client.api.wallet.addPaymentMethod(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, details: object, is_default: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payment-methods create`

---

#### `claimGithubBonus` — Claim the GitHub connection bonus

```typescript
client.api.wallet.claimGithubBonus()
```

**Returns:** `any`  |  **HTTP:** `POST /api/v1/wallet/github-bonus/claim`

---

#### `createCryptoInvoice` — Start a crypto payment (hosted invoice)

```typescript
client.api.wallet.createCryptoInvoice(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ amount*: string, idempotency_key: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/wallet/payments/crypto/invoice`

---

#### `createStripeCheckout` — Start a card payment (Stripe Checkout)

```typescript
client.api.wallet.createStripeCheckout(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ amount*: string, idempotency_key: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/wallet/payments/stripe/checkout`

---

#### `deletePaymentMethod` — Delete a payment method

```typescript
client.api.wallet.deletePaymentMethod(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/wallet/payment-methods/{id}`
**CLI:** `hoody wallet payment-methods delete`

---

#### `downloadInvoicePdf` — Download invoice PDF

```typescript
client.api.wallet.downloadInvoicePdf(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/invoices/{id}/pdf`
**CLI:** `hoody wallet invoices download`

---

#### `generateInvoice` — Generate invoice for transaction

```typescript
client.api.wallet.generateInvoice(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/wallet/invoices/generate/{id}`
**CLI:** `hoody wallet invoices generate`

---

#### `getAggregateBalances` — Get aggregate balances (general + AI)

```typescript
client.api.wallet.getAggregateBalances()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/balances`
**CLI:** `hoody wallet balance get`

---

#### `getAiBalance` — Get AI balance (limit, usage, remaining)

```typescript
client.api.wallet.getAiBalance()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/balances/ai`
**CLI:** `hoody wallet balance ai`

---

#### `getCryptoPaymentIntent` — Get a crypto payment intent

```typescript
client.api.wallet.getCryptoPaymentIntent(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/payments/crypto/intents/{id}`

---

#### `getGeneralBalance` — Get general balance only

```typescript
client.api.wallet.getGeneralBalance()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/balances/general`
**CLI:** `hoody wallet balance general`

---

#### `getGithubBonus` — Get GitHub connection bonus status

```typescript
client.api.wallet.getGithubBonus()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/github-bonus`

---

#### `getInvoice` — Get invoice by ID

```typescript
client.api.wallet.getInvoice(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/invoices/{id}`
**CLI:** `hoody wallet invoices get`

---

#### `getPaymentAvailability` — Get top-up payment availability (providers, bounds, AI transfer fee)

```typescript
client.api.wallet.getPaymentAvailability()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/payment-availability`

---

#### `getPaymentMethod` — Get payment method by ID

```typescript
client.api.wallet.getPaymentMethod(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/payment-methods/{id}`
**CLI:** `hoody wallet payment-methods get`

---

#### `getStripePaymentIntent` — Get a card payment intent

```typescript
client.api.wallet.getStripePaymentIntent(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/payments/stripe/intents/{id}`

---

#### `getTransaction` — Get transaction by ID

```typescript
client.api.wallet.getTransaction(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/transactions/{id}`
**CLI:** `hoody wallet transactions get`

---

#### `listAiFeeHistory` — Get AI credit fee history

```typescript
client.api.wallet.listAiFeeHistory(page?: number, limit?: number, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/ai-fee-history`
**CLI:** `hoody wallet transactions fees`

---

#### `listAiFeeHistoryAll` — Get AI credit fee history (collect all pages)

```typescript
client.api.wallet.listAiFeeHistoryAll(page?: number, limit?: number, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/wallet/ai-fee-history`
**CLI:** `hoody wallet transactions fees`

---

#### `listAiFeeHistoryIterator` — Get AI credit fee history (async iterator)

```typescript
client.api.wallet.listAiFeeHistoryIterator(page?: number, limit?: number, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/wallet/ai-fee-history`
**CLI:** `hoody wallet transactions fees`

---

#### `listCryptoPaymentIntents` — List crypto payment intents

```typescript
client.api.wallet.listCryptoPaymentIntents(limit?: integer, offset?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/payments/crypto/intents`

---

#### `listInvoices` — Get all invoices

```typescript
client.api.wallet.listInvoices(page?: integer, limit?: integer, sort_by?: string, sort_order?: string, filter?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | query | No | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `string` | query | No |  |
| `filter` | `string` | query | No | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/invoices/`
**CLI:** `hoody wallet invoices list`

---

#### `listInvoicesAll` — Get all invoices (collect all pages)

```typescript
client.api.wallet.listInvoicesAll(page?: integer, limit?: integer, sort_by?: string, sort_order?: string, filter?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | query | No | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `string` | query | No |  |
| `filter` | `string` | query | No | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/wallet/invoices/`
**CLI:** `hoody wallet invoices list`

---

#### `listInvoicesIterator` — Get all invoices (async iterator)

```typescript
client.api.wallet.listInvoicesIterator(page?: integer, limit?: integer, sort_by?: string, sort_order?: string, filter?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | Page number for pagination - starts from 1 |
| `limit` | `integer` | query | No | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | query | No | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `string` | query | No |  |
| `filter` | `string` | query | No | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/wallet/invoices/`
**CLI:** `hoody wallet invoices list`

---

#### `listPaymentMethods` — Get all payment methods

```typescript
client.api.wallet.listPaymentMethods()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payment-methods list`

---

#### `listPaymentMethodsAll` — Get all payment methods (collect all pages)

```typescript
client.api.wallet.listPaymentMethodsAll()
```

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payment-methods list`

---

#### `listPaymentMethodsIterator` — Get all payment methods (async iterator)

```typescript
client.api.wallet.listPaymentMethodsIterator()
```

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payment-methods list`

---

#### `listStripePaymentIntents` — List card payment intents

```typescript
client.api.wallet.listStripePaymentIntents(limit?: integer, offset?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/payments/stripe/intents`

---

#### `listTransactions` — List transactions

```typescript
client.api.wallet.listTransactions(limit?: number, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/wallet/transactions`
**CLI:** `hoody wallet transactions list`

---

#### `listTransactionsAll` — List transactions (collect all pages)

```typescript
client.api.wallet.listTransactionsAll(limit?: number, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/wallet/transactions`
**CLI:** `hoody wallet transactions list`

---

#### `listTransactionsIterator` — List transactions (async iterator)

```typescript
client.api.wallet.listTransactionsIterator(limit?: number, sort_by?: string, sort_order?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `sort_by` | `string` | query | No |  |
| `sort_order` | `string` | query | No |  |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/wallet/transactions`
**CLI:** `hoody wallet transactions list`

---

#### `setDefaultPaymentMethod` — Set a payment method as default

```typescript
client.api.wallet.setDefaultPaymentMethod(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/wallet/payment-methods/{id}/default`
**CLI:** `hoody wallet payment-methods set-default`

---

#### `transferToAi` — Transfer from general balance to AI credits

```typescript
client.api.wallet.transferToAi(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ amount*: string, idempotency_key: string, expected_fee_bps: int }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/wallet/transfers`
**CLI:** `hoody wallet transfer`

---

#### `updatePaymentMethod` — Update a payment method

```typescript
client.api.wallet.updatePaymentMethod(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `object` | body | Yes |  |

**Body:** `{ details: object, status: "active" | "inactive", is_default: bool }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/wallet/payment-methods/{id}`
**CLI:** `hoody wallet payment-methods update`

