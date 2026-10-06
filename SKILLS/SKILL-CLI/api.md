> _**CLI skill · `api` namespace** · ~17,393 tokens · hoody-sdk v1.0.0-beta.15_

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
- Bearer token in `Authorization`. Mint via `POST /api/v1/users/auth/login` (HTTP only; no CLI command) (1d JWT / 7d refresh) or `hoody auth tokens create` (long-lived, scopable).
- 2FA management (`hoody auth 2fa setup start`, `hoody auth 2fa setup confirm`, `hoody auth 2fa disable`, `hoody auth 2fa backup codes rotate` and the status read) takes a login session JWT, or account-password HTTP Basic auth (which is subject to its own password and 2FA checks); a long-lived `hoody auth tokens create` token is refused with 403 there. On top of that, the bodies differ: `hoody auth 2fa setup start` needs the password; `hoody auth 2fa setup confirm` needs the OTP code; `hoody auth 2fa verify` needs `temp_token` + code; `hoody auth 2fa disable` needs password + OTP **or** backup code; `hoody auth 2fa backup codes rotate` needs password + a **6-digit TOTP only** (`^\\d{6}$` — a backup code fails schema validation with 422). Login-time `hoody auth 2fa verify` needs no session.
- Project/container writes: project owner or matching permission row.
- Billing: prerequisites depend on the operation. A hosted crypto invoice (`hoody wallet payments crypto invoices create`) needs no saved payment method, only a login session (auth tokens are refused 403); server rentals and extensions debit the general wallet balance, so fund it first.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap (signup → verify → login [+2FA])

1. `POST /api/v1/auth/signup` (HTTP only; no CLI command)
2. `hoody auth email verify`
3. `POST /api/v1/users/auth/login` (HTTP only; no CLI command)
4. `hoody auth 2fa verify` (if 2FA enabled — uses `temp_token`)
5. `hoody auth whoami`

### 2. Mint a long-lived auth token

1. `hoody auth tokens create`
2. `hoody auth tokens list`
3. `hoody auth tokens realms add`
4. `hoody auth tokens realms remove`
5. `hoody auth tokens copy`
6. `hoody auth tokens delete`

### 3. Set up 2FA

1. `hoody auth 2fa setup start`
2. `hoody auth 2fa setup confirm`
3. `hoody auth 2fa status`
4. `hoody auth 2fa backup codes rotate`
5. `hoody auth 2fa gate enable` / `hoody auth 2fa gate disable`

### 4. Create first project + container

`hoody containers create` needs a `server_id` and a project id; see § Quirks & gotchas.
1. `hoody realms list`
2. `hoody servers list` (pick the `server_id`)
3. `hoody images list` (only when you want a non-default image)
4. `hoody projects create`
5. `hoody containers create` (with `server_id`)
6. `hoody containers start` (when the container is not already running)
7. `hoody containers get`

List the container's proxy aliases by getting it with `include_proxy_domains` set to `true`: `hoody containers get <id> --include-proxy-domains`. The `proxy_domains` array is only populated when `include_proxy_domains` is true, and it holds the aliases created with `hoody proxy aliases create` (each with its `url`), not the built-in kit URLs: a container with no aliases returns an empty array. Build kit URLs from the pattern in § Proxy URLs.

### 5. Grant another user access

Project-scope analogues live under `hoody projects proxy *`. Every proxy-permissions write (steps 6 to 9, and their project-scope analogues) is guarded by optimistic concurrency: it must carry `If-Match: file:v<N>`, where `N` is the document's current `file_version`. Read it with `hoody containers proxy permissions get` (the response carries `file_version` and an `ETag`); each successful write bumps the version and returns the new `ETag`, so pass that one to the next write. A missing header is refused 428, and a malformed or stale one 412. CLI: pass `--if-match file:v<N>`.
1. `hoody projects permissions list`
2. `hoody projects permissions create`
3. `hoody projects permissions update`
4. `hoody projects permissions delete`
5. `hoody containers proxy permissions get` (read `file_version`)
6. `hoody containers proxy groups password set` (If-Match)
7. `hoody containers proxy groups token set` (If-Match)
8. `hoody containers proxy groups jwt set` (If-Match)
9. `hoody containers proxy enable` / `hoody containers proxy disable` (If-Match)

### 6. Container exposure & shares

1. `hoody network update`
2. `hoody network start`
3. `hoody firewall egress create`
4. `hoody firewall ingress create`
5. `hoody proxy aliases create`
6. `hoody proxy aliases enable` / `hoody proxy aliases disable`
7. `hoody storage shares create`
8. `hoody storage containers incoming list` (container-scoped)
9. `hoody storage incoming mount` / `hoody storage incoming unmount`
10. `hoody storage shares delete`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `hoody snapshots create`
2. `hoody snapshots list`
3. `hoody snapshots restore`
4. `hoody containers copy`
5. `hoody snapshots delete`
6. `hoody containers env list`
7. `hoody containers env set`
8. `hoody containers env update`
9. `hoody containers env delete`
10. `hoody containers kvm enable` / `hoody containers kvm disable` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `hoody containers create`.

### 8. Billing: wallet → rent

1. `hoody wallet payments methods create`
2. `hoody wallet payments methods default set`
3. `hoody wallet payments stripe checkout create` (crypto: `hoody wallet payments crypto invoices create`)
4. `hoody wallet payments stripe intents get` (crypto: `hoody wallet payments crypto intents get`)
5. `hoody wallet balances get`
6. `hoody wallet transactions list`
7. `hoody servers marketplace list`
8. `hoody servers rent`
9. `hoody servers list`
10. `hoody servers extend`
11. `hoody servers commands run`

Rentals and extensions are charged to the general balance. Call `hoody wallet credits transfer` only to fund AI usage: it moves money out of that general balance into AI credits, minus a platform fee, so it leaves less for rentals.

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands. ONE exception worth reading before you call it: the notification inbox is NOT uniform CRUD. `hoody inbox list` needs `resources.read_account` on the token (403 without it — the external_customer, dev_team, finance_team and read_only templates all deny it, as do all tokens minted before 2026-06-30), and `hoody inbox mark read` / `hoody inbox mark read` refuse EVERY auth token regardless of permissions, because acknowledging is how the record of an account event is dismissed. `hoody inbox summary` (unread count and newest position, no bodies) is gated on `resources.read_account` the same way. `hoody inbox announcements list` needs no auth, but it returns only public system announcements, not the account inbox, so it is not a substitute for `hoody inbox list`.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `POST /api/v1/users/auth/logout` (HTTP only; no CLI command) is a logout-ALL for JWTs — every access and refresh JWT issued before that moment stops working (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `hoody auth tokens delete`). `hoody auth refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. `hoody auth refresh` sends the body with no `Authorization` header, so it is refused; when the access token expires, run `hoody login` again. For headless flows, mint a long-lived `hoody auth tokens create` token instead.
- `hoody servers regions list` returns `r.data.regions` (single-wrapped, like every other endpoint — older docs incorrectly called it doubly-wrapped).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user the stored password is left unchanged (first writer wins) and a fresh verification email is sent; for a verified user it is a no-op. A second signup therefore cannot fix a mistyped password: logging in with the new one fails with 401. Change it through `hoody auth password recover` → `hoody auth password reset`. Do NOT probe with signup.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers: it accepts the bare per-container kit URL, and access is decided by the container's proxy permission policy. No built-in kit asks for more, `bot` included: its management routes ignore an `Authorization` header and check no container ownership, so the proxy permission policy is their only access control. The `hoody containers claims create <id>` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- `hoody containers start`, `hoody containers stop`, `hoody containers restart`, `hoody containers pause` and `hoody containers resume` all call `POST /api/v1/containers/{id}/{operation}`: the operation is the last PATH segment, never a body field, and each method fixes it for you.  The optional body field `timeout` (seconds) caps how long the operation may run on the host; for `stop` and `hoody containers restart` it is also the time the container gets to shut down cleanly. CLI: `hoody containers stop <containerId> --timeout 60` (the id is positional; a plain stop sends `stop`, and `--force` sends `force-stop`).
- A command that acts on one container or project takes its id as the positional `<id>`: `hoody containers get <containerId>`, `hoody containers delete <containerId> -y`, `hoody containers start <containerId>`. The global `-c` does not fill it (`missing required argument 'id'`); it serves only commands whose help says `Requires: --container (-c)`, such as `hoody snapshots list`. Take ids from `hoody containers list` or `hoody projects list`.
- `hoody containers create` needs a `server_id` in its body, and nothing else in workflow 4 produces one: take it from `hoody servers list` (a server you rent). A `name` that another container in the project already uses is refused with 409. `container_image` is optional (omitted, the default image is used); name a public image from `hoody images list`, since `hoody images list` lists only images your account owns and is empty on a new account. A bare `debian` resolves to the canonical base image. CLI flags: `--project <projectId> --server-id <serverId> --container-image debian`.
- Snapshots are addressed by `name`, never by alias: `hoody snapshots restore`, `hoody snapshots delete` and `hoody snapshots alias set` take the `name` that `hoody snapshots list` returns. `hoody snapshots create` derives it from `alias`, keeping only letters, digits, `_` and `-` (no leading `-`), or uses `snap-YYYYMMDD-HHMMSS` (UTC) when no alias is given. In the CLI the name goes in `--name`.
- `hoody snapshots create` needs the container `running` or `stopped` (another status is refused with 400). A container holds at most 1000 snapshots, 10 on a free-tier slice; one more is refused with 400 `CONTAINER_SNAPSHOT_LIMIT` until you delete one.
- `hoody projects create` names the project with `alias` (required, at most 100 characters); there is no `name` field. An alias that one of your projects already uses is refused with 409.
- Kit URL `<projectId>-<containerId>-<kit>-<n>.<server>.containers.hoody.com`: with the default proxy permissions, holding the URL is enough to use the kit, `bot` management routes included. Treat it as a secret, since it also exposes the project and container ids; restrict it with `hoody containers proxy *` groups, or publish a `hoody proxy aliases create` alias instead.
- `hoody containers proxy services list` lists only the services named in the container's proxy permission rules or hooks, so a container with no custom rules returns `services: []`; it is not a list of running kits. `hoody proxy aliases create` takes the kit or protocol as `program` (e.g. `'exec'`, `'terminal'`, or `'http'` with `port`).
- `hoody wallet invoices list` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `hoody ip get` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `hoody servers offers reserve` charges at once, and every reservation whose total is above zero needs `max_charge_cents`, although the body schema marks it optional. Without it the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED` (409 `SETUP_FEE_CONFIRMATION_REQUIRED` when the offer has a one-time setup fee), and a total above it is refused with 409 `CHARGE_EXCEEDS_MAX`; the error data carries `total_cents`, and nothing is charged. It also needs a caller-generated `idempotency_key`: a retry with the same key returns the first reservation instead of charging again. CLI: `hoody servers offers reserve <offer-id> --days <days> --max-charge-cents <cents> --idempotency-key <key> -y`.
- `hoody servers extend` needs `expected_rental_end`: the rental's current `rental_end`, as `hoody servers get` returns it. The extension is applied only while that still matches, so a retry after a lost response is refused with 409 `EXTENSION_ALREADY_APPLIED` instead of charging twice; read the rental again before retrying. `max_charge_cents` is optional only when the rental's frozen renewal tiers (`renewal_pricing_frozen`) price `additional_days`; otherwise the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED`, and the error data carries `total_cents`. CLI: read `rental_end` with `hoody servers get <rental-id> -o json`, then run `hoody servers extend <rental-id> --additional-days <days> --expected-rental-end <rental-end> --max-charge-cents <cents> -y`.
- `hoody storage containers incoming list` is container-scoped: its `id` is the receiving container's id. For every incoming share across the account use `hoody storage incoming list`.
- `hoody storage shares get`, `hoody storage shares update`, `hoody storage incoming mount` and `hoody storage incoming unmount` take the share as `--share-id <shareId>` (24 hex characters) plus the global `-c <containerId>`: the source container for get and update, the receiving container for mount and unmount. `hoody storage shares delete` takes the share id as its positional argument and no container. `--enabled` is a boolean: disable a share with `--no-enabled`; `--enabled false` is refused as an extra argument.
- `hoody auth email verify` body has `token` + optional `response_mode`, `code_challenge` (required when `response_mode: 'intent'`) and `client` (analytics source channel) — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `hoody auth 2fa verify`.
- KVM (`PUT /api/v1/containers/{id}/kvm`, field `kvm` on create/responses) is rented/dedicated (bare-metal) servers ONLY — free tier is hard-refused with 403, and the container must be STOPPED to toggle (409 otherwise). Canonical field is `kvm`; `dev_kvm` is an input-only alias (`kvm` wins; both present and disagreeing → 400). Default off.

## Common errors

- 400 — explicit bad-request checks: login "Username or email, and password are required", an unknown signup `region`, a malformed `filter` (below).
- 400 `filter must be valid JSON` / `filter must be a JSON object` — a list's `filter` query parameter must be a JSON object; malformed JSON, `null`, an array or a scalar is refused (it used to be ignored). On lists that allow only some columns, such as `hoody wallet transactions list` and `hoody wallet invoices list`, an unknown column or operator is also 400. An empty `filter=` means no filter.
- 401 — Bearer missing/malformed. JWTs require the literal `Bearer ` prefix; `hdy_…` auth tokens are also accepted bare (`Authorization: hdy_…`).
- 403 — missing permission row or `resources.*` flag.
- 404 — missing resource OR 403 masked.
- 409 — uniqueness (duplicate username, proxy-alias).
- 428 / 412 — on the public routes these come from the If-Match guard on proxy-permission, proxy-settings and proxy-hook writes: 428 means the `If-Match` header is missing, 412 means it is malformed or stale (the document changed since you read it). Re-read the document (`hoody containers proxy permissions get` / `hoody projects proxy permissions get`), send its current `file:v<N>`, and retry. They do not signal a missing payment method, email verification or 2FA.
- 422 — request-schema validation (`REQUEST_SCHEMA_INVALID`, e.g. a backup code sent where `hoody auth 2fa backup codes rotate` wants a 6-digit TOTP) and semantic validation (password complexity, `rental_days` with no pricing).
- 429 — login 1000/30min (failures only), signup 5/hour, refresh 30/30min.
- 400 — the `events` socket accepts the WebSocket transport only (unless the deployment turns polling on); while polling is off, every long-polling request (with or without a `sid`) is refused with 400 `Polling transport is not supported; use the websocket transport`. Only on a deployment that turns polling on does a polling write with a missing or unknown `sid` get 400 `Unknown session`. Connect with `transports: ['websocket']`.
- Always-200 — `hoody auth password recover`, `hoody auth email verification send`, duplicate-`POST /api/v1/auth/signup` (HTTP only; no CLI command); do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

### `hoody activity` (2) — HTTP activity logs and access statistics

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody activity list` |  | read | Get activity logs | `api.activity.list` | `hoody activity list --page 1 --limit 50` |
| `hoody activity stats` |  | read | Get activity stats | `api.activity.getStats` | `hoody activity stats` |

### `hoody ai` (1) — Hoody AI catalog and models

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ai models list` |  | read | List available AI models (Hoody catalog) | `api.ai.listModels` | `hoody ai models list` |

### `hoody auth` (35) — Authentication, tokens, and 2FA

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody auth 2fa backup codes rotate` |  | action | Regenerate Backup Codes | `api.auth.twoFactor.rotateBackupCodes` | `hoody auth 2fa backup codes rotate --password <password> --code <code> -y` |
| `hoody auth 2fa disable` |  | destructive | Disable 2FA | `api.auth.twoFactor.disable` | `hoody auth 2fa disable --password <password> --code <code> -y` |
| `hoody auth 2fa gate disable` |  | write | Stop requiring two-factor verification to create auth tokens | `api.auth.twoFactor.disableTokenGate` | `hoody auth 2fa gate disable` |
| `hoody auth 2fa gate enable` |  | write | Require two-factor verification to create auth tokens | `api.auth.twoFactor.enableTokenGate` | `hoody auth 2fa gate enable` |
| `hoody auth 2fa setup confirm` |  | action | Complete 2FA Setup | `api.auth.twoFactor.confirmSetup` | `hoody auth 2fa setup confirm --code <code>` |
| `hoody auth 2fa setup start` |  | action | Initialize 2FA Setup | `api.auth.twoFactor.startSetup` | `hoody auth 2fa setup start --password <password>` |
| `hoody auth 2fa status` |  | read | Get 2FA Status | `api.auth.twoFactor.getStatus` | `hoody auth 2fa status` |
| `hoody auth 2fa verify` |  | action | Verify 2FA Code During Login | `api.auth.twoFactor.verify` | `hoody auth 2fa verify --code <code> --response-mode intent --print-token` |
| `hoody auth claims create` |  | action | Issue a signed identity claim bound to an audience | `api.auth.createIdentityClaim` | `hoody auth claims create --audience myapp.example.com --expires-in 3600` |
| `hoody auth config get` |  | read | Show the public sign-in configuration | `api.auth.getConfig` | `hoody auth config get` |
| `hoody auth device poll` |  | action | Poll for device sign-in tokens and save the session | `api.auth.device.poll` | `hoody auth device poll --device-code <device_code> --print-token` |
| `hoody auth device start` |  | action | Start a device sign-in and print the code to enter in a browser | `api.auth.device.start` | `hoody auth device start` |
| `hoody auth email verification send` |  | write | Resend verification email | `api.auth.sendVerificationEmail` | `hoody auth email verification send --email user@example.com` |
| `hoody auth email verify` |  | write | Verify email address | `api.auth.verifyEmail` | `hoody auth email verify --token <token> --response-mode intent --print-token` |
| `hoody auth oauth authorize` |  | action | Begin a PKCE authorization with a sign-in intent token | `api.auth.oauth.authorize` | `hoody auth oauth authorize --code-challenge <code_challenge> --redirect-uri <redirect_uri>` |
| `hoody auth oauth exchange` |  | action | Exchange a PKCE authorization code for a session | `api.auth.oauth.exchange` | `hoody auth oauth exchange --code <code> --code-verifier <code_verifier> --redirect-uri <redirect_uri> --print-token` |
| `hoody auth oauth intents cancel` |  | action | Cancel a pending sign-in intent or 2FA temporary token | `api.auth.oauth.cancelIntent` | `hoody auth oauth intents cancel` |
| `hoody auth password recover` |  | write | Request password reset | `api.auth.recoverPassword` | `hoody auth password recover --email user@example.com` |
| `hoody auth password reset` |  | write | Reset password | `api.auth.resetPassword` | `hoody auth password reset --token <token> --password <password>` |
| `hoody auth refresh` |  | action | Refresh access token | `api.auth.refresh` | `hoody auth refresh --refresh-token <refresh_token> --print-token` |
| `hoody auth tokens copy` |  | write | Copy auth token | `api.auth.tokens.copy` | `hoody auth tokens copy 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --expires-at today` |
| `hoody auth tokens create` |  | write | Create a new auth token | `api.auth.tokens.create` | `hoody auth tokens create --alias clever-dolphin --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens delete` |  | destructive | Delete auth token | `api.auth.tokens.delete` | `hoody auth tokens delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens get` |  | read | Get the calling auth token (no id) or an auth token by id | `api.auth.tokens.getCurrent` | `hoody auth tokens get` |
| `hoody auth tokens get` |  | read | Get auth token by id | `api.auth.tokens.get` | `hoody auth tokens get` |
| `hoody auth tokens list` |  | read | List auth tokens | `api.auth.tokens.list` | `hoody auth tokens list` |
| `hoody auth tokens profiles get` |  | read | Get auth token public profile by public key | `api.auth.tokens.getPublicProfile` | `hoody auth tokens profiles get 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens profiles update` |  | write | Update current auth token public profile | `api.auth.tokens.updatePublicProfile` | `hoody auth tokens profiles update --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens realms add` |  | write | Add realm to auth token | `api.auth.tokens.addRealm` | `hoody --realm-id 64f1a2b3c4d5e6f7a8b9c0d1 auth tokens realms add 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody auth tokens realms remove` |  | destructive | Remove realm from auth token | `api.auth.tokens.removeRealm` | `hoody --realm-id 64f1a2b3c4d5e6f7a8b9c0d1 auth tokens realms remove 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens templates list` |  | read | List auth token permission templates | `api.auth.tokens.listTemplates` | `hoody auth tokens templates list` |
| `hoody auth tokens update` |  | write | Update auth token | `api.auth.tokens.update` | `hoody auth tokens update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth waitlist join` |  | write | Join the Hoody waitlist |  | `hoody auth waitlist join --email user@example.com` |
| `hoody auth waitlist update` |  | write | Add interest and role answers to an existing waitlist signup |  | `hoody auth waitlist update --email user@example.com --interest dev --context individual` |
| `hoody auth whoami` |  | read | Get current user profile | `api.auth.whoami` | `hoody auth whoami` |

### `hoody containers` (51) — Container lifecycle, stats, and proxy permissions

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody containers claims create` |  | write | Authorize Container Access | `api.containers.createClaim` | `hoody containers claims create 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers copy` |  | write | Copy a container | `api.containers.copy` | `hoody containers copy 64f1a2b3c4d5e6f7a8b9c0d1 --target-project-id 64f1a2b3c4d5e6f7a8b9c0d1 --target-server-id 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource` |
| `hoody containers create` |  | write | Create a new container | `api.containers.create` | `hoody containers create --project abc-123 --server-id abc-123 --name my-resource --color '#ff0000'` |
| `hoody containers delete` |  | destructive | Delete a container | `api.containers.delete` | `hoody containers delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody containers env delete` |  | destructive | Delete a single environment variable | `api.containers.env.delete` | `hoody containers env delete --key <key> -y` |
| `hoody containers env list` |  | read | List container environment variables | `api.containers.env.list` | `hoody --container abc-123 containers env list` |
| `hoody containers env set` |  | write | Set a single environment variable | `api.containers.env.set` | `hoody containers env set --key <key> --value hello` |
| `hoody containers env update` |  | write | Bulk set container environment variables | `api.containers.env.update` | `hoody containers env update --body '{"APP_MODE":"hello"}'` |
| `hoody containers get` |  | read | Get a container by ID | `api.containers.get` | `hoody containers get 64f1a2b3c4d5e6f7a8b9c0d1 --include-proxy-domains` |
| `hoody containers kvm disable` |  | write | Disable /dev/kvm passthrough. Rented/dedicated servers only; the container must be stopped. | `api.containers.disableKvm` | `hoody containers kvm disable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers kvm enable` |  | write | Enable /dev/kvm passthrough (run full VMs inside the container). Rented/dedicated servers only; the container must be stopped. | `api.containers.enableKvm` | `hoody containers kvm enable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers list` |  | read | Get all containers | `api.containers.list` | `hoody containers list --page 1 --limit 50` |
| `hoody containers pause` |  | action | Pause a container | `api.containers.pause` | `hoody containers pause 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers proxy default set` |  | write | Update container default proxy permission policy | `api.proxy.containerPermissions.setDefault` | `hoody containers proxy default set --if-match file:v42 --default allow` |
| `hoody containers proxy disable` |  | write | Disable the proxy permissions of a container | `api.proxy.containerPermissions.disable` | `hoody containers proxy disable --if-match file:v42` |
| `hoody containers proxy enable` |  | write | Enable the proxy permissions of a container | `api.proxy.containerPermissions.enable` | `hoody containers proxy enable --if-match file:v42` |
| `hoody containers proxy groups delete` |  | destructive | Remove container authentication group | `api.proxy.containerPermissions.deleteAuthGroup` | `hoody containers proxy groups delete --group-name <group_name> --if-match file:v42 -y` |
| `hoody containers proxy groups ip set` |  | write | Set IP authentication group (container) | `api.proxy.containerPermissions.setIpGroup` | `hoody containers proxy groups ip set --group-name <group_name> --if-match file:v42 --range 192.0.2.0/24` |
| `hoody containers proxy groups jwt set` |  | write | Set JWT authentication group (container) | `api.proxy.containerPermissions.setJwtGroup` | `hoody containers proxy groups jwt set --group-name <group_name> --if-match file:v42 --secret <secret> --algorithm HS256 --sources header:Authorization --claims key=hello` |
| `hoody containers proxy groups list` |  | read | List container proxy groups | `api.proxy.groups.list` | `hoody containers proxy groups list 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers proxy groups password set` |  | write | Set password authentication group (container) | `api.proxy.containerPermissions.setPasswordGroup` | `hoody containers proxy groups password set --group-name <group_name> --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody containers proxy groups permissions clear` |  | destructive | Remove all program permissions for a container group | `api.proxy.containerPermissions.clearGroupPermissions` | `hoody containers proxy groups permissions clear --group-name <group_name> --if-match file:v42 -y` |
| `hoody containers proxy groups permissions delete` |  | destructive | Remove a single program permission for a container group | `api.proxy.containerPermissions.deleteGroupPermission` | `hoody containers proxy groups permissions delete --group-name <group_name> --program http --if-match file:v42 -y` |
| `hoody containers proxy groups permissions set` |  | write | Set container group program permission | `api.proxy.containerPermissions.setGroupPermission` | `hoody containers proxy groups permissions set --group-name <group_name> --if-match file:v42 --program http --access true` |
| `hoody containers proxy groups token set` |  | write | Set token authentication group (container) | `api.proxy.containerPermissions.setTokenGroup` | `hoody containers proxy groups token set --group-name <group_name> --if-match file:v42 --body '{"header":"X-Api-Key","value":"<token>"}'` |
| `hoody containers proxy hooks create` |  | write | Append or insert a new hook | `api.proxy.hooks.create` | `hoody containers proxy hooks create 64f1a2b3c4d5e6f7a8b9c0d1 <service> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody containers proxy hooks delete` |  | destructive | Remove a hook | `api.proxy.hooks.delete` | `hoody containers proxy hooks delete 64f1a2b3c4d5e6f7a8b9c0d1 <service> <hook_id> --if-match file:v42 -y` |
| `hoody containers proxy hooks get` |  | read | Get a single hook by id | `api.proxy.hooks.get` | `hoody containers proxy hooks get 64f1a2b3c4d5e6f7a8b9c0d1 <service> <hook_id>` |
| `hoody containers proxy hooks list` |  | read | List all proxy hooks for a container | `api.proxy.hooks.list` | `hoody containers proxy hooks list 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers proxy hooks move` |  | write | Move a hook to a new position | `api.proxy.hooks.move` | `hoody containers proxy hooks move 64f1a2b3c4d5e6f7a8b9c0d1 <service> <hook_id> --if-match file:v42 --position 10` |
| `hoody containers proxy hooks set` |  | write | Replace a hook in place | `api.proxy.hooks.set` | `hoody containers proxy hooks set 64f1a2b3c4d5e6f7a8b9c0d1 <service> <hook_id> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody containers proxy permissions delete` |  | destructive | Delete container proxy permissions | `api.proxy.containerPermissions.delete` | `hoody containers proxy permissions delete --if-match file:v42 -y` |
| `hoody containers proxy permissions get` |  | read | Get container proxy permissions | `api.proxy.containerPermissions.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy permissions get` |
| `hoody containers proxy permissions set` |  | write | Replace container proxy permissions JSON | `api.proxy.containerPermissions.set` | `hoody containers proxy permissions set --if-match file:v42 --project 64f1a2b3c4d5e6f7a8b9c0d1 --groups 'key={"type":"ip","range":"192.0.2.0/24"}' --permissions 'key={}' --default allow --enable-proxy` |
| `hoody containers proxy services get` |  | read | Get merged proxy view for a service | `api.proxy.services.get` | `hoody containers proxy services get 64f1a2b3c4d5e6f7a8b9c0d1 <service>` |
| `hoody containers proxy services hooks clear` |  | destructive | Clear all hooks for a service | `api.proxy.hooks.clear` | `hoody containers proxy services hooks clear 64f1a2b3c4d5e6f7a8b9c0d1 <service> --if-match file:v42` |
| `hoody containers proxy services hooks list` |  | read | List hooks for a specific service | `api.proxy.hooks.listByService` | `hoody containers proxy services hooks list 64f1a2b3c4d5e6f7a8b9c0d1 <service>` |
| `hoody containers proxy services list` |  | read | List services referenced in proxy config | `api.proxy.services.list` | `hoody containers proxy services list 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers proxy settings get` |  | read | Get container proxy root settings | `api.proxy.settings.get` | `hoody containers proxy settings get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers proxy settings update` |  | write | Update container proxy root settings | `api.proxy.settings.update` | `hoody containers proxy settings update 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --enable-proxy --default allow` |
| `hoody containers proxy usage` |  | read | Get proxied-usage documents for a container | `api.containers.getProxyUsage` | `hoody containers proxy usage 64f1a2b3c4d5e6f7a8b9c0d1 --from <from> --to <to>` |
| `hoody containers restart` |  | action | Restart a container | `api.containers.restart` | `hoody containers restart 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers resume` |  | action | Resume a container | `api.containers.resume` | `hoody containers resume 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers start` |  | action | Start a container | `api.containers.start` | `hoody containers start 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers stats` |  | read | Get container resource statistics | `api.containers.getStats` | `hoody containers stats 507f1f77bcf86cd799439011` |
| `hoody containers status history list` |  | read | Get status logs for a container | `api.containers.listStatusHistory` | `hoody containers status history list 64f1a2b3c4d5e6f7a8b9c0d1 --page 1 --limit 10` |
| `hoody containers stop` |  | action | Stop a container | `api.containers.stop` | `hoody containers stop 64f1a2b3c4d5e6f7a8b9c0d1 --force --timeout 120` |
| `hoody containers stop` |  | action | Force-stop a container immediately, without waiting for a clean shutdown | `api.containers.stop` | `hoody containers stop 64f1a2b3c4d5e6f7a8b9c0d1 --force --timeout 120` |
| `hoody containers sync` |  | action | Sync a copied container with its source | `api.containers.sync` | `hoody containers sync 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers update` |  | write | Update a container | `api.containers.update` | `hoody containers update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --color '#ff0000'` |
| `hoody containers wait` |  | read | Wait until a container reaches a runtime state (running, stopped, paused, failed); prints the result as JSON |  | `hoody containers wait CONTAINER_ID --state running --timeout 120s` |

### `hoody events` (7) — Events and activity logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody events clear` |  | destructive | Bulk delete events | `api.events.clear` | `hoody events clear --event-type container.creating --resource-type container -y` |
| `hoody events delete` |  | destructive | Delete a single event | `api.events.delete` | `hoody events delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody events get` |  | read | Get event details by ID | `api.events.get` | `hoody events get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody events list` |  | read | List event history | `api.events.list` | `hoody events list --limit 100 --offset 0` |
| `hoody events purge` |  | destructive | Cleanup old events | `api.events.purge` | `hoody events purge --retention-days 30 -y` |
| `hoody events stats` |  | read | Get event statistics | `api.events.getStats` | `hoody events stats --start-date 2026-01-01T00:00:00Z --end-date 2026-01-01T00:00:00Z` |
| `hoody events stream` |  | read | Stream events as NDJSON, one event per line, until interrupted (--once exits after the first match) | `events.stream` | `hoody events stream --type 'container.*' --project-id 64f1a2b3c4d5e6f7a8b9c0d1` |

### `hoody firewall` (10) — Container firewall rules — ingress (inbound) and egress (outbound)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody firewall egress create` |  | write | Add Egress Rule | `api.firewall.createEgressRule` | `hoody firewall egress create --action allow --protocol tcp --description 'My description' --destination 192.0.2.0/24 --state enabled` |
| `hoody firewall egress delete` |  | destructive | Remove Egress Rule(s) | `api.firewall.deleteEgressRule` | `hoody firewall egress delete --all --action allow -y` |
| `hoody firewall egress disable` |  | action | Disable an egress firewall rule | `api.firewall.disableEgressRule` | `hoody firewall egress disable --action allow --protocol tcp` |
| `hoody firewall egress enable` |  | action | Enable an egress firewall rule | `api.firewall.enableEgressRule` | `hoody firewall egress enable --action allow --protocol tcp` |
| `hoody firewall ingress create` |  | write | Add Ingress Rule | `api.firewall.createIngressRule` | `hoody firewall ingress create --action allow --protocol tcp --description 'My description' --source 192.0.2.0/24 --state enabled` |
| `hoody firewall ingress delete` |  | destructive | Remove Ingress Rule(s) | `api.firewall.deleteIngressRule` | `hoody firewall ingress delete --all --action allow -y` |
| `hoody firewall ingress disable` |  | action | Disable an ingress firewall rule | `api.firewall.disableIngressRule` | `hoody firewall ingress disable --action allow --protocol tcp` |
| `hoody firewall ingress enable` |  | action | Enable an ingress firewall rule | `api.firewall.enableIngressRule` | `hoody firewall ingress enable --action allow --protocol tcp` |
| `hoody firewall reset` |  | destructive | Reset container firewall | `api.firewall.reset` | `hoody --container abc-123 firewall reset -y` |
| `hoody firewall rules list` |  | read | List container firewall rules | `api.firewall.listRules` | `hoody --container abc-123 firewall rules list` |

### `hoody images` (7) — Container image marketplace (browse, purchase, rate, import, icons)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody images buy` |  | write | Purchase image | `api.images.buy` | `hoody images buy 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody images get` |  | read | Get public image details | `api.images.getPublic` | `hoody images get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images icon get` |  | read | Get image icon | `api.images.getIcon` | `hoody images icon get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images import` |  | write | Import free image | `api.images.import` | `hoody images import 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images list` |  | read | List public images | `api.images.listPublic` | `hoody images list --mine --os debian` |
| `hoody images list` |  | read | List your own images | `api.images.list` | `hoody images list --mine --os debian` |
| `hoody images rate` |  | write | Rate image | `api.images.rate` | `hoody images rate 64f1a2b3c4d5e6f7a8b9c0d1 --rating 5` |

### `hoody inbox` (5) — Platform account notification inbox

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody inbox announcements list` |  | read | Get all public notifications | `api.inbox.listAnnouncements` | `hoody inbox announcements list` |
| `hoody inbox list` |  | read | Get all notifications for the authenticated user | `api.inbox.list` | `hoody inbox list --limit 20 --unread-only` |
| `hoody inbox mark read` |  | write | Mark a notification as read | `api.inbox.markRead` | `hoody inbox mark read 64f1a2b3c4d5e6f7a8b9c0d1 --all` |
| `hoody inbox mark read` |  | write | Mark every notification as read | `api.inbox.markAllRead` | `hoody inbox mark read 64f1a2b3c4d5e6f7a8b9c0d1 --all` |
| `hoody inbox summary` |  | read | Show the unread notification count and newest position | `api.inbox.getSummary` | `hoody inbox summary` |

### `hoody ip` (1) — IP address management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ip get` |  | read | Get IP Information | `api.ip.get` | `hoody ip get` |

### `hoody meta` (4) — API metadata and signing keys

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody meta config get` |  | read | Get the Hoody public configuration map |  | `hoody meta config get` |
| `hoody meta config values get` |  | read | Get one public configuration value |  | `hoody meta config values get <key>` |
| `hoody meta key get` |  | read | Get Hoody API Signing Public Key | `api.meta.getPublicKey` | `hoody meta key get` |
| `hoody meta social stats` |  | read | Show public Hoody social channel counters |  | `hoody meta social stats` |

### `hoody network` (5) — Container network configuration

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody network delete` |  | destructive | Remove container network configuration | `api.network.delete` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network delete -y` |
| `hoody network get` |  | read | Get container network configuration | `api.network.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network get` |
| `hoody network start` |  | action | Start container network proxy/blocking | `api.network.start` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network start` |
| `hoody network stop` |  | action | Stop container network proxy/blocking | `api.network.stop` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network stop -y` |
| `hoody network update` |  | write | Update container network configuration | `api.network.update` | `hoody network update --type socks5 --proxy socks5://proxy.example.com:1080 --region eu-west-1` |

### `hoody pools` (11) — Pool management and invitations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pools create` |  | write | Create pool | `api.pools.create` | `hoody pools create --name my-resource --description 'My description' --settings key=hello` |
| `hoody pools delete` |  | destructive | Delete pool | `api.pools.delete` | `hoody pools delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools get` |  | read | Get pool details | `api.pools.get` | `hoody pools get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations accept` |  | action | Accept invitation | `api.pools.invitations.accept` | `hoody pools invitations accept 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations list` |  | read | List pending invitations | `api.pools.invitations.list` | `hoody pools invitations list` |
| `hoody pools invitations reject` |  | action | Reject invitation | `api.pools.invitations.reject` | `hoody pools invitations reject 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools list` |  | read | List user pools | `api.pools.list` | `hoody pools list` |
| `hoody pools members invite` |  | write | Invite member | `api.pools.members.invite` | `hoody pools members invite 64f1a2b3c4d5e6f7a8b9c0d1 --username alice --role admin` |
| `hoody pools members remove` |  | destructive | Remove member | `api.pools.members.remove` | `hoody pools members remove 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools members role set` |  | write | Update member role | `api.pools.members.setRole` | `hoody pools members role set 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 --role admin` |
| `hoody pools update` |  | write | Update pool | `api.pools.update` | `hoody pools update 64f1a2b3c4d5e6f7a8b9c0d1 --description 'My description'` |

### `hoody projects` (25) — Manage projects

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody projects create` |  | write | Create a new project | `api.projects.create` | `hoody projects create --alias Production --color '#ff0000' --max-containers 10` |
| `hoody projects delete` |  | destructive | Delete project | `api.projects.delete` | `hoody projects delete 64f1a2b3c4d5e6f7a8b9c0d1 --include-deleted-items -y` |
| `hoody projects get` |  | read | Get project by ID | `api.projects.get` | `hoody projects get 64f1a2b3c4d5e6f7a8b9c0d1 --include-permissions` |
| `hoody projects list` |  | read | List all projects | `api.projects.list` | `hoody projects list --page 1 --limit 10` |
| `hoody projects permissions create` |  | write | Grant project access | `api.projects.createPermission` | `hoody projects permissions create --project 64f1a2b3c4d5e6f7a8b9c0d1 --user-id 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects permissions delete` |  | destructive | Revoke project access | `api.projects.deletePermission` | `hoody projects permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --permission-id 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody projects permissions list` |  | read | List project permissions | `api.projects.listPermissions` | `hoody projects permissions list --page 10 --limit 10 --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects permissions update` |  | write | Update project permission | `api.projects.updatePermission` | `hoody projects permissions update --project 64f1a2b3c4d5e6f7a8b9c0d1 --permission-id 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects proxy default set` |  | write | Update project default proxy permission policy | `api.proxy.projectPermissions.setDefault` | `hoody projects proxy default set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --default allow` |
| `hoody projects proxy disable` |  | write | Disable the proxy permissions of a project | `api.proxy.projectPermissions.disable` | `hoody projects proxy disable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy enable` |  | write | Enable the proxy permissions of a project | `api.proxy.projectPermissions.enable` | `hoody projects proxy enable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy groups delete` |  | destructive | Remove project authentication group | `api.proxy.projectPermissions.deleteAuthGroup` | `hoody projects proxy groups delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 -y` |
| `hoody projects proxy groups ip set` |  | write | Set IP authentication group (project) | `api.proxy.projectPermissions.setIpGroup` | `hoody projects proxy groups ip set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --range 192.0.2.0/24` |
| `hoody projects proxy groups jwt set` |  | write | Set JWT authentication group (project) | `api.proxy.projectPermissions.setJwtGroup` | `hoody projects proxy groups jwt set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --secret <secret> --algorithm HS256 --sources header:Authorization --claims key=hello` |
| `hoody projects proxy groups password set` |  | write | Set password authentication group (project) | `api.proxy.projectPermissions.setPasswordGroup` | `hoody projects proxy groups password set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody projects proxy groups permissions clear` |  | destructive | Remove all program permissions for a project group | `api.proxy.projectPermissions.clearGroupPermissions` | `hoody projects proxy groups permissions clear --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 -y` |
| `hoody projects proxy groups permissions delete` |  | destructive | Remove a single program permission for a project group | `api.proxy.projectPermissions.deleteGroupPermission` | `hoody projects proxy groups permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --program http --if-match file:v42 -y` |
| `hoody projects proxy groups permissions set` |  | write | Set project group program permission | `api.proxy.projectPermissions.setGroupPermission` | `hoody projects proxy groups permissions set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --program http --access true` |
| `hoody projects proxy groups token set` |  | write | Set token authentication group (project) | `api.proxy.projectPermissions.setTokenGroup` | `hoody projects proxy groups token set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --body '{"header":"X-Api-Key","value":"<token>"}'` |
| `hoody projects proxy permissions delete` |  | destructive | Delete project proxy permissions | `api.proxy.projectPermissions.delete` | `hoody projects proxy permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 -y` |
| `hoody projects proxy permissions get` |  | read | Get project proxy permissions | `api.proxy.projectPermissions.get` | `hoody projects proxy permissions get --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects proxy permissions set` |  | write | Replace project proxy permissions JSON | `api.proxy.projectPermissions.set` | `hoody projects proxy permissions set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --groups 'key={"type":"ip","range":"192.0.2.0/24"}' --permissions 'key={}' --default allow --enable-proxy` |
| `hoody projects proxy usage` |  | read | Get proxied-usage documents for every container in a project | `api.projects.getProxyUsage` | `hoody projects proxy usage 64f1a2b3c4d5e6f7a8b9c0d1 --from <from> --to <to>` |
| `hoody projects stats` |  | read | Get statistics for all containers in a project | `api.projects.getStats` | `hoody projects stats 507f1f77bcf86cd799439033` |
| `hoody projects update` |  | write | Update project | `api.projects.update` | `hoody projects update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --color '#ff0000' --max-containers 10` |

### `hoody proxy` (7) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy aliases create` |  | write | Create a new proxy alias | `api.proxy.aliases.create` | `hoody --container-id 64f1a2b3c4d5e6f7a8b9c0d1 proxy aliases create --program <program> --target-path /home/user/file.txt --allow-path-override` |
| `hoody proxy aliases delete` |  | destructive | Delete proxy alias | `api.proxy.aliases.delete` | `hoody proxy aliases delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody proxy aliases disable` |  | write | Disable a proxy alias | `api.proxy.aliases.disable` | `hoody proxy aliases disable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases enable` |  | write | Enable a proxy alias | `api.proxy.aliases.enable` | `hoody proxy aliases enable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases get` |  | read | Get proxy alias by ID | `api.proxy.aliases.get` | `hoody proxy aliases get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases list` |  | read | List proxy aliases | `api.proxy.aliases.list` | `hoody proxy aliases list --project-id 64f1a2b3c4d5e6f7a8b9c0d1 --enabled` |
| `hoody proxy aliases update` |  | write | Update proxy alias | `api.proxy.aliases.update` | `hoody proxy aliases update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --index 10` |

### `hoody realms` (1) — Platform realms

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody realms list` |  | read | List your realm IDs | `api.realms.list` | `hoody realms list --include-usage` |

### `hoody servers` (25) — Server rental marketplace, rentals, and remote commands

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody servers commands list` |  | read | Get available commands | `api.servers.commands.list` | `hoody servers commands list 64f1a2b3c4d5e6f7a8b9c0d1 --category general --risk-level low` |
| `hoody servers commands run` |  | action | Execute server command | `api.servers.commands.run` | `hoody servers commands run 64f1a2b3c4d5e6f7a8b9c0d1 --command-id 64f1a2b3c4d5e6f7a8b9c0d1 --wait --timeout 10` |
| `hoody servers extend` |  | write | Extend rental | `api.servers.extend` | `hoody servers extend 64f1a2b3c4d5e6f7a8b9c0d1 --expected-rental-end <expected_rental_end> --additional-days 10 -y` |
| `hoody servers get` |  | read | Get server details | `api.servers.get` | `hoody servers get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers jobs get` |  | read | Show the status of a paid subserver operation | `api.servers.jobs.get` | `hoody servers jobs get abc-123` |
| `hoody servers list` |  | read | List user servers | `api.servers.list` | `hoody servers list` |
| `hoody servers marketplace list` |  | read | Browse rental marketplace | `api.servers.listMarketplace` | `hoody servers marketplace list --country US --region us-east` |
| `hoody servers offers list` |  | read | List machines available to order | `api.servers.offers.list` | `hoody servers offers list` |
| `hoody servers offers reserve` |  | write | Reserve an offer and charge your wallet immediately | `api.servers.offers.reserve` | `hoody servers offers reserve abc-123 --days 10 --max-charge-cents 10 --idempotency-key <idempotency_key> -y` |
| `hoody servers plans list` |  | read | List the paid subserver plans you can buy | `api.servers.plans.list` | `hoody servers plans list` |
| `hoody servers plans quote` |  | read | Quote the price of a paid subserver plan | `api.servers.plans.quote` | `hoody servers plans quote --plan-id abc-123` |
| `hoody servers regions list` |  | read | Get available server regions | `api.servers.listRegions` | `hoody servers regions list` |
| `hoody servers rent` |  | write | Rent server | `api.servers.rent` | `hoody servers rent 64f1a2b3c4d5e6f7a8b9c0d1 --pool-id 64f1a2b3c4d5e6f7a8b9c0d1 --rental-days 10 -y` |
| `hoody servers reservations get` |  | read | Show one of your reservations | `api.servers.reservations.get` | `hoody servers reservations get abc-123` |
| `hoody servers reservations list` |  | read | List your reservations | `api.servers.reservations.list` | `hoody servers reservations list --limit 50 --offset 0` |
| `hoody servers stats` |  | read | Live CPU, memory and disk usage of a rental | `api.servers.getStats` | `hoody servers stats 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers subscriptions autorenew disable` |  | destructive | Turn off auto-renew for a server subscription | `api.servers.subscriptions.disableAutoRenew` | `hoody servers subscriptions autorenew disable abc-123 -y` |
| `hoody servers subscriptions autorenew enable` |  | destructive | Turn on auto-renew for a server subscription | `api.servers.subscriptions.enableAutoRenew` | `hoody servers subscriptions autorenew enable abc-123 -y` |
| `hoody servers subscriptions buy` |  | write | Buy a paid subserver and charge your wallet immediately | `api.servers.subscriptions.buy` | `hoody servers subscriptions buy --plan-id abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |
| `hoody servers subscriptions cancel` |  | destructive | Cancel a paid subserver subscription (no refund; held after the paid period) | `api.servers.subscriptions.cancel` | `hoody servers subscriptions cancel abc-123 -y` |
| `hoody servers subscriptions get` |  | read | Show one of your paid subserver subscriptions | `api.servers.subscriptions.get` | `hoody servers subscriptions get abc-123` |
| `hoody servers subscriptions list` |  | read | List your paid subserver subscriptions | `api.servers.subscriptions.list` | `hoody servers subscriptions list --limit 50 --offset 0` |
| `hoody servers subscriptions pay` |  | write | Pay a held subscription and resume it (charges one month) | `api.servers.subscriptions.pay` | `hoody servers subscriptions pay abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |
| `hoody servers subscriptions quote` |  | read | Quote an upgrade of, or a payment for, a subscription | `api.servers.subscriptions.quote` | `hoody servers subscriptions quote abc-123 --action upgrade` |
| `hoody servers subscriptions upgrade` |  | write | Upgrade a paid subserver and charge the difference | `api.servers.subscriptions.upgrade` | `hoody servers subscriptions upgrade abc-123 --plan-id abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |

### `hoody snapshots` (5) — Container snapshots

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody snapshots alias set` |  | write | Update snapshot alias | `api.snapshots.setAlias` | `hoody snapshots alias set --name my-resource --alias my-resource` |
| `hoody snapshots create` |  | write | Create container snapshot | `api.snapshots.create` | `hoody snapshots create --alias my-resource --expiry 10` |
| `hoody snapshots delete` |  | destructive | Delete container snapshot | `api.snapshots.delete` | `hoody snapshots delete --name my-resource -y` |
| `hoody snapshots list` |  | read | Get container snapshots | `api.snapshots.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 snapshots list` |
| `hoody snapshots restore` |  | action | Restore container from snapshot | `api.snapshots.restore` | `hoody snapshots restore --name my-resource -y` |

### `hoody storage` (10) — Storage shares

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody storage containers incoming list` |  | read | Get incoming shares | `api.storage.shares.listIncomingByContainer` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 storage containers incoming list` |
| `hoody storage containers shares list` |  | read | List storage shares | `api.storage.shares.listByContainer` | `hoody storage containers shares list --target-type container --label my-label` |
| `hoody storage incoming list` |  | read | Get all incoming shares | `api.storage.shares.listIncoming` | `hoody storage incoming list` |
| `hoody storage incoming mount` |  | action | Mount an incoming share into the container | `api.storage.shares.mountIncoming` | `hoody storage incoming mount --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage incoming unmount` |  | action | Unmount an incoming share from the container | `api.storage.shares.unmountIncoming` | `hoody storage incoming unmount --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares create` |  | write | Create storage share | `api.storage.shares.create` | `hoody storage shares create --source-path /home/user/file.txt --target-container-id 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |
| `hoody storage shares delete` |  | destructive | Delete storage share | `api.storage.shares.delete` | `hoody storage shares delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody storage shares get` |  | read | Get storage share | `api.storage.shares.get` | `hoody storage shares get --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares list` |  | read | List all storage shares you have created, across all your containers | `api.storage.shares.list` | `hoody storage shares list` |
| `hoody storage shares update` |  | write | Update storage share | `api.storage.shares.update` | `hoody storage shares update --share-id 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |

### `hoody users` (7) — User management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody users free tier status` |  | read | Show whether this account can claim a free server | `api.users.getFreeTierStatus` | `hoody users free tier status` |
| `hoody users get` |  | read | Get user by ID | `api.users.get` | `hoody users get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody users invites redeem` |  | write | Redeem a free-tier invite code to claim your free server | `api.users.redeemInvite` | `hoody users invites redeem --code HOODY-7Q4K-9F2M-3B8T-XR5W-2HKD-1` |
| `hoody users onboarding milestones complete` |  | write | Mark an onboarding milestone as completed | `api.users.completeOnboardingMilestone` | `hoody users onboarding milestones complete --milestone hub_tour_v1` |
| `hoody users security history list` |  | read | List your account sign-ins and security events | `api.users.listSecurityHistory` | `hoody users security history list --page 1 --limit 50` |
| `hoody users setup retry` |  | write | Retry free-tier account setup | `api.users.retrySetup` | `hoody users setup retry --region eu-west-1` |
| `hoody users update` |  | write | Update user profile | `api.users.update` | `hoody users update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |

### `hoody vault` (6) — Secure key-value vault

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vault clear` |  | destructive | Clear entire vault | `api.vault.clear` | `hoody vault clear` |
| `hoody vault delete` |  | destructive | Delete vault key | `api.vault.delete` | `hoody vault delete <key> -y` |
| `hoody vault get` |  | read | Get vault key | `api.vault.get` | `hoody vault get <key>` |
| `hoody vault list` |  | read | List vault keys | `api.vault.list` | `hoody vault list` |
| `hoody vault set` |  | write | Set vault key | `api.vault.set` | `hoody vault set <key> --value '{"api_key": "sk_test_123456", "encrypted": true}'` |
| `hoody vault stats` |  | read | Get vault statistics | `api.vault.getStats` | `hoody vault stats` |

### `hoody wallet` (26) — Balances, transactions, payments, and invoices

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody wallet balance get` |  | read | Get general balance only | `api.wallet.getBalance` | `hoody wallet balance get` |
| `hoody wallet balances get` |  | read | Get aggregate balances (general + AI) | `api.wallet.getBalances` | `hoody wallet balances get` |
| `hoody wallet credits fees list` |  | read | List AI credit fee history (platform fees charged on AI transfers) | `api.wallet.listCreditFees` | `hoody wallet credits fees list --page 1 --limit 20` |
| `hoody wallet credits get` |  | read | Get AI balance (limit, usage, remaining) | `api.wallet.getCredits` | `hoody wallet credits get` |
| `hoody wallet credits transfer` |  | write | Transfer from general balance to AI credits | `api.wallet.transferToCredits` | `hoody wallet credits transfer --amount 10.00 --expected-fee-bps 10 -y` |
| `hoody wallet github bonus claim` |  | action | Claim the one-time GitHub connection bonus | `api.wallet.claimGithubBonus` | `hoody wallet github bonus claim` |
| `hoody wallet github bonus status` |  | read | Show the status of the GitHub connection bonus | `api.wallet.getGithubBonus` | `hoody wallet github bonus status` |
| `hoody wallet invoices create` |  | action | Generate invoice for transaction | `api.wallet.createInvoice` | `hoody wallet invoices create 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices download` |  | read | Download invoice PDF | `api.wallet.downloadInvoice` | `hoody wallet invoices download 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices get` |  | read | Get invoice by ID | `api.wallet.getInvoice` | `hoody wallet invoices get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices list` |  | read | Get all invoices | `api.wallet.listInvoices` | `hoody wallet invoices list --page 1 --limit 20` |
| `hoody wallet payments availability get` |  | read | Which payment rails are available to this account right now | `api.wallet.getPaymentAvailability` | `hoody wallet payments availability get` |
| `hoody wallet payments crypto intents get` |  | read | Get one crypto payment intent | `api.wallet.getCryptoPaymentIntent` | `hoody wallet payments crypto intents get 665f1f77bcf86cd799439012` |
| `hoody wallet payments crypto intents list` |  | read | List your crypto payment intents | `api.wallet.listCryptoPaymentIntents` | `hoody wallet payments crypto intents list --limit 20 --offset 0` |
| `hoody wallet payments crypto invoices create` |  | write | Create a crypto payment invoice to add funds | `api.wallet.createCryptoInvoice` | `hoody wallet payments crypto invoices create --amount 25.00 -y` |
| `hoody wallet payments methods create` |  | write | Add a new payment method | `api.wallet.createPaymentMethod` | `hoody wallet payments methods create --type credit_card --name my-resource --is-default` |
| `hoody wallet payments methods default set` |  | write | Set a payment method as default | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payments methods default set 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods delete` |  | destructive | Delete a payment method | `api.wallet.deletePaymentMethod` | `hoody wallet payments methods delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody wallet payments methods get` |  | read | Get payment method by ID | `api.wallet.getPaymentMethod` | `hoody wallet payments methods get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods list` |  | read | Get all payment methods | `api.wallet.listPaymentMethods` | `hoody wallet payments methods list --page 1 --limit 100` |
| `hoody wallet payments methods update` |  | write | Update a payment method | `api.wallet.updatePaymentMethod` | `hoody wallet payments methods update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --status active` |
| `hoody wallet payments stripe checkout create` |  | write | Start a Stripe checkout to add funds (returns the checkout URL) | `api.wallet.createStripeCheckout` | `hoody wallet payments stripe checkout create --amount 25.00 -y` |
| `hoody wallet payments stripe intents get` |  | read | Get one Stripe payment intent | `api.wallet.getStripePaymentIntent` | `hoody wallet payments stripe intents get 665f1f77bcf86cd799439011` |
| `hoody wallet payments stripe intents list` |  | read | List your Stripe payment intents | `api.wallet.listStripePaymentIntents` | `hoody wallet payments stripe intents list --limit 20 --offset 0` |
| `hoody wallet transactions get` |  | read | Get transaction by ID | `api.wallet.getTransaction` | `hoody wallet transactions get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet transactions list` |  | read | List transactions | `api.wallet.listTransactions` | `hoody wallet transactions list --page 1 --limit 20` |

