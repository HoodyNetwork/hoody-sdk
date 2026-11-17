> _**CLI skill · `api` namespace** · ~24,411 tokens · hoody-sdk v1.0.1_

# `api` — Platform control plane: identity, projects, computers, billing, vault

## Purpose

Control plane outside computer kits. Owns identity (signup, login, OAuth, 2FA, auth tokens), project/computer hierarchy, proxy permissions, network/firewall/storage, billing, rentals, user key-value vault, pools. Also exposes account-wide notifications/events/activity inbox, and the Bot URLs that give an agent Bot a public address. All other namespaces depend on IDs/tokens minted here.

## When to use

- Sign users in through their own browser; mint auth tokens only for unattended automation the user asked for.
- Create/list/mutate/destroy projects, computers, snapshots, proxy-aliases.
- Grant/revoke project/computer access; set proxy auth (password/token/JWT/IP).
- Wallet, billing, rental ops.
- User-scoped key-value vault; values are stored as sent, so encrypt sensitive values client-side before storing them.
- Account-wide notification/event/activity queries.
- Share an agent Bot through a public link: create a Bot URL (`https://<label>.hoody.bot`) and named keys for the people you share it with, or shut it off (`hoody boturls panic`).

## When NOT to use

- File I/O, shell/program, SQLite, GUI/browser, background processes, agent runtime — use `files`, `terminal`/`exec`, `sqlite`, `display`/`browser`, `daemon`, `agent` respectively.

## Prerequisites

- Control plane at `https://api.hoody.com`.
- Bearer token in `Authorization`. Get it from browser sign-in (`hoody auth device start` + `hoody auth device poll`, see `SKILL-CLI.md` § Login; 1d JWT / 7d refresh), or from `POST /api/v1/users/auth/login` (HTTP form; the CLI reaches it with `hoody login` instead of a generated command) when the user chooses a password login. `hoody auth tokens create` (long-lived, scopable) is for unattended automation only. Starting and polling a browser sign-in needs no bearer token.
- 2FA management (`hoody auth 2fa setup start`, `hoody auth 2fa setup confirm`, `hoody auth 2fa disable`, `hoody auth 2fa backupcodes rotate` and the status read) takes a login session JWT, or account-password HTTP Basic auth (which is subject to its own password and 2FA checks); a long-lived `hoody auth tokens create` token is refused with 403 there. On top of that, the bodies differ: `hoody auth 2fa setup start` needs the password; `hoody auth 2fa setup confirm` needs the OTP code; `hoody auth 2fa verify` needs the code plus the `temp_token` (in the body, or as the `Authorization: Bearer` header); `hoody auth 2fa disable` needs password + OTP **or** backup code; `hoody auth 2fa backupcodes rotate` needs password + a **6-digit TOTP only** (`^\d{6}$` — a backup code fails schema validation with 422). Login-time `hoody auth 2fa verify` needs no session.
- Project/computer writes: project owner or matching permission row. Creating a computer is narrower: an admin or the project owner (a permission row alone does not authorize it), and an auth token must also have `permissions.computers.create` set to true.
- Billing: prerequisites depend on the operation. A hosted crypto invoice (`hoody wallet payments crypto invoices create`) needs no saved payment method, only a login session (auth tokens are refused 403); server rentals and extensions spend Referral credit first, then the general wallet balance, so fund the general wallet when Referral credit does not cover the charge.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap through the user's browser

1. New user: they sign up and verify their email at `https://api.hoody.com/auth/signup` in their own browser.
2. `hoody auth device start` — keep `data.device_code` private; give the user `verification_uri_complete` and `user_code`.
3. `hoody auth device poll` with that `device_code` (and the `code_verifier` when start sent a `code_challenge`) every `interval` seconds until it returns the session (`data.token`, `data.refreshToken`); the waiting states are 400 with `data.error`. Steps and states: `SKILL-CLI.md` § Login.
4. Use the session: the CLI saves it for you.
5. `hoody auth whoami`

`hoody login --web --no-browser` runs steps 2 and 3 for you and saves the session.
Existing account: always browser sign-in first; if it fails, stalls or is refused, ask for a token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password (use one only if offered). Never repeat or store a secret. Password path (an offered password, or the user's own code): `POST /api/v1/auth/signup` (HTTP form; the CLI reaches it with `hoody signup` instead of a generated command) → `hoody auth email verify` → `POST /api/v1/users/auth/login` (HTTP form; the CLI reaches it with `hoody login` instead of a generated command) (+ `hoody auth 2fa verify` with the `temp_token` when 2FA is on).

### 2. Mint a long-lived auth token (unattended automation only)

1. `hoody auth tokens create`
2. `hoody auth tokens list`
3. `hoody auth tokens realms add`
4. `hoody auth tokens realms remove`
5. `hoody auth tokens copy`
6. `hoody auth tokens delete`

### 3. Set up 2FA

1. `hoody auth 2fa setup start`
2. `hoody auth 2fa setup confirm` (confirming signs out the other sessions and replaces the token pair of a login session's own session, so the old pair stops working; a login-session caller gets that fresh pair in the response that the SDK returns but does not adopt, and `hoody auth 2fa setup confirm` does not save it, so sign in again)
3. `hoody auth 2fa status`
4. `hoody auth 2fa backupcodes rotate`
5. `hoody auth 2fa tokengate enable` / `hoody auth 2fa tokengate disable`

### 4. Create first project + computer

`hoody computers create` needs a `server_id` and a project id; see § Quirks & gotchas.
1. `hoody realms list`
2. `hoody servers list` (pick the `server_id`)
3. `hoody images list` (only when you want a non-default image)
4. `hoody projects create`
5. `hoody computers create` (with `server_id`)
6. `hoody computers start` (when the computer is not already running)
7. `hoody computers get`

An owner or administrator lists the computer's proxy aliases by getting it with `include_proxy_domains` set to `true`: `hoody computers get <id> --include-proxy-domains`. The `proxy_domains` array is only populated when `include_proxy_domains` is true, and it holds the aliases created with `hoody proxy aliases create` (each with its `url`), not the built-in kit URLs: for an owner or administrator, a computer with no aliases returns an empty array. A project member receives a reduced view without `proxy_domains`, even when `include_proxy_domains` is true. Build kit URLs from the pattern in § Proxy URLs.

### 5. Grant another user access

Project-scope analogues live under `hoody projects proxy permissions *` and `hoody projects proxy groups *`. Project member changes (`hoody projects permissions add`, `hoody projects permissions update`, `hoody projects permissions remove`) and every `hoody projects proxy permissions *` and `hoody projects proxy groups *` read or write need the base API host and an unrestricted credential: a realm host or a realm-restricted token gets `403`. Every proxy-permissions write (steps 6 to 9, and their project-scope analogues) is guarded by optimistic concurrency: it must carry `If-Match: file:v<N>`, where `N` is the document's current `file_version`. Read it with `hoody computers proxy permissions get` (the response carries `file_version` and an `ETag`); each successful write bumps the version and returns the new `ETag`, so pass that one to the next write. A missing header is refused 428, and a malformed or stale one 412. CLI: pass `--if-match file:v<N>`.
1. `hoody projects permissions list`
2. `hoody projects permissions add`
3. `hoody projects permissions update`
4. `hoody projects permissions remove`
5. `hoody computers proxy permissions get` (read `file_version`)
6. `hoody computers proxy groups password set` (If-Match)
7. `hoody computers proxy groups token set` (If-Match)
8. `hoody computers proxy groups jwt set` (If-Match)
9. `hoody computers proxy enable` / `hoody computers proxy disable` (If-Match)

### 6. Computer exposure & shares

1. `hoody network update`
2. `hoody network start`
3. `hoody firewall egress create`
4. `hoody firewall ingress create`
5. `hoody proxy aliases create`
6. `hoody proxy aliases enable` / `hoody proxy aliases disable`
7. `hoody storage shares create`
8. `hoody storage computers incoming list` (computer-scoped)
9. `hoody storage incoming mount` / `hoody storage incoming unmount`
10. `hoody storage shares delete`

### 7. Computer lifecycle ops (snapshot/restore/copy + env + kvm)

1. `hoody snapshots create`
2. `hoody snapshots list`
3. `hoody snapshots restore`
4. `hoody computers copy`
5. `hoody snapshots delete`
6. `hoody computers env list`
7. `hoody computers env set`
8. `hoody computers env update`
9. `hoody computers env delete`
10. `hoody computers kvm enable` / `hoody computers kvm disable` — enable/disable `/dev/kvm` passthrough (run full VMs inside the computer) on a **stopped** computer. Also settable at creation via the `kvm` field/flag on `hoody computers create`.

### 8. Billing: wallet → rent

1. `hoody wallet payments methods create`
2. `hoody wallet payments methods default set`
3. `hoody wallet payments card checkout create` (crypto: `hoody wallet payments crypto invoices create`)
4. `hoody wallet payments card intents get` (crypto: `hoody wallet payments crypto intents get`)
5. `hoody wallet balances get`
6. `hoody wallet transactions list`
7. `hoody servers marketplace list`
8. `hoody servers rent`
9. `hoody servers list`
10. `hoody servers extend`
11. `hoody servers commands run`

Rentals and extensions are charged to Referral credit first, then the general balance. Call `hoody wallet credits transfer` only to fund AI usage: it moves money out of that general balance into AI credits, minus a platform fee, so it leaves less for rentals.

With an auth token limited to realms, steps 1, 2, 5 and 6 (payment methods, balances, transactions) are refused with 403 `REALM_TOKEN_ACCOUNT_MONEY`, and so are invoices; the money is the whole account's, not the realm's. Rent directly (steps 7-8 work, a shared server included) and handle `INSUFFICIENT_BALANCE`, whose `data` then carries no `available_cents`.

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands. ONE exception worth reading before you call it: the notification inbox is NOT uniform CRUD. `hoody inbox list` needs `resources.read_account` on the token (403 without it — the external_customer, dev_team, finance_team and read_only templates all deny it, and older tokens may lack it too unless their permissions were updated) and refuses a token restricted to realms even with it (403 `This token is restricted to realms and cannot read account-wide data`; a login session reads it), and `hoody inbox markread` / `hoody inbox markread --all` refuse EVERY auth token regardless of permissions, because acknowledging is how the record of an account event is dismissed. `hoody inbox summary get` (unread count and newest position, no bodies) is gated the same way. `hoody inbox announcements list` needs no auth, but it returns only public system announcements, not the account inbox, so it is not a substitute for `hoody inbox list`.

### 9. Give an agent Bot a public URL (Bot URL)

1. `hoody agent bots get` — read the Bot's `realm`, `id` and `uid` (the computer's agent; see `agent` Example 1)
2. `hoody boturls label suggest` (optional: a free label, not reserved until you create with it)
3. `hoody boturls create` — `{ computer_id, bot: { realm, id, uid }, label?, cors?, limits? }`; no keys yet
4. `hoody boturls get` — poll until `propagation.state` is `applied` (callers see a change about 11 seconds later); poll again after each key you mint, rotate or revoke
5. `hoody boturls keys create` — one named key per person; the secret is in this answer only. A login-session caller whose account has 2FA (with its API-key requirement on, the default) must send an unused `otp_code` (`--otp-code <code>`) here, on a key rotate, on a repoint and on a Bot URL update or key update that turns access on or widens it, else `400 OTP_REQUIRED`; a caller with an `hdy_` auth token needs none
6. `hoody boturls keys update` (rename, pause with `enabled: false`, IPv4 allowlist, expiry, notes) / `hoody boturls keys rotate` / `hoody boturls keys revoke` / `hoody boturls keys revoke --all`
7. `hoody boturls update` (on/off, browser access, limits) / `hoody boturls repoint` (another Bot, same label and keys) / `hoody boturls panic` (off and every key revoked) / `hoody boturls delete` (its reply is the only propagation snapshot: `get` answers 404 `BOT_URL_NOT_FOUND` right away, which does not mean the removal is applied)

A caller needs no Hoody login: it sends a key to the Bot URL (`BotUrlClient` in the SDK, `hoody boturls ask <url> "…"` in the CLI, or plain HTTPS). The `agent` namespace notes (Example 4) run this end to end, and the `## Bot URLs` appendix section is the caller-side reference.

### 10. Buy a paid subserver in a chosen region

1. `hoody servers plans list` — the plans on sale; each `id` is a plan version
2. `hoody servers plans regions` — `{ plan_id }`: the regions for that plan, each with `region` (the code), `country`, `city` and `available` (the plan can be bought there now)
3. `hoody servers plans quote` — `{ plan_id, region? }`: read `available` and `charge_cents`; its `region` is where the subserver would go
4. `hoody servers subscriptions buy` — `{ plan_id, region?, idempotency_key, max_charge_cents }` with the quoted `charge_cents` as the ceiling; it charges the first month at once and answers 202 with an `operation`
5. `hoody servers jobs get` — poll the operation until `result` is set; only `succeeded` is a purchase (stop and tell the user on `failed` or `superseded`)
6. `hoody servers subscriptions list` — wait for the subscription's `state` to be `active`; then its `server_id` is the server to create computers on (it can be set earlier, while `provisioning`, and is null again after a failed delivery); its `region` says where the subserver is

Leave `region` out for Automatic: Hoody picks a region that has room. With `region`, the subserver is placed there or the purchase is refused with 409 `NO_PAID_CAPACITY_IN_REGION` and nothing is charged; it is never placed in another region. Ask the user which region they want before buying: a subserver never changes region, and an upgrade keeps it where it is. In the CLI: `hoody servers plans regions <plan-id>`, then `--region <code>` on `hoody servers plans quote` and `hoody servers subscriptions buy`.

## Quirks & gotchas

- Browser sign-in (`hoody auth device poll`) is not RFC 8628 on the wire: send only the JSON fields shown, with no OAuth client or grant fields; the waiting states are HTTP 400 `{"statusCode":400,"data":{"error":"authorization_pending"}}` with the state under `data`, and the success body is a login session (`data.token`, `data.refreshToken`), not `access_token`. `expired_token` also covers a code already redeemed; `access_denied` also covers a missing or wrong PKCE verifier.
- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `POST /api/v1/users/auth/logout` (HTTP form; the CLI reaches it with `hoody logout --all` instead of a generated command) is a logout-ALL for JWTs — every access and refresh JWT issued before that moment stops working (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `hoody auth tokens delete`). `hoody auth refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`; a missing or empty body field is refused as `422` schema validation. Refresh tokens are single-use: each successful refresh replaces both tokens. Never reuse the old refresh token: reuse returns 401, and reuse more than 30 seconds after its first use also ends that login session (its current token pair), leaving the account's other sessions active. `hoody auth refresh` uses the saved refresh token, or the value given with `--refresh-token`, and sends it in both the body and the `Authorization` header. For unattended automation the user asked for, a long-lived `hoody auth tokens create` token avoids refresh handling.
- `hoody servers regions list -o json` prints an object with a `regions` array.
- Duplicate signup returns `200` (anti-enumeration). For an unverified user a repeat signup never installs its password: with a different password it clears the stored one (the signup is contested), and the account cannot sign in until the owner clicks the verification link, which then offers a set-password step instead of a session; a fresh verification email is sent within the account's send budget. For a verified user it is a no-op. A second signup therefore cannot fix a mistyped password. Change it through `hoody auth password recover` → `hoody auth password reset`. Do NOT probe with signup.
- The `agent` kit needs **no** extra auth headers: it accepts the bare per-computer kit URL, and access is decided by the computer's proxy permission policy. Only an `exec` script can ask for more, with its own `// @token` (see the `exec` skill). The `hoody computers claims create --computer <id>` call mints an *optional* portable computer claim for offline verification by your own computer programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour.
- `hoody computers start`, `hoody computers stop`, `hoody computers restart`, `hoody computers pause` and `hoody computers resume` all call `POST /api/v1/computers/{id}/{operation}`: the operation is the last PATH segment, never a body field, and each method fixes it for you.  The optional body field `timeout` (seconds, at most 600): for `stop` and `restart` it is the time the computer gets to shut down cleanly before it is stopped forcibly, so the operation may run up to 420 s longer; for the other operations it caps how long the operation may run on the host. CLI: `hoody computers stop <computerId> --timeout 60` (the id is positional; a plain stop sends `stop`, and `--force` sends `force-stop`).
- A command that acts on one computer or project takes its id as a positional: `hoody computers get <computerId>`, `hoody computers stop <computerId>`, `hoody projects get <projectId>`. On `hoody computers get`, `update`, `copy`, `sync`, `stats`, `start`, `stop`, `restart`, `pause` and `resume` the id is optional: left out, it comes from the global `-c` / `--computer`, else from `$HOODY_COMPUTER_ID`. `hoody computers delete <computerId> -y` always needs the id typed, and `-c` does not fill it. Commands whose help says `Requires: --computer (-c)`, such as `hoody snapshots list`, take no positional computer id: they use the global `-c` / `--computer`, or `$HOODY_COMPUTER_ID`. Take ids from `hoody computers list` or `hoody projects list`.
- `hoody computers create` needs a `server_id` in its body, and nothing else in workflow 4 produces one: take it from `hoody servers list` (a server you rent). A `name` that another computer in the project already uses is refused with 409 `COMPUTER_NAME_IN_USE`, whose `data.computer_id` names that computer when you can read it. `computer_image` is optional (omitted, the default image is used); name a public image from `hoody images list`, since `hoody images list --mine` lists only images your account owns and is empty on a new account. A bare `debian` resolves to the canonical base image. CLI flags: `--project <projectId> --server-id <serverId> --computer-image debian`.
- Snapshots are addressed by `name`, never by alias: `hoody snapshots restore`, `hoody snapshots delete` and `hoody snapshots alias set` take the `name` that `hoody snapshots list` returns. `hoody snapshots create` derives it from `alias`: it keeps only letters, digits, `_` and `-`, drops any leading `-` and `_`, cuts the result to 64 characters, then drops any trailing `-` and `_`. A derived name shorter than 2 characters is refused with 400. An alias containing control or invisible characters is refused with 400 rather than sanitized. With no alias, or one with no usable characters, the name is `snap-YYYYMMDD-HHMMSS` (UTC). In the CLI the name is the first argument: `hoody snapshots restore <name>`.
- `hoody snapshots create` needs the computer `running` or `stopped` (another status is refused with 400). The snapshot cap depends on the server the computer runs on, and `hoody snapshots list` returns it as `max_snapshots` (by default 2 on a pooled slice, free or paid, and 1000 on other servers; a server can set its own); one more is refused with 400 `COMPUTER_SNAPSHOT_LIMIT` until you delete one.
- `hoody projects create` names the project with `alias` (required, at most 100 characters); there is no `name` field. An alias that one of your projects already uses is refused with 409.
- Kit URL `<projectId>-<computerId>-<kit>-<n>.<server>.computers.hoody.com` (new terminal sessions use ids 1–9999; the proxy refuses any terminal index above 9999, so a session an older kit version created there cannot be reached through a kit URL): with the default proxy permissions, holding the URL is enough to use the kit. Treat it as a secret, since it also exposes the project and computer ids; restrict it with `hoody computers proxy permissions *` and `hoody computers proxy groups *` groups. A `hoody proxy aliases create` alias gives a shorter URL without the ids, but it is not an access rule of its own: the computer's proxy permissions apply to the alias exactly as to the canonical URL (with the default permissions, anyone holding the alias can open the program), and the canonical URL keeps working.
- `hoody computers proxy services list` lists only the services named in the computer's proxy permission rules or hooks, so a computer with no custom rules returns `services: []`; it is not a list of running kits. `hoody proxy aliases create` takes the kit or protocol as `program` (e.g. `'exec'`, `'terminal'`, or `'http'` with `port`).
- `hoody wallet invoices list` returns HTTP 200 for never-billed accounts, with an empty `data.invoices` array and pagination metadata in `data.pagination`. `hoody ip get` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `hoody servers offers reserve` charges at once, and every reservation whose total is above zero needs `max_charge_cents`, although the body schema marks it optional. Without it the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED` (409 `SETUP_FEE_CONFIRMATION_REQUIRED` when the offer has a one-time setup fee), and a total above it is refused with 409 `CHARGE_EXCEEDS_MAX`; the error data carries `total_cents`, and nothing is charged. It also needs a caller-generated `idempotency_key`: a retry with the same key and request does not charge again and returns the original reservation (left out, with `replayed: true`, when the caller cannot read it), and a different request under that key is refused with 409 `IDEMPOTENCY_INTENT_MISMATCH`. CLI: `hoody servers offers reserve <offer-id> --days <days> --max-charge-cents <cents> --idempotency-key <key> -y`.
- `hoody servers extend` needs `expected_rental_end`: the rental's current `rental_end`, as `hoody servers get` returns it. The extension is applied only while that still matches, so a retry that repeats the ORIGINAL `expected_rental_end` after a lost response is refused with 409 `EXTENSION_ALREADY_APPLIED` instead of charging twice. That date is the only guard (there is no idempotency key): never resend with the new `rental_end`, because that matches the rental's current end and charges again. After a lost response, read the rental again (`hoody servers get`) and reconcile: if `rental_end` has moved, the extension was applied; only if it has not, retry with the original date. `max_charge_cents` may be omitted for a positive extension charge only when the rental's frozen renewal tiers (`renewal_pricing_frozen`) price `additional_days` and the rental was not bought at a discount; otherwise omitting it is refused with 409 `CHARGE_CONFIRMATION_REQUIRED`, and the error data carries `total_cents`. A zero charge needs no ceiling. Sending a sufficient ceiling is always safe. CLI: read `rental_end` with `hoody servers get <rental-id> -o json`, then run `hoody servers extend <rental-id> --additional-days <days> --expected-rental-end <rental-end> --max-charge-cents <cents> -y`.
- `hoody storage computers incoming list --computer <id>` is computer-scoped: its `id` is the receiving computer's id. For every incoming share across the account use `hoody storage incoming list`.
- `hoody storage shares get <share-id>`, `hoody storage shares update <share-id>`, `hoody storage incoming mount <share-id>` and `hoody storage incoming unmount <share-id>` take the share (24 hex characters) as their positional argument, plus the global `-c <computerId>`: the source computer for get and update, the receiving computer for mount and unmount. `hoody storage shares delete <share-id>` takes no computer. `--enabled` is a boolean: disable a share with `--no-enabled`; `--enabled false` is refused as an extra argument.
- `hoody auth email verify` body has `token` + optional `response_mode`, `code_challenge` (required when `response_mode: 'intent'`) and `client` (analytics source channel) — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `hoody auth 2fa verify`.
- KVM (`PUT /api/v1/computers/{id}/kvm`, field `kvm` on create/responses) works on dedicated (bare-metal) servers only: a computer on a free-tier server or on a paid subserver is refused with 403, and the computer must be STOPPED to toggle (409 `OPERATION_STATE_CONFLICT` otherwise). Canonical field is `kvm`; `dev_kvm` is an input-only alias (`kvm` wins; both present and disagreeing → 400). Default off.
- Bot URLs are owner-only: the project owner (or an administrator) manages them, a project member gets `403 BOT_URL_OWNER_ONLY`, and a Bot URL that is not yours is `404 BOT_URL_NOT_FOUND`. An auth token needs the `resources.bot_urls` permission, and on a realm URL (`https://{realmId}.api.hoody.com`) the Bot's `realm` on create or `hoody boturls repoint` must be that realm (`BOT_REALM_INVALID` otherwise), and a Bot URL created in another realm answers `404 BOT_URL_NOT_FOUND` there; a `global` Bot is managed from the base host.
- A Bot gets at most one Bot URL (`409 BOT_URL_EXISTS`: use or re-point the existing one), a Bot URL holds at most 20 live keys (`400 BOT_KEY_LIMIT`), an account creates at most 10 Bot URLs an hour (`429 BOT_LABEL_THROTTLED`), and a server hosts a limited number (`400 SERVER_BOT_URL_LIMIT` with `data.max` and `data.used`; the cap depends on the server and, on a paid subserver, on its plan's `max_bot_urls` (also shown on its subscription), so read it from the error rather than assuming a number). Bot URL writes share one per-caller budget, 30 a minute by default, answered with `429` and `Retry-After`.
- A Bot URL label is 8 to 48 characters of `a-z`, `0-9` and single hyphens, starting with a letter and ending with a letter or digit, checked exactly as sent (nothing is lowercased or trimmed). Reserved words are refused (`409 BOT_LABEL_RESERVED`), and every label ever created stays taken for ever, even after its Bot URL is deleted (`409 BOT_LABEL_TAKEN`). `hoody boturls label suggest` returns a free generated label and does not reserve it.
- A key's secret (`hbk_…`) is returned only by `hoody boturls keys create` and `hoody boturls keys rotate` (as `data.secret`, with ready calls that use it: `curl` lists the models, `curl_chat` sends one chat message, `curl_mcp` lists the MCP tools) and can never be read again; every Bot URL view also has `connect`, the address for each kind of client (`chat_page`, `guide`, `openai_base_url`, `anthropic_base_url`, `mcp_url`) and the `key_header` that carries a key; `get` and `list` show only the key's 12-character `prefix`. `hoody boturls keys rotate` keeps the id and settings and the old secret stops working for callers about 11 seconds after the change is `applied`; `revoke` and `hoody boturls keys revoke --all` are permanent (a revoked key is gone and answers `404 BOT_KEY_NOT_FOUND`; pause a key with `hoody boturls keys update <id> <key_id> --no-enabled` instead). Key names are 1 to 32 characters, unique per Bot URL ignoring case (`409 BOT_KEY_NAME_TAKEN`); `ipv4_allow` takes at most 32 IPv4 addresses or canonical CIDRs, never IPv6 (`400 BOT_IPV4_INVALID`).
- Every Bot URL write returns `{ data, propagation }`: a change is live for callers only once `propagation.state` is `applied` on `hoody boturls get`, then about 11 seconds later. `hoody boturls panic` turns the URL off and revokes every key in one step, and work the Bot already started keeps running (stop it in the agent); to reopen, `hoody boturls update` with `enabled: true` and mint new keys. `status` is `active`, `disabled`, `detached` or `frozen` (a frozen URL, set by an administrator, cannot be turned on or re-pointed: `409 BOT_URL_FROZEN`); a caller holding a valid key on a URL that is not `active` gets `403 bot_disabled`; a missing, unknown or revoked key gets `401 key_invalid` first (so after `hoody boturls panic`, which revokes every key, expect `key_invalid`), and `GET /` and `GET /SKILL.md` keep answering while Bot URL serving is on (when it is switched off, a request to a Bot URL that is found and in a usable state, those two paths included, gets `403 bot_disabled`). A delete answers `{ data: { id, state: 'removed' }, propagation }`: read the propagation state from that response, because `hoody boturls get` on the deleted URL is a `404 BOT_URL_NOT_FOUND` from then on, and that 404 does not prove the removal has finished reaching callers. `applied` covers publication only: a newly created or re-pointed Bot URL can take a little longer before its address resolves for callers, so after minting the first key check that `GET /v1/models` with it answers before you hand it out, and retry if the name does not resolve yet.
- Deleting a computer does not delete its Bot URL: it is detached (label, URL and keys kept, callers refused) until you `hoody boturls repoint` it at a Bot in another computer you own; deleting the project or the account removes it. While Bot URLs are unavailable on the platform (switched off, or no usable Bot zone), `hoody boturls create`, `hoody boturls label suggest`, `hoody boturls update` that turns a switched-off URL on (`enabled: true`) and `hoody boturls repoint` answer `503 BOTS_DISABLED`; while the zone is missing, `url`, `test_curl`, `connect` and the key's `curl`, `curl_chat` and `curl_mcp` are `null`. Reads, settings, delete, keys and panic keep working.
- Callers of a Bot URL are logged in the computer's proxy logs under `serviceName=bots` once the Bot URL is attached to a computer, a call refused before it is forwarded (an invalid key, say) included (path only, no bodies or keys, with the result code, and the key's id and name once a key matched; a detached URL, or a call refused before its Bot URL is found, leaves no row); read them with `proxyLogs` and find one call by its `X-Request-Id`, which is the row's `traceId`. Logging is best effort: a row can be missing after a platform fault, so a missing row does not prove that no request was made.
- A paid subserver's region is chosen only at purchase. `region` is optional on `hoody servers plans quote` and `hoody servers subscriptions buy`; left out, Hoody picks a region that has room. The same `idempotency_key` with another `region`, or with `region` added or removed, is refused with 409 `IDEMPOTENCY_INTENT_MISMATCH`; after any refusal, retry with a new key; if an answer says the result is not known yet (a `500`), retry the unchanged request with the SAME key, never a new one. On `hoody servers subscriptions upgrade` and its quote, `region` is accepted only as a check: a value other than the subserver's own is refused with 409 `SUBSCRIPTION_REGION_FIXED`, nothing charged. In `hoody servers plans regions`, a full region stays listed with `available: false`, and `available` does not count the account's paid subserver limit (the quote does).

## Common errors

- 400 — explicit bad-request checks: an unknown signup `region`, a malformed `filter` (below), a password that fails the complexity rules, and an unsupported or unpriced `rental_days` on `hoody servers rent`. A login with missing credentials fails request-schema validation instead (422).
- 400 `filter must be valid JSON` / `filter must be a JSON object` — a list's `filter` query parameter must be a JSON object; malformed JSON, `null`, an array or a scalar is refused (it used to be ignored). On lists that allow only some columns, such as `hoody wallet transactions list` and `hoody wallet invoices list`, an unknown column or operator is also 400. An empty `filter=` means no filter.
- 401 — Bearer missing/malformed. JWTs require the literal `Bearer ` prefix; `hdy_…` auth tokens are also accepted bare (`Authorization: hdy_…`).
- 403 — missing permission row or `resources.*` flag.
- 404 — missing resource OR 403 masked.
- 409 — uniqueness (duplicate username, proxy-alias).
- 428 / 412 — conditional writes. On proxy-permission, proxy-settings and proxy-hook writes, 428 means the `If-Match` header is missing and 412 means it is malformed or stale (the document changed since you read it): re-read the document (`hoody computers proxy permissions get` / `hoody projects proxy permissions get`), send its current `file:v<N>`, and retry. `hoody computers update` and a vault PUT also answer 412 `PRECONDITION_FAILED` when a condition you supplied no longer holds: re-read the computer or key, review the intended change, and retry with its current condition. A failed vault `If-None-Match: *` means the key already exists; a failed vault `If-Match` can mean the key was deleted. None of these signal a missing payment method, email verification or 2FA.
- 422 — request-schema validation (e.g. a backup code sent where `hoody auth 2fa backupcodes rotate` wants a 6-digit TOTP: the body is `{statusCode: 422, error: "Validation Error", message: "Validation failed: …"}`, with no `REQUEST_SCHEMA_INVALID` code on the wire).
- 429 — login 1000/30min (failures only), signup 5/hour, refresh 30/30min.
- 400 — the `events` socket accepts the WebSocket transport only (unless the deployment turns polling on); while polling is off, every long-polling request (with or without a `sid`) is refused with 400 `Polling transport is not supported; use the websocket transport`. Only on a deployment that turns polling on does a polling write with a missing or unknown `sid` get 400 `Unknown session`. Connect with `transports: ['websocket']`.
- Generic 200 — `hoody auth password recover`, `hoody auth email verification send` and a duplicate `POST /api/v1/auth/signup` (HTTP form; the CLI reaches it with `hoody signup` instead of a generated command) answer 200 whether or not the account exists, so the answer proves nothing about it; do NOT probe with these. A malformed body is still `422` and the rate limits above still answer `429`.
- Bot URL writes: 400 `BOT_FIELD_INVALID` (data.field names it; `409 BOT_FIELD_INVALID` too when the computer is in a state that cannot hold a Bot URL or is not placed on a server yet), `BOT_LABEL_INVALID`, `BOT_REALM_INVALID`, `BOT_IPV4_INVALID`, `BOT_KEY_LIMIT`, `SERVER_BOT_URL_LIMIT`; 403 `BOT_URL_OWNER_ONLY`; 404 `BOT_URL_NOT_FOUND`, `BOT_KEY_NOT_FOUND` or `COMPUTER_NOT_FOUND` (a computer that is missing and one that is not yours look the same); 409 `BOT_LABEL_TAKEN`, `BOT_LABEL_RESERVED`, `BOT_URL_EXISTS`, `BOT_URL_FROZEN`, `BOT_KEY_NAME_TAKEN`, `SUBSERVER_DORMANT`; 429 `BOT_LABEL_THROTTLED` or the write budget; 503 `BOTS_DISABLED` or `BOT_LABEL_GENERATION_FAILED` (retry).
- Paid subserver region: 400 `PAID_REGION_UNKNOWN` (`region` is not a code from `hoody servers plans regions`); 409 `NO_PAID_CAPACITY_IN_REGION` (the chosen region has no room for the plan right now, nothing charged: pick an available region or leave `region` out, with a new `idempotency_key`); 409 `SUBSCRIPTION_REGION_FIXED` (an upgrade named another region).

## Related namespaces

- `agent` — operates on computers created here; access to its kit URL follows the computer's proxy permission policy.
- `agent` Bots — a Bot URL (`botUrls`) gives one of the agent's Bots a public address; `agent` Example 4 runs the flow, and the appendix `## Bot URLs` section is the caller reference.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on computers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-computer desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

### `hoody abusenotices` (3) — Abuse notices: read the notices Hoody sent you about your servers and reply to an open one (list, get, reply)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody abusenotices get` |  | read | Show one notice with every message in order | `api.abuseNotices.get` | `hoody abusenotices get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody abusenotices list` |  | read | List the notices Hoody sent you about servers you own, newest first | `api.abuseNotices.list` | `hoody abusenotices list --page 1 --limit 20` |
| `hoody abusenotices reply` |  | write | Reply to an open notice (plain text, up to 4,000 characters) | `api.abuseNotices.reply` | `hoody abusenotices reply 64f1a2b3c4d5e6f7a8b9c0d1 --body 'Details go here'` |

### `hoody activity` (2) — HTTP activity logs and access statistics

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody activity list` |  | read | Get activity logs | `api.activity.list` | `hoody activity list --page 1 --limit 50` |
| `hoody activity stats` |  | read | Get activity stats | `api.activity.getStats` | `hoody activity stats` |

### `hoody ai` (2) — Hoody AI catalog and models

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ai freeusage get` |  | read | Show how much of each of your servers' free AI allowance is used | `api.ai.getFreeUsage` | `hoody ai freeusage get --watch 2s` |
| `hoody ai models list` |  | read | List available AI models (Hoody catalog) | `api.ai.listModels` | `hoody ai models list --watch 2s` |

### `hoody auth` (43) — Authentication, tokens, and 2FA

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody auth 2fa backupcodes rotate` |  | action | Regenerate Backup Codes | `api.auth.twoFactor.rotateBackupCodes` | `hoody auth 2fa backupcodes rotate --password <password> --code <code> -y` |
| `hoody auth 2fa disable` |  | destructive | Disable 2FA | `api.auth.twoFactor.disable` | `hoody auth 2fa disable --password <password> --code <code> -y` |
| `hoody auth 2fa enrollment undo` |  | destructive | Undo a two-factor enrollment from the alert email link (ends every session) | `api.auth.twoFactor.undoEnrollment` | `hoody auth 2fa enrollment undo --link-token <token> -y` |
| `hoody auth 2fa setup confirm` |  | action | Complete 2FA Setup | `api.auth.twoFactor.confirmSetup` | `hoody auth 2fa setup confirm --code <code>` |
| `hoody auth 2fa setup start` |  | action | Initialize 2FA Setup | `api.auth.twoFactor.startSetup` | `hoody auth 2fa setup start --password <password>` |
| `hoody auth 2fa status` |  | read | Get 2FA Status | `api.auth.twoFactor.getStatus` | `hoody auth 2fa status` |
| `hoody auth 2fa tokengate disable` |  | write | Stop requiring two-factor verification to create auth tokens | `api.auth.twoFactor.disableTokenGate` | `hoody auth 2fa tokengate disable --password <password> --otp-code <otp_code>` |
| `hoody auth 2fa tokengate enable` |  | write | Require two-factor verification to create auth tokens | `api.auth.twoFactor.enableTokenGate` | `hoody auth 2fa tokengate enable` |
| `hoody auth 2fa verify` |  | action | Verify 2FA Code During Login | `api.auth.twoFactor.verify` | `hoody auth 2fa verify --temp-token <temp_token> --code <code> --response-mode tokens --print-token` |
| `hoody auth config get` |  | read | Show the public sign-in configuration | `api.auth.getConfig` | `hoody auth config get` |
| `hoody auth device poll` |  | action | Poll for device sign-in tokens and save the session | `api.auth.device.poll` | `hoody auth device poll --device-code <device_code> --code-verifier dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk --print-token` |
| `hoody auth device start` |  | action | Start a device sign-in and print the code to enter in a browser | `api.auth.device.start` | `hoody auth device start --code-challenge E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` |
| `hoody auth email change cancel` |  | action | Cancel a pending email change | `api.auth.email.cancelChange` | `hoody auth email change cancel` |
| `hoody auth email change confirm` |  | write | Confirm an email change with the link token | `api.auth.email.confirmChange` | `hoody auth email change confirm --link-token <token>` |
| `hoody auth email change start` |  | write | Start changing the account email (needs the password, and a 2FA code when 2FA is on) | `api.auth.email.startChange` | `hoody auth email change start --new-email new.name@example.com --current-password <current_password>` |
| `hoody auth email change undo` |  | destructive | Undo an email change from the old address (ends every session) | `api.auth.email.undoChange` | `hoody auth email change undo --link-token <token> -y` |
| `hoody auth email verification send` |  | write | Resend verification email | `api.auth.email.sendVerification` | `hoody auth email verification send --email user@example.com` |
| `hoody auth email verify` |  | write | Verify email address | `api.auth.email.verify` | `hoody auth email verify --link-token <token> --response-mode tokens --print-token` |
| `hoody auth identityclaims create` |  | action | Issue a signed identity claim bound to an audience | `api.auth.createIdentityClaim` | `hoody auth identityclaims create --audience myapp.example.com --expires-in 3600` |
| `hoody auth oauth authorize` |  | action | Begin a PKCE authorization with a sign-in intent token | `api.auth.oauth.authorize` | `hoody auth oauth authorize --code-challenge <code_challenge> --redirect-uri <redirect_uri> --token "$AUTH_INTENT_TOKEN"` |
| `hoody auth oauth exchange` |  | action | Exchange a PKCE authorization code for a session | `api.auth.oauth.exchange` | `hoody auth oauth exchange --code <code> --code-verifier <code_verifier> --redirect-uri <redirect_uri> --print-token` |
| `hoody auth oauth intents cancel` |  | action | Cancel a pending sign-in intent or 2FA temporary token | `api.auth.oauth.cancelIntent` | `hoody auth oauth intents cancel --token "$AUTH_INTENT_TOKEN"` |
| `hoody auth password recover` |  | write | Request password reset | `api.auth.recoverPassword` | `hoody auth password recover --email user@example.com` |
| `hoody auth password reset` |  | write | Reset password | `api.auth.resetPassword` | `hoody auth password reset --link-token <token> --password <password>` |
| `hoody auth refresh` |  | action | Refresh access token | `api.auth.refresh` | `hoody auth refresh --refresh-token <refresh_token> --print-token` |
| `hoody auth sessions list` |  | read | List your sign-in sessions | `api.auth.sessions.list` | `hoody auth sessions list --state active --limit 50` |
| `hoody auth sessions revoke` |  | destructive | End one sign-in session (use 'current' for this one) | `api.auth.sessions.revoke` | `hoody auth sessions revoke 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth sessions revoke` |  | destructive | End every other sign-in session; this one stays signed in | `api.auth.sessions.revokeOthers` | `hoody auth sessions revoke --others -y` |
| `hoody auth tokens copy` |  | write | Copy auth token | `api.auth.tokens.copy` | `hoody auth tokens copy 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --expires-at 2099-01-01T00:00:00Z` |
| `hoody auth tokens create` |  | write | Create a new auth token | `api.auth.tokens.create` | `hoody auth tokens create --alias clever-dolphin --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens delete` |  | destructive | Delete auth token | `api.auth.tokens.delete` | `hoody auth tokens delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens get` |  | read | Get the calling auth token (no id) or an auth token by id | `api.auth.tokens.getCurrent` | `hoody auth tokens get` |
| `hoody auth tokens get` |  | read | Get auth token by id | `api.auth.tokens.get` | `hoody auth tokens get <id>` |
| `hoody auth tokens list` |  | read | List auth tokens | `api.auth.tokens.list` | `hoody auth tokens list --watch 2s` |
| `hoody auth tokens publicprofiles get` |  | read | Get auth token public profile by public key | `api.auth.tokens.getPublicProfile` | `hoody auth tokens publicprofiles get 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens publicprofiles update` |  | write | Update current auth token public profile | `api.auth.tokens.updatePublicProfile` | `hoody auth tokens publicprofiles update --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens realms add` |  | write | Add realm to auth token | `api.auth.tokens.addRealm` | `hoody auth tokens realms add 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody auth tokens realms remove` |  | destructive | Remove realm from auth token | `api.auth.tokens.removeRealm` | `hoody auth tokens realms remove 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens templates list` |  | read | List auth token permission templates | `api.auth.tokens.listTemplates` | `hoody auth tokens templates list --watch 2s` |
| `hoody auth tokens update` |  | write | Update auth token | `api.auth.tokens.update` | `hoody auth tokens update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth waitlist join` |  | write | Join the Hoody waitlist |  | `hoody auth waitlist join --email user@example.com` |
| `hoody auth waitlist update` |  | write | Add interest and role answers to an existing waitlist signup |  | `hoody auth waitlist update --email user@example.com --interest dev --context individual` |
| `hoody auth whoami` |  | read | Get current user profile | `api.auth.whoami` | `hoody auth whoami` |

### `hoody boturls` (13) — Bot URLs: give one of your agent's Bots a public URL with named keys (manage by bu_ id), or call a Bot URL with a key (ask, chat, status, answer, models list, updates list, events stream <url>)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody boturls create` |  | write | Give one of your agent's Bots a public URL (one per Bot) | `api.botUrls.create` | `hoody boturls create --computer-id <computer-id> --bot-realm <bot.realm> --bot-id <bot-id> --bot-uid 3fa85f64-5717-4562-b3fc-2c963f66afa6 --label my-label --cors` |
| `hoody boturls delete` |  | destructive | Remove a Bot URL; its label is never given out again | `api.botUrls.delete` | `hoody boturls delete <id> -y` |
| `hoody boturls get` |  | read | Show a Bot URL, its keys and where its last change stands on the hosts | `api.botUrls.get` | `hoody boturls get <id>` |
| `hoody boturls keys create` |  | write | Create a named key; the secret is shown once | `api.botUrls.keys.create` | `hoody boturls keys create <id> --name my-resource --ipv4-allow 192.0.2.10 --expires-at 2026-12-31T23:59:59Z` |
| `hoody boturls keys revoke` |  | destructive | Revoke a key for good | `api.botUrls.keys.revoke` | `hoody boturls keys revoke <id> <key_id> -y` |
| `hoody boturls keys revoke` |  | destructive | Revoke every key of a Bot URL | `api.botUrls.keys.revokeAll` | `hoody boturls keys revoke <id> --all -y` |
| `hoody boturls keys rotate` |  | write | Replace a key's secret (same id); the new secret is shown once | `api.botUrls.keys.rotate` | `hoody boturls keys rotate <id> <key_id> -y` |
| `hoody boturls keys update` |  | write | Change a key's name, pause it, or set its IPv4 allowlist, expiry or notes | `api.botUrls.keys.update` | `hoody boturls keys update <id> <key_id> --name my-resource --ipv4-allow 192.0.2.10` |
| `hoody boturls label suggest` |  | read | Suggest a free label for a new Bot URL (not reserved) | `api.botUrls.suggestLabel` | `hoody boturls label suggest` |
| `hoody boturls list` |  | read | List your Bot URLs | `api.botUrls.list` | `hoody boturls list --limit 50 --watch 2s` |
| `hoody boturls panic` |  | destructive | Turn a Bot URL off and revoke all its keys at once | `api.botUrls.panic` | `hoody boturls panic <id> -y` |
| `hoody boturls repoint` |  | write | Point a Bot URL at another Bot, keeping its label and keys | `api.botUrls.repoint` | `hoody boturls repoint <id> --computer-id <computer-id> --bot-realm <bot.realm> --bot-id <bot-id> --bot-uid 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody boturls update` |  | write | Change a Bot URL's browser access, limits or on/off switch | `api.botUrls.update` | `hoody boturls update <id> --enabled --cors` |

### `hoody computers` (51) — Computer lifecycle, stats, and proxy permissions

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody computers claims create` |  | write | Authorize Computer Access | `api.computers.createClaim` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers claims create` |
| `hoody computers copy` |  | write | Copy a computer | `api.computers.copy` | `hoody computers copy 64f1a2b3c4d5e6f7a8b9c0d1 --target-project 64f1a2b3c4d5e6f7a8b9c0d1 --target-server-id 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource` |
| `hoody computers create` |  | write | Create a new computer | `api.computers.create` | `hoody computers create --project <project> --server-id <server-id> --name my-resource --color '#ff0000'` |
| `hoody computers delete` |  | destructive | Delete a computer | `api.computers.delete` | `hoody computers delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody computers env delete` |  | destructive | Delete a single environment variable | `api.computers.env.delete` | `hoody --computer <computer> computers env delete <key> -y` |
| `hoody computers env list` |  | read | List computer environment variables | `api.computers.env.list` | `hoody --computer <computer> computers env list` |
| `hoody computers env set` |  | write | Set a single environment variable | `api.computers.env.set` | `hoody computers env set <key> --value hello` |
| `hoody computers env update` |  | write | Bulk set computer environment variables | `api.computers.env.update` | `hoody computers env update --env APP_MODE=hello` |
| `hoody computers get` |  | read | Get a computer by ID or name | `api.computers.get` | `hoody computers get 64f1a2b3c4d5e6f7a8b9c0d1 --include-proxy-domains` |
| `hoody computers kvm disable` |  | write | Disable /dev/kvm passthrough. Rented/dedicated servers only; the computer must be stopped. | `api.computers.disableKvm` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers kvm disable` |
| `hoody computers kvm enable` |  | write | Enable /dev/kvm passthrough (run full VMs inside the computer). Rented/dedicated servers only; the computer must be stopped. | `api.computers.enableKvm` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers kvm enable` |
| `hoody computers list` |  | read | Get all computers | `api.computers.list` | `hoody computers list --page 1 --limit 50` |
| `hoody computers pause` |  | action | Pause a computer | `api.computers.pause` | `hoody computers pause 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody computers proxy default set` |  | write | Update computer default proxy permission policy | `api.computers.proxy.setDefault` | `hoody computers proxy default set --if-match file:v42 --default allow` |
| `hoody computers proxy disable` |  | write | Disable the proxy permissions of a computer | `api.computers.proxy.disable` | `hoody computers proxy disable --if-match file:v42` |
| `hoody computers proxy enable` |  | write | Enable the proxy permissions of a computer | `api.computers.proxy.enable` | `hoody computers proxy enable --if-match file:v42` |
| `hoody computers proxy groups delete` |  | destructive | Remove computer authentication group | `api.computers.proxy.deleteGroup` | `hoody computers proxy groups delete <group_name> --if-match file:v42 -y` |
| `hoody computers proxy groups ip set` |  | write | Set IP authentication group (computer) | `api.computers.proxy.setIpGroup` | `hoody computers proxy groups ip set <group_name> --if-match file:v42 --range 192.0.2.0/24` |
| `hoody computers proxy groups jwt set` |  | write | Set JWT authentication group (computer) | `api.computers.proxy.setJwtGroup` | `hoody computers proxy groups jwt set <group_name> --if-match file:v42 --secret k7Qx2Vb9Lm4Rz8Np3Hc6Wf1Jy5Ts0GaE4 --algorithm HS256 --sources header:Authorization --claims key=hello --header-authoritative` |
| `hoody computers proxy groups list` |  | read | List computer proxy groups | `api.computers.proxy.listGroups` | `hoody computers proxy groups list --watch 2s` |
| `hoody computers proxy groups password set` |  | write | Set password authentication group (computer) | `api.computers.proxy.setPasswordGroup` | `hoody computers proxy groups password set <group_name> --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody computers proxy groups permissions clear` |  | destructive | Remove all program permissions for a computer group | `api.computers.proxy.clearGroupPermissions` | `hoody computers proxy groups permissions clear <group_name> --if-match file:v42 -y` |
| `hoody computers proxy groups permissions delete` |  | destructive | Remove a single program permission for a computer group | `api.computers.proxy.deleteGroupPermission` | `hoody computers proxy groups permissions delete <group_name> http --if-match file:v42 -y` |
| `hoody computers proxy groups permissions set` |  | write | Set computer group program permission | `api.computers.proxy.setGroupPermission` | `hoody computers proxy groups permissions set <group_name> http --if-match file:v42 --access 8080` |
| `hoody computers proxy groups token set` |  | write | Set token authentication group (computer) | `api.computers.proxy.setTokenGroup` | `hoody computers proxy groups token set <group_name> --if-match file:v42 --header X-Api-Key --value <token>` |
| `hoody computers proxy hooks clear` |  | destructive | Clear all hooks for a service | `api.computers.proxy.clearHooks` | `hoody computers proxy hooks clear <service> --if-match file:v42 -y` |
| `hoody computers proxy hooks create` |  | write | Append or insert a new hook | `api.computers.proxy.createHook` | `hoody computers proxy hooks create <service> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody computers proxy hooks delete` |  | destructive | Remove a hook | `api.computers.proxy.deleteHook` | `hoody computers proxy hooks delete <service> <hook_id> --if-match file:v42 -y` |
| `hoody computers proxy hooks get` |  | read | Get a single hook by id | `api.computers.proxy.getHook` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers proxy hooks get <service> <hook_id>` |
| `hoody computers proxy hooks list` |  | read | List all proxy hooks for a computer | `api.computers.proxy.listHooks` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers proxy hooks list` |
| `hoody computers proxy hooks list` |  | read | List hooks for a specific service | `api.computers.proxy.listHooksByService` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers proxy hooks list <service>` |
| `hoody computers proxy hooks move` |  | write | Move a hook to a new position | `api.computers.proxy.moveHook` | `hoody computers proxy hooks move <service> <hook_id> --if-match file:v42 --position 10` |
| `hoody computers proxy hooks set` |  | write | Replace a hook in place | `api.computers.proxy.setHook` | `hoody computers proxy hooks set <service> <hook_id> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody computers proxy permissions delete` |  | destructive | Delete computer proxy permissions | `api.computers.proxy.deletePermissions` | `hoody computers proxy permissions delete --if-match file:v42 -y` |
| `hoody computers proxy permissions get` |  | read | Get computer proxy permissions | `api.computers.proxy.getPermissions` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers proxy permissions get` |
| `hoody computers proxy permissions set` |  | write | Replace computer proxy permissions JSON | `api.computers.proxy.setPermissions` | `hoody computers proxy permissions set --if-match file:v42 --project 64f1a2b3c4d5e6f7a8b9c0d1 --groups 'key={"type":"jwt","algorithm":"HS256","secret":"<32+ character key>","sources":["header:Authorization"]}' --permissions 'key={}' --default allow --hooks 'key=[]'` |
| `hoody computers proxy services get` |  | read | Get merged proxy view for a service | `api.computers.proxy.getService` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers proxy services get <service>` |
| `hoody computers proxy services list` |  | read | List services referenced in proxy config | `api.computers.proxy.listServices` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers proxy services list` |
| `hoody computers proxy settings get` |  | read | Get computer proxy root settings | `api.computers.proxy.getSettings` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 computers proxy settings get` |
| `hoody computers proxy settings update` |  | write | Update computer proxy root settings | `api.computers.proxy.updateSettings` | `hoody computers proxy settings update --if-match file:v42 --enable-proxy --default allow` |
| `hoody computers proxy usage get` |  | read | Get proxied-usage documents for a computer | `api.computers.proxy.getUsage` | `hoody computers proxy usage get --from <from> --to <to>` |
| `hoody computers restart` |  | action | Restart a computer | `api.computers.restart` | `hoody computers restart 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody computers resume` |  | action | Resume a computer | `api.computers.resume` | `hoody computers resume 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody computers start` |  | action | Start a computer | `api.computers.start` | `hoody computers start 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody computers stats` |  | read | Get computer resource statistics | `api.computers.getStats` | `hoody computers stats 507f1f77bcf86cd799439011` |
| `hoody computers statushistory list` |  | read | Get status logs for a computer | `api.computers.listStatusHistory` | `hoody computers statushistory list --page 1 --limit 10` |
| `hoody computers stop` |  | action | Stop a computer | `api.computers.stop` | `hoody computers stop 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody computers stop` |  | action | Force-stop a computer immediately, without waiting for a clean shutdown | `api.computers.stop` | `hoody computers stop 64f1a2b3c4d5e6f7a8b9c0d1 --force --timeout 120` |
| `hoody computers sync` |  | action | Sync a copied computer with its source | `api.computers.sync` | `hoody computers sync 64f1a2b3c4d5e6f7a8b9c0d1 --until-done --timeout 10m` |
| `hoody computers update` |  | write | Update a computer | `api.computers.update` | `hoody computers update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --color '#ff0000'` |
| `hoody computers wait` |  | read | Wait until a computer reaches a runtime state (running, stopped, paused, failed); prints the result as JSON |  | `hoody computers wait COMPUTER_ID --state running --timeout 120s` |

### `hoody events` (7) — Events and activity logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody events clear` |  | destructive | Bulk delete events | `api.events.clear` | `hoody events clear --event-type computer.creating --resource-type computer -y` |
| `hoody events delete` |  | destructive | Delete a single event | `api.events.delete` | `hoody events delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody events get` |  | read | Get event details by ID | `api.events.get` | `hoody events get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody events list` |  | read | List event history | `api.events.list` | `hoody events list --limit 100 --offset 0` |
| `hoody events purge` |  | destructive | Cleanup old events | `api.events.purge` | `hoody events purge --retention-days 30 -y` |
| `hoody events stats` |  | read | Get event statistics | `api.events.getStats` | `hoody events stats --start-date 2026-01-01T00:00:00Z --end-date 2026-01-01T00:00:00Z` |
| `hoody events stream` |  | read | Stream events as NDJSON, one event per line, until interrupted (--once exits after the first match) | `events.stream` | `hoody events stream --event-type 'computer.*' --project-id 64f1a2b3c4d5e6f7a8b9c0d1` |

### `hoody firewall` (10) — Computer firewall rules — ingress (inbound) and egress (outbound)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody firewall egress create` |  | write | Add Egress Rule | `api.firewall.egress.create` | `hoody firewall egress create --action allow --protocol tcp --description 'My description' --destination 192.0.2.0/24 --state enabled` |
| `hoody firewall egress delete` |  | destructive | Remove Egress Rule(s) | `api.firewall.egress.delete` | `hoody firewall egress delete --all --action allow -y` |
| `hoody firewall egress disable` |  | action | Disable an egress firewall rule | `api.firewall.egress.disable` | `hoody firewall egress disable --action allow --protocol tcp` |
| `hoody firewall egress enable` |  | action | Enable an egress firewall rule | `api.firewall.egress.enable` | `hoody firewall egress enable --action allow --protocol tcp` |
| `hoody firewall ingress create` |  | write | Add Ingress Rule | `api.firewall.ingress.create` | `hoody firewall ingress create --action allow --protocol tcp --description 'My description' --source 192.0.2.0/24 --state enabled` |
| `hoody firewall ingress delete` |  | destructive | Remove Ingress Rule(s) | `api.firewall.ingress.delete` | `hoody firewall ingress delete --all --action allow -y` |
| `hoody firewall ingress disable` |  | action | Disable an ingress firewall rule | `api.firewall.ingress.disable` | `hoody firewall ingress disable --action allow --protocol tcp` |
| `hoody firewall ingress enable` |  | action | Enable an ingress firewall rule | `api.firewall.ingress.enable` | `hoody firewall ingress enable --action allow --protocol tcp` |
| `hoody firewall reset` |  | destructive | Reset computer firewall | `api.firewall.reset` | `hoody --computer <computer> firewall reset -y` |
| `hoody firewall rules list` |  | read | List computer firewall rules | `api.firewall.listRules` | `hoody firewall rules list --watch 2s` |

### `hoody images` (7) — Computer image marketplace (list, buy, rate, import, icon)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody images buy` |  | write | Purchase image | `api.images.buy` | `hoody images buy 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody images get` |  | read | Get public image details | `api.images.getPublic` | `hoody images get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images icon get` |  | read | Get image icon | `api.images.getIcon` | `hoody images icon get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images import` |  | write | Import free image | `api.images.import` | `hoody images import 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images list` |  | read | List public images | `api.images.listPublic` | `hoody images list --os debian --architecture amd64` |
| `hoody images list` |  | read | List your own images | `api.images.listMine` | `hoody images list --mine` |
| `hoody images rate` |  | write | Rate image | `api.images.rate` | `hoody images rate 64f1a2b3c4d5e6f7a8b9c0d1 --rating 5` |

### `hoody inbox` (5) — Platform account notification inbox

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody inbox announcements list` |  | read | Get all public notifications | `api.inbox.listAnnouncements` | `hoody inbox announcements list --watch 2s` |
| `hoody inbox list` |  | read | Get all notifications for the authenticated user | `api.inbox.list` | `hoody inbox list --limit 20 --unread` |
| `hoody inbox markread` |  | write | Mark a notification as read | `api.inbox.markRead` | `hoody inbox markread 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody inbox markread` |  | write | Mark every notification as read | `api.inbox.markAllRead` | `hoody inbox markread --all` |
| `hoody inbox summary get` |  | read | Show the unread notification count and newest position | `api.inbox.getSummary` | `hoody inbox summary get` |

### `hoody ip` (2) — IP address management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ip get` |  | read | Get IP Information | `api.ip.get` | `hoody ip get` |
| `hoody ip lookup` |  | read | Look up the country and network of public IPv4 addresses | `api.ip.lookup` | `hoody ip lookup 8.8.8.8,1.1.1.1` |

### `hoody meta` (4) — API metadata and signing keys

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody meta config get` |  | read | Get the Hoody public configuration map |  | `hoody meta config get` |
| `hoody meta config values get` |  | read | Get one public configuration value |  | `hoody meta config values get <key>` |
| `hoody meta publickey get` |  | read | Get Hoody API Signing Public Key | `api.meta.getPublicKey` | `hoody meta publickey get` |
| `hoody meta social stats` |  | read | Show public Hoody social channel counters |  | `hoody meta social stats` |

### `hoody network` (5) — Computer network configuration

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody network delete` |  | destructive | Remove computer network configuration | `api.network.delete` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 network delete -y` |
| `hoody network get` |  | read | Get computer network configuration | `api.network.get` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 network get` |
| `hoody network start` |  | action | Start computer network proxy/blocking | `api.network.start` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 network start` |
| `hoody network stop` |  | action | Stop computer network proxy/blocking | `api.network.stop` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 network stop -y` |
| `hoody network update` |  | write | Update computer network configuration | `api.network.update` | `hoody network update --type socks5 --proxy-url socks5://proxy.example.com:1080 --region eu-west-1` |

### `hoody pools` (11) — Pool management and invitations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pools create` |  | write | Create pool | `api.pools.create` | `hoody pools create --name my-resource --description 'My description' --settings key=hello` |
| `hoody pools delete` |  | destructive | Delete pool | `api.pools.delete` | `hoody pools delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools get` |  | read | Get pool details | `api.pools.get` | `hoody pools get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations accept` |  | action | Accept invitation | `api.pools.invitations.accept` | `hoody pools invitations accept 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations list` |  | read | List pending invitations | `api.pools.invitations.list` | `hoody pools invitations list --watch 2s` |
| `hoody pools invitations reject` |  | action | Reject invitation | `api.pools.invitations.reject` | `hoody pools invitations reject 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools list` |  | read | List user pools | `api.pools.list` | `hoody pools list --watch 2s` |
| `hoody pools members invite` |  | write | Invite member | `api.pools.members.invite` | `hoody pools members invite 64f1a2b3c4d5e6f7a8b9c0d1 --username alice --role admin` |
| `hoody pools members remove` |  | destructive | Remove member | `api.pools.members.remove` | `hoody pools members remove 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools members role set` |  | write | Update member role | `api.pools.members.setRole` | `hoody pools members role set 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 --role admin` |
| `hoody pools update` |  | write | Update pool | `api.pools.update` | `hoody pools update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --description 'My description'` |

### `hoody projects` (25) — Manage projects

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody projects create` |  | write | Create a new project | `api.projects.create` | `hoody projects create --alias Production --color '#ff0000' --max-computers 10` |
| `hoody projects delete` |  | destructive | Delete project | `api.projects.delete` | `hoody projects delete 64f1a2b3c4d5e6f7a8b9c0d1 --include-deleted-items --delete-computers -y` |
| `hoody projects get` |  | read | Get project by ID | `api.projects.get` | `hoody projects get 64f1a2b3c4d5e6f7a8b9c0d1 --include-permissions` |
| `hoody projects list` |  | read | List all projects | `api.projects.list` | `hoody projects list --page 1 --limit 10` |
| `hoody projects permissions add` |  | write | Grant project access | `api.projects.permissions.add` | `hoody projects permissions add --project 64f1a2b3c4d5e6f7a8b9c0d1 --user-id 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects permissions list` |  | read | List project permissions | `api.projects.permissions.list` | `hoody projects permissions list --page 1 --limit 10 --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects permissions remove` |  | destructive | Revoke project access | `api.projects.permissions.remove` | `hoody projects permissions remove 64f1a2b3c4d5e6f7a8b9c0d1 --project 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody projects permissions update` |  | write | Update project permission | `api.projects.permissions.update` | `hoody projects permissions update 64f1a2b3c4d5e6f7a8b9c0d1 --project 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects proxy default set` |  | write | Update project default proxy permission policy | `api.projects.proxy.setDefault` | `hoody projects proxy default set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --default allow` |
| `hoody projects proxy disable` |  | write | Disable the proxy permissions of a project | `api.projects.proxy.disable` | `hoody projects proxy disable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy enable` |  | write | Enable the proxy permissions of a project | `api.projects.proxy.enable` | `hoody projects proxy enable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy groups delete` |  | destructive | Remove project authentication group | `api.projects.proxy.deleteGroup` | `hoody projects proxy groups delete <group_name> --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 -y` |
| `hoody projects proxy groups ip set` |  | write | Set IP authentication group (project) | `api.projects.proxy.setIpGroup` | `hoody projects proxy groups ip set <group_name> --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --range 192.0.2.0/24` |
| `hoody projects proxy groups jwt set` |  | write | Set JWT authentication group (project) | `api.projects.proxy.setJwtGroup` | `hoody projects proxy groups jwt set <group_name> --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --secret k7Qx2Vb9Lm4Rz8Np3Hc6Wf1Jy5Ts0GaE4 --algorithm HS256 --sources header:Authorization --claims key=hello --header-authoritative` |
| `hoody projects proxy groups password set` |  | write | Set password authentication group (project) | `api.projects.proxy.setPasswordGroup` | `hoody projects proxy groups password set <group_name> --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody projects proxy groups permissions clear` |  | destructive | Remove all program permissions for a project group | `api.projects.proxy.clearGroupPermissions` | `hoody projects proxy groups permissions clear <group_name> --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 -y` |
| `hoody projects proxy groups permissions delete` |  | destructive | Remove a single program permission for a project group | `api.projects.proxy.deleteGroupPermission` | `hoody projects proxy groups permissions delete <group_name> http --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 -y` |
| `hoody projects proxy groups permissions set` |  | write | Set project group program permission | `api.projects.proxy.setGroupPermission` | `hoody projects proxy groups permissions set <group_name> http --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --access 8080` |
| `hoody projects proxy groups token set` |  | write | Set token authentication group (project) | `api.projects.proxy.setTokenGroup` | `hoody projects proxy groups token set <group_name> --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --header X-Api-Key --value <token>` |
| `hoody projects proxy permissions delete` |  | destructive | Delete project proxy permissions | `api.projects.proxy.deletePermissions` | `hoody projects proxy permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 -y` |
| `hoody projects proxy permissions get` |  | read | Get project proxy permissions | `api.projects.proxy.getPermissions` | `hoody projects proxy permissions get --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects proxy permissions set` |  | write | Replace project proxy permissions JSON | `api.projects.proxy.setPermissions` | `hoody projects proxy permissions set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --groups 'key={"type":"jwt","algorithm":"HS256","secret":"<32+ character key>","sources":["header:Authorization"]}' --permissions 'key={}' --default allow --enable-proxy` |
| `hoody projects proxy usage get` |  | read | Get proxied-usage documents for every computer in a project | `api.projects.proxy.getUsage` | `hoody projects proxy usage get --from <from> --to <to> --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects stats` |  | read | Get statistics for all computers in a project | `api.projects.getStats` | `hoody projects stats 507f1f77bcf86cd799439033 --watch 2s` |
| `hoody projects update` |  | write | Update project | `api.projects.update` | `hoody projects update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --color '#ff0000' --max-computers 10` |

### `hoody proxy` (7) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy aliases create` |  | write | Create a new proxy alias | `api.proxy.aliases.create` | `hoody proxy aliases create --computer-id 64f1a2b3c4d5e6f7a8b9c0d1 --program <program> --target-path /home/user/file.txt --expires-at 2099-01-01T00:00:00Z` |
| `hoody proxy aliases delete` |  | destructive | Delete proxy alias | `api.proxy.aliases.delete` | `hoody proxy aliases delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody proxy aliases disable` |  | write | Disable a proxy alias | `api.proxy.aliases.disable` | `hoody proxy aliases disable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases enable` |  | write | Enable a proxy alias | `api.proxy.aliases.enable` | `hoody proxy aliases enable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases get` |  | read | Get proxy alias by ID | `api.proxy.aliases.get` | `hoody proxy aliases get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases list` |  | read | List proxy aliases | `api.proxy.aliases.list` | `hoody proxy aliases list --project-id 64f1a2b3c4d5e6f7a8b9c0d1 --computer-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases update` |  | write | Update proxy alias | `api.proxy.aliases.update` | `hoody proxy aliases update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --index 10` |

### `hoody realms` (1) — Platform realms

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody realms list` |  | read | List your realm IDs | `api.realms.list` | `hoody realms list --include-usage` |

### `hoody referrals` (5) — Referral program: your link, codes and Referral credit

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody referrals codes check` |  | read | Check whether a custom referral code follows the rules and is still free (reserves nothing) | `api.referrals.codes.check` | `hoody referrals codes check <code>` |
| `hoody referrals codes create` |  | write | Create a custom referral code (at most 3 at a time, 10 in total) | `api.referrals.codes.create` | `hoody referrals codes create my-code` |
| `hoody referrals codes release` |  | destructive | Release a custom referral code for good: its links stop working and it is never given out again | `api.referrals.codes.release` | `hoody referrals codes release <code> -y` |
| `hoody referrals get` |  | read | Show your referral program status: codes, links, level, banded counts and Referral credit | `api.referrals.get` | `hoody referrals get` |
| `hoody referrals join` |  | write | Join the referral program and get your first code (accounts that paid for a server plan) | `api.referrals.join` | `hoody referrals join -y` |

### `hoody servers` (26) — Server rental marketplace, rentals, and remote commands

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody servers commands list` |  | read | Get available commands | `api.servers.listCommands` | `hoody servers commands list 64f1a2b3c4d5e6f7a8b9c0d1 --category general --risk-level low` |
| `hoody servers commands run` |  | action | Execute server command | `api.servers.runCommand` | `hoody servers commands run 64f1a2b3c4d5e6f7a8b9c0d1 --command-id 64f1a2b3c4d5e6f7a8b9c0d1 --parameters @parameters.json --wait` |
| `hoody servers extend` |  | write | Extend rental | `api.servers.extend` | `hoody servers extend 64f1a2b3c4d5e6f7a8b9c0d1 --expected-rental-end <expected_rental_end> --additional-days 10 --max-charge-cents 9500 -y` |
| `hoody servers get` |  | read | Get server details | `api.servers.get` | `hoody servers get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers jobs get` |  | read | Show the status of a paid subserver operation | `api.servers.getJob` | `hoody servers jobs get <id>` |
| `hoody servers list` |  | read | List user servers | `api.servers.list` | `hoody servers list --watch 2s` |
| `hoody servers marketplace list` |  | read | Browse rental marketplace | `api.servers.listMarketplace` | `hoody servers marketplace list --country US --region us-east` |
| `hoody servers offers list` |  | read | List machines available to order | `api.servers.listOffers` | `hoody servers offers list --discounted-only --locale de` |
| `hoody servers offers reserve` |  | write | Reserve an offer and charge your wallet immediately | `api.servers.reserveOffer` | `hoody servers offers reserve <id> --days 10 --max-charge-cents 9500 --idempotency-key <idempotency_key> -y` |
| `hoody servers plans list` |  | read | List the paid subserver plans you can buy | `api.servers.plans.list` | `hoody servers plans list --watch 2s` |
| `hoody servers plans quote` |  | read | Quote the price of a paid subserver plan | `api.servers.plans.quote` | `hoody servers plans quote <plan-id> --region eu-west-1` |
| `hoody servers plans regions` |  | read | List the regions a paid subserver plan is sold in | `api.servers.plans.listRegions` | `hoody servers plans regions <plan-id> --watch 2s` |
| `hoody servers regions list` |  | read | Get available server regions | `api.servers.listRegions` | `hoody servers regions list --watch 2s` |
| `hoody servers rent` |  | write | Rent server | `api.servers.rent` | `hoody servers rent 64f1a2b3c4d5e6f7a8b9c0d1 --pool-id 64f1a2b3c4d5e6f7a8b9c0d1 --rental-days 10 --max-charge-cents 9500 -y` |
| `hoody servers reservations get` |  | read | Show one of your reservations | `api.servers.getReservation` | `hoody servers reservations get <id>` |
| `hoody servers reservations list` |  | read | List your reservations | `api.servers.listReservations` | `hoody servers reservations list --limit 50 --offset 0` |
| `hoody servers stats` |  | read | Live CPU, memory and disk usage of a rental | `api.servers.getStats` | `hoody servers stats 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers subscriptions autorenew disable` |  | destructive | Turn off auto-renew for a server subscription | `api.servers.subscriptions.disableAutoRenew` | `hoody servers subscriptions autorenew disable <id> -y` |
| `hoody servers subscriptions autorenew enable` |  | destructive | Turn on auto-renew for a server subscription | `api.servers.subscriptions.enableAutoRenew` | `hoody servers subscriptions autorenew enable <id> -y` |
| `hoody servers subscriptions buy` |  | write | Buy a paid subserver and charge your wallet immediately | `api.servers.subscriptions.buy` | `hoody servers subscriptions buy --plan-id <plan-id> --region eu-west-1 --idempotency-key <idempotency_key> --max-charge-cents 9500 -y` |
| `hoody servers subscriptions cancel` |  | destructive | Cancel a paid subserver subscription (no refund; held after the paid period) | `api.servers.subscriptions.cancel` | `hoody servers subscriptions cancel <id> -y` |
| `hoody servers subscriptions get` |  | read | Show one of your paid subserver subscriptions | `api.servers.subscriptions.get` | `hoody servers subscriptions get <id>` |
| `hoody servers subscriptions list` |  | read | List your paid subserver subscriptions | `api.servers.subscriptions.list` | `hoody servers subscriptions list --limit 50 --offset 0` |
| `hoody servers subscriptions pay` |  | write | Pay a held subscription and resume it (charges one month) | `api.servers.subscriptions.pay` | `hoody servers subscriptions pay <id> --idempotency-key <idempotency_key> --max-charge-cents 9500 -y` |
| `hoody servers subscriptions quote` |  | read | Quote an upgrade of, or a payment for, a subscription | `api.servers.subscriptions.quote` | `hoody servers subscriptions quote <id> --action upgrade --plan-id <plan-id> --region eu-west-1` |
| `hoody servers subscriptions upgrade` |  | write | Upgrade a paid subserver and charge the difference | `api.servers.subscriptions.upgrade` | `hoody servers subscriptions upgrade <id> --plan-id <plan-id> --region eu-west-1 --idempotency-key <idempotency_key> --max-charge-cents 9500 -y` |

### `hoody snapshots` (5) — Computer snapshots

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody snapshots alias set` |  | write | Update snapshot alias | `api.snapshots.setAlias` | `hoody snapshots alias set my-resource --alias my-resource` |
| `hoody snapshots create` |  | write | Create computer snapshot | `api.snapshots.create` | `hoody snapshots create --alias my-resource --expiry 10` |
| `hoody snapshots delete` |  | destructive | Delete computer snapshot | `api.snapshots.delete` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 snapshots delete my-resource -y` |
| `hoody snapshots list` |  | read | Get computer snapshots | `api.snapshots.list` | `hoody snapshots list --watch 2s` |
| `hoody snapshots restore` |  | action | Restore computer from snapshot | `api.snapshots.restore` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 snapshots restore my-resource -y` |

### `hoody storage` (10) — Storage shares

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody storage computers incoming list` |  | read | Get incoming shares | `api.storage.incoming.listByComputer` | `hoody storage computers incoming list --watch 2s` |
| `hoody storage computers shares list` |  | read | List storage shares | `api.storage.shares.listByComputer` | `hoody storage computers shares list --target-type computer --label my-label` |
| `hoody storage incoming list` |  | read | Get all incoming shares | `api.storage.incoming.list` | `hoody storage incoming list --watch 2s` |
| `hoody storage incoming mount` |  | action | Mount an incoming share into the computer | `api.storage.incoming.mount` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 storage incoming mount 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage incoming unmount` |  | action | Unmount an incoming share from the computer | `api.storage.incoming.unmount` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 storage incoming unmount 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares create` |  | write | Create storage share | `api.storage.shares.create` | `hoody storage shares create --source-path /home/user/file.txt --target-computer 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |
| `hoody storage shares delete` |  | destructive | Delete storage share | `api.storage.shares.delete` | `hoody storage shares delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody storage shares get` |  | read | Get storage share | `api.storage.shares.get` | `hoody --computer 64f1a2b3c4d5e6f7a8b9c0d1 storage shares get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares list` |  | read | List all storage shares you have created, across all your computers | `api.storage.shares.list` | `hoody storage shares list --watch 2s` |
| `hoody storage shares update` |  | write | Update storage share | `api.storage.shares.update` | `hoody storage shares update 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |

### `hoody support` (9) — Support tickets: report a problem to Hoody support and read the replies (create, list, changes, get, reply, close, limits, keys)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody support changes list` |  | read | Tickets changed since --since (start without it, then poll every 60 seconds with the returned next_since) | `api.support.tickets.listChanges` | `hoody support changes list --since 2026-01-01T00:00:00Z --limit 50` |
| `hoody support close` |  | write | Close one of your tickets (a reply within 30 days reopens it) | `api.support.tickets.close` | `hoody support close 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody support create` |  | write | Open a support ticket; the message comes from --body or a UTF-8 text file (--body-file) | `api.support.tickets.create` | `hoody support create --subject "Computer will not start after resize" --category computers --body-file report.txt` |
| `hoody support get` |  | read | Show one of your tickets with its messages, newest first (marks it read) | `api.support.tickets.get` | `hoody support get 64f1a2b3c4d5e6f7a8b9c0d1 --before-seq 10 --limit 50` |
| `hoody support keys get` |  | read | Check whether a create that sent this client_key was saved: shows the ticket and its first message (marks nothing read; not found means unknown, not refused) | `api.support.tickets.getByKey` | `hoody support keys get <client_key>` |
| `hoody support limits get` |  | read | Show your support limits and what is used now | `api.support.getLimits` | `hoody support limits get` |
| `hoody support list` |  | read | List your support tickets, every status by default (--status open for the open ones) | `api.support.tickets.list` | `hoody support list --status open --limit 20` |
| `hoody support messages keys get` |  | read | Check whether a reply that sent this client_key to the ticket was saved: shows the message and the ticket (marks nothing read; not found means unknown, not refused) | `api.support.tickets.getMessageByKey` | `hoody support messages keys get 64f1a2b3c4d5e6f7a8b9c0d1 <client_key>` |
| `hoody support reply` |  | write | Add a message to one of your tickets (reopens it when closed less than 30 days ago); --body or --body-file | `api.support.tickets.reply` | `hoody support reply TICKET_ID --body-file more.txt` |

### `hoody users` (7) — User management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody users freetier status` |  | read | Show whether this account can claim a free server | `api.users.getFreeTierStatus` | `hoody users freetier status` |
| `hoody users get` |  | read | Get user by ID | `api.users.get` | `hoody users get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody users invites redeem` |  | write | Redeem a free-tier invite code to claim your free server | `api.users.redeemInvite` | `hoody users invites redeem --code HOODY-7Q4K-9F2M-3B8T-XR5W-2HKD-1` |
| `hoody users onboardingmilestones complete` |  | write | Mark an onboarding milestone as completed | `api.users.completeOnboardingMilestone` | `hoody users onboardingmilestones complete --milestone hub_tour_v1` |
| `hoody users securityhistory list` |  | read | List your account sign-ins and security events | `api.users.listSecurityHistory` | `hoody users securityhistory list --page 1 --limit 50` |
| `hoody users setup retry` |  | write | Retry free-tier account setup | `api.users.retrySetup` | `hoody users setup retry --region eu-west-1` |
| `hoody users update` |  | write | Update user profile | `api.users.update` | `hoody users update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |

### `hoody vault` (6) — Secure key-value vault

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vault clear` |  | destructive | Clear the vault of the current realm | `api.vault.clear` | `hoody vault clear -y` |
| `hoody vault delete` |  | destructive | Delete vault key | `api.vault.delete` | `hoody vault delete <key> -y` |
| `hoody vault get` |  | read | Get vault key | `api.vault.get` | `hoody vault get <key>` |
| `hoody vault list` |  | read | List vault keys | `api.vault.list` | `hoody vault list --watch 2s` |
| `hoody vault set` |  | write | Set vault key | `api.vault.set` | `hoody vault set <key> --value '{"api_key": "sk_test_123456", "encrypted": true}'` |
| `hoody vault stats` |  | read | Get vault statistics | `api.vault.getStats` | `hoody vault stats` |

### `hoody wallet` (26) — Balances, transactions, payments, and invoices

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody wallet balances general get` |  | read | Get general balance only | `api.wallet.getGeneralBalance` | `hoody wallet balances general get` |
| `hoody wallet balances get` |  | read | Get aggregate balances (general + AI) | `api.wallet.getBalances` | `hoody wallet balances get` |
| `hoody wallet credits fees list` |  | read | List AI credit fee history (platform fees charged on AI transfers) | `api.wallet.credits.listFees` | `hoody wallet credits fees list --page 1 --limit 20` |
| `hoody wallet credits get` |  | read | Get AI balance (limit, usage, remaining) | `api.wallet.credits.get` | `hoody wallet credits get` |
| `hoody wallet credits transfer` |  | write | Transfer from general balance to AI credits | `api.wallet.credits.transfer` | `hoody wallet credits transfer --amount 10.00 --expected-fee-bps 10 -y` |
| `hoody wallet githubbonus claim` |  | action | Claim the one-time GitHub connection bonus | `api.wallet.claimGithubBonus` | `hoody wallet githubbonus claim` |
| `hoody wallet githubbonus status` |  | read | Show the status of the GitHub connection bonus | `api.wallet.getGithubBonusStatus` | `hoody wallet githubbonus status` |
| `hoody wallet invoices create` |  | action | Generate invoice for transaction | `api.wallet.invoices.create` | `hoody wallet invoices create 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices download` |  | read | Download invoice PDF | `api.wallet.invoices.download` | `hoody wallet invoices download 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices get` |  | read | Get invoice by ID | `api.wallet.invoices.get` | `hoody wallet invoices get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices list` |  | read | Get all invoices | `api.wallet.invoices.list` | `hoody wallet invoices list --page 1 --limit 20` |
| `hoody wallet payments availability get` |  | read | Which payment rails are available to this account right now | `api.wallet.payments.getAvailability` | `hoody wallet payments availability get` |
| `hoody wallet payments card checkout create` |  | write | Start a card checkout to add funds (returns the checkout URL) | `api.wallet.payments.createCardCheckout` | `hoody wallet payments card checkout create --amount 25.00 -y` |
| `hoody wallet payments card intents get` |  | read | Get one card payment intent | `api.wallet.payments.getCardIntent` | `hoody wallet payments card intents get 665f1f77bcf86cd799439011` |
| `hoody wallet payments card intents list` |  | read | List your card payment intents | `api.wallet.payments.listCardIntents` | `hoody wallet payments card intents list --limit 20 --offset 0` |
| `hoody wallet payments crypto intents get` |  | read | Get one crypto payment intent | `api.wallet.payments.getCryptoIntent` | `hoody wallet payments crypto intents get 665f1f77bcf86cd799439012` |
| `hoody wallet payments crypto intents list` |  | read | List your crypto payment intents | `api.wallet.payments.listCryptoIntents` | `hoody wallet payments crypto intents list --limit 20 --offset 0` |
| `hoody wallet payments crypto invoices create` |  | write | Create a crypto payment invoice to add funds | `api.wallet.payments.createCryptoInvoice` | `hoody wallet payments crypto invoices create --amount 25.00 -y` |
| `hoody wallet payments methods create` |  | write | Add a new payment method | `api.wallet.payments.createMethod` | `hoody wallet payments methods create --type credit_card --name my-resource --details @details.json --is-default` |
| `hoody wallet payments methods default set` |  | write | Set a payment method as default | `api.wallet.payments.setDefaultMethod` | `hoody wallet payments methods default set 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods delete` |  | destructive | Delete a payment method | `api.wallet.payments.deleteMethod` | `hoody wallet payments methods delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody wallet payments methods get` |  | read | Get payment method by ID | `api.wallet.payments.getMethod` | `hoody wallet payments methods get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods list` |  | read | Get all payment methods | `api.wallet.payments.listMethods` | `hoody wallet payments methods list --page 1 --limit 100` |
| `hoody wallet payments methods update` |  | write | Update a payment method | `api.wallet.payments.updateMethod` | `hoody wallet payments methods update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --details @details.json` |
| `hoody wallet transactions get` |  | read | Get transaction by ID | `api.wallet.getTransaction` | `hoody wallet transactions get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet transactions list` |  | read | List transactions | `api.wallet.listTransactions` | `hoody wallet transactions list --page 1 --limit 20` |

