---
name: "hoody"
description: "Hoody: run code, processes, GUIs, browsers, databases, cron jobs and HTTP services on real cloud computers the user owns, and operate their Hoody account — containers, files across 60+ storage providers, secrets, proxies, billing, notifications. Use when a task needs a real computer in the cloud, or any operation against the user's own tenant. Abstain for pre-sales, compliance, support/status, third-party SSO, and generic programming help."
---
> _**mode-blend skill (chooser + SDK/HTTP/CLI side-by-side)** · ~13,825 tokens · hoody-sdk v1.0.0-beta.17_

# Hoody Agent Skill — pick a surface (SDK / HTTP / CLI)

Hoody is a remote-first computing platform: every workflow — coding, browsing, agents, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud containers reachable by URL, with zero local setup. A container is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere.

The control plane is the same across **three surfaces**: a typed **SDK** (`hoody-sdk`), the underlying **HTTP** API at `https://api.hoody.com`, and a system **CLI** (`hoody`). Pick whichever fits your runtime — they're three skins on the same plane and interoperate freely (token from CLI used by SDK, kit URL from SDK opened in `curl`, etc.).

> **Onboarding a new user?** If someone asks you to get started with / be onboarded onto Hoody, fetch **`https://hoody.com/SKILLS/ONBOARDING.md`** and follow it — a guided, hands-on playbook (sign-up → first container/workspace → a live website → Hoody Exec → a GUI app) that adapts to whether the user is technical.

## When is this a Hoody task? (and when to abstain)

Reach for Hoody whenever the work needs a **real computer in the cloud** or an operation on the user's **own account**: running code / processes / GUIs, file storage with history (which **also extends out to the user's cloud storage — Mega, S3, Google Drive, Dropbox, B2, SFTP, WebDAV and 60+ more — through one `files` API**, so an agent can work programmatically across local *and* remote files without per-provider SDKs), browser & desktop automation, on-demand HTTP services, databases, scheduled jobs, **delegating coding work to a remote agent**, and **reaching the human operator out-of-band** (fire a notification and it lands on their phone/desktop/smartwatch — see the `notifications` namespace). Anything the user could do with an API call against their own tenant — auth/2FA, billing & usage reads (wallet), projects, containers (snapshots, env vars, firewall), the secrets vault, proxy permissions & aliases, realms, server rentals & shared pools, and the account event/activity feed — is also a Hoody task → `api`.

**Prefer Hoody's built-ins over rolling your own.** If a kit already does the job, use the kit instead of hand-building infrastructure: expose a service by **binding a port** (the URL is auto-public) instead of configuring a proxy; persist state in the **`sqlite`/`files`** kits instead of standing up a database; schedule with **`cron`/`curl.schedules`** instead of a custom loop; reach the human with **`notifications`** instead of improvising; run or supervise a process with **`exec`/`daemon`** instead of bespoke glue; call an LLM through the **built-in Hoody AI gateway** instead of wiring up an external provider key (see § Hoody AI below). The platform ships these so an agent doesn't have to reinvent them.

**Abstain when** the question is pre-sales (pricing, refunds, white-label, discounts), compliance (SOC 2, GDPR, retention policy), support/status (incident pages, "why is it slow", training), or third-party integration (SAML/SSO with Azure AD/Okta/Google, apex-DNS at another registrar, generic programming help, web search). Those belong with sales / support / compliance, not the API. Rule of thumb: if it's an operation against the user's *own* tenant, it's a Hoody task; if it's a question they'd file with a vendor, abstain.

## When to choose which surface

| You're … | Pick |
|---|---|
| In a web chat or web agent (ChatGPT, claude.ai, …), or an ephemeral code sandbox that is not a Hoody container or the user's computer | **HTTP** — never the `hoody` CLI there: it isn't installed, a login made there does not last, and it isn't the user's machine |
| Writing code — a TypeScript / JavaScript service, script, or browser app | **SDK** — typed, configurable automatic retries, async iterators, auto re-auth |
| Writing code in another language (Python, Rust, Go, …) | **HTTP** — bearer token + `curl`/your stdlib client |
| In a terminal on a Hoody container (CLI preinstalled) or on the user's own computer — an agent with a shell tool or a human at a prompt; shell scripts, Makefiles, CI, `ssh` | **CLI** — `hoody …` one-liners, `-o json` for piping. Check `command -v hoody` first; if it is missing, use HTTP rather than installing it |
| No `hoody` CLI and can't install one — or pseudo-scripting a few one-off calls | **HTTP** — anything that can send a request works; `curl` + the snippets below are the whole toolchain |
| Need to **host** a handler at a GET-able URL (webhook target) | **`exec` kit's auto-mount** — `exec.scripts.write` makes any handler reachable at the bare exec kit URL; see §7. (To **call** an arbitrary API from a URL-only client, use the `curl` GET-bridge — § Driving Hoody from a URL-only client, near the end) |

Rule of thumb: **online (web chat, throwaway sandbox) → HTTP; code → SDK; terminal / agent shell where `hoody` is installed → CLI; no CLI available or anything else that speaks HTTP → HTTP.** Mix freely — token, kit URL, and container ID work across all three.

## Install + init — same task, three surfaces

**SDK**

```typescript
// npm install hoody-sdk
import { HoodyClient } from 'hoody-sdk';
const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  token: process.env.HOODY_TOKEN!,
});
const me = await hoody.api.auth.whoami();
```

**HTTP**

```bash
export A=https://api.hoody.com
# No token yet? Sign the user in through their browser (§2) and use the data.token it returns.
curl -s "$A/api/v1/users/auth/me" -H "Authorization: Bearer $TOKEN"
```

**CLI**

```bash
curl -fsSL https://install.hoody.com | sh   # macOS/Linux; PowerShell: iwr https://install.hoody.com/install.ps1 -UseB | iex
# Zero-install alternative: npx hoody-sdk --help   (also bunx / pnpm dlx)
hoody login --web --no-browser   # browser sign-in: prints a link + code to give the user (§2)
hoody auth whoami        # current user
hoody config set baseUrl https://api.hoody.com    # override default
```

**Auth model — one paragraph.** A bearer token authenticates against `https://api.hoody.com`; per-container kit URLs (`https://{P}-{C}-{kit}-1.{N}.containers.hoody.com`) are themselves the credential — the URL IS bearer for every kit (`files`, `sqlite`, `exec`, `terminal`, `display`, `notifications`, `agent`, …) `bot` included (its management routes take no account token, so gate the URL with proxy permissions). The `agent` kit (slug `agent`) needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — it is reached at its `-agent-1` kit URL exactly like any other kit (no claim minting, no `401 CLAIM_REQUIRED`). Realm-scoped: prepend `{realmId}.` to the API host. **Full reference: <https://hoody.com/SKILLS/SKILL-SDK.md> § Auth model** (or `SKILL-HTTP.md` / `SKILL-CLI.md` — same content, same `/SKILLS/` directory).

**Kit URLs — one paragraph.** A container created with `hoody_kit: true` exposes its kits (20 kit namespaces, plus the `desktop` surface) behind URLs of the shape `https://{projectId}-{containerId}-{kit_slug}-{n}.{server_name}.containers.hoody.com`. The `proxy_domains[]` array lists the container's configured proxy **aliases** (each with its `url`), not the standard kit URLs, and is **opt-in**: pass the boolean `true` to `containers.get(id, { include_proxy_domains: true })`, `containers.list({ include_proxy_domains: true })`, or `containers.listByProject(projectId, { include_proxy_domains: true })`. Standard kit URLs do not depend on that flag: assemble them from `{P}-{C}-{slug}-1.{server_name}.containers.hoody.com`, or use the SDK's `getKitUrl()` / `withContainer()`. Kits include `terminal`, `files`, `code`, `display`, `desktop`, `sqlite`, `browser`, `exec`, … each iframable, each backed by an HTTP/WS API. **Slug ≠ namespace for some kits** (`notifications` → `n`, `proxyLogs` → `logs`); the `agent` kit's slug equals its namespace (`agent`); see <https://hoody.com/SKILLS/SKILL-SDK.md> § Proxy URLs for the full slug table.

## Common operations — same task, three surfaces

For each operation below, the SDK / HTTP / CLI snippets do exactly the same thing. Pick the one that matches your runtime; the result is identical.

### 1. Sign up

**Default: the user signs up in their own browser** at `https://api.hoody.com/auth/signup` and clicks the verification link; then sign them in (§2). Never collect their password in chat. The API calls below are for a user who chooses to create the account from their own script or terminal.

Create a new account: `email` + `password` (at least 12 characters, at most 72 UTF-8 bytes, with at least 3 of the 4 character classes: uppercase, lowercase, digit, symbol). A verification email is sent on success; **the account is not active until the link is clicked**. Optional `region` (e.g. `eu-west`, `us-east`, `ap-southeast`) — auto-provisioning prefers a server in that region; omitted → GeoIP proximity. The marketing site's `https://hoody.com/signup` only joins the waitlist; it does not create an account. The calls below create one.

**A free-tier server, default project, and default container are normally auto-provisioned on signup** — no separate "rent server" / "create container" / "create project" steps needed for the first one. After you verify your email and log in (§2), `containers.list()` already returns one container (the auto-provisioned default; flagged `is_default: true` on the container AND its parent project). You can skip §4 entirely for the trial flow — go straight to using the container (§6 onwards). If the async auto-setup happens to fail (rare; transient server-allocation issue), call `POST /api/v1/users/me/retry-setup` — idempotent, and a no-op once a default server already exists. On a deployment that hands out free servers by invite code, the list stays empty and `retry-setup` answers `403 FREE_TIER_INVITE_REQUIRED`: redeem the code with `POST /api/v1/users/me/redeem-invite` `{ "code": "…" }`, which unlocks the account and tries to claim the server (`data.claim_blocked_reason: "pool_empty"` means none was free yet: call `retry-setup` again later).

**SDK**

```typescript
import { HoodyClient } from 'hoody-sdk';
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const r = await hoody.api.auth.signup({
  email: 'you@example.com',
  password: process.env.HOODY_PASSWORD!,
  region: 'eu-west',                 // optional — auto-provisioned server region
});
// r.data → { email: 'you@example.com' }
// Verify email, log in (§2), then the auto-provisioned default is already there:
//   const def = ((await hoody.api.containers.list()).data.containers ?? []).find(c => c.is_default);
// Rare async-setup failure → await hoody.api.users.retrySetup({});  (idempotent)
```

**HTTP**

```bash
curl -X POST "$A/api/v1/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<your-password>","region":"eu-west"}'
# → {"statusCode":200,"message":"...","data":{"email":"you@example.com"}}
# Verify the email link, log in (§2), then:
#   curl "$A/api/v1/containers" -H "Authorization: Bearer $TOKEN" | jq '.data.containers[] | select(.is_default)'
# Rare async-setup failure → curl -X POST "$A/api/v1/users/me/retry-setup" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'
```

**CLI**

```bash
hoody signup --email you@example.com --password "$HOODY_PASSWORD" --region eu-west
# Verify email, then `hoody login` (§2); the default container appears automatically:
#   hoody containers list -o json | jq '.containers[] | select(.is_default)'
# Rare async-setup failure → hoody users setup retry
```

### 2. Log in — through the user's browser

The user signs in (password, GitHub or Google, two-factor) on Hoody's own page; you receive the session from the API, and nobody types a password or pastes a token into chat. Start a request, give the user the returned link and code, then poll until they approve. The full recipe with every state is § Login in `SKILL-HTTP.md` / `SKILL-SDK.md` / `SKILL-CLI.md`.

**SDK**

```typescript
import { HoodyClient, isApiError } from 'hoody-sdk';
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const start = (await hoody.api.auth.device.start({ client_name: '<your name>', client: 'agent' })).data;
console.log(`Open ${start.verification_uri_complete} and check that the page shows ${start.user_code}`);
let interval = start.interval!;
let waitMs = interval * 1000;
const deadline = Date.now() + start.expires_in! * 1000;
for (;;) {
  await new Promise((r) => setTimeout(r, waitMs));
  if (Date.now() >= deadline) throw new Error('The sign-in code expired: start again');
  waitMs = interval * 1000;
  try {
    hoody.adoptSession(await hoody.api.auth.device.poll({ device_code: start.device_code! }, { timeoutMs: 20_000 }));
    break; // signed in: token and refresh token are held in memory
  } catch (err) {
    if (!isApiError(err)) throw err;
    const state = (err.response as { data?: { error?: string } } | undefined)?.data?.error; // 400: data.error
    if (state === 'authorization_pending') continue;
    if (state === 'slow_down') { interval += 5; waitMs = interval * 1000; continue; }
    if (err.status === 429) { waitMs = (err as { retryAfterMs?: number }).retryAfterMs ?? 300_000; continue; }
    throw err; // access_denied, expired_token, 404: see step 3
  }
}
```

**HTTP**

```bash
curl -sS -X POST "$A/api/v1/auth/device/code" -H 'Content-Type: application/json' \
  -d '{"client_name":"<your name>","client":"agent"}' | jq '.data'
# Give the user verification_uri_complete + user_code, then every `interval` seconds:
curl -sS -X POST "$A/api/v1/auth/device/token" -H 'Content-Type: application/json' \
  -d '{"device_code":"<device_code>"}'
# 400 {data:{error:"authorization_pending"}} → poll again; "slow_down" → add 5 s; 429 → wait Retry-After;
# 200 → data.token, data.refreshToken. A runnable two-step loop: § Login in SKILL-HTTP.md
```

**CLI**

```bash
hoody login --web --no-browser   # prints the link + code for the user, polls, saves the session
```

**Password login (fallback).** Only when the user chooses it and runs it themselves. `username` is 3-50 chars, alphanumeric with underscores and hyphens (`^[a-zA-Z0-9_-]{3,50}$`); use `email` for email-based login. Login password ≥ 8; signup ≥ 12.

**SDK**

```typescript
const r = await hoody.api.auth.login({
  email: 'you@example.com',  // or `username: 'alex_3'`
  password: process.env.HOODY_PASSWORD!,
});
if (r.data && 'temp_token' in r.data) {
  // 2FA-enabled account: verify the code and adopt the session it returns.
  await hoody.completeTwoFactorLogin(r.data.temp_token, codeFromAuthenticator);
} else if (r.data && 'token' in r.data) {
  hoody.adoptSession(r);  // keeps the refresh token too
}
```

**HTTP**

```bash
TOKEN=$(curl -X POST $A/api/v1/users/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"<your-password>"}' | jq -r '.data.token')
# 2FA branch returns {data:{requires_2fa:true,temp_token}}; verify at /users/auth/2fa/verify.
```

**CLI**

```bash
hoody login --email you@example.com -p   # prompts for the password without echoing it
# 2FA: hoody auth 2fa verify --temp-token "$TEMP_TOKEN" --code 123456  # TEMP_TOKEN is data.temp_token from the login response
```

### 3. List containers

**SDK**

```typescript
for await (const c of hoody.api.containers.listIterator()) {
  console.log(c.id, c.name, c.status);  // rows are typed from the list response
}
// Or: const page = await hoody.api.containers.listByProject(projectId);
```

**HTTP**

```bash
curl "$A/api/v1/containers" -H "Authorization: Bearer $TOKEN" \
  | jq '.data.containers[] | {id, name, status, server_name, project_id}'
# Or scoped to one project (the {P} you read off any row above):
curl "$A/api/v1/projects/{P}/containers" -H "Authorization: Bearer $TOKEN" \
  | jq '.data.containers[] | {id, name, status, server_name}'
```

**CLI**

```bash
hoody containers list -o wide
# `hoody … -o json` UNWRAPS the {data, statusCode} envelope — top level is what was in `data`.
# Filter by project: `containers list` has no project filter, and one call fetches
# every page, up to 10,000 items (--limit N caps the total; past the bound stderr says so):
hoody c list -o json | jq '.containers[] | select(.project_id=="{P}")'
```

### 4. Create a container

**Note:** signup auto-provisions a free-tier server + default container (§1), so for the very first container you don't need this — `containers.list()` already returns one. Use the call below to create **additional** containers (e.g. a second box on a different server, a project-scoped container, or one with `dev_kit: true`).

Defaults provision the `hoody_kit` (the kit services + runtimes). What a new computer has by default, with links and icons, is listed in `https://hoody.com/SKILLS/ONBOARDING.md` (Step 2). Pass `dev_kit: true` for the comprehensive coding setup (Node, Bun, Rust, Go, Docker, Nix, …).

**Need a `projectId`?** Every container row carries `project_id` — read it off §3's list (the auto-provisioned default's parent project is flagged `is_default`). SDK: `(await hoody.api.containers.list()).data.containers?.[0]?.project_id`; HTTP: `curl "$A/api/v1/containers" -H "Authorization: Bearer $TOKEN" | jq -r '.data.containers[0].project_id'`; CLI: `hoody c list -o json | jq -r '.containers[0].project_id'`.

**Need a `server_id`?** Discover from your existing rentals or rent a new server from the marketplace. Read each rental row's `server_id`, not its `id`: the rental `id` identifies the rental and only matches the server id on the auto-provisioned free-tier row.
- SDK: `(await hoody.api.servers.list()).data[0]?.server_id` (`undefined` when you hold no rental: check it before creating a container) (or `hoody.api.servers.listMarketplace({...})` + `hoody.api.servers.rent(serverId, {...})`)
- HTTP: `curl "$A/api/v1/rentals" -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].server_id'` (response is `{data: [...]}` — bare array, no `items` wrapper)
- CLI: `hoody servers list -o json | jq -r '.[0].server_id'` (CLI unwraps the envelope; top level is the array) — or `hoody servers marketplace list` → `hoody servers rent <id>`

**SDK**

```typescript
const c = await hoody.api.containers.create(projectId, {
  server_id: process.env.HOODY_SERVER_ID!,
  name: 'box-1',
  hoody_kit: true,
  dev_kit: true,
});
// Response fields are typed optional; the URL helpers and withContainer need a string id.
const container = { ...c.data!, id: c.data!.id! };
```

**HTTP**

```bash
curl -X POST "$A/api/v1/projects/{P}/containers" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"server_id":"{S}","name":"box-1","hoody_kit":true,"dev_kit":true}'
```

**CLI**

```bash
hoody containers create --project {P} --server-id {S} --name box-1 --hoody-kit --dev-kit
# Discover servers: hoody servers list; hoody servers marketplace list; hoody servers rent <id>
```

### 5. Lifecycle — start / stop / wait

Lifecycle verbs: `start | stop | restart | pause | resume`; `stop` also takes a force option that kills the container without a clean shutdown (CLI `--force`, SDK `containers.stop(id, undefined, { force: true })`). Fresh containers may take 10-60s to reach `running`.

**SDK**

```typescript
await hoody.api.containers.start(container.id);
let status: string | undefined;
const deadline = Date.now() + 120_000;
do {
  await new Promise(r => setTimeout(r, 2000));
  status = (await hoody.api.containers.get(container.id)).data!.status;
  if (['failed', 'deleted', 'deleting'].includes(status ?? '')) {
    throw new Error(`container reached terminal state: ${status}`);
  }
  if (Date.now() > deadline) throw new Error(`timeout waiting for running; last=${status}`);
} while (status !== 'running');
```

**HTTP**

```bash
curl -X POST "$A/api/v1/containers/{C}/start" -H "Authorization: Bearer $TOKEN"
until [ "$(curl -s "$A/api/v1/containers/{C}" -H "Authorization: Bearer $TOKEN" \
  | jq -r .data.status)" = "running" ]; do sleep 2; done
```

**CLI**

```bash
hoody containers start {C}
# `hoody … -o json` unwraps the envelope — top level is the container body, so `.status` (not `.data.status`).
until [[ "$(hoody containers get {C} -o json | jq -r .status)" == running ]]; do sleep 2; done
```

### 6. Read / write a file in a container

Path is **absolute** in the container's filesystem. SDK exposes `box.files.get` and `box.files.upload` after `await hoody.withContainer(c)`; HTTP and CLI hit the `files` kit URL directly.

**Beyond the container's own disk — `files` extends the filesystem to your cloud storage.** Connect any of 60+ rclone-backed targets — **Mega, S3, Google Drive, Dropbox, Backblaze B2, SFTP, WebDAV, …** — then operate on them through the *same* `files` endpoints by appending `?backend=<id>` (or `?type=<rclone-type>`), or FUSE-mount a backend **as** a local path (`mounts.create`) so downstream code reads it like any other directory. One programmatic API spans the user's entire storage footprint, so an agent can read / write / copy / move files **across remote providers** without a separate SDK per service. Git repositories are not a backend (`type=git` is refused): run `git` in the container through `terminal` or `daemon`, then work on the checkout through `files`. Requires a deployment with remote backends enabled; `glob`/`grep`/`?lines=`/journal history stay local-FS-only. See the `files` deep-dive in <https://hoody.com/SKILLS/SKILL-SDK/files.md> (or the SKILL-HTTP / SKILL-CLI variant) for the `backend`/`mounts` mechanics.

**SDK**

```typescript
const box = await hoody.withContainer(container);
// The readers resolve to the content itself: readText → string, readJson → parsed value,
// readBytes → Uint8Array. (files.get resolves to the { statusCode, message, data } envelope.)
const text = await box.files.readText('/etc/hostname');
await box.files.upload('/home/user/hello.txt', Buffer.from('hello'));   // the body is bytes
```

**HTTP**

```bash
F=https://{P}-{C}-files-1.{N}.containers.hoody.com/api/v1/files
curl "$F/etc/hostname"                                            # GET = download
curl -X PUT --data-binary 'hello' "$F/home/user/hello.txt"        # PUT = upload
curl -X PUT --data-binary 'more'  "$F/append/home/user/hello.txt" # append/-prefix = append
```

**CLI**

```bash
hoody --container {C} files get /home/user                                   # list
hoody --container {C} files get /etc/hostname -o raw                          # read
echo -n 'hello' | hoody --container {C} files upload /home/user/hello.txt        # write (body comes from stdin)
hoody --container {C} files upload /home/user/big.bin   < ./local.bin            # write (from file)
hoody --container {C} files upload /home/user/notes.txt < input.txt              # write (from stdin)
```

### 7. Run a script as an HTTP endpoint (`exec`)

The `exec` kit auto-mounts every `.ts` / `.js` you write via `exec.scripts.write` as an HTTP endpoint at the script's bare path. Scripts can be top-level code (with auto-injected `req`/`res`) or CommonJS `module.exports = (req, res) => …` — both are accepted. Once mounted, the script is reachable at `https://{P}-{C}-exec-1.{N}.containers.hoody.com/<bare-path>` from anywhere — that's the "HTTP" surface for this op.

**SDK**

```typescript
// 1. Write the script (auto-mounts at /build on the exec kit URL):
await box.exec.scripts.write({
  path: 'build.js',
  content: 'module.exports = (req, res) => res.json({ ok: true, ts: Date.now() });\n',
});
// 2. Trigger via the SDK accessor — multi-segment paths work: `api/build` is sent
//    as `api/build`, not `api%2Fbuild`. (`.` and `..` segments are rejected.)
const r = await box.exec.run('build');  // r.data → { ok: true, ts: … }
// Or fetch the bare URL — exec kit accepts the URL itself as bearer (works for any path depth):
const r2 = await fetch(`https://${container.project_id}-${container.id}-exec-1.${container.server_name}.containers.hoody.com/build`);
```

**HTTP**

```bash
# 1. Write the script (kit URL is the credential — no Authorization header):
E=https://{P}-{C}-exec-1.{N}.containers.hoody.com
curl -sX POST "$E/api/v1/exec/scripts/write" -H 'Content-Type: application/json' -d '{
  "path": "build.js",
  "content": "module.exports = (req, res) => res.json({ ok: true, ts: Date.now() });\n"
}'
# 2. Trigger — bare path on the kit URL, NOT prefixed with /api/v1/exec:
curl "$E/build"
```

**CLI**

```bash
# 1. Write the script:
hoody --container {C} exec scripts write \
  --path build.js \
  --content 'module.exports = (req, res) => res.json({ ok: true, ts: Date.now() });'
# 2. Trigger from anywhere:
curl https://{P}-{C}-exec-1.{N}.containers.hoody.com/build
# Or, route through the container's curl kit:
hoody --container {C} curl run --url 'https://{P}-{C}-exec-1.{N}.containers.hoody.com/build'
```

### 8. SQLite KV + Terminal — quick kit calls

Two minute-scale workhorses: a key/value store (any bytes under `text/plain` / `application/octet-stream`; a value sent as `application/json` must be valid JSON, else `400 INVALID_JSON_VALUE`) and a one-off shell command. Both speak directly to the kit URL of the container.

**SDK**

```typescript
// SQLite KV — pass the value itself (object, array, number, boolean): the SDK JSON-encodes it.
// Do not JSON.stringify it first: a string is stored as a JSON string. setMany items take string values.
await box.sqlite.kv.set('user:42', { name: 'Ada' }, {
  db: '/hoody/databases/app.db', create_db_if_missing: true,   // or a bare name: 'app'
});
// get() returns the ApiResponse envelope; .data is the stored value, a JSON value decoded.
const { data: v } = await box.sqlite.kv.get('user:42', { db: '/hoody/databases/app.db' });  // → { name: 'Ada' }

// One-off shell command in a fresh session; resolves to { stdout, stderr, exitCode, timedOut }, no envelope.
// A non-zero exit does not throw; stdout may end with a newline.
const { stdout, exitCode } = await box.terminal.run('uname -a && uptime');
```

**HTTP**

```bash
# SQLite KV — GET returns the raw stored bytes (no envelope); PUT/DELETE return a JSON status envelope.
S=https://{P}-{C}-sqlite-1.{N}.containers.hoody.com/api/v1/sqlite
KV="$S/kv/user:42?db=/hoody/databases/app.db&create_db_if_missing=true"
curl -X PUT "$KV" -H 'Content-Type: application/json' --data-raw '{"name":"Ada"}'  # → {"success":true,"key":"user:42","size":14}
curl "$KV"                                                                       # → {"name":"Ada"}   (raw stored body)
# GET on a missing key returns 404 with a JSON error envelope — check status before piping to jq.

# One-off shell command — on the terminal-0 host (the host index is the session; terminal-1 would reuse session 1):
T=https://{P}-{C}-terminal-0.{N}.containers.hoody.com/api/v1/terminal
curl -X POST "$T/execute?ephemeral=true" \
  -H 'Content-Type: application/json' -d '{"command":"uname -a","wait":true}'
```

**CLI**

```bash
# SQLite KV — CLI group is top-level `kv`; key is POSITIONAL, value goes in --body
hoody --container {C} kv set user:42 --db /hoody/databases/app.db --body '{"name":"Ada"}' --create-db-if-missing
hoody --container {C} kv get user:42 --db /hoody/databases/app.db -o raw

# One-off shell command
hoody --container {C} shell -- 'uname -a && uptime'   # quote it: an unquoted && runs `uptime` on YOUR machine
# Or:  hoody --container {C} shell -- tmux ls    (the command is POSITIONAL — there is no --command flag)
```

### 9. SSH into the container (full-Linux escape hatch)

When you need a real shell that outlives any HTTP call. SSH goes through the **SSH reverse proxy** at `{P}-{C}-ssh.{N}.containers.hoody.com` (no instance index, port `22`); the proxy authenticates your client against the registered `ssh_public_key` (set on container-create), then opens a shell **as `root`** inside the container via the supervisor (no in-container sshd; password auth not used). For non-root work, prefix with `sudo -u user` or use `runuser`. The container response field `ssh_hostname` gives you the full hostname. No key registered at create? Add/rotate one via `containers.update` (`PUT`/`PATCH /api/v1/containers/{C}`) with `ssh_public_key` (a full OpenSSH public-key line).

**SDK**

```typescript
const d = (await hoody.api.containers.get(container.id)).data!;
// d.ssh_hostname → "{P}-{C}-ssh.{N}.containers.hoody.com"
console.log(`Run locally:  ssh root@${d.ssh_hostname}`);
```

**HTTP**

```bash
curl -s "$A/api/v1/containers/{C}" -H "Authorization: Bearer $TOKEN" \
  | jq -r '"ssh root@\(.data.ssh_hostname)"'
```

**CLI**

```bash
# `hoody shell` is a WebSocket terminal through the kit
# — NOT a wrapper around the local `ssh` binary. To get a real SSH session, resolve the
# hostname and shell out yourself:
ssh root@$(hoody containers get {C} -o json | jq -r .ssh_hostname)
# One-shot:
ssh root@$(hoody containers get {C} -o json | jq -r .ssh_hostname) 'uname -a'
```

### 10. Expose a port — `http-{port}` / `https-{port}` URL

**Anything you bind on a container port is automatically reachable at a public URL.** Bind your HTTP(S) service to `0.0.0.0:<port>` or the container's network IP to reach it at the public URL. A listener bound only to `127.0.0.1` is not reachable through this proxy. No alias, no firewall edit, no proxy registration. Two URL slug forms:

| Slug | Inner protocol the proxy uses | Edge URL (always `https://`, TLS terminates at proxy) |
|---|---|---|
| `http-<port>` | proxy speaks **HTTP** to `<container-network-ip>:<port>` inside the container | `https://{P}-{C}-http-<port>.{N}.containers.hoody.com` |
| `https-<port>` | proxy speaks **HTTPS** (target must terminate TLS itself) | `https://{P}-{C}-https-<port>.{N}.containers.hoody.com` |

WebSockets just work via `wss://`. Port range `1..65535`; defaults: `http` → 80, `https` → 443. Same capability-token rules as any kit URL — the URL IS bearer; gate via `proxy.containerPermissions` if you don't want it open.

**SDK**

```typescript
// Start a server inside the container (any language; example uses python3 via terminal kit):
await box.terminal.commands.run(
  { command: 'nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &' },
  { ephemeral: true },
  { serviceIndex: 0 },  // terminal-0 host = fresh ephemeral session
);
// The URL is reachable from anywhere — no Authorization header:
const c = (await hoody.api.containers.get(container.id)).data!;
const url = `https://${c.project_id}-${c.id}-http-8080.${c.server_name}.containers.hoody.com`;
const r = await fetch(url);  // returns whatever your server returns
```

**HTTP**

```bash
# Once a server is bound on :8080 inside the container, hit the URL from anywhere:
curl https://{P}-{C}-http-8080.{N}.containers.hoody.com/

# WebSocket on :3000:
# wss://{P}-{C}-http-3000.{N}.containers.hoody.com/ws

# If your service ALREADY terminates TLS on :8443:
curl https://{P}-{C}-https-8443.{N}.containers.hoody.com/
```

**CLI**

```bash
# Bind a server (here: a one-liner Python static server on :8080):
hoody --container {C} shell -- 'nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &'
# Or use a real daemon: `hoody --container {C} daemon programs create --name web --command '...' --user user` for supervised lifecycle.
# Then hit it from anywhere:
curl https://{P}-{C}-http-8080.{N}.containers.hoody.com/
```

**Want to hide `{P}{C}` and brand the host?** Create a proxy alias (`POST /api/v1/proxy/aliases`, SDK `client.api.proxy.aliases.create`, CLI `hoody proxy aliases create`) with `program: 'http'` and `port: 8080` (prefer `port`; `index` is the legacy field and `port` wins over it) — your URL becomes `https://my-api.{N}.containers.hoody.com`. See <https://hoody.com/SKILLS/SKILL-SDK.md> § Proxy URLs (same section in SKILL-HTTP / SKILL-CLI).

### 11. GUI apps — display kit (X11 desktop in a browser tab)

The `display` kit gives every container virtual X11 servers, reachable two ways:

- **Visit `https://{P}-{C}-display-N.{N_srv}.containers.hoody.com/` in a browser** — interactive HTML5 desktop for display `:N`, mouse + keyboard + clipboard, iframable (set `allow="clipboard-read; clipboard-write"`). Same for `desktop-1` (full XFCE/MATE).
- **Drive programmatically** — screenshots + clicks + keystrokes + window queries via the HTTP/SDK/CLI surface. Coordinate origin is top-left; `button: 1`=left, `2`=middle, `3`=right.

**How displays are spawned.** Displays come from **persistent terminal sessions**: create a terminal with `terminal_id: N` AND a matching `display: ":N"` field — the kit exports `DISPLAY=:N` into that PTY and the `display-N` URL becomes live. **Ephemeral terminals strip `DISPLAY` unconditionally** — passing `display=` / `display_id=` on an ephemeral run is accepted, then silently dropped, so X11 apps never render. Always use a pinned session for GUIs. The pairing convention is "terminal_id `N` ↔ display `:N` ↔ URL `display-N`"; the kit does NOT auto-pair them — you pass `display: ":N"` explicitly.

A typical see-then-act loop: attach a viewer → capture → click/type → capture again to verify. Open `https://{P}-{C}-display-1.{N_srv}.containers.hoody.com/` in a browser first and keep it connected: click-at and type-at return `409 WINDOW_NOT_VIEWABLE` and send no input while no viewer is attached, or when the point has no viewable window. An uncropped screenshot spans the whole screen, so its pixel `(x,y)` is the click point `(x,y)`; replace the example `640,360` with a point inside the target window.

The examples assume terminal `1` is unused. Check first: SDK `box.terminal.sessions.list()`, HTTP `GET /api/v1/terminal/sessions`, CLI `hoody --container {C} terminal sessions list -o json`. Creating a terminal that already exists reports it as already active and keeps its original configuration, display included, and an existing ephemeral terminal answers `409 EPHEMERAL_SESSION`. If `1` is taken, pick an unused id `N` and use it everywhere: the terminal id, `display: ":N"`, the display selectors and the `terminal-N` / `display-N` hostnames (SDK creation then also takes `{ serviceIndex: N }`).

**SDK**

```typescript
// 1. Create a persistent terminal pinned to display :1
//    (terminal_id + display MUST be paired explicitly — no auto-mapping)
await box.terminal.sessions.create({
  terminal_id: '1',      // STRING (generated type is string; numeric 1-65535; ephemeral ids are auto-generated in 40000-65535)
  display: ':1',         // string — kit exports DISPLAY=:1 into the PTY
  shell: 'bash',
  user: 'user',
});
// 2. Launch a GUI app inside that session (use & to background — keeps PTY interactive)
await box.terminal.commands.run(
  { command: 'xeyes &' },
  { terminal_id: '1' },  // route to session 1 — DO NOT pass ephemeral:true
);
// 3. Keep the display-1 kit URL open in a browser (the viewer), then screenshot display :1 (base64 = inline; omit for arrayBuffer)
const shot = await box.display.screenshots.capture({ base64: true, displayId: 1 });
// 4. Click + type at a point inside a window (replace 640,360 with one from the screenshot)
await box.display.input.click({ x: 640, y: 360, button: 1 }, { displayId: 1 });
await box.display.input.type({ x: 640, y: 360, text: 'hello world' }, { displayId: 1 });
// 5. Re-capture to verify
const shot2 = await box.display.screenshots.capture({ base64: true, displayId: 1 });
```

**HTTP**

```bash
T=https://{P}-{C}-terminal-1.{N}.containers.hoody.com/api/v1/terminal
D=https://{P}-{C}-display-1.{N}.containers.hoody.com/api/v1/display
# 1. Create a persistent terminal session with terminal_id=1 AND display=":1"
curl -sX POST "$T/create" -H 'Content-Type: application/json' \
  -d '{"terminal_id":"1","display":":1","shell":"bash","user":"user"}'
# 2. Launch a GUI app inside terminal_id=1
#    NOTE: terminal_id MUST be on the query string, not in the body (body field is silently ignored)
curl -sX POST "$T/execute?terminal_id=1" -H 'Content-Type: application/json' \
  -d '{"command":"xeyes &","wait":false}'
# 3. Attach a viewer first: open  https://{P}-{C}-display-1.{N}.containers.hoody.com/  in a browser and keep it open
#    Screenshot display :1
curl -o shot.png "$D/screenshot?displayId=1"
# 4. Click + type at a point inside a window (replace 640,360; button is NUMERIC; 1=left, 2=middle, 3=right)
curl -sX POST "$D/input/click-at?displayId=1" -H 'Content-Type: application/json' \
  -d '{"x":640,"y":360,"button":1}'
curl -sX POST "$D/input/type-at?displayId=1"  -H 'Content-Type: application/json' \
  -d '{"x":640,"y":360,"text":"hello world"}'
# 5. Re-screenshot to verify the effect
```

**CLI**

```bash
# 1. Create a persistent terminal pinned to display :1
hoody --container {C} terminal sessions create --terminal-id 1 --display ':1' --shell bash --user user
# 2. Launch a GUI app inside terminal_id=1 (NOT --ephemeral — ephemeral strips DISPLAY)
hoody --container {C} terminal commands run --terminal-id 1 --command 'xeyes &'
# 3. Attach a viewer first: `hoody --container {C} display open` opens display-1 in your browser; keep it open
#    Screenshot display :1 — `--display-id 1` selects the virtual display
hoody --container {C} display screenshots capture --display-id 1 -o raw > shot.png
# 4. Click + type at coordinates
hoody --container {C} display input click --display-id 1 --x 640 --y 360 --button 1
hoody --container {C} display input type  --display-id 1 --x 640 --y 360 --text 'hello world'
# 5. Re-screenshot to verify the effect (same command as step 3)
```

**Full desktop (XFCE / MATE):** open `https://{P}-{C}-desktop-1.{N}.containers.hoody.com/` (default XFCE) or `?desktop_env=mate` (snake_case — the kit only honors `desktop_env`, camelCase silently falls back to XFCE). Iframable; same capability-token semantics. Multiple parallel agents → use distinct pairs (terminal_id `1` + display `:1` for agent A, terminal_id `2` + display `:2` for agent B, etc. — output and GUI both stay separated).

## Hoody AI — built-in LLM gateway (no API key)

Every container with AI enabled can call **Hoody AI**: an OpenAI-compatible gateway at `https://ai.hoody.com/api/v1`, usable from **inside the container** with **no provider setup and no API key**. The `api_key` field that OpenAI-compatible clients insist on is just a **usage-tracking tag, NOT a secret** — pass anything (convention: `container-<something>`). That means any OpenAI-compatible app or library works as-is from within the container: point **OpenWebUI**, the `openai` SDK, LangChain, or plain `curl` at the base URL and it works:

```bash
# From inside the container (e.g. run via the terminal kit):
curl https://ai.hoody.com/api/v1/chat/completions \
  -H 'Content-Type: application/json' -H 'Authorization: Bearer container-demo' \
  -d '{"model":"hoody-ai/hoody-free","messages":[{"role":"user","content":"hello"}]}'
```

**Free vs paid — check before you pick a model.** `hoody-ai/hoody-free` (bare `hoody-free` and `hoody/hoody-free` resolve to the same thing) is the built-in free tier: it costs nothing, needs no wallet credit, and is rate-limited per user rather than billed. **Every other model bills the wallet**, and a brand-new account starts at `ai_limit: "0.00"` — so a paid model there is refused outright, not merely expensive. Read `GET https://api.hoody.com/api/v1/wallet/balances/ai` and only use a catalog model when `ai_remaining` is non-zero. Model catalog with Hoody pricing: `GET https://api.hoody.com/api/v1/ai/models` (control plane, bearer token; **paid models only — the free model is not listed there**); AI credit transfer and grant fee history at `/api/v1/wallet/ai-fee-history`. The catalog is the source of truth for model ids — read it, don't guess one. In `exec` scripts you don't even need the URL — the runtime pre-injects `ai` / `model` / `generateText` globals already wired to Hoody AI, defaulting to `hoody-ai/hoody-free` (see the `exec` skill).

## Pitfalls (mode-agnostic)

- **A CLI flag belongs to the command it follows.** `hoody --container {C} files get /home/user` and `hoody files get /home/user --container {C}` are the same call: a global works in either position. But when the command declares a flag of its own with that spelling, the COMMAND gets it — `hoody agent github auth login --token ghp_x` sends the GitHub PAT, and the Hoody credential comes from `-t <hoody-token>` on the same line, from a position before the command, or from the config/env. The same rule covers `--format` (image or paper format on `browser screenshots capture` / `browser pdf export`, output format everywhere else), `--profile` (an AWS profile on the S3 backends) and `--output` (the document format on `notes document get`). When in doubt, put the Hoody global before the command.
- **Kit URL IS the credential — and a container restart does NOT rotate it.** The `{P}-{C}-{kit}-{n}` prefix is stable for the container's lifetime; only delete + recreate changes it. Don't paste it in public chats.
- **Gating a kit URL without recreating = replace the proxy-permissions policy, with optimistic locking.** GET the current document to read `file_version`, then PUT with `If-Match: file:v<N>` (428 without the header, 412 if stale). SDK: `client.api.proxy.containerPermissions.set(containerId, body, { ifMatch: 'file:v' + currentVersion })`; HTTP: `PUT /api/v1/containers/{C}/proxy/permissions`; CLI: `hoody containers proxy permissions set -c {C} --project {P} --groups … --permissions … --if-match file:v<N>` (the CLI does not auto-fetch the version). Give each group its per-program access. A caller who matches no group gets `default`, which is `'deny'` when omitted; set `default: 'allow'` only if unmatched callers should still get in. Full shape — auth groups + per-program permissions + hooks — is in <https://hoody.com/SKILLS/SKILL-SDK/api.md> § proxy.containerPermissions.
- **Kit auth is uniform — the URL is the credential.** `sqlite` / `files` / `exec` / `terminal` / `display` / `agent` etc. all accept the bare per-container kit URL as bearer (no extra headers, `bot`'s management routes included), reached directly. The `agent` (slug `agent`, host `…-agent-{index}.…`) kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers and never returns `401 CLAIM_REQUIRED`: reaching the kit URL is sufficient.
- **Refreshing a login token needs the refresh token twice** — in the body AND as `Authorization: Bearer <refreshToken>`, else `401 Invalid refresh token`. **SDK**: `api.auth.refresh({ refreshToken })` sends it in both places for you, and the client's automatic 401 recovery uses its stored refresh token before falling back to `credentials`. **HTTP**: send both yourself. **CLI**: `hoody auth refresh` sends both for you, using `--refresh-token` or the refresh token saved by the last `hoody login`, and saves the new tokens; with no saved refresh token, pass `--refresh-token` or run `hoody login` again.
- **Login JWTs expire (~1 day; refresh token ~7 days).** A `401` on the control plane is NOT retryable — the token is missing, stale, or expired: refresh (or re-login), then retry the call. For unattended automation the user asked for, mint a long-lived auth token instead (`auth.tokens.create` / `POST /api/v1/auth/tokens`) — scopable, IP-restrictable, rotatable; never mint one just to finish sign-in. Details: § Auth model in `SKILL-SDK.md` / `SKILL-HTTP.md` / `SKILL-CLI.md`.
- **Some list endpoints paginate.** Projects and containers accept `?page=N&limit=M` and return a `pagination` object; other routes use `offset`/`limit`, cursors, or a single collection response (auth tokens, vault keys, realms, proxy aliases, …). Follow each route's parameters and response schema (the per-namespace skill names which); on a paginated route a bare call returns only the FIRST page, so don't treat it as exhaustive. SDK: the `listIterator()` variants (e.g. `containers.listIterator()`) paginate only when the operation exposes pagination parameters; `auth.tokens.listIterator()` makes one request.
- **`server_name` is the routable host**, never `subserver_name`. Build kit URLs from `server_name` (returned in container details).
- **Container ≠ Docker.** It's a full Linux box: systemd, root, ssh, persistent disk, default user `user` with passwordless sudo (the Hoody Agent's shell has the same sudo).
- **Realm-scoped tokens.** Mint with `hoody.api.auth.tokens.create({ alias:'agent-x', realm_ids:[realmId] })` (SDK — the field is `alias` not `name`) / `POST /api/v1/auth/tokens` (HTTP). Use either **per-call** via the generated `_realm` option (`containers.list({ _realm: realmId })`, etc. — every control-plane `api.*` method accepts it; kit methods do not, since a kit call is routed by its container URL, not by realm) OR **globally** via `https://{realmId}.api.hoody.com` as the `baseURL`. Resources created under a realm-scoped client / host are auto-tagged with that realm.
- **Retryable errors:** `408 / 425 / 429 / 500 / 502 / 503 / 504`. SDK throws `ApiError` with `isApiError` / `isRetryableApiError` type guards; CLI exits non-zero with the message; HTTP returns the status code.
- **Failed/4xx body shape differs by surface.** The **control plane** (`api.hoody.com` / `client.api.*`) returns `{statusCode, error, message, data?}` consistently. **Per-container kits** use kit-specific shapes — `files` returns `{"success":false,"error":"<msg>","code":"<CODE>"}` (`code` optional); `sqlite` returns `{"error":"<msg>","code":"<CODE>"}` (a transaction error also carries `reqIdx`); `terminal` returns `{"error":"<msg>","code":"<CODE>"}` (`code` is an upper-case string such as `"REQUEST_TIMEOUT"` or `"NOT_FOUND"`, not numeric). Always branch on the HTTP status code, not on body field presence.

## Ask the docs over HTTP (any agent, no login)

Not sure how to do something? Hoody's docs assistant answers any "how do I…" over one **unauthenticated** call — `POST https://chatbot.hoody.com/mcp`, a stateless JSON-RPC MCP endpoint whose one tool `search_hoody_docs` returns the answer with cited doc URLs:

```bash
curl -s https://chatbot.hoody.com/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_hoody_docs","arguments":{"question":"How do I expose a port?"}}}'
```

Pipeline failures come back as HTTP-200 with `isError: true` (a result field, not an HTTP error). Wire it as a remote MCP server — `{ "mcp": { "hoody-docs": { "type": "remote", "url": "https://chatbot.hoody.com/mcp" } } }` — or use the plain-chat SSE fallback `POST https://chatbot.hoody.com/api/chat`. Reach for this whenever you're unsure which namespace solves a task.

## Driving Hoody from a URL-only client (no POST) — the `curl` kit GET-bridge

When the caller can **only fetch a URL** — the claude.ai web-fetch UI, a webhook/CRM field that takes a link, an `<img src>`/`<a href>`, an LLM tool with web-search-only access — route the request through the container's **`curl` kit**, which converts a bodyless HTTP call into a single GET-able URL and performs it for you (`{P}`/`{C}`/`{N}` as defined in § Kit URLs above, `<TOKEN>` = your bearer token):

```
# Any upstream call as ONE GET. response=transparent → raw body; omit → JSON envelope.
# A read (bearer_token authenticates, e.g. listing the control plane):
https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https%3A%2F%2Fapi.hoody.com%2Fapi%2Fv1%2Fcontainers&method=GET&bearer_token=<TOKEN>&response=transparent
# A full POST with a JSON body + header — no `method` param, so the body upgrades it to POST:
https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&json=%7B%22event%22%3A%22X%22%7D&header=Authorization:%20Bearer%20XYZ
```

Accepted GET params: `url`, `method`, **`data`** (raw body), **`json`** (JSON body — sets `Content-Type`), **`data_base64`** (binary-safe base64, URL-safe ok; precedence over `data`/`json`), repeatable **`header=Name: Value`**, plus `bearer_token`, `response` (`transparent`|`json`), `timeout`, `follow_redirects`, `session_id`, `user_agent`, `referer`, `save`/`save_path`, `insecure`, `compressed`, `job_name`. **Supplying a body with no `method` param auto-upgrades the method GET→POST** (an explicit `method=GET` wins and the body is dropped, so leave `method` out or set `POST`/`PUT`/`PATCH`), so a full body-bearing POST/PUT/PATCH (with headers) is one GET URL — that's the "any REST call → a single link" promise, made real. (Multipart `form` + binary `--data-binary @file` uploads remain POST-only.) Brand the bridge behind a `proxy.aliases.create({ container_id, program: 'curl' })` host (`container_id` is required) to hide `{P}{C}`. Full surface, sessions, and async jobs → the `curl` skill.

## Index — drill-down skills

### Per-mode

| Mode | Basic skill (start here) | FULL skill (basic + every namespace) | Use when |
|---|---|---|---|
| SDK | [SKILL-SDK.md](https://hoody.com/SKILLS/SKILL-SDK.md) | [SKILL-SDK-FULL.md](https://hoody.com/SKILLS/SKILL-SDK-FULL.md) | TS/JS service or browser app |
| HTTP | [SKILL-HTTP.md](https://hoody.com/SKILLS/SKILL-HTTP.md) | [SKILL-HTTP-FULL.md](https://hoody.com/SKILLS/SKILL-HTTP-FULL.md) | Any other language; raw `curl` |
| CLI | [SKILL-CLI.md](https://hoody.com/SKILLS/SKILL-CLI.md) | [SKILL-CLI-FULL.md](https://hoody.com/SKILLS/SKILL-CLI-FULL.md) | Shell scripts, CI, one-off ops |

### Per-namespace deep-dives

One sub-skill per namespace per mode. Each row below maps one namespace to its three mode-specific files; pick the column matching your runtime. The table is generated from the per-namespace notes, so its length is the namespace count.

**Still can't route a task?** Fetch the routing index **<https://hoody.com/SKILLS/INDEX.md>** (~8k tokens) — per-namespace ops lists plus routing hints for ambiguous cases (`tunnel` vs `api`, `daemon` vs `terminal` vs `exec`, `watch` vs `proxyLogs`, …). And when even the per-namespace skill runs out, the **machine-readable spec is the last rung**: the OpenAPI spec shipped in the package as `hoody-sdk/openapi.json` (full control plane + kits; YAML at `hoody-sdk/openapi.yaml`). Several kits also serve their own spec over HTTP, relative to the kit URL — `/api/v1/watch/openapi.json` on `watch`, `/api/v1/cron/openapi.json` on `cron`, `/api/v1/browser/openapi.json` on `browser`, `/api/v1/sqlite/openapi.json` on `sqlite`, `/openapi.json` on `exec` — and the path varies per kit, so take it from that kit's skill.

| Namespace | Purpose | SDK | HTTP | CLI |
|---|---|---|---|---|
| `agent` | In-container AI coding agent over HTTP | [SDK](https://hoody.com/SKILLS/SKILL-SDK/agent.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/agent.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/agent.md) |
| `api` | Platform control plane: identity, projects, containers, billing, vault | [SDK](https://hoody.com/SKILLS/SKILL-SDK/api.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/api.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/api.md) |
| `bot` | chat-app control of a container, Telegram first | [SDK](https://hoody.com/SKILLS/SKILL-SDK/bot.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/bot.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/bot.md) |
| `browser` | Per-container Chromium or Firefox instances, one per slot | [SDK](https://hoody.com/SKILLS/SKILL-SDK/browser.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/browser.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/browser.md) |
| `code` | VS Code in the browser, per container | [SDK](https://hoody.com/SKILLS/SKILL-SDK/code.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/code.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/code.md) |
| `cron` | managed crontab entries per system user | [SDK](https://hoody.com/SKILLS/SKILL-SDK/cron.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/cron.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/cron.md) |
| `curl` | full HTTP client gateway + REST-as-GET-URL bridge | [SDK](https://hoody.com/SKILLS/SKILL-SDK/curl.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/curl.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/curl.md) |
| `daemon` | supervisord program lifecycle (start any program; logs kept) | [SDK](https://hoody.com/SKILLS/SKILL-SDK/daemon.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/daemon.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/daemon.md) |
| `display` | programmatic GUI desktops with screenshots, input, and windows | [SDK](https://hoody.com/SKILLS/SKILL-SDK/display.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/display.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/display.md) |
| `egress` | the container's outbound HTTP proxy | [SDK](https://hoody.com/SKILLS/SKILL-SDK/egress.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/egress.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/egress.md) |
| `exec` | micro-services: any script or API as an instant HTTP endpoint | [SDK](https://hoody.com/SKILLS/SKILL-SDK/exec.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/exec.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/exec.md) |
| `files` | container filesystem over HTTP, with automatic Git-like change history | [SDK](https://hoody.com/SKILLS/SKILL-SDK/files.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/files.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/files.md) |
| `notes` | Collaborative notebooks, hierarchical nodes, documents, databases | [SDK](https://hoody.com/SKILLS/SKILL-SDK/notes.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/notes.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/notes.md) |
| `notifications` | Trigger and consume desktop notifications inside a container | [SDK](https://hoody.com/SKILLS/SKILL-SDK/notifications.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/notifications.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/notifications.md) |
| `pipe` | Zero-storage streaming HTTP transfers | [SDK](https://hoody.com/SKILLS/SKILL-SDK/pipe.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/pipe.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/pipe.md) |
| `proxyLogs` | Per-container request/response/event log query, stats, and SSE tail | [SDK](https://hoody.com/SKILLS/SKILL-SDK/proxyLogs.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/proxyLogs.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/proxyLogs.md) |
| `run` | resolve apps to shell commands | [SDK](https://hoody.com/SKILLS/SKILL-SDK/run.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/run.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/run.md) |
| `sqlite` | SQLite HTTP API | [SDK](https://hoody.com/SKILLS/SKILL-SDK/sqlite.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/sqlite.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/sqlite.md) |
| `terminal` | Persistent multiplayer PTY sessions over HTTP and WebSocket | [SDK](https://hoody.com/SKILLS/SKILL-SDK/terminal.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/terminal.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/terminal.md) |
| `tunnel` | reverse tunnels for HTTP/WS/TCP via container relay | [SDK](https://hoody.com/SKILLS/SKILL-SDK/tunnel.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/tunnel.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/tunnel.md) |
| `watch` | Linux inotify file-change streams with replay history | [SDK](https://hoody.com/SKILLS/SKILL-SDK/watch.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/watch.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/watch.md) |
