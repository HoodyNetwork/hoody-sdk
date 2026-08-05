> _**compact tier-0 skill (always-loaded by agents)** · ~4,083 tokens · hoody-sdk v1.0.0-beta.11_

# Hoody — lightweight agent skill

> **Onboarding a new user?** If someone asks you to onboard them or get started with Hoody ("onboard me", "help me get going", "set me up on Hoody"), fetch **`https://hoody.com/SKILLS/ONBOARDING.md`** and follow it — a guided, hands-on playbook that takes them from sign-up to their first live service, adapting to whether they're technical. Don't improvise the flow; that skill is the playbook.

## What Hoody is (and isn't)

Hoody is a **cloud-container platform**. Each account owns full Linux boxes (systemd + root, like a VM, NOT Docker sandboxes). Every container has ~18 **kits** — sub-services at predictable URLs (`https://{P}-{C}-{kit}-{n}.{N}.containers.hoody.com`) exposing file I/O, shells, GUI desktops, HTTP services, browsers, notebooks, databases.

Use Hoody when the task involves: running code/processes/UI in the cloud, file storage with history, AI coding agents, GUI automation, HTTP services on demand, or container-scoped tooling. **Hoody-tenant account ops** also route to `api`: auth flows, 2FA/MFA, token management, *reading* usage/spend, projects, realms, proxy permissions, snapshots/backups.

**Abstain when the question is**: pre-sales (pricing, refunds, white-label, discounts), compliance (SOC 2, GDPR, retention policy), support/status (incident pages, slowness complaints, training), or 3rd-party integration (SAML/SSO with Azure AD/Okta/Google, apex-DNS at another registrar, generic JS/programming, web search).

In short: if it's an operation the user could perform with an API call
against their *own* tenant, it's `api`. If it's a question they would
file with sales / support / compliance, abstain.

## Mental model: Hoody is fully remote

Every kit is reachable over plain HTTPS — no local install, no local FS, no agent-machine permissions. When the task involves *creating* something durable (file, script, record, notebook), the destination is a container kit (see "The 19 namespaces" table), not the agent's working directory.

## Three surfaces, one token

**SDK** (`hoody-sdk` for TS/JS) · **HTTP** (`https://api.hoody.com` for any language) · **CLI** (`hoody`, install via `curl -fsSL https://install.hoody.com | sh`). One token works in all three.

Pick by runtime: **writing code/scripts → SDK** (TS/JS; other languages → HTTP); **in a terminal — agent shell tool or human prompt → CLI** (preinstalled in every container; zero-install `npx https://cli.hoody.com`); **no CLI available, or pseudo-scripting one-off calls → raw HTTP** with `curl`. They interoperate — same token, same kit URLs. Full per-mode guides live in the same directory: `https://hoody.com/SKILLS/SKILL-SDK.md` / `SKILL-HTTP.md` / `SKILL-CLI.md` (SKILL-HTTP.md has every call as raw `curl`, login/token mint included).

## Auth — one paragraph

Bearer token → `https://api.hoody.com`. Per-container **kit URLs** are themselves the credential (URL IS bearer for `files`, `sqlite`, `exec`, `terminal`, `display`, `notifications`, `agent`, …) — **no** kit needs `X-Hoody-Container-Claim` / `X-Hoody-Token` headers. The `agent` kit is reached at its `-agent-1` kit URL like any other kit (no auth headers required). Realm tokens: prepend `{realmId}.` to the API host. Login JWTs expire (~1 day) — a control-plane `401` means refresh/re-login, not retry; headless agents should mint a long-lived auth token (`POST /api/v1/auth/tokens`).

**Built-in AI — no key.** From inside any container (AI enabled), `https://ai.hoody.com/api/v1` is an OpenAI-compatible LLM gateway with **no API key**: the key field is a usage-tracking tag, pass anything (e.g. `container-x`). Point any OpenAI-compatible app or library at it (OpenWebUI, `openai` SDK, `curl`). **Model `hoody-ai/hoody-free` is free and needs no wallet credit — use it by default; every model in the catalog (`GET https://api.hoody.com/api/v1/ai/models`) is paid and is refused outright on a new account, whose `ai_limit` starts at `0.00` (check `GET /api/v1/wallet/balances/ai`).** `exec` scripts get pre-wired `ai` globals defaulting to the free model — zero setup, zero cost.

## The 4 things you'll do most

### 1. Sign up + log in

```typescript
// SDK
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
await hoody.api.authentication.signup({ email, password, region: 'eu-west' });
// verify email, then:
const r = await hoody.api.authentication.login({ email, password });
hoody.setToken(r.data.token);
// 2FA branch: r.data.requires_2fa → call hoody.api.tfa.verify({ temp_token, code })
```

```bash
# CLI
hoody auth signup --email you@example.com --password 'Hunter2-Yz!Strong'
hoody login --username <user> --password <pass>   # bare `hoody login` is interactive; `--web` runs the device flow
```

A **free-tier server + default container** are auto-provisioned on signup.
After login, `containers.list()` already returns one container — no separate
"rent server / create container" step needed for the first one.

### 2. List + create containers

```typescript
const cs = await hoody.api.containers.list();
const def = cs.data!.containers.find(c => c.is_default);
// Additional container with dev_kit:
const c = await hoody.api.containers.create(projectId, {
  server_id, name: 'box-1', hoody_kit: true, dev_kit: true,
});
```

### 3. Get a container "box" handle

`withContainer(c)` returns a typed object scoped to that container, with
all kits (`files`, `terminal`, `display`, `exec`, `browser`, …) attached:

```typescript
const box = await hoody.withContainer(def);  // any container row works (here: the default from §2)
await box.files.put('/workspace/hello.txt', Buffer.from('hello'));
await box.terminal.execution.execute({ command: 'uname -a' }, { ephemeral: true });
const shot = await box.display.screenshots.capture({ displayId: 1 });
```

### 4. Expose a port (the auto-public-URL story)

**Anything you bind on a container port is automatically reachable** at
`https://{P}-{C}-http-<port>.{N}.containers.hoody.com`. No alias, no
firewall edit, no proxy registration — just bind and the URL works. This
is the most common "ship a service" path on Hoody; remember it every time
the user asks for an HTTP service of any kind.

```typescript
// Start any HTTP server on :8080 inside the container; it's now public.
await box.terminal.execution.execute(
  { command: 'nohup python3 -m http.server 8080 > /tmp/web.log 2>&1 &' },
  { ephemeral: true },
);
// Reachable from anywhere — no Authorization header:
const url = `https://${c.data.project_id}-${c.data.id}-http-8080.${c.data.server_name}.containers.hoody.com`;
```

**Which namespace should write the service?** (pick by shape):

| Task shape | Use | Reason |
|---|---|---|
| Back-end API / webhook (no UI, internal-only or alias-gated) | **`exec`** | Bun: write a `.js`/`.ts`, the file *is* the webhook URL |
| Pre-built binary / multi-process / long-running service | **`daemon`** | supervisord lifecycle, logs retained, restart-on-crash |
| One-shot script to run *now* and forget | **`terminal`** (ephemeral) | No service lifecycle needed |
| User-facing public site needing friendly host | **`exec`** + **`api.proxyAliases`** | Alias renames `{P}-{C}-http-N` → `my-api.{N}.containers.hoody.com` (alias is a subdomain label) |
| Expose something on **your laptop** to the world via the container | **`tunnel`** | Reverse tunnel; the public URL lives on the container's own `*.containers.hoody.com` host |

To gate the auto-public URL (password / IP / JWT) → `proxyPermissionsContainer`
in `api`. To hide `{P}{C}` behind a friendly host → `proxyAliases` in `api`.

Kits compose — terminal+display+files, exec→daemon, files+watch+sqlite; the pairings are mapped in `INDEX.md`.

## The 19 namespaces (one-liners)

Every container exposes these. For the full per-namespace API + snippet +
gotcha, fetch the routing index at
**`https://hoody.com/SKILLS/INDEX.md`** (~7.5k tokens; one-shot read it
when you need to pick which namespace solves a specific task) or fetch the
per-namespace skill page at `https://hoody.com/SKILLS/SKILL-{SDK|HTTP|CLI}/<ns>.md`
(pick the variant matching your runtime).

| ns | one-liner |
|---|---|
| `api` | Control plane — identity & **auth flows incl. 2FA/MFA**, account & **billing/usage history**, projects, containers (incl. **snapshots**), proxy permissions, realms |
| `files` | Container filesystem over HTTP — read/write/list, Git-like history, per-path ACLs/share URLs; extends to 60+ cloud backends (S3, Drive, Dropbox, SFTP, …) via `?backend=` or FUSE mounts |
| `terminal` | Persistent PTY sessions over HTTP/WS |
| `exec` | Write a `.js`/`.ts` → it auto-becomes a webhook URL |
| `daemon` | Supervised program lifecycle — long-running services with logs retained |
| `display` | Programmatic X11 desktops — screenshots, input, windows |
| `browser` | Headless/headful Chromium & Firefox automation, with a stealth (anti-fingerprint) mode |
| `code` | VS Code in a browser tab (and iframable single-extension surface, e.g. Cline) — also the surface for **compute notebooks (Jupyter `.ipynb`, kernel execution)** |
| `sqlite` | SQL transactions + JSON KV with time-travel history — including lock/busy retry strategy and write-serialisation guidance |
| `curl` | Full HTTP client gateway (TLS, client certs, HTTP/2/3, proxies, retries) + **REST-as-GET-URL bridge** (turn any HTTP call into a GET URL) — also where transport-level errors (timeouts, TLS, connection failures) belong |
| `pipe` | Zero-storage streaming HTTP rendezvous (fan-out, live video, no disk) |
| `proxyLogs` | **"Who hit my service?"** — reverse-proxy HTTP log: filter path/status (server-side), IP/alias (client-side), stats + SSE tail. *Access logs* for `-http-N` ports (`daemon`/`exec` stdout lives elsewhere). |
| `tunnel` | Reverse tunnels for laptop ↔ container (ngrok built-in) |
| `watch` | **"Notify me when files change"** — Linux inotify file-change streams (create/modify/delete events) with replay. Use for *reactive* workflows on `/workspace` paths. |
| `notifications` | **Reach the human operator remotely** — the agent fires a notification and the user gets a real OS toast on phone/desktop/smartwatch via a backgrounded web page (`{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all`); also drives container X11 desktop toasts |
| `notes` | **Knowledge notebooks** — Notion-style collaborative pages (sections, pages, structured databases, attachments). NOT for executing code; for *compute* / Jupyter use `code`. |
| `run` | **"Which tool / which command / which package?"** — searches nixpkgs/pkgx/AppImage/OCI and returns the shell invocation. Use for *any* "I need to install X" / "compress this" / "convert that" question. Result feeds into `terminal` (run now) or `daemon` (run supervised). |
| `cron` | Managed `crontab(1)` per user — **shell** commands only. For recurring HTTP calls use `curl.schedules` instead (no shell needed). |
| `agent` | **Drive the in-container AI agent over HTTP** — sessions/prompt (`createSession` → `promptSync` blocking or the `streamAgentPrompt` helper for streamed → `confirmGate`/`answerQuestion` → `cancelSession`), models (+ providers/auth), skills, memory, todos, workflows, hooks, github, tools, logs. CLI: `hoody agent prompt "<task>"`. |

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
   `SKILL-{MODE}-FULL.md` → per-namespace files →
   `GET https://api.hoody.com/openapi.json` (machine-readable, exhaustive).
2. **Docs assistant** (public, unauthenticated, no login) — one JSON-RPC tool
   `search_hoody_docs` answers any "how do I…" with cited URLs:
   ```bash
   curl -s https://chatbot.hoody.com/mcp -H 'Content-Type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"search_hoody_docs","arguments":{"question":"How do I expose a port?"}}}'
   ```
   Pipeline failures are HTTP-200 with `isError: true` (a result *field*).
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
curl -X POST "https://$P-$C-terminal-1.$N.containers.hoody.com/api/v1/terminal/execute?ephemeral=true" \
  -H "Content-Type: application/json" -d '{"command":"uname -a"}'

# Files — write then read /workspace/hello.txt (GET on the same path = download)
curl -X PUT "https://$P-$C-files-1.$N.containers.hoody.com/api/v1/files/workspace/hello.txt" \
  --data-binary "hello"
curl "https://$P-$C-files-1.$N.containers.hoody.com/api/v1/files/workspace/hello.txt"

# Display — screenshot display 1
curl "https://$P-$C-display-1.$N.containers.hoody.com/api/v1/display/screenshot?displayId=1" -o shot.png
```

**No claim-required kits.** The `agent` kit (like every other kit) accepts the bare per-container kit URL — no `X-Hoody-Container-Claim` / `X-Hoody-Token` headers, no claim minting, no `401 CLAIM_REQUIRED`. Reaching the kit URL is sufficient.

**Auto-public** HTTP services (no auth, no registration) — bind on any port → reachable at `https://{P}-{C}-http-<port>.{N}.containers.hoody.com`.

## Cross-cutting pitfalls

- **Kit URL IS the credential.** Container restart does NOT rotate it — only
  delete+recreate does. To gate access without recreating: replace
  `proxyPermissionsContainer` (GET → PUT with `If-Match: file:v<N>`).
- **Kit auth is uniform — the URL is the credential.** No kit (including
  `agent`) requires `X-Hoody-Container-Claim` / `X-Hoody-Token`; every kit
  accepts the bare per-container URL directly.
- **`server_name` is the routable host**, never `subserver_name`.
- **Container ≠ Docker** — full Linux box: systemd, root, ssh, persistent disk.
- **Retryable HTTP codes**: `408 / 425 / 429 / 500 / 502 / 503 / 504`.
- **Realm-scoped tokens**: every SDK method accepts `_realm: realmId`, or
  use `https://{realmId}.api.hoody.com` as `baseURL` to apply globally.

## URL-only access (can't POST? use the `curl` kit GET-bridge)

If your environment can **only fetch a URL** — the claude.ai web-fetch UI, a webhook/CRM field, an `<img src>`, an LLM tool with web-search-only access — route the call through the container's **`curl` kit**, which performs a bodyless HTTP call for you and returns the result as one GET-able URL:

```
https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&method=GET&bearer_token=<TOKEN>&response=transparent
```

`response=transparent` returns the raw upstream body (omit → JSON envelope `{status_code, headers, body}`); auth via `&bearer_token=`. **The whole request fits in the URL** — add `&data=<raw>` or `&json=<json>` (or `&data_base64=<urlsafe-b64>` for binary/awkward payloads) plus repeatable `&header=Name:%20Value`; **a body auto-upgrades the method to POST**, so *any* REST call (POST/PUT/PATCH with body + headers) becomes one GET URL. (Multipart `form` + binary file uploads stay POST-only.) Full surface → the `curl` skill.

