> _**SDK skill · `api` namespace** · ~72,235 tokens · hoody-sdk v1.0.0-beta.16_

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
- Bearer token in `Authorization`. Mint via `auth.login` (1d JWT / 7d refresh) or `auth.tokens.create` (long-lived, scopable).
- 2FA management (`auth.twoFactor.startSetup`, `auth.twoFactor.confirmSetup`, `auth.twoFactor.disable`, `auth.twoFactor.rotateBackupCodes` and the status read) takes a login session JWT, or account-password HTTP Basic auth (which is subject to its own password and 2FA checks); a long-lived `auth.tokens.create` token is refused with 403 there. On top of that, the bodies differ: `auth.twoFactor.startSetup` needs the password; `auth.twoFactor.confirmSetup` needs the OTP code; `auth.twoFactor.verify` needs `temp_token` + code; `auth.twoFactor.disable` needs password + OTP **or** backup code; `auth.twoFactor.rotateBackupCodes` needs password + a **6-digit TOTP only** (`^\\d{6}$` — a backup code fails schema validation with 422). Login-time `auth.twoFactor.verify` needs no session.
- Project/container writes: project owner or matching permission row.
- Billing: prerequisites depend on the operation. A hosted crypto invoice (`wallet.createCryptoInvoice`) needs no saved payment method, only a login session (auth tokens are refused 403); server rentals and extensions debit the general wallet balance, so fund it first.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap (signup → verify → login [+2FA])

1. `client.api.auth.signup`
2. `client.api.auth.verifyEmail`
3. `client.api.auth.login`
4. `client.api.auth.twoFactor.verify` (if 2FA enabled — uses `temp_token`)
5. `client.api.auth.whoami`

### 2. Mint a long-lived auth token

1. `client.api.auth.tokens.create`
2. `client.api.auth.tokens.list`
3. `client.api.auth.tokens.addRealm`
4. `client.api.auth.tokens.removeRealm`
5. `client.api.auth.tokens.copy`
6. `client.api.auth.tokens.delete`

### 3. Set up 2FA

1. `client.api.auth.twoFactor.startSetup`
2. `client.api.auth.twoFactor.confirmSetup`
3. `client.api.auth.twoFactor.getStatus`
4. `client.api.auth.twoFactor.rotateBackupCodes`
5. `client.api.auth.twoFactor.enableTokenGate` / `client.api.auth.twoFactor.disableTokenGate`

### 4. Create first project + container

`containers.create` needs a `server_id` and a project id; see § Quirks & gotchas.
1. `client.api.realms.list`
2. `client.api.servers.list` (pick the `server_id`)
3. `client.api.images.listPublic` (only when you want a non-default image)
4. `client.api.projects.create`
5. `client.api.containers.create` (with `server_id`)
6. `client.api.containers.start` (when the container is not already running)
7. `client.api.containers.get`

List the container's proxy aliases by getting it with `include_proxy_domains` set to `true`: `client.api.containers.get(id, { include_proxy_domains: true })` (a boolean). The `proxy_domains` array is only populated when `include_proxy_domains` is true, and it holds the aliases created with `proxy.aliases.create` (each with its `url`), not the built-in kit URLs: a container with no aliases returns an empty array. Build kit URLs from the pattern in § Proxy URLs.

### 5. Grant another user access

Project-scope analogues live under `proxy.projectPermissions.*`. Every proxy-permissions write (steps 6 to 9, and their project-scope analogues) is guarded by optimistic concurrency: it must carry `If-Match: file:v<N>`, where `N` is the document's current `file_version`. Read it with `client.api.proxy.containerPermissions.get` (the response carries `file_version` and an `ETag`); each successful write bumps the version and returns the new `ETag`, so pass that one to the next write. A missing header is refused 428, and a malformed or stale one 412. SDK: pass it as the `ifMatch` option, e.g. `{ ifMatch: 'file:v3' }`.
1. `client.api.projects.listPermissions`
2. `client.api.projects.createPermission`
3. `client.api.projects.updatePermission`
4. `client.api.projects.deletePermission`
5. `client.api.proxy.containerPermissions.get` (read `file_version`)
6. `client.api.proxy.containerPermissions.setPasswordGroup` (If-Match)
7. `client.api.proxy.containerPermissions.setTokenGroup` (If-Match)
8. `client.api.proxy.containerPermissions.setJwtGroup` (If-Match)
9. `client.api.proxy.containerPermissions.enable` / `client.api.proxy.containerPermissions.disable` (If-Match)

### 6. Container exposure & shares

1. `client.api.network.update`
2. `client.api.network.start`
3. `client.api.firewall.createEgressRule`
4. `client.api.firewall.createIngressRule`
5. `client.api.proxy.aliases.create`
6. `client.api.proxy.aliases.enable` / `client.api.proxy.aliases.disable`
7. `client.api.storage.shares.create`
8. `client.api.storage.shares.listIncomingByContainer` (container-scoped)
9. `client.api.storage.shares.mountIncoming` / `client.api.storage.shares.unmountIncoming`
10. `client.api.storage.shares.delete`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `client.api.snapshots.create`
2. `client.api.snapshots.list`
3. `client.api.snapshots.restore`
4. `client.api.containers.copy`
5. `client.api.snapshots.delete`
6. `client.api.containers.env.list`
7. `client.api.containers.env.set`
8. `client.api.containers.env.update`
9. `client.api.containers.env.delete`
10. `client.api.containers.enableKvm` / `client.api.containers.disableKvm` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `client.api.containers.create`.

### 8. Billing: wallet → rent

1. `client.api.wallet.createPaymentMethod`
2. `client.api.wallet.setDefaultPaymentMethod`
3. `client.api.wallet.createStripeCheckout` (crypto: `client.api.wallet.createCryptoInvoice`)
4. `client.api.wallet.getStripePaymentIntent` (crypto: `client.api.wallet.getCryptoPaymentIntent`)
5. `client.api.wallet.getBalances`
6. `client.api.wallet.listTransactions`
7. `client.api.servers.listMarketplace`
8. `client.api.servers.rent`
9. `client.api.servers.list`
10. `client.api.servers.extend`
11. `client.api.servers.commands.run`

Rentals and extensions are charged to the general balance. Call `client.api.wallet.transferToCredits` only to fund AI usage: it moves money out of that general balance into AI credits, minus a platform fee, so it leaves less for rentals.

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands. ONE exception worth reading before you call it: the notification inbox is NOT uniform CRUD. `inbox.list` needs `resources.read_account` on the token (403 without it — the external_customer, dev_team, finance_team and read_only templates all deny it, as do all tokens minted before 2026-06-30), and `markRead` / `markAllRead` refuse EVERY auth token regardless of permissions, because acknowledging is how the record of an account event is dismissed. `inbox.getSummary` (unread count and newest position, no bodies) is gated on `resources.read_account` the same way. `inbox.listAnnouncements` needs no auth, but it returns only public system announcements, not the account inbox, so it is not a substitute for `inbox.list`.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `auth.logoutAll` is a logout-ALL for JWTs — every access and refresh JWT issued before that moment stops working (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `auth.tokens.delete`). `auth.refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. `client.api.auth.refresh({ refreshToken })` handles both: the client presents the body's `refreshToken` as the bearer for that one request, whatever token the client holds, so no separate client is needed (the call never enters automatic 401 recovery). For headless flows, mint a long-lived `auth.tokens.create` token instead.
- `servers.listRegions` returns `r.data.regions` (single-wrapped, like every other endpoint).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user the stored password is left unchanged (first writer wins) and a fresh verification email is sent; for a verified user it is a no-op. A second signup therefore cannot fix a mistyped password: logging in with the new one fails with 401. Change it through `auth.recoverPassword` → `auth.resetPassword`. Do NOT probe with signup.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers: it accepts the bare per-container kit URL, and access is decided by the container's proxy permission policy. No built-in kit asks for more, `bot` included: its management routes ignore an `Authorization` header and check no container ownership, so the proxy permission policy is their only access control. The `containers.createClaim(id)` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- `containers.start`, `containers.stop`, `containers.restart`, `containers.pause` and `containers.resume` all call `POST /api/v1/containers/{id}/{operation}`: the operation is the last PATH segment, never a body field, and each method fixes it for you. `containers.stop(id, undefined, { force: true })` sends `force-stop`. The optional body field `timeout` (seconds) caps how long the operation may run on the host; for `stop` and `restart` it is also the time the container gets to shut down cleanly.
- `containers.create` needs a `server_id` in its body, and nothing else in workflow 4 produces one: take it from `servers.list` (a server you rent). A `name` that another container in the project already uses is refused with 409. `container_image` is optional (omitted, the default image is used); name a public image from `images.listPublic`, since `images.list` lists only images your account owns and is empty on a new account. A bare `debian` resolves to the canonical base image.
- Snapshots are addressed by `name`, never by alias: `snapshots.restore`, `snapshots.delete` and `snapshots.setAlias` take the `name` that `snapshots.list` returns. `snapshots.create` derives it from `alias`: it keeps only letters, digits, `_` and `-`, drops any leading or trailing `-` and `_`, and cuts the result to 64 characters. A derived name shorter than 2 characters is refused with 400. With no alias, or one with no usable characters, the name is `snap-YYYYMMDD-HHMMSS` (UTC).
- `snapshots.create` needs the container `running` or `stopped` (another status is refused with 400). A container holds at most 1000 snapshots, 10 on a free-tier slice; one more is refused with 400 `CONTAINER_SNAPSHOT_LIMIT` until you delete one.
- `projects.create` names the project with `alias` (required, at most 100 characters); there is no `name` field. An alias that one of your projects already uses is refused with 409.
- Kit URL `<projectId>-<containerId>-<kit>-<n>.<server>.containers.hoody.com` (a terminal id of 10000 or more makes that label longer than DNS allows, so it is `t-<n>` instead of `terminal-<n>`; the SDK and CLI do this for you): with the default proxy permissions, holding the URL is enough to use the kit, `bot` management routes included. Treat it as a secret, since it also exposes the project and container ids; restrict it with `proxy.containerPermissions.*` groups, or publish a `proxy.aliases.create` alias instead.
- `proxy.services.list` lists only the services named in the container's proxy permission rules or hooks, so a container with no custom rules returns `services: []`; it is not a list of running kits. `proxy.aliases.create` takes the kit or protocol as `program` (e.g. `'exec'`, `'terminal'`, or `'http'` with `port`).
- `wallet.listInvoices` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `ip.get` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `servers.offers.reserve` charges at once, and every reservation whose total is above zero needs `max_charge_cents`, although the body schema marks it optional. Without it the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED` (409 `SETUP_FEE_CONFIRMATION_REQUIRED` when the offer has a one-time setup fee), and a total above it is refused with 409 `CHARGE_EXCEEDS_MAX`; the error data carries `total_cents`, and nothing is charged. It also needs a caller-generated `idempotency_key`: a retry with the same key returns the first reservation instead of charging again.
- `servers.extend` needs `expected_rental_end`: the rental's current `rental_end`, as `servers.get` returns it. The extension is applied only while that still matches, so a retry after a lost response is refused with 409 `EXTENSION_ALREADY_APPLIED` instead of charging twice; read the rental again before retrying. `max_charge_cents` is optional only when the rental's frozen renewal tiers (`renewal_pricing_frozen`) price `additional_days`; otherwise the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED`, and the error data carries `total_cents`.
- `storage.shares.listIncomingByContainer(id)` is container-scoped: its `id` is the receiving container's id. For every incoming share across the account use `storage.shares.listIncoming`.
- `verifyEmail` body has `token` + optional `response_mode`, `code_challenge` (required when `response_mode: 'intent'`) and `client` (analytics source channel) — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `auth.twoFactor.verify`.
- KVM (`PUT /api/v1/containers/{id}/kvm`, field `kvm` on create/responses) is rented/dedicated (bare-metal) servers ONLY — free tier is hard-refused with 403, and the container must be STOPPED to toggle (409 otherwise). Canonical field is `kvm`; `dev_kvm` is an input-only alias (`kvm` wins; both present and disagreeing → 400). Default off.

## Common errors

- 400 — explicit bad-request checks: login "Username or email, and password are required", an unknown signup `region`, a malformed `filter` (below).
- 400 `filter must be valid JSON` / `filter must be a JSON object` — a list's `filter` query parameter must be a JSON object; malformed JSON, `null`, an array or a scalar is refused (it used to be ignored). On lists that allow only some columns, such as `wallet.listTransactions` and `wallet.listInvoices`, an unknown column or operator is also 400. An empty `filter=` means no filter.
- 401 — Bearer missing/malformed. JWTs require the literal `Bearer ` prefix; `hdy_…` auth tokens are also accepted bare (`Authorization: hdy_…`).
- 403 — missing permission row or `resources.*` flag.
- 404 — missing resource OR 403 masked.
- 409 — uniqueness (duplicate username, proxy-alias).
- 428 / 412 — on the public routes these come from the If-Match guard on proxy-permission, proxy-settings and proxy-hook writes: 428 means the `If-Match` header is missing, 412 means it is malformed or stale (the document changed since you read it). Re-read the document (`proxy.containerPermissions.get` / `proxy.projectPermissions.get`), send its current `file:v<N>`, and retry. They do not signal a missing payment method, email verification or 2FA.
- 422 — request-schema validation (e.g. a backup code sent where `auth.twoFactor.rotateBackupCodes` wants a 6-digit TOTP: the body is `{statusCode: 422, error: "Validation Error", message: "Validation failed: …"}`, with no `REQUEST_SCHEMA_INVALID` code on the wire) and semantic validation (password complexity, `rental_days` with no pricing).
- 429 — login 1000/30min (failures only), signup 5/hour, refresh 30/30min.
- 400 — the `events` socket accepts the WebSocket transport only (unless the deployment turns polling on); while polling is off, every long-polling request (with or without a `sid`) is refused with 400 `Polling transport is not supported; use the websocket transport`. Only on a deployment that turns polling on does a polling write with a missing or unknown `sid` get 400 `Unknown session`. Connect with `transports: ['websocket']`.
- Always-200 — `auth.recoverPassword`, `auth.sendVerificationEmail`, duplicate-`signup`; do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

**Accessor:** `client.api`  |  **Import:** `import * as api from 'hoody-sdk/api'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. The per-call transport options — `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass), plus `_realm` to scope one call to a realm — go in the trailing options object, which is one further optional argument when the signature does not already show one.

### `client.api.activity` (4) — Activity Logs

#### `getStats` — Get activity stats

```typescript
client.api.activity.getStats()
```

**Returns:** `Promise<ApiActivityGetStatsResponse>`  |  **HTTP:** `GET /api/v1/users/auth/activity/stats`
**CLI:** `hoody activity stats`

---

#### `list` — Get activity logs

```typescript
client.api.activity.list(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number |
| `limit` | `number` | query | No | Results per page |
| `start_date` | `string` | query | No | Filter logs after this date |
| `end_date` | `string` | query | No | Filter logs before this date |
| `errors_only` | `boolean` | query | No | Show only errors (status >= 400) |
| `min_status` | `number` | query | No | Minimum status code |
| `max_status` | `number` | query | No | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | query | No | Filter by HTTP method |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `Promise<ApiActivityListResponse>`  |  **HTTP:** `GET /api/v1/users/auth/activity`
**CLI:** `hoody activity list`

---

#### `listAll` — Get activity logs (collect all pages)

```typescript
client.api.activity.listAll(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number |
| `limit` | `number` | query | No | Results per page |
| `start_date` | `string` | query | No | Filter logs after this date |
| `end_date` | `string` | query | No | Filter logs before this date |
| `errors_only` | `boolean` | query | No | Show only errors (status >= 400) |
| `min_status` | `number` | query | No | Minimum status code |
| `max_status` | `number` | query | No | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | query | No | Filter by HTTP method |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `Promise<(NonNullable<ApiActivityListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/users/auth/activity`
**CLI:** `hoody activity list`

---

#### `listIterator` — Get activity logs (async iterator)

```typescript
client.api.activity.listIterator(options?: { page?: number; limit?: number; start_date?: string; end_date?: string; errors_only?: boolean; min_status?: number; max_status?: number; method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number |
| `limit` | `number` | query | No | Results per page |
| `start_date` | `string` | query | No | Filter logs after this date |
| `end_date` | `string` | query | No | Filter logs before this date |
| `errors_only` | `boolean` | query | No | Show only errors (status >= 400) |
| `min_status` | `number` | query | No | Minimum status code |
| `max_status` | `number` | query | No | Maximum status code |
| `method` | `"GET" \| "POST" \| "PUT" \| "PATCH" \| "DELETE"` | query | No | Filter by HTTP method |
| `realm_id` | `string` | query | No | Filter by realm ID |

**Returns:** `AsyncGenerator<(NonNullable<ApiActivityListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/users/auth/activity`
**CLI:** `hoody activity list`

---

### `client.api.ai` (1) — AI

#### `listModels` — List available AI models (Hoody catalog)

```typescript
client.api.ai.listModels()
```

**Returns:** `Promise<ApiAiListModelsResponse>`  |  **HTTP:** `GET /api/v1/ai/models`
**CLI:** `hoody ai models list`

---

### `client.api.auth` (11) — Authentication

#### `createIdentityClaim` — Issue a fresh audience-bound identity claim

```typescript
client.api.auth.createIdentityClaim(data: ApiAuthCreateIdentityClaimRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthCreateIdentityClaimRequest` | body | Yes |  |

**Body:** `{ audience*: string, expires_in: int }`

- `expires_in` — Requested claim lifetime in seconds. Clamped to [60, min(server ceiling, remaining JWT lifetime)]. Default: server-configured (1h).

**Returns:** `Promise<ApiAuthCreateIdentityClaimResponse>`  |  **HTTP:** `POST /api/v1/users/auth/identity-claim`
**CLI:** `hoody auth claims create`

---

#### `getConfig` — Get the public sign-in configuration

```typescript
client.api.auth.getConfig()
```

**Returns:** `Promise<ApiAuthGetConfigResponse>`  |  **HTTP:** `GET /api/v1/auth/config`
**CLI:** `hoody auth config get`

---

#### `login` — Login with username and password

```typescript
client.api.auth.login(data: ApiAuthLoginRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthLoginRequest` | body | Yes |  |

**Body:** `{ username: string, email: string, password*: string, response_mode: "intent" | "tokens", client: string, code_challenge: string } (at least one of: username | email required)`

- `code_challenge` — PKCE code_challenge (base64url SHA-256 of the code_verifier). Required when response_mode=intent.

**Returns:** `Promise<ApiAuthLoginResponse>`  |  **HTTP:** `POST /api/v1/users/auth/login`

---

#### `logoutAll` — Log out everywhere

```typescript
client.api.auth.logoutAll()
```

**Returns:** `Promise<ApiAuthLogoutAllResponse>`  |  **HTTP:** `POST /api/v1/users/auth/logout`

---

#### `recoverPassword` — Request password reset

```typescript
client.api.auth.recoverPassword(data: ApiAuthRecoverPasswordRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthRecoverPasswordRequest` | body | Yes |  |

**Body:** `{ email*: string }`

**Returns:** `Promise<ApiAuthRecoverPasswordResponse>`  |  **HTTP:** `POST /api/v1/auth/forgot-password`
**CLI:** `hoody auth password recover`

---

#### `refresh` — Refresh access token

```typescript
client.api.auth.refresh(data: ApiAuthRefreshRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthRefreshRequest` | body | Yes |  |

**Body:** `{ refreshToken*: string }`

**Returns:** `Promise<ApiAuthRefreshResponse>`  |  **HTTP:** `POST /api/v1/users/auth/refresh`
**CLI:** `hoody auth refresh`

---

#### `resetPassword` — Reset password

```typescript
client.api.auth.resetPassword(data: ApiAuthResetPasswordRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthResetPasswordRequest` | body | Yes |  |

**Body:** `{ token*: string, password*: string }`

- `password` — New password (min 12 chars, at most 72 UTF-8 bytes, at least 3 of the 4 character classes: uppercase, lowercase, number, special)

**Returns:** `Promise<ApiAuthResetPasswordResponse>`  |  **HTTP:** `POST /api/v1/auth/reset-password`
**CLI:** `hoody auth password reset`

---

#### `sendVerificationEmail` — Resend verification email

```typescript
client.api.auth.sendVerificationEmail(data: ApiAuthSendVerificationEmailRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthSendVerificationEmailRequest` | body | Yes |  |

**Body:** `{ email*: string }`

**Returns:** `Promise<ApiAuthSendVerificationEmailResponse>`  |  **HTTP:** `POST /api/v1/auth/resend-verification`
**CLI:** `hoody auth email verification send`

---

#### `signup` — Sign up with email and password

```typescript
client.api.auth.signup(data: ApiAuthSignupRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthSignupRequest` | body | Yes |  |

**Body:** `{ email*: string, password*: string, region: string, invite_code: string, client: string }`

- `password` — Password (min 12 chars, at most 72 UTF-8 bytes, at least 3 of the 4 character classes: uppercase, lowercase, number, special)

**Returns:** `Promise<ApiAuthSignupResponse>`  |  **HTTP:** `POST /api/v1/auth/signup`

---

#### `verifyEmail` — Verify email address

```typescript
client.api.auth.verifyEmail(data: ApiAuthVerifyEmailRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthVerifyEmailRequest` | body | Yes |  |

**Body:** `{ client: string, token*: string, response_mode: "intent" | "tokens", code_challenge: string }`

- `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier). Required when response_mode=intent.

**Returns:** `Promise<ApiAuthVerifyEmailResponse>`  |  **HTTP:** `POST /api/v1/auth/verify-email`
**CLI:** `hoody auth email verify`

---

#### `whoami` — Get current user profile

```typescript
client.api.auth.whoami()
```

**Returns:** `Promise<ApiAuthWhoamiResponse>`  |  **HTTP:** `GET /api/v1/users/auth/me`
**CLI:** `hoody auth whoami`

---

### `client.api.auth.device` (5) — Authentication

#### `deny` — Refuse the device ('Don't authorize')

```typescript
client.api.auth.device.deny(data: ApiAuthDeviceDenyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthDeviceDenyRequest` | body | Yes |  |

**Body:** `{ ticket*: string }`

**Returns:** `Promise<ApiAuthDeviceDenyResponse>`  |  **HTTP:** `POST /api/v1/auth/device/deny`

---

#### `login` — Password sign-in for the device authorize step (cookie + ticket gated)

```typescript
client.api.auth.device.login(data: ApiAuthDeviceLoginRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthDeviceLoginRequest` | body | Yes |  |

**Body:** `{ ticket*: string, username: string, email: string, password*: string } (at least one of: username | email required)`

**Returns:** `Promise<ApiAuthDeviceLoginResponse>`  |  **HTTP:** `POST /api/v1/auth/device/login`

---

#### `poll` — Poll for device-flow tokens (RFC-8628-inspired)

```typescript
client.api.auth.device.poll(data: ApiAuthDevicePollRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthDevicePollRequest` | body | Yes |  |

**Body:** `{ device_code*: string, code_verifier: string }`

**Returns:** `Promise<ApiAuthDevicePollResponse>`  |  **HTTP:** `POST /api/v1/auth/device/token`
**CLI:** `hoody auth device poll`

---

#### `start` — Start a device authorization flow (RFC-8628-inspired)

```typescript
client.api.auth.device.start(data: ApiAuthDeviceStartRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthDeviceStartRequest` | body | Yes |  |

**Body:** `{ client_name: string, client: string, code_challenge: string }`

- `code_challenge` — Optional PKCE on the device flow itself; if present the poll REQUIRES the verifier

**Returns:** `Promise<ApiAuthDeviceStartResponse>`  |  **HTTP:** `POST /api/v1/auth/device/code`
**CLI:** `hoody auth device start`

---

#### `verifyCode` — Confirm a device user_code (verification page)

```typescript
client.api.auth.device.verifyCode(data: ApiAuthDeviceVerifyCodeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthDeviceVerifyCodeRequest` | body | Yes |  |

**Body:** `{ user_code*: string }`

**Returns:** `Promise<ApiAuthDeviceVerifyCodeResponse>`  |  **HTTP:** `POST /api/v1/auth/device/verify_code`

---

### `client.api.auth.oauth` (4) — Authentication

#### `authorize` — Begin a PKCE OAuth authorization

```typescript
client.api.auth.oauth.authorize(data: ApiAuthOauthAuthorizeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthOauthAuthorizeRequest` | body | Yes |  |

**Body:** `{ code_challenge*: string, redirect_uri*: string }`

**Returns:** `Promise<ApiAuthOauthAuthorizeResponse>`  |  **HTTP:** `POST /api/v1/auth/authorize`
**CLI:** `hoody auth oauth authorize`

---

#### `cancelIntent` — Cancel a pending OAuth intent or 2FA temp_token

```typescript
client.api.auth.oauth.cancelIntent()
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/auth/intent/cancel`
**CLI:** `hoody auth oauth intents cancel`

---

#### `exchange` — Exchange a PKCE authorization code for tokens

```typescript
client.api.auth.oauth.exchange(data: ApiAuthOauthExchangeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthOauthExchangeRequest` | body | Yes |  |

**Body:** `{ code*: string, code_verifier*: string, redirect_uri*: string }`

**Returns:** `Promise<ApiAuthOauthExchangeResponse>`  |  **HTTP:** `POST /api/v1/auth/exchange`
**CLI:** `hoody auth oauth exchange`

---

#### `startLaunch` — Initiate OAuth popup-handoff launch

```typescript
client.api.auth.oauth.startLaunch(data: ApiAuthOauthStartLaunchRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthOauthStartLaunchRequest` | body | Yes |  |

**Body:** `{ provider*: "github" | "google", client: string, code_challenge*: string, state_id*: string }`

**Returns:** `Promise<ApiAuthOauthStartLaunchResponse>`  |  **HTTP:** `POST /api/v1/auth/launch/initiate`

---

### `client.api.auth.tokens` (14) — Auth Tokens

#### `addRealm` — Add realm to auth token

```typescript
client.api.auth.tokens.addRealm(id: string, data: ApiAuthTokensAddRealmRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Auth token ID |
| `data` | `ApiAuthTokensAddRealmRequest` | body | Yes |  |

**Body:** `{ realm_id*: string, otp_code: string }`

- `otp_code` — TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.

**Returns:** `Promise<ApiAuthTokensAddRealmResponse>`  |  **HTTP:** `POST /api/v1/auth/tokens/{id}/add-realm`
**CLI:** `hoody auth tokens realms add`

---

#### `copy` — Copy auth token

```typescript
client.api.auth.tokens.copy(id: string, data: ApiAuthTokensCopyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token |
| `data` | `ApiAuthTokensCopyRequest` | body | Yes |  |

**Body:** `{ alias: string, expires_at: string|null | "today" | "tomorrow" | number, otp_code: string }`

- `otp_code` — TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.

**Returns:** `Promise<ApiAuthTokensCopyResponse>`  |  **HTTP:** `POST /api/v1/auth/tokens/{id}/copy`
**CLI:** `hoody auth tokens copy`

---

#### `create` — Create a new auth token

```typescript
client.api.auth.tokens.create(data: ApiAuthTokensCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthTokensCreateRequest` | body | Yes |  |

**Body:** `{ alias: string, public_key: string|null, public_storage: object|null, ip_whitelist: string[] | string, permission_template: "full_access" | "external_customer" | "dev_team" | "finance_team" | "read_only" | null, permissions: { containers: object, projects: object, financial: object, resources: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, deny_reauthorization: bool, expires_at: string | "today" | "tomorrow" | number, otp_code: string }`

- `public_storage` — Public JSON profile storage attached to the token public_key (max 64KB)
- `ip_whitelist` — IP whitelist for this token. Accepts an array of IPv4 addresses/CIDR ranges, a comma-separated string, or "*" wildcard. Defaults to "*" (allow all) if not provided. At most 1000 entries, and at most 65536 characters as a string; larger values are refused with IP_WHITELIST_TOO_LARGE.
- `realm_ids` — List of realm IDs this token is restricted to (at most 500). If provided, the token can ONLY be used on these specific realm subdomains.
- `deny_reauthorization` — … When true, the token gets no `resources.create_tokens` or `resources.vault` permission, `vault_access` is forced to false, and the token must expire (no permanent token) — so it can never create child tokens or reach the vault. Rejected (400) if combined with an explicit `create_tokens`/`resources.vault`/`vault_access` grant. …
- `otp_code` — TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.

**Returns:** `Promise<ApiAuthTokensCreateResponse>`  |  **HTTP:** `POST /api/v1/auth/tokens`
**CLI:** `hoody auth tokens create`

---

#### `delete` — Delete auth token

```typescript
client.api.auth.tokens.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token |

**Returns:** `Promise<ApiAuthTokensDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/auth/tokens/{id}`
**CLI:** `hoody auth tokens delete`

---

#### `get` — Get auth token by ID

```typescript
client.api.auth.tokens.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token |

**Returns:** `Promise<ApiAuthTokensGetResponse>`  |  **HTTP:** `GET /api/v1/auth/tokens/{id}`
**CLI:** `hoody auth tokens get`

---

#### `getCurrent` — Get current auth token details

```typescript
client.api.auth.tokens.getCurrent()
```

**Returns:** `Promise<ApiAuthTokensGetCurrentResponse>`  |  **HTTP:** `GET /api/v1/auth/tokens/me`
**CLI:** `hoody auth tokens get`

---

#### `getPublicProfile` — Get auth token public profile by public key

```typescript
client.api.auth.tokens.getPublicProfile(public_key: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `public_key` | `string` | path | Yes | ED25519 public key to resolve |

**Returns:** `Promise<ApiAuthTokensGetPublicProfileResponse>`  |  **HTTP:** `GET /api/v1/auth/tokens/public-profiles/{public_key}`
**CLI:** `hoody auth tokens profiles get`

---

#### `list` — List auth tokens

```typescript
client.api.auth.tokens.list()
```

**Returns:** `Promise<ApiAuthTokensListResponse>`  |  **HTTP:** `GET /api/v1/auth/tokens`
**CLI:** `hoody auth tokens list`

---

#### `listAll` — List auth tokens (collect all pages)

```typescript
client.api.auth.tokens.listAll()
```

**Returns:** `Promise<(NonNullable<ApiAuthTokensListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/auth/tokens`
**CLI:** `hoody auth tokens list`

---

#### `listIterator` — List auth tokens (async iterator)

```typescript
client.api.auth.tokens.listIterator()
```

**Returns:** `AsyncGenerator<(NonNullable<ApiAuthTokensListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/auth/tokens`
**CLI:** `hoody auth tokens list`

---

#### `listTemplates` — List permission templates

```typescript
client.api.auth.tokens.listTemplates()
```

**Returns:** `Promise<ApiAuthTokensListTemplatesResponse>`  |  **HTTP:** `GET /api/v1/auth/tokens/templates`
**CLI:** `hoody auth tokens templates list`

---

#### `removeRealm` — Remove realm from auth token

```typescript
client.api.auth.tokens.removeRealm(id: string, data: ApiAuthTokensRemoveRealmRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Auth token ID |
| `data` | `ApiAuthTokensRemoveRealmRequest` | body | Yes |  |

**Body:** `{ realm_id*: string, otp_code: string }`

- `otp_code` — TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.

**Returns:** `Promise<ApiAuthTokensRemoveRealmResponse>`  |  **HTTP:** `POST /api/v1/auth/tokens/{id}/remove-realm`
**CLI:** `hoody auth tokens realms remove`

---

#### `update` — Update auth token

```typescript
client.api.auth.tokens.update(id: string, data: ApiAuthTokensUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the token to update |
| `data` | `ApiAuthTokensUpdateRequest` | body | Yes |  |

**Body:** `{ alias: string, public_key: string|null, public_storage: object|null, ip_whitelist: string[] | string, permissions: { containers: object, projects: object, financial: object, resources: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, expires_at: string|null | "today" | "tomorrow" | number, is_enabled: bool, otp_code: string }`

- `public_storage` — Public JSON profile storage attached to the token public_key (max 64KB)
- `ip_whitelist` — IP whitelist for this token. Accepts an array of IPv4 addresses/CIDR ranges, a comma-separated string, or "*" wildcard. Defaults to "*" (allow all) if not provided. At most 1000 entries, and at most 65536 characters as a string; larger values are refused with IP_WHITELIST_TOO_LARGE.
- `realm_ids` — List of realm IDs this token is restricted to (at most 500)
- `otp_code` — TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.

**Returns:** `Promise<ApiAuthTokensUpdateResponse>`  |  **HTTP:** `PUT /api/v1/auth/tokens/{id}`
**CLI:** `hoody auth tokens update`

---

#### `updatePublicProfile` — Update current auth token public profile

```typescript
client.api.auth.tokens.updatePublicProfile(data: ApiAuthTokensUpdatePublicProfileRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthTokensUpdatePublicProfileRequest` | body | Yes |  |

**Body:** `{ public_key: string|null, public_storage: object|null } (at least one of: public_key | public_storage required)`

- `public_storage` — Public JSON profile storage attached to the token public_key (max 64KB)

**Returns:** `Promise<ApiAuthTokensUpdatePublicProfileResponse>`  |  **HTTP:** `PUT /api/v1/auth/tokens/me/public-profile`
**CLI:** `hoody auth tokens profiles update`

---

### `client.api.auth.twoFactor` (8) — Two-Factor Authentication

#### `confirmSetup` — Complete 2FA Setup

```typescript
client.api.auth.twoFactor.confirmSetup(data: ApiAuthTwoFactorConfirmSetupRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthTwoFactorConfirmSetupRequest` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `Promise<ApiAuthTwoFactorConfirmSetupResponse>`  |  **HTTP:** `POST /api/v1/users/auth/2fa/verify-setup`
**CLI:** `hoody auth 2fa setup confirm`

---

#### `disable` — Disable 2FA

```typescript
client.api.auth.twoFactor.disable(data: ApiAuthTwoFactorDisableRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthTwoFactorDisableRequest` | body | Yes |  |

**Body:** `{ password*: string, code*: string }`

**Returns:** `Promise<ApiAuthTwoFactorDisableResponse>`  |  **HTTP:** `DELETE /api/v1/users/auth/2fa`
**CLI:** `hoody auth 2fa disable`

---

#### `disableTokenGate` — Set 2FA token gate preference

```typescript
client.api.auth.twoFactor.disableTokenGate(data?: Omit<SetTokenGatePatchRequest, "enabled">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `Omit<SetTokenGatePatchRequest, "enabled">` | body | No |  |

**Body:** `{ password: string, otp_code: string }`

- `password` — Required when setting enabled=false (security downgrade requires primary-factor reauth)
- `otp_code` — TOTP code or backup code. Required when setting enabled=false.

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**Returns:** `Promise<SetTokenGatePatchResponse>`  |  **HTTP:** `PUT /api/v1/users/auth/2fa/token-gate`
**CLI:** `hoody auth 2fa gate disable`

---

#### `enableTokenGate` — Set 2FA token gate preference

```typescript
client.api.auth.twoFactor.enableTokenGate(data?: Omit<SetTokenGatePatchRequest, "enabled">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `Omit<SetTokenGatePatchRequest, "enabled">` | body | No |  |

**Body:** `{ password: string, otp_code: string }`

- `password` — Required when setting enabled=false (security downgrade requires primary-factor reauth)
- `otp_code` — TOTP code or backup code. Required when setting enabled=false.

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**Returns:** `Promise<SetTokenGatePatchResponse>`  |  **HTTP:** `PUT /api/v1/users/auth/2fa/token-gate`
**CLI:** `hoody auth 2fa gate enable`

---

#### `getStatus` — Get 2FA Status

```typescript
client.api.auth.twoFactor.getStatus()
```

**Returns:** `Promise<ApiAuthTwoFactorGetStatusResponse>`  |  **HTTP:** `GET /api/v1/users/auth/2fa/status`
**CLI:** `hoody auth 2fa status`

---

#### `rotateBackupCodes` — Regenerate Backup Codes

```typescript
client.api.auth.twoFactor.rotateBackupCodes(data: ApiAuthTwoFactorRotateBackupCodesRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthTwoFactorRotateBackupCodesRequest` | body | Yes |  |

**Body:** `{ password*: string, code*: string }`

**Returns:** `Promise<ApiAuthTwoFactorRotateBackupCodesResponse>`  |  **HTTP:** `POST /api/v1/users/auth/2fa/backup-codes/regenerate`
**CLI:** `hoody auth 2fa backup codes rotate`

---

#### `startSetup` — Initialize 2FA Setup

```typescript
client.api.auth.twoFactor.startSetup(data: ApiAuthTwoFactorStartSetupRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthTwoFactorStartSetupRequest` | body | Yes |  |

**Body:** `{ password*: string }`

**Returns:** `Promise<ApiAuthTwoFactorStartSetupResponse>`  |  **HTTP:** `POST /api/v1/users/auth/2fa/setup`
**CLI:** `hoody auth 2fa setup start`

---

#### `verify` — Verify 2FA Code During Login

```typescript
client.api.auth.twoFactor.verify(data: ApiAuthTwoFactorVerifyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiAuthTwoFactorVerifyRequest` | body | Yes |  |

**Body:** `{ temp_token: string, code*: string, response_mode: "intent" | "tokens", client: string }`

**Returns:** `Promise<ApiAuthTwoFactorVerifyResponse>`  |  **HTTP:** `POST /api/v1/users/auth/2fa/verify`
**CLI:** `hoody auth 2fa verify`

---

### `client.api.containers` (23) — Containers

#### `copy` — Copy a container

```typescript
client.api.containers.copy(id: string, data: ApiContainersCopyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the source container to copy |
| `data` | `ApiContainersCopyRequest` | body | Yes |  |

**Body:** `{ target_project_id*: string, target_server_id: string, name: string, ssh_public_key: string|null, source_snapshot: string, copy_firewall_rules: bool=false, copy_network_rules: bool=false, kvm: bool, dev_kvm: bool }`

- `ssh_public_key` — SSH public key for the copied container (must be unique, not inherited from source)
- `kvm` — Grant the COPY /dev/kvm passthrough (run full VMs). The copy NEVER inherits the source's KVM grant, so this decides KVM for the copy independently, on the TARGET server. Available on rented / dedicated (bare-metal) targets ONLY (never free tier); rejected (403) otherwise. Defaults to false.
- `dev_kvm` — Accepted alias of `kvm` on input (`kvm` wins if both are sent and they must agree).

**Returns:** `Promise<ApiContainersCopyResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/copy`
**CLI:** `hoody containers copy`

---

#### `create` — Create a new container

```typescript
client.api.containers.create(id: string, data: ApiContainersCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiContainersCreateRequest` | body | Yes |  |

**Body:** `{ server_id*: string, name: string, color: string, container_image: string|null, ai: bool=true, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, hoody_kit: bool=true, dev_kit: bool, kvm: bool, dev_kvm: bool, autostart: bool=true, ramdisk: bool=true, cache: bool=true, cache_image: bool=false, realm_ids: string[] }`

- `name` — Name for the container. Must be 3-100 characters, alphanumeric with hyphens and underscores. Omit or use "rand" to generate a random name.
- `environment_vars` — Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` and be at most 128 characters long.
- `ssh_public_key` — SSH public key for container access. SSH public keys must be unique per container (one container per key). If not provided, will inherit from project defaults.
- `comment` — Optional comment for the container (max 16000 characters)
- `dev_kit` — Enable dev_kit development tools in the container. Defaults to true when hoody_kit is true, false when hoody_kit is false (unless explicitly set). Cannot be updated after creation.
- `kvm` — Enable /dev/kvm passthrough (run full VMs inside the container) at creation. Available on rented / dedicated (bare-metal) servers ONLY — never free tier — and rejected (403) on a free server. Defaults to false. Can also be toggled later via PUT /api/v1/containers/{id}/kvm on a stopped container.
- `dev_kvm` — Accepted alias of `kvm` on input (`kvm` wins if both are sent and they must agree).
- `ramdisk` — Whether to mount a ramdisk at /ramdisk in the container (default: true). … Can store up to 50% of total host memory. …

**Returns:** `Promise<ApiContainersCreateResponse>`  |  **HTTP:** `POST /api/v1/projects/{id}/containers`
**CLI:** `hoody containers create`

---

#### `createClaim` — Authorize Container Access

```typescript
client.api.containers.createClaim(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID (24-char hex) |

**Returns:** `Promise<ApiContainersCreateClaimResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/authorize`
**CLI:** `hoody containers claims create`

---

#### `delete` — Delete a container

```typescript
client.api.containers.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to delete |

**Returns:** `Promise<ApiContainersDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}`
**CLI:** `hoody containers delete`

---

#### `disableKvm` — Enable or disable /dev/kvm (run VMs in the container)

```typescript
client.api.containers.disableKvm(id: string, data?: Omit<SetContainerKvmPatchRequest, "kvm" | "dev_kvm">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |
| `data` | `Omit<SetContainerKvmPatchRequest, "kvm" \| "dev_kvm">` | body | No |  |

**Fixed by the method:** the method sets `kvm: false`; do not pass `kvm`, `dev_kvm`.

**Returns:** `Promise<SetContainerKvmPatchResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/kvm`
**CLI:** `hoody containers kvm disable`

---

#### `enableKvm` — Enable or disable /dev/kvm (run VMs in the container)

```typescript
client.api.containers.enableKvm(id: string, data?: Omit<SetContainerKvmPatchRequest, "kvm" | "dev_kvm">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |
| `data` | `Omit<SetContainerKvmPatchRequest, "kvm" \| "dev_kvm">` | body | No |  |

**Fixed by the method:** the method sets `kvm: true`; do not pass `kvm`, `dev_kvm`.

**Returns:** `Promise<SetContainerKvmPatchResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/kvm`
**CLI:** `hoody containers kvm enable`

---

#### `get` — Get a container by ID

```typescript
client.api.containers.get(id: string, options?: { runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | query | No | Include proxy domains (aliases) for this container. When true, adds a proxy_domains array to the container object. |
| `include_proxy_permissions` | `boolean` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve |

**Returns:** `Promise<ApiContainersGetResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}`
**CLI:** `hoody containers get`

---

#### `getProxyUsage` — Get proxied-usage documents for a container

```typescript
client.api.containers.getProxyUsage(id: string, options: { from: string; to: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `from` | `string` | query | Yes | First month, inclusive (YYYY-MM) |
| `to` | `string` | query | Yes | Last month, inclusive (YYYY-MM). Max 12 months. |
| `id` | `string` | path | Yes | Container id |

**Returns:** `Promise<ApiContainersGetProxyUsageResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy-usage`
**CLI:** `hoody containers proxy usage`

---

#### `getStats` — Get container resource statistics

```typescript
client.api.containers.getStats(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |

**Returns:** `Promise<ApiContainersGetStatsResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/stats`
**CLI:** `hoody containers stats`

---

#### `list` — Get all containers

```typescript
client.api.containers.list(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | query | No | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `Promise<ApiContainersListResponse>`  |  **HTTP:** `GET /api/v1/containers/`
**CLI:** `hoody containers list`

---

#### `listAll` — Get all containers (collect all pages)

```typescript
client.api.containers.listAll(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | query | No | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `Promise<(NonNullable<ApiContainersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { containers?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.containers`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/containers/`
**CLI:** `hoody containers list`

---

#### `listByProject` — Get all containers for a project

```typescript
client.api.containers.listByProject(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiContainersListByProjectResponse>`  |  **HTTP:** `GET /api/v1/projects/{id}/containers`

---

#### `listByProjectAll` — Get all containers for a project (collect all pages)

```typescript
client.api.containers.listByProjectAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<(NonNullable<ApiContainersListByProjectResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { containers?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.containers`, all pages collected (`listByProject()` fetches one page). `listByProjectIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/projects/{id}/containers`

---

#### `listByProjectIterator` — Get all containers for a project (async iterator)

```typescript
client.api.containers.listByProjectIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |
| `id` | `string` | path | Yes |  |

**Returns:** `AsyncGenerator<(NonNullable<ApiContainersListByProjectResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { containers?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.containers` per step, next page fetched on demand (`listByProject()` fetches one page).  |  **HTTP:** `GET /api/v1/projects/{id}/containers`

---

#### `listIterator` — Get all containers (async iterator)

```typescript
client.api.containers.listIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "name" | "status" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string; runtime?: string; include_proxy_domains?: boolean; include_proxy_permissions?: boolean; include_expired?: boolean; include_deleting?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of containers to return per page - maximum 100 items |
| `sort_by` | `"id" \| "name" \| "status" \| "created_at" \| "updated_at"` | query | No | Field to sort containers by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL. |
| `runtime` | `string` | query | No | Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old. |
| `include_proxy_domains` | `boolean` | query | No | Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. |
| `include_proxy_permissions` | `boolean` | query | No | Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission. |
| `include_expired` | `boolean` | query | No | Include containers that have expired due to server termination. By default, expired containers are excluded from results. |
| `include_deleting` | `boolean` | query | No | Include containers currently being deleted. By default, deleting containers are excluded from results. |

**Returns:** `AsyncGenerator<(NonNullable<ApiContainersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { containers?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.containers` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/containers/`
**CLI:** `hoody containers list`

---

#### `listStatusHistory` — Get status logs for a container

```typescript
client.api.containers.listStatusHistory(id: string, options?: { page?: number; limit?: number; sort_by?: "transition_time" | "created_at" | "to_status" | "from_status"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"transition_time" \| "created_at" \| "to_status" \| "from_status"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiContainersListStatusHistoryResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/status-logs`
**CLI:** `hoody containers status history list`

---

#### `pause` — Manage container

```typescript
client.api.containers.pause(id: string, data?: NonNullable<ManageContainerRequest>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to manage |
| `data` | `NonNullable<ManageContainerRequest>` | body | No |  |

**Body:** `{ timeout: int }|null`

- `timeout` — Upper bound, in seconds, on how long the operation may run before it is cut off. For `stop` and `restart` it is also the time the container is given to shut down cleanly. At most 600. Omit it for the server default.

**Returns:** `Promise<ManageContainerResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/{operation}`
**CLI:** `hoody containers pause`

---

#### `restart` — Manage container

```typescript
client.api.containers.restart(id: string, data?: NonNullable<ManageContainerRequest>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to manage |
| `data` | `NonNullable<ManageContainerRequest>` | body | No |  |

**Body:** `{ timeout: int }|null`

- `timeout` — Upper bound, in seconds, on how long the operation may run before it is cut off. For `stop` and `restart` it is also the time the container is given to shut down cleanly. At most 600. Omit it for the server default.

**Returns:** `Promise<ManageContainerResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/{operation}`
**CLI:** `hoody containers restart`

---

#### `resume` — Manage container

```typescript
client.api.containers.resume(id: string, data?: NonNullable<ManageContainerRequest>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to manage |
| `data` | `NonNullable<ManageContainerRequest>` | body | No |  |

**Body:** `{ timeout: int }|null`

- `timeout` — Upper bound, in seconds, on how long the operation may run before it is cut off. For `stop` and `restart` it is also the time the container is given to shut down cleanly. At most 600. Omit it for the server default.

**Returns:** `Promise<ManageContainerResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/{operation}`
**CLI:** `hoody containers resume`

---

#### `start` — Manage container

```typescript
client.api.containers.start(id: string, data?: NonNullable<ManageContainerRequest>)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to manage |
| `data` | `NonNullable<ManageContainerRequest>` | body | No |  |

**Body:** `{ timeout: int }|null`

- `timeout` — Upper bound, in seconds, on how long the operation may run before it is cut off. For `stop` and `restart` it is also the time the container is given to shut down cleanly. At most 600. Omit it for the server default.

**Returns:** `Promise<ManageContainerResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/{operation}`
**CLI:** `hoody containers start`

---

#### `stop` — Manage container

```typescript
client.api.containers.stop(id: string, data: NonNullable<ManageContainerRequest> | undefined, options: { force: true })
client.api.containers.stop(id: string, data?: NonNullable<ManageContainerRequest>, options?: { force?: false })
client.api.containers.stop(id: string, data?: NonNullable<ManageContainerRequest>, options?: { force?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to manage |
| `data` | `NonNullable<ManageContainerRequest> \| undefined` | body | Yes |  |
| `force` | `boolean` | option | No | Kill the container without a graceful shutdown (the force-stop operation). |

**Body:** `{ timeout: int }|null`

- `timeout` — Upper bound, in seconds, on how long the operation may run before it is cut off. For `stop` and `restart` it is also the time the container is given to shut down cleanly. At most 600. Omit it for the server default.

**Returns:** `Promise<ManageContainerResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/{operation}`
**CLI:** `hoody containers stop`

---

#### `sync` — Sync a copied container with its source

```typescript
client.api.containers.sync(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to sync (must have been created via copy) |

**Returns:** `Promise<ApiContainersSyncResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/sync`
**CLI:** `hoody containers sync`

---

#### `update` — Update a container

```typescript
client.api.containers.update(id: string, data: ApiContainersUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to update |
| `data` | `ApiContainersUpdateRequest` | body | Yes |  |

**Body:** `{ name: string, color: string, ai: bool, autostart: bool, ramdisk_scope: "container" | "project", ramdisk: bool, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, realm_ids: string[] }`

- `name` — Human-readable name for the container - must be unique within the project
- `ramdisk_scope` — Sharing scope for /ramdisk. `container` (default) mounts only private storage. `project` additionally mounts /ramdisk/project, shared with your other containers in this project ON THE SAME SERVER (a RAM disk cannot span servers). Refused when the project has other members.
- `ramdisk` — … Backed by a shared per-server memory pool (512 MiB by default, never more than 50% of the server memory) shared with your other containers on that server. Data survives container restarts but is LOST on a host reboot — which is why it suits secrets and scratch data that must not persist to disk. …
- `environment_vars` — Environment variables to set in the container as key-value pairs. Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` and be at most 128 characters long.
- `ssh_public_key` — SSH public key for direct SSH access to this container. … An empty or whitespace-only string is rejected with 400 (send null to remove). Requires a token with the ssh-keys resource permission to set or replace; removal needs only container update permission.
- `comment` — Optional comment for the container (max 16000 characters). Set to null to clear existing comment.
- `realm_ids` — Update realm membership for this container. Containers can have different realm membership than their parent project. A signed-in session (JWT) or an auth token without realm restrictions can modify realm_ids; realm-restricted tokens cannot change realm membership.

**Returns:** `Promise<ApiContainersUpdateResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}`
**CLI:** `hoody containers update`

---

### `client.api.containers.env` (4) — Container Environment

#### `delete` — Delete a single environment variable

```typescript
client.api.containers.env.delete(id: string, key: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `key` | `string` | path | Yes | Environment variable key |

**Returns:** `Promise<ApiContainersEnvDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/env/{key}`
**CLI:** `hoody containers env delete`

---

#### `list` — List container environment variables

```typescript
client.api.containers.env.list(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiContainersEnvListResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/env`
**CLI:** `hoody containers env list`

---

#### `set` — Set a single environment variable

```typescript
client.api.containers.env.set(id: string, key: string, data: ApiContainersEnvSetRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `key` | `string` | path | Yes | Environment variable key |
| `data` | `ApiContainersEnvSetRequest` | body | Yes |  |

**Body:** `{ value*: string }`

**Returns:** `Promise<ApiContainersEnvSetResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/env/{key}`
**CLI:** `hoody containers env set`

---

#### `update` — Bulk set container environment variables

```typescript
client.api.containers.env.update(id: string, data: ApiContainersEnvUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `ApiContainersEnvUpdateRequest` | body | Yes |  |

**Body:** `{ [key: string]: string }`

- Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` and be at most 128 characters long.

**Returns:** `Promise<ApiContainersEnvUpdateResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/env`
**CLI:** `hoody containers env update`

---

### `client.api.events` (8) — Events

#### `clear` — Bulk delete events

```typescript
client.api.events.clear(data: ApiEventsClearRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiEventsClearRequest` | body | Yes |  |

**Body:** `{ event_type: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added", resource_type: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer", resource_id: string, before_date: string, realm_id: string }`

**Returns:** `Promise<ApiEventsClearResponse>`  |  **HTTP:** `DELETE /api/v1/events`
**CLI:** `hoody events clear`

---

#### `delete` — Delete a single event

```typescript
client.api.events.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Event ID to delete |

**Returns:** `Promise<ApiEventsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/events/{id}`
**CLI:** `hoody events delete`

---

#### `get` — Get event details by ID

```typescript
client.api.events.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Event ID |

**Returns:** `Promise<ApiEventsGetResponse>`  |  **HTTP:** `GET /api/v1/events/{id}`
**CLI:** `hoody events get`

---

#### `getStats` — Get event statistics

```typescript
client.api.events.getStats(options?: { start_date?: string; end_date?: string; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `start_date` | `string` | query | No | Start of time range |
| `end_date` | `string` | query | No | End of time range |
| `realm_id` | `string` | query | No | Filter by realm |

**Returns:** `Promise<ApiEventsGetStatsResponse>`  |  **HTTP:** `GET /api/v1/events/stats`
**CLI:** `hoody events stats`

---

#### `list` — List event history

```typescript
client.api.events.list(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Number of events to return (max 500) |
| `offset` | `number` | query | No | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | query | No | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "container.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "container.paused" \| "container.copying" \| "container.updated" \| "container.env.updated" \| "container.env.applied" \| "container.env.failed" \| "container.network.created" \| "container.network.updated" \| "container.network.running" \| "container.network.stopped" \| "container.network.failed" \| "container.network.deleted" \| "container.access_suspended" \| "container.access_restored" \| "container.operation.completed" \| "container.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | query | No | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "container_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | query | No | Filter by resource type |
| `resource_id` | `string` | query | No | Filter by specific resource ID |
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `start_date` | `string` | query | No | Filter events after this timestamp |
| `end_date` | `string` | query | No | Filter events before this timestamp |
| `realm_id` | `string` | query | No | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | query | No | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, container_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | query | No | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |

**Returns:** `Promise<ApiEventsListResponse>`  |  **HTTP:** `GET /api/v1/events`
**CLI:** `hoody events list`

---

#### `listAll` — List event history (collect all pages)

```typescript
client.api.events.listAll(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Number of events to return (max 500) |
| `offset` | `number` | query | No | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | query | No | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "container.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "container.paused" \| "container.copying" \| "container.updated" \| "container.env.updated" \| "container.env.applied" \| "container.env.failed" \| "container.network.created" \| "container.network.updated" \| "container.network.running" \| "container.network.stopped" \| "container.network.failed" \| "container.network.deleted" \| "container.access_suspended" \| "container.access_restored" \| "container.operation.completed" \| "container.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | query | No | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "container_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | query | No | Filter by resource type |
| `resource_id` | `string` | query | No | Filter by specific resource ID |
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `start_date` | `string` | query | No | Filter events after this timestamp |
| `end_date` | `string` | query | No | Filter events before this timestamp |
| `realm_id` | `string` | query | No | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | query | No | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, container_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | query | No | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |

**Returns:** `Promise<(NonNullable<ApiEventsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { events?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.events`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/events`
**CLI:** `hoody events list`

---

#### `listIterator` — List event history (async iterator)

```typescript
client.api.events.listIterator(options?: { limit?: number; offset?: number; sort_by?: "created_at" | "event_type"; sort_order?: "asc" | "desc"; event_type?: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added"; resource_type?: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer"; resource_id?: string; project_id?: string; container_id?: string; start_date?: string; end_date?: string; realm_id?: string; after?: string; bootstrap?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Number of events to return (max 500) |
| `offset` | `number` | query | No | Number of events to skip |
| `sort_by` | `"created_at" \| "event_type"` | query | No | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction |
| `event_type` | `"container.creating" \| "container.running" \| "container.stopped" \| "container.failed" \| "container.deleting" \| "container.deleted" \| "container.autostart_enabled" \| "container.autostart_disabled" \| "container.renamed" \| "container.resource_updated" \| "container.ssh_key.added" \| "container.ssh_key.removed" \| "container.snapshot.created" \| "container.snapshot.deleted" \| "container.snapshot.restored" \| "container.snapshot.renamed" \| "container.display.enabled" \| "container.paused" \| "container.copying" \| "container.updated" \| "container.env.updated" \| "container.env.applied" \| "container.env.failed" \| "container.network.created" \| "container.network.updated" \| "container.network.running" \| "container.network.stopped" \| "container.network.failed" \| "container.network.deleted" \| "container.access_suspended" \| "container.access_restored" \| "container.operation.completed" \| "container.operation.failed" \| "storage.share.created" \| "storage.share.updated" \| "storage.share.deleted" \| "storage.share.enabled" \| "storage.share.disabled" \| "storage.share.expiring_soon" \| "storage.share.expired" \| "storage.share.mount_changed" \| "notification.created" \| "notification.read" \| "notification.deleted" \| "notification.updated" \| "project.created" \| "project.updated" \| "project.deleted" \| "project.permission.granted" \| "project.permission.updated" \| "project.permission.revoked" \| "server.created" \| "server.updated" \| "server.enabled" \| "server.disabled" \| "server.health_changed" \| "server.rental_expiring" \| "server.deleted" \| "server.rental_started" \| "server.rental_extended" \| "server.rental_expired" \| "server.rental_terminated" \| "server.rental_hold_started" \| "server.rental_updated" \| "server.command.completed" \| "server.command.failed" \| "server.reservation.created" \| "server.reservation.fulfilled" \| "server.reservation.refunded" \| "server.offer.published" \| "server.offer.updated" \| "server.offer.withdrawn" \| "firewall.rule.added" \| "firewall.rule.removed" \| "firewall.rule.updated" \| "firewall.rule.enabled" \| "firewall.rule.disabled" \| "proxy.alias.created" \| "proxy.alias.updated" \| "proxy.alias.deleted" \| "proxy.alias.enabled" \| "proxy.alias.disabled" \| "proxy.alias.expiring_soon" \| "proxy.alias.expired" \| "proxy.permissions.updated" \| "proxy.permissions.default_changed" \| "proxy.permissions.group_added" \| "proxy.permissions.group_updated" \| "proxy.permissions.group_removed" \| "auth.token.created" \| "auth.token.updated" \| "auth.token.deleted" \| "auth.token.enabled" \| "auth.token.disabled" \| "pool.member.joined" \| "pool.member.left" \| "pool.member.role_changed" \| "pool.invited" \| "pool.invitation_revoked" \| "pool.created" \| "pool.updated" \| "pool.deleted" \| "activity.logged" \| "vault.key.set" \| "vault.key.deleted" \| "vault.cleared" \| "account.updated" \| "billing.balance_changed" \| "billing.payment.succeeded" \| "billing.payment.failed" \| "billing.payment.updated" \| "billing.invoice.created" \| "billing.payment_method.added" \| "billing.payment_method.removed" \| "billing.payment_method.default_changed" \| "billing.payment_method.updated" \| "image.library.added"` | query | No | Filter by specific event type |
| `resource_type` | `"container" \| "storage_share" \| "notification" \| "project" \| "server" \| "firewall" \| "proxy_alias" \| "proxy_permissions" \| "auth_token" \| "pool" \| "activity_log" \| "container_network" \| "project_permission" \| "vault" \| "account" \| "wallet" \| "payment" \| "invoice" \| "payment_method" \| "user_image" \| "reservation" \| "server_offer"` | query | No | Filter by resource type |
| `resource_id` | `string` | query | No | Filter by specific resource ID |
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `start_date` | `string` | query | No | Filter events after this timestamp |
| `end_date` | `string` | query | No | Filter events before this timestamp |
| `realm_id` | `string` | query | No | Selects the realm scope in all modes; 403 on a realm-host or token conflict |
| `after` | `string` | query | No | Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, container_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403. |
| `bootstrap` | `boolean` | query | No | Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope. |

**Returns:** `AsyncGenerator<(NonNullable<ApiEventsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { events?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.events` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/events`
**CLI:** `hoody events list`

---

#### `purge` — Cleanup old events

```typescript
client.api.events.purge(data: ApiEventsPurgeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiEventsPurgeRequest` | body | Yes |  |

**Body:** `{ retention_days*: int }`

**Returns:** `Promise<ApiEventsPurgeResponse>`  |  **HTTP:** `POST /api/v1/events/cleanup`
**CLI:** `hoody events purge`

---

### `client.api.firewall` (10) — Container Firewall

#### `createEgressRule` — Add Egress Rule

```typescript
client.api.firewall.createEgressRule(id: string, data: ApiFirewallCreateEgressRuleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `ApiFirewallCreateEgressRuleRequest` | body | Yes |  |

**Body:** `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, destination: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`

- `destination_port` — Port number (1-65535), range with the lower port first (80-90), or comma-separated list (80,443). Required for TCP/UDP; not allowed with icmp4.

**Returns:** `Promise<ApiFirewallCreateEgressRuleResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/firewall/egress`
**CLI:** `hoody firewall egress create`

---

#### `createIngressRule` — Add Ingress Rule

```typescript
client.api.firewall.createIngressRule(id: string, data: ApiFirewallCreateIngressRuleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `ApiFirewallCreateIngressRuleRequest` | body | Yes |  |

**Body:** `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, source: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`

- `destination_port` — Port number (1-65535), range with the lower port first (80-90), or comma-separated list (80,443). Required for TCP/UDP; not allowed with icmp4.

**Returns:** `Promise<ApiFirewallCreateIngressRuleResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/firewall/ingress`
**CLI:** `hoody firewall ingress create`

---

#### `deleteEgressRule` — Remove Egress Rule(s)

```typescript
client.api.firewall.deleteEgressRule(id: string, data: ApiFirewallDeleteEgressRuleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `ApiFirewallDeleteEgressRuleRequest` | body | Yes |  |

**Body:** `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, destination: string, source_port: string, description: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`

**Returns:** `Promise<ApiFirewallDeleteEgressRuleResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/firewall/egress`
**CLI:** `hoody firewall egress delete`

---

#### `deleteIngressRule` — Remove Ingress Rule(s)

```typescript
client.api.firewall.deleteIngressRule(id: string, data: ApiFirewallDeleteIngressRuleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `ApiFirewallDeleteIngressRuleRequest` | body | Yes |  |

**Body:** `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source: string, source_port: string, description: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`

**Returns:** `Promise<ApiFirewallDeleteIngressRuleResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/firewall/ingress`
**CLI:** `hoody firewall ingress delete`

---

#### `disableEgressRule` — Toggle Egress Rule State

```typescript
client.api.firewall.disableEgressRule(id: string, data?: Omit<ToggleEgressRuleRequest, "state">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `Omit<ToggleEgressRuleRequest, "state">` | body | No |  |

**Body:** `{ action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, destination: string, description: string, icmp_type: string, icmp_code: string }`

**Fixed by the method:** the method sets `state: "disabled"`; do not pass `state`.

**Returns:** `Promise<ToggleEgressRuleResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/firewall/egress`
**CLI:** `hoody firewall egress disable`

---

#### `disableIngressRule` — Toggle Ingress Rule State

```typescript
client.api.firewall.disableIngressRule(id: string, data?: Omit<ToggleIngressRuleRequest, "state">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `Omit<ToggleIngressRuleRequest, "state">` | body | No |  |

**Body:** `{ action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, source: string, description: string, icmp_type: string, icmp_code: string }`

**Fixed by the method:** the method sets `state: "disabled"`; do not pass `state`.

**Returns:** `Promise<ToggleIngressRuleResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/firewall/ingress`
**CLI:** `hoody firewall ingress disable`

---

#### `enableEgressRule` — Toggle Egress Rule State

```typescript
client.api.firewall.enableEgressRule(id: string, data?: Omit<ToggleEgressRuleRequest, "state">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `Omit<ToggleEgressRuleRequest, "state">` | body | No |  |

**Body:** `{ action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, destination: string, description: string, icmp_type: string, icmp_code: string }`

**Fixed by the method:** the method sets `state: "enabled"`; do not pass `state`.

**Returns:** `Promise<ToggleEgressRuleResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/firewall/egress`
**CLI:** `hoody firewall egress enable`

---

#### `enableIngressRule` — Toggle Ingress Rule State

```typescript
client.api.firewall.enableIngressRule(id: string, data?: Omit<ToggleIngressRuleRequest, "state">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `data` | `Omit<ToggleIngressRuleRequest, "state">` | body | No |  |

**Body:** `{ action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, source: string, description: string, icmp_type: string, icmp_code: string }`

**Fixed by the method:** the method sets `state: "enabled"`; do not pass `state`.

**Returns:** `Promise<ToggleIngressRuleResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/firewall/ingress`
**CLI:** `hoody firewall ingress enable`

---

#### `listRules` — List container firewall rules

```typescript
client.api.firewall.listRules(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiFirewallListRulesResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/firewall/rules`
**CLI:** `hoody firewall rules list`

---

#### `reset` — Reset container firewall

```typescript
client.api.firewall.reset(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiFirewallResetResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/firewall/reset`
**CLI:** `hoody firewall reset`

---

### `client.api.images` (11) — Container Images

#### `buy` — Purchase image

```typescript
client.api.images.buy(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the paid container image to purchase |

**Returns:** `Promise<ApiImagesBuyResponse>`  |  **HTTP:** `POST /api/v1/images/purchase/{id}`
**CLI:** `hoody images buy`

---

#### `getIcon` — Get image icon

```typescript
client.api.images.getIcon(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container image to retrieve icon for |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | ApiImagesGetIconResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/images/{id}/icon`
**CLI:** `hoody images icon get`

---

#### `getPublic` — Get public image details

```typescript
client.api.images.getPublic(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the public container image to retrieve details for |

**Returns:** `Promise<ApiImagesGetPublicResponse>`  |  **HTTP:** `GET /api/v1/images/public/{id}`
**CLI:** `hoody images get`

---

#### `import` — Import free image

```typescript
client.api.images.import(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the public container image to import |

**Returns:** `Promise<ApiImagesImportResponse>`  |  **HTTP:** `POST /api/v1/images/import/{id}`
**CLI:** `hoody images import`

---

#### `list` — List user images

```typescript
client.api.images.list(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | query | No | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |

**Returns:** `Promise<ApiImagesListResponse>`  |  **HTTP:** `GET /api/v1/images/user`
**CLI:** `hoody images list`

---

#### `listAll` — List user images (collect all pages)

```typescript
client.api.images.listAll(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | query | No | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |

**Returns:** `Promise<(NonNullable<ApiImagesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { images?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.images`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/images/user`
**CLI:** `hoody images list`

---

#### `listIterator` — List user images (async iterator)

```typescript
client.api.images.listIterator(options?: { page?: number; limit?: number; sort_by?: "created_at"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `"created_at"` | query | No | Field to sort user images by - currently only supports creation date |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |

**Returns:** `AsyncGenerator<(NonNullable<ApiImagesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { images?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.images` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/images/user`
**CLI:** `hoody images list`

---

#### `listPublic` — List public images

```typescript
client.api.images.listPublic(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `os` | `string` | query | No | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | query | No | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | query | No | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | query | No | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | query | No | Minimum average rating filter - filters images with rating >= this value (0-5 stars) |
| `max_rating` | `number` | query | No | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | query | No | Search term to filter images by name, description, or tags |
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | query | No | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |

**Returns:** `Promise<ApiImagesListPublicResponse>`  |  **HTTP:** `GET /api/v1/images/public`
**CLI:** `hoody images list`

---

#### `listPublicAll` — List public images (collect all pages)

```typescript
client.api.images.listPublicAll(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `os` | `string` | query | No | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | query | No | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | query | No | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | query | No | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | query | No | Minimum average rating filter - filters images with rating >= this value (0-5 stars) |
| `max_rating` | `number` | query | No | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | query | No | Search term to filter images by name, description, or tags |
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | query | No | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |

**Returns:** `Promise<(NonNullable<ApiImagesListPublicResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { images?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.images`, all pages collected (`listPublic()` fetches one page). `listPublicIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/images/public`
**CLI:** `hoody images list`

---

#### `listPublicIterator` — List public images (async iterator)

```typescript
client.api.images.listPublicIterator(options?: { os?: string; architecture?: string; min_price?: number; max_price?: number; min_rating?: number; max_rating?: number; search?: string; page?: number; limit?: number; sort_by?: "alias" | "added_date" | "price" | "rating"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `os` | `string` | query | No | Filter images by operating system - e.g., debian (the platform currently carries debian/13 only) |
| `architecture` | `string` | query | No | Filter images by CPU architecture - e.g., amd64, arm64, armhf |
| `min_price` | `number` | query | No | Minimum price filter for paid images - 0 includes free images |
| `max_price` | `number` | query | No | Maximum price filter for paid images - useful for budget constraints |
| `min_rating` | `number` | query | No | Minimum average rating filter - filters images with rating >= this value (0-5 stars) |
| `max_rating` | `number` | query | No | Maximum average rating filter - filters images with rating at most this value (0-5 stars) |
| `search` | `string` | query | No | Search term to filter images by name, description, or tags |
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of images to return per page - maximum 100 items |
| `sort_by` | `"alias" \| "added_date" \| "price" \| "rating"` | query | No | Field to sort images by - name, date added, price, or average rating |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction - ascending or descending |

**Returns:** `AsyncGenerator<(NonNullable<ApiImagesListPublicResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { images?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.images` per step, next page fetched on demand (`listPublic()` fetches one page).  |  **HTTP:** `GET /api/v1/images/public`
**CLI:** `hoody images list`

---

#### `rate` — Rate image

```typescript
client.api.images.rate(id: string, data: ApiImagesRateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container image to rate |
| `data` | `ApiImagesRateRequest` | body | Yes |  |

**Body:** `{ rating*: number }`

**Returns:** `Promise<ApiImagesRateResponse>`  |  **HTTP:** `POST /api/v1/images/rate/{id}`
**CLI:** `hoody images rate`

---

### `client.api.inbox` (9) — Notifications

#### `getSummary` — Unread notification count and newest position

```typescript
client.api.inbox.getSummary()
```

**Returns:** `Promise<ApiInboxGetSummaryResponse>`  |  **HTTP:** `GET /api/v1/notifications/summary`
**CLI:** `hoody inbox summary`

---

#### `list` — List notifications for the authenticated user

```typescript
client.api.inbox.list(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | query | No | Rows per page (max 100). |
| `unread_only` | `boolean` | query | No | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | query | No | Return only notifications the user HAS read — the archive half of the inbox. `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | query | No | Keyset cursor from a previous response's pagination.next_cursor ("<created_at>,<id>"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |

**Returns:** `Promise<ApiInboxListResponse>`  |  **HTTP:** `GET /api/v1/notifications/`
**CLI:** `hoody inbox list`

---

#### `listAll` — List notifications for the authenticated user (collect all pages)

```typescript
client.api.inbox.listAll(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | query | No | Rows per page (max 100). |
| `unread_only` | `boolean` | query | No | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | query | No | Return only notifications the user HAS read — the archive half of the inbox. `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | query | No | Keyset cursor from a previous response's pagination.next_cursor ("<created_at>,<id>"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |

**Returns:** `Promise<(NonNullable<ApiInboxListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notifications/`
**CLI:** `hoody inbox list`

---

#### `listAnnouncements` — Get all public notifications

```typescript
client.api.inbox.listAnnouncements()
```

**Returns:** `Promise<ApiInboxListAnnouncementsResponse>`  |  **HTTP:** `GET /api/v1/notifications/public`
**CLI:** `hoody inbox announcements list`

---

#### `listAnnouncementsAll` — Get all public notifications (collect all pages)

```typescript
client.api.inbox.listAnnouncementsAll()
```

**Returns:** `Promise<(NonNullable<ApiInboxListAnnouncementsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`listAnnouncements()` fetches one page). `listAnnouncementsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/notifications/public`
**CLI:** `hoody inbox announcements list`

---

#### `listAnnouncementsIterator` — Get all public notifications (async iterator)

```typescript
client.api.inbox.listAnnouncementsIterator()
```

**Returns:** `AsyncGenerator<(NonNullable<ApiInboxListAnnouncementsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`listAnnouncements()` fetches one page).  |  **HTTP:** `GET /api/v1/notifications/public`
**CLI:** `hoody inbox announcements list`

---

#### `listIterator` — List notifications for the authenticated user (async iterator)

```typescript
client.api.inbox.listIterator(options?: { page?: number; limit?: number; unread_only?: boolean; read_only?: boolean; before?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (offset paging). Ignored when `before` is supplied. |
| `limit` | `number` | query | No | Rows per page (max 100). |
| `unread_only` | `boolean` | query | No | Return only notifications the user has not read. Mutually exclusive with read_only. |
| `read_only` | `boolean` | query | No | Return only notifications the user HAS read — the archive half of the inbox. `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page). |
| `before` | `string` | query | No | Keyset cursor from a previous response's pagination.next_cursor ("<created_at>,<id>"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read. |

**Returns:** `AsyncGenerator<(NonNullable<ApiInboxListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/notifications/`
**CLI:** `hoody inbox list`

---

#### `markAllRead` — Mark all notifications as read

```typescript
client.api.inbox.markAllRead()
```

**Returns:** `Promise<ApiInboxMarkAllReadResponse>`  |  **HTTP:** `PUT /api/v1/notifications/read-all`
**CLI:** `hoody inbox mark read`

---

#### `markRead` — Mark a notification as read

```typescript
client.api.inbox.markRead(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the notification to mark as read |

**Returns:** `Promise<ApiInboxMarkReadResponse>`  |  **HTTP:** `PUT /api/v1/notifications/{id}/read`
**CLI:** `hoody inbox mark read`

---

### `client.api.ip` (1) — Utilities

#### `get` — Get IP Information

```typescript
client.api.ip.get()
```

**Returns:** `Promise<ApiIpGetResponse>`  |  **HTTP:** `GET /api/v1/ip`
**CLI:** `hoody ip get`

---

### `client.api.meta` (1) — Meta

#### `getPublicKey` — Get Hoody API Signing Public Key

```typescript
client.api.meta.getPublicKey()
```

**Returns:** `Promise<ApiMetaGetPublicKeyResponse>`  |  **HTTP:** `GET /api/v1/meta/public-key`
**CLI:** `hoody meta key get`

---

### `client.api.network` (5) — Containers

#### `delete` — Remove container network configuration

```typescript
client.api.network.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to remove network configuration from |

**Returns:** `Promise<ApiNetworkDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/network`
**CLI:** `hoody network delete`

---

#### `get` — Get container network configuration

```typescript
client.api.network.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve network configuration for |

**Returns:** `Promise<ApiNetworkGetResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/network`
**CLI:** `hoody network get`

---

#### `start` — Start container network proxy/blocking

```typescript
client.api.network.start(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to start network for |

**Returns:** `Promise<ApiNetworkStartResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/network/start`
**CLI:** `hoody network start`

---

#### `stop` — Stop container network proxy/blocking

```typescript
client.api.network.stop(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to stop network for |

**Returns:** `Promise<ApiNetworkStopResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/network/stop`
**CLI:** `hoody network stop`

---

#### `update` — Update container network configuration

```typescript
client.api.network.update(id: string, data: ApiNetworkUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to configure network for |
| `data` | `ApiNetworkUpdateRequest` | body | Yes |  |

**Body:** `{ type*: "socks5" | "http" | "https" | "block", proxy: string, country: string, city: string, region: string, comment: string, dns_servers: string[] }`

- `proxy` — Proxy server URL (required for non-block types), e.g. "socks5://proxy.example.com:1080". …
- `comment` — Optional comment describing the network configuration (max 1000 characters)
- `dns_servers` — Custom DNS servers (max 4, defaults to ["1.1.1.1", "8.8.8.8"])

**Returns:** `Promise<ApiNetworkUpdateResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/network`
**CLI:** `hoody network update`

---

### `client.api.pools` (7) — Pools

#### `create` — Create pool

```typescript
client.api.pools.create(data: ApiPoolsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiPoolsCreateRequest` | body | Yes |  |

**Body:** `{ name*: string, description: string, settings: object }`

**Returns:** `Promise<ApiPoolsCreateResponse>`  |  **HTTP:** `POST /api/v1/pools`
**CLI:** `hoody pools create`

---

#### `delete` — Delete pool

```typescript
client.api.pools.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiPoolsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/pools/{id}`
**CLI:** `hoody pools delete`

---

#### `get` — Get pool details

```typescript
client.api.pools.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiPoolsGetResponse>`  |  **HTTP:** `GET /api/v1/pools/{id}`
**CLI:** `hoody pools get`

---

#### `list` — List user pools

```typescript
client.api.pools.list()
```

**Returns:** `Promise<ApiPoolsListResponse>`  |  **HTTP:** `GET /api/v1/pools`
**CLI:** `hoody pools list`

---

#### `listAll` — List user pools (collect all pages)

```typescript
client.api.pools.listAll()
```

**Returns:** `Promise<(NonNullable<ApiPoolsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/pools`
**CLI:** `hoody pools list`

---

#### `listIterator` — List user pools (async iterator)

```typescript
client.api.pools.listIterator()
```

**Returns:** `AsyncGenerator<(NonNullable<ApiPoolsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/pools`
**CLI:** `hoody pools list`

---

#### `update` — Update pool

```typescript
client.api.pools.update(id: string, data: ApiPoolsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiPoolsUpdateRequest` | body | Yes |  |

**Body:** `{ description: string, settings: object }`

**Returns:** `Promise<ApiPoolsUpdateResponse>`  |  **HTTP:** `PUT /api/v1/pools/{id}`
**CLI:** `hoody pools update`

---

### `client.api.pools.invitations` (3) — Pool Invitations

#### `accept` — Accept invitation

```typescript
client.api.pools.invitations.accept(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiPoolsInvitationsAcceptResponse>`  |  **HTTP:** `POST /api/v1/pools/{id}/accept`
**CLI:** `hoody pools invitations accept`

---

#### `list` — List pending invitations

```typescript
client.api.pools.invitations.list()
```

**Returns:** `Promise<ApiPoolsInvitationsListResponse>`  |  **HTTP:** `GET /api/v1/pools/invitations/pending`
**CLI:** `hoody pools invitations list`

---

#### `reject` — Reject invitation

```typescript
client.api.pools.invitations.reject(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiPoolsInvitationsRejectResponse>`  |  **HTTP:** `POST /api/v1/pools/{id}/reject`
**CLI:** `hoody pools invitations reject`

---

### `client.api.pools.members` (3) — Pool Members

#### `invite` — Invite member

```typescript
client.api.pools.members.invite(id: string, data: ApiPoolsMembersInviteRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiPoolsMembersInviteRequest` | body | Yes |  |

**Body:** `{ username*: string, role*: "admin" | "user" }`

**Returns:** `Promise<ApiPoolsMembersInviteResponse>`  |  **HTTP:** `POST /api/v1/pools/{id}/members`
**CLI:** `hoody pools members invite`

---

#### `remove` — Remove member

```typescript
client.api.pools.members.remove(id: string, userId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `userId` | `string` | path | Yes |  |

**Returns:** `Promise<ApiPoolsMembersRemoveResponse>`  |  **HTTP:** `DELETE /api/v1/pools/{id}/members/{userId}`
**CLI:** `hoody pools members remove`

---

#### `setRole` — Update member role

```typescript
client.api.pools.members.setRole(id: string, userId: string, data: ApiPoolsMembersSetRoleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `userId` | `string` | path | Yes |  |
| `data` | `ApiPoolsMembersSetRoleRequest` | body | Yes |  |

**Body:** `{ role*: "admin" | "user" }`

**Returns:** `Promise<ApiPoolsMembersSetRoleResponse>`  |  **HTTP:** `PUT /api/v1/pools/{id}/members/{userId}`
**CLI:** `hoody pools members role set`

---

### `client.api.projects` (15) — Projects

#### `create` — Create a new project

```typescript
client.api.projects.create(data: ApiProjectsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiProjectsCreateRequest` | body | Yes |  |

**Body:** `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`

- `alias` — Human-readable project name. Must be unique across your projects (e.g., "Production", "Development", "Client-ABC").

**Returns:** `Promise<ApiProjectsCreateResponse>`  |  **HTTP:** `POST /api/v1/projects/`
**CLI:** `hoody projects create`

---

#### `createPermission` — Grant project access

```typescript
client.api.projects.createPermission(id: string, data: ApiProjectsCreatePermissionRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `data` | `ApiProjectsCreatePermissionRequest` | body | Yes |  |

**Body:** `{ user_id*: string, permission_level*: "read" | "edit" | "delete" }`

**Returns:** `Promise<ApiProjectsCreatePermissionResponse>`  |  **HTTP:** `POST /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions create`

---

#### `delete` — Delete project

```typescript
client.api.projects.delete(id: string, options?: { include_deleted_items?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_deleted_items` | `boolean` | query | No | Include a short list of the deleted container IDs and names in the response. |
| `id` | `string` | path | Yes | Project ID to delete |

**Returns:** `Promise<ApiProjectsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/projects/{id}`
**CLI:** `hoody projects delete`

---

#### `deletePermission` — Revoke project access

```typescript
client.api.projects.deletePermission(id: string, permissionId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `permissionId` | `string` | path | Yes | Permission ID to remove |

**Returns:** `Promise<ApiProjectsDeletePermissionResponse>`  |  **HTTP:** `DELETE /api/v1/projects/{id}/permissions/{permissionId}`
**CLI:** `hoody projects permissions delete`

---

#### `get` — Get project by ID

```typescript
client.api.projects.get(id: string, options?: { include_permissions?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_permissions` | `boolean` | query | No | Include project permissions with user details in response |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `Promise<ApiProjectsGetResponse>`  |  **HTTP:** `GET /api/v1/projects/{id}`
**CLI:** `hoody projects get`

---

#### `getProxyUsage` — Get proxied-usage documents for every container in a project

```typescript
client.api.projects.getProxyUsage(id: string, options: { from: string; to: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `from` | `string` | query | Yes | First month, inclusive (YYYY-MM) |
| `to` | `string` | query | Yes | Last month, inclusive (YYYY-MM). Max 12 months. |
| `id` | `string` | path | Yes | Project id |

**Returns:** `Promise<ApiProjectsGetProxyUsageResponse>`  |  **HTTP:** `GET /api/v1/projects/{id}/proxy-usage`
**CLI:** `hoody projects proxy usage`

---

#### `getStats` — Get statistics for all containers in a project

```typescript
client.api.projects.getStats(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the project |

**Returns:** `Promise<ApiProjectsGetStatsResponse>`  |  **HTTP:** `GET /api/v1/projects/{id}/stats`
**CLI:** `hoody projects stats`

---

#### `list` — List all projects

```typescript
client.api.projects.list(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | query | No | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `Promise<ApiProjectsListResponse>`  |  **HTTP:** `GET /api/v1/projects/`
**CLI:** `hoody projects list`

---

#### `listAll` — List all projects (collect all pages)

```typescript
client.api.projects.listAll(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | query | No | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `Promise<(NonNullable<ApiProjectsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { projects?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.projects`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/projects/`
**CLI:** `hoody projects list`

---

#### `listIterator` — List all projects (async iterator)

```typescript
client.api.projects.listIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "alias" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number (1-based) |
| `limit` | `number` | query | No | Items per page (max 100) |
| `sort_by` | `"id" \| "alias" \| "created_at" \| "updated_at"` | query | No | Field to sort by |
| `sort_order` | `"asc" \| "desc"` | query | No | Sort direction |
| `realm_id` | `string` | query | No | Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncGenerator<(NonNullable<ApiProjectsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { projects?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.projects` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/projects/`
**CLI:** `hoody projects list`

---

#### `listPermissions` — List project permissions

```typescript
client.api.projects.listPermissions(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `Promise<ApiProjectsListPermissionsResponse>`  |  **HTTP:** `GET /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions list`

---

#### `listPermissionsAll` — List project permissions (collect all pages)

```typescript
client.api.projects.listPermissionsAll(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `Promise<(NonNullable<ApiProjectsListPermissionsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { permissions?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.permissions`, all pages collected (`listPermissions()` fetches one page). `listPermissionsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions list`

---

#### `listPermissionsIterator` — List project permissions (async iterator)

```typescript
client.api.projects.listPermissionsIterator(id: string, options?: { page?: number; limit?: number; sort_by?: "id" | "user_id" | "permission_level" | "created_at" | "updated_at"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "user_id" \| "permission_level" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `id` | `string` | path | Yes | Project ID |

**Returns:** `AsyncGenerator<(NonNullable<ApiProjectsListPermissionsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { permissions?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.permissions` per step, next page fetched on demand (`listPermissions()` fetches one page).  |  **HTTP:** `GET /api/v1/projects/{id}/permissions`
**CLI:** `hoody projects permissions list`

---

#### `update` — Update project

```typescript
client.api.projects.update(id: string, data: ApiProjectsUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID to update |
| `data` | `ApiProjectsUpdateRequest` | body | Yes |  |

**Body:** `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`

- `alias` — New project name. Must be unique across your projects.
- `max_containers` — Maximum number of containers allowed in this project. Set to null for unlimited. This quota is enforced during container creation. Only the project owner can change it, and a realm-restricted token cannot (the limit applies to every realm of the project); sending the current value back is accepted.
- `realm_ids` — Update realm membership for this project. If updating from a realm subdomain, the subdomain realm is automatically preserved and merged. A signed-in session (JWT) or an auth token without realm restrictions can modify realm_ids; realm-restricted tokens cannot change realm membership.

**Returns:** `Promise<ApiProjectsUpdateResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}`
**CLI:** `hoody projects update`

---

#### `updatePermission` — Update project permission

```typescript
client.api.projects.updatePermission(id: string, permissionId: string, data: ApiProjectsUpdatePermissionRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `permissionId` | `string` | path | Yes | Permission ID to update |
| `data` | `ApiProjectsUpdatePermissionRequest` | body | Yes |  |

**Body:** `{ permission_level*: "read" | "edit" | "delete" }`

**Returns:** `Promise<ApiProjectsUpdatePermissionResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}/permissions/{permissionId}`
**CLI:** `hoody projects permissions update`

---

### `client.api.proxy.aliases` (9) — Proxy Aliases

#### `create` — Create a new proxy alias

```typescript
client.api.proxy.aliases.create(data: ApiProxyAliasesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiProxyAliasesCreateRequest` | body | Yes |  |

**Body:** `{ container_id*: string, alias: string|null | false, program*: string, port: int, index: int, target_path: string|null, allow_path_override: bool=true, expires_at: string|null, enabled: bool=true }`

- `container_id` — Container ID that this alias points to. You must own this container.
- `alias` — … Two independent uniqueness rules apply, either of which answers 409 ALIAS_IN_USE: the name must be free on the container's physical server (across every tenant hosted there), AND your own account may hold a given name only once across all servers. … Reserved and rejected: the exact label "containers" (an infrastructure label of the container proxy domain), and anything equal to a reserved service name (such as "egress") or starting with that name followed by "-" (such as "egress-"). …
- `program` — Which container service the alias targets — a built-in Hoody program ("terminal", "files", "code", "browser", "agent", "display", …) or a transport protocol ("http", "https", "ssh"). … Must be a known Hoody program name (or one of its aliases) or protocol.
- `allow_path_override` — When false, the alias serves only the root, or target_path itself: once the proxy permissions allow the request, a request to either lands on target_path and any other path is refused (404). …

**Returns:** `Promise<ApiProxyAliasesCreateResponse>`  |  **HTTP:** `POST /api/v1/proxy/aliases`
**CLI:** `hoody proxy aliases create`

---

#### `delete` — Delete proxy alias

```typescript
client.api.proxy.aliases.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID to delete |

**Returns:** `Promise<ApiProxyAliasesDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/proxy/aliases/{id}`
**CLI:** `hoody proxy aliases delete`

---

#### `disable` — Enable or disable proxy alias

```typescript
client.api.proxy.aliases.disable(id: string, data?: Omit<SetProxyAliasStateRequest, "enabled">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID |
| `data` | `Omit<SetProxyAliasStateRequest, "enabled">` | body | No |  |

**Fixed by the method:** the method sets `enabled: false`; do not pass `enabled`.

**Returns:** `Promise<SetProxyAliasStateResponse>`  |  **HTTP:** `PATCH /api/v1/proxy/aliases/{id}/state`
**CLI:** `hoody proxy aliases disable`

---

#### `enable` — Enable or disable proxy alias

```typescript
client.api.proxy.aliases.enable(id: string, data?: Omit<SetProxyAliasStateRequest, "enabled">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID |
| `data` | `Omit<SetProxyAliasStateRequest, "enabled">` | body | No |  |

**Fixed by the method:** the method sets `enabled: true`; do not pass `enabled`.

**Returns:** `Promise<SetProxyAliasStateResponse>`  |  **HTTP:** `PATCH /api/v1/proxy/aliases/{id}/state`
**CLI:** `hoody proxy aliases enable`

---

#### `get` — Get proxy alias by ID

```typescript
client.api.proxy.aliases.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID |

**Returns:** `Promise<ApiProxyAliasesGetResponse>`  |  **HTTP:** `GET /api/v1/proxy/aliases/{id}`
**CLI:** `hoody proxy aliases get`

---

#### `list` — List proxy aliases

```typescript
client.api.proxy.aliases.list(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | query | No | Filter by enabled status |
| `expired` | `boolean` | query | No | Filter by expiration: true = only expired, false = only non-expired |

**Returns:** `Promise<ApiProxyAliasesListResponse>`  |  **HTTP:** `GET /api/v1/proxy/aliases`
**CLI:** `hoody proxy aliases list`

---

#### `listAll` — List proxy aliases (collect all pages)

```typescript
client.api.proxy.aliases.listAll(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | query | No | Filter by enabled status |
| `expired` | `boolean` | query | No | Filter by expiration: true = only expired, false = only non-expired |

**Returns:** `Promise<(NonNullable<ApiProxyAliasesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { aliases?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.aliases`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/proxy/aliases`
**CLI:** `hoody proxy aliases list`

---

#### `listIterator` — List proxy aliases (async iterator)

```typescript
client.api.proxy.aliases.listIterator(options?: { project_id?: string; container_id?: string; realm_id?: string; enabled?: boolean; expired?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `project_id` | `string` | query | No | Filter by project ID |
| `container_id` | `string` | query | No | Filter by container ID |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `enabled` | `boolean` | query | No | Filter by enabled status |
| `expired` | `boolean` | query | No | Filter by expiration: true = only expired, false = only non-expired |

**Returns:** `AsyncGenerator<(NonNullable<ApiProxyAliasesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { aliases?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.aliases` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/proxy/aliases`
**CLI:** `hoody proxy aliases list`

---

#### `update` — Update proxy alias

```typescript
client.api.proxy.aliases.update(id: string, data: ApiProxyAliasesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Proxy alias ID to update |
| `data` | `ApiProxyAliasesUpdateRequest` | body | Yes |  |

**Body:** `{ alias: string, program: string, port: int, index: int, target_path: string|null, allow_path_override: bool, expires_at: string|null | number, enabled: bool }`

- `alias` — … Two independent uniqueness rules apply, either of which answers 409 ALIAS_IN_USE: the name must be free on the container's physical server (across every tenant hosted there), AND your own account may hold a given name only once across all servers. Reserved and rejected: the exact label "containers" (an infrastructure label of the container proxy domain), and anything equal to a reserved service name (such as "egress") or starting with that name followed by "-" (such as "egress-"). …
- `program` — Program or protocol the alias targets — a built-in Hoody program ("terminal", "files", "code", …) or a transport protocol ("http", "https", "ssh"). … Must be a known Hoody program name (or one of its aliases) or protocol.
- `allow_path_override` — When false, only the root, or target_path itself, is served, as target_path; other paths 404, and target_path's own parameters cannot be overridden. When true, a request that carries its own path is forwarded as sent.

**Returns:** `Promise<ApiProxyAliasesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/proxy/aliases/{id}`
**CLI:** `hoody proxy aliases update`

---

### `client.api.proxy.containerPermissions` (14) — Proxy Permissions Container

#### `clearGroupPermissions` — Remove all program permissions for a container group

```typescript
client.api.proxy.containerPermissions.clearGroupPermissions(id: string, groupName: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `groupName` | `string` | path | Yes | Group name |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyContainerPermissionsClearGroupPermissionsResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody containers proxy groups permissions clear`

---

#### `delete` — Delete container proxy permissions

```typescript
client.api.proxy.containerPermissions.delete(id: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyContainerPermissionsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions`
**CLI:** `hoody containers proxy permissions delete`

---

#### `deleteAuthGroup` — Remove container authentication group

```typescript
client.api.proxy.containerPermissions.deleteAuthGroup(id: string, groupName: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `groupName` | `string` | path | Yes | Group name to remove |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyContainerPermissionsDeleteAuthGroupResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions/groups/{groupName}`
**CLI:** `hoody containers proxy groups delete`

---

#### `deleteGroupPermission` — Remove a single program permission for a container group

```typescript
client.api.proxy.containerPermissions.deleteGroupPermission(id: string, groupName: string, program: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `groupName` | `string` | path | Yes | Group name |
| `program` | `string` | path | Yes | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyContainerPermissionsDeleteGroupPermissionResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}`
**CLI:** `hoody containers proxy groups permissions delete`

---

#### `disable` — Update container proxy enable state

```typescript
client.api.proxy.containerPermissions.disable(id: string, data: Omit<UpdateContainerProxyStateRequest, "enable_proxy">, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `Omit<UpdateContainerProxyStateRequest, "enable_proxy">` | body | Yes |  |

**Fixed by the method:** the method sets `enable_proxy: false`; do not pass `enable_proxy`.

**Returns:** `Promise<UpdateContainerProxyStateResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/proxy/permissions/state`
**CLI:** `hoody containers proxy disable`

---

#### `enable` — Update container proxy enable state

```typescript
client.api.proxy.containerPermissions.enable(id: string, data: Omit<UpdateContainerProxyStateRequest, "enable_proxy">, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `Omit<UpdateContainerProxyStateRequest, "enable_proxy">` | body | Yes |  |

**Fixed by the method:** the method sets `enable_proxy: true`; do not pass `enable_proxy`.

**Returns:** `Promise<UpdateContainerProxyStateResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/proxy/permissions/state`
**CLI:** `hoody containers proxy enable`

---

#### `get` — Get container proxy permissions

```typescript
client.api.proxy.containerPermissions.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiProxyContainerPermissionsGetResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/permissions`
**CLI:** `hoody containers proxy permissions get`

---

#### `set` — Replace container proxy permissions JSON

```typescript
client.api.proxy.containerPermissions.set(id: string, data: ApiProxyContainerPermissionsSetRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyContainerPermissionsSetRequest` | body | Yes |  |

**Body:** `{ project*: string, container*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: "user"[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool, hooks: { [key: string]: { match*: object, script*: object, timeout: int }[] } }`

- `container` — Container ID (must match path :id)
- `hooks` — Per-service proxy hooks. Keys are service names; values are first-match-wins arrays of { match, script, timeout? } rules. Max 8 per service, 32 per container in total. Reserved services (such as logs, egress and cdp) are rejected.

**Returns:** `Promise<ApiProxyContainerPermissionsSetResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions`
**CLI:** `hoody containers proxy permissions set`

---

#### `setDefault` — Update container default proxy permission policy

```typescript
client.api.proxy.containerPermissions.setDefault(id: string, data: ApiProxyContainerPermissionsSetDefaultRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyContainerPermissionsSetDefaultRequest` | body | Yes |  |

**Body:** `{ default*: "allow" | "deny" }`

**Returns:** `Promise<ApiProxyContainerPermissionsSetDefaultResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/proxy/permissions/default`
**CLI:** `hoody containers proxy default set`

---

#### `setGroupPermission` — Set container group program permission

```typescript
client.api.proxy.containerPermissions.setGroupPermission(id: string, groupName: string, data: ApiProxyContainerPermissionsSetGroupPermissionRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyContainerPermissionsSetGroupPermissionRequest` | body | Yes |  |

**Body:** `{ program*: string, access*: bool | number | number[] | string | "*" }`

**Returns:** `Promise<ApiProxyContainerPermissionsSetGroupPermissionResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody containers proxy groups permissions set`

---

#### `setIpGroup` — Set IP authentication group (container)

```typescript
client.api.proxy.containerPermissions.setIpGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetIpGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyContainerPermissionsSetIpGroupRequest` | body | Yes |  |

**Body:** `{ range*: string }`

**Returns:** `Promise<ApiProxyContainerPermissionsSetIpGroupResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`
**CLI:** `hoody containers proxy groups ip set`

---

#### `setJwtGroup` — Set JWT authentication group (container)

```typescript
client.api.proxy.containerPermissions.setJwtGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetJwtGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyContainerPermissionsSetJwtGroupRequest` | body | Yes |  |

**Body:** `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`

- `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.

**Returns:** `Promise<ApiProxyContainerPermissionsSetJwtGroupResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt`
**CLI:** `hoody containers proxy groups jwt set`

---

#### `setPasswordGroup` — Set password authentication group (container)

```typescript
client.api.proxy.containerPermissions.setPasswordGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetPasswordGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyContainerPermissionsSetPasswordGroupRequest` | body | Yes |  |

**Body:** `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`

- `username` — Username for authentication. Must match exactly what the client provides.

**Returns:** `Promise<ApiProxyContainerPermissionsSetPasswordGroupResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password`
**CLI:** `hoody containers proxy groups password set`

---

#### `setTokenGroup` — Set token authentication group (container)

```typescript
client.api.proxy.containerPermissions.setTokenGroup(id: string, groupName: string, data: ApiProxyContainerPermissionsSetTokenGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyContainerPermissionsSetTokenGroupRequest` | body | Yes |  |

**Body:** `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }`

- Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.

**Returns:** `Promise<ApiProxyContainerPermissionsSetTokenGroupResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token`
**CLI:** `hoody containers proxy groups token set`

---

### `client.api.proxy.groups` (1) — Proxy Discovery

#### `list` — List container proxy groups

```typescript
client.api.proxy.groups.list(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiProxyGroupsListResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/groups`
**CLI:** `hoody containers proxy groups list`

---

### `client.api.proxy.hooks` (8) — Proxy Hooks

#### `clear` — Clear all hooks for a service

```typescript
client.api.proxy.hooks.clear(id: string, service: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition |

**Returns:** `Promise<ApiProxyHooksClearResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/hooks/{service}`
**CLI:** `hoody containers proxy services hooks clear`

---

#### `create` — Append or insert a new hook

```typescript
client.api.proxy.hooks.create(id: string, service: string, data: ApiProxyHooksCreateRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition |
| `data` | `ApiProxyHooksCreateRequest` | body | Yes |  |

**Body:** `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`

**Returns:** `Promise<ApiProxyHooksCreateResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/proxy/hooks/{service}`
**CLI:** `hoody containers proxy hooks create`

---

#### `delete` — Remove a hook

```typescript
client.api.proxy.hooks.delete(id: string, service: string, hookId: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition |

**Returns:** `Promise<ApiProxyHooksDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`
**CLI:** `hoody containers proxy hooks delete`

---

#### `get` — Get a single hook by id

```typescript
client.api.proxy.hooks.get(id: string, service: string, hookId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |

**Returns:** `Promise<ApiProxyHooksGetResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`
**CLI:** `hoody containers proxy hooks get`

---

#### `list` — List all proxy hooks for a container

```typescript
client.api.proxy.hooks.list(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiProxyHooksListResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/hooks`
**CLI:** `hoody containers proxy hooks list`

---

#### `listByService` — List hooks for a specific service

```typescript
client.api.proxy.hooks.listByService(id: string, service: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |

**Returns:** `Promise<ApiProxyHooksListByServiceResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/hooks/{service}`
**CLI:** `hoody containers proxy services hooks list`

---

#### `move` — Move a hook to a new position

```typescript
client.api.proxy.hooks.move(id: string, service: string, hookId: string, data: ApiProxyHooksMoveRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition |
| `data` | `ApiProxyHooksMoveRequest` | body | Yes |  |

**Body:** `{ position*: int }`

**Returns:** `Promise<ApiProxyHooksMoveResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position`
**CLI:** `hoody containers proxy hooks move`

---

#### `set` — Replace a hook in place

```typescript
client.api.proxy.hooks.set(id: string, service: string, hookId: string, data: ApiProxyHooksSetRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |
| `hookId` | `string` | path | Yes | 26-char Crockford base32 ULID (lowercase) |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition |
| `data` | `ApiProxyHooksSetRequest` | body | Yes |  |

**Body:** `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`

**Returns:** `Promise<ApiProxyHooksSetResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}`
**CLI:** `hoody containers proxy hooks set`

---

### `client.api.proxy.projectPermissions` (14) — Proxy Permissions Project

#### `clearGroupPermissions` — Remove all program permissions for a project group

```typescript
client.api.proxy.projectPermissions.clearGroupPermissions(id: string, groupName: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `groupName` | `string` | path | Yes | Group name |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyProjectPermissionsClearGroupPermissionsResponse>`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody projects proxy groups permissions clear`

---

#### `delete` — Delete project proxy permissions

```typescript
client.api.proxy.projectPermissions.delete(id: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyProjectPermissionsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions`
**CLI:** `hoody projects proxy permissions delete`

---

#### `deleteAuthGroup` — Remove project authentication group

```typescript
client.api.proxy.projectPermissions.deleteAuthGroup(id: string, groupName: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `groupName` | `string` | path | Yes | Group name to remove |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyProjectPermissionsDeleteAuthGroupResponse>`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions/groups/{groupName}`
**CLI:** `hoody projects proxy groups delete`

---

#### `deleteGroupPermission` — Remove a single program permission for a project group

```typescript
client.api.proxy.projectPermissions.deleteGroupPermission(id: string, groupName: string, program: string, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `groupName` | `string` | path | Yes | Group name |
| `program` | `string` | path | Yes | Program name (e.g., http, ssh, files) |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |

**Returns:** `Promise<ApiProxyProjectPermissionsDeleteGroupPermissionResponse>`  |  **HTTP:** `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}`
**CLI:** `hoody projects proxy groups permissions delete`

---

#### `disable` — Update project proxy enable state

```typescript
client.api.proxy.projectPermissions.disable(id: string, data: Omit<UpdateProjectProxyStateRequest, "enable_proxy">, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `Omit<UpdateProjectProxyStateRequest, "enable_proxy">` | body | Yes |  |

**Fixed by the method:** the method sets `enable_proxy: false`; do not pass `enable_proxy`.

**Returns:** `Promise<UpdateProjectProxyStateResponse>`  |  **HTTP:** `PATCH /api/v1/projects/{id}/proxy/permissions/state`
**CLI:** `hoody projects proxy disable`

---

#### `enable` — Update project proxy enable state

```typescript
client.api.proxy.projectPermissions.enable(id: string, data: Omit<UpdateProjectProxyStateRequest, "enable_proxy">, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `Omit<UpdateProjectProxyStateRequest, "enable_proxy">` | body | Yes |  |

**Fixed by the method:** the method sets `enable_proxy: true`; do not pass `enable_proxy`.

**Returns:** `Promise<UpdateProjectProxyStateResponse>`  |  **HTTP:** `PATCH /api/v1/projects/{id}/proxy/permissions/state`
**CLI:** `hoody projects proxy enable`

---

#### `get` — Get project proxy permissions

```typescript
client.api.proxy.projectPermissions.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |

**Returns:** `Promise<ApiProxyProjectPermissionsGetResponse>`  |  **HTTP:** `GET /api/v1/projects/{id}/proxy/permissions`
**CLI:** `hoody projects proxy permissions get`

---

#### `set` — Replace project proxy permissions JSON

```typescript
client.api.proxy.projectPermissions.set(id: string, data: ApiProxyProjectPermissionsSetRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyProjectPermissionsSetRequest` | body | Yes |  |

**Body:** `{ project*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: "user"[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool, hooks: object }`

- `project` — Project ID (must match path :id)
- `hooks` — Not accepted: hooks are container-level only. A project document that carries this field is refused with 422; set hooks on each container instead.

**Returns:** `Promise<ApiProxyProjectPermissionsSetResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions`
**CLI:** `hoody projects proxy permissions set`

---

#### `setDefault` — Update project default proxy permission policy

```typescript
client.api.proxy.projectPermissions.setDefault(id: string, data: ApiProxyProjectPermissionsSetDefaultRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Project ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyProjectPermissionsSetDefaultRequest` | body | Yes |  |

**Body:** `{ default*: "allow" | "deny" }`

**Returns:** `Promise<ApiProxyProjectPermissionsSetDefaultResponse>`  |  **HTTP:** `PATCH /api/v1/projects/{id}/proxy/permissions/default`
**CLI:** `hoody projects proxy default set`

---

#### `setGroupPermission` — Set project group program permission

```typescript
client.api.proxy.projectPermissions.setGroupPermission(id: string, groupName: string, data: ApiProxyProjectPermissionsSetGroupPermissionRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyProjectPermissionsSetGroupPermissionRequest` | body | Yes |  |

**Body:** `{ program*: string, access*: bool | number | number[] | string | "*" }`

**Returns:** `Promise<ApiProxyProjectPermissionsSetGroupPermissionResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`
**CLI:** `hoody projects proxy groups permissions set`

---

#### `setIpGroup` — Set IP authentication group (project)

```typescript
client.api.proxy.projectPermissions.setIpGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetIpGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyProjectPermissionsSetIpGroupRequest` | body | Yes |  |

**Body:** `{ range*: string }`

**Returns:** `Promise<ApiProxyProjectPermissionsSetIpGroupResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip`
**CLI:** `hoody projects proxy groups ip set`

---

#### `setJwtGroup` — Set JWT authentication group (project)

```typescript
client.api.proxy.projectPermissions.setJwtGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetJwtGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyProjectPermissionsSetJwtGroupRequest` | body | Yes |  |

**Body:** `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`

- `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.

**Returns:** `Promise<ApiProxyProjectPermissionsSetJwtGroupResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt`
**CLI:** `hoody projects proxy groups jwt set`

---

#### `setPasswordGroup` — Set password authentication group (project)

```typescript
client.api.proxy.projectPermissions.setPasswordGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetPasswordGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyProjectPermissionsSetPasswordGroupRequest` | body | Yes |  |

**Body:** `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`

- `username` — Username for authentication. Must match exactly what the client provides.

**Returns:** `Promise<ApiProxyProjectPermissionsSetPasswordGroupResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password`
**CLI:** `hoody projects proxy groups password set`

---

#### `setTokenGroup` — Set token authentication group (project)

```typescript
client.api.proxy.projectPermissions.setTokenGroup(id: string, groupName: string, data: ApiProxyProjectPermissionsSetTokenGroupRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `groupName` | `string` | path | Yes |  |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition — read current file_version from GET first |
| `data` | `ApiProxyProjectPermissionsSetTokenGroupRequest` | body | Yes |  |

**Body:** `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }`

- Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.

**Returns:** `Promise<ApiProxyProjectPermissionsSetTokenGroupResponse>`  |  **HTTP:** `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token`
**CLI:** `hoody projects proxy groups token set`

---

### `client.api.proxy.services` (2) — Proxy Discovery

#### `get` — Get merged proxy view for a service

```typescript
client.api.proxy.services.get(id: string, service: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `service` | `string` | path | Yes | Service name |

**Returns:** `Promise<ApiProxyServicesGetResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/services/{service}`
**CLI:** `hoody containers proxy services get`

---

#### `list` — List services referenced in proxy config

```typescript
client.api.proxy.services.list(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiProxyServicesListResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/services`
**CLI:** `hoody containers proxy services list`

---

### `client.api.proxy.settings` (2) — Proxy Discovery

#### `get` — Get container proxy root settings

```typescript
client.api.proxy.settings.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiProxySettingsGetResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/proxy/settings`
**CLI:** `hoody containers proxy settings get`

---

#### `update` — Update container proxy root settings

```typescript
client.api.proxy.settings.update(id: string, data: ApiProxySettingsUpdateRequest, options: { ifMatch: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |
| `ifMatch` | `string` | header `if-match` | Yes | file:v<N> ETag precondition |
| `data` | `ApiProxySettingsUpdateRequest` | body | Yes |  |

**Body:** `{ enable_proxy: bool, default: "allow" | "deny" }`

**Returns:** `Promise<ApiProxySettingsUpdateResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/proxy/settings`
**CLI:** `hoody containers proxy settings update`

---

### `client.api.realms` (1) — Realms

#### `list` — List your realm IDs

```typescript
client.api.realms.list(options?: { include_usage?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `include_usage` | `boolean` | query | No | Include resource counts per realm_id (projects, containers, servers, auth_tokens). Adds "usage" object to response data. |

**Returns:** `Promise<ApiRealmsListResponse>`  |  **HTTP:** `GET /api/v1/realms/`
**CLI:** `hoody realms list`

---

### `client.api.servers` (11) — Rentals

#### `extend` — Extend rental

```typescript
client.api.servers.extend(id: string, data: ApiServersExtendRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiServersExtendRequest` | body | Yes |  |

**Body:** `{ expected_rental_end*: string, additional_days*: int, max_charge_cents: int }`

- `expected_rental_end` — The rental's CURRENT rental_end, exactly as the API returned it. The extension is applied only if it still matches, so a retried request — a lost response, a double click — is refused with 409 EXTENSION_ALREADY_APPLIED instead of charging and extending a second time. …
- `additional_days` — Number of additional days to extend the rental (must match server pricing durations, max 3650)
- `max_charge_cents` — The total you confirmed, in whole cents. The extension is refused if it would cost more. REQUIRED when the rental has no frozen renewal price (409 CHARGE_CONFIRMATION_REQUIRED) — without a quoted ceiling nothing bounds what the current server tiers can charge. …

**Returns:** `Promise<ApiServersExtendResponse>`  |  **HTTP:** `POST /api/v1/rentals/{id}/extend`
**CLI:** `hoody servers extend`

---

#### `get` — Get rental details

```typescript
client.api.servers.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiServersGetResponse>`  |  **HTTP:** `GET /api/v1/rentals/{id}`
**CLI:** `hoody servers get`

---

#### `getStats` — Get live runtime info for a rented server or subserver

```typescript
client.api.servers.getStats(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiServersGetStatsResponse>`  |  **HTTP:** `GET /api/v1/rentals/{id}/runtime`
**CLI:** `hoody servers stats`

---

#### `list` — List user rentals

```typescript
client.api.servers.list()
```

**Returns:** `Promise<ApiServersListResponse>`  |  **HTTP:** `GET /api/v1/rentals`
**CLI:** `hoody servers list`

---

#### `listAll` — List user rentals (collect all pages)

```typescript
client.api.servers.listAll()
```

**Returns:** `Promise<(NonNullable<ApiServersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/rentals`
**CLI:** `hoody servers list`

---

#### `listIterator` — List user rentals (async iterator)

```typescript
client.api.servers.listIterator()
```

**Returns:** `AsyncGenerator<(NonNullable<ApiServersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/rentals`
**CLI:** `hoody servers list`

---

#### `listMarketplace` — Browse rental marketplace

```typescript
client.api.servers.listMarketplace(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `country` | `string` | query | No | Filter by country code (e.g., US, DE) |
| `region` | `string` | query | No | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | query | No | Maximum price per day in USD |
| `available_durations` | `number[]` | query | No | Filter servers that support these rental durations (days) |
| `min_cpu_cores` | `number` | query | No | Minimum CPU cores |
| `min_cpu_score` | `number` | query | No | Minimum CPU benchmark score |
| `cpu_score_type` | `"passmark" \| "geekbench_single" \| "geekbench_multi"` | query | No | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | query | No | Minimum RAM in GB |
| `ram_types` | `("DDR3" \| "DDR4" \| "DDR5" \| "ECC DDR4" \| "ECC DDR5")[]` | query | No | Filter by RAM types |
| `min_total_storage_gb` | `number` | query | No | Minimum total storage in GB |
| `disk_types` | `("HDD" \| "SSD" \| "NVMe" \| "SAS")[]` | query | No | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | query | No | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | query | No | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | query | No | Show only servers with unlimited traffic |
| `category` | `"compute" \| "memory" \| "storage" \| "general" \| "gpu"` | query | No | Filter by server category |
| `featured_only` | `boolean` | query | No | Show only featured servers |

**Returns:** `Promise<ApiServersListMarketplaceResponse>`  |  **HTTP:** `GET /api/v1/servers/available`
**CLI:** `hoody servers marketplace list`

---

#### `listMarketplaceAll` — Browse rental marketplace (collect all pages)

```typescript
client.api.servers.listMarketplaceAll(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `country` | `string` | query | No | Filter by country code (e.g., US, DE) |
| `region` | `string` | query | No | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | query | No | Maximum price per day in USD |
| `available_durations` | `number[]` | query | No | Filter servers that support these rental durations (days) |
| `min_cpu_cores` | `number` | query | No | Minimum CPU cores |
| `min_cpu_score` | `number` | query | No | Minimum CPU benchmark score |
| `cpu_score_type` | `"passmark" \| "geekbench_single" \| "geekbench_multi"` | query | No | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | query | No | Minimum RAM in GB |
| `ram_types` | `("DDR3" \| "DDR4" \| "DDR5" \| "ECC DDR4" \| "ECC DDR5")[]` | query | No | Filter by RAM types |
| `min_total_storage_gb` | `number` | query | No | Minimum total storage in GB |
| `disk_types` | `("HDD" \| "SSD" \| "NVMe" \| "SAS")[]` | query | No | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | query | No | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | query | No | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | query | No | Show only servers with unlimited traffic |
| `category` | `"compute" \| "memory" \| "storage" \| "general" \| "gpu"` | query | No | Filter by server category |
| `featured_only` | `boolean` | query | No | Show only featured servers |

**Returns:** `Promise<(NonNullable<ApiServersListMarketplaceResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`listMarketplace()` fetches one page). `listMarketplaceIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/servers/available`
**CLI:** `hoody servers marketplace list`

---

#### `listMarketplaceIterator` — Browse rental marketplace (async iterator)

```typescript
client.api.servers.listMarketplaceIterator(options?: { country?: string; region?: string; max_price_per_day?: number; available_durations?: number[]; min_cpu_cores?: number; min_cpu_score?: number; cpu_score_type?: "passmark" | "geekbench_single" | "geekbench_multi"; min_ram_gb?: number; ram_types?: ("DDR3" | "DDR4" | "DDR5" | "ECC DDR4" | "ECC DDR5")[]; min_total_storage_gb?: number; disk_types?: ("HDD" | "SSD" | "NVMe" | "SAS")[]; min_bandwidth_mbps?: number; min_traffic_tb?: number; unlimited_traffic_only?: boolean; category?: "compute" | "memory" | "storage" | "general" | "gpu"; featured_only?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `country` | `string` | query | No | Filter by country code (e.g., US, DE) |
| `region` | `string` | query | No | Filter by region (e.g., us-east, eu-central) |
| `max_price_per_day` | `number` | query | No | Maximum price per day in USD |
| `available_durations` | `number[]` | query | No | Filter servers that support these rental durations (days) |
| `min_cpu_cores` | `number` | query | No | Minimum CPU cores |
| `min_cpu_score` | `number` | query | No | Minimum CPU benchmark score |
| `cpu_score_type` | `"passmark" \| "geekbench_single" \| "geekbench_multi"` | query | No | CPU benchmark type for score filtering |
| `min_ram_gb` | `number` | query | No | Minimum RAM in GB |
| `ram_types` | `("DDR3" \| "DDR4" \| "DDR5" \| "ECC DDR4" \| "ECC DDR5")[]` | query | No | Filter by RAM types |
| `min_total_storage_gb` | `number` | query | No | Minimum total storage in GB |
| `disk_types` | `("HDD" \| "SSD" \| "NVMe" \| "SAS")[]` | query | No | Filter servers with these disk types |
| `min_bandwidth_mbps` | `number` | query | No | Minimum network bandwidth in Mbps |
| `min_traffic_tb` | `number` | query | No | Minimum monthly traffic allowance in TB |
| `unlimited_traffic_only` | `boolean` | query | No | Show only servers with unlimited traffic |
| `category` | `"compute" \| "memory" \| "storage" \| "general" \| "gpu"` | query | No | Filter by server category |
| `featured_only` | `boolean` | query | No | Show only featured servers |

**Returns:** `AsyncGenerator<(NonNullable<ApiServersListMarketplaceResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`listMarketplace()` fetches one page).  |  **HTTP:** `GET /api/v1/servers/available`
**CLI:** `hoody servers marketplace list`

---

#### `listRegions` — Get available server regions

```typescript
client.api.servers.listRegions()
```

**Returns:** `Promise<ApiServersListRegionsResponse>`  |  **HTTP:** `GET /api/v1/auth/available-regions`
**CLI:** `hoody servers regions list`

---

#### `rent` — Rent server

```typescript
client.api.servers.rent(id: string, data: ApiServersRentRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiServersRentRequest` | body | Yes |  |

**Body:** `{ pool_id: string, rental_days*: int, max_charge_cents: int }`

- `rental_days` — Number of days to rent (must match server pricing durations, max 3650)
- `max_charge_cents` — … REQUIRED for every paid rental. Omitting it returns 409 CHARGE_CONFIRMATION_REQUIRED, or 409 SETUP_FEE_CONFIRMATION_REQUIRED when the server also carries a one-time fee. … If the live total exceeds this ceiling the request is rejected with 409 CHARGE_EXCEEDS_MAX and nothing is charged; re-read the server and confirm the new total. …

**Returns:** `Promise<ApiServersRentResponse>`  |  **HTTP:** `POST /api/v1/servers/{id}/rent`
**CLI:** `hoody servers rent`

---

### `client.api.servers.commands` (4) — Server Commands

#### `list` — Get available commands

```typescript
client.api.servers.commands.list(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | query | No | Filter by maximum risk level |
| `serverId` | `string` | path | Yes | Server ID to get available commands for |

**Returns:** `Promise<ApiServersCommandsListResponse>`  |  **HTTP:** `GET /api/v1/servers/{serverId}/available-commands`
**CLI:** `hoody servers commands list`

---

#### `listAll` — Get available commands (collect all pages)

```typescript
client.api.servers.commands.listAll(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | query | No | Filter by maximum risk level |
| `serverId` | `string` | path | Yes | Server ID to get available commands for |

**Returns:** `Promise<(NonNullable<ApiServersCommandsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { commands?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.commands`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/servers/{serverId}/available-commands`
**CLI:** `hoody servers commands list`

---

#### `listIterator` — Get available commands (async iterator)

```typescript
client.api.servers.commands.listIterator(serverId: string, options?: { category?: string; risk_level?: "low" | "medium" | "high" | "critical" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter by command category |
| `risk_level` | `"low" \| "medium" \| "high" \| "critical"` | query | No | Filter by maximum risk level |
| `serverId` | `string` | path | Yes | Server ID to get available commands for |

**Returns:** `AsyncGenerator<(NonNullable<ApiServersCommandsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { commands?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.commands` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/servers/{serverId}/available-commands`
**CLI:** `hoody servers commands list`

---

#### `run` — Execute server command

```typescript
client.api.servers.commands.run(serverId: string, data: ApiServersCommandsRunRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `serverId` | `string` | path | Yes | Server ID to execute command on |
| `data` | `ApiServersCommandsRunRequest` | body | Yes |  |

**Body:** `{ command_id: string, command_slug: string, parameters: object, wait: bool=true, timeout: number, confirmation_token: string } (exactly one of: command_id | command_slug required)`

- `command_id` — Command ID to execute (one of command_id or command_slug required)
- `command_slug` — Command slug to execute (one of command_id or command_slug required)
- `timeout` — Command timeout in seconds (cannot exceed command max_timeout)

**Returns:** `Promise<ApiServersCommandsRunResponse>`  |  **HTTP:** `POST /api/v1/servers/{serverId}/execute-command`
**CLI:** `hoody servers commands run`

---

### `client.api.servers.jobs` (1) — Subserver Subscriptions

#### `get` — Status of a paid subserver operation

```typescript
client.api.servers.jobs.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiServersJobsGetResponse>`  |  **HTTP:** `GET /api/v1/subserver-operations/{id}`
**CLI:** `hoody servers jobs get`

---

### `client.api.servers.offers` (2) — Server Rental

#### `list` — Browse machines available to order

```typescript
client.api.servers.offers.list()
```

**Returns:** `Promise<ApiServersOffersListResponse>`  |  **HTTP:** `GET /api/v1/offers`
**CLI:** `hoody servers offers list`

---

#### `reserve` — Reserve an offer (charges immediately)

```typescript
client.api.servers.offers.reserve(id: string, data: ApiServersOffersReserveRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiServersOffersReserveRequest` | body | Yes |  |

**Body:** `{ days*: number, max_charge_cents: number, idempotency_key*: string, pool_id: string }`

- `days` — Must be one of the offer's pricing_rules keys.
- `max_charge_cents` — Ceiling on the TOTAL debit (rent + any one-time setup fee). REQUIRED for every paid reservation, not only ones carrying a setup fee. … If you get a 409, that error's data carries the authoritative total_cents for the duration you asked for.
- `pool_id` — Must be a pool you own. Defaults to your default pool.

**Returns:** `Promise<ApiServersOffersReserveResponse>`  |  **HTTP:** `POST /api/v1/offers/{id}/reserve`
**CLI:** `hoody servers offers reserve`

---

### `client.api.servers.plans` (2) — Subserver Plans

#### `list` — List subserver plans available to you

```typescript
client.api.servers.plans.list(options?: { locale?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `locale` | `string` | query | No | Language tag such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |

**Returns:** `Promise<ApiServersPlansListResponse>`  |  **HTTP:** `GET /api/v1/subserver-plans`
**CLI:** `hoody servers plans list`

---

#### `quote` — Quote a paid subserver purchase

```typescript
client.api.servers.plans.quote(options: { plan_id: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `plan_id` | `string` | query | Yes |  |

**Returns:** `Promise<ApiServersPlansQuoteResponse>`  |  **HTTP:** `GET /api/v1/subserver-subscriptions/quote`
**CLI:** `hoody servers plans quote`

---

### `client.api.servers.reservations` (2) — Server Rental

#### `get` — One of your reservations

```typescript
client.api.servers.reservations.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiServersReservationsGetResponse>`  |  **HTTP:** `GET /api/v1/reservations/{id}`
**CLI:** `hoody servers reservations get`

---

#### `list` — Your reservations

```typescript
client.api.servers.reservations.list(options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |

**Returns:** `Promise<ApiServersReservationsListResponse>`  |  **HTTP:** `GET /api/v1/reservations`
**CLI:** `hoody servers reservations list`

---

### `client.api.servers.subscriptions` (9) — Subserver Subscriptions

#### `buy` — Buy a paid subserver (charges immediately)

```typescript
client.api.servers.subscriptions.buy(data: ApiServersSubscriptionsBuyRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiServersSubscriptionsBuyRequest` | body | Yes |  |

**Body:** `{ plan_id*: string, idempotency_key*: string, max_charge_cents: int }`

- `idempotency_key` — Caller-generated. Replaying it returns the original operation, charged once. A refused request's key stays refused (the same error every time): use a new key to try again.
- `max_charge_cents` — Ceiling on the debit, from the quote. Required whenever the charge is above 0.

**Returns:** `Promise<ApiServersSubscriptionsBuyResponse>`  |  **HTTP:** `POST /api/v1/subserver-subscriptions`
**CLI:** `hoody servers subscriptions buy`

---

#### `cancel` — Cancel a paid subserver subscription

```typescript
client.api.servers.subscriptions.cancel(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiServersSubscriptionsCancelResponse>`  |  **HTTP:** `POST /api/v1/subserver-subscriptions/{id}/cancel`
**CLI:** `hoody servers subscriptions cancel`

---

#### `disableAutoRenew` — Turn auto-renew on or off

```typescript
client.api.servers.subscriptions.disableAutoRenew(id: string, data?: Omit<SetSubserverSubscriptionAutoRenewPatchRequest, "auto_renew">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `Omit<SetSubserverSubscriptionAutoRenewPatchRequest, "auto_renew">` | body | No |  |

**Fixed by the method:** the method sets `auto_renew: false`; do not pass `auto_renew`.

**Returns:** `Promise<SetSubserverSubscriptionAutoRenewPatchResponse>`  |  **HTTP:** `PUT /api/v1/subserver-subscriptions/{id}/auto-renew`
**CLI:** `hoody servers subscriptions autorenew disable`

---

#### `enableAutoRenew` — Turn auto-renew on or off

```typescript
client.api.servers.subscriptions.enableAutoRenew(id: string, data?: Omit<SetSubserverSubscriptionAutoRenewPatchRequest, "auto_renew">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `Omit<SetSubserverSubscriptionAutoRenewPatchRequest, "auto_renew">` | body | No |  |

**Fixed by the method:** the method sets `auto_renew: true`; do not pass `auto_renew`.

**Returns:** `Promise<SetSubserverSubscriptionAutoRenewPatchResponse>`  |  **HTTP:** `PUT /api/v1/subserver-subscriptions/{id}/auto-renew`
**CLI:** `hoody servers subscriptions autorenew enable`

---

#### `get` — One of your paid subserver subscriptions

```typescript
client.api.servers.subscriptions.get(id: string, options?: { locale?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `locale` | `string` | query | No | Language tag for plan.title and plan.type_label, such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiServersSubscriptionsGetResponse>`  |  **HTTP:** `GET /api/v1/subserver-subscriptions/{id}`
**CLI:** `hoody servers subscriptions get`

---

#### `list` — List your paid subserver subscriptions

```typescript
client.api.servers.subscriptions.list(options?: { limit?: number; offset?: number; locale?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |
| `locale` | `string` | query | No | Language tag for plan.title and plan.type_label, such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en. |

**Returns:** `Promise<ApiServersSubscriptionsListResponse>`  |  **HTTP:** `GET /api/v1/subserver-subscriptions`
**CLI:** `hoody servers subscriptions list`

---

#### `pay` — Pay a held subscription and resume it (charges one month)

```typescript
client.api.servers.subscriptions.pay(id: string, data: ApiServersSubscriptionsPayRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiServersSubscriptionsPayRequest` | body | Yes |  |

**Body:** `{ idempotency_key*: string, max_charge_cents: int }`

- `idempotency_key` — Caller-generated. Replaying it returns the original operation, charged once. A refused request's key stays refused (the same error every time): use a new key to try again.
- `max_charge_cents` — Ceiling on the debit, from the quote. Required whenever the charge is above 0.

**Returns:** `Promise<ApiServersSubscriptionsPayResponse>`  |  **HTTP:** `POST /api/v1/subserver-subscriptions/{id}/pay`
**CLI:** `hoody servers subscriptions pay`

---

#### `quote` — Quote an upgrade or a payment

```typescript
client.api.servers.subscriptions.quote(id: string, options: { action: "upgrade" | "pay"; plan_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `action` | `"upgrade" \| "pay"` | query | Yes |  |
| `plan_id` | `string` | query | No |  |
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiServersSubscriptionsQuoteResponse>`  |  **HTTP:** `GET /api/v1/subserver-subscriptions/{id}/quote`
**CLI:** `hoody servers subscriptions quote`

---

#### `upgrade` — Upgrade a paid subserver (charges the difference)

```typescript
client.api.servers.subscriptions.upgrade(id: string, data: ApiServersSubscriptionsUpgradeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiServersSubscriptionsUpgradeRequest` | body | Yes |  |

**Body:** `{ plan_id*: string, idempotency_key*: string, max_charge_cents: int }`

- `idempotency_key` — Caller-generated. Replaying it returns the original operation, charged once. A refused request's key stays refused (the same error every time): use a new key to try again.
- `max_charge_cents` — Ceiling on the debit, from the quote. Required whenever the charge is above 0.

**Returns:** `Promise<ApiServersSubscriptionsUpgradeResponse>`  |  **HTTP:** `POST /api/v1/subserver-subscriptions/{id}/upgrade`
**CLI:** `hoody servers subscriptions upgrade`

---

### `client.api.snapshots` (7) — Containers

#### `create` — Create container snapshot

```typescript
client.api.snapshots.create(id: string, data: ApiSnapshotsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to create snapshot for |
| `data` | `ApiSnapshotsCreateRequest` | body | Yes |  |

**Body:** `{ alias: string, expiry: int }`

- `alias` — … It is kept as the alias and also becomes the snapshot name after sanitizing (letters, digits, underscore and hyphen kept; leading and trailing hyphens and underscores stripped; at most 64 characters). A sanitized name shorter than 2 characters is refused with 400.
- `expiry` — Expiry in days (1–3650). Values outside this range are rejected before the snapshot is created.

**Returns:** `Promise<ApiSnapshotsCreateResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots create`

---

#### `delete` — Delete container snapshot

```typescript
client.api.snapshots.delete(id: string, name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |
| `name` | `string` | path | Yes | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias — or when sanitization leaves nothing — a timestamped snap-YYYYMMDD-HHMMSS. |

**Returns:** `Promise<ApiSnapshotsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/containers/{id}/snapshots/{name}`
**CLI:** `hoody snapshots delete`

---

#### `list` — Get container snapshots

```typescript
client.api.snapshots.list(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve snapshots for |

**Returns:** `Promise<ApiSnapshotsListResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots list`

---

#### `listAll` — Get container snapshots (collect all pages)

```typescript
client.api.snapshots.listAll(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve snapshots for |

**Returns:** `Promise<(NonNullable<ApiSnapshotsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { snapshots?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.snapshots`, all pages collected (`list()` fetches one page). Each item is `{ name: string, alias: string|null, created_at: string, last_used_at: string|null, expires_at: string|null, stateful: bool, size: number }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots list`

---

#### `listIterator` — Get container snapshots (async iterator)

```typescript
client.api.snapshots.listIterator(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to retrieve snapshots for |

**Returns:** `AsyncGenerator<(NonNullable<ApiSnapshotsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { snapshots?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.snapshots` per step, next page fetched on demand (`list()` fetches one page). Each item is `{ name: string, alias: string|null, created_at: string, last_used_at: string|null, expires_at: string|null, stateful: bool, size: number }`.  |  **HTTP:** `GET /api/v1/containers/{id}/snapshots`
**CLI:** `hoody snapshots list`

---

#### `restore` — Restore container from snapshot

```typescript
client.api.snapshots.restore(id: string, name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container to restore |
| `name` | `string` | path | Yes | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias — or when sanitization leaves nothing — a timestamped snap-YYYYMMDD-HHMMSS. |

**Returns:** `Promise<ApiSnapshotsRestoreResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/snapshots/{name}`
**CLI:** `hoody snapshots restore`

---

#### `setAlias` — Update snapshot alias

```typescript
client.api.snapshots.setAlias(id: string, name: string, data: ApiSnapshotsSetAliasRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique identifier of the container |
| `name` | `string` | path | Yes | The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias — or when sanitization leaves nothing — a timestamped snap-YYYYMMDD-HHMMSS. |
| `data` | `ApiSnapshotsSetAliasRequest` | body | Yes |  |

**Body:** `{ alias*: string|null }`

**Returns:** `Promise<ApiSnapshotsSetAliasResponse>`  |  **HTTP:** `PUT /api/v1/containers/{id}/snapshots/{name}/alias`
**CLI:** `hoody snapshots alias set`

---

### `client.api.storage.shares` (16) — Storage Shares

#### `create` — Create storage share

```typescript
client.api.storage.shares.create(id: string, data: ApiStorageSharesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Source container ID |
| `data` | `ApiStorageSharesCreateRequest` | body | Yes |  |

**Body:** `{ source_path*: string, target_container_id: string, target_project_id: string, mode*: "readonly" | "readwrite", alias: string, label: string, description: string, enabled: bool, expires_at: number }`

- `source_path` — Absolute path in the source container. … The path is normalized; system paths (/proc/*, /sys/*, /dev/*, /boot/*, /run/*, /var/run/*), path traversal (..) and null bytes are refused. …
- `target_container_id` — 1:1 Container Share: Share with a specific container. Specify this OR target_project_id, not both.
- `target_project_id` — Project-Wide Share: Share with all containers in a project. Auto-mounts on all current and future containers. Specify this OR target_container_id, not both.

**Returns:** `Promise<ApiStorageSharesCreateResponse>`  |  **HTTP:** `POST /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage shares create`

---

#### `delete` — Delete storage share

```typescript
client.api.storage.shares.delete(shareId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `shareId` | `string` | path | Yes | Share ID (globally unique, no container ID needed) |

**Returns:** `Promise<ApiStorageSharesDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/storage/shares/{shareId}`
**CLI:** `hoody storage shares delete`

---

#### `get` — Get storage share

```typescript
client.api.storage.shares.get(id: string, shareId: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Source container ID |
| `shareId` | `string` | path | Yes | Share ID |

**Returns:** `Promise<ApiStorageSharesGetResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares/{shareId}`
**CLI:** `hoody storage shares get`

---

#### `list` — List all your storage shares

```typescript
client.api.storage.shares.list(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `Promise<ApiStorageSharesListResponse>`  |  **HTTP:** `GET /api/v1/storage/shares`
**CLI:** `hoody storage shares list`

---

#### `listAll` — List all your storage shares (collect all pages)

```typescript
client.api.storage.shares.listAll(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `Promise<(NonNullable<ApiStorageSharesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`list()` fetches one page). `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/storage/shares`
**CLI:** `hoody storage shares list`

---

#### `listByContainer` — List storage shares

```typescript
client.api.storage.shares.listByContainer(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `target_type` | `"container" \| "project"` | query | No | Filter by target type |
| `label` | `string` | query | No | Filter by label |
| `status` | `"active" \| "failed"` | query | No | Filter by status |
| `enabled` | `boolean` | query | No | Filter by enabled status |
| `include_expired` | `boolean` | query | No | Include expired shares (default: false) |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `id` | `string` | path | Yes | Source container ID |

**Returns:** `Promise<ApiStorageSharesListByContainerResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage containers shares list`

---

#### `listByContainerAll` — List storage shares (collect all pages)

```typescript
client.api.storage.shares.listByContainerAll(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `target_type` | `"container" \| "project"` | query | No | Filter by target type |
| `label` | `string` | query | No | Filter by label |
| `status` | `"active" \| "failed"` | query | No | Filter by status |
| `enabled` | `boolean` | query | No | Filter by enabled status |
| `include_expired` | `boolean` | query | No | Include expired shares (default: false) |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `id` | `string` | path | Yes | Source container ID |

**Returns:** `Promise<(NonNullable<ApiStorageSharesListByContainerResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`listByContainer()` fetches one page). `listByContainerIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage containers shares list`

---

#### `listByContainerIterator` — List storage shares (async iterator)

```typescript
client.api.storage.shares.listByContainerIterator(id: string, options?: { target_type?: "container" | "project"; label?: string; status?: "active" | "failed"; enabled?: boolean; include_expired?: boolean; realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `target_type` | `"container" \| "project"` | query | No | Filter by target type |
| `label` | `string` | query | No | Filter by label |
| `status` | `"active" \| "failed"` | query | No | Filter by status |
| `enabled` | `boolean` | query | No | Filter by enabled status |
| `include_expired` | `boolean` | query | No | Include expired shares (default: false) |
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |
| `id` | `string` | path | Yes | Source container ID |

**Returns:** `AsyncGenerator<(NonNullable<ApiStorageSharesListByContainerResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`listByContainer()` fetches one page).  |  **HTTP:** `GET /api/v1/containers/{id}/storage/shares`
**CLI:** `hoody storage containers shares list`

---

#### `listIncoming` — Get all incoming shares

```typescript
client.api.storage.shares.listIncoming(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `Promise<ApiStorageSharesListIncomingResponse>`  |  **HTTP:** `GET /api/v1/storage/incoming`
**CLI:** `hoody storage incoming list`

---

#### `listIncomingAll` — Get all incoming shares (collect all pages)

```typescript
client.api.storage.shares.listIncomingAll(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `Promise<(NonNullable<ApiStorageSharesListIncomingResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`listIncoming()` fetches one page). `listIncomingIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/storage/incoming`
**CLI:** `hoody storage incoming list`

---

#### `listIncomingByContainer` — Get incoming shares

```typescript
client.api.storage.shares.listIncomingByContainer(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Container ID |

**Returns:** `Promise<ApiStorageSharesListIncomingByContainerResponse>`  |  **HTTP:** `GET /api/v1/containers/{id}/storage/incoming`
**CLI:** `hoody storage containers incoming list`

---

#### `listIncomingIterator` — Get all incoming shares (async iterator)

```typescript
client.api.storage.shares.listIncomingIterator(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncGenerator<(NonNullable<ApiStorageSharesListIncomingResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`listIncoming()` fetches one page).  |  **HTTP:** `GET /api/v1/storage/incoming`
**CLI:** `hoody storage incoming list`

---

#### `listIterator` — List all your storage shares (async iterator)

```typescript
client.api.storage.shares.listIterator(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Filter by realm ID. Alternative to using realm subdomain in URL. |

**Returns:** `AsyncGenerator<(NonNullable<ApiStorageSharesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`list()` fetches one page).  |  **HTTP:** `GET /api/v1/storage/shares`
**CLI:** `hoody storage shares list`

---

#### `mountIncoming` — Toggle incoming share mount

```typescript
client.api.storage.shares.mountIncoming(id: string, shareId: string, data?: Omit<ToggleIncomingShareMountRequest, "mount">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Target container ID (receiver container) |
| `shareId` | `string` | path | Yes | Share ID to toggle |
| `data` | `Omit<ToggleIncomingShareMountRequest, "mount">` | body | No |  |

**Fixed by the method:** the method sets `mount: true`; do not pass `mount`.

**Returns:** `Promise<ToggleIncomingShareMountResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount`
**CLI:** `hoody storage incoming mount`

---

#### `unmountIncoming` — Toggle incoming share mount

```typescript
client.api.storage.shares.unmountIncoming(id: string, shareId: string, data?: Omit<ToggleIncomingShareMountRequest, "mount">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Target container ID (receiver container) |
| `shareId` | `string` | path | Yes | Share ID to toggle |
| `data` | `Omit<ToggleIncomingShareMountRequest, "mount">` | body | No |  |

**Fixed by the method:** the method sets `mount: false`; do not pass `mount`.

**Returns:** `Promise<ToggleIncomingShareMountResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount`
**CLI:** `hoody storage incoming unmount`

---

#### `update` — Update storage share

```typescript
client.api.storage.shares.update(id: string, shareId: string, data: ApiStorageSharesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Source container ID |
| `shareId` | `string` | path | Yes | Share ID |
| `data` | `ApiStorageSharesUpdateRequest` | body | Yes |  |

**Body:** `{ mode: "readonly" | "readwrite", alias: string|null, label: string|null, description: string|null, enabled: bool, expires_at: number|null }`

**Returns:** `Promise<ApiStorageSharesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/containers/{id}/storage/shares/{shareId}`
**CLI:** `hoody storage shares update`

---

### `client.api.users` (9) — Users

#### `completeOnboardingMilestone` — Mark an onboarding milestone as completed

```typescript
client.api.users.completeOnboardingMilestone(data: ApiUsersCompleteOnboardingMilestoneRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiUsersCompleteOnboardingMilestoneRequest` | body | Yes |  |

**Body:** `{ milestone*: string }`

**Returns:** `Promise<ApiUsersCompleteOnboardingMilestoneResponse>`  |  **HTTP:** `POST /api/v1/users/me/onboarding`
**CLI:** `hoody users onboarding milestones complete`

---

#### `get` — Get user by ID

```typescript
client.api.users.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | User ID to retrieve |

**Returns:** `Promise<ApiUsersGetResponse>`  |  **HTTP:** `GET /api/v1/users/{id}`
**CLI:** `hoody users get`

---

#### `getFreeTierStatus` — Get free-tier claim status

```typescript
client.api.users.getFreeTierStatus()
```

**Returns:** `Promise<ApiUsersGetFreeTierStatusResponse>`  |  **HTTP:** `GET /api/v1/users/me/free-tier-status`
**CLI:** `hoody users free tier status`

---

#### `listSecurityHistory` — Get your account security history

```typescript
client.api.users.listSecurityHistory(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number |
| `limit` | `number` | query | No | Results per page |
| `include_failed` | `boolean` | query | No | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | query | No | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `Promise<ApiUsersListSecurityHistoryResponse>`  |  **HTTP:** `GET /api/v1/users/me/security-history`
**CLI:** `hoody users security history list`

---

#### `listSecurityHistoryAll` — Get your account security history (collect all pages)

```typescript
client.api.users.listSecurityHistoryAll(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number |
| `limit` | `number` | query | No | Results per page |
| `include_failed` | `boolean` | query | No | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | query | No | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `Promise<(NonNullable<ApiUsersListSecurityHistoryResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`listSecurityHistory()` fetches one page). Each item is `{ id*: string, event: string, outcome: "success" | "failed", ip_address: string, country: string|null, client: string|null, created_at: string }`. `listSecurityHistoryIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/users/me/security-history`
**CLI:** `hoody users security history list`

---

#### `listSecurityHistoryIterator` — Get your account security history (async iterator)

```typescript
client.api.users.listSecurityHistoryIterator(options?: { page?: number; limit?: number; include_failed?: boolean; include_security?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number |
| `limit` | `number` | query | No | Results per page |
| `include_failed` | `boolean` | query | No | Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions. |
| `include_security` | `boolean` | query | No | Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration. |

**Returns:** `AsyncGenerator<(NonNullable<ApiUsersListSecurityHistoryResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`listSecurityHistory()` fetches one page). Each item is `{ id*: string, event: string, outcome: "success" | "failed", ip_address: string, country: string|null, client: string|null, created_at: string }`.  |  **HTTP:** `GET /api/v1/users/me/security-history`
**CLI:** `hoody users security history list`

---

#### `redeemInvite` — Redeem a beta invite code

```typescript
client.api.users.redeemInvite(data: ApiUsersRedeemInviteRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiUsersRedeemInviteRequest` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `Promise<ApiUsersRedeemInviteResponse>`  |  **HTTP:** `POST /api/v1/users/me/redeem-invite`
**CLI:** `hoody users invites redeem`

---

#### `retrySetup` — Retry free-tier account setup

```typescript
client.api.users.retrySetup(data: ApiUsersRetrySetupRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiUsersRetrySetupRequest` | body | Yes |  |

**Body:** `{ region: string }`

**Returns:** `Promise<ApiUsersRetrySetupResponse>`  |  **HTTP:** `POST /api/v1/users/me/retry-setup`
**CLI:** `hoody users setup retry`

---

#### `update` — Update user profile

```typescript
client.api.users.update(id: string, data: ApiUsersUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | User ID to update |
| `data` | `ApiUsersUpdateRequest` | body | Yes |  |

**Body:** `{ alias: string, public_key: string, password: string, current_password: string }`

- `password` — New password. Must be at least 12 characters, at most 72 UTF-8 bytes, 3 of 4 character classes. Requires current_password for verification.
- `current_password` — Current password (REQUIRED when setting new password for verification)

**Returns:** `Promise<ApiUsersUpdateResponse>`  |  **HTTP:** `PUT /api/v1/users/{id}`
**CLI:** `hoody users update`

---

### `client.api.vault` (8) — User Vault

#### `clear` — Clear entire vault

```typescript
client.api.vault.clear(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `Promise<ApiVaultClearResponse>`  |  **HTTP:** `DELETE /api/v1/vault`
**CLI:** `hoody vault clear`

---

#### `delete` — Delete vault key

```typescript
client.api.vault.delete(key: string, options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `key` | `string` | path | Yes | Vault key name (alphanumeric, dots, underscores, hyphens) |

**Returns:** `Promise<ApiVaultDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/vault/keys/{key}`
**CLI:** `hoody vault delete`

---

#### `get` — Get vault key

```typescript
client.api.vault.get(key: string, options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `key` | `string` | path | Yes | Vault key name (alphanumeric, dots, underscores, hyphens) |

**Returns:** `Promise<ApiVaultGetResponse>`  |  **HTTP:** `GET /api/v1/vault/keys/{key}`
**CLI:** `hoody vault get`

---

#### `getStats` — Get vault statistics

```typescript
client.api.vault.getStats(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `Promise<ApiVaultGetStatsResponse>`  |  **HTTP:** `GET /api/v1/vault/stats`
**CLI:** `hoody vault stats`

---

#### `list` — List vault keys

```typescript
client.api.vault.list(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `Promise<ApiVaultListResponse>`  |  **HTTP:** `GET /api/v1/vault/keys`
**CLI:** `hoody vault list`

---

#### `listAll` — List vault keys (collect all pages)

```typescript
client.api.vault.listAll(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `Promise<(NonNullable<ApiVaultListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`list()` fetches one page). Each item is `{ key*: string, realm_id*: string, metadata: object|null, size_bytes*: int, created_at*: string, updated_at*: string }`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/vault/keys`
**CLI:** `hoody vault list`

---

#### `listIterator` — List vault keys (async iterator)

```typescript
client.api.vault.listIterator(options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |

**Returns:** `AsyncGenerator<(NonNullable<ApiVaultListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`list()` fetches one page). Each item is `{ key*: string, realm_id*: string, metadata: object|null, size_bytes*: int, created_at*: string, updated_at*: string }`.  |  **HTTP:** `GET /api/v1/vault/keys`
**CLI:** `hoody vault list`

---

#### `set` — Set vault key

```typescript
client.api.vault.set(key: string, data: ApiVaultSetRequest, options?: { realm_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `realm_id` | `string` | query | No | Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase. |
| `key` | `string` | path | Yes | Vault key name (alphanumeric, dots, underscores, hyphens) |
| `data` | `ApiVaultSetRequest` | body | Yes |  |

**Body:** `{ value*: string, metadata: object|null }`

- `metadata` — Optional JSON metadata (max 256KB). Useful for file uploads to store content-type, filename, upload date, etc. Must be valid JSON or null. …

**Returns:** `Promise<ApiVaultSetResponse>`  |  **HTTP:** `PUT /api/v1/vault/keys/{key}`
**CLI:** `hoody vault set`

---

### `client.api.wallet` (34) — Wallet

#### `claimGithubBonus` — Claim the GitHub connection bonus

```typescript
client.api.wallet.claimGithubBonus()
```

**Returns:** `Promise<ApiWalletClaimGithubBonusResponse>`  |  **HTTP:** `POST /api/v1/wallet/github-bonus/claim`
**CLI:** `hoody wallet github bonus claim`

---

#### `createCryptoInvoice` — Start a crypto payment (hosted invoice)

```typescript
client.api.wallet.createCryptoInvoice(data: ApiWalletCreateCryptoInvoiceRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiWalletCreateCryptoInvoiceRequest` | body | Yes |  |

**Body:** `{ amount*: string, idempotency_key: string }`

- `idempotency_key` — Optional caller idempotency key (must contain a non-whitespace character); repeats return the original intent

**Returns:** `Promise<ApiWalletCreateCryptoInvoiceResponse>`  |  **HTTP:** `POST /api/v1/wallet/payments/crypto/invoice`
**CLI:** `hoody wallet payments crypto invoices create`

---

#### `createInvoice` — Generate invoice for transaction

```typescript
client.api.wallet.createInvoice(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletCreateInvoiceResponse>`  |  **HTTP:** `POST /api/v1/wallet/invoices/generate/{id}`
**CLI:** `hoody wallet invoices create`

---

#### `createPaymentMethod` — Add a new payment method

```typescript
client.api.wallet.createPaymentMethod(data: ApiWalletCreatePaymentMethodRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiWalletCreatePaymentMethodRequest` | body | Yes |  |

**Body:** `{ type*: "credit_card" | "paypal" | "bank_transfer" | "crypto", name*: string, details: object, is_default: bool }`

- `name` — Display name, at most 100 characters.
- `details` — Provider references and masked fragments only (never a full card number or CVV). At most 4096 bytes as JSON.

**Returns:** `Promise<ApiWalletCreatePaymentMethodResponse>`  |  **HTTP:** `POST /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payments methods create`

---

#### `createStripeCheckout` — Start a card payment (Stripe Checkout)

```typescript
client.api.wallet.createStripeCheckout(data: ApiWalletCreateStripeCheckoutRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiWalletCreateStripeCheckoutRequest` | body | Yes |  |

**Body:** `{ amount*: string, idempotency_key: string }`

- `idempotency_key` — Optional caller idempotency key (must contain a non-whitespace character); repeats return the original intent

**Returns:** `Promise<ApiWalletCreateStripeCheckoutResponse>`  |  **HTTP:** `POST /api/v1/wallet/payments/stripe/checkout`
**CLI:** `hoody wallet payments stripe checkout create`

---

#### `deletePaymentMethod` — Delete a payment method

```typescript
client.api.wallet.deletePaymentMethod(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletDeletePaymentMethodResponse>`  |  **HTTP:** `DELETE /api/v1/wallet/payment-methods/{id}`
**CLI:** `hoody wallet payments methods delete`

---

#### `downloadInvoice` — Download invoice PDF

```typescript
client.api.wallet.downloadInvoice(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiResponse<ArrayBuffer> | ApiWalletDownloadInvoiceResponse>` — the response Content-Type picks the branch: JSON gives the payload in `.data`, a binary type gives the bytes  |  **HTTP:** `GET /api/v1/wallet/invoices/{id}/pdf`
**CLI:** `hoody wallet invoices download`

---

#### `getBalance` — Get general balance only

```typescript
client.api.wallet.getBalance()
```

**Returns:** `Promise<ApiWalletGetBalanceResponse>`  |  **HTTP:** `GET /api/v1/wallet/balances/general`
**CLI:** `hoody wallet balance get`

---

#### `getBalances` — Get aggregate balances (general + AI)

```typescript
client.api.wallet.getBalances()
```

**Returns:** `Promise<ApiWalletGetBalancesResponse>`  |  **HTTP:** `GET /api/v1/wallet/balances`
**CLI:** `hoody wallet balances get`

---

#### `getCredits` — Get AI balance (limit, usage, remaining)

```typescript
client.api.wallet.getCredits()
```

**Returns:** `Promise<ApiWalletGetCreditsResponse>`  |  **HTTP:** `GET /api/v1/wallet/balances/ai`
**CLI:** `hoody wallet credits get`

---

#### `getCryptoPaymentIntent` — Get a crypto payment intent

```typescript
client.api.wallet.getCryptoPaymentIntent(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletGetCryptoPaymentIntentResponse>`  |  **HTTP:** `GET /api/v1/wallet/payments/crypto/intents/{id}`
**CLI:** `hoody wallet payments crypto intents get`

---

#### `getGithubBonus` — Get GitHub connection bonus status

```typescript
client.api.wallet.getGithubBonus()
```

**Returns:** `Promise<ApiWalletGetGithubBonusResponse>`  |  **HTTP:** `GET /api/v1/wallet/github-bonus`
**CLI:** `hoody wallet github bonus status`

---

#### `getInvoice` — Get invoice by ID

```typescript
client.api.wallet.getInvoice(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletGetInvoiceResponse>`  |  **HTTP:** `GET /api/v1/wallet/invoices/{id}`
**CLI:** `hoody wallet invoices get`

---

#### `getPaymentAvailability` — Get top-up payment availability (providers, bounds, AI transfer fee)

```typescript
client.api.wallet.getPaymentAvailability()
```

**Returns:** `Promise<ApiWalletGetPaymentAvailabilityResponse>`  |  **HTTP:** `GET /api/v1/wallet/payment-availability`
**CLI:** `hoody wallet payments availability get`

---

#### `getPaymentMethod` — Get payment method by ID

```typescript
client.api.wallet.getPaymentMethod(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletGetPaymentMethodResponse>`  |  **HTTP:** `GET /api/v1/wallet/payment-methods/{id}`
**CLI:** `hoody wallet payments methods get`

---

#### `getStripePaymentIntent` — Get a card payment intent

```typescript
client.api.wallet.getStripePaymentIntent(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletGetStripePaymentIntentResponse>`  |  **HTTP:** `GET /api/v1/wallet/payments/stripe/intents/{id}`
**CLI:** `hoody wallet payments stripe intents get`

---

#### `getTransaction` — Get transaction by ID

```typescript
client.api.wallet.getTransaction(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletGetTransactionResponse>`  |  **HTTP:** `GET /api/v1/wallet/transactions/{id}`
**CLI:** `hoody wallet transactions get`

---

#### `listCreditFees` — Get AI credit fee history

```typescript
client.api.wallet.listCreditFees(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |

**Returns:** `Promise<ApiWalletListCreditFeesResponse>`  |  **HTTP:** `GET /api/v1/wallet/ai-fee-history`
**CLI:** `hoody wallet credits fees list`

---

#### `listCreditFeesAll` — Get AI credit fee history (collect all pages)

```typescript
client.api.wallet.listCreditFeesAll(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |

**Returns:** `Promise<(NonNullable<ApiWalletListCreditFeesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { fees?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.fees`, all pages collected (`listCreditFees()` fetches one page). Each item is `{ id*: string, transaction_id: string, amount: string, created_at: string, transaction: { id: string, reason: string, amount: string } }`. `listCreditFeesIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/wallet/ai-fee-history`
**CLI:** `hoody wallet credits fees list`

---

#### `listCreditFeesIterator` — Get AI credit fee history (async iterator)

```typescript
client.api.wallet.listCreditFeesIterator(options?: { page?: number; limit?: number; sort_by?: "created_at" | "amount" | "transaction_id"; sort_order?: "asc" | "desc" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No |  |
| `limit` | `number` | query | No |  |
| `sort_by` | `"created_at" \| "amount" \| "transaction_id"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |

**Returns:** `AsyncGenerator<(NonNullable<ApiWalletListCreditFeesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { fees?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.fees` per step, next page fetched on demand (`listCreditFees()` fetches one page). Each item is `{ id*: string, transaction_id: string, amount: string, created_at: string, transaction: { id: string, reason: string, amount: string } }`.  |  **HTTP:** `GET /api/v1/wallet/ai-fee-history`
**CLI:** `hoody wallet credits fees list`

---

#### `listCryptoPaymentIntents` — List crypto payment intents

```typescript
client.api.wallet.listCryptoPaymentIntents(options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |

**Returns:** `Promise<ApiWalletListCryptoPaymentIntentsResponse>`  |  **HTTP:** `GET /api/v1/wallet/payments/crypto/intents`
**CLI:** `hoody wallet payments crypto intents list`

---

#### `listInvoices` — Get all invoices

```typescript
client.api.wallet.listInvoices(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | query | No | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `filter` | `string` | query | No | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `Promise<ApiWalletListInvoicesResponse>`  |  **HTTP:** `GET /api/v1/wallet/invoices/`
**CLI:** `hoody wallet invoices list`

---

#### `listInvoicesAll` — Get all invoices (collect all pages)

```typescript
client.api.wallet.listInvoicesAll(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | query | No | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `filter` | `string` | query | No | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `Promise<(NonNullable<ApiWalletListInvoicesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { invoices?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.invoices`, all pages collected (`listInvoices()` fetches one page). `listInvoicesIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/wallet/invoices/`
**CLI:** `hoody wallet invoices list`

---

#### `listInvoicesIterator` — Get all invoices (async iterator)

```typescript
client.api.wallet.listInvoicesIterator(options?: { page?: number; limit?: number; sort_by?: string; sort_order?: "asc" | "desc"; filter?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number for pagination - starts from 1 |
| `limit` | `number` | query | No | Number of invoices to return per page - maximum 100 |
| `sort_by` | `string` | query | No | Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at. |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `filter` | `string` | query | No | JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. |

**Returns:** `AsyncGenerator<(NonNullable<ApiWalletListInvoicesResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { invoices?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.invoices` per step, next page fetched on demand (`listInvoices()` fetches one page).  |  **HTTP:** `GET /api/v1/wallet/invoices/`
**CLI:** `hoody wallet invoices list`

---

#### `listPaymentMethods` — Get all payment methods

```typescript
client.api.wallet.listPaymentMethods(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number, starting from 1. |
| `limit` | `number` | query | No | Results per page. |

**Returns:** `Promise<ApiWalletListPaymentMethodsResponse>`  |  **HTTP:** `GET /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payments methods list`

---

#### `listPaymentMethodsAll` — Get all payment methods (collect all pages)

```typescript
client.api.wallet.listPaymentMethodsAll(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number, starting from 1. |
| `limit` | `number` | query | No | Results per page. |

**Returns:** `Promise<(NonNullable<ApiWalletListPaymentMethodsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown)[]>` — every item of `data`, all pages collected (`listPaymentMethods()` fetches one page). Each item is `{ id*: string, user_id: string, type: string, name: string, status: string, details: object, is_default: bool, created_at: string, updated_at: string }`. `listPaymentMethodsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payments methods list`

---

#### `listPaymentMethodsIterator` — Get all payment methods (async iterator)

```typescript
client.api.wallet.listPaymentMethodsIterator(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number, starting from 1. |
| `limit` | `number` | query | No | Results per page. |

**Returns:** `AsyncGenerator<(NonNullable<ApiWalletListPaymentMethodsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends readonly (infer TItem)[] ? TItem : unknown) : unknown), void, unknown>` — one item of `data` per step, next page fetched on demand (`listPaymentMethods()` fetches one page). Each item is `{ id*: string, user_id: string, type: string, name: string, status: string, details: object, is_default: bool, created_at: string, updated_at: string }`.  |  **HTTP:** `GET /api/v1/wallet/payment-methods/`
**CLI:** `hoody wallet payments methods list`

---

#### `listStripePaymentIntents` — List card payment intents

```typescript
client.api.wallet.listStripePaymentIntents(options?: { limit?: number; offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No |  |
| `offset` | `number` | query | No |  |

**Returns:** `Promise<ApiWalletListStripePaymentIntentsResponse>`  |  **HTTP:** `GET /api/v1/wallet/payments/stripe/intents`
**CLI:** `hoody wallet payments stripe intents list`

---

#### `listTransactions` — List transactions

```typescript
client.api.wallet.listTransactions(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number, starting from 1. |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `filter` | `string` | query | No | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |

**Returns:** `Promise<ApiWalletListTransactionsResponse>`  |  **HTTP:** `GET /api/v1/wallet/transactions`
**CLI:** `hoody wallet transactions list`

---

#### `listTransactionsAll` — List transactions (collect all pages)

```typescript
client.api.wallet.listTransactionsAll(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number, starting from 1. |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `filter` | `string` | query | No | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |

**Returns:** `Promise<(NonNullable<ApiWalletListTransactionsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { transactions?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.transactions`, all pages collected (`listTransactions()` fetches one page). `listTransactionsIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/wallet/transactions`
**CLI:** `hoody wallet transactions list`

---

#### `listTransactionsIterator` — List transactions (async iterator)

```typescript
client.api.wallet.listTransactionsIterator(options?: { page?: number; limit?: number; sort_by?: "id" | "transaction_type" | "status" | "amount" | "created_at" | "updated_at"; sort_order?: "asc" | "desc"; filter?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | Page number, starting from 1. |
| `limit` | `number` | query | No |  |
| `sort_by` | `"id" \| "transaction_type" \| "status" \| "amount" \| "created_at" \| "updated_at"` | query | No |  |
| `sort_order` | `"asc" \| "desc"` | query | No |  |
| `filter` | `string` | query | No | Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. |

**Returns:** `AsyncGenerator<(NonNullable<ApiWalletListTransactionsResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { transactions?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.transactions` per step, next page fetched on demand (`listTransactions()` fetches one page).  |  **HTTP:** `GET /api/v1/wallet/transactions`
**CLI:** `hoody wallet transactions list`

---

#### `setDefaultPaymentMethod` — Set a payment method as default

```typescript
client.api.wallet.setDefaultPaymentMethod(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |

**Returns:** `Promise<ApiWalletSetDefaultPaymentMethodResponse>`  |  **HTTP:** `PUT /api/v1/wallet/payment-methods/{id}/default`
**CLI:** `hoody wallet payments methods default set`

---

#### `transferToCredits` — Transfer from general balance to AI credits

```typescript
client.api.wallet.transferToCredits(data: ApiWalletTransferToCreditsRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `ApiWalletTransferToCreditsRequest` | body | Yes |  |

**Body:** `{ amount*: string, idempotency_key: string, expected_fee_bps: int }`

- `amount` — USD amount as a string with up to 2 decimals, e.g., "10.00". No exponent, no negatives.
- `idempotency_key` — Optional caller idempotency key. Retrying with the SAME key AND same amount returns the original receipt without moving funds again; the same key with a different amount is rejected (409 TRANSFER_IDEMPOTENCY_KEY_REUSED). Recommended for the UI to make a double-click / retry-after-timeout safe.
- `expected_fee_bps` — Optional: the platform fee (basis points) the client displayed at confirmation. If it no longer matches the current server fee, the transfer is rejected (409 TRANSFER_FEE_CHANGED) so the user re-confirms — so an irreversible transfer can never be charged a fee the user was not shown.

**Returns:** `Promise<ApiWalletTransferToCreditsResponse>`  |  **HTTP:** `POST /api/v1/wallet/transfers`
**CLI:** `hoody wallet credits transfer`

---

#### `updatePaymentMethod` — Update a payment method

```typescript
client.api.wallet.updatePaymentMethod(id: string, data: ApiWalletUpdatePaymentMethodRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes |  |
| `data` | `ApiWalletUpdatePaymentMethodRequest` | body | Yes |  |

**Body:** `{ name: string, details: object, status: "active" | "inactive", is_default: bool }`

- `name` — Display name, at most 100 characters.
- `details` — Provider references and masked fragments only (never a full card number or CVV). At most 4096 bytes as JSON.

**Returns:** `Promise<ApiWalletUpdatePaymentMethodResponse>`  |  **HTTP:** `PUT /api/v1/wallet/payment-methods/{id}`
**CLI:** `hoody wallet payments methods update`

