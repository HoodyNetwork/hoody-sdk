> _**HTTP skill · `api` namespace** · ~27,460 tokens · hoody-sdk v1.0.0-beta.16_

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
- Bearer token in `Authorization`. Mint via `POST /api/v1/users/auth/login` (1d JWT / 7d refresh) or `POST /api/v1/auth/tokens` (long-lived, scopable).
- 2FA management (`POST /api/v1/users/auth/2fa/setup`, `POST /api/v1/users/auth/2fa/verify-setup`, `DELETE /api/v1/users/auth/2fa`, `POST /api/v1/users/auth/2fa/backup-codes/regenerate` and the status read) takes a login session JWT, or account-password HTTP Basic auth (which is subject to its own password and 2FA checks); a long-lived `POST /api/v1/auth/tokens` token is refused with 403 there. On top of that, the bodies differ: `POST /api/v1/users/auth/2fa/setup` needs the password; `POST /api/v1/users/auth/2fa/verify-setup` needs the OTP code; `POST /api/v1/users/auth/2fa/verify` needs `temp_token` + code; `DELETE /api/v1/users/auth/2fa` needs password + OTP **or** backup code; `POST /api/v1/users/auth/2fa/backup-codes/regenerate` needs password + a **6-digit TOTP only** (`^\\d{6}$` — a backup code fails schema validation with 422). Login-time `POST /api/v1/users/auth/2fa/verify` needs no session.
- Project/container writes: project owner or matching permission row.
- Billing: prerequisites depend on the operation. A hosted crypto invoice (`POST /api/v1/wallet/payments/crypto/invoice`) needs no saved payment method, only a login session (auth tokens are refused 403); server rentals and extensions debit the general wallet balance, so fund it first.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap (signup → verify → login [+2FA])

1. `POST /api/v1/auth/signup`
2. `POST /api/v1/auth/verify-email`
3. `POST /api/v1/users/auth/login`
4. `POST /api/v1/users/auth/2fa/verify` (if 2FA enabled — uses `temp_token`)
5. `GET /api/v1/users/auth/me`

### 2. Mint a long-lived auth token

1. `POST /api/v1/auth/tokens`
2. `GET /api/v1/auth/tokens`
3. `POST /api/v1/auth/tokens/{id}/add-realm`
4. `POST /api/v1/auth/tokens/{id}/remove-realm`
5. `POST /api/v1/auth/tokens/{id}/copy`
6. `DELETE /api/v1/auth/tokens/{id}`

### 3. Set up 2FA

1. `POST /api/v1/users/auth/2fa/setup`
2. `POST /api/v1/users/auth/2fa/verify-setup`
3. `GET /api/v1/users/auth/2fa/status`
4. `POST /api/v1/users/auth/2fa/backup-codes/regenerate`
5. `PUT /api/v1/users/auth/2fa/token-gate` / `PUT /api/v1/users/auth/2fa/token-gate`

### 4. Create first project + container

`POST /api/v1/projects/{id}/containers` needs a `server_id` and a project id; see § Quirks & gotchas.
1. `GET /api/v1/realms/`
2. `GET /api/v1/rentals` (pick the `server_id`)
3. `GET /api/v1/images/public` (only when you want a non-default image)
4. `POST /api/v1/projects/`
5. `POST /api/v1/projects/{id}/containers` (with `server_id`)
6. `POST /api/v1/containers/{id}/{operation}` (when the container is not already running)
7. `GET /api/v1/containers/{id}`

List the container's proxy aliases by getting it with `include_proxy_domains` set to `true`: `GET /api/v1/containers/{id}?include_proxy_domains=true`. The `proxy_domains` array is only populated when `include_proxy_domains` is true, and it holds the aliases created with `POST /api/v1/proxy/aliases` (each with its `url`), not the built-in kit URLs: a container with no aliases returns an empty array. Build kit URLs from the pattern in § Proxy URLs.

### 5. Grant another user access

Project-scope analogues live under `* /api/v1/projects/{id}/proxy/permissions*`. Every proxy-permissions write (steps 6 to 9, and their project-scope analogues) is guarded by optimistic concurrency: it must carry `If-Match: file:v<N>`, where `N` is the document's current `file_version`. Read it with `GET /api/v1/containers/{id}/proxy/permissions` (the response carries `file_version` and an `ETag`); each successful write bumps the version and returns the new `ETag`, so pass that one to the next write. A missing header is refused 428, and a malformed or stale one 412. HTTP: send the `If-Match` request header.
1. `GET /api/v1/projects/{id}/permissions`
2. `POST /api/v1/projects/{id}/permissions`
3. `PUT /api/v1/projects/{id}/permissions/{permissionId}`
4. `DELETE /api/v1/projects/{id}/permissions/{permissionId}`
5. `GET /api/v1/containers/{id}/proxy/permissions` (read `file_version`)
6. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` (If-Match)
7. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` (If-Match)
8. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` (If-Match)
9. `PATCH /api/v1/containers/{id}/proxy/permissions/state` / `PATCH /api/v1/containers/{id}/proxy/permissions/state` (If-Match)

### 6. Container exposure & shares

1. `PUT /api/v1/containers/{id}/network`
2. `POST /api/v1/containers/{id}/network/start`
3. `POST /api/v1/containers/{id}/firewall/egress`
4. `POST /api/v1/containers/{id}/firewall/ingress`
5. `POST /api/v1/proxy/aliases`
6. `PATCH /api/v1/proxy/aliases/{id}/state` / `PATCH /api/v1/proxy/aliases/{id}/state`
7. `POST /api/v1/containers/{id}/storage/shares`
8. `GET /api/v1/containers/{id}/storage/incoming` (container-scoped)
9. `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount` / `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount`
10. `DELETE /api/v1/storage/shares/{shareId}`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `POST /api/v1/containers/{id}/snapshots`
2. `GET /api/v1/containers/{id}/snapshots`
3. `PUT /api/v1/containers/{id}/snapshots/{name}`
4. `POST /api/v1/containers/{id}/copy`
5. `DELETE /api/v1/containers/{id}/snapshots/{name}`
6. `GET /api/v1/containers/{id}/env`
7. `PUT /api/v1/containers/{id}/env/{key}`
8. `PUT /api/v1/containers/{id}/env`
9. `DELETE /api/v1/containers/{id}/env/{key}`
10. `PUT /api/v1/containers/{id}/kvm` / `PUT /api/v1/containers/{id}/kvm` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `POST /api/v1/projects/{id}/containers`.

### 8. Billing: wallet → rent

1. `POST /api/v1/wallet/payment-methods/`
2. `PUT /api/v1/wallet/payment-methods/{id}/default`
3. `POST /api/v1/wallet/payments/stripe/checkout` (crypto: `POST /api/v1/wallet/payments/crypto/invoice`)
4. `GET /api/v1/wallet/payments/stripe/intents/{id}` (crypto: `GET /api/v1/wallet/payments/crypto/intents/{id}`)
5. `GET /api/v1/wallet/balances`
6. `GET /api/v1/wallet/transactions`
7. `GET /api/v1/servers/available`
8. `POST /api/v1/servers/{id}/rent`
9. `GET /api/v1/rentals`
10. `POST /api/v1/rentals/{id}/extend`
11. `POST /api/v1/servers/{serverId}/execute-command`

Rentals and extensions are charged to the general balance. Call `POST /api/v1/wallet/transfers` only to fund AI usage: it moves money out of that general balance into AI credits, minus a platform fee, so it leaves less for rentals.

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands. ONE exception worth reading before you call it: the notification inbox is NOT uniform CRUD. `GET /api/v1/notifications/` needs `resources.read_account` on the token (403 without it — the external_customer, dev_team, finance_team and read_only templates all deny it, as do all tokens minted before 2026-06-30), and `PUT /api/v1/notifications/{id}/read` / `PUT /api/v1/notifications/read-all` refuse EVERY auth token regardless of permissions, because acknowledging is how the record of an account event is dismissed. `GET /api/v1/notifications/summary` (unread count and newest position, no bodies) is gated on `resources.read_account` the same way. `GET /api/v1/notifications/public` needs no auth, but it returns only public system announcements, not the account inbox, so it is not a substitute for `GET /api/v1/notifications/`.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `POST /api/v1/users/auth/logout` is a logout-ALL for JWTs — every access and refresh JWT issued before that moment stops working (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `DELETE /api/v1/auth/tokens/{id}`). `POST /api/v1/users/auth/refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. Send the same refresh token in the `{"refreshToken":"…"}` body and as `Authorization: Bearer <refreshToken>`. For headless flows, mint a long-lived `POST /api/v1/auth/tokens` token instead.
- `GET /api/v1/auth/available-regions` returns `r.data.regions` (single-wrapped, like every other endpoint).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user the stored password is left unchanged (first writer wins) and a fresh verification email is sent; for a verified user it is a no-op. A second signup therefore cannot fix a mistyped password: logging in with the new one fails with 401. Change it through `POST /api/v1/auth/forgot-password` → `POST /api/v1/auth/reset-password`. Do NOT probe with signup.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers: it accepts the bare per-container kit URL, and access is decided by the container's proxy permission policy. No built-in kit asks for more, `bot` included: its management routes ignore an `Authorization` header and check no container ownership, so the proxy permission policy is their only access control. The `POST /api/v1/containers/{id}/authorize` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- `POST /api/v1/containers/{id}/{operation}`, `POST /api/v1/containers/{id}/{operation}`, `POST /api/v1/containers/{id}/{operation}`, `POST /api/v1/containers/{id}/{operation}` and `POST /api/v1/containers/{id}/{operation}` all call `POST /api/v1/containers/{id}/{operation}`: the operation is the last PATH segment, never a body field, and each method fixes it for you.  The optional body field `timeout` (seconds) caps how long the operation may run on the host; for `stop` and `POST /api/v1/containers/{id}/{operation}` it is also the time the container gets to shut down cleanly.
- `POST /api/v1/projects/{id}/containers` needs a `server_id` in its body, and nothing else in workflow 4 produces one: take it from `GET /api/v1/rentals` (a server you rent). A `name` that another container in the project already uses is refused with 409. `container_image` is optional (omitted, the default image is used); name a public image from `GET /api/v1/images/public`, since `GET /api/v1/images/user` lists only images your account owns and is empty on a new account. A bare `debian` resolves to the canonical base image.
- Snapshots are addressed by `name`, never by alias: `PUT /api/v1/containers/{id}/snapshots/{name}`, `DELETE /api/v1/containers/{id}/snapshots/{name}` and `PUT /api/v1/containers/{id}/snapshots/{name}/alias` take the `name` that `GET /api/v1/containers/{id}/snapshots` returns. `POST /api/v1/containers/{id}/snapshots` derives it from `alias`: it keeps only letters, digits, `_` and `-`, drops any leading or trailing `-` and `_`, and cuts the result to 64 characters. A derived name shorter than 2 characters is refused with 400. With no alias, or one with no usable characters, the name is `snap-YYYYMMDD-HHMMSS` (UTC).
- `POST /api/v1/containers/{id}/snapshots` needs the container `running` or `stopped` (another status is refused with 400). A container holds at most 1000 snapshots, 10 on a free-tier slice; one more is refused with 400 `CONTAINER_SNAPSHOT_LIMIT` until you delete one.
- `POST /api/v1/projects/` names the project with `alias` (required, at most 100 characters); there is no `name` field. An alias that one of your projects already uses is refused with 409.
- Kit URL `<projectId>-<containerId>-<kit>-<n>.<server>.containers.hoody.com` (a terminal id of 10000 or more makes that label longer than DNS allows, so it is `t-<n>` instead of `terminal-<n>`; the SDK and CLI do this for you): with the default proxy permissions, holding the URL is enough to use the kit, `bot` management routes included. Treat it as a secret, since it also exposes the project and container ids; restrict it with `* /api/v1/containers/{id}/proxy/permissions*` groups, or publish a `POST /api/v1/proxy/aliases` alias instead.
- `GET /api/v1/containers/{id}/proxy/services` lists only the services named in the container's proxy permission rules or hooks, so a container with no custom rules returns `services: []`; it is not a list of running kits. `POST /api/v1/proxy/aliases` takes the kit or protocol as `program` (e.g. `'exec'`, `'terminal'`, or `'http'` with `port`).
- `GET /api/v1/wallet/invoices/` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `GET /api/v1/ip` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `POST /api/v1/offers/{id}/reserve` charges at once, and every reservation whose total is above zero needs `max_charge_cents`, although the body schema marks it optional. Without it the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED` (409 `SETUP_FEE_CONFIRMATION_REQUIRED` when the offer has a one-time setup fee), and a total above it is refused with 409 `CHARGE_EXCEEDS_MAX`; the error data carries `total_cents`, and nothing is charged. It also needs a caller-generated `idempotency_key`: a retry with the same key returns the first reservation instead of charging again.
- `POST /api/v1/rentals/{id}/extend` needs `expected_rental_end`: the rental's current `rental_end`, as `GET /api/v1/rentals/{id}` returns it. The extension is applied only while that still matches, so a retry after a lost response is refused with 409 `EXTENSION_ALREADY_APPLIED` instead of charging twice; read the rental again before retrying. `max_charge_cents` is optional only when the rental's frozen renewal tiers (`renewal_pricing_frozen`) price `additional_days`; otherwise the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED`, and the error data carries `total_cents`.
- `GET /api/v1/containers/{id}/storage/incoming` is container-scoped: its `id` is the receiving container's id. For every incoming share across the account use `GET /api/v1/storage/incoming`.
- `POST /api/v1/auth/verify-email` body has `token` + optional `response_mode`, `code_challenge` (required when `response_mode: 'intent'`) and `client` (analytics source channel) — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `POST /api/v1/users/auth/2fa/verify`.
- KVM (`PUT /api/v1/containers/{id}/kvm`, field `kvm` on create/responses) is rented/dedicated (bare-metal) servers ONLY — free tier is hard-refused with 403, and the container must be STOPPED to toggle (409 otherwise). Canonical field is `kvm`; `dev_kvm` is an input-only alias (`kvm` wins; both present and disagreeing → 400). Default off.

## Common errors

- 400 — explicit bad-request checks: login "Username or email, and password are required", an unknown signup `region`, a malformed `filter` (below).
- 400 `filter must be valid JSON` / `filter must be a JSON object` — a list's `filter` query parameter must be a JSON object; malformed JSON, `null`, an array or a scalar is refused (it used to be ignored). On lists that allow only some columns, such as `GET /api/v1/wallet/transactions` and `GET /api/v1/wallet/invoices/`, an unknown column or operator is also 400. An empty `filter=` means no filter.
- 401 — Bearer missing/malformed. JWTs require the literal `Bearer ` prefix; `hdy_…` auth tokens are also accepted bare (`Authorization: hdy_…`).
- 403 — missing permission row or `resources.*` flag.
- 404 — missing resource OR 403 masked.
- 409 — uniqueness (duplicate username, proxy-alias).
- 428 / 412 — on the public routes these come from the If-Match guard on proxy-permission, proxy-settings and proxy-hook writes: 428 means the `If-Match` header is missing, 412 means it is malformed or stale (the document changed since you read it). Re-read the document (`GET /api/v1/containers/{id}/proxy/permissions` / `GET /api/v1/projects/{id}/proxy/permissions`), send its current `file:v<N>`, and retry. They do not signal a missing payment method, email verification or 2FA.
- 422 — request-schema validation (e.g. a backup code sent where `POST /api/v1/users/auth/2fa/backup-codes/regenerate` wants a 6-digit TOTP: the body is `{statusCode: 422, error: "Validation Error", message: "Validation failed: …"}`, with no `REQUEST_SCHEMA_INVALID` code on the wire) and semantic validation (password complexity, `rental_days` with no pricing).
- 429 — login 1000/30min (failures only), signup 5/hour, refresh 30/30min.
- 400 — the `events` socket accepts the WebSocket transport only (unless the deployment turns polling on); while polling is off, every long-polling request (with or without a `sid`) is refused with 400 `Polling transport is not supported; use the websocket transport`. Only on a deployment that turns polling on does a polling write with a missing or unknown `sid` get 400 `Unknown session`. Connect with `transports: ['websocket']`.
- Always-200 — `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/resend-verification`, duplicate-`POST /api/v1/auth/signup`; do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

### `activity` (2) — Activity Logs

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/users/auth/activity/stats` | Get activity stats |  |
| `GET /api/v1/users/auth/activity` | Get activity logs | `?page` `?limit` `?start_date` `?end_date` `?errors_only` `?min_status` `?max_status` `?method` `?realm_id` |

**Param notes:**

- `page` — Page number
- `limit` — Results per page
- `start_date` — Filter logs after this date
- `end_date` — Filter logs before this date
- `errors_only` — Show only errors (status >= 400)
- `min_status` — Minimum status code
- `max_status` — Maximum status code
- `method` — Filter by HTTP method
- `realm_id` — Filter by realm ID

### `ai` (1) — AI

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/ai/models` | List available AI models (Hoody catalog) |  |

### `auth` (11) — Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/users/auth/identity-claim` | Issue a fresh audience-bound identity claim | `body*` |
| `GET /api/v1/auth/config` | Get the public sign-in configuration |  |
| `POST /api/v1/users/auth/login` | Login with username and password | `body*` |
| `POST /api/v1/users/auth/logout` | Log out everywhere |  |
| `POST /api/v1/auth/forgot-password` | Request password reset | `body*` |
| `POST /api/v1/users/auth/refresh` | Refresh access token | `body*` |
| `POST /api/v1/auth/reset-password` | Reset password | `body*` |
| `POST /api/v1/auth/resend-verification` | Resend verification email | `body*` |
| `POST /api/v1/auth/signup` | Sign up with email and password | `body*` |
| `POST /api/v1/auth/verify-email` | Verify email address | `body*` |
| `GET /api/v1/users/auth/me` | Get current user profile |  |

**Body shapes:**

- `POST /api/v1/users/auth/identity-claim` body — `{ audience*: string, expires_in: int }`
  - `audience` — Consumer identifier this claim is bound to (e.g. your app hostname). Verifiers reject the claim unless they expect exactly this audience. Printable ASCII, no whitespace or double quotes.
  - `expires_in` — Requested claim lifetime in seconds. Clamped to [60, min(server ceiling, remaining JWT lifetime)]. Default: server-configured (1h).
- `POST /api/v1/users/auth/login` body — `{ username: string, email: string, password*: string, response_mode: "intent" | "tokens", client: string, code_challenge: string } (at least one of: username | email required)`
  - `username` — Username (alphanumeric characters, underscores, and hyphens)
  - `email` — Email address (alternative to username)
  - `password` — Account password, checked against the stored credential. Login applies no strength rule of its own, so a password created under an earlier policy still works.
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange (hosted sign-in page only). A request from the hosted sign-in page that carries a code_challenge always gets the 'intent' shape, whatever this field says.
  - `client` — Optional client-declared source channel for analytics: web | ssh | webssh | cli | sdk | agent. Unrecognised values are recorded as "unknown"; never affects authentication.
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of the code_verifier). Required when response_mode=intent.
- `POST /api/v1/auth/forgot-password` body — `{ email*: string }`
  - `email` — Email address associated with the account
- `POST /api/v1/users/auth/refresh` body — `{ refreshToken*: string }`
  - `refreshToken` — Valid refresh token from previous login/refresh
- `POST /api/v1/auth/reset-password` body — `{ token*: string, password*: string }`
  - `token` — Password reset token from the email link
  - `password` — New password (min 12 chars, at most 72 UTF-8 bytes, at least 3 of the 4 character classes: uppercase, lowercase, number, special)
- `POST /api/v1/auth/resend-verification` body — `{ email*: string }`
  - `email` — Email address to resend verification to
- `POST /api/v1/auth/signup` body — `{ email*: string, password*: string, region: string, invite_code: string, client: string }`
  - `email` — Email address for the new account
  - `password` — Password (min 12 chars, at most 72 UTF-8 bytes, at least 3 of the 4 character classes: uppercase, lowercase, number, special)
  - `region` — Optional preferred server region (e.g., "eu-west"). If omitted, auto-assigned by GeoIP proximity.
  - `invite_code` — Optional invite code ("coupon") captured from the signup link. Remembered and applied automatically after email verification — not validated at signup.
  - `client` — Optional client-declared source channel for analytics: web | ssh | webssh | cli | sdk | agent. Unrecognised values are recorded as "unknown"; never affects account behaviour.
- `POST /api/v1/auth/verify-email` body — `{ client: string, token*: string, response_mode: "intent" | "tokens", code_challenge: string }`
  - `client` — Optional client-declared source channel for analytics: web | ssh | webssh | cli | sdk | agent. Unrecognised values are recorded as "unknown"; never affects verification.
  - `token` — Verification token from the email link
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange.
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier). Required when response_mode=intent.

### `auth.device` (5) — Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/auth/device/deny` | Refuse the device ('Don't authorize') | `body*` |
| `POST /api/v1/auth/device/login` | Password sign-in for the device authorize step (cookie + ticket gated) | `body*` |
| `POST /api/v1/auth/device/token` | Poll for device-flow tokens (RFC-8628-inspired) | `body*` |
| `POST /api/v1/auth/device/code` | Start a device authorization flow (RFC-8628-inspired) | `body*` |
| `POST /api/v1/auth/device/verify_code` | Confirm a device user_code (verification page) | `body*` |

**Body shapes:**

- `POST /api/v1/auth/device/deny` body — `{ ticket*: string }`
  - `ticket` — device_verify_ticket from /device/verify_code
- `POST /api/v1/auth/device/login` body — `{ ticket*: string, username: string, email: string, password*: string } (at least one of: username | email required)`
  - `username` — Username (alternative to email)
  - `email` — Email address (alternative to username)
  - `password` — Account password
- `POST /api/v1/auth/device/token` body — `{ device_code*: string, code_verifier: string }`
- `POST /api/v1/auth/device/code` body — `{ client_name: string, client: string, code_challenge: string }`
  - `client_name` — Shown on the verification page as "X is requesting access"
  - `client` — Optional client-declared source channel for analytics: web | ssh | webssh | cli | sdk | agent. Unrecognised values are recorded as "unknown"; never affects authentication.
  - `code_challenge` — Optional PKCE on the device flow itself; if present the poll REQUIRES the verifier
- `POST /api/v1/auth/device/verify_code` body — `{ user_code*: string }`
  - `user_code` — XXXX-XXXX user code (dashes optional)

### `auth.oauth` (4) — Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/auth/authorize` | Begin a PKCE OAuth authorization | `body*` |
| `POST /api/v1/auth/intent/cancel` | Cancel a pending OAuth intent or 2FA temp_token |  |
| `POST /api/v1/auth/exchange` | Exchange a PKCE authorization code for tokens | `body*` |
| `POST /api/v1/auth/launch/initiate` | Initiate OAuth popup-handoff launch | `body*` |

**Body shapes:**

- `POST /api/v1/auth/authorize` body — `{ code_challenge*: string, redirect_uri*: string }`
- `POST /api/v1/auth/exchange` body — `{ code*: string, code_verifier*: string, redirect_uri*: string }`
- `POST /api/v1/auth/launch/initiate` body — `{ provider*: "github" | "google", client: string, code_challenge*: string, state_id*: string }`
  - `client` — Optional client-declared source channel for analytics: web | ssh | webssh | cli | sdk | agent. Unrecognised values are recorded as "unknown"; never affects authentication.
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier, exactly 43 chars)
  - `state_id` — Per-attempt UUID v4 identifying this sign-in attempt

### `auth.tokens` (12) — Auth Tokens

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/auth/tokens/{id}/add-realm` | Add realm to auth token | `body*` |
| `POST /api/v1/auth/tokens/{id}/copy` | Copy auth token | `body*` |
| `POST /api/v1/auth/tokens` | Create a new auth token | `body*` |
| `DELETE /api/v1/auth/tokens/{id}` | Delete auth token |  |
| `GET /api/v1/auth/tokens/{id}` | Get auth token by ID |  |
| `GET /api/v1/auth/tokens/me` | Get current auth token details |  |
| `GET /api/v1/auth/tokens/public-profiles/{public_key}` | Get auth token public profile by public key |  |
| `GET /api/v1/auth/tokens` | List auth tokens |  |
| `GET /api/v1/auth/tokens/templates` | List permission templates |  |
| `POST /api/v1/auth/tokens/{id}/remove-realm` | Remove realm from auth token | `body*` |
| `PUT /api/v1/auth/tokens/{id}` | Update auth token | `body*` |
| `PUT /api/v1/auth/tokens/me/public-profile` | Update current auth token public profile | `body*` |

**Param notes:**

- `public_key` — ED25519 public key to resolve

**Body shapes:**

- `POST /api/v1/auth/tokens/{id}/add-realm` body — `{ realm_id*: string, otp_code: string }`
  - `realm_id` — Realm ID to add to the token
  - `otp_code` — TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.
- `POST /api/v1/auth/tokens/{id}/copy` body — `{ alias: string, expires_at: string|null | "today" | "tomorrow" | number, otp_code: string }`
  - `alias` — Optional alias for the copied token. If omitted, a deterministic alias like "<source> copy" is generated.
  - `expires_at` — Optional expiration override for the copied token. If omitted, source expiration is copied when still in the future.
- `POST /api/v1/auth/tokens` body — `{ alias: string, public_key: string|null, public_storage: object|null, ip_whitelist: string[] | string, permission_template: "full_access" | "external_customer" | "dev_team" | "finance_team" | "read_only" | null, permissions: { containers: object, projects: object, financial: object, resources: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, deny_reauthorization: bool, expires_at: string | "today" | "tomorrow" | number, otp_code: string }`
  - `alias` — User-friendly alias for the token. If not provided, a random animal name will be generated (e.g., "clever-dolphin").
  - `public_key` — Optional ED25519 public key used for client identity derivation
  - `public_storage` — Public JSON profile storage attached to the token public_key (max 64KB)
  - `ip_whitelist` — IP whitelist for this token. Accepts an array of IPv4 addresses/CIDR ranges, a comma-separated string, or "*" wildcard. Defaults to "*" (allow all) if not provided. At most 1000 entries, and at most 65536 characters as a string; larger values are refused with IP_WHITELIST_TOO_LARGE.
  - `permission_template` — Optional permission template to apply. If provided, it takes precedence over `permissions`; null is the same as leaving it out. Templates: full_access, external_customer, dev_team, finance_team, read_only.
  - `permissions` — Fine-grained permissions for this token. Any missing permission path defaults to false (deny).
  - `realm_ids` — List of realm IDs this token is restricted to (at most 500). If provided, the token can ONLY be used on these specific realm subdomains.
  - `allow_no_realm` — Whether this token can be used without a realm scope (e.g. on base domain). Defaults to true (server-side). Set to false to create a strict sub-account token that ONLY works on specific realms.
  - `vault_access` — Whether this token can access user vault endpoints. Defaults to false (server-side) for security.
  - `event_access` — Whether this token can access real-time event streams and event history endpoints. Defaults to true (server-side).
  - `deny_reauthorization` — … When true, the token gets no `resources.create_tokens` or `resources.vault` permission, `vault_access` is forced to false, and the token must expire (no permanent token) — so it can never create child tokens or reach the vault. Rejected (400) if combined with an explicit `create_tokens`/`resources.vault`/`vault_access` grant. …
  - `expires_at` — Token expiration. Can be an ISO string, Unix timestamp, "today", or "tomorrow". If not provided, the token never expires.
- `POST /api/v1/auth/tokens/{id}/remove-realm` body — `{ realm_id*: string, otp_code: string }`
  - `realm_id` — Realm ID to remove from the token
- `PUT /api/v1/auth/tokens/{id}` body — `{ alias: string, public_key: string|null, public_storage: object|null, ip_whitelist: string[] | string, permissions: { containers: object, projects: object, financial: object, resources: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, expires_at: string|null | "today" | "tomorrow" | number, is_enabled: bool, otp_code: string }`
  - `alias` — User-friendly alias for the token
  - `realm_ids` — List of realm IDs this token is restricted to (at most 500)
  - `allow_no_realm` — Whether this token can be used without a realm scope
  - `vault_access` — Whether this token can access user vault endpoints
  - `event_access` — Whether this token can access real-time event streams and event history endpoints
  - `expires_at` — Token expiration. Can be an ISO string, Unix timestamp, "today", "tomorrow", or null.
  - `is_enabled` — Enable or disable the token
- `PUT /api/v1/auth/tokens/me/public-profile` body — `{ public_key: string|null, public_storage: object|null } (at least one of: public_key | public_storage required)`

### `auth.twoFactor` (7) — Two-Factor Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/users/auth/2fa/verify-setup` | Complete 2FA Setup | `body*` |
| `DELETE /api/v1/users/auth/2fa` | Disable 2FA | `body*` |
| `PUT /api/v1/users/auth/2fa/token-gate` | Set 2FA token gate preference | `body` |
| `GET /api/v1/users/auth/2fa/status` | Get 2FA Status |  |
| `POST /api/v1/users/auth/2fa/backup-codes/regenerate` | Regenerate Backup Codes | `body*` |
| `POST /api/v1/users/auth/2fa/setup` | Initialize 2FA Setup | `body*` |
| `POST /api/v1/users/auth/2fa/verify` | Verify 2FA Code During Login | `body*` |

**Body shapes:**

- `POST /api/v1/users/auth/2fa/verify-setup` body — `{ code*: string }`
  - `code` — 6-digit code from authenticator app
- `DELETE /api/v1/users/auth/2fa` body — `{ password*: string, code*: string }`
  - `password` — Current account password
  - `code` — 6-digit OTP code from authenticator app OR backup code
- `PUT /api/v1/users/auth/2fa/token-gate` body — `{ enabled*: bool, password: string, otp_code: string }`
  - `enabled` — true = require OTP for token mutations (default), false = skip OTP gate
  - `password` — Required when setting enabled=false (security downgrade requires primary-factor reauth)
  - `otp_code` — TOTP code or backup code. Required when setting enabled=false.
- `POST /api/v1/users/auth/2fa/backup-codes/regenerate` body — `{ password*: string, code*: string }`
  - `code` — 6-digit OTP code from authenticator app
- `POST /api/v1/users/auth/2fa/setup` body — `{ password*: string }`
  - `password` — Current account password for verification
- `POST /api/v1/users/auth/2fa/verify` body — `{ temp_token: string, code*: string, response_mode: "intent" | "tokens", client: string }`
  - `temp_token` — Temporary token from login response (valid for 5 minutes). Alternatively pass it as Authorization: Bearer header.
  - `code` — 6-digit OTP code from authenticator app OR 10-character backup code
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange.
  - `client` — Optional client-declared source channel for analytics: web | ssh | webssh | cli | sdk | agent. Unrecognised values are recorded as "unknown"; never affects authentication.

### `containers` (14) — Containers

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/copy` | Copy a container | `body*` |
| `POST /api/v1/projects/{id}/containers` | Create a new container | `body*` |
| `POST /api/v1/containers/{id}/authorize` | Authorize Container Access |  |
| `DELETE /api/v1/containers/{id}` | Delete a container |  |
| `PUT /api/v1/containers/{id}/kvm` | Enable or disable /dev/kvm (run VMs in the container) |  |
| `GET /api/v1/containers/{id}` | Get a container by ID | `?runtime` `?include_proxy_domains` `?include_proxy_permissions` |
| `GET /api/v1/containers/{id}/proxy-usage` | Get proxied-usage documents for a container | `?from*` `?to*` |
| `GET /api/v1/containers/{id}/stats` | Get container resource statistics |  |
| `GET /api/v1/containers/` | Get all containers | `?page` `?limit` `?sort_by` `?sort_order` `?realm_id` `?runtime` `?include_proxy_domains` `?include_proxy_permissions` `?include_expired` `?include_deleting` |
| `GET /api/v1/projects/{id}/containers` | Get all containers for a project | `?page` `?limit` `?sort_by` `?sort_order` `?runtime` `?include_proxy_domains` `?include_proxy_permissions` `?include_expired` `?include_deleting` |
| `GET /api/v1/containers/{id}/status-logs` | Get status logs for a container | `?page` `?limit` `?sort_by` `?sort_order` |
| `POST /api/v1/containers/{id}/{operation}` | Manage container | `body` |
| `POST /api/v1/containers/{id}/sync` | Sync a copied container with its source |  |
| `PUT /api/v1/containers/{id}` | Update a container | `body*` |

**Param notes:**

- `runtime` — Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Runtime information may be up to 2 seconds old.
- `include_proxy_domains` — Include proxy domains (aliases) for this container. When true, adds a proxy_domains array to the container object. _(on `GET /api/v1/containers/{id}`)_
- `include_proxy_permissions` — Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission.
- `from` — First month, inclusive (YYYY-MM)
- `to` — Last month, inclusive (YYYY-MM). Max 12 months.
- `page` — Page number for pagination - starts from 1
- `limit` — Number of containers to return per page - maximum 100 items
- `sort_by` — Field to sort containers by
- `sort_order` — Sort direction - ascending or descending
- `realm_id` — Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL.
- `include_proxy_domains` — Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object. _(on `GET /api/v1/containers/`, `GET /api/v1/projects/{id}/containers`)_
- `include_expired` — Include containers that have expired due to server termination. By default, expired containers are excluded from results.
- `include_deleting` — Include containers currently being deleted. By default, deleting containers are excluded from results.

**Body shapes:**

- `POST /api/v1/containers/{id}/copy` body — `{ target_project_id*: string, target_server_id: string, name: string, ssh_public_key: string|null, source_snapshot: string, copy_firewall_rules: bool=false, copy_network_rules: bool=false, kvm: bool, dev_kvm: bool }`
  - `target_project_id` — ID of the project where the copy will be created
  - `target_server_id` — ID of the server where the copy will be created (defaults to source server)
  - `name` — Name for the copied container (auto-generated if not provided)
  - `ssh_public_key` — SSH public key for the copied container (must be unique, not inherited from source)
  - `source_snapshot` — Specific snapshot to copy from (copies latest state if not provided). An auth token needs `containers.features.snapshots` to use it.
  - `copy_firewall_rules` — Whether to copy firewall rules from source container to target container
  - `copy_network_rules` — Whether to copy network rules/settings from source container to target container
  - `kvm` — Grant the COPY /dev/kvm passthrough (run full VMs). The copy NEVER inherits the source's KVM grant, so this decides KVM for the copy independently, on the TARGET server. Available on rented / dedicated (bare-metal) targets ONLY (never free tier); rejected (403) otherwise. Defaults to false.
  - `dev_kvm` — Accepted alias of `kvm` on input (`kvm` wins if both are sent and they must agree).
- `POST /api/v1/projects/{id}/containers` body — `{ server_id*: string, name: string, color: string, container_image: string|null, ai: bool=true, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, hoody_kit: bool=true, dev_kit: bool, kvm: bool, dev_kvm: bool, autostart: bool=true, ramdisk: bool=true, cache: bool=true, cache_image: bool=false, realm_ids: string[] }`
  - `name` — Name for the container. Must be 3-100 characters, alphanumeric with hyphens and underscores. Omit or use "rand" to generate a random name.
  - `color` — HEX color for the container (e.g., #FF0000 or FF0000). If not provided, a random color will be generated. The # prefix will be added automatically if missing, and the color will be converted to uppercase.
  - `container_image` — Container image to use. If null or not provided, will use the default configured image. Shorthand is resolved automatically: a bare distribution name or a hyphenated version ("debian", "debian-13") becomes the canonical base image ("debian/13"), as do the "debian:13" and "debian 13" forms.
  - `ai` — Whether AI features are enabled (default: true)
  - `environment_vars` — Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` and be at most 128 characters long.
  - `ssh_public_key` — SSH public key for container access. SSH public keys must be unique per container (one container per key). If not provided, will inherit from project defaults.
  - `comment` — Optional comment for the container (max 16000 characters)
  - `hoody_kit` — Enable all Hoody Kit features: extra package sources, a package download cache, basic and developer packages, extra shells, the Hoody daemon, sudo setup, snapd removal, web view, desktop, a default user, a web terminal, and VM tooling (about 185 MiB; running VMs additionally needs the separate kvm …
  - `dev_kit` — Enable dev_kit development tools in the container. Defaults to true when hoody_kit is true, false when hoody_kit is false (unless explicitly set). Cannot be updated after creation.
  - `kvm` — Enable /dev/kvm passthrough (run full VMs inside the container) at creation. Available on rented / dedicated (bare-metal) servers ONLY — never free tier — and rejected (403) on a free server. Defaults to false. Can also be toggled later via PUT /api/v1/containers/{id}/kvm on a stopped container.
  - `autostart` — Whether the container should start automatically on host boot (default: true)
  - `ramdisk` — Whether to mount a ramdisk at /ramdisk in the container (default: true). … Can store up to 50% of total host memory. …
  - `cache` — Enable use of cached images during container creation. When false, the container is built without the image cache.
  - `cache_image` — Force the creation of a new cached image from the container image. This option is only available to the owner of the image.
  - `realm_ids` — Realm IDs to assign this container to. If creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids. Note: Containers can have different realm membership than their parent project.
- `POST /api/v1/containers/{id}/{operation}` body — `{ timeout: int }|null`
  - `timeout` — Upper bound, in seconds, on how long the operation may run before it is cut off. For `stop` and `restart` it is also the time the container is given to shut down cleanly. At most 600. Omit it for the server default.
- `PUT /api/v1/containers/{id}` body — `{ name: string, color: string, ai: bool, autostart: bool, ramdisk_scope: "container" | "project", ramdisk: bool, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, realm_ids: string[] }`
  - `name` — Human-readable name for the container - must be unique within the project
  - `ai` — Whether AI features are enabled. If omitted, the current value is preserved.
  - `autostart` — Whether the container starts automatically on host boot. If omitted, the current value is preserved.
  - `ramdisk_scope` — Sharing scope for /ramdisk. `container` (default) mounts only private storage. `project` additionally mounts /ramdisk/project, shared with your other containers in this project ON THE SAME SERVER (a RAM disk cannot span servers). Refused when the project has other members.
  - `ramdisk` — … Backed by a shared per-server memory pool (512 MiB by default, never more than 50% of the server memory) shared with your other containers on that server. Data survives container restarts but is LOST on a host reboot — which is why it suits secrets and scratch data that must not persist to disk. …
  - `environment_vars` — Environment variables to set in the container as key-value pairs. Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` and be at most 128 characters long.
  - `ssh_public_key` — SSH public key for direct SSH access to this container. … An empty or whitespace-only string is rejected with 400 (send null to remove). Requires a token with the ssh-keys resource permission to set or replace; removal needs only container update permission.
  - `comment` — Optional comment for the container (max 16000 characters). Set to null to clear existing comment.
  - `realm_ids` — Update realm membership for this container. Containers can have different realm membership than their parent project. A signed-in session (JWT) or an auth token without realm restrictions can modify realm_ids; realm-restricted tokens cannot change realm membership.

### `containers.env` (4) — Container Environment

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/containers/{id}/env/{key}` | Delete a single environment variable |  |
| `GET /api/v1/containers/{id}/env` | List container environment variables |  |
| `PUT /api/v1/containers/{id}/env/{key}` | Set a single environment variable | `body*` |
| `PUT /api/v1/containers/{id}/env` | Bulk set container environment variables | `body*` |

**Param notes:**

- `key` — Environment variable key

**Body shapes:**

- `PUT /api/v1/containers/{id}/env/{key}` body — `{ value*: string }`
  - `value` — Value for the environment variable
- `PUT /api/v1/containers/{id}/env` body — `{ [key: string]: string }` — Keys must match `^[a-zA-Z_][a-zA-Z0-9_]*$` and be at most 128 characters long.

### `events` (6) — Events

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/events` | Bulk delete events | `body*` |
| `DELETE /api/v1/events/{id}` | Delete a single event |  |
| `GET /api/v1/events/{id}` | Get event details by ID |  |
| `GET /api/v1/events/stats` | Get event statistics | `?start_date` `?end_date` `?realm_id` |
| `GET /api/v1/events` | List event history | `?limit` `?offset` `?sort_by` `?sort_order` `?event_type` `?resource_type` `?resource_id` `?project_id` `?container_id` `?start_date` `?end_date` `?realm_id` `?after` `?bootstrap` |
| `POST /api/v1/events/cleanup` | Cleanup old events | `body*` |

**Param notes:**

- `start_date` — Start of time range _(on `GET /api/v1/events/stats`)_
- `end_date` — End of time range _(on `GET /api/v1/events/stats`)_
- `realm_id` — Filter by realm _(on `GET /api/v1/events/stats`)_
- `limit` — Number of events to return (max 500)
- `offset` — Number of events to skip
- `sort_by` — Field to sort by
- `sort_order` — Sort direction
- `event_type` — Filter by specific event type
- `resource_type` — Filter by resource type
- `resource_id` — Filter by specific resource ID
- `project_id` — Filter by project ID
- `container_id` — Filter by container ID
- `start_date` — Filter events after this timestamp _(on `GET /api/v1/events`)_
- `end_date` — Filter events before this timestamp _(on `GET /api/v1/events`)_
- `realm_id` — Selects the realm scope in all modes; 403 on a realm-host or token conflict _(on `GET /api/v1/events`)_
- `after` — Cursor mode: return events after this cursor, oldest first. Cannot be combined with offset, sort_by, sort_order other than asc, event_type, resource_type, resource_id, project_id, container_id, start_date or end_date. In every mode `realm_id` selects the realm exactly as it does in offset mode: the cursor is bound to that realm, and a `realm_id` that conflicts with the realm host or lies outside the realms of the token is refused with 403.
- `bootstrap` — Return no events, only the resumable boundary (`next_cursor`) and `latest_cursor` for this scope.

**Body shapes:**

- `DELETE /api/v1/events` body — `{ event_type: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "container.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | "container.renamed" | "container.resource_updated" | "container.ssh_key.added" | "container.ssh_key.removed" | "container.snapshot.created" | "container.snapshot.deleted" | "container.snapshot.restored" | "container.snapshot.renamed" | "container.display.enabled" | "container.paused" | "container.copying" | "container.updated" | "container.env.updated" | "container.env.applied" | "container.env.failed" | "container.network.created" | "container.network.updated" | "container.network.running" | "container.network.stopped" | "container.network.failed" | "container.network.deleted" | "container.access_suspended" | "container.access_restored" | "container.operation.completed" | "container.operation.failed" | "storage.share.created" | "storage.share.updated" | "storage.share.deleted" | "storage.share.enabled" | "storage.share.disabled" | "storage.share.expiring_soon" | "storage.share.expired" | "storage.share.mount_changed" | "notification.created" | "notification.read" | "notification.deleted" | "notification.updated" | "project.created" | "project.updated" | "project.deleted" | "project.permission.granted" | "project.permission.updated" | "project.permission.revoked" | "server.created" | "server.updated" | "server.enabled" | "server.disabled" | "server.health_changed" | "server.rental_expiring" | "server.deleted" | "server.rental_started" | "server.rental_extended" | "server.rental_expired" | "server.rental_terminated" | "server.rental_hold_started" | "server.rental_updated" | "server.command.completed" | "server.command.failed" | "server.reservation.created" | "server.reservation.fulfilled" | "server.reservation.refunded" | "server.offer.published" | "server.offer.updated" | "server.offer.withdrawn" | "firewall.rule.added" | "firewall.rule.removed" | "firewall.rule.updated" | "firewall.rule.enabled" | "firewall.rule.disabled" | "proxy.alias.created" | "proxy.alias.updated" | "proxy.alias.deleted" | "proxy.alias.enabled" | "proxy.alias.disabled" | "proxy.alias.expiring_soon" | "proxy.alias.expired" | "proxy.permissions.updated" | "proxy.permissions.default_changed" | "proxy.permissions.group_added" | "proxy.permissions.group_updated" | "proxy.permissions.group_removed" | "auth.token.created" | "auth.token.updated" | "auth.token.deleted" | "auth.token.enabled" | "auth.token.disabled" | "pool.member.joined" | "pool.member.left" | "pool.member.role_changed" | "pool.invited" | "pool.invitation_revoked" | "pool.created" | "pool.updated" | "pool.deleted" | "activity.logged" | "vault.key.set" | "vault.key.deleted" | "vault.cleared" | "account.updated" | "billing.balance_changed" | "billing.payment.succeeded" | "billing.payment.failed" | "billing.payment.updated" | "billing.invoice.created" | "billing.payment_method.added" | "billing.payment_method.removed" | "billing.payment_method.default_changed" | "billing.payment_method.updated" | "image.library.added", resource_type: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | "auth_token" | "pool" | "activity_log" | "container_network" | "project_permission" | "vault" | "account" | "wallet" | "payment" | "invoice" | "payment_method" | "user_image" | "reservation" | "server_offer", resource_id: string, before_date: string, realm_id: string }`
  - `event_type` — Delete all events of this type
  - `resource_type` — Delete all events for this resource type
  - `resource_id` — Delete all events for this resource
  - `before_date` — Delete events before this date
  - `realm_id` — Delete events in this realm
- `POST /api/v1/events/cleanup` body — `{ retention_days*: int }`
  - `retention_days` — Delete events older than this many days

### `firewall` (8) — Container Firewall

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/firewall/egress` | Add Egress Rule | `body*` |
| `POST /api/v1/containers/{id}/firewall/ingress` | Add Ingress Rule | `body*` |
| `DELETE /api/v1/containers/{id}/firewall/egress` | Remove Egress Rule(s) | `body*` |
| `DELETE /api/v1/containers/{id}/firewall/ingress` | Remove Ingress Rule(s) | `body*` |
| `PATCH /api/v1/containers/{id}/firewall/egress` | Toggle Egress Rule State | `body` |
| `PATCH /api/v1/containers/{id}/firewall/ingress` | Toggle Ingress Rule State | `body` |
| `GET /api/v1/containers/{id}/firewall/rules` | List container firewall rules |  |
| `POST /api/v1/containers/{id}/firewall/reset` | Reset container firewall |  |

**Body shapes:**

- `POST /api/v1/containers/{id}/firewall/egress` body — `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, destination: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `action` — Action to take: allow (permit), reject (deny with response), drop (deny silently)
  - `protocol` — Network protocol
  - `description` — Human-readable rule description
  - `destination_port` — Port number (1-65535), range with the lower port first (80-90), or comma-separated list (80,443). Required for TCP/UDP; not allowed with icmp4.
  - `destination` — Destination IPv4 address or CIDR range, or a comma-separated list of them. Use 0.0.0.0/0 for any destination. IPv6 is not supported.
  - `source_port` — Source port filter (rarely used)
  - `state` — Rule state (defaults to enabled)
  - `icmp_type` — ICMP type number
  - `icmp_code` — ICMP code number
- `POST /api/v1/containers/{id}/firewall/ingress` body — `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, source: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `source` — Source IPv4 address or CIDR range, or a comma-separated list of them. Use 0.0.0.0/0 for any source. IPv6 is not supported.
  - `icmp_type` — ICMP type number (e.g., 8 for echo request/ping)
- `DELETE /api/v1/containers/{id}/firewall/egress` body — `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, destination: string, source_port: string, description: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `all` — Remove all matching rules (default: first match only). Set to true with no other filters to remove all egress rules.
  - `action` — Action for matching traffic
  - `protocol` — Protocol type
  - `destination_port` — Destination port, range (e.g., 80-90), or list (e.g., 80,443)
  - `destination` — Destination IPv4/CIDR address(es)
  - `source_port` — Source port, range, or list
  - `description` — Rule description
  - `state` — Match only rules in this state. Omit to match rules in either state.
  - `icmp_type` — ICMP type number for icmp4 protocol
  - `icmp_code` — ICMP code number for icmp4 protocol
- `DELETE /api/v1/containers/{id}/firewall/ingress` body — `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source: string, source_port: string, description: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `all` — Remove all matching rules (default: first match only). Set to true with no other filters to remove all ingress rules.
  - `source` — Source IPv4/CIDR address(es)
- `PATCH /api/v1/containers/{id}/firewall/egress` body — `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, destination: string, description: string, icmp_type: string, icmp_code: string }`
  - `state` — New state for the rule
- `PATCH /api/v1/containers/{id}/firewall/ingress` body — `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, source: string, description: string, icmp_type: string, icmp_code: string }`

### `images` (7) — Container Images

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/images/purchase/{id}` | Purchase image |  |
| `GET /api/v1/images/{id}/icon` | Get image icon |  |
| `GET /api/v1/images/public/{id}` | Get public image details |  |
| `POST /api/v1/images/import/{id}` | Import free image |  |
| `GET /api/v1/images/user` | List user images | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/images/public` | List public images | `?os` `?architecture` `?min_price` `?max_price` `?min_rating` `?max_rating` `?search` `?page` `?limit` `?sort_by` `?sort_order` |
| `POST /api/v1/images/rate/{id}` | Rate image | `body*` |

**Param notes:**

- `page` — Page number for pagination - starts from 1
- `limit` — Number of images to return per page - maximum 100 items
- `sort_by` — Field to sort user images by - currently only supports creation date _(on `GET /api/v1/images/user`)_
- `sort_order` — Sort direction - ascending or descending
- `os` — Filter images by operating system - e.g., debian (the platform currently carries debian/13 only)
- `architecture` — Filter images by CPU architecture - e.g., amd64, arm64, armhf
- `min_price` — Minimum price filter for paid images - 0 includes free images
- `max_price` — Maximum price filter for paid images - useful for budget constraints
- `min_rating` — Minimum average rating filter - filters images with rating >= this value (0-5 stars)
- `max_rating` — Maximum average rating filter - filters images with rating at most this value (0-5 stars)
- `search` — Search term to filter images by name, description, or tags
- `sort_by` — Field to sort images by - name, date added, price, or average rating _(on `GET /api/v1/images/public`)_

**Body shapes:**

- `POST /api/v1/images/rate/{id}` body — `{ rating*: number }`
  - `rating` — Rating for the image from 0 to 5 stars

### `inbox` (5) — Notifications

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/summary` | Unread notification count and newest position |  |
| `GET /api/v1/notifications/` | List notifications for the authenticated user | `?page` `?limit` `?unread_only` `?read_only` `?before` |
| `GET /api/v1/notifications/public` | Get all public notifications |  |
| `PUT /api/v1/notifications/read-all` | Mark all notifications as read |  |
| `PUT /api/v1/notifications/{id}/read` | Mark a notification as read |  |

**Param notes:**

- `page` — Page number (offset paging). Ignored when `before` is supplied.
- `limit` — Rows per page (max 100).
- `unread_only` — Return only notifications the user has not read. Mutually exclusive with read_only.
- `read_only` — Return only notifications the user HAS read — the archive half of the inbox. `pagination.total` counts the same filtered set, so it can drive page numbers directly. Mutually exclusive with unread_only (sending both is a 400, not an empty page).
- `before` — Keyset cursor from a previous response's pagination.next_cursor ("<created_at>,<id>"). Prefer this over `page` for an inbox: offset paging duplicates or skips rows when a new notification arrives mid-read.

### `ip` (1) — Utilities

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/ip` | Get IP Information |  |

### `meta` (1) — Meta

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/meta/public-key` | Get Hoody API Signing Public Key |  |

### `network` (5) — Containers

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/containers/{id}/network` | Remove container network configuration |  |
| `GET /api/v1/containers/{id}/network` | Get container network configuration |  |
| `POST /api/v1/containers/{id}/network/start` | Start container network proxy/blocking |  |
| `POST /api/v1/containers/{id}/network/stop` | Stop container network proxy/blocking |  |
| `PUT /api/v1/containers/{id}/network` | Update container network configuration | `body*` |

**Body shapes:**

- `PUT /api/v1/containers/{id}/network` body — `{ type*: "socks5" | "http" | "https" | "block", proxy: string, country: string, city: string, region: string, comment: string, dns_servers: string[] }`
  - `type` — Network configuration type - proxy type or block for traffic blocking
  - `proxy` — Proxy server URL (required for non-block types), e.g. "socks5://proxy.example.com:1080". …
  - `country` — Optional country for geographical proxy selection
  - `city` — Optional city for geographical proxy selection
  - `region` — Optional region for geographical proxy selection
  - `comment` — Optional comment describing the network configuration (max 1000 characters)
  - `dns_servers` — Custom DNS servers (max 4, defaults to ["1.1.1.1", "8.8.8.8"])

### `pools` (5) — Pools

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools` | Create pool | `body*` |
| `DELETE /api/v1/pools/{id}` | Delete pool |  |
| `GET /api/v1/pools/{id}` | Get pool details |  |
| `GET /api/v1/pools` | List user pools |  |
| `PUT /api/v1/pools/{id}` | Update pool | `body*` |

**Body shapes:**

- `POST /api/v1/pools` body — `{ name*: string, description: string, settings: object }`
- `PUT /api/v1/pools/{id}` body — `{ description: string, settings: object }`

### `pools.invitations` (3) — Pool Invitations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools/{id}/accept` | Accept invitation |  |
| `GET /api/v1/pools/invitations/pending` | List pending invitations |  |
| `POST /api/v1/pools/{id}/reject` | Reject invitation |  |

### `pools.members` (3) — Pool Members

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools/{id}/members` | Invite member | `body*` |
| `DELETE /api/v1/pools/{id}/members/{userId}` | Remove member |  |
| `PUT /api/v1/pools/{id}/members/{userId}` | Update member role | `body*` |

**Body shapes:**

- `POST /api/v1/pools/{id}/members` body — `{ username*: string, role*: "admin" | "user" }`
  - `username` — Username of the user to invite
- `PUT /api/v1/pools/{id}/members/{userId}` body — `{ role*: "admin" | "user" }`

### `projects` (11) — Projects

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/projects/` | Create a new project | `body*` |
| `POST /api/v1/projects/{id}/permissions` | Grant project access | `body*` |
| `DELETE /api/v1/projects/{id}` | Delete project | `?include_deleted_items` |
| `DELETE /api/v1/projects/{id}/permissions/{permissionId}` | Revoke project access |  |
| `GET /api/v1/projects/{id}` | Get project by ID | `?include_permissions` |
| `GET /api/v1/projects/{id}/proxy-usage` | Get proxied-usage documents for every container in a project | `?from*` `?to*` |
| `GET /api/v1/projects/{id}/stats` | Get statistics for all containers in a project |  |
| `GET /api/v1/projects/` | List all projects | `?page` `?limit` `?sort_by` `?sort_order` `?realm_id` |
| `GET /api/v1/projects/{id}/permissions` | List project permissions | `?page` `?limit` `?sort_by` `?sort_order` |
| `PUT /api/v1/projects/{id}` | Update project | `body*` |
| `PUT /api/v1/projects/{id}/permissions/{permissionId}` | Update project permission | `body*` |

**Param notes:**

- `include_deleted_items` — Include a short list of the deleted container IDs and names in the response.
- `include_permissions` — Include project permissions with user details in response
- `from` — First month, inclusive (YYYY-MM)
- `to` — Last month, inclusive (YYYY-MM). Max 12 months.
- `page` — Page number (1-based)
- `limit` — Items per page (max 100)
- `sort_by` — Field to sort by
- `sort_order` — Sort direction
- `realm_id` — Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL.

**Body shapes:**

- `POST /api/v1/projects/` body — `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`
  - `alias` — Human-readable project name. Must be unique across your projects (e.g., "Production", "Development", "Client-ABC").
  - `color` — HEX color code for visual organization in dashboards. Accepts 3-digit (#RGB) or 6-digit (#RRGGBB). The # prefix is auto-added if missing, and the value is auto-normalized to uppercase. If not provided, a random color is generated.
  - `max_containers` — Maximum number of containers allowed in this project. Set to null for unlimited. This quota is enforced during container creation.
  - `realm_ids` — Realm IDs to assign this project to. If you are creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids.
- `POST /api/v1/projects/{id}/permissions` body — `{ user_id*: string, permission_level*: "read" | "edit" | "delete" }`
  - `user_id` — User ID to grant access to
  - `permission_level` — Access level: "read", "edit", or "delete"
- `PUT /api/v1/projects/{id}` body — `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`
  - `alias` — New project name. Must be unique across your projects.
  - `color` — New HEX color code. Auto-normalized to uppercase with # prefix.
  - `max_containers` — Maximum number of containers allowed in this project. Set to null for unlimited. This quota is enforced during container creation. Only the project owner can change it, and a realm-restricted token cannot (the limit applies to every realm of the project); sending the current value back is accepted.
  - `realm_ids` — Update realm membership for this project. If updating from a realm subdomain, the subdomain realm is automatically preserved and merged. A signed-in session (JWT) or an auth token without realm restrictions can modify realm_ids; realm-restricted tokens cannot change realm membership.
- `PUT /api/v1/projects/{id}/permissions/{permissionId}` body — `{ permission_level*: "read" | "edit" | "delete" }`
  - `permission_level` — New permission level

### `proxy.aliases` (6) — Proxy Aliases

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/proxy/aliases` | Create a new proxy alias | `body*` |
| `DELETE /api/v1/proxy/aliases/{id}` | Delete proxy alias |  |
| `PATCH /api/v1/proxy/aliases/{id}/state` | Enable or disable proxy alias |  |
| `GET /api/v1/proxy/aliases/{id}` | Get proxy alias by ID |  |
| `GET /api/v1/proxy/aliases` | List proxy aliases | `?project_id` `?container_id` `?realm_id` `?enabled` `?expired` |
| `PATCH /api/v1/proxy/aliases/{id}` | Update proxy alias | `body*` |

**Param notes:**

- `project_id` — Filter by project ID
- `container_id` — Filter by container ID
- `realm_id` — Filter by realm ID. Alternative to using realm subdomain in URL.
- `enabled` — Filter by enabled status
- `expired` — Filter by expiration: true = only expired, false = only non-expired

**Body shapes:**

- `POST /api/v1/proxy/aliases` body — `{ container_id*: string, alias: string|null | false, program*: string, port: int, index: int, target_path: string|null, allow_path_override: bool=true, expires_at: string|null, enabled: bool=true }`
  - `container_id` — Container ID that this alias points to. You must own this container.
  - `alias` — … Two independent uniqueness rules apply, either of which answers 409 ALIAS_IN_USE: the name must be free on the container's physical server (across every tenant hosted there), AND your own account may hold a given name only once across all servers. … Reserved and rejected: the exact label "containers" (an infrastructure label of the container proxy domain), and anything equal to a reserved service name (such as "egress") or starting with that name followed by "-" (such as "egress-"). …
  - `program` — Which container service the alias targets — a built-in Hoody program ("terminal", "files", "code", "browser", "agent", "display", …) or a transport protocol ("http", "https", "ssh"). … Must be a known Hoody program name (or one of its aliases) or protocol.
  - `port` — Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000 → http://<container>:3000). … Ignored for built-in Hoody programs, which have fixed kit ports.
  - `index` — Instance index, or target port for the "http"/"https" protocol. Defaults to 1. For a built-in Hoody program it selects which running instance to route to (e.g. terminal 2). …
  - `target_path` — Landing path served when https://{alias}.../ is requested with no path (a root request); a query written in it is sent too. With allow_path_override true, a request that carries its own path is forwarded as-sent, resolved from the container root — this value is never used as a prefix. …
  - `allow_path_override` — When false, the alias serves only the root, or target_path itself: once the proxy permissions allow the request, a request to either lands on target_path and any other path is refused (404). …
  - `expires_at` — Optional ISO 8601 expiration date. Alias will be automatically disabled after this date.
  - `enabled` — Whether the alias is initially enabled (defaults to true)
- `PATCH /api/v1/proxy/aliases/{id}` body — `{ alias: string, program: string, port: int, index: int, target_path: string|null, allow_path_override: bool, expires_at: string|null | number, enabled: bool }`
  - `alias` — … Two independent uniqueness rules apply, either of which answers 409 ALIAS_IN_USE: the name must be free on the container's physical server (across every tenant hosted there), AND your own account may hold a given name only once across all servers. Reserved and rejected: the exact label "containers" (an infrastructure label of the container proxy domain), and anything equal to a reserved service name (such as "egress") or starting with that name followed by "-" (such as "egress-"). …
  - `program` — Program or protocol the alias targets — a built-in Hoody program ("terminal", "files", "code", …) or a transport protocol ("http", "https", "ssh"). … Must be a known Hoody program name (or one of its aliases) or protocol.
  - `port` — Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000). Preferred over "index"; takes precedence over "index" and over any port embedded in the program string. Ignored for built-in Hoody programs.
  - `index` — Instance index, or target port when program is "http"/"https". Prefer the dedicated "port" field; if "port" or a port embedded in the program ("http-3000") is also supplied, that wins over this index.
  - `target_path` — Landing path served for root requests, with its own query. With allow_path_override true, requests carrying their own path are forwarded as-sent (never a prefix); with false, it is the only path served. Set to null to remove it.
  - `allow_path_override` — When false, only the root, or target_path itself, is served, as target_path; other paths 404, and target_path's own parameters cannot be overridden. When true, a request that carries its own path is forwarded as sent.
  - `expires_at` — Expiration date (ISO string, Unix timestamp seconds/ms, or null to remove expiration)
  - `enabled` — Whether the alias is enabled

### `proxy.containerPermissions` (13) — Proxy Permissions Container

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a container group | `H:if-match*` |
| `DELETE /api/v1/containers/{id}/proxy/permissions` | Delete container proxy permissions | `H:if-match*` |
| `DELETE /api/v1/containers/{id}/proxy/permissions/groups/{groupName}` | Remove container authentication group | `H:if-match*` |
| `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a container group | `H:if-match*` |
| `PATCH /api/v1/containers/{id}/proxy/permissions/state` | Update container proxy enable state | `H:if-match*` `body*` |
| `GET /api/v1/containers/{id}/proxy/permissions` | Get container proxy permissions |  |
| `PUT /api/v1/containers/{id}/proxy/permissions` | Replace container proxy permissions JSON | `H:if-match*` `body*` |
| `PATCH /api/v1/containers/{id}/proxy/permissions/default` | Update container default proxy permission policy | `H:if-match*` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Set container group program permission | `H:if-match*` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (container) | `H:if-match*` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (container) | `H:if-match*` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (container) | `H:if-match*` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (container) | `H:if-match*` `body*` |

**Param notes:**

- `groupName` — Group name _(on `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}`, `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}`)_
- `if-match` — file:v<N> ETag precondition — read current file_version from GET first
- `groupName` — Group name to remove _(on `DELETE /api/v1/containers/{id}/proxy/permissions/groups/{groupName}`)_
- `program` — Program name (e.g., http, ssh, files)

**Body shapes:**

- `PATCH /api/v1/containers/{id}/proxy/permissions/state` body — `{ enable_proxy*: bool }`
  - `enable_proxy` — Enable or disable the proxy entirely
- `PUT /api/v1/containers/{id}/proxy/permissions` body — `{ project*: string, container*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: "user"[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool, hooks: { [key: string]: { match*: object, script*: object, timeout: int }[] } }`
  - `project` — Project ID owning this container
  - `container` — Container ID (must match path :id)
  - `groups` — Authentication groups. Key is group name, value is group config.
  - `permissions` — Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists.
  - `default` — Defaults to deny if omitted
  - `enable_proxy` — Enable or disable the proxy. Defaults to true.
  - `hooks` — Per-service proxy hooks. Keys are service names; values are first-match-wins arrays of { match, script, timeout? } rules. Max 8 per service, 32 per container in total. Reserved services (such as logs, egress and cdp) are rejected.
- `PATCH /api/v1/containers/{id}/proxy/permissions/default` body — `{ default*: "allow" | "deny" }`
  - `default` — Default access policy for unmatched requests
- `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` body — `{ program*: string, access*: bool | number | number[] | string | "*" }`
  - `program` — Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
  - `access` — Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. …
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` body — `{ range*: string }`
  - `range` — IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` body — `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`
  - `secret` — JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
  - `algorithm` — JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys.
  - `sources` — Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" ("param:Name" is no longer accepted)
  - `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` body — `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`
  - `username` — Username for authentication. Must match exactly what the client provides.
  - `password` — Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
  - `algorithm` — Hashing algorithm used for password verification. Currently only SHA256 is supported.
  - `salt` — Salt used for password hashing. Should be unique per user/group for security.
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` body — `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }` — Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.

### `proxy.groups` (1) — Proxy Discovery

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/containers/{id}/proxy/groups` | List container proxy groups |  |

### `proxy.hooks` (8) — Proxy Hooks

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/containers/{id}/proxy/hooks/{service}` | Clear all hooks for a service | `H:if-match*` |
| `POST /api/v1/containers/{id}/proxy/hooks/{service}` | Append or insert a new hook | `H:if-match*` `body*` |
| `DELETE /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Remove a hook | `H:if-match*` |
| `GET /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Get a single hook by id |  |
| `GET /api/v1/containers/{id}/proxy/hooks` | List all proxy hooks for a container |  |
| `GET /api/v1/containers/{id}/proxy/hooks/{service}` | List hooks for a specific service |  |
| `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` | Move a hook to a new position | `H:if-match*` `body*` |
| `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Replace a hook in place | `H:if-match*` `body*` |

**Param notes:**

- `service` — Service name
- `if-match` — file:v<N> ETag precondition
- `hookId` — 26-char Crockford base32 ULID (lowercase)

**Body shapes:**

- `POST /api/v1/containers/{id}/proxy/hooks/{service}` body — `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`
  - `position` — 0-indexed insertion position (POST only)
- `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` body — `{ position*: int }`
- `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` body — `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`

### `proxy.projectPermissions` (13) — Proxy Permissions Project

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a project group | `H:if-match*` |
| `DELETE /api/v1/projects/{id}/proxy/permissions` | Delete project proxy permissions | `H:if-match*` |
| `DELETE /api/v1/projects/{id}/proxy/permissions/groups/{groupName}` | Remove project authentication group | `H:if-match*` |
| `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a project group | `H:if-match*` |
| `PATCH /api/v1/projects/{id}/proxy/permissions/state` | Update project proxy enable state | `H:if-match*` `body*` |
| `GET /api/v1/projects/{id}/proxy/permissions` | Get project proxy permissions |  |
| `PUT /api/v1/projects/{id}/proxy/permissions` | Replace project proxy permissions JSON | `H:if-match*` `body*` |
| `PATCH /api/v1/projects/{id}/proxy/permissions/default` | Update project default proxy permission policy | `H:if-match*` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Set project group program permission | `H:if-match*` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (project) | `H:if-match*` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (project) | `H:if-match*` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (project) | `H:if-match*` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (project) | `H:if-match*` `body*` |

**Param notes:**

- `groupName` — Group name _(on `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}`, `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}`)_
- `if-match` — file:v<N> ETag precondition — read current file_version from GET first
- `groupName` — Group name to remove _(on `DELETE /api/v1/projects/{id}/proxy/permissions/groups/{groupName}`)_
- `program` — Program name (e.g., http, ssh, files)

**Body shapes:**

- `PATCH /api/v1/projects/{id}/proxy/permissions/state` body — `{ enable_proxy*: bool }`
  - `enable_proxy` — Enable or disable the proxy entirely
- `PUT /api/v1/projects/{id}/proxy/permissions` body — `{ project*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: "user"[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool, hooks: object }`
  - `project` — Project ID (must match path :id)
  - `groups` — Authentication groups. Key is group name (^[A-Za-z0-9_-]{1,50}$), value is group config.
  - `permissions` — Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists.
  - `default` — Default access policy when no rules match (defaults to "deny" if omitted)
  - `enable_proxy` — Enable or disable the proxy. Defaults to true.
  - `hooks` — Not accepted: hooks are container-level only. A project document that carries this field is refused with 422; set hooks on each container instead.
- `PATCH /api/v1/projects/{id}/proxy/permissions/default` body — `{ default*: "allow" | "deny" }`
  - `default` — Default access policy for unmatched requests
- `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` body — `{ program*: string, access*: bool | number | number[] | string | "*" }`
  - `program` — Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
  - `access` — Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. …
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` body — `{ range*: string }`
  - `range` — IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` body — `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`
  - `secret` — JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
  - `algorithm` — JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys.
  - `sources` — Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" ("param:Name" is no longer accepted)
  - `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` body — `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`
  - `username` — Username for authentication. Must match exactly what the client provides.
  - `password` — Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
  - `algorithm` — Hashing algorithm used for password verification. Currently only SHA256 is supported.
  - `salt` — Salt used for password hashing. Should be unique per user/group for security.
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` body — `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }` — Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.

### `proxy.services` (2) — Proxy Discovery

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/containers/{id}/proxy/services/{service}` | Get merged proxy view for a service |  |
| `GET /api/v1/containers/{id}/proxy/services` | List services referenced in proxy config |  |

**Param notes:**

- `service` — Service name

### `proxy.settings` (2) — Proxy Discovery

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/containers/{id}/proxy/settings` | Get container proxy root settings |  |
| `PUT /api/v1/containers/{id}/proxy/settings` | Update container proxy root settings | `H:if-match*` `body*` |

**Param notes:**

- `if-match` — file:v<N> ETag precondition

**Body shapes:**

- `PUT /api/v1/containers/{id}/proxy/settings` body — `{ enable_proxy: bool, default: "allow" | "deny" }`

### `realms` (1) — Realms

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/realms/` | List your realm IDs | `?include_usage` |

**Param notes:**

- `include_usage` — Include resource counts per realm_id (projects, containers, servers, auth_tokens). Adds "usage" object to response data.

### `servers` (7) — Rentals

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/rentals/{id}/extend` | Extend rental | `body*` |
| `GET /api/v1/rentals/{id}` | Get rental details |  |
| `GET /api/v1/rentals/{id}/runtime` | Get live runtime info for a rented server or subserver |  |
| `GET /api/v1/rentals` | List user rentals |  |
| `GET /api/v1/servers/available` | Browse rental marketplace | `?country` `?region` `?max_price_per_day` `?available_durations` `?min_cpu_cores` `?min_cpu_score` `?cpu_score_type` `?min_ram_gb` `?ram_types` `?min_total_storage_gb` `?disk_types` `?min_bandwidth_mbps` `?min_traffic_tb` `?unlimited_traffic_only` `?category` `?featured_only` |
| `GET /api/v1/auth/available-regions` | Get available server regions |  |
| `POST /api/v1/servers/{id}/rent` | Rent server | `body*` |

**Param notes:**

- `country` — Filter by country code (e.g., US, DE)
- `region` — Filter by region (e.g., us-east, eu-central)
- `max_price_per_day` — Maximum price per day in USD
- `available_durations` — Filter servers that support these rental durations (days)
- `min_cpu_cores` — Minimum CPU cores
- `min_cpu_score` — Minimum CPU benchmark score
- `cpu_score_type` — CPU benchmark type for score filtering
- `min_ram_gb` — Minimum RAM in GB
- `ram_types` — Filter by RAM types
- `min_total_storage_gb` — Minimum total storage in GB
- `disk_types` — Filter servers with these disk types
- `min_bandwidth_mbps` — Minimum network bandwidth in Mbps
- `min_traffic_tb` — Minimum monthly traffic allowance in TB
- `unlimited_traffic_only` — Show only servers with unlimited traffic
- `category` — Filter by server category
- `featured_only` — Show only featured servers

**Body shapes:**

- `POST /api/v1/rentals/{id}/extend` body — `{ expected_rental_end*: string, additional_days*: int, max_charge_cents: int }`
  - `expected_rental_end` — The rental's CURRENT rental_end, exactly as the API returned it. The extension is applied only if it still matches, so a retried request — a lost response, a double click — is refused with 409 EXTENSION_ALREADY_APPLIED instead of charging and extending a second time. …
  - `additional_days` — Number of additional days to extend the rental (must match server pricing durations, max 3650)
  - `max_charge_cents` — The total you confirmed, in whole cents. The extension is refused if it would cost more. REQUIRED when the rental has no frozen renewal price (409 CHARGE_CONFIRMATION_REQUIRED) — without a quoted ceiling nothing bounds what the current server tiers can charge. …
- `POST /api/v1/servers/{id}/rent` body — `{ pool_id: string, rental_days*: int, max_charge_cents: int }`
  - `rental_days` — Number of days to rent (must match server pricing durations, max 3650)
  - `max_charge_cents` — … REQUIRED for every paid rental. Omitting it returns 409 CHARGE_CONFIRMATION_REQUIRED, or 409 SETUP_FEE_CONFIRMATION_REQUIRED when the server also carries a one-time fee. … If the live total exceeds this ceiling the request is rejected with 409 CHARGE_EXCEEDS_MAX and nothing is charged; re-read the server and confirm the new total. …

### `servers.commands` (2) — Server Commands

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/servers/{serverId}/available-commands` | Get available commands | `?category` `?risk_level` |
| `POST /api/v1/servers/{serverId}/execute-command` | Execute server command | `body*` |

**Param notes:**

- `category` — Filter by command category
- `risk_level` — Filter by maximum risk level

**Body shapes:**

- `POST /api/v1/servers/{serverId}/execute-command` body — `{ command_id: string, command_slug: string, parameters: object, wait: bool=true, timeout: number, confirmation_token: string } (exactly one of: command_id | command_slug required)`
  - `command_id` — Command ID to execute (one of command_id or command_slug required)
  - `command_slug` — Command slug to execute (one of command_id or command_slug required)
  - `parameters` — Parameters for command template processing
  - `wait` — Wait for command completion before returning
  - `timeout` — Command timeout in seconds (cannot exceed command max_timeout)
  - `confirmation_token` — Confirmation token for high-risk commands

### `servers.jobs` (1) — Subserver Subscriptions

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/subserver-operations/{id}` | Status of a paid subserver operation |  |

### `servers.offers` (2) — Server Rental

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/offers` | Browse machines available to order |  |
| `POST /api/v1/offers/{id}/reserve` | Reserve an offer (charges immediately) | `body*` |

**Body shapes:**

- `POST /api/v1/offers/{id}/reserve` body — `{ days*: number, max_charge_cents: number, idempotency_key*: string, pool_id: string }`
  - `days` — Must be one of the offer's pricing_rules keys.
  - `max_charge_cents` — Ceiling on the TOTAL debit (rent + any one-time setup fee). REQUIRED for every paid reservation, not only ones carrying a setup fee. … If you get a 409, that error's data carries the authoritative total_cents for the duration you asked for.
  - `idempotency_key` — Caller-generated. Replaying it returns the original reservation, unpaid twice.
  - `pool_id` — Must be a pool you own. Defaults to your default pool.

### `servers.plans` (2) — Subserver Plans

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/subserver-plans` | List subserver plans available to you | `?locale` |
| `GET /api/v1/subserver-subscriptions/quote` | Quote a paid subserver purchase | `?plan_id*` |

**Param notes:**

- `locale` — Language tag such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en.

### `servers.reservations` (2) — Server Rental

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/reservations/{id}` | One of your reservations |  |
| `GET /api/v1/reservations` | Your reservations | `?limit` `?offset` |

### `servers.subscriptions` (8) — Subserver Subscriptions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/subserver-subscriptions` | Buy a paid subserver (charges immediately) | `body*` |
| `POST /api/v1/subserver-subscriptions/{id}/cancel` | Cancel a paid subserver subscription |  |
| `PUT /api/v1/subserver-subscriptions/{id}/auto-renew` | Turn auto-renew on or off |  |
| `GET /api/v1/subserver-subscriptions/{id}` | One of your paid subserver subscriptions | `?locale` |
| `GET /api/v1/subserver-subscriptions` | List your paid subserver subscriptions | `?limit` `?offset` `?locale` |
| `POST /api/v1/subserver-subscriptions/{id}/pay` | Pay a held subscription and resume it (charges one month) | `body*` |
| `GET /api/v1/subserver-subscriptions/{id}/quote` | Quote an upgrade or a payment | `?action*` `?plan_id` |
| `POST /api/v1/subserver-subscriptions/{id}/upgrade` | Upgrade a paid subserver (charges the difference) | `body*` |

**Param notes:**

- `locale` — Language tag for plan.title and plan.type_label, such as en, fr or pt-BR. Overrides Accept-Language. Unknown or invalid values are served as en.

**Body shapes:**

- `POST /api/v1/subserver-subscriptions` body — `{ plan_id*: string, idempotency_key*: string, max_charge_cents: int }`
  - `plan_id` — Plan version id from GET /subserver-plans.
  - `idempotency_key` — Caller-generated. Replaying it returns the original operation, charged once. A refused request's key stays refused (the same error every time): use a new key to try again.
  - `max_charge_cents` — Ceiling on the debit, from the quote. Required whenever the charge is above 0.
- `POST /api/v1/subserver-subscriptions/{id}/pay` body — `{ idempotency_key*: string, max_charge_cents: int }`
- `POST /api/v1/subserver-subscriptions/{id}/upgrade` body — `{ plan_id*: string, idempotency_key*: string, max_charge_cents: int }`

### `snapshots` (5) — Containers

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/snapshots` | Create container snapshot | `body*` |
| `DELETE /api/v1/containers/{id}/snapshots/{name}` | Delete container snapshot |  |
| `GET /api/v1/containers/{id}/snapshots` | Get container snapshots |  |
| `PUT /api/v1/containers/{id}/snapshots/{name}` | Restore container from snapshot |  |
| `PUT /api/v1/containers/{id}/snapshots/{name}/alias` | Update snapshot alias | `body*` |

**Param notes:**

- `name` — The snapshot's canonical name as returned by the list endpoint. For a snapshot created with an alias this is the sanitized alias (letters, digits, underscore, hyphen; leading and trailing hyphens and underscores stripped; at most 64 characters); without an alias — or when sanitization leaves nothing — a timestamped snap-YYYYMMDD-HHMMSS.

**Body shapes:**

- `POST /api/v1/containers/{id}/snapshots` body — `{ alias: string, expiry: int }`
  - `alias` — … It is kept as the alias and also becomes the snapshot name after sanitizing (letters, digits, underscore and hyphen kept; leading and trailing hyphens and underscores stripped; at most 64 characters). A sanitized name shorter than 2 characters is refused with 400.
  - `expiry` — Expiry in days (1–3650). Values outside this range are rejected before the snapshot is created.
- `PUT /api/v1/containers/{id}/snapshots/{name}/alias` body — `{ alias*: string|null }`
  - `alias` — New alias for the snapshot (set to null to remove alias)

### `storage.shares` (9) — Storage Shares

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/storage/shares` | Create storage share | `body*` |
| `DELETE /api/v1/storage/shares/{shareId}` | Delete storage share |  |
| `GET /api/v1/containers/{id}/storage/shares/{shareId}` | Get storage share |  |
| `GET /api/v1/storage/shares` | List all your storage shares | `?realm_id` |
| `GET /api/v1/containers/{id}/storage/shares` | List storage shares | `?target_type` `?label` `?status` `?enabled` `?include_expired` `?realm_id` |
| `GET /api/v1/storage/incoming` | Get all incoming shares | `?realm_id` |
| `GET /api/v1/containers/{id}/storage/incoming` | Get incoming shares |  |
| `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount` | Toggle incoming share mount |  |
| `PATCH /api/v1/containers/{id}/storage/shares/{shareId}` | Update storage share | `body*` |

**Param notes:**

- `realm_id` — Filter by realm ID. Alternative to using realm subdomain in URL.
- `target_type` — Filter by target type
- `label` — Filter by label
- `status` — Filter by status
- `enabled` — Filter by enabled status
- `include_expired` — Include expired shares (default: false)

**Body shapes:**

- `POST /api/v1/containers/{id}/storage/shares` body — `{ source_path*: string, target_container_id: string, target_project_id: string, mode*: "readonly" | "readwrite", alias: string, label: string, description: string, enabled: bool, expires_at: number }`
  - `source_path` — Absolute path in the source container. … The path is normalized; system paths (/proc/*, /sys/*, /dev/*, /boot/*, /run/*, /var/run/*), path traversal (..) and null bytes are refused. …
  - `target_container_id` — 1:1 Container Share: Share with a specific container. Specify this OR target_project_id, not both.
  - `target_project_id` — Project-Wide Share: Share with all containers in a project. Auto-mounts on all current and future containers. Specify this OR target_container_id, not both.
  - `mode` — Mount mode - readonly (read-only) or readwrite (read-write)
  - `alias` — Optional alias (lowercase alphanumeric with hyphens/underscores)
  - `label` — Optional label for organizing shares
  - `description` — Optional description
  - `enabled` — Whether to enable the share (default: true). Disabled shares are kept but not mounted.
  - `expires_at` — Unix timestamp (seconds) when share should expire
- `PATCH /api/v1/containers/{id}/storage/shares/{shareId}` body — `{ mode: "readonly" | "readwrite", alias: string|null, label: string|null, description: string|null, enabled: bool, expires_at: number|null }`
  - `mode` — Mount mode
  - `alias` — Alias (null to remove)
  - `label` — Label (null to remove)
  - `description` — Description (null to remove)
  - `enabled` — Enable or disable the share
  - `expires_at` — Unix timestamp (seconds) when share expires (null to never expire)

### `users` (7) — Users

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/users/me/onboarding` | Mark an onboarding milestone as completed | `body*` |
| `GET /api/v1/users/{id}` | Get user by ID |  |
| `GET /api/v1/users/me/free-tier-status` | Get free-tier claim status |  |
| `GET /api/v1/users/me/security-history` | Get your account security history | `?page` `?limit` `?include_failed` `?include_security` |
| `POST /api/v1/users/me/redeem-invite` | Redeem a beta invite code | `body*` |
| `POST /api/v1/users/me/retry-setup` | Retry free-tier account setup | `body*` |
| `PUT /api/v1/users/{id}` | Update user profile | `body*` |

**Param notes:**

- `page` — Page number
- `limit` — Results per page
- `include_failed` — Also return REJECTED sign-in attempts against this account. Opt-in: mixing them in by default would make failed attempts look like your own sessions.
- `include_security` — Also return other account-security events already recorded for you: logout, 2FA enabled/disabled, OTP verification outcomes, backup-code regeneration.

**Body shapes:**

- `POST /api/v1/users/me/onboarding` body — `{ milestone*: string }`
  - `milestone` — Milestone key, e.g. "hub_tour_v1".
- `POST /api/v1/users/me/redeem-invite` body — `{ code*: string }`
  - `code` — The invite code (case/format-insensitive).
- `POST /api/v1/users/me/retry-setup` body — `{ region: string }`
  - `region` — Optional preferred region override
- `PUT /api/v1/users/{id}` body — `{ alias: string, public_key: string, password: string, current_password: string }`
  - `alias` — New display name/alias
  - `public_key` — ED25519 public key (exactly 64 hexadecimal characters). Used for cryptographic identity and verification.
  - `password` — New password. Must be at least 12 characters, at most 72 UTF-8 bytes, 3 of 4 character classes. Requires current_password for verification.
  - `current_password` — Current password (REQUIRED when setting new password for verification)

### `vault` (6) — User Vault

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/vault` | Clear entire vault | `?realm_id` |
| `DELETE /api/v1/vault/keys/{key}` | Delete vault key | `?realm_id` |
| `GET /api/v1/vault/keys/{key}` | Get vault key | `?realm_id` |
| `GET /api/v1/vault/stats` | Get vault statistics | `?realm_id` |
| `GET /api/v1/vault/keys` | List vault keys | `?realm_id` |
| `PUT /api/v1/vault/keys/{key}` | Set vault key | `?realm_id` `body*` |

**Param notes:**

- `realm_id` — Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase.
- `key` — Vault key name (alphanumeric, dots, underscores, hyphens)

**Body shapes:**

- `PUT /api/v1/vault/keys/{key}` body — `{ value*: string, metadata: object|null }`
  - `value` — Value to store. Can be any UTF-8 string: JSON, encrypted data, plain text, etc. The API does NOT validate or verify the content - encryption is highly recommended for sensitive data such as secrets, passwords, or API keys.
  - `metadata` — Optional JSON metadata (max 256KB). Useful for file uploads to store content-type, filename, upload date, etc. Must be valid JSON or null. …

### `wallet` (26) — Wallet

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/wallet/github-bonus/claim` | Claim the GitHub connection bonus |  |
| `POST /api/v1/wallet/payments/crypto/invoice` | Start a crypto payment (hosted invoice) | `body*` |
| `POST /api/v1/wallet/invoices/generate/{id}` | Generate invoice for transaction |  |
| `POST /api/v1/wallet/payment-methods/` | Add a new payment method | `body*` |
| `POST /api/v1/wallet/payments/stripe/checkout` | Start a card payment (Stripe Checkout) | `body*` |
| `DELETE /api/v1/wallet/payment-methods/{id}` | Delete a payment method |  |
| `GET /api/v1/wallet/invoices/{id}/pdf` | Download invoice PDF |  |
| `GET /api/v1/wallet/balances/general` | Get general balance only |  |
| `GET /api/v1/wallet/balances` | Get aggregate balances (general + AI) |  |
| `GET /api/v1/wallet/balances/ai` | Get AI balance (limit, usage, remaining) |  |
| `GET /api/v1/wallet/payments/crypto/intents/{id}` | Get a crypto payment intent |  |
| `GET /api/v1/wallet/github-bonus` | Get GitHub connection bonus status |  |
| `GET /api/v1/wallet/invoices/{id}` | Get invoice by ID |  |
| `GET /api/v1/wallet/payment-availability` | Get top-up payment availability (providers, bounds, AI transfer fee) |  |
| `GET /api/v1/wallet/payment-methods/{id}` | Get payment method by ID |  |
| `GET /api/v1/wallet/payments/stripe/intents/{id}` | Get a card payment intent |  |
| `GET /api/v1/wallet/transactions/{id}` | Get transaction by ID |  |
| `GET /api/v1/wallet/ai-fee-history` | Get AI credit fee history | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/wallet/payments/crypto/intents` | List crypto payment intents | `?limit` `?offset` |
| `GET /api/v1/wallet/invoices/` | Get all invoices | `?page` `?limit` `?sort_by` `?sort_order` `?filter` |
| `GET /api/v1/wallet/payment-methods/` | Get all payment methods | `?page` `?limit` |
| `GET /api/v1/wallet/payments/stripe/intents` | List card payment intents | `?limit` `?offset` |
| `GET /api/v1/wallet/transactions` | List transactions | `?page` `?limit` `?sort_by` `?sort_order` `?filter` |
| `PUT /api/v1/wallet/payment-methods/{id}/default` | Set a payment method as default |  |
| `POST /api/v1/wallet/transfers` | Transfer from general balance to AI credits | `body*` |
| `PUT /api/v1/wallet/payment-methods/{id}` | Update a payment method | `body*` |

**Param notes:**

- `page` — Page number for pagination - starts from 1 _(on `GET /api/v1/wallet/invoices/`)_
- `limit` — Number of invoices to return per page - maximum 100 _(on `GET /api/v1/wallet/invoices/`)_
- `sort_by` — Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at.
- `filter` — JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400. _(on `GET /api/v1/wallet/invoices/`)_
- `page` — Page number, starting from 1. _(on `GET /api/v1/wallet/payment-methods/`, `GET /api/v1/wallet/transactions`)_
- `limit` — Results per page. _(on `GET /api/v1/wallet/payment-methods/`)_
- `filter` — Optional JSON object of field filters, e.g. `{"status":"completed"}` or `{"amount":{"gte":10}}`. A plain value matches exactly; an object applies operators `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like` (case-insensitive substring; `%` and `_` in the value are wildcards) and `in` (array, at most 100 values). Fields: `transaction_type`, `status`, `amount`, `currency`, `reason`, `created_at`, `updated_at`. Any other field or operator, a value that is not a string, number, boolean or null, or a `filter` that is not a JSON object is rejected with 400. _(on `GET /api/v1/wallet/transactions`)_

**Body shapes:**

- `POST /api/v1/wallet/payments/crypto/invoice` body — `{ amount*: string, idempotency_key: string }`
  - `amount` — USD amount as a strict decimal string (e.g., "25" or "25.00")
  - `idempotency_key` — Optional caller idempotency key (must contain a non-whitespace character); repeats return the original intent
- `POST /api/v1/wallet/payment-methods/` body — `{ type*: "credit_card" | "paypal" | "bank_transfer" | "crypto", name*: string, details: object, is_default: bool }`
  - `name` — Display name, at most 100 characters.
  - `details` — Provider references and masked fragments only (never a full card number or CVV). At most 4096 bytes as JSON.
- `POST /api/v1/wallet/payments/stripe/checkout` body — `{ amount*: string, idempotency_key: string }`
- `POST /api/v1/wallet/transfers` body — `{ amount*: string, idempotency_key: string, expected_fee_bps: int }`
  - `amount` — USD amount as a string with up to 2 decimals, e.g., "10.00". No exponent, no negatives.
  - `idempotency_key` — Optional caller idempotency key. Retrying with the SAME key AND same amount returns the original receipt without moving funds again; the same key with a different amount is rejected (409 TRANSFER_IDEMPOTENCY_KEY_REUSED). Recommended for the UI to make a double-click / retry-after-timeout safe.
  - `expected_fee_bps` — Optional: the platform fee (basis points) the client displayed at confirmation. If it no longer matches the current server fee, the transfer is rejected (409 TRANSFER_FEE_CHANGED) so the user re-confirms — so an irreversible transfer can never be charged a fee the user was not shown.
- `PUT /api/v1/wallet/payment-methods/{id}` body — `{ name: string, details: object, status: "active" | "inactive", is_default: bool }`

