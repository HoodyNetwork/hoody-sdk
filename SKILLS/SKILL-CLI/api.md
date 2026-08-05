> _**CLI skill · `api` namespace** · ~14,350 tokens · hoody-sdk v1.0.0-beta.11_

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
- Bearer token in `Authorization`. Mint via `hoody auth login` (1d JWT / 7d refresh) or `hoody auth create` (long-lived, scopable).
- 2FA mutations have varying auth: `hoody auth 2fa setup` needs password only; `hoody auth 2fa verify-setup` needs OTP code only; `hoody auth 2fa verify` needs `temp_token` + code; `hoody auth 2fa disable` needs password + OTP **or** backup code; `hoody auth 2fa regenerate` needs password + a **6-digit TOTP only** (`^\\d{6}$` — backup codes are rejected with 400).
- Project/container writes: project owner or matching permission row.
- Billing writes: registered payment method.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap (signup → verify → login [+2FA])

1. `hoody auth signup`
2. `hoody auth email verify`
3. `hoody auth login`
4. `hoody auth 2fa verify` (if 2FA enabled — uses `temp_token`)
5. `hoody auth profile current`

### 2. Mint a long-lived auth token

1. `hoody auth create`
2. `hoody auth list`
3. `hoody auth realms add`
4. `hoody auth realms remove`
5. `hoody auth copy`
6. `hoody auth delete`

### 3. Set up 2FA

1. `hoody auth 2fa setup`
2. `hoody auth 2fa verify-setup`
3. `hoody auth 2fa status`
4. `hoody auth 2fa regenerate`
5. `hoody auth 2fa gate`

### 4. Create first project + container

Read kit URLs by getting the container with `include_proxy_domains` set to `true` (`hoody containers get`) — the `proxy_domains` array is only populated when `include_proxy_domains` is passed.
1. `hoody realms list`
2. `hoody images mine`
3. `hoody projects create`
4. `hoody containers create`
5. `hoody containers manage`
6. `hoody containers get`

### 5. Grant another user access

Project-scope analogues live under `hoody projects proxy *`.
1. `hoody projects permissions list`
2. `hoody projects permissions create`
3. `hoody projects permissions update`
4. `hoody projects permissions delete`
5. `hoody containers proxy groups password set`
6. `hoody containers proxy groups token set`
7. `hoody containers proxy groups jwt set`
8. `hoody containers proxy state`

### 6. Container exposure & shares

1. `hoody network update`
2. `hoody network start`
3. `hoody firewall egress create`
4. `hoody firewall ingress create`
5. `hoody proxy create`
6. `hoody proxy set-state`
7. `hoody storage create`
8. `hoody storage incoming list` (container-scoped)
9. `hoody storage incoming toggle-mount`
10. `hoody storage delete`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `hoody snapshots create`
2. `hoody snapshots list`
3. `hoody snapshots restore`
4. `hoody containers copy`
5. `hoody snapshots delete`
6. `hoody containers env list`
7. `hoody containers env set`
8. `hoody containers env bulk-set`
9. `hoody containers env delete`
10. `hoody containers kvm` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `hoody containers create`.

### 8. Billing: wallet → rent

1. `hoody wallet payment-methods create`
2. `hoody wallet payment-methods set-default`
3. `POST /api/v1/wallet/payments/stripe/checkout` (crypto: `POST /api/v1/wallet/payments/crypto/invoice`)
4. `GET /api/v1/wallet/payments/stripe/intents/{id}` (crypto: `GET /api/v1/wallet/payments/crypto/intents/{id}`)
5. `hoody wallet balance get`
6. `hoody wallet transfer`
7. `hoody wallet transactions list`
8. `hoody servers marketplace`
9. `hoody servers rent`
10. `hoody servers list-rentals`
11. `hoody servers extend`
12. `hoody servers exec`

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `hoody auth logout` is a logout-ALL for JWTs — it bumps `session_generation`, invalidating every access + refresh JWT issued before that moment (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `hoody auth delete`). `hoody auth refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header — the generated SDK / CLI auto-refresh only send the body, so the typed call typically 401s; for headless flows mint a long-lived `hoody auth create` instead, or call refresh manually with both the body and the header set to the same refresh token.
- `hoody auth regions` returns `r.data.regions` (single-wrapped, like every other endpoint — older docs incorrectly called it doubly-wrapped).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user, the controller silently overwrites the password and re-sends the verification email; for a verified user it's a no-op. Do NOT probe with this.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — like every other kit it accepts the bare per-container kit URL directly, with no auth headers. The `hoody containers authorize` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- Auth tokens rejected on admin endpoints (JWT only); `x-impersonate-user` JWT only.
- `hoody containers manage` polymorphic: `POST /api/v1/containers/{id}/{operation}` from `ContainerOperation` enum (not body field).
- No admin concept on user-owned resources; permission row IS the authorization.
- Kit URL `<projectId>-<containerId>-<kit>-1.<server>.containers.hoody.com` IS the credential; watch containerId leakage.
- `hoody containers proxy discovery services list` returns `services: []` often; pass `program: 'exec'` to `hoody proxy create`.
- `hoody wallet invoices list` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `hoody ip get` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `hoody storage incoming list` is container-scoped; pass `containerId`.
- `hoody auth email verify` body has `token` + optional `response_mode` + `code_challenge` only — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `hoody auth 2fa verify`.
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
- Always-200 — `hoody auth password forgot`, `hoody auth email resend`, duplicate-`hoody auth signup`; do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

### `hoody activity` (2) — HTTP activity logs and access statistics

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody activity logs` |  | read | Get activity logs | `api.activity.listIterator` | `hoody activity logs --page 1 --limit 50 --start-date <start_date> --end-date <end_date> --min-status 10 --max-status 10 --method GET --realm-id abc-123` |
| `hoody activity stats` |  | read | Get activity stats | `api.activity.getStats` | `hoody activity stats` |

### `hoody ai` (1) — Hoody AI catalog and models

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ai list` |  | read | List available AI models (Hoody catalog) | `api.ai.listModels` | `hoody ai list` |

### `hoody auth` (32) — Authentication, tokens, and 2FA

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody auth 2fa disable` |  | destructive | Disable 2FA | `api.tfa.disable` | `hoody auth 2fa disable --password <password> --code <code>` |
| `hoody auth 2fa gate` |  | write | Set 2FA token gate preference | `api.tfa.setTokenGate` | `hoody auth 2fa gate --enabled --password <password> --otp-code <code>` |
| `hoody auth 2fa regenerate` |  | action | Regenerate Backup Codes | `api.tfa.regenerateBackupCodes` | `hoody auth 2fa regenerate --password <password> --code <code>` |
| `hoody auth 2fa setup` |  | action | Initialize 2FA Setup | `api.tfa.setup` | `hoody auth 2fa setup --password <password>` |
| `hoody auth 2fa status` |  | read | Get 2FA Status | `api.tfa.getStatus` | `hoody auth 2fa status` |
| `hoody auth 2fa verify` |  | action | Verify 2FA Code During Login | `api.tfa.verify` | `hoody auth 2fa verify --temp-token <temp_token> --code <code> --response-mode intent --client <client> --print-token` |
| `hoody auth 2fa verify-setup` |  | action | Complete 2FA Setup | `api.tfa.verifySetup` | `hoody auth 2fa verify-setup --code <code>` |
| `hoody auth copy` |  | write | Copy auth token | `api.authTokens.copy` | `hoody auth copy abc-123 --alias my-resource --expires-at today --otp-code <code>` |
| `hoody auth create` | new, add | write | Create a new auth token | `api.authTokens.create` | `hoody auth create --alias my-resource --public-key pk_abc123 --public-storage '{}' --ip-whitelist <ip_whitelist> --permission-template <permission_template> --permissions-containers-create --permissions-containers-read --permissions-containers-update --permissions-containers-delete --permissions-containers-actions-start --permissions-containers-actions-stop --permissions-containers-actions-restart --permissions-containers-actions-exec --permissions-containers-actions-logs --permissions-containers-features-ai --permissions-containers-features-hoody-kit --permissions-containers-features-snapshots --permissions-containers-features-networking --permissions-containers-features-kvm --permissions-projects-create --permissions-projects-read --permissions-projects-update --permissions-projects-delete --permissions-projects-members-invite --permissions-projects-members-remove --permissions-projects-members-change-roles --permissions-financial-wallet-read --permissions-financial-wallet-transfer --permissions-financial-wallet-withdraw --permissions-financial-billing-read --permissions-financial-billing-manage-payment-methods --permissions-financial-billing-download-invoices --permissions-financial-server-rental-view-marketplace --permissions-financial-server-rental-rent-servers --permissions-financial-server-rental-extend-rentals --permissions-financial-server-rental-terminate-rentals --permissions-resources-vault --permissions-resources-events --permissions-resources-ssh-keys --permissions-resources-storage-shares --permissions-resources-proxy-aliases --permissions-resources-firewalls --permissions-resources-realms --permissions-resources-auth-token-public-profile --permissions-resources-create-tokens --permissions-resources-read-account --permissions-admin-users --permissions-admin-servers --permissions-admin-system --permissions-admin-billing --permissions-admin-monitoring --realm-ids "realm-1" --allow-no-realm --vault-access --event-access --deny-reauthorization --expires-at today --otp-code <code>` |
| `hoody auth delete` | rm, remove | destructive | Delete auth token | `api.authTokens.delete` | `hoody auth delete abc-123` |
| `hoody auth email resend` |  | write | Resend verification email | `api.authentication.resendVerification` | `hoody auth email resend --email user@example.com` |
| `hoody auth email verify` |  | write | Verify email address | `api.authentication.verifyEmail` | `hoody auth email verify --client <client> --token <token> --response-mode intent --code-challenge <code> --print-token` |
| `hoody auth get` | show, describe | read | Get auth token by ID | `api.authTokens.get` | `hoody auth get abc-123` |
| `hoody auth get-current` |  | read | Get current auth token details | `api.authTokens.getCurrent` | `hoody auth get-current` |
| `hoody auth list` | ls | read | List auth tokens | `api.authTokens.listIterator` | `hoody auth list` |
| `hoody auth login` |  | action | Login with username and password | `api.authentication.login` | `hoody auth login --username alice --email user@example.com --password <password> --response-mode intent --client <client> --code-challenge <code> --print-token` |
| `hoody auth logout` |  | action | Logout | `api.authentication.logout` | `hoody auth logout` |
| `hoody auth oauth github callback` |  | read | GitHub OAuth callback | `api.authentication.githubOAuthCallback` | `hoody auth oauth github callback --code <code> --state active --error <error> --error-description <error_description> --error-uri <error_uri>` |
| `hoody auth oauth github redirect` |  | read | Redirect to GitHub OAuth | `api.authentication.githubOAuthRedirect` | `hoody auth oauth github redirect --client <client> --intent login --redirect-uri <redirect_uri> --code-challenge <code> --invite-code <invite_code>` |
| `hoody auth oauth google callback` |  | read | Google OAuth callback | `api.authentication.googleOAuthCallback` | `hoody auth oauth google callback --code <code> --state active --error <error> --error-description <error_description> --error-uri <error_uri>` |
| `hoody auth oauth google redirect` |  | read | Redirect to Google OAuth | `api.authentication.googleOAuthRedirect` | `hoody auth oauth google redirect --client <client> --redirect-uri <redirect_uri> --code-challenge <code> --invite-code <invite_code>` |
| `hoody auth password forgot` |  | write | Request password reset | `api.authentication.forgotPassword` | `hoody auth password forgot --email user@example.com` |
| `hoody auth password reset` |  | write | Reset password | `api.authentication.resetPassword` | `hoody auth password reset --token <token> --password <password>` |
| `hoody auth profile by-public-key` |  | read | Get auth token public profile by public key | `api.authTokens.getPublicProfile` | `hoody auth profile by-public-key pk_abc123` |
| `hoody auth profile current` |  | read | Get current user profile | `api.authentication.getCurrentUser` | `hoody auth profile current` |
| `hoody auth profile update` |  | write | Update current auth token public profile | `api.authTokens.updatePublicProfile` | `hoody auth profile update --public-key pk_abc123 --public-storage '{}'` |
| `hoody auth realms add` |  | write | Add realm to auth token | `api.authTokens.addRealm` | `hoody auth realms add abc-123 --realm-id abc-123 --otp-code <code>` |
| `hoody auth realms remove` |  | destructive | Remove realm from auth token | `api.authTokens.removeRealm` | `hoody auth realms remove abc-123 --realm-id abc-123 --otp-code <code>` |
| `hoody auth refresh` |  | action | Refresh access token | `api.authentication.refreshToken` | `hoody auth refresh --refresh-token <refresh_token> --print-token` |
| `hoody auth regions` |  | read | Get available server regions | `api.authentication.getAvailableRegions` | `hoody auth regions` |
| `hoody auth signup` |  | write | Sign up with email and password | `api.authentication.signup` | `hoody auth signup --email user@example.com --password <password> --region eu-west-1 --invite-code <invite_code> --client <client>` |
| `hoody auth update` | edit | write | Update auth token | `api.authTokens.update` | `hoody auth update abc-123 --alias my-resource --public-key pk_abc123 --public-storage '{}' --ip-whitelist <ip_whitelist> --permissions-containers-create --permissions-containers-read --permissions-containers-update --permissions-containers-delete --permissions-containers-actions-start --permissions-containers-actions-stop --permissions-containers-actions-restart --permissions-containers-actions-exec --permissions-containers-actions-logs --permissions-containers-features-ai --permissions-containers-features-hoody-kit --permissions-containers-features-snapshots --permissions-containers-features-networking --permissions-containers-features-kvm --permissions-projects-create --permissions-projects-read --permissions-projects-update --permissions-projects-delete --permissions-projects-members-invite --permissions-projects-members-remove --permissions-projects-members-change-roles --permissions-financial-wallet-read --permissions-financial-wallet-transfer --permissions-financial-wallet-withdraw --permissions-financial-billing-read --permissions-financial-billing-manage-payment-methods --permissions-financial-billing-download-invoices --permissions-financial-server-rental-view-marketplace --permissions-financial-server-rental-rent-servers --permissions-financial-server-rental-extend-rentals --permissions-financial-server-rental-terminate-rentals --permissions-resources-vault --permissions-resources-events --permissions-resources-ssh-keys --permissions-resources-storage-shares --permissions-resources-proxy-aliases --permissions-resources-firewalls --permissions-resources-realms --permissions-resources-auth-token-public-profile --permissions-resources-create-tokens --permissions-resources-read-account --permissions-admin-users --permissions-admin-servers --permissions-admin-system --permissions-admin-billing --permissions-admin-monitoring --realm-ids "realm-1" --allow-no-realm --vault-access --event-access --expires-at today --is-enabled --otp-code <code>` |

### `hoody containers` (42) — Container lifecycle, stats, and proxy permissions

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody containers authorize` |  | write | Authorize Container Access | `api.containers.authorize` | `hoody containers authorize abc-123` |
| `hoody containers copy` |  | write | Copy a container | `api.containers.copy` | `hoody containers copy abc-123 --target-project-id abc-123 --target-server-id abc-123 --name my-resource --ssh-public-key <ssh_public_key> --source-snapshot <source_snapshot> --copy-firewall-rules --copy-network-rules --kvm --dev-kvm` |
| `hoody containers create` |  | write | Create a new container | `api.containers.create` | `hoody containers create --project abc-123 --server-id abc-123 --name my-resource --color "#ff0000" --container-image <container_image> --ai --environment-vars <key=value> --ssh-public-key <ssh_public_key> --comment "Hello" --hoody-kit --dev-kit --kvm --dev-kvm --autostart --ramdisk --cache --cache-image --prespawn --bypass-prespawn --realm-ids "realm-1"` |
| `hoody containers delete` | rm, remove | destructive | Delete a container | `api.containers.delete` | `hoody containers delete abc-123` |
| `hoody containers env bulk-set` |  | write | Bulk set container environment variables | `api.env.bulkSet` | `hoody containers env bulk-set --body '{}'` |
| `hoody containers env delete` | rm, remove | destructive | Delete a single environment variable | `api.env.delete` | `hoody containers env delete --key <key>` |
| `hoody containers env list` | ls | read | List container environment variables | `api.env.list` | `hoody --container ctr-abc containers env list` |
| `hoody containers env set` |  | write | Set a single environment variable | `api.env.set` | `hoody containers env set --key <key> --value "hello"` |
| `hoody containers get` | show, describe | read | Get a container by ID | `api.containers.get` | `hoody containers get abc-123 --runtime <runtime> --include-proxy-domains true --include-proxy-permissions true` |
| `hoody containers kvm` |  | write | Enable or disable /dev/kvm passthrough (run full VMs inside the container). Rented/dedicated servers only; the container must be stopped. | `api.containers.setContainerKvm` | `hoody containers kvm abc-123 --kvm` |
| `hoody containers list` | ls | read | Get all containers | `api.containers.listIterator` | `hoody containers list --page 1 --limit 50 --sort-by id --sort-order asc --realm-id abc-123 --runtime <runtime>` |
| `hoody containers manage` |  | action | Manage container | `api.containers.manage` | `hoody containers manage abc-123 <operation>` |
| `hoody containers proxy default` |  | write | Update container default proxy permission policy | `api.proxyPermissionsContainer.updateDefault` | `hoody containers proxy default --if-match <if_match> --default allow` |
| `hoody containers proxy discovery groups list` | ls | read | List container proxy groups | `api.proxyDiscovery.listContainerProxyGroups` | `hoody containers proxy discovery groups list abc-123` |
| `hoody containers proxy discovery services get` |  | read | Get merged proxy view for a service | `api.proxyDiscovery.getContainerProxyService` | `hoody containers proxy discovery services get abc-123 <service>` |
| `hoody containers proxy discovery services list` | ls | read | List services referenced in proxy config | `api.proxyDiscovery.listContainerProxyServices` | `hoody containers proxy discovery services list abc-123` |
| `hoody containers proxy groups delete` |  | destructive | Remove container authentication group | `api.proxyPermissionsContainer.removeAuthGroup` | `hoody containers proxy groups delete --group-name <group_name> --if-match <if_match>` |
| `hoody containers proxy groups ip set` |  | write | Set IP authentication group (container) | `api.proxyPermissionsContainer.setIpGroup` | `hoody containers proxy groups ip set --group-name <group_name> --if-match <if_match> --range <range>` |
| `hoody containers proxy groups jwt set` |  | write | Set JWT authentication group (container) | `api.proxyPermissionsContainer.setJwtGroup` | `hoody containers proxy groups jwt set --group-name <group_name> --if-match <if_match> --secret <secret> --algorithm HS256 --sources nix --claims <key=value>` |
| `hoody containers proxy groups password set` |  | write | Set password authentication group (container) | `api.proxyPermissionsContainer.setPasswordGroup` | `hoody containers proxy groups password set --group-name <group_name> --if-match <if_match> --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody containers proxy groups permissions clear` | rm | destructive | Remove all program permissions for a container group | `api.proxyPermissionsContainer.removeGroup` | `hoody containers proxy groups permissions clear --group-name <group_name> --if-match <if_match>` |
| `hoody containers proxy groups permissions delete` |  | destructive | Remove a single program permission for a container group | `api.proxyPermissionsContainer.removeProgram` | `hoody containers proxy groups permissions delete --group-name <group_name> --program <program> --if-match <if_match>` |
| `hoody containers proxy groups permissions set` |  | write | Set container group program permission | `api.proxyPermissionsContainer.setGroup` | `hoody containers proxy groups permissions set --group-name <group_name> --if-match <if_match> --program <program> --access *` |
| `hoody containers proxy groups token set` |  | write | Set token authentication group (container) | `api.proxyPermissionsContainer.setTokenGroup` | `hoody containers proxy groups token set --group-name <group_name> --if-match <if_match> --body '{}'` |
| `hoody containers proxy hooks clear-service` |  | destructive | Clear all hooks for a service | `api.proxyHooks.clearContainerProxyServiceHooks` | `hoody containers proxy hooks clear-service abc-123 <service> --if-match <if_match>` |
| `hoody containers proxy hooks create` | new, add | write | Append or insert a new hook | `api.proxyHooks.addContainerProxyHook` | `hoody containers proxy hooks create abc-123 <service> --if-match <if_match> --match-method <match.method> --match-path <match.path> --match-headers <key=value> --script-subdomain <script.subdomain> --script-exec-id abc-123 --script-path <script.path> --timeout 10 --applies-to-groups <applies_to.groups> --position 10` |
| `hoody containers proxy hooks delete` | rm, remove | destructive | Remove a hook | `api.proxyHooks.removeContainerProxyHook` | `hoody containers proxy hooks delete abc-123 <service> abc-123 --if-match <if_match>` |
| `hoody containers proxy hooks get` |  | read | Get a single hook by id | `api.proxyHooks.getContainerProxyHook` | `hoody containers proxy hooks get abc-123 <service> abc-123` |
| `hoody containers proxy hooks list` | ls | read | List all proxy hooks for a container | `api.proxyHooks.listContainerProxyHooks` | `hoody containers proxy hooks list abc-123` |
| `hoody containers proxy hooks list-service` |  | read | List hooks for a specific service | `api.proxyHooks.listContainerProxyServiceHooks` | `hoody containers proxy hooks list-service abc-123 <service>` |
| `hoody containers proxy hooks move` |  | write | Move a hook to a new position | `api.proxyHooks.moveContainerProxyHook` | `hoody containers proxy hooks move abc-123 <service> abc-123 --if-match <if_match> --position 10` |
| `hoody containers proxy hooks update` | edit | write | Replace a hook in place | `api.proxyHooks.updateContainerProxyHook` | `hoody containers proxy hooks update abc-123 <service> abc-123 --if-match <if_match> --match-method <match.method> --match-path <match.path> --match-headers <key=value> --script-subdomain <script.subdomain> --script-exec-id abc-123 --script-path <script.path> --timeout 10 --applies-to-groups <applies_to.groups> --position 10` |
| `hoody containers proxy permissions delete` | rm | destructive | Delete container proxy permissions | `api.proxyPermissionsContainer.delete` | `hoody containers proxy permissions delete --if-match <if_match>` |
| `hoody containers proxy permissions get` |  | read | Get container proxy permissions | `api.proxyPermissionsContainer.get` | `hoody --container ctr-abc containers proxy permissions get` |
| `hoody containers proxy permissions replace` |  | write | Replace container proxy permissions JSON | `api.proxyPermissionsContainer.replace` | `hoody containers proxy permissions replace --if-match <if_match> --project proj-abc --groups <key=value> --permissions <key=value> --default allow --enable-proxy --hooks <key=value>` |
| `hoody containers proxy settings get` |  | read | Get container proxy root settings | `api.proxyDiscovery.getContainerProxySettings` | `hoody containers proxy settings get abc-123` |
| `hoody containers proxy settings update` | edit | write | Update container proxy root settings | `api.proxyDiscovery.updateContainerProxySettings` | `hoody containers proxy settings update abc-123 --if-match <if_match> --enable-proxy --default allow` |
| `hoody containers proxy state` |  | write | Update container proxy enable state | `api.proxyPermissionsContainer.updateState` | `hoody containers proxy state --if-match <if_match> --enable-proxy` |
| `hoody containers stats` |  | read | Get container resource statistics | `api.containers.getStats` | `hoody containers stats abc-123` |
| `hoody containers status-logs` |  | read | Get status logs for a container | `api.containers.getStatusLogs` | `hoody containers status-logs abc-123 --page 1 --limit 10 --sort-by transition_time --sort-order asc` |
| `hoody containers sync` |  | action | Sync a copied container with its source | `api.containers.sync` | `hoody containers sync abc-123` |
| `hoody containers update` | edit | write | Update a container | `api.containers.update` | `hoody containers update abc-123 --name my-resource --color "#ff0000" --ai --autostart --ramdisk-scope container --ramdisk --environment-vars <key=value> --ssh-public-key <ssh_public_key> --comment "Hello" --realm-ids "realm-1"` |

### `hoody events` (6) — Events and activity logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody events bulk-delete` |  | destructive | Bulk delete events | `api.events.bulkDelete` | `hoody events bulk-delete --event-type container.creating --resource-type container --resource-id abc-123 --before-date <before_date> --realm-id abc-123` |
| `hoody events cleanup` | prune | destructive | Cleanup old events | `api.events.cleanup` | `hoody events cleanup --retention-days 10` |
| `hoody events delete` | rm, remove | destructive | Delete a single event | `api.events.delete` | `hoody events delete abc-123` |
| `hoody events get` | show, describe | read | Get event details by ID | `api.events.get` | `hoody events get abc-123` |
| `hoody events list` | ls | read | List event history | `api.events.listIterator` | `hoody events list --limit 100 --offset 0 --sort-by created_at --sort-order asc --event-type container.creating --resource-type container --resource-id abc-123 --project-id abc-123 --container-id abc-123 --start-date <start_date> --end-date <end_date> --realm-id abc-123` |
| `hoody events stats` |  | read | Get event statistics | `api.events.getStats` | `hoody events stats --start-date <start_date> --end-date <end_date> --realm-id abc-123` |

### `hoody firewall` (8) — Container firewall rules — ingress (inbound) and egress (outbound)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody firewall egress create` |  | write | Add Egress Rule | `api.firewall.addEgressRule` | `hoody firewall egress create --action allow --protocol tcp --description "My description" --destination-port <destination_port> --destination <destination> --source-port <source_port> --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall egress delete` |  | destructive | Remove Egress Rule(s) | `api.firewall.removeEgressRule` | `hoody firewall egress delete --all --action allow --protocol tcp --destination-port <destination_port> --destination <destination> --source-port <source_port> --description "My description" --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall egress toggle` |  | action | Toggle Egress Rule State | `api.firewall.toggleEgressRule` | `hoody firewall egress toggle --state enabled --action allow --protocol tcp --destination-port <destination_port> --source-port <source_port> --destination <destination> --description "My description" --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress create` |  | write | Add Ingress Rule | `api.firewall.addIngressRule` | `hoody firewall ingress create --action allow --protocol tcp --description "My description" --destination-port <destination_port> --source nix --source-port <source_port> --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress delete` |  | destructive | Remove Ingress Rule(s) | `api.firewall.removeIngressRule` | `hoody firewall ingress delete --all --action allow --protocol tcp --destination-port <destination_port> --source nix --source-port <source_port> --description "My description" --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress toggle` |  | action | Toggle Ingress Rule State | `api.firewall.toggleIngressRule` | `hoody firewall ingress toggle --state enabled --action allow --protocol tcp --destination-port <destination_port> --source-port <source_port> --source nix --description "My description" --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall list` | ls | read | List container firewall rules | `api.firewall.listIterator` | `hoody --container ctr-abc firewall list` |
| `hoody firewall reset` |  | destructive | Reset container firewall | `api.firewall.reset` | `hoody --container ctr-abc firewall reset` |

### `hoody images` (7) — Container image marketplace (browse, purchase, rate, import, icons)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody images get` | show, describe | read | Get public image details | `api.images.getDetails` | `hoody images get abc-123` |
| `hoody images icon` |  | read | Get image icon | `api.images.getIcon` | `hoody images icon abc-123` |
| `hoody images import-free` |  | write | Import free image | `api.images.importFree` | `hoody images import-free abc-123` |
| `hoody images list` |  | read | List public images | `api.images.listPublicIterator` | `hoody images list --os linux --architecture <architecture> --min-price 10 --max-price 10 --min-rating 10 --max-rating 10 --search "my search" --page 1 --limit 20 --sort-by alias --sort-order asc` |
| `hoody images mine` |  | read | List images you own | `api.images.listIterator` | `hoody images mine --page 1 --limit 20 --sort-by created_at --sort-order asc` |
| `hoody images purchase` | buy | write | Purchase image | `api.images.purchase` | `hoody images purchase abc-123` |
| `hoody images rate` |  | write | Rate image | `api.images.rate` | `hoody images rate abc-123 --rating 10` |

### `hoody inbox` (4) — Platform account notification inbox

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody inbox list` |  | read | Get all notifications for the authenticated user | `api.notifications.listIterator` | `hoody inbox list` |
| `hoody inbox list-public` |  | read | Get all public notifications | `api.notifications.listPublicIterator` | `hoody inbox list-public` |
| `hoody inbox mark` |  | write | Mark a notification as read | `api.notifications.markRead` | `hoody inbox mark abc-123` |
| `hoody inbox mark-all` |  | write | Mark all notifications as read | `api.notifications.markAllRead` | `hoody inbox mark-all` |

### `hoody ip` (1) — IP address management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ip get` |  | read | Get IP Information | `api.utilities.getIpInfo` | `hoody ip get` |

### `hoody meta` (1) — API metadata and signing keys

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody meta get` |  | read | Get Hoody API Signing Public Key | `api.meta.getPublicKey` | `hoody meta get` |

### `hoody network` (5) — Container network configuration

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody network delete` | rm, remove | destructive | Remove container network configuration | `api.containers.removeNetworkConfig` | `hoody --container ctr-abc network delete` |
| `hoody network get` |  | read | Get container network configuration | `api.containers.getNetworkConfig` | `hoody --container ctr-abc network get` |
| `hoody network start` |  | action | Start container network proxy/blocking | `api.containers.startNetwork` | `hoody --container ctr-abc network start` |
| `hoody network stop` |  | action | Stop container network proxy/blocking | `api.containers.stopNetwork` | `hoody --container ctr-abc network stop` |
| `hoody network update` | edit | write | Update container network configuration | `api.containers.updateNetworkConfig` | `hoody --proxy <proxy> network update --type socks5 --country <country> --city <city> --region eu-west-1 --comment "Hello" --dns-servers <dns_servers>` |

### `hoody pools` (11) — Pool management and invitations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pools create` | new, add | write | Create pool | `api.pools.create` | `hoody pools create --name my-resource --description "My description" --settings <key=value>` |
| `hoody pools delete` | rm, remove | destructive | Delete pool | `api.pools.delete` | `hoody pools delete abc-123` |
| `hoody pools get` | show, describe | read | Get pool details | `api.pools.get` | `hoody pools get abc-123` |
| `hoody pools invitations accept` |  | action | Accept invitation | `api.poolInvitations.accept` | `hoody pools invitations accept abc-123` |
| `hoody pools invitations list` |  | read | List pending invitations | `api.poolInvitations.list` | `hoody pools invitations list` |
| `hoody pools invitations reject` |  | action | Reject invitation | `api.poolInvitations.reject` | `hoody pools invitations reject abc-123` |
| `hoody pools list` |  | read | List user pools | `api.pools.listIterator` | `hoody pools list` |
| `hoody pools members delete` |  | destructive | Remove member | `api.poolMembers.remove` | `hoody pools members delete abc-123 abc-123` |
| `hoody pools members invite` |  | write | Invite member | `api.poolMembers.invite` | `hoody pools members invite abc-123 --username alice --role admin` |
| `hoody pools members update-role` |  | write | Update member role | `api.poolMembers.updateRole` | `hoody pools members update-role abc-123 abc-123 --role admin` |
| `hoody pools update` | edit | write | Update pool | `api.pools.update` | `hoody pools update abc-123 --description "My description"` |

### `hoody projects` (23) — Manage projects

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody projects create` | new, add | write | Create a new project | `api.projects.create` | `hoody projects create --alias my-resource --color "#ff0000" --max-containers 10 --realm-ids "realm-1"` |
| `hoody projects delete` | rm, remove | destructive | Delete project | `api.projects.delete` | `hoody projects delete abc-123 --include-deleted-items` |
| `hoody projects get` | show, describe | read | Get project by ID | `api.projects.get` | `hoody projects get abc-123 --include-permissions` |
| `hoody projects list` | ls | read | List all projects | `api.projects.listIterator` | `hoody projects list --page 1 --limit 10 --sort-by id --sort-order asc --realm-id abc-123` |
| `hoody projects permissions create` |  | write | Grant project access | `api.projects.addPermission` | `hoody projects permissions create --project abc-123 --user-id abc-123 --permission-level read` |
| `hoody projects permissions delete` |  | destructive | Revoke project access | `api.projects.removePermission` | `hoody projects permissions delete --project abc-123 --permission-id abc-123` |
| `hoody projects permissions list` |  | read | List project permissions | `api.projects.listPermissionsIterator` | `hoody projects permissions list --page 10 --limit 10 --sort-by id --sort-order asc --project abc-123` |
| `hoody projects permissions update` |  | write | Update project permission | `api.projects.updatePermission` | `hoody projects permissions update --project abc-123 --permission-id abc-123 --permission-level read` |
| `hoody projects proxy default` |  | write | Update project default proxy permission policy | `api.proxyPermissionsProject.updateDefault` | `hoody projects proxy default --project abc-123 --if-match <if_match> --default allow` |
| `hoody projects proxy groups delete` |  | destructive | Remove project authentication group | `api.proxyPermissionsProject.removeAuthGroup` | `hoody projects proxy groups delete --project abc-123 --group-name <group_name> --if-match <if_match>` |
| `hoody projects proxy groups ip set` |  | write | Set IP authentication group (project) | `api.proxyPermissionsProject.setIpGroup` | `hoody projects proxy groups ip set --project abc-123 --group-name <group_name> --if-match <if_match> --range <range>` |
| `hoody projects proxy groups jwt set` |  | write | Set JWT authentication group (project) | `api.proxyPermissionsProject.setJwtGroup` | `hoody projects proxy groups jwt set --project abc-123 --group-name <group_name> --if-match <if_match> --secret <secret> --algorithm HS256 --sources nix --claims <key=value>` |
| `hoody projects proxy groups password set` |  | write | Set password authentication group (project) | `api.proxyPermissionsProject.setPasswordGroup` | `hoody projects proxy groups password set --project abc-123 --group-name <group_name> --if-match <if_match> --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody projects proxy groups permissions clear` | rm | destructive | Remove all program permissions for a project group | `api.proxyPermissionsProject.removeGroup` | `hoody projects proxy groups permissions clear --project abc-123 --group-name <group_name> --if-match <if_match>` |
| `hoody projects proxy groups permissions delete` |  | destructive | Remove a single program permission for a project group | `api.proxyPermissionsProject.removeProgram` | `hoody projects proxy groups permissions delete --project abc-123 --group-name <group_name> --program <program> --if-match <if_match>` |
| `hoody projects proxy groups permissions set` |  | write | Set project group program permission | `api.proxyPermissionsProject.setGroup` | `hoody projects proxy groups permissions set --project abc-123 --group-name <group_name> --if-match <if_match> --program <program> --access *` |
| `hoody projects proxy groups token set` |  | write | Set token authentication group (project) | `api.proxyPermissionsProject.setTokenGroup` | `hoody projects proxy groups token set --project abc-123 --group-name <group_name> --if-match <if_match> --body '{}'` |
| `hoody projects proxy permissions delete` | rm | destructive | Delete project proxy permissions | `api.proxyPermissionsProject.delete` | `hoody projects proxy permissions delete --project abc-123 --if-match <if_match>` |
| `hoody projects proxy permissions get` |  | read | Get project proxy permissions | `api.proxyPermissionsProject.get` | `hoody projects proxy permissions get --project abc-123` |
| `hoody projects proxy permissions replace` |  | write | Replace project proxy permissions JSON | `api.proxyPermissionsProject.replace` | `hoody projects proxy permissions replace --project abc-123 --if-match <if_match> --groups <key=value> --permissions <key=value> --default allow --enable-proxy` |
| `hoody projects proxy state` |  | write | Update project proxy enable state | `api.proxyPermissionsProject.updateState` | `hoody projects proxy state --project abc-123 --if-match <if_match> --enable-proxy` |
| `hoody projects stats` |  | read | Get statistics for all containers in a project | `api.projects.getStats` | `hoody projects stats abc-123` |
| `hoody projects update` | edit | write | Update project | `api.projects.update` | `hoody projects update abc-123 --alias my-resource --color "#ff0000" --max-containers 10 --realm-ids "realm-1"` |

### `hoody proxy` (16) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy create` | new, add | write | Create a new proxy alias | `api.proxyAliases.create` | `hoody proxy create --container-id abc-123 --alias my-resource --program <program> --port 8080 --index 10 --target-path /home/user/file.txt --allow-path-override --expires-at 2026-12-31T23:59:59Z --enabled` |
| `hoody proxy delete` | rm, remove | destructive | Delete proxy alias | `api.proxyAliases.delete` | `hoody proxy delete abc-123` |
| `hoody proxy get` | show, describe | read | Get proxy alias by ID | `api.proxyAliases.get` | `hoody proxy get abc-123` |
| `hoody proxy list` | ls | read | List proxy aliases | `api.proxyAliases.listIterator` | `hoody proxy list --project-id abc-123 --container-id abc-123 --realm-id abc-123` |
| `hoody proxy logs clear` |  | destructive | Clear all logs |  |  |
| `hoody proxy logs config get` |  | read | Get logging configuration |  |  |
| `hoody proxy logs config resolved` |  | read | Get the effective (resolved) log config for a scope |  |  |
| `hoody proxy logs config update` | edit | write | Update logging configuration |  |  |
| `hoody proxy logs db health` |  | read | Check database health |  |  |
| `hoody proxy logs db repair` |  | write | Repair the logs DB (online integrity check + reindex) |  |  |
| `hoody proxy logs db reset` |  | write | Reset the logs DB (destroys the main logs; audit is preserved) |  |  |
| `hoody proxy logs db vacuum` |  | write | VACUUM the logs DB (reclaim disk) |  |  |
| `hoody proxy logs export` |  | read | Export logs as NDJSON |  |  |
| `hoody proxy logs rotate-audit` |  | write | Rotate the audit DB (archives and starts fresh) |  |  |
| `hoody proxy set-state` |  | write | Enable or disable proxy alias | `api.proxyAliases.setState` | `hoody proxy set-state abc-123 --enabled` |
| `hoody proxy update` | edit | write | Update proxy alias | `api.proxyAliases.update` | `hoody proxy update abc-123 --alias my-resource --program <program> --port 8080 --index 10 --target-path /home/user/file.txt --allow-path-override --expires-at 2026-12-31T23:59:59Z --enabled` |

### `hoody realms` (1) — Platform realms

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody realms list` | ls | read | List your realm IDs | `api.realms.list` | `hoody realms list --include-usage` |

### `hoody servers` (7) — Server rental marketplace, rentals, and remote commands

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody servers commands` |  | read | Get available commands | `api.serverCommands.listIterator` | `hoody servers commands abc-123 --category general --risk-level low` |
| `hoody servers exec` |  | action | Execute server command | `api.serverCommands.execute` | `hoody servers exec abc-123 --command-id abc-123 --command-slug <command_slug> --parameters <parameters> --wait --timeout 10 --confirmation-token <confirmation_token>` |
| `hoody servers extend` |  | write | Extend rental | `api.rentals.extend` | `hoody servers extend abc-123 --expected-rental-end <expected_rental_end> --additional-days 10 --max-charge-cents 10` |
| `hoody servers get` | show, describe | read | Get server details (alias for /rentals/:id) | `api.serverRental.get` | `hoody servers get abc-123` |
| `hoody servers list` | ls | read | List user servers (alias for /rentals) | `api.serverRental.listIterator` | `hoody servers list` |
| `hoody servers marketplace` | browse | read | Browse rental marketplace | `api.serverRental.browseIterator` | `hoody servers marketplace --country <country> --region eu-west-1 --max-price-per-day 10 --available-durations <available_durations> --min-cpu-cores 10 --min-cpu-score 10 --cpu-score-type passmark --min-ram-gb 10 --ram-types DDR3 --min-total-storage-gb 10 --disk-types HDD --min-bandwidth-mbps 10 --min-traffic-tb 10 --unlimited-traffic-only --category compute --featured-only` |
| `hoody servers rent` |  | write | Rent server | `api.serverRental.rent` | `hoody servers rent abc-123 --pool-id abc-123 --rental-days 10 --max-charge-cents 10` |

### `hoody snapshots` (5) — Container snapshots

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody snapshots create` |  | write | Create container snapshot | `api.containers.createSnapshot` | `hoody snapshots create --alias my-resource --expiry 10` |
| `hoody snapshots delete` | rm, remove | destructive | Delete container snapshot | `api.containers.deleteSnapshot` | `hoody snapshots delete --name my-resource` |
| `hoody snapshots list` | ls | read | Get container snapshots | `api.containers.listSnapshotsIterator` | `hoody --container ctr-abc snapshots list` |
| `hoody snapshots restore` |  | action | Restore container from snapshot | `api.containers.restoreSnapshot` | `hoody snapshots restore --name my-resource` |
| `hoody snapshots update-alias` |  | write | Update snapshot alias | `api.containers.updateSnapshotAlias` | `hoody snapshots update-alias --name my-resource --alias my-resource` |

### `hoody storage` (9) — Storage shares

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody storage create` | new | write | Create storage share | `api.storageShares.create` | `hoody storage create --source-path /home/user/file.txt --target-container-id abc-123 --target-project-id abc-123 --mode readonly --alias my-resource --label my-label --description "My description" --enabled --expires-at 1750000000` |
| `hoody storage delete` | rm, remove | destructive | Delete storage share | `api.storageShares.delete` | `hoody storage delete abc-123` |
| `hoody storage get` | show, describe | read | Get storage share | `api.storageShares.get` | `hoody storage get --share-id abc-123` |
| `hoody storage incoming list` |  | read | Get incoming shares | `api.storageShares.listIncoming` | `hoody --container ctr-abc storage incoming list` |
| `hoody storage incoming list-all` |  | read | Get all incoming shares | `api.storageShares.listIncomingGlobalIterator` | `hoody storage incoming list-all --realm-id abc-123` |
| `hoody storage incoming toggle-mount` |  | action | Toggle incoming share mount | `api.storageShares.toggleIncomingMount` | `hoody storage incoming toggle-mount --share-id abc-123 --mount` |
| `hoody storage list` | ls | read | List storage shares | `api.storageShares.listIterator` | `hoody storage list --target-type container --label my-label --status active --realm-id abc-123` |
| `hoody storage list-all` |  | read | List storage shares across all realms (privileged scope) | `api.storageShares.listGlobalIterator` | `hoody storage list-all --realm-id abc-123` |
| `hoody storage update` | edit | write | Update storage share | `api.storageShares.update` | `hoody storage update --share-id abc-123 --mode readonly --alias my-resource --label my-label --description "My description" --enabled --expires-at 1750000000` |

### `hoody users` (4) — User management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody users get` | show, describe | read | Get user by ID | `api.users.get` | `hoody users get abc-123` |
| `hoody users redeem-invite` |  | write | Redeem a free-tier invite code to claim your free server | `api.users.redeemInviteCode` | `hoody users redeem-invite --code <code>` |
| `hoody users retry-setup` |  | write | Retry free-tier account setup | `api.users.retrySetup` | `hoody users retry-setup --region eu-west-1` |
| `hoody users update` | edit | write | Update user profile | `api.users.update` | `hoody users update abc-123 --alias my-resource --public-key pk_abc123 --metadata <key=value> --password <password> --current-password <current_password> --is-admin --is-banned` |

### `hoody vault` (6) — Secure key-value vault

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vault clear` |  | destructive | Clear entire vault | `api.vault.clear` | `hoody vault clear --realm-id abc-123` |
| `hoody vault delete` |  | destructive | Delete vault key | `api.vault.delete` | `hoody vault delete <key> --realm-id abc-123` |
| `hoody vault get` |  | read | Get vault key | `api.vault.get` | `hoody vault get <key> --realm-id abc-123` |
| `hoody vault list` |  | read | List vault keys | `api.vault.listIterator` | `hoody vault list --realm-id abc-123` |
| `hoody vault set` |  | write | Set vault key | `api.vault.set` | `hoody vault set <key> --realm-id abc-123 --value "hello"` |
| `hoody vault stats` |  | read | Get vault statistics | `api.vault.getStats` | `hoody vault stats --realm-id abc-123` |

### `hoody wallet` (19) — Balances, transactions, payments, and invoices

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody wallet balance ai` |  | read | Get AI balance (limit, usage, remaining) | `api.wallet.getAiBalance` | `hoody wallet balance ai` |
| `hoody wallet balance general` |  | read | Get general balance only | `api.wallet.getGeneralBalance` | `hoody wallet balance general` |
| `hoody wallet balance get` |  | read | Get aggregate balances (general + AI) | `api.wallet.getAggregateBalances` | `hoody wallet balance get` |
| `hoody wallet invoices download` |  | read | Download invoice PDF | `api.wallet.downloadInvoicePdf` | `hoody wallet invoices download abc-123` |
| `hoody wallet invoices generate` |  | action | Generate invoice for transaction | `api.wallet.generateInvoice` | `hoody wallet invoices generate abc-123` |
| `hoody wallet invoices get` |  | read | Get invoice by ID | `api.wallet.getInvoice` | `hoody wallet invoices get abc-123` |
| `hoody wallet invoices list` | ls | read | Get all invoices | `api.wallet.listInvoicesIterator` | `hoody wallet invoices list --page 1 --limit 20 --sort-by created_at --sort-order asc --filter <filter>` |
| `hoody wallet payment-methods create` |  | write | Add a new payment method | `api.wallet.addPaymentMethod` | `hoody wallet payment-methods create --name my-resource --details <details> --is-default` |
| `hoody wallet payment-methods delete` | rm | destructive | Delete a payment method | `api.wallet.deletePaymentMethod` | `hoody wallet payment-methods delete abc-123` |
| `hoody wallet payment-methods get` |  | read | Get payment method by ID | `api.wallet.getPaymentMethod` | `hoody wallet payment-methods get abc-123` |
| `hoody wallet payment-methods list` | ls | read | Get all payment methods | `api.wallet.listPaymentMethodsIterator` | `hoody wallet payment-methods list` |
| `hoody wallet payment-methods set-default` |  | write | Set a payment method as default | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payment-methods set-default abc-123` |
| `hoody wallet payment-methods update` |  | write | Update a payment method | `api.wallet.updatePaymentMethod` | `hoody wallet payment-methods update abc-123 --details <details> --status active --is-default` |
| `hoody wallet payments create` |  | write | Process a payment |  |  |
| `hoody wallet payments status` |  | read | Get payment status |  |  |
| `hoody wallet transactions fees` |  | read | List AI credit fee history (platform fees charged on AI transfers) | `api.wallet.listAiFeeHistoryIterator` | `hoody wallet transactions fees --page 1 --limit 20 --sort-by created_at --sort-order asc` |
| `hoody wallet transactions get` | show | read | Get transaction by ID | `api.wallet.getTransaction` | `hoody wallet transactions get abc-123` |
| `hoody wallet transactions list` | ls | read | List transactions | `api.wallet.listTransactionsIterator` | `hoody wallet transactions list --limit 20 --sort-by id --sort-order asc` |
| `hoody wallet transfer` |  | write | Transfer from general balance to AI credits | `api.wallet.transferToAi` | `hoody wallet transfer --amount <amount> --idempotency-key <idempotency_key> --expected-fee-bps 10` |

