> _**HTTP skill · `api` namespace** · ~22,846 tokens · hoody-sdk v1.0.0-beta.11_

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
- 2FA mutations have varying auth: `POST /api/v1/users/auth/2fa/setup` needs password only; `POST /api/v1/users/auth/2fa/verify-setup` needs OTP code only; `POST /api/v1/users/auth/2fa/verify` needs `temp_token` + code; `DELETE /api/v1/users/auth/2fa` needs password + OTP **or** backup code; `POST /api/v1/users/auth/2fa/backup-codes/regenerate` needs password + a **6-digit TOTP only** (`^\\d{6}$` — backup codes are rejected with 400).
- Project/container writes: project owner or matching permission row.
- Billing writes: registered payment method.

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
5. `PUT /api/v1/users/auth/2fa/token-gate`

### 4. Create first project + container

Read kit URLs by getting the container with `include_proxy_domains` set to `true` (`GET /api/v1/containers/{id}`) — the `proxy_domains` array is only populated when `include_proxy_domains` is passed.
1. `GET /api/v1/realms/`
2. `GET /api/v1/images/user`
3. `POST /api/v1/projects/`
4. `POST /api/v1/projects/{id}/containers`
5. `POST /api/v1/containers/{id}/{operation}`
6. `GET /api/v1/containers/{id}`

### 5. Grant another user access

Project-scope analogues live under `* /api/v1/projects/{id}/proxy/permissions*`.
1. `GET /api/v1/projects/{id}/permissions`
2. `POST /api/v1/projects/{id}/permissions`
3. `PUT /api/v1/projects/{id}/permissions/{permissionId}`
4. `DELETE /api/v1/projects/{id}/permissions/{permissionId}`
5. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password`
6. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token`
7. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt`
8. `PATCH /api/v1/containers/{id}/proxy/permissions/state`

### 6. Container exposure & shares

1. `PUT /api/v1/containers/{id}/network`
2. `POST /api/v1/containers/{id}/network/start`
3. `POST /api/v1/containers/{id}/firewall/egress`
4. `POST /api/v1/containers/{id}/firewall/ingress`
5. `POST /api/v1/proxy/aliases`
6. `PATCH /api/v1/proxy/aliases/{id}/state`
7. `POST /api/v1/containers/{id}/storage/shares`
8. `GET /api/v1/containers/{id}/storage/incoming` (container-scoped)
9. `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount`
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
10. `PUT /api/v1/containers/{id}/kvm` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `POST /api/v1/projects/{id}/containers`.

### 8. Billing: wallet → rent

1. `POST /api/v1/wallet/payment-methods/`
2. `PUT /api/v1/wallet/payment-methods/{id}/default`
3. `POST /api/v1/wallet/payments/stripe/checkout` (crypto: `POST /api/v1/wallet/payments/crypto/invoice`)
4. `GET /api/v1/wallet/payments/stripe/intents/{id}` (crypto: `GET /api/v1/wallet/payments/crypto/intents/{id}`)
5. `GET /api/v1/wallet/balances`
6. `POST /api/v1/wallet/transfers`
7. `GET /api/v1/wallet/transactions`
8. `GET /api/v1/servers/available`
9. `POST /api/v1/servers/{id}/rent`
10. `GET /api/v1/rentals`
11. `POST /api/v1/rentals/{id}/extend`
12. `POST /api/v1/servers/{serverId}/execute-command`

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `POST /api/v1/users/auth/logout` is a logout-ALL for JWTs — it bumps `session_generation`, invalidating every access + refresh JWT issued before that moment (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `DELETE /api/v1/auth/tokens/{id}`). `POST /api/v1/users/auth/refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header — the generated SDK / CLI auto-refresh only send the body, so the typed call typically 401s; for headless flows mint a long-lived `POST /api/v1/auth/tokens` instead, or call refresh manually with both the body and the header set to the same refresh token.
- `GET /api/v1/auth/available-regions` returns `r.data.regions` (single-wrapped, like every other endpoint — older docs incorrectly called it doubly-wrapped).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user, the controller silently overwrites the password and re-sends the verification email; for a verified user it's a no-op. Do NOT probe with this.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — like every other kit it accepts the bare per-container kit URL directly, with no auth headers. The `POST /api/v1/containers/{id}/authorize` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- Auth tokens rejected on admin endpoints (JWT only); `x-impersonate-user` JWT only.
- `POST /api/v1/containers/{id}/{operation}` polymorphic: `POST /api/v1/containers/{id}/{operation}` from `ContainerOperation` enum (not body field).
- No admin concept on user-owned resources; permission row IS the authorization.
- Kit URL `<projectId>-<containerId>-<kit>-1.<server>.containers.hoody.com` IS the credential; watch containerId leakage.
- `GET /api/v1/containers/{id}/proxy/services` returns `services: []` often; pass `program: 'exec'` to `POST /api/v1/proxy/aliases`.
- `GET /api/v1/wallet/invoices/` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `GET /api/v1/ip` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `GET /api/v1/containers/{id}/storage/incoming` is container-scoped; pass `containerId`.
- `POST /api/v1/auth/verify-email` body has `token` + optional `response_mode` + `code_challenge` only — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `POST /api/v1/users/auth/2fa/verify`.
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

### `authTokens` (12) — Auth Tokens

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
- `POST /api/v1/auth/tokens/{id}/copy` body — `{ alias: string, expires_at: string | "today" | "tomorrow" | number | null, otp_code: string }`
  - `alias` — Optional alias for the copied token. If omitted, a deterministic alias like "<source> copy" is generated.
  - `expires_at` — Optional expiration override for the copied token. If omitted, source expiration is copied when still in the future.
- `POST /api/v1/auth/tokens` body — `{ alias: string, public_key: string | null, public_storage: object | null, ip_whitelist: string[] | string, permission_template: string, permissions: { containers: object, projects: object, financial: object, resources: object, admin: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, deny_reauthorization: bool, expires_at: string | "today" | "tomorrow" | number, otp_code: string }`
  - `alias` — User-friendly alias for the token. If not provided, a random animal name will be generated (e.g., "clever-dolphin").
  - `public_key` — Optional ED25519 public key used for client identity derivation
  - `public_storage` — Public JSON profile storage attached to the token public_key (max 64KB)
  - `ip_whitelist` — IP whitelist for this token. Accepts an array of IPv4 addresses/CIDR ranges, a comma-separated string, or "*" wildcard. Defaults to "*" (allow all) if not provided.
  - `permission_template` — Optional permission template to apply. If provided, it takes precedence over `permissions`. Templates: full_access, external_customer, dev_team, finance_team, read_only.
  - `permissions` — Fine-grained permissions for this token. Any missing permission path defaults to false (deny).
  - `realm_ids` — List of realm IDs this token is restricted to. If provided, the token can ONLY be used on these specific realm subdomains.
  - `allow_no_realm` — Whether this token can be used without a realm scope (e.g. on base domain). Defaults to true (server-side). Set to false to create a strict sub-account token that ONLY works on specific realms.
  - `vault_access` — Whether this token can access user vault endpoints. Defaults to false (server-side) for security.
  - `event_access` — Whether this token can access real-time event streams and event history endpoints. Defaults to true (server-side).
  - `deny_reauthorization` — Opt-in least-privilege belt for scoped/script tokens. When true, the server strips the `resources.create_tokens` and `resources.vault` permission leaves from the resolved token, forces `vault_access` to false, and forces a bounded (non-permanent) expiry — producing a locked-down leaf that can never…
  - `expires_at` — Token expiration. Can be an ISO string, Unix timestamp, "today", or "tomorrow". If not provided, the token never expires.
- `POST /api/v1/auth/tokens/{id}/remove-realm` body — `{ realm_id*: string, otp_code: string }`
  - `realm_id` — Realm ID to remove from the token
- `PUT /api/v1/auth/tokens/{id}` body — `{ alias: string, public_key: string | null, public_storage: object | null, ip_whitelist: string[] | string, permissions: { containers: object, projects: object, financial: object, resources: object, admin: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, expires_at: string | "today" | "tomorrow" | number | null, is_enabled: bool, otp_code: string }`
  - `alias` — User-friendly alias for the token
  - `realm_ids` — List of realm IDs this token is restricted to
  - `allow_no_realm` — Whether this token can be used without a realm scope
  - `vault_access` — Whether this token can access user vault endpoints
  - `event_access` — Whether this token can access real-time event streams and event history endpoints
  - `expires_at` — Token expiration. Can be an ISO string, Unix timestamp, "today", "tomorrow", or null.
  - `is_enabled` — Enable or disable the token
- `PUT /api/v1/auth/tokens/me/public-profile` body — `{ public_key: string | null, public_storage: object | null } (at least one of: public_key | public_storage required)`

### `authentication` (28) — Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/users/auth/identity-claim` | Issue a fresh audience-bound identity claim | `body*` |
| `POST /api/v1/auth/forgot-password` | Request password reset | `body*` |
| `GET /api/v1/auth/available-regions` | Get available server regions |  |
| `GET /api/v1/users/auth/me` | Get current user profile |  |
| `GET /api/v1/users/me` | Get current user profile (alias of /users/auth/me) |  |
| `GET /api/v1/auth/config` | Get the public sign-in configuration |  |
| `GET /api/v1/auth/github/callback` | GitHub OAuth callback | `?code` `?state*` `?error` `?error_description` `?error_uri` |
| `GET /api/v1/auth/github` | Redirect to GitHub OAuth | `?client` `?intent` `?redirect_uri*` `?code_challenge*` `?invite_code` |
| `GET /api/v1/auth/google/callback` | Google OAuth callback | `?code` `?state*` `?error` `?error_description` `?error_uri` |
| `GET /api/v1/auth/google` | Redirect to Google OAuth | `?client` `?redirect_uri*` `?code_challenge*` `?invite_code` |
| `POST /api/v1/users/auth/login` | Login with username and password | `body*` |
| `POST /api/v1/users/auth/logout` | Logout |  |
| `POST /api/v1/auth/authorize` | Begin a PKCE OAuth authorization | `body*` |
| `POST /api/v1/auth/intent/cancel` | Cancel a pending OAuth AuthIntent or 2FA temp_token |  |
| `GET /api/v1/auth/device/authorize` | Start the device-leg OAuth (cookie + ticket gated) | `?ticket*` `?provider*` |
| `POST /api/v1/auth/device/code` | Start a device authorization flow (RFC-8628-inspired) | `body*` |
| `POST /api/v1/auth/device/deny` | Refuse the device ('Don't authorize') | `body*` |
| `POST /api/v1/auth/device/login` | Password sign-in for the device authorize step (cookie + ticket gated) | `body*` |
| `POST /api/v1/auth/device/token` | Poll for device-flow tokens (RFC-8628-inspired) | `body*` |
| `POST /api/v1/auth/device/verify_code` | Confirm a device user_code (verification page) | `body*` |
| `POST /api/v1/auth/exchange` | Exchange a PKCE authorization code for tokens | `body*` |
| `POST /api/v1/auth/launch/initiate` | Initiate OAuth popup-handoff launch | `body*` |
| `GET /api/v1/auth/launch/start` | Start OAuth popup-handoff via single-use ticket | `?ticket*` |
| `POST /api/v1/users/auth/refresh` | Refresh access token | `body*` |
| `POST /api/v1/auth/resend-verification` | Resend verification email | `body*` |
| `POST /api/v1/auth/reset-password` | Reset password | `body*` |
| `POST /api/v1/auth/signup` | Sign up with email and password | `body*` |
| `POST /api/v1/auth/verify-email` | Verify email address | `body*` |

**Param notes:**

- `error` — Provider-side failure code (e.g. access_denied). Present instead of `code` when the user declines.
- `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Folded into the signed OAuth state so it survives the provider round trip. Unrecognised values are recorded as "unknown".
- `intent` — OAuth intent: login (default). "star_check" is accepted but ignored (retired).
- `redirect_uri` — Frontend URL to redirect to after OAuth completes (must be on an allowed domain)
- `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier). Required — all OAuth flows must use PKCE post-migration.
- `invite_code` — Optional invite code ("coupon") captured from the signup link. Normalized and hashed at redirect time — only the hash travels in the OAuth state, never the raw code. Memorized hash-only on a NEW account and applied automatically; not validated here.
- `ticket` — One-shot ticket from /launch/initiate response

**Body shapes:**

- `POST /api/v1/users/auth/identity-claim` body — `{ audience*: string, expires_in: int }`
  - `audience` — Consumer identifier this claim is bound to (e.g. your app hostname). Verifiers reject the claim unless they expect exactly this audience. Printable ASCII, no whitespace or double quotes.
  - `expires_in` — Requested claim lifetime in seconds. Clamped to [60, min(server ceiling, remaining JWT lifetime)]. Default: server-configured (1h).
- `POST /api/v1/auth/forgot-password` body — `{ email*: string }`
  - `email` — Email address associated with the account
- `POST /api/v1/users/auth/login` body — `{ username: string, email: string, password*: string, response_mode: "intent" | "tokens", client: string, code_challenge: string } (at least one of: username | email required)`
  - `username` — Username (alphanumeric characters, underscores, and hyphens)
  - `email` — Email address (alternative to username)
  - `password` — Account password. Must be at least 8 characters with uppercase, lowercase, and number.
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange (hosted auth UI only; server forces intent mode for requests from the hosted UI origin with code_challenge).
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects authentication.
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of the code_verifier). Required when response_mode=intent.
- `POST /api/v1/auth/authorize` body — `{ code_challenge*: string, redirect_uri*: string }`
- `POST /api/v1/auth/device/code` body — `{ client_name: string, client: string, code_challenge: string }`
  - `client_name` — Shown on the verification page as "X is requesting access"
  - `code_challenge` — Optional PKCE on the device flow itself; if present the poll REQUIRES the verifier
- `POST /api/v1/auth/device/deny` body — `{ ticket*: string }`
  - `ticket` — device_verify_ticket from /device/verify_code
- `POST /api/v1/auth/device/login` body — `{ ticket*: string, username: string, email: string, password*: string } (at least one of: username | email required)`
  - `username` — Username (alternative to email)
  - `password` — Account password
- `POST /api/v1/auth/device/token` body — `{ device_code*: string, code_verifier: string }`
- `POST /api/v1/auth/device/verify_code` body — `{ user_code*: string }`
  - `user_code` — XXXX-XXXX user code (dashes optional)
- `POST /api/v1/auth/exchange` body — `{ code*: string, code_verifier*: string, redirect_uri*: string }`
- `POST /api/v1/auth/launch/initiate` body — `{ provider*: "github" | "google", client: string, code_challenge*: string, state_id*: string }`
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier, exactly 43 chars)
  - `state_id` — Per-attempt UUID v4 — plumbed through state JWT, cookie name, fragment, message filter
- `POST /api/v1/users/auth/refresh` body — `{ refreshToken*: string }`
  - `refreshToken` — Valid refresh token from previous login/refresh
- `POST /api/v1/auth/resend-verification` body — `{ email*: string }`
  - `email` — Email address to resend verification to
- `POST /api/v1/auth/reset-password` body — `{ token*: string, password*: string }`
  - `token` — Password reset token from the email link
  - `password` — New password (min 12 chars)
- `POST /api/v1/auth/signup` body — `{ email*: string, password*: string, region: string, invite_code: string, client: string }`
  - `email` — Email address for the new account
  - `password` — Password (min 12 chars, must include uppercase, lowercase, number, and special char)
  - `region` — Optional preferred server region (e.g., "eu-west"). If omitted, auto-assigned by GeoIP proximity.
  - `invite_code` — Optional invite code ("coupon") captured from the signup link. Memorized (hash-only) and applied automatically after email verification — not validated at signup.
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects account behaviour.
- `POST /api/v1/auth/verify-email` body — `{ client: string, token*: string, response_mode: "intent" | "tokens", code_challenge: string }`
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects verification.
  - `token` — Verification token from the email link
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange.
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier). Required when response_mode=intent.

### `containers` (23) — Containers

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/authorize` | Authorize Container Access |  |
| `POST /api/v1/containers/{id}/copy` | Copy a container | `body*` |
| `POST /api/v1/projects/{id}/containers` | Create a new container | `body*` |
| `POST /api/v1/containers/{id}/snapshots` | Create container snapshot | `body*` |
| `DELETE /api/v1/containers/{id}` | Delete a container |  |
| `DELETE /api/v1/containers/{id}/snapshots/{name}` | Delete container snapshot |  |
| `GET /api/v1/containers/{id}` | Get a container by ID | `?runtime` `?include_proxy_domains` `?include_proxy_permissions` |
| `GET /api/v1/containers/{id}/network` | Get container network configuration |  |
| `GET /api/v1/containers/{id}/stats` | Get container resource statistics |  |
| `GET /api/v1/containers/{id}/status-logs` | Get status logs for a container | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/containers/` | Get all containers | `?page` `?limit` `?sort_by` `?sort_order` `?realm_id` `?runtime` `?include_proxy_domains` `?include_proxy_permissions` `?include_prespawn` `?include_expired` `?include_deleting` |
| `GET /api/v1/projects/{id}/containers` | Get all containers for a project | `?page` `?limit` `?sort_by` `?sort_order` `?runtime` `?include_proxy_domains` `?include_proxy_permissions` `?include_prespawn` `?include_deleting` |
| `GET /api/v1/containers/{id}/snapshots` | Get container snapshots |  |
| `POST /api/v1/containers/{id}/{operation}` | Manage container |  |
| `DELETE /api/v1/containers/{id}/network` | Remove container network configuration |  |
| `PUT /api/v1/containers/{id}/snapshots/{name}` | Restore container from snapshot |  |
| `PUT /api/v1/containers/{id}/kvm` | Enable or disable /dev/kvm (run VMs in the container) | `body*` |
| `POST /api/v1/containers/{id}/network/start` | Start container network proxy/blocking |  |
| `POST /api/v1/containers/{id}/network/stop` | Stop container network proxy/blocking |  |
| `POST /api/v1/containers/{id}/sync` | Sync a copied container with its source |  |
| `PUT /api/v1/containers/{id}` | Update a container | `body*` |
| `PUT /api/v1/containers/{id}/network` | Update container network configuration | `body*` |
| `PUT /api/v1/containers/{id}/snapshots/{name}/alias` | Update snapshot alias | `body*` |

**Param notes:**

- `runtime` — Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse.
- `include_proxy_domains` — Include proxy domains (aliases) for this container. When true, adds a proxy_domains array to the container object.
- `include_proxy_permissions` — Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission.
- `page` — Page number for pagination - starts from 1
- `limit` — Number of containers to return per page - maximum 100 items
- `sort_by` — Field to sort containers by
- `sort_order` — Sort direction - ascending or descending
- `realm_id` — Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL.
- `include_proxy_domains` — Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object.
- `include_prespawn` — Include prespawn containers in the listing. By default, prespawn containers are excluded from results.
- `include_expired` — Include containers that have expired due to server termination. By default, expired containers are excluded from results.
- `include_deleting` — Include containers currently being deleted. By default, deleting containers are excluded from results.
- `include_prespawn` — Include prespawn containers in the listing. By default, prespawn containers are excluded.

**Body shapes:**

- `POST /api/v1/containers/{id}/copy` body — `{ target_project_id*: string, target_server_id: string, name: string, ssh_public_key: string|null, source_snapshot: string, copy_firewall_rules: bool=false, copy_network_rules: bool=false, kvm: bool, dev_kvm: bool }`
  - `target_project_id` — ID of the project where the copy will be created
  - `target_server_id` — ID of the server where the copy will be created (defaults to source server)
  - `name` — Name for the copied container (auto-generated if not provided)
  - `ssh_public_key` — SSH public key for the copied container (must be unique, not inherited from source)
  - `source_snapshot` — Specific snapshot to copy from (copies latest state if not provided)
  - `copy_firewall_rules` — Whether to copy firewall rules (ACL) from source container to target container
  - `copy_network_rules` — Whether to copy network rules/settings from source container to target container
  - `kvm` — Grant the COPY /dev/kvm passthrough (run full VMs). The copy NEVER inherits the source's KVM grant — the source device is always stripped — so this decides KVM for the copy independently, granting it afresh on the TARGET server. Available on rented / dedicated (bare-metal) targets ONLY (never free…
  - `dev_kvm` — Accepted alias of `kvm` on input (`kvm` wins if both are sent and they must agree).
- `POST /api/v1/projects/{id}/containers` body — `{ server_id*: string, name: string, color: string, container_image: string|null, ai: bool=true, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, hoody_kit: bool=true, dev_kit: bool, kvm: bool, dev_kvm: bool, autostart: bool=true, ramdisk: bool=true, cache: bool=true, cache_image: bool=false, prespawn: bool=false, bypass_prespawn: bool=false, realm_ids: string[] }`
  - `name` — Name for the container. Must be 3-100 characters, alphanumeric with hyphens and underscores. Omit or use "rand" to generate a random name.
  - `color` — HEX color for the container (e.g., #FF0000 or FF0000). If not provided, a random color will be generated. The # prefix will be added automatically if missing, and the color will be converted to uppercase.
  - `container_image` — Container image to use. If null or not provided, will use the default configured image. Shorthand is resolved automatically: a bare distribution name or a hyphenated version ("debian", "debian-13") becomes the canonical base image ("debian/13"), as do the "debian:13" and "debian 13" forms.
  - `ai` — Whether AI features are enabled (default: true)
  - `ssh_public_key` — SSH public key for container access. SSH public keys must be unique per container (one container per key). If not provided, will inherit from project defaults.
  - `comment` — Optional comment for the container (max 16000 characters)
  - `hoody_kit` — Enable all Hoody Kit features (extra-apt-sources, basic-packages, hoody-daemon, sudo-env, remove-snapd, webview, user, hoody-ai, ttyd)
  - `dev_kit` — Enable dev_kit development tools in the container. Defaults to true when hoody_kit is true, false when hoody_kit is false (unless explicitly set). Cannot be updated after creation.
  - `kvm` — Enable /dev/kvm passthrough (run full VMs inside the container) at creation. Available on rented / dedicated (bare-metal) servers ONLY — never free tier — and rejected (403) on a free server. Defaults to false. Can also be toggled later via PUT /containers/{id}/kvm on a stopped container.
  - `autostart` — Whether the container should start automatically on host boot (default: true)
  - `ramdisk` — Whether to mount a ramdisk at /ramdisk in the container (default: true). The ramdisk KEEPS data when you stop/start/reboot the container, but LOSES data if the physical host server reboots. Can store up to 50% of total host memory. Ideal for security (data automatically wiped on server seizure), te…
  - `cache` — Enable use of cached images during container creation (--use-cache-image). When false, no cache options are added.
  - `cache_image` — Force the creation of a new cached image from the container image. This option is only available to admins or the owner of the image.
  - `prespawn` — INTERNAL — not user-settable. Prespawn cache containers are provisioned only by the system pool producer. Passing `true` is rejected (403); an explicit `false` is accepted.
  - `bypass_prespawn` — Bypass prespawn container claiming and create a fresh container directly. By default (false), the system will attempt to claim a matching prespawn container if available.
  - `realm_ids` — Realm IDs to assign this container to. If creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids. Note: Containers can have different realm membership than their parent project.
- `POST /api/v1/containers/{id}/snapshots` body — `{ alias: string, expiry: int }`
  - `alias` — Optional user-friendly alias for the snapshot
  - `expiry` — Expiry in days (1–3650). Values outside this range are rejected before the snapshot is created.
- `PUT /api/v1/containers/{id}/kvm` body — `{ kvm: bool, dev_kvm: bool }`
  - `kvm` — Enable (true) or disable (false) /dev/kvm passthrough (run VMs in the container). Rented/dedicated servers only; the container must be stopped.
- `PUT /api/v1/containers/{id}` body — `{ name: string, color: string, ai: bool, autostart: bool, ramdisk_scope: "container" | "project", ramdisk: bool, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, realm_ids: string[] }`
  - `name` — Human-readable name for the container - must be unique within the project
  - `ai` — Whether AI features are enabled. If omitted, the current value is preserved.
  - `autostart` — Whether the container starts automatically on host boot. If omitted, the current value is preserved.
  - `ramdisk_scope` — Sharing scope for /ramdisk. `container` (default) mounts only private storage. `project` additionally mounts /ramdisk/project, shared with your other containers in this project ON THE SAME SERVER (a RAM disk cannot span servers). Refused when the project has other members, because project access is…
  - `ramdisk` — Whether to mount a ramdisk at /ramdisk. If omitted, the current value is preserved. Backed by a shared per-server memory pool (512 MiB by default, never more than 50% of the server memory) shared with your other containers on that server. Data survives container restarts but is LOST on a host reboo…
  - `environment_vars` — Environment variables to set in the container as key-value pairs
  - `ssh_public_key` — SSH public key for container access. SSH public keys must be unique per container (one container per key). Re-sending the same key for the same container is treated as a no-op. Set to null to clear or inherit from project defaults.
  - `comment` — Optional comment for the container (max 16000 characters). Set to null to clear existing comment.
  - `realm_ids` — Update realm membership for this container. Containers can have different realm membership than their parent project. Only unrestricted tokens and admin users can modify realm_ids; realm-restricted tokens cannot change realm membership for security.
- `PUT /api/v1/containers/{id}/network` body — `{ type*: "socks5" | "http" | "https" | "block", proxy: string, country: string, city: string, region: string, comment: string, dns_servers: string[] }`
  - `type` — Network configuration type - proxy type or block for traffic blocking
  - `proxy` — Proxy server URL (required for non-block types), e.g. "socks5://proxy.example.com:1080". Credentials may be embedded as userinfo ("socks5://host:port") to set/replace them; omitting userinfo on an UNCHANGED endpoint preserves the stored credentials (write-only secret). The response never echoes use…
  - `country` — Optional country for geographical proxy selection
  - `city` — Optional city for geographical proxy selection
  - `region` — Optional region for geographical proxy selection
  - `comment` — Optional comment describing the network configuration
  - `dns_servers` — Custom DNS servers (max 4, defaults to ["1.1.1.1", "8.8.8.8"])
- `PUT /api/v1/containers/{id}/snapshots/{name}/alias` body — `{ alias*: string|null }`
  - `alias` — New alias for the snapshot (set to null to remove alias)

### `env` (4) — Container Environment

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/containers/{id}/env` | Bulk set container environment variables | `body*` |
| `DELETE /api/v1/containers/{id}/env/{key}` | Delete a single environment variable |  |
| `GET /api/v1/containers/{id}/env` | List container environment variables |  |
| `PUT /api/v1/containers/{id}/env/{key}` | Set a single environment variable | `body*` |

**Param notes:**

- `key` — Environment variable key

**Body shapes:**

- `PUT /api/v1/containers/{id}/env` body — `{ [key: string]: string }`
- `PUT /api/v1/containers/{id}/env/{key}` body — `{ value*: string }`
  - `value` — Value for the environment variable

### `events` (6) — Events

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/events` | Bulk delete events | `body*` |
| `POST /api/v1/events/cleanup` | Cleanup old events | `body*` |
| `DELETE /api/v1/events/{id}` | Delete a single event |  |
| `GET /api/v1/events/{id}` | Get event details by ID |  |
| `GET /api/v1/events/stats` | Get event statistics | `?start_date` `?end_date` `?realm_id` |
| `GET /api/v1/events` | List event history | `?limit` `?offset` `?sort_by` `?sort_order` `?event_type` `?resource_type` `?resource_id` `?project_id` `?container_id` `?start_date` `?end_date` `?realm_id` |

**Param notes:**

- `start_date` — Start of time range
- `end_date` — End of time range
- `realm_id` — Filter by realm
- `limit` — Number of events to return (max 500)
- `offset` — Number of events to skip
- `sort_by` — Field to sort by
- `sort_order` — Sort direction
- `event_type` — Filter by specific event type
- `resource_type` — Filter by resource type
- `resource_id` — Filter by specific resource ID
- `project_id` — Filter by project ID
- `container_id` — Filter by container ID
- `start_date` — Filter events after this timestamp
- `end_date` — Filter events before this timestamp
- `realm_id` — Filter by realm ID

**Body shapes:**

- `DELETE /api/v1/events` body — `{ event_type: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | …(45 values), resource_type: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | …(12 values), resource_id: string, before_date: string, realm_id: string }`
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
| `GET /api/v1/containers/{id}/firewall/rules` | List container firewall rules |  |
| `DELETE /api/v1/containers/{id}/firewall/egress` | Remove Egress Rule(s) | `body*` |
| `DELETE /api/v1/containers/{id}/firewall/ingress` | Remove Ingress Rule(s) | `body*` |
| `POST /api/v1/containers/{id}/firewall/reset` | Reset container firewall |  |
| `PATCH /api/v1/containers/{id}/firewall/egress` | Toggle Egress Rule State | `body*` |
| `PATCH /api/v1/containers/{id}/firewall/ingress` | Toggle Ingress Rule State | `body*` |

**Body shapes:**

- `POST /api/v1/containers/{id}/firewall/egress` body — `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, destination: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `action` — Action to take: allow (permit), reject (deny with response), drop (deny silently)
  - `protocol` — Network protocol
  - `description` — Human-readable rule description
  - `destination_port` — Port number, range (80-90), or comma-separated list (80,443). Required for TCP/UDP.
  - `destination` — Destination IPv4 address or CIDR range. Use 0.0.0.0/0 for any destination.
  - `source_port` — Source port filter (rarely used)
  - `state` — Rule state (defaults to enabled)
  - `icmp_type` — ICMP type number
  - `icmp_code` — ICMP code number
- `POST /api/v1/containers/{id}/firewall/ingress` body — `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, source: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `source` — Source IPv4 address or CIDR range. Use 0.0.0.0/0 for any source.
  - `icmp_type` — ICMP type number (e.g., 8 for echo request/ping)
- `DELETE /api/v1/containers/{id}/firewall/egress` body — `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, destination: string, source_port: string, description: string, state: "enabled" | "disabled"="enabled", icmp_type: string, icmp_code: string }`
  - `all` — Remove all matching rules (default: first match only). Set to true with no other filters to remove all egress rules.
  - `action` — Action for matching traffic
  - `protocol` — Protocol type
  - `destination_port` — Destination port, range (e.g., 80-90), or list (e.g., 80,443)
  - `destination` — Destination IPv4/CIDR address(es)
  - `source_port` — Source port, range, or list
  - `description` — Rule description
  - `state` — Rule state
  - `icmp_type` — ICMP type number for icmp4 protocol
  - `icmp_code` — ICMP code number for icmp4 protocol
- `DELETE /api/v1/containers/{id}/firewall/ingress` body — `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source: string, source_port: string, description: string, state: "enabled" | "disabled"="enabled", icmp_type: string, icmp_code: string }`
  - `all` — Remove all matching rules (default: first match only). Set to true with no other filters to remove all ingress rules.
  - `source` — Source IPv4/CIDR address(es)
- `PATCH /api/v1/containers/{id}/firewall/egress` body — `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, destination: string, description: string, icmp_type: string, icmp_code: string }`
  - `state` — New state for the rule
- `PATCH /api/v1/containers/{id}/firewall/ingress` body — `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, source: string, description: string, icmp_type: string, icmp_code: string }`

### `images` (7) — Container Images

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/images/public/{id}` | Get public image details |  |
| `GET /api/v1/images/{id}/icon` | Get image icon |  |
| `POST /api/v1/images/import/{id}` | Import free image |  |
| `GET /api/v1/images/user` | List user images | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/images/public` | List public images | `?os` `?architecture` `?min_price` `?max_price` `?min_rating` `?max_rating` `?search` `?page` `?limit` `?sort_by` `?sort_order` |
| `POST /api/v1/images/purchase/{id}` | Purchase image |  |
| `POST /api/v1/images/rate/{id}` | Rate image | `body*` |

**Param notes:**

- `page` — Page number for pagination - starts from 1
- `limit` — Number of images to return per page - maximum 100 items
- `sort_by` — Field to sort user images by - currently only supports creation date
- `sort_order` — Sort direction - ascending or descending
- `os` — Filter images by operating system - e.g., ubuntu, debian, alpine, centos
- `architecture` — Filter images by CPU architecture - e.g., amd64, arm64, armhf
- `min_price` — Minimum price filter for paid images - 0 includes free images
- `max_price` — Maximum price filter for paid images - useful for budget constraints
- `min_rating` — Minimum average rating filter - filters images with rating >= this value (0-5 stars)
- `max_rating` — Maximum average rating filter - filters images with rating <= this value (0-5 stars)
- `search` — Search term to filter images by name, description, or tags
- `sort_by` — Field to sort images by - name, date added, price, or average rating

**Body shapes:**

- `POST /api/v1/images/rate/{id}` body — `{ rating*: number }`
  - `rating` — Rating for the image from 0 to 5 stars

### `meta` (2) — Meta

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/meta/public-key` | Get Hoody API Signing Public Key |  |
| `GET /api/v1/meta/social-stats` | Get Hoody Social Counters |  |

### `notifications` (4) — Notifications

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/` | Get all notifications for the authenticated user |  |
| `GET /api/v1/notifications/public` | Get all public notifications |  |
| `PUT /api/v1/notifications/read-all` | Mark all notifications as read |  |
| `PUT /api/v1/notifications/{id}/read` | Mark a notification as read |  |

### `poolInvitations` (3) — Pool Invitations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools/{id}/accept` | Accept invitation |  |
| `GET /api/v1/pools/invitations/pending` | List pending invitations |  |
| `POST /api/v1/pools/{id}/reject` | Reject invitation |  |

### `poolMembers` (3) — Pool Members

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools/{id}/members` | Invite member | `body*` |
| `DELETE /api/v1/pools/{id}/members/{userId}` | Remove member |  |
| `PUT /api/v1/pools/{id}/members/{userId}` | Update member role | `body*` |

**Body shapes:**

- `POST /api/v1/pools/{id}/members` body — `{ username*: string, role*: "admin" | "user" }`
  - `username` — Username of the user to invite
- `PUT /api/v1/pools/{id}/members/{userId}` body — `{ role*: "admin" | "user" }`

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

### `projects` (10) — Projects

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/projects/{id}/permissions` | Grant project access | `body*` |
| `POST /api/v1/projects/` | Create a new project | `body*` |
| `DELETE /api/v1/projects/{id}` | Delete project | `?include_deleted_items` |
| `GET /api/v1/projects/{id}` | Get project by ID | `?include_permissions` |
| `GET /api/v1/projects/{id}/stats` | Get statistics for all containers in a project |  |
| `GET /api/v1/projects/` | List all projects | `?page` `?limit` `?sort_by` `?sort_order` `?realm_id` |
| `GET /api/v1/projects/{id}/permissions` | List project permissions | `?page` `?limit` `?sort_by` `?sort_order` |
| `DELETE /api/v1/projects/{id}/permissions/{permissionId}` | Revoke project access |  |
| `PUT /api/v1/projects/{id}` | Update project | `body*` |
| `PUT /api/v1/projects/{id}/permissions/{permissionId}` | Update project permission | `body*` |

**Param notes:**

- `include_deleted_items` — Include a lightweight list of deleted container IDs/names in the response for confirmation UX.
- `include_permissions` — Include project permissions with user details in response
- `page` — Page number (1-based)
- `limit` — Items per page (max 100)
- `sort_by` — Field to sort by
- `sort_order` — Sort direction
- `realm_id` — Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL.

**Body shapes:**

- `POST /api/v1/projects/{id}/permissions` body — `{ user_id*: string, permission_level*: "read" | "edit" | "delete" }`
  - `user_id` — User ID to grant access to
  - `permission_level` — Access level: "read", "edit", or "delete"
- `POST /api/v1/projects/` body — `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`
  - `alias` — Human-readable project name. Must be unique across your projects (e.g., "Production", "Development", "Client-ABC").
  - `color` — HEX color code for visual organization in dashboards. Accepts 3-digit (#RGB) or 6-digit (#RRGGBB). The # prefix is auto-added if missing, and the value is auto-normalized to uppercase. If not provided, a random color is generated.
  - `max_containers` — Maximum number of containers allowed in this project. Set to null for unlimited. This quota is enforced during container creation.
  - `realm_ids` — Realm IDs to assign this project to. If you are creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids.
- `PUT /api/v1/projects/{id}` body — `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`
  - `alias` — New project name. Must be unique across your projects.
  - `color` — New HEX color code. Auto-normalized to uppercase with # prefix.
  - `realm_ids` — Update realm membership for this project. If updating from a realm subdomain, the subdomain realm is automatically preserved and merged. Only unrestricted tokens and admin users can modify realm_ids; realm-restricted tokens cannot change realm membership.
- `PUT /api/v1/projects/{id}/permissions/{permissionId}` body — `{ permission_level*: "read" | "edit" | "delete" }`
  - `permission_level` — New permission level

### `proxyAliases` (6) — Proxy Aliases

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/proxy/aliases` | Create a new proxy alias | `body*` |
| `DELETE /api/v1/proxy/aliases/{id}` | Delete proxy alias |  |
| `GET /api/v1/proxy/aliases/{id}` | Get proxy alias by ID |  |
| `GET /api/v1/proxy/aliases` | List proxy aliases | `?project_id` `?container_id` `?realm_id` `?enabled` `?expired` |
| `PATCH /api/v1/proxy/aliases/{id}/state` | Enable or disable proxy alias | `body*` |
| `PATCH /api/v1/proxy/aliases/{id}` | Update proxy alias | `body*` |

**Param notes:**

- `project_id` — Filter by project ID
- `container_id` — Filter by container ID
- `realm_id` — Filter by realm ID. Alternative to using realm subdomain in URL.
- `enabled` — Filter by enabled status
- `expired` — Filter by expiration: "true" = only expired, "false" = only non-expired

**Body shapes:**

- `POST /api/v1/proxy/aliases` body — `{ container_id*: string, alias: string | null | false, program*: string, port: int, index: int, target_path: string|null, allow_path_override: bool=true, expires_at: string|null, enabled: bool=true }`
  - `container_id` — Container ID that this alias points to. You must own this container.
  - `alias` — Custom alias name (a-z, 0-9, hyphens only, 3-61 chars, cannot start/end with hyphen) OR null/false for auto-generated 48-char hex. Must be unique across every container hosted on the same physical server, including containers owned by other tenants — not merely within your own account. Reserved and…
  - `program` — Which container service the alias targets — a built-in Hoody program ("terminal", "files", "code", "browser", "agent", "display", …) or a transport protocol ("http", "https", "ssh"). To point an alias at an HTTP server you run yourself inside the container (a process started via the daemon, a dev s…
  - `port` — Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000 → http://<container>:3000). Preferred, unambiguous way to point an alias at a raw HTTP/HTTPS server; takes precedence over "index" and over any port embedded in the pr…
  - `index` — Instance index, or (legacy) target port for the "http"/"https" protocol. Defaults to 1. For a built-in Hoody program it selects which running instance to route to (e.g. terminal 2). For "http"/"https" it is the port your server listens on inside the container — but prefer the dedicated "port" field…
  - `target_path` — Base path for routing. Requests to https://{alias}.../ will be forwarded to the container with this path prefix. Auto-prefixed with / if missing.
  - `allow_path_override` — Whether to allow paths beyond target_path. If false, only the exact target_path is accessible.
  - `expires_at` — Optional ISO 8601 expiration date. Alias will be automatically disabled after this date.
  - `enabled` — Whether the alias is initially enabled (defaults to true)
- `PATCH /api/v1/proxy/aliases/{id}/state` body — `{ enabled*: bool }`
  - `enabled` — Set to true to enable, false to disable
- `PATCH /api/v1/proxy/aliases/{id}` body — `{ alias: string, program: string, port: int, index: int, target_path: string|null, allow_path_override: bool, expires_at: string | number | null, enabled: bool }`
  - `alias` — New alias name. Must be unique across every container hosted on the same physical server, including containers owned by other tenants — not merely within your own account. Reserved and rejected: the exact label "containers" (an infrastructure label of the container proxy domain), and anything equal…
  - `program` — Program or protocol the alias targets — a built-in Hoody program ("terminal", "files", "code", …) or a transport protocol ("http", "https", "ssh"). Use "http"/"https" with the "port" field to reach an HTTP server running on that port inside the container (e.g. program "http" + port 3000). The combi…
  - `port` — Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000). Preferred over "index"; takes precedence over "index" and over any port embedded in the program string. Ignored for built-in Hoody programs.
  - `index` — Instance index, or (legacy) target port when program is "http"/"https". Prefer the dedicated "port" field; if "port" or a port embedded in the program ("http-3000") is also supplied, that wins over this index.
  - `target_path` — Base path for routing. Set to null to remove path prefix.
  - `allow_path_override` — Whether to allow paths beyond target_path
  - `expires_at` — Expiration date (ISO string, Unix timestamp seconds/ms, or null to remove expiration)
  - `enabled` — Whether the alias is enabled

### `proxyDiscovery` (5) — Proxy Discovery

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/containers/{id}/proxy/services/{service}` | Get merged proxy view for a service |  |
| `GET /api/v1/containers/{id}/proxy/settings` | Get container proxy root settings |  |
| `GET /api/v1/containers/{id}/proxy/groups` | List container proxy groups |  |
| `GET /api/v1/containers/{id}/proxy/services` | List services referenced in proxy config |  |
| `PUT /api/v1/containers/{id}/proxy/settings` | Update container proxy root settings | `H:if-match` `body*` |

**Param notes:**

- `service` — Service name
- `if-match` — file:v<N> ETag precondition

**Body shapes:**

- `PUT /api/v1/containers/{id}/proxy/settings` body — `{ enable_proxy: bool, default: "allow" | "deny" }`

### `proxyHooks` (8) — Proxy Hooks

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/proxy/hooks/{service}` | Append or insert a new hook | `H:if-match` `body*` |
| `DELETE /api/v1/containers/{id}/proxy/hooks/{service}` | Clear all hooks for a service | `H:if-match` |
| `GET /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Get a single hook by id |  |
| `GET /api/v1/containers/{id}/proxy/hooks` | List all proxy hooks for a container |  |
| `GET /api/v1/containers/{id}/proxy/hooks/{service}` | List hooks for a specific service |  |
| `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` | Move a hook to a new position | `H:if-match` `body*` |
| `DELETE /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Remove a hook | `H:if-match` |
| `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Replace a hook in place | `H:if-match` `body*` |

**Param notes:**

- `service` — Service name
- `if-match` — file:v<N> ETag precondition
- `hookId` — 26-char Crockford base32 ULID (lowercase)

**Body shapes:**

- `POST /api/v1/containers/{id}/proxy/hooks/{service}` body — `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`
  - `position` — 0-indexed insertion position (POST only)
- `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` body — `{ position*: int }`
- `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` body — `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`

### `proxyPermissionsContainer` (13) — Proxy Permissions Container

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/containers/{id}/proxy/permissions` | Delete container proxy permissions | `H:if-match` |
| `GET /api/v1/containers/{id}/proxy/permissions` | Get container proxy permissions |  |
| `DELETE /api/v1/containers/{id}/proxy/permissions/groups/{groupName}` | Remove container authentication group | `H:if-match` |
| `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a container group | `H:if-match` |
| `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a container group | `H:if-match` |
| `PUT /api/v1/containers/{id}/proxy/permissions` | Replace container proxy permissions JSON | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Set container group program permission | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (container) | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (container) | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (container) | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (container) | `H:if-match` `body*` |
| `PATCH /api/v1/containers/{id}/proxy/permissions/default` | Update container default proxy permission policy | `H:if-match` `body*` |
| `PATCH /api/v1/containers/{id}/proxy/permissions/state` | Update container proxy enable state | `H:if-match` `body*` |

**Param notes:**

- `if-match` — file:v<N> ETag precondition — read current file_version from GET first
- `groupName` — Group name to remove
- `groupName` — Group name
- `program` — Program name (e.g., http, ssh, files)

**Body shapes:**

- `PUT /api/v1/containers/{id}/proxy/permissions` body — `{ project*: string, container*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: ("user" | "admin")[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool, hooks: { [key: string]: { match*: object, script*: object, timeout: int }[] } }`
  - `project` — Project ID owning this container
  - `container` — Container ID (must match path:id)
  - `groups` — Authentication groups. Key is group name, value is group config.
  - `permissions` — Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists.
  - `default` — Defaults to deny if omitted
  - `enable_proxy` — Enable or disable the proxy. Defaults to true.
  - `hooks` — Per-service proxy hooks. Keys are service names; values are first-match-wins arrays of { match, script, timeout? } rules. Max 8 per service, 32 per file total. Reject-listed services: logs, proxy, workspaces, cdp.
- `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` body — `{ program*: string, access*: bool | number | number[] | string | "*" }`
  - `program` — Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
  - `access` — Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. For network programs like "terminal", "ssh", "ui", etc., use boole…
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` body — `{ range*: string }`
  - `range` — IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` body — `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`
  - `secret` — JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
  - `algorithm` — JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys.
  - `sources` — Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" (param: was removed;)
  - `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` body — `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`
  - `username` — Username for authentication. Must match exactly what the client provides.
  - `password` — Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
  - `algorithm` — Hashing algorithm used for password verification. Currently only SHA256 is supported.
  - `salt` — Salt used for password hashing. Should be unique per user/group for security.
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` body — `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }` — Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.
- `PATCH /api/v1/containers/{id}/proxy/permissions/default` body — `{ default*: "allow" | "deny" }`
  - `default` — Default access policy for unmatched requests
- `PATCH /api/v1/containers/{id}/proxy/permissions/state` body — `{ enable_proxy*: bool }`
  - `enable_proxy` — Enable or disable the proxy entirely

### `proxyPermissionsProject` (13) — Proxy Permissions Project

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/projects/{id}/proxy/permissions` | Delete project proxy permissions | `H:if-match` |
| `GET /api/v1/projects/{id}/proxy/permissions` | Get project proxy permissions |  |
| `DELETE /api/v1/projects/{id}/proxy/permissions/groups/{groupName}` | Remove project authentication group | `H:if-match` |
| `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a project group | `H:if-match` |
| `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a project group | `H:if-match` |
| `PUT /api/v1/projects/{id}/proxy/permissions` | Replace project proxy permissions JSON | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Set project group program permission | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (project) | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (project) | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (project) | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (project) | `H:if-match` `body*` |
| `PATCH /api/v1/projects/{id}/proxy/permissions/default` | Update project default proxy permission policy | `H:if-match` `body*` |
| `PATCH /api/v1/projects/{id}/proxy/permissions/state` | Update project proxy enable state | `H:if-match` `body*` |

**Param notes:**

- `if-match` — file:v<N> ETag precondition — read current file_version from GET first
- `groupName` — Group name to remove
- `groupName` — Group name
- `program` — Program name (e.g., http, ssh, files)

**Body shapes:**

- `PUT /api/v1/projects/{id}/proxy/permissions` body — `{ project*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: ("user" | "admin")[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool }`
  - `project` — Project ID (must match path:id)
  - `groups` — Authentication groups. Key is group name (^[A-Za-z0-9_-]{1,50}$), value is group config.
  - `permissions` — Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists.
  - `default` — Default access policy when no rules match (defaults to "deny" if omitted)
  - `enable_proxy` — Enable or disable the proxy. Defaults to true.
- `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` body — `{ program*: string, access*: bool | number | number[] | string | "*" }`
  - `program` — Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
  - `access` — Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. For network programs like "terminal", "ssh", "ui", etc., use boole…
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` body — `{ range*: string }`
  - `range` — IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` body — `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`
  - `secret` — JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
  - `algorithm` — JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys.
  - `sources` — Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" (param: was removed;)
  - `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` body — `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`
  - `username` — Username for authentication. Must match exactly what the client provides.
  - `password` — Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
  - `algorithm` — Hashing algorithm used for password verification. Currently only SHA256 is supported.
  - `salt` — Salt used for password hashing. Should be unique per user/group for security.
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` body — `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }` — Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.
- `PATCH /api/v1/projects/{id}/proxy/permissions/default` body — `{ default*: "allow" | "deny" }`
  - `default` — Default access policy for unmatched requests
- `PATCH /api/v1/projects/{id}/proxy/permissions/state` body — `{ enable_proxy*: bool }`
  - `enable_proxy` — Enable or disable the proxy entirely

### `realms` (1) — Realms

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/realms/` | List your realm IDs | `?include_usage` |

**Param notes:**

- `include_usage` — Include resource counts per realm_id (projects, containers, servers, auth_tokens). Adds "usage" object to response data.

### `rentals` (3) — Rentals

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/rentals/{id}/extend` | Extend rental | `body*` |
| `GET /api/v1/rentals/{id}` | Get rental details |  |
| `GET /api/v1/rentals` | List user rentals |  |

**Body shapes:**

- `POST /api/v1/rentals/{id}/extend` body — `{ expected_rental_end*: string, additional_days*: int, max_charge_cents: int }`
  - `expected_rental_end` — The rental's CURRENT rental_end, exactly as the API returned it. The extension is applied only if it still matches, so a retried request — a lost response, a double click — is refused with 409 EXTENSION_ALREADY_APPLIED instead of charging and extending a second time. Re-read the rental before retry…
  - `additional_days` — Number of additional days to extend the rental (must match server pricing durations, max 3650)
  - `max_charge_cents` — The total you confirmed, in whole cents. The extension is refused if it would cost more. REQUIRED when the rental has no frozen renewal price (409 CHARGE_CONFIRMATION_REQUIRED) — without a quoted ceiling nothing bounds what the current server tiers can charge. Optional when the rental still carries…

### `serverCommands` (2) — Server Commands

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/servers/{serverId}/execute-command` | Execute server command | `body*` |
| `GET /api/v1/servers/{serverId}/available-commands` | Get available commands | `?category` `?risk_level` |

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

### `serverRental` (10) — Server Rental

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/servers/available` | Browse rental marketplace | `?country` `?region` `?max_price_per_day` `?available_durations` `?min_cpu_cores` `?min_cpu_score` `?cpu_score_type` `?min_ram_gb` `?ram_types` `?min_total_storage_gb` `?disk_types` `?min_bandwidth_mbps` `?min_traffic_tb` `?unlimited_traffic_only` `?category` `?featured_only` |
| `GET /api/v1/servers/{id}` | Get server details (alias for /rentals/:id) |  |
| `GET /api/v1/reservations/{id}` | One of your reservations |  |
| `GET /api/v1/rentals/{id}/runtime` | Get live runtime info for a rented server or subserver |  |
| `GET /api/v1/servers/{id}/runtime` | Get live runtime info (alias for /rentals/:id/runtime) |  |
| `GET /api/v1/servers` | List user servers (alias for /rentals) |  |
| `GET /api/v1/reservations` | Your reservations | `?limit` `?offset` |
| `GET /api/v1/offers` | Browse machines available to order |  |
| `POST /api/v1/servers/{id}/rent` | Rent server | `body*` |
| `POST /api/v1/offers/{id}/reserve` | Reserve an offer (charges immediately) | `body*` |

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

- `POST /api/v1/servers/{id}/rent` body — `{ pool_id: string, rental_days*: int, max_charge_cents: int }`
  - `rental_days` — Number of days to rent (must match server pricing durations, max 3650)
  - `max_charge_cents` — Ceiling on the TOTAL debit (rental price + one-time setup fee), in integer cents. REQUIRED for every paid rental. Omitting it returns 409 CHARGE_CONFIRMATION_REQUIRED, or 409 SETUP_FEE_CONFIRMATION_REQUIRED when the server also carries a one-time fee. It is NOT optional for fee-less servers: the fe…
- `POST /api/v1/offers/{id}/reserve` body — `{ days*: number, max_charge_cents: number, idempotency_key*: string, pool_id: string }`
  - `days` — Must be one of the offer's pricing_rules keys.
  - `max_charge_cents` — Ceiling on the TOTAL debit (rent + one-time setup fee). Required whenever a setup fee applies.
  - `idempotency_key` — Caller-generated. Replaying it returns the original reservation, unpaid twice.
  - `pool_id` — Must be a pool you own. Defaults to your default pool.

### `storageShares` (9) — Storage Shares

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/storage/shares` | Create storage share | `body*` |
| `DELETE /api/v1/storage/shares/{shareId}` | Delete storage share |  |
| `GET /api/v1/containers/{id}/storage/shares/{shareId}` | Get storage share |  |
| `GET /api/v1/containers/{id}/storage/shares` | List storage shares | `?target_type` `?label` `?status` `?enabled` `?include_expired` `?realm_id` |
| `GET /api/v1/storage/shares` | List all your storage shares | `?realm_id` |
| `GET /api/v1/containers/{id}/storage/incoming` | Get incoming shares |  |
| `GET /api/v1/storage/incoming` | Get all incoming shares | `?realm_id` |
| `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount` | Toggle incoming share mount | `body*` |
| `PATCH /api/v1/containers/{id}/storage/shares/{shareId}` | Update storage share | `body*` |

**Param notes:**

- `target_type` — Filter by target type
- `label` — Filter by label
- `status` — Filter by status
- `enabled` — Filter by enabled status
- `include_expired` — Include expired shares (default: false)
- `realm_id` — Filter by realm ID. Alternative to using realm subdomain in URL.

**Body shapes:**

- `POST /api/v1/containers/{id}/storage/shares` body — `{ source_path*: string, target_container_id: string, target_project_id: string, mode*: "readonly" | "readwrite", alias: string, label: string, description: string, enabled: bool, expires_at: number }`
  - `source_path` — ARCHITECTURE: Source containers control WHAT to share (this path). Target mount paths are determined by the server, NOT by users. SECURITY-HARDENED: Character whitelist (a-z A-Z 0-9 / - _.), path normalization applied, blocks system paths (/proc/*, /sys/*, /dev/*, /boot/*, /run/*, /var/run/*), no p…
  - `target_container_id` — 1:1 Container Share: Share with a specific container. Specify this OR target_project_id, not both.
  - `target_project_id` — Project-Wide Share: Share with all containers in a project. Auto-mounts on all current and future containers. Specify this OR target_container_id, not both.
  - `mode` — Mount mode - readonly (read-only) or readwrite (read-write)
  - `alias` — Optional alias (lowercase alphanumeric with hyphens/underscores)
  - `label` — Optional label for organizing shares
  - `description` — Optional description
  - `enabled` — Whether to enable the share (default: true). Disabled shares are kept in database but not mounted.
  - `expires_at` — Unix timestamp (seconds) when share should expire
- `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount` body — `{ mount*: bool }`
  - `mount` — Set to true to accept and mount the share, false to reject/unmount it
- `PATCH /api/v1/containers/{id}/storage/shares/{shareId}` body — `{ mode: "readonly" | "readwrite", alias: string|null, label: string|null, description: string|null, enabled: bool, expires_at: number|null }`
  - `mode` — Mount mode
  - `alias` — Alias (null to remove)
  - `label` — Label (null to remove)
  - `description` — Description (null to remove)
  - `enabled` — Enable or disable the share
  - `expires_at` — Unix timestamp (seconds) when share expires (null to never expire)

### `tfa` (7) — Two-Factor Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/users/auth/2fa` | Disable 2FA | `body*` |
| `GET /api/v1/users/auth/2fa/status` | Get 2FA Status |  |
| `POST /api/v1/users/auth/2fa/backup-codes/regenerate` | Regenerate Backup Codes | `body*` |
| `PUT /api/v1/users/auth/2fa/token-gate` | Set 2FA token gate preference | `body*` |
| `POST /api/v1/users/auth/2fa/setup` | Initialize 2FA Setup | `body*` |
| `POST /api/v1/users/auth/2fa/verify` | Verify 2FA Code During Login | `body*` |
| `POST /api/v1/users/auth/2fa/verify-setup` | Complete 2FA Setup | `body*` |

**Body shapes:**

- `DELETE /api/v1/users/auth/2fa` body — `{ password*: string, code*: string }`
  - `password` — Current account password
  - `code` — 6-digit OTP code from authenticator app OR backup code
- `POST /api/v1/users/auth/2fa/backup-codes/regenerate` body — `{ password*: string, code*: string }`
  - `code` — 6-digit OTP code from authenticator app
- `PUT /api/v1/users/auth/2fa/token-gate` body — `{ enabled*: bool, password: string, otp_code: string }`
  - `enabled` — true = require OTP for token mutations (default), false = skip OTP gate
  - `password` — Required when setting enabled=false (security downgrade requires primary-factor reauth)
  - `otp_code` — TOTP code or backup code. Required when setting enabled=false.
- `POST /api/v1/users/auth/2fa/setup` body — `{ password*: string }`
  - `password` — Current account password for verification
- `POST /api/v1/users/auth/2fa/verify` body — `{ temp_token: string, code*: string, response_mode: "intent" | "tokens", client: string }`
  - `temp_token` — Temporary token from login response (valid for 5 minutes). Alternatively pass it as Authorization: Bearer header.
  - `code` — 6-digit OTP code from authenticator app OR 10-character backup code
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange.
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects authentication.
- `POST /api/v1/users/auth/2fa/verify-setup` body — `{ code*: string }`
  - `code` — 6-digit code from authenticator app

### `users` (6) — Users

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/users/{id}` | Get user by ID |  |
| `GET /api/v1/users/me/free-tier-status` | Get free-tier claim status |  |
| `POST /api/v1/users/me/onboarding` | Mark an onboarding milestone as completed | `body*` |
| `POST /api/v1/users/me/redeem-invite` | Redeem a beta invite code | `body*` |
| `POST /api/v1/users/me/retry-setup` | Retry free-tier account setup | `body*` |
| `PUT /api/v1/users/{id}` | Update user profile | `body*` |

**Body shapes:**

- `POST /api/v1/users/me/onboarding` body — `{ milestone*: string }`
  - `milestone` — Milestone key, e.g. "hub_tour_v1".
- `POST /api/v1/users/me/redeem-invite` body — `{ code*: string }`
  - `code` — The invite code (case/format-insensitive).
- `POST /api/v1/users/me/retry-setup` body — `{ region: string }`
  - `region` — Optional preferred region override
- `PUT /api/v1/users/{id}` body — `{ alias: string, public_key: string, metadata: object, password: string, current_password: string, is_admin: bool, is_banned: bool }`
  - `alias` — New display name/alias
  - `public_key` — ED25519 public key (exactly 64 hexadecimal characters). Used for cryptographic identity and verification.
  - `metadata` — Custom metadata object for storing additional user information. Can include nested objects.
  - `password` — New password. Must be at least 12 characters, 3 of 4 character classes. Requires current_password for verification.
  - `current_password` — Current password (REQUIRED when setting new password for verification)
  - `is_admin` — Admin status (read-only)
  - `is_banned` — Ban status. Banned users cannot access the API.

### `utilities` (1) — Utilities

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/ip` | Get IP Information |  |

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
  - `metadata` — Optional JSON metadata (max 256KB). Useful for file uploads to store content-type, filename, upload date, etc. Must be valid JSON or null. This counts toward your total vault storage limit.

### `waitlist` (2) — Waitlist

| Method | Summary | Params |
|--------|---------|--------|
| `PATCH /api/v1/waitlist` | Enrich an existing waitlist signup | `body*` |
| `POST /api/v1/waitlist` | Join the Hoody waitlist | `body*` |

**Body shapes:**

- `PATCH /api/v1/waitlist` body — `{ email*: string, interest: "dev" | "ai" | "saas" | "security" | "creative" | "productivity" | "it" | "other" | …(9 values), context: "individual" | "startup" | "medium" | "enterprise" | "academic" | "", industry: "softdev" | "saas" | "paas" | "cloud" | "ai-ml" | "datasci" | "cyber" | "devops" | …(29 values), role: "lead" | "manager" | "director" | "exec" | "founder" | "engineer" | "devops" | "ml" | …(14 values) }`
  - `email` — Email of an existing signup.
- `POST /api/v1/waitlist` body — `{ email*: string }`
  - `email` — Signup email address.

### `wallet` (26) — Wallet

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/wallet/payment-methods/` | Add a new payment method | `body*` |
| `POST /api/v1/wallet/github-bonus/claim` | Claim the GitHub connection bonus |  |
| `POST /api/v1/wallet/payments/crypto/invoice` | Start a crypto payment (hosted invoice) | `body*` |
| `POST /api/v1/wallet/payments/stripe/checkout` | Start a card payment (Stripe Checkout) | `body*` |
| `DELETE /api/v1/wallet/payment-methods/{id}` | Delete a payment method |  |
| `GET /api/v1/wallet/invoices/{id}/pdf` | Download invoice PDF |  |
| `POST /api/v1/wallet/invoices/generate/{id}` | Generate invoice for transaction |  |
| `GET /api/v1/wallet/balances` | Get aggregate balances (general + AI) |  |
| `GET /api/v1/wallet/balances/ai` | Get AI balance (limit, usage, remaining) |  |
| `GET /api/v1/wallet/payments/crypto/intents/{id}` | Get a crypto payment intent |  |
| `GET /api/v1/wallet/balances/general` | Get general balance only |  |
| `GET /api/v1/wallet/github-bonus` | Get GitHub connection bonus status |  |
| `GET /api/v1/wallet/invoices/{id}` | Get invoice by ID |  |
| `GET /api/v1/wallet/payment-availability` | Get top-up payment availability (providers, bounds, AI transfer fee) |  |
| `GET /api/v1/wallet/payment-methods/{id}` | Get payment method by ID |  |
| `GET /api/v1/wallet/payments/stripe/intents/{id}` | Get a card payment intent |  |
| `GET /api/v1/wallet/transactions/{id}` | Get transaction by ID |  |
| `GET /api/v1/wallet/ai-fee-history` | Get AI credit fee history | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/wallet/payments/crypto/intents` | List crypto payment intents | `?limit` `?offset` |
| `GET /api/v1/wallet/invoices/` | Get all invoices | `?page` `?limit` `?sort_by` `?sort_order` `?filter` |
| `GET /api/v1/wallet/payment-methods/` | Get all payment methods |  |
| `GET /api/v1/wallet/payments/stripe/intents` | List card payment intents | `?limit` `?offset` |
| `GET /api/v1/wallet/transactions` | List transactions | `?limit` `?sort_by` `?sort_order` |
| `PUT /api/v1/wallet/payment-methods/{id}/default` | Set a payment method as default |  |
| `POST /api/v1/wallet/transfers` | Transfer from general balance to AI credits | `body*` |
| `PUT /api/v1/wallet/payment-methods/{id}` | Update a payment method | `body*` |

**Param notes:**

- `page` — Page number for pagination - starts from 1
- `limit` — Number of invoices to return per page - maximum 100
- `sort_by` — Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at.
- `filter` — JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400.

**Body shapes:**

- `POST /api/v1/wallet/payment-methods/` body — `{ name*: string, details: object, is_default: bool }`
- `POST /api/v1/wallet/payments/crypto/invoice` body — `{ amount*: string, idempotency_key: string }`
  - `amount` — USD amount as a strict decimal string (e.g., "25" or "25.00")
  - `idempotency_key` — Optional caller idempotency key (must contain a non-whitespace character); repeats return the original intent
- `POST /api/v1/wallet/payments/stripe/checkout` body — `{ amount*: string, idempotency_key: string }`
- `POST /api/v1/wallet/transfers` body — `{ amount*: string, idempotency_key: string, expected_fee_bps: int }`
  - `amount` — USD amount as a string with up to 2 decimals, e.g., "10.00". No exponent, no negatives.
  - `idempotency_key` — Optional caller idempotency key. Retrying with the SAME key AND same amount returns the original receipt without moving funds again; the same key with a different amount is rejected (409 TRANSFER_IDEMPOTENCY_KEY_REUSED). Recommended for the UI to make a double-click / retry-after-timeout safe.
  - `expected_fee_bps` — Optional: the platform fee (basis points) the client displayed at confirmation. If it no longer matches the current server fee, the transfer is rejected (409 TRANSFER_FEE_CHANGED) so the user re-confirms — so an irreversible transfer can never be charged a fee the user was not shown.
- `PUT /api/v1/wallet/payment-methods/{id}` body — `{ details: object, status: "active" | "inactive", is_default: bool }`

