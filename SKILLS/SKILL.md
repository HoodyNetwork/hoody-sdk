---
name: "hoody"
description: "Hoody: run code, processes, GUIs, browsers, databases, cron jobs and HTTP services on real cloud computers the user owns, and operate their Hoody account — containers, files across 60+ storage providers, secrets, proxies, billing, notifications. Use when a task needs a real computer in the cloud, or any operation against the user's own tenant. Abstain for pre-sales, compliance, support/status, third-party SSO, and generic programming help."
---
> _**mode-blend skill (chooser + SDK/HTTP/CLI side-by-side)** · ~11,438 tokens · hoody-sdk v1.0.0-beta.11_

# Hoody Agent Skill — pick a surface (SDK / HTTP / CLI)

Hoody is a remote-first computing platform: every workflow — coding, browsing, agents, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud containers reachable by URL, with zero local setup. A container is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere.

The control plane is the same across **three surfaces**: a typed **SDK** (`hoody-sdk`), the underlying **HTTP** API at `https://api.hoody.com`, and a system **CLI** (`hoody`). Pick whichever fits your runtime — they're three skins on the same plane and interoperate freely (token from CLI used by SDK, kit URL from SDK opened in `curl`, etc.).

> **Onboarding a new user?** If someone asks you to get started with / be onboarded onto Hoody, fetch **`https://hoody.com/SKILLS/ONBOARDING.md`** and follow it — a guided, hands-on playbook (sign-up → first container/workspace → a live website → Hoody Exec → a GUI app) that adapts to whether the user is technical.

## When is this a Hoody task? (and when to abstain)

Reach for Hoody whenever the work needs a **real computer in the cloud** or an operation on the user's **own account**: running code / processes / GUIs, file storage with history (which **also extends out to the user's cloud storage — Mega, S3, Google Drive, Dropbox, B2, SFTP, WebDAV, Git and 60+ more — through one `files` API**, so an agent can work programmatically across local *and* remote files without per-provider SDKs), browser & desktop automation, on-demand HTTP services, databases, scheduled jobs, **delegating coding work to a remote agent**, and **reaching the human operator out-of-band** (fire a notification and it lands on their phone/desktop/smartwatch — see the `notifications` namespace). Anything the user could do with an API call against their own tenant — auth/2FA, billing & usage reads (wallet), projects, containers (snapshots, env vars, firewall), the secrets vault, proxy permissions & aliases, realms, server rentals & shared pools, and the account event/activity feed — is also a Hoody task → `api`.

**Prefer Hoody's built-ins over rolling your own.** If a kit already does the job, use the kit instead of hand-building infrastructure: expose a service by **binding a port** (the URL is auto-public) instead of configuring a proxy; persist state in the **`sqlite`/`files`** kits instead of standing up a database; schedule with **`cron`/`curl.schedules`** instead of a custom loop; reach the human with **`notifications`** instead of improvising; run or supervise a process with **`exec`/`daemon`** instead of bespoke glue; call an LLM through the **built-in Hoody AI gateway** instead of wiring up an external provider key (see § Hoody AI below). The platform ships these so an agent doesn't have to reinvent them.

**Abstain when** the question is pre-sales (pricing, refunds, white-label, discounts), compliance (SOC 2, GDPR, retention policy), support/status (incident pages, "why is it slow", training), or third-party integration (SAML/SSO with Azure AD/Okta/Google, apex-DNS at another registrar, generic programming help, web search). Those belong with sales / support / compliance, not the API. Rule of thumb: if it's an operation against the user's *own* tenant, it's a Hoody task; if it's a question they'd file with a vendor, abstain.

## When to choose which surface

| You're … | Pick |
|---|---|
| Writing code — a TypeScript / JavaScript service, script, or browser app | **SDK** — typed, retries, async iterators, auto re-auth |
| Writing code in another language (Python, Rust, Go, …) | **HTTP** — bearer token + `curl`/your stdlib client |
| In a terminal — an agent with a shell tool or a human at a prompt; shell scripts, Makefiles, CI, `ssh` | **CLI** — `hoody …` one-liners, `-o json` for piping (preinstalled in every container; zero-install `npx https://cli.hoody.com`) |
| No `hoody` CLI and can't install one — or pseudo-scripting a few one-off calls | **HTTP** — anything that can send a request works; `curl` + the snippets below are the whole toolchain |
| Need to **host** a handler at a GET-able URL (webhook target) | **`exec` kit's auto-mount** — `exec.scripts.write` makes any handler reachable at the bare exec kit URL; see §7. (To **call** an arbitrary API from a URL-only client, use the `curl` GET-bridge — § Driving Hoody from a URL-only client, near the end) |

Rule of thumb: **code → SDK; terminal / agent shell → CLI; no CLI available or anything else that speaks HTTP → HTTP.** Mix freely — token, kit URL, and container ID work across all three.

## Install + init — same task, three surfaces

**SDK**

```typescript
// npm install hoody-sdk
import { HoodyClient } from 'hoody-sdk';
const hoody = new HoodyClient({
  baseURL: 'https://api.hoody.com',
  token: process.env.HOODY_TOKEN!,
});
const me = await hoody.api.authentication.getCurrentUser();
```

**HTTP**

```bash
export A=https://api.hoody.com
# If you don't have a token yet, sign up + log in to mint a JWT (see §1 sign-up and §2 login 2FA branch):
TOKEN=$(curl -sX POST "$A/api/v1/users/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"hunter2-Yz"}' | jq -r '.data.token')
# Headless / long-lived alternative: POST /api/v1/auth/tokens (see § Auth model).
curl -s "$A/api/v1/users/auth/me" -H "Authorization: Bearer $TOKEN"
```

**CLI**

```bash
curl -fsSL https://install.hoody.com | sh   # macOS/Linux; PowerShell: iwr https://install.hoody.com/install.ps1 -UseB | iex
# Zero-install alternative: npx https://cli.hoody.com --help   (also bunx / pnpm dlx)
hoody login --username <user> --password <pass>   # bare `hoody login` is interactive; `--web` runs the device flow
hoody auth profile current        # current user
hoody config set baseUrl https://api.hoody.com    # override default
```

**Auth model — one paragraph.** A bearer token authenticates against `https://api.hoody.com`; per-container kit URLs (`https://{P}-{C}-{kit}-1.{N}.containers.hoody.com`) are themselves the credential — the URL IS bearer for every kit (`files`, `sqlite`, `exec`, `terminal`, `display`, `notifications`, `agent`, …). The `agent` kit (slug `agent`) needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — it is reached at its `-agent-1` kit URL exactly like any other kit (no claim minting, no `401 CLAIM_REQUIRED`). Realm-scoped: prepend `{realmId}.` to the API host. **Full reference: <https://hoody.com/SKILLS/SKILL-SDK.md> § Auth model** (or `SKILL-HTTP.md` / `SKILL-CLI.md` — same content, same `/SKILLS/` directory).

**Kit URLs — one paragraph.** Every container exposes ~18 kits behind URLs of the shape `https://{projectId}-{containerId}-{kit_slug}-{n}.{server_name}.containers.hoody.com`. The `proxy_domains[]` array (carrying the canonical `url` for each kit) is **opt-in**: pass the **string** `'true'` (the SDK validates `'true' | 'false'`, NOT a boolean) to `containers.get(id, { include_proxy_domains: 'true' })`, `containers.list({ include_proxy_domains: 'true' })`, or `containers.listByProject(projectId, { include_proxy_domains: 'true' })`. Omit the flag and you have to assemble URLs by hand from `{P}-{C}-{slug}-1.{server_name}.containers.hoody.com`. Kits include `terminal`, `files`, `code`, `display`, `desktop`, `sqlite`, `browser`, `exec`, … each iframable, each backed by an HTTP/WS API. **Slug ≠ namespace for some kits** (`notifications` → `n`, `proxyLogs` → `logs`); the `agent` kit's slug equals its namespace (`agent`); see <https://hoody.com/SKILLS/SKILL-SDK.md> § Proxy URLs for the full slug table.

## Common operations — same task, three surfaces

For each operation below, the SDK / HTTP / CLI snippets do exactly the same thing. Pick the one that matches your runtime; the result is identical.

### 1. Sign up

Create a new account: `email` + `password` (≥ 12 chars, MUST include uppercase + lowercase + digit + special). A verification email is sent on success; **the account is not active until the link is clicked**. Optional `region` (e.g. `eu-west`, `us-east`, `ap-southeast`) — auto-provisioning prefers a server in that region; omitted → GeoIP proximity. Signup is also reachable via the marketing site at `https://hoody.com/signup` for human flows; the calls below are the programmatic surface.

**A free-tier server, default project, and default container are auto-provisioned on signup** — no separate "rent server" / "create container" / "create project" steps needed for the first one. After you verify your email and log in (§2), `containers.list()` already returns one container (the auto-provisioned default; flagged `is_default: true` on the container AND its parent project). You can skip §4 entirely for the trial flow — go straight to using the container (§6 onwards). If the async auto-setup happens to fail (rare; transient server-allocation issue), call `POST /api/v1/users/me/retry-setup` — idempotent, safe to call repeatedly, and a no-op once a default server already exists.

**SDK**

```typescript
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const r = await hoody.api.authentication.signup({
  email: 'you@example.com',
  password: 'Hunter2-Yz!Strong',
  region: 'eu-west',                 // optional — auto-provisioned server region
});
// r.data → { email: 'you@example.com' }
// Verify email, log in (§2), then the auto-provisioned default is already there:
//   const def = (await hoody.api.containers.list()).data!.containers.find(c => c.is_default);
// Rare async-setup failure → await hoody.api.users.retrySetup({});  (idempotent)
```

**HTTP**

```bash
curl -X POST "$A/api/v1/auth/signup" \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"Hunter2-Yz!Strong","region":"eu-west"}'
# → {"statusCode":200,"message":"...","data":{"email":"you@example.com"}}
# Verify the email link, log in (§2), then:
#   curl "$A/api/v1/containers" -H "Authorization: Bearer $TOKEN" | jq '.data.containers[] | select(.is_default)'
# Rare async-setup failure → curl -X POST "$A/api/v1/users/me/retry-setup" -H "Authorization: Bearer $TOKEN"
```

**CLI**

```bash
hoody auth signup --email you@example.com --password 'Hunter2-Yz!Strong' --region eu-west
# Verify email, then `hoody login` (§2); the default container appears automatically:
#   hoody containers list -o json | jq '.containers[] | select(.is_default)'
# Rare async-setup failure → hoody users retry-setup
```

### 2. Log in

`username` is 3-50 chars, alphanumeric with underscores and hyphens (`^[a-zA-Z0-9_-]{3,50}$`); use `email` for email-based login. Login password ≥ 8; signup ≥ 12.

**SDK**

```typescript
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
const r = await hoody.api.authentication.login({
  email: 'you@example.com',  // or `username: 'alex_3'`
  password: 'hunter2-Yz',
});
const d = r.data as any;
if (d?.requires_2fa) {
  // 2FA-enabled account: verify the code; THAT response carries the real token.
  const r2 = await hoody.api.tfa.verify({ temp_token: d.temp_token, code: codeFromAuthenticator });
  hoody.setToken((r2.data as any).token);
} else {
  hoody.setToken(d.token);
}
```

**HTTP**

```bash
TOKEN=$(curl -X POST $A/api/v1/users/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alex","password":"hunter2-Yz"}' | jq -r '.data.token')
# 2FA branch returns {data:{requires_2fa:true,temp_token}}; verify at /users/auth/2fa/verify.
```

**CLI**

```bash
hoody login --username alex --password 'hunter2-Yz'
# 2FA: hoody auth 2fa verify --temp-token "$TEMP_TOKEN" --code 123456  # TEMP_TOKEN is data.temp_token from the login response
```

### 3. List containers

**SDK**

```typescript
for await (const c of hoody.api.containers.listIterator()) {
  console.log(c.id, c.name, c.status);
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
hoody c list -o json | jq '.containers[] | select(.project_id=="{P}")'  # filter by project
```

### 4. Create a container

**Note:** signup auto-provisions a free-tier server + default container (§1), so for the very first container you don't need this — `containers.list()` already returns one. Use the call below to create **additional** containers (e.g. a second box on a different server, a project-scoped container, or one with `dev_kit: true`).

Defaults provision the `hoody_kit` (~18 kits + runtimes). Pass `dev_kit: true` for the comprehensive coding setup (Node, Bun, Rust, Go, Docker, Nix, …).

**Need a `projectId`?** Every container row carries `project_id` — read it off §3's list (the auto-provisioned default's parent project is flagged `is_default`). SDK: `(await hoody.api.containers.list()).data!.containers[0].project_id`; HTTP: `curl "$A/api/v1/containers" -H "Authorization: Bearer $TOKEN" | jq -r '.data.containers[0].project_id'`; CLI: `hoody c list -o json | jq -r '.containers[0].project_id'`.

**Need a `server_id`?** Discover from your existing rentals or rent a new server from the marketplace:
- SDK: `(await hoody.api.rentals.list()).data![0].id` (or `hoody.api.serverRental.browse({...})` + `hoody.api.serverRental.rent(serverId, {...})`)
- HTTP: `curl "$A/api/v1/rentals" -H "Authorization: Bearer $TOKEN" | jq -r '.data[0].id'` (response is `{data: [...]}` — bare array, no `items` wrapper)
- CLI: `hoody servers list-rentals -o json | jq -r '.[0].id'` (CLI unwraps the envelope; top level is the array) — or `hoody servers marketplace` → `hoody servers rent <id>`

**SDK**

```typescript
const c = await hoody.api.containers.create(projectId, {
  server_id: process.env.HOODY_SERVER_ID!,
  name: 'box-1',
  hoody_kit: true,
  dev_kit: true,
});
const container = c.data!;
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
# Discover servers: hoody servers {list-rentals|marketplace|rent <id>}
```

### 5. Lifecycle — start / stop / wait

Valid ops: `start | stop | force-stop | restart | pause | resume`. Fresh containers may take 10-60s to reach `running`.

**SDK**

```typescript
await hoody.api.containers.manage(container.id, 'start');
let c;
const deadline = Date.now() + 120_000;
do {
  await new Promise(r => setTimeout(r, 2000));
  c = (await hoody.api.containers.get(container.id)).data!;
  if (['failed', 'deleted', 'deleting'].includes(c.status)) {
    throw new Error(`container reached terminal state: ${c.status}`);
  }
  if (Date.now() > deadline) throw new Error(`timeout waiting for running; last=${c.status}`);
} while (c.status !== 'running');
```

**HTTP**

```bash
curl -X POST "$A/api/v1/containers/{C}/start" -H "Authorization: Bearer $TOKEN"
until [ "$(curl -s "$A/api/v1/containers/{C}" -H "Authorization: Bearer $TOKEN" \
  | jq -r .data.status)" = "running" ]; do sleep 2; done
```

**CLI**

```bash
hoody containers manage {C} start
# `hoody … -o json` unwraps the envelope — top level is the container body, so `.status` (not `.data.status`).
until [[ "$(hoody containers get {C} -o json | jq -r .status)" == running ]]; do sleep 2; done
```

### 6. Read / write a file in a container

Path is **absolute** in the container's filesystem. SDK exposes `box.files.get / put` after `await hoody.withContainer(c)`; HTTP and CLI hit the `files` kit URL directly.

**Beyond the container's own disk — `files` extends the filesystem to your cloud storage.** Connect any of 60+ rclone-backed targets — **Mega, S3, Google Drive, Dropbox, Backblaze B2, SFTP, WebDAV, Git, …** — then operate on them through the *same* `files` endpoints by appending `?backend=<id>` (or `?type=<rclone-type>`), or FUSE-mount a backend **as** a local path (`mounts.create`) so downstream code reads it like any other directory. One programmatic API spans the user's entire storage footprint, so an agent can read / write / copy / move files **across remote providers** without a separate SDK per service. Requires the kit started with `--allow-remote`; `glob`/`grep`/`?lines=`/journal history stay local-FS-only. See the `files` deep-dive in <https://hoody.com/SKILLS/SKILL-SDK/files.md> (or the SKILL-HTTP / SKILL-CLI variant) for the `backend`/`mounts` mechanics.

**SDK**

```typescript
const box = await hoody.withContainer(container);
// SDK get() returns the ApiResponse envelope by default — pass `rawResponse: true`
// to get the body directly, OR read `.data` off the result.
const r = await box.files.get('/etc/hostname', { responseType: 'text', rawResponse: true });
const text = r as unknown as string;
await box.files.put('/workspace/hello.txt', Buffer.from('hello'));
```

**HTTP**

```bash
F=https://{P}-{C}-files-1.{N}.containers.hoody.com/api/v1/files
curl "$F/etc/hostname"                                            # GET = download
curl -X PUT --data-binary 'hello' "$F/workspace/hello.txt"        # PUT = upload
curl -X PUT --data-binary 'more'  "$F/append/workspace/hello.txt" # append/-prefix = append
```

**CLI**

```bash
hoody --container {C} files dir /workspace                                   # list
hoody --container {C} files get /etc/hostname -o raw                          # read
echo -n 'hello' | hoody --container {C} files put /workspace/hello.txt        # write (body comes from stdin)
hoody --container {C} files put /workspace/big.bin   < ./local.bin            # write (from file)
hoody --container {C} files put /workspace/notes.txt < input.txt              # write (from stdin)
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
// 2. Trigger via the SDK accessor — single-segment path only.
//    (The accessor URL-encodes `/` to %2F, so multi-segment routes like `api/build`
//     must be hit via fetch on the bare kit URL — see option below.)
const r = await box.exec.execution.execute('build');  // r.data → { ok: true, ts: … }
// Or fetch the bare URL — exec kit accepts the URL itself as bearer (works for any path depth):
const r2 = await fetch(`https://${c.project_id}-${c.id}-exec-1.${c.server_name}.containers.hoody.com/build`);
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
hoody --container {C} curl get-url --url 'https://{P}-{C}-exec-1.{N}.containers.hoody.com/build'
```

### 8. SQLite KV + Terminal — quick kit calls

Two minute-scale workhorses: a key/value store (any bytes, JSON-encoded if you like — kit is opaque) and a one-off shell command. Both speak directly to the kit URL of the container.

**SDK**

```typescript
// SQLite KV — value is a string; JSON-encode objects yourself.
await box.sqlite.kvStore.set('user:42', JSON.stringify({ name: 'Ada' }), {
  db: '/data/app.db', create_db_if_missing: true,
});
// get() returns the ApiResponse envelope; .data is the stored body (a JSON STRING here — parse yourself).
const r = await box.sqlite.kvStore.get('user:42', { db: '/data/app.db' });
const v = JSON.parse(r.data as string);  // → { name: 'Ada' }

// One-off shell command (ephemeral terminal — no session reuse):
const run = await box.terminal.execution.execute(
  { command: 'uname -a && uptime' },
  { ephemeral: true },
);
```

**HTTP**

```bash
# SQLite KV — GET returns the raw stored bytes (no envelope); PUT/DELETE return a JSON status envelope.
S=https://{P}-{C}-sqlite-1.{N}.containers.hoody.com/api/v1/sqlite
KV="$S/kv/user:42?db=/data/app.db&create_db_if_missing=true"
curl -X PUT "$KV" -H 'Content-Type: application/json' --data-raw '{"name":"Ada"}'  # → {"success":true,"key":"user:42","size":14}
curl "$KV"                                                                       # → {"name":"Ada"}   (raw stored body)
# GET on a missing key returns 404 with a JSON error envelope — check status before piping to jq.

# One-off shell command:
T=https://{P}-{C}-terminal-1.{N}.containers.hoody.com/api/v1/terminal
curl -X POST "$T/execute?ephemeral=true" \
  -H 'Content-Type: application/json' -d '{"command":"uname -a","wait":true}'
```

**CLI**

```bash
# SQLite KV — CLI group is top-level `kv`; key is POSITIONAL, value goes in --body
hoody --container {C} kv set user:42 --db /data/app.db --body '{"name":"Ada"}' --create-db-if-missing
hoody --container {C} kv get user:42 --db /data/app.db -o raw

# One-off shell command
hoody --container {C} shell -- uname -a && uptime
# Or:  hoody pty {C} -- tmux ls    (`pty`/`ssh` alias `hoody shell`;
#                                 the command is POSITIONAL — there is no --command flag)
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
# `hoody ssh` is a re-dispatch alias to `hoody shell` (WebSocket terminal through the kit)
# — NOT a wrapper around the local `ssh` binary. To get a real SSH session, resolve the
# hostname and shell out yourself:
ssh root@$(hoody containers get {C} -o json | jq -r .ssh_hostname)
# One-shot:
ssh root@$(hoody containers get {C} -o json | jq -r .ssh_hostname) 'uname -a'
```

### 10. Expose a port — `http-{port}` / `https-{port}` URL

**Anything you bind on a container port is automatically reachable at a public URL.** No alias, no firewall edit, no proxy registration. Two URL slug forms:

| Slug | Inner protocol the proxy uses | Edge URL (always `https://`, TLS terminates at proxy) |
|---|---|---|
| `http-<port>` | proxy speaks **HTTP** to `localhost:<port>` inside the container | `https://{P}-{C}-http-<port>.{N}.containers.hoody.com` |
| `https-<port>` | proxy speaks **HTTPS** (target must terminate TLS itself) | `https://{P}-{C}-https-<port>.{N}.containers.hoody.com` |

WebSockets just work via `wss://`. Port range `1..65535`; defaults: `http` → 80, `https` → 443. Same capability-token rules as any kit URL — the URL IS bearer; gate via `proxyPermissionsContainer` if you don't want it open.

**SDK**

```typescript
// Start a server inside the container (any language; example uses python3 via terminal kit):
await box.terminal.execution.execute(
  { command: 'nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &' },
  { ephemeral: true },
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
hoody --container {C} run -- nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &
# Or use a real daemon: `hoody --container {C} daemon programs create --name web --command '...' --user user` for supervised lifecycle.
# Then hit it from anywhere:
curl https://{P}-{C}-http-8080.{N}.containers.hoody.com/
```

**Want to hide `{P}{C}` and brand the host?** Create a `proxyAlias` with `program: 'http'` and `port: 8080` (prefer `port`; `index` is the legacy field and `port` wins over it) — your URL becomes `https://my-api.{N}.containers.hoody.com`. See <https://hoody.com/SKILLS/SKILL-SDK.md> § Proxy URLs (same section in SKILL-HTTP / SKILL-CLI).

### 11. GUI apps — display kit (X11 desktop in a browser tab)

The `display` kit gives every container virtual X11 servers (Xpra-backed), reachable two ways:

- **Visit `https://{P}-{C}-display-N.{N_srv}.containers.hoody.com/` in a browser** — interactive HTML5 desktop for display `:N`, mouse + keyboard + clipboard, iframable (set `allow="clipboard-read; clipboard-write"`). Same for `desktop-1` (full XFCE/MATE).
- **Drive programmatically** — screenshots + clicks + keystrokes + window queries via the HTTP/SDK/CLI surface. Coordinate origin is top-left; `button: 1`=left, `2`=middle, `3`=right.

**How displays are spawned.** Displays come from **persistent terminal sessions**: create a terminal with `terminal_id: N` AND a matching `display: ":N"` field — the kit exports `DISPLAY=:N` into that PTY and the `display-N` URL becomes live. **Ephemeral terminals strip `DISPLAY` unconditionally** — passing `display=` / `display_id=` on an ephemeral run is accepted, then silently dropped, so X11 apps never render. Always use a pinned session for GUIs. The pairing convention is "terminal_id `N` ↔ display `:N` ↔ URL `display-N`"; the kit does NOT auto-pair them — you pass `display: ":N"` explicitly.

A typical see-then-act loop: capture → click/type → capture again to verify.

**SDK**

```typescript
// 1. Create a persistent terminal pinned to display :1
//    (terminal_id + display MUST be paired explicitly — no auto-mapping)
await box.terminal.sessions.create({
  terminal_id: '1',      // STRING (generated type is string; numeric range 1-39999; 40000+ reserved for ephemeral)
  display: ':1',         // string — kit exports DISPLAY=:1 into the PTY
  shell: 'bash',
  user: 'user',
});
// 2. Launch a GUI app inside that session (use & to background — keeps PTY interactive)
await box.terminal.execution.execute(
  { command: 'xeyes &' },
  { terminal_id: '1' },  // route to session 1 — DO NOT pass ephemeral:true
);
// 3. Screenshot display :1 (base64 = inline; omit for arrayBuffer)
const shot = await box.display.screenshots.capture({ base64: true, displayId: 1 });
// 4. Click + type at coordinates
await box.display.input.clickAt({ x: 640, y: 360, button: 1 }, { displayId: 1 });
await box.display.input.typeAt({ x: 640, y: 360, text: 'hello world' }, { displayId: 1 });
// 5. Re-capture to verify
const shot2 = await box.display.screenshots.capture({ base64: true, displayId: 1 });
```

**HTTP**

```bash
T=https://{P}-{C}-terminal-1.{N}.containers.hoody.com/api/v1/terminal
D=https://{P}-{C}-display-1.{N}.containers.hoody.com/api/v1/display
# 1. Create a persistent terminal session with terminal_id=1 AND display=":1"
curl -sX POST "$T/create" -H 'Content-Type: application/json' \
  -d '{"terminal_id":1,"display":":1","shell":"bash","user":"user"}'
# 2. Launch a GUI app inside terminal_id=1
#    NOTE: terminal_id MUST be on the query string, not in the body (body field is silently ignored)
curl -sX POST "$T/execute?terminal_id=1" -H 'Content-Type: application/json' \
  -d '{"command":"xeyes &","wait":false}'
# 3. Screenshot display :1
curl -o shot.png "$D/screenshot?displayId=1"
# 4. Click + type at coordinates (button is NUMERIC; 1=left, 2=middle, 3=right)
curl -sX POST "$D/input/click-at?displayId=1" -H 'Content-Type: application/json' \
  -d '{"x":640,"y":360,"button":1}'
curl -sX POST "$D/input/type-at?displayId=1"  -H 'Content-Type: application/json' \
  -d '{"x":640,"y":360,"text":"hello world"}'
# 5. Live view in browser: open  https://{P}-{C}-display-1.{N}.containers.hoody.com/
```

**CLI**

```bash
# 1. Create a persistent terminal pinned to display :1
hoody --container {C} terminal sessions create --terminal-id 1 --display ':1' --shell bash --user user
# 2. Launch a GUI app inside terminal_id=1 (NOT --ephemeral — ephemeral strips DISPLAY)
hoody --container {C} terminal sessions exec --terminal-id 1 --command 'xeyes &'
# 3. Screenshot display :1 — `--display-id 1` selects the virtual display
hoody --container {C} display screenshots capture --display-id 1 -o raw > shot.png
# 4. Click + type at coordinates
hoody --container {C} display input click-at --display-id 1 --x 640 --y 360 --button 1
hoody --container {C} display input type-at  --display-id 1 --x 640 --y 360 --text 'hello world'
# 5. Open the live desktop in a browser:
hoody --container {C} display open    # opens display-1 kit URL in your browser
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

**Free vs paid — check before you pick a model.** `hoody-ai/hoody-free` (bare `hoody-free` and `hoody/hoody-free` resolve to the same thing) is the built-in free tier: it costs nothing, needs no wallet credit, and is rate-limited per user rather than billed. **Every other model bills the wallet**, and a brand-new account starts at `ai_limit: "0.00"` — so a paid model there is refused outright, not merely expensive. Read `GET https://api.hoody.com/api/v1/wallet/balances/ai` and only use a catalog model when `ai_remaining` is non-zero. Model catalog with Hoody pricing: `GET https://api.hoody.com/api/v1/ai/models` (control plane, bearer token; **paid models only — the free model is not listed there**); usage history at `/api/v1/wallet/ai-fee-history`. The catalog is the source of truth for model ids — read it, don't guess one. In `exec` scripts you don't even need the URL — the runtime pre-injects `ai` / `model` / `generateText` globals already wired to Hoody AI, defaulting to `hoody-ai/hoody-free` (see the `exec` skill).

## Pitfalls (mode-agnostic)

- **Kit URL IS the credential — and a container restart does NOT rotate it.** The `{P}-{C}-{kit}-{n}` prefix is stable for the container's lifetime; only delete + recreate changes it. Don't paste it in public chats.
- **Gating a kit URL without recreating = replace the proxy-permissions policy, with optimistic locking.** GET the current document to read `file_version`, then PUT with `If-Match: file:v<N>` (428 without the header, 412 if stale). SDK: `client.api.proxyPermissionsContainer.replace(containerId, body, { ifMatch: 'file:v' + currentVersion })`; HTTP: `PUT /api/v1/containers/{C}/proxy/permissions`; CLI: `hoody containers proxy permissions replace -c {C} --project {P} --groups … --permissions … --if-match file:v<N>` (the CLI does not auto-fetch the version). Full shape — auth groups + per-program permissions + hooks — is in <https://hoody.com/SKILLS/SKILL-SDK/api.md> § proxyPermissionsContainer.
- **Kit auth is uniform — the URL is the credential.** `sqlite` / `files` / `exec` / `terminal` / `display` / `agent` etc. all accept the bare per-container kit URL as bearer (no extra headers), reached directly. The `agent` (slug `agent`, host `…-agent-{index}.…`) kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers and never returns `401 CLAIM_REQUIRED`: reaching the kit URL is sufficient.
- **`refreshToken` works directly via SDK and CLI** — both auto-inject the header. **Raw HTTP** requires the refresh token in BOTH the body AND the `Authorization: Bearer` header.
- **Login JWTs expire (~1 day; refresh token ~7 days).** A `401` on the control plane is NOT retryable — the token is missing, stale, or expired: refresh (or re-login), then retry the call. Headless / long-running agents should mint a long-lived auth token instead (`authTokens.create` / `POST /api/v1/auth/tokens`) — scopable, IP-restrictable, rotatable. Details: § Auth model in `SKILL-SDK.md` / `SKILL-HTTP.md` / `SKILL-CLI.md`.
- **List endpoints paginate.** Control-plane lists take `?page=N&limit=M` and return a `pagination` object alongside the items; several kit lists use `offset`/`limit` or `cursor` instead (the per-namespace skill names which). A bare list call returns only the FIRST page — don't treat it as exhaustive. SDK: prefer the `listIterator()` variants (e.g. `containers.listIterator()`), which auto-paginate.
- **`server_name` is the routable host**, never `subserver_name`. Build kit URLs from `server_name` (returned in container details).
- **Container ≠ Docker.** It's a full Linux box: systemd, root, ssh, persistent disk, default user `user` with passwordless sudo.
- **Realm-scoped tokens.** Mint with `hoody.api.authTokens.create({ alias:'agent-x', realm_ids:[realmId] })` (SDK — the field is `alias` not `name`) / `POST /api/v1/auth/tokens` (HTTP). Use either **per-call** via the generated `_realm` option (`containers.list({ _realm: realmId })`, etc. — every method accepts it) OR **globally** via `https://{realmId}.api.hoody.com` as the `baseURL`. Resources created under a realm-scoped client / host are auto-tagged with that realm.
- **Retryable errors:** `408 / 425 / 429 / 500 / 502 / 503 / 504`. SDK throws `ApiError` with `isApiError` / `isRetryableApiError` type guards; CLI exits non-zero with the message; HTTP returns the status code.
- **Failed/4xx body shape differs by surface.** The **control plane** (`api.hoody.com` / `client.api.*`) returns `{statusCode, error, message, data?}` consistently. **Per-container kits** use kit-specific shapes — `files` and `sqlite` return `{"error":"<msg>"}`; `terminal` returns `{"status":"error","code":"<errcode>","message":"<msg>"}` (`code` is a string identifier such as `"timeout"`, not numeric). Always branch on the HTTP status code, not on body field presence.

## Ask the docs over HTTP (any agent, no login)

Not sure how to do something? Hoody's docs assistant answers any "how do I…" over one **unauthenticated** call — `POST https://chatbot.hoody.com/mcp`, a stateless JSON-RPC MCP endpoint whose one tool `search_hoody_docs` returns the answer with cited doc URLs:

```bash
curl -s https://chatbot.hoody.com/mcp -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_hoody_docs","arguments":{"question":"How do I expose a port?"}}}'
```

Pipeline failures come back as HTTP-200 with `isError: true` (a result field, not an HTTP error). Wire it as a remote MCP server — `{ "mcp": { "hoody-docs": { "type": "remote", "url": "https://chatbot.hoody.com/mcp" } } }` — or use the plain-chat SSE fallback `POST https://chatbot.hoody.com/api/chat`. Reach for this whenever you're unsure which namespace solves a task.

## Driving Hoody from a URL-only client (no POST) — the `curl` kit GET-bridge

When the caller can **only fetch a URL** — the claude.ai web-fetch UI, a webhook/CRM field that takes a link, an `<img src>`/`<a href>`, an LLM tool with web-search-only access — route the request through the container's **`curl` kit**, which converts a bodyless HTTP call into a single GET-able URL and performs it for you (live-tested; `{P}`/`{C}`/`{N}` as defined in § Kit URLs above, `<TOKEN>` = your bearer token):

```
# Any upstream call as ONE GET. response=transparent → raw body; omit → JSON envelope.
# A read (bearer_token authenticates, e.g. listing the control plane):
https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https%3A%2F%2Fapi.hoody.com%2Fapi%2Fv1%2Fcontainers&method=GET&bearer_token=<TOKEN>&response=transparent
# A full POST with a JSON body + header — the body auto-upgrades the method to POST:
https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&json=%7B%22event%22%3A%22X%22%7D&header=Authorization:%20Bearer%20XYZ
```

Accepted GET params: `url`, `method`, **`data`** (raw body), **`json`** (JSON body — sets `Content-Type`), **`data_base64`** (binary-safe base64, URL-safe ok; precedence over `data`/`json`), repeatable **`header=Name: Value`**, plus `bearer_token`, `response` (`transparent`|`json`), `timeout`, `follow_redirects`, `session_id`, `user_agent`, `referer`, `save`/`save_path`, `insecure`, `compressed`, `job_name`. **Supplying a body auto-upgrades the method GET→POST**, so a full body-bearing POST/PUT/PATCH (with headers) is one GET URL — that's the "any REST call → a single link" promise, made real. (Multipart `form` + binary `--data-binary @file` uploads remain POST-only.) Brand the bridge behind a `proxyAliases.create({ container_id, program: 'curl' })` host (`container_id` is required) to hide `{P}{C}`. Full surface, sessions, and async jobs → the `curl` skill.

## Index — drill-down skills

### Per-mode

| Mode | Basic skill (start here) | FULL skill (basic + 19 namespaces) | Use when |
|---|---|---|---|
| SDK | [SKILL-SDK.md](https://hoody.com/SKILLS/SKILL-SDK.md) | [SKILL-SDK-FULL.md](https://hoody.com/SKILLS/SKILL-SDK-FULL.md) | TS/JS service or browser app |
| HTTP | [SKILL-HTTP.md](https://hoody.com/SKILLS/SKILL-HTTP.md) | [SKILL-HTTP-FULL.md](https://hoody.com/SKILLS/SKILL-HTTP-FULL.md) | Any other language; raw `curl` |
| CLI | [SKILL-CLI.md](https://hoody.com/SKILLS/SKILL-CLI.md) | [SKILL-CLI-FULL.md](https://hoody.com/SKILLS/SKILL-CLI-FULL.md) | Shell scripts, CI, one-off ops |

### Per-namespace deep-dives

19 namespaces × 3 modes = 57 sub-skills. Each row below maps one namespace to its three mode-specific files; pick the column matching your runtime. Auto-generated from the per-namespace notes.

**Still can't route a task?** Fetch the routing index **<https://hoody.com/SKILLS/INDEX.md>** (~7.5k tokens) — per-namespace ops lists plus routing hints for ambiguous cases (`tunnel` vs `api`, `daemon` vs `terminal` vs `exec`, `watch` vs `proxyLogs`, …). And when even the per-namespace skill runs out, the **machine-readable spec is the last rung**: `GET https://api.hoody.com/openapi.json` (full control plane + kits; YAML at `/openapi.yaml`), or a single kit's spec at `https://{P}-{C}-{kit}-1.{N}.containers.hoody.com/api/v1/{kit}/openapi.json`.

| Namespace | Purpose | SDK | HTTP | CLI |
|---|---|---|---|---|
| `agent` | In-container AI coding agent over HTTP | [SDK](https://hoody.com/SKILLS/SKILL-SDK/agent.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/agent.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/agent.md) |
| `api` | Platform control plane: identity, projects, containers, billing, vault | [SDK](https://hoody.com/SKILLS/SKILL-SDK/api.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/api.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/api.md) |
| `browser` | Per-container Chromium/Firefox via Playwright/Patchright | [SDK](https://hoody.com/SKILLS/SKILL-SDK/browser.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/browser.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/browser.md) |
| `code` | VS Code in the browser, per container | [SDK](https://hoody.com/SKILLS/SKILL-SDK/code.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/code.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/code.md) |
| `cron` | managed crontab entries per system user | [SDK](https://hoody.com/SKILLS/SKILL-SDK/cron.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/cron.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/cron.md) |
| `curl` | full HTTP client gateway + REST-as-GET-URL bridge | [SDK](https://hoody.com/SKILLS/SKILL-SDK/curl.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/curl.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/curl.md) |
| `daemon` | supervisord program lifecycle (start any program; logs always retained) | [SDK](https://hoody.com/SKILLS/SKILL-SDK/daemon.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/daemon.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/daemon.md) |
| `display` | programmatic GUI desktops with screenshots, input, and windows | [SDK](https://hoody.com/SKILLS/SKILL-SDK/display.md) | [HTTP](https://hoody.com/SKILLS/SKILL-HTTP/display.md) | [CLI](https://hoody.com/SKILLS/SKILL-CLI/display.md) |
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
