> _**compact tier-0 skill (always-loaded by agents)** · ~5,286 tokens · hoody-sdk v1.0.0-beta.17_

# Hoody — lightweight agent skill

> **Onboarding a new user?** If someone asks you to onboard them or get started with Hoody ("onboard me", "help me get going", "set me up on Hoody"), fetch **`https://hoody.com/SKILLS/ONBOARDING.md`** and follow it — a guided, hands-on playbook that takes them from sign-up to their first live service, adapting to whether they're technical. Don't improvise the flow; that skill is the playbook. It also shows what every new computer comes with.

## What Hoody is (and isn't)

Hoody is a **cloud-container platform**. Each account owns full Linux boxes (systemd + root, like a VM, NOT Docker sandboxes). A container created with `hoody_kit: true` runs Hoody's **kits** — sub-services at predictable URLs (`https://{P}-{C}-{kit}-{n}.{N}.containers.hoody.com`) exposing file I/O, shells, GUI desktops, HTTP services, browsers, notebooks, databases.

Use Hoody when the task involves: running code/processes/UI in the cloud, file storage with history, AI coding agents, GUI automation, HTTP services on demand, or container-scoped tooling. **Hoody-tenant account ops** also route to `api`: auth flows, 2FA/MFA, token management, *reading* usage/spend, projects, realms, proxy permissions, snapshots/backups.

**Abstain when the question is**: pre-sales (pricing, refunds, white-label, discounts), compliance (SOC 2, GDPR, retention policy), support/status (incident pages, slowness complaints, training), or 3rd-party integration (SAML/SSO with Azure AD/Okta/Google, apex-DNS at another registrar, generic JS/programming, web search).

In short: an operation on the user's *own* tenant is `api`; a question for
sales / support / compliance → abstain.

## Mental model: Hoody is fully remote

Every kit is reachable over plain HTTPS — no local install, no local FS, no agent-machine permissions. When the task involves *creating* something durable (file, script, record, notebook), the destination is a container kit (see "The 21 namespaces" table), not the agent's working directory.

## Three surfaces, one token

**SDK** (`hoody-sdk` for TS/JS) · **HTTP** (`https://api.hoody.com` for any language) · **CLI** (`hoody`, preinstalled in every Hoody container). One token works in all three.

Pick by runtime: **online? use HTTP** (web chat such as ChatGPT or claude.ai, or a throwaway sandbox that is not a Hoody container or the user's computer: no `hoody` CLI there, a login made there does not last, not the user's machine). Otherwise **writing code/scripts → SDK** (TS/JS; other languages → HTTP); **in a terminal where `hoody` is installed (every Hoody container, the user's own computer; check `command -v hoody`) → CLI**; **no CLI available, or pseudo-scripting one-off calls → raw HTTP** with `curl`. They interoperate — same token, same kit URLs. Full per-mode guides live in the same directory: `https://hoody.com/SKILLS/SKILL-SDK.md` / `SKILL-HTTP.md` / `SKILL-CLI.md` (SKILL-HTTP.md has every call as raw `curl`, login/token mint included).

## Auth — one paragraph

Bearer token → `https://api.hoody.com`. Per-container **kit URLs** are themselves the credential (URL IS bearer for `files`, `sqlite`, `exec`, `terminal`, `display`, `notifications`, `agent`, …) — **no** kit needs `X-Hoody-Container-Claim` / `X-Hoody-Token` headers. The `agent` kit is reached at its `-agent-1` kit URL like any other kit (no auth headers required). Realm tokens: prepend `{realmId}.` to the API host. Login JWTs expire (~1 day) — a control-plane `401` means refresh/re-login, not retry. Mint a long-lived auth token (`POST /api/v1/auth/tokens`) only for unattended automation the user asked for.

**From an `exec` script.** Calls to the script's own container's kits need no token under the default allow policy: build the box from `metadata` (no lookup, no account call). Under `"default":"deny"`, or for account (`api.*`) work, put a token in the script's `.env` (`HOODY_TOKEN=…`) and pass it to the client: `new HoodyClient({ baseURL: 'https://api.hoody.com', token: process.env.HOODY_TOKEN! })` for `api.*` (pass `baseURL` explicitly: on a server, older SDK releases have no default and fail every `api.*` call with "fetch() URL is invalid"; later ones default to `HOODY_BASE_URL`, `HOODY_API_URL`, then `https://api.hoody.com`), `withContainer(c, { kitAuth: { type: 'token', value: process.env.KIT_TOKEN! } })` for a kit behind a token rule.

**Built-in AI — no key.** From inside any container (AI enabled), `https://ai.hoody.com/api/v1` is an OpenAI-compatible LLM gateway with **no API key**: the key field is a usage-tracking tag, pass anything (e.g. `container-x`). Point any OpenAI-compatible app or library at it (OpenWebUI, `openai` SDK, `curl`). **Model `hoody-ai/hoody-free` is free and needs no wallet credit — use it by default; every model in the catalog (`GET https://api.hoody.com/api/v1/ai/models`) is paid and is refused outright on a new account, whose `ai_limit` starts at `0.00` (check `GET /api/v1/wallet/balances/ai`).** `exec` scripts get pre-wired `ai` globals defaulting to the free model — zero setup, zero cost.

## The 4 things you'll do most

### 1. Sign in through the user's browser

Never ask for a password or a pasted token. New users sign up at `https://api.hoody.com/auth/signup` in their browser. To sign in, `POST https://api.hoody.com/api/v1/auth/device/code` with body `{}` (no token), give the user `data.verification_uri_complete` and `data.user_code`, then poll `POST /api/v1/auth/device/token` `{"device_code":"…"}` every `data.interval` seconds: HTTP 400 `data.error` `authorization_pending` → keep polling, `slow_down` → 5 s, `access_denied`/`expired_token` → stop; HTTP 200 → `data.token`. Keep the tokens for this session only, never in chat or in files you write. Full recipe: § Login in `SKILL-HTTP.md`. CLI: `hoody login --web --no-browser`. SDK: `hoody.api.auth.device.start({})`, then `.poll({ device_code })` with its `data.device_code`, then `hoody.adoptSession(result)`.

A **free-tier server + default container** are normally auto-provisioned on
signup (while free servers are invite-only, first `POST /api/v1/users/me/redeem-invite`).
After login it may still be provisioning: poll `containers.list()` until it is `running`.
No separate "rent server / create container" step is needed for the first one.

### 2. List + create containers

```typescript
const cs = await hoody.api.containers.list();  // envelope: rows in cs.data.containers
const def = (cs.data.containers ?? []).find(c => c.is_default);
// List rows: a container's name is `name`; a project's name is `alias` (hoody.api.projects.list() → .data.projects)
// Additional container with dev_kit:
const c = await hoody.api.containers.create(projectId, {
  server_id, name: 'box-1', hoody_kit: true, dev_kit: true,
});
```

### 3. Get a container "box" handle

`withContainer(c)` returns a typed object scoped to that container, with
all kits (`files`, `terminal`, `display`, `exec`, `browser`, …) attached:

```typescript
// An id (one lookup, needs the account token), a list/get row, or { id, project_id, server_name } (no lookup).
// In an exec script, its own box: await hoody.withContainer({ id: metadata.containerId, project_id: metadata.projectId, server_name: process.env.HOODY_CONTAINER_PROXY_DOMAIN.split('.')[0] })
if (!def?.id || def.status !== 'running') throw new Error('not ready: poll again');
const box = await hoody.withContainer(def.id);
await box.files.upload('/home/user/hello.txt', Buffer.from('hello'));  // body = bytes
const text = await box.files.readText('/home/user/hello.txt');      // plain string
const { stdout, exitCode } = await box.terminal.run('uname -a');         // one-shot command
const shot = await box.display.screenshots.capture({ displayId: 1 });
```

### 4. Expose a port (the auto-public-URL story)

**Anything you bind on a container port is automatically reachable** at
`https://{P}-{C}-http-<port>.{N}.containers.hoody.com`. Bind to `0.0.0.0:<port>`
(a listener on `127.0.0.1` only is not reachable). No alias, no
firewall edit, no proxy registration — just bind and the URL works. This
is the most common "ship a service" path on Hoody; remember it every time
the user asks for an HTTP service of any kind.

```typescript
// Start any HTTP server on :8080 inside the container; it's now public.
await box.terminal.commands.run(
  { command: 'nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &' },
  { ephemeral: true },
  { serviceIndex: 0 },
);
// Reachable from anywhere — no Authorization header (same container `box` is bound to: `def`):
const url = `https://${def!.project_id}-${def!.id}-http-8080.${def!.server_name}.containers.hoody.com`;
```

**Which namespace should write the service?** (pick by shape):

| Task shape | Use | Reason |
|---|---|---|
| Back-end API / webhook (no UI, internal-only or alias-gated) | **`exec`** | Bun: write a `.js`/`.ts`, the file *is* the webhook URL |
| Pre-built binary / multi-process / long-running service | **`daemon`** | supervisord lifecycle, logs retained, restart-on-crash |
| One-shot script to run *now* and forget | **`terminal`** (ephemeral) | No service lifecycle needed; output comes back in the response. Use `daemon.ephemeralPrograms` instead when the logs must be kept after it exits |
| User-facing public site needing friendly host | **`exec`** + **`api.proxy.aliases`** | An alias with `program: 'exec'` (or `program: 'http'` + `port` for your own server) serves the kit at `my-api.{N}.containers.hoody.com` (alias is a subdomain label) |
| Expose something on **your laptop** to the world via the container | **`tunnel`** | Reverse tunnel; the public URL lives on the container's own `*.containers.hoody.com` host |

To gate the auto-public URL (password / IP / JWT) → `proxy.containerPermissions`
in `api` (group + program access + `default: 'deny'`). To hide `{P}{C}` behind a friendly host → `proxy.aliases` in `api`.

Kits compose — terminal+display+files, exec→daemon, files+watch+sqlite; the pairings are mapped in `INDEX.md`.

## The 21 namespaces (one-liners)

`api` is the control plane; the other 20 are kits, present on a container created with `hoody_kit: true` (check `hoody_kit` on the container before calling a kit). For the full per-namespace API + snippet +
gotcha, fetch the routing index at
**`https://hoody.com/SKILLS/INDEX.md`** (~8k tokens; one-shot read it
when you need to pick which namespace solves a specific task) or fetch the
per-namespace skill page at `https://hoody.com/SKILLS/SKILL-{SDK|HTTP|CLI}/<ns>.md`
(pick the variant matching your runtime).

| ns | one-liner |
|---|---|
| `api` | Control plane — identity & **auth flows incl. 2FA/MFA**, account & **billing/usage history**, projects, containers (incl. **snapshots**), proxy permissions, realms |
| `files` | Container filesystem over HTTP — read/write/list, Git-like history, per-path ACLs; extends to 60+ cloud backends (S3, Drive, Dropbox, SFTP, …) via `?backend=` or FUSE mounts |
| `terminal` | Persistent PTY sessions over HTTP/WS |
| `exec` | Write a `.js`/`.ts` → it auto-becomes a webhook URL. Call a script on a box: `(await box.exec.run('health')).data` (the script path, without a leading `/`); other methods: `run('orders/notify', { method: 'POST', body })` (also `query`, `headers`); a 4xx/5xx answer rejects with `ApiError` |
| `daemon` | Supervised program lifecycle — long-running services with logs retained |
| `display` | Programmatic X11 desktops — screenshots, input, windows |
| `browser` | Headless/headful Chromium & Firefox automation, with a stealth (anti-fingerprint) mode |
| `code` | VS Code in a browser tab (and iframable single-extension surface, e.g. Cline). Its API only manages the editor (extensions, health); it has no notebook or kernel API. Opening `.ipynb` files in the editor needs a Jupyter extension (`extensions.install`) and a kernel in the container; to run a notebook programmatically use `terminal` or `daemon` |
| `sqlite` | SQL transactions + JSON KV with time-travel history. SQL: `sql.query({ db, sql, params })` → `{ rows }` (a write with `RETURNING` too); other writes: `sql.run({ db, sql, params })` → `{ rowsUpdated }`. KV: `kv.set(key, value, { db, create_db_if_missing: true })`; `(await kv.get(key, { db })).data` is the value; a missing key rejects with `ApiError` 404; `kv.delete(key, { db })`. A database that may not exist yet: pass `create_db_if_missing: true` (SQL and KV writes, e.g. `sql.run({ db, sql: 'CREATE TABLE IF NOT EXISTS …', create_db_if_missing: true })`; reading a database that does not exist is `400 DATABASE_NOT_FOUND`; a missing key in an existing database is 404). KV calls take the key first (`get`/`set`/`delete(key, …, { db })`), except `kv.list({ db, prefix })` → `.data.items[].key` (keys and metadata, no values: `get` each) |
| `curl` | Full HTTP client gateway (TLS options, redirects, retries, cookie sessions, async jobs, schedules; client certificates and outbound proxies are refused) + **REST-as-GET-URL bridge** (turn any HTTP call into a GET URL) — also where transport-level errors (timeouts, TLS, connection failures) belong |
| `pipe` | Zero-storage streaming HTTP rendezvous (fan-out, live video, no disk) |
| `proxyLogs` | **"Who hit my service?"** — reverse-proxy HTTP log: filter kind/method/level/source/service/time window (server-side), path/status/IP/alias (client-side), stats + SSE tail. *Access logs* for `-http-N` ports (`daemon`/`exec` stdout lives elsewhere). |
| `tunnel` | Reverse tunnels for laptop ↔ container (ngrok built-in) |
| `watch` | **"Notify me when files change"** — Linux inotify file-change streams (`created`/`modified`/`removed`/`renamed` events) with replay. Use for *reactive* workflows on `/home/user` paths. |
| `notifications` | **Reach the human operator remotely** — the agent fires a notification and the user gets a real OS toast on phone/desktop/smartwatch via a backgrounded web page (`{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all`); also drives container X11 desktop toasts |
| `notes` | **Knowledge notebooks** — Notion-style collaborative pages (sections, pages, structured databases, attachments). NOT for executing code; to run code or notebooks use `terminal` / `daemon`. |
| `run` | **"Which command runs app X?"** — resolves an app or package name (e.g. `ffmpeg`, `firefox`, `owner/repo`) across nixpkgs/pkgx/AppImage/OCI and returns the shell invocation. It matches names, not task descriptions: pick the tool yourself ("compress this" → `zstd`), then ask `run` for it. Result feeds into `terminal` (run now) or `daemon` (run supervised). |
| `egress` | **Outbound HTTP proxy with a switchable exit IP** — point a client at the container's `egress` URL and requests leave through the container; set an *upstream* (`socks5h`/`socks5`/`http`/`https`) and they leave through that instead. `hoody egress local start` makes YOUR machine the exit. |
| `cron` | Managed `crontab(1)` per user — **shell** commands only: `entries.list('user')` → `.data.entries`. For recurring HTTP calls use `curl.schedules` instead (no shell needed). |
| `bot` | **Chat-app control of a container (Telegram)** — register a channel bot, set who it serves, publish its commands, audit/revoke chat users. Its management routes take no account token: gate the URL with proxy permissions. |
| `agent` | **Drive the in-container AI agent over HTTP** — sessions/prompt (`sessions.create` → `sessions.turns.run` blocking or the `streamAgentPrompt` helper for streamed → `gates.approve`/`gates.deny`/`gates.answer` → `sessions.turns.cancel`), models (+ providers/auth), skills, memory, todos, workflows, hooks, github, tools, logs. CLI: `hoody agent prompt "<task>"`. |

**How to pick one**: if your task obviously matches a namespace name, use
it. If not (port exposure, scheduled HTTP, gating, multi-step ops), fetch
`INDEX.md` — it has routing-hints that disambiguate ambiguous cases
(`tunnel` vs `api`, `daemon` vs `terminal` vs `exec`, `watch` vs
`proxyLogs`, …). When even that's not enough, fetch the per-namespace skill
page for the full method list and example calls.

## Discovery routes

When the agent's task is **about Hoody but it doesn't immediately know which
namespace**, four options:

1. **Up the skill ladder** — this file is the smallest rung. The full top-level
   skill `https://hoody.com/SKILLS/SKILL.md` shows every common operation
   (signup → login → containers → files → exec → ports → GUI) in all three
   surfaces side-by-side, plus error shapes and pitfalls; fetch it the moment
   a task goes past routing. Above it: `SKILL-{SDK|HTTP|CLI}.md` →
   `SKILL-{SDK|HTTP|CLI}-FULL.md` → per-namespace files →
   the OpenAPI spec shipped in the package as `hoody-sdk/openapi.json`
   (machine-readable, exhaustive).
2. **Docs assistant** (public, unauthenticated, no login) — one JSON-RPC tool
   `search_hoody_docs` answers any "how do I…" with cited URLs:
   ```bash
   curl -s https://chatbot.hoody.com/mcp -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_hoody_docs","arguments":{"question":"How do I expose a port?"}}}'
   ```
   Pipeline failures are HTTP-200 with `isError: true`.
   MCP clients can wire it as a remote server:
   `{ "mcp": { "hoody-docs": { "type": "remote", "url": "https://chatbot.hoody.com/mcp" } } }`.
3. **Static lookup** — fetch `https://hoody.com/SKILLS/INDEX.md`, read it,
   pick a namespace, fetch its per-namespace page.
4. **Plain chat** (no MCP client, no tool-call shape) —
   `POST https://chatbot.hoody.com/api/chat` with `{"message":"..."}`
   streams the same answer as `search_hoody_docs` over SSE. Use when the
   client can't speak JSON-RPC at all.

## Kit URL recipes (copy-paste)

URL pattern: `https://{P}-{C}-{kit}-{n}.{N}.containers.hoody.com`. Get `P`/`C`/`N` from `containers.get`. These kits accept the bare URL as the credential — no `Authorization` header needed.

```bash
# Terminal — run `uname -a` ephemerally
curl -X POST "https://$P-$C-terminal-0.$N.containers.hoody.com/api/v1/terminal/execute?ephemeral=true" \
  -H "Content-Type: application/json" -d '{"command":"uname -a"}'

# Files — write then read /home/user/hello.txt (GET on the same path = download)
curl -X PUT "https://$P-$C-files-1.$N.containers.hoody.com/api/v1/files/home/user/hello.txt" \
  --data-binary "hello"
curl "https://$P-$C-files-1.$N.containers.hoody.com/api/v1/files/home/user/hello.txt"

# Display — screenshot display 1
curl "https://$P-$C-display-1.$N.containers.hoody.com/api/v1/display/screenshot?displayId=1" -o shot.png
```

**No claim-required kits.** Every kit, `agent` included, accepts the bare kit URL: no `X-Hoody-Container-Claim` / `X-Hoody-Token` headers, no claim minting, no `401 CLAIM_REQUIRED`.

**Auto-public** HTTP services (no auth, no registration) — bind on any port → reachable at `https://{P}-{C}-http-<port>.{N}.containers.hoody.com`.

## Cross-cutting pitfalls

- **Kit URL IS the credential.** Container restart does NOT rotate it — only
  delete+recreate does. To gate access without recreating: replace
  `proxy.containerPermissions` (GET → PUT with `If-Match: file:v<N>`).
- **Kit auth is uniform — the URL is the credential.** No kit (including
  `agent`) requires `X-Hoody-Container-Claim` / `X-Hoody-Token`; every kit,
  `bot` included, accepts the bare per-container URL directly.
- **SDK results**: a generated call → `{ statusCode, message, data }` (use `.data`; `rawResponse: true`
  skips it); `listAll()` → bare array; `box.terminal.run()`, `files.readText/readJson/readBytes`,
  `sqlite.sql.query/run` → plain values ("Results" in the SDK cheat-sheet).
- **`server_name` is the routable host**, never `subserver_name`.
- **Container ≠ Docker** — full Linux box: systemd, root, ssh, persistent disk.
- **Retryable HTTP codes**: `408 / 425 / 429 / 500 / 502 / 503 / 504`.
- **Realm-scoped tokens**: every control-plane (`api.*`) SDK method accepts
  `_realm: realmId`, or use `https://{realmId}.api.hoody.com` as `baseURL`
  to apply globally. Kit calls are routed by container URL, not realm.

## URL-only access (can't POST? use the `curl` kit GET-bridge)

If your environment can **only fetch a URL** — the claude.ai web-fetch UI, a webhook/CRM field, an `<img src>`, an LLM tool with web-search-only access — route the call through the container's **`curl` kit**, which performs a bodyless HTTP call for you and returns the result as one GET-able URL:

```
https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&bearer_token=<TOKEN>&response=transparent
```

`response=transparent` returns the raw upstream body (omit → JSON envelope `{status_code, headers, body}`); auth via `&bearer_token=`. **The whole request fits in the URL** — add `&data=<raw>` or `&json=<json>` (or `&data_base64=<urlsafe-b64>` for binary/awkward payloads) plus repeatable `&header=Name:%20Value`; **with no `method` param, a body upgrades the method to POST** (an explicit `method` wins), so *any* REST call (POST/PUT/PATCH with body + headers) becomes one GET URL. (Multipart `form` + binary file uploads stay POST-only.) Full surface → the `curl` skill.

