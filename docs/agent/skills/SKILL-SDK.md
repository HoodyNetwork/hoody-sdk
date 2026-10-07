> _**SDK skill (basic)** · ~23,683 tokens · hoody-sdk v1.0.0-beta.16_

# SDK mode — drive Hoody from TypeScript/JavaScript

Typed client, 1000+ methods, 21 namespaces. Node, Bun, browser. Configurable automatic retries, error redaction, async iterators, automatic 401 re-auth, cross-origin auth strip. Tradeoff vs HTTP/CLI: needs JS runtime + `npm install`.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud containers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A container is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...containers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + container plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.containers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit URL is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service, kept warm by the kit; **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST/PUT?** Use `box.curl.run(...)` (or compose the GET-bridge URL via the kit URL helper). The `curl` kit can turn any REST call into a single GET-able link for browser-only callers, restricted webhooks, agents with web-fetch-only access. See `curl` namespace.

**Stuck, or unsure how to do something?** Ask Hoody's public docs assistant — an unauthenticated MCP endpoint at `https://chatbot.hoody.com/mcp` (one tool, `search_hoody_docs`; or the `POST /api/chat` SSE fallback) answers any "how do I…" with cited doc URLs. Use it for discovery when you're not sure which namespace fits.

## Install + import

```
npm install hoody-sdk
```

```typescript
import { HoodyClient } from 'hoody-sdk';
```

Browser UMD (exposes `window.HoodySDK`): `https://cdn.jsdelivr.net/npm/hoody-sdk/dist/hoody-sdk.browser.min.js`.

## Init

Pick one of these three ways to build the client:

```typescript
// Token
import { HoodyClient } from 'hoody-sdk';
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com', token: process.env.HOODY_TOKEN! });
```

```typescript
// Credentials (eager login)
import { HoodyClient } from 'hoody-sdk';
const hoody = await HoodyClient.login('https://api.hoody.com', { username, password });
```

```typescript
// Lazy credentials (login on first call)
import { HoodyClient } from 'hoody-sdk';
const hoody = new HoodyClient({ baseURL, credentials: { username, password } });
```

Retries are on by default. When neither the client nor the call sets `retries`, eligible requests get up to two retries, with a 2-second backoff base and at most 10 seconds of total waiting: a GET, HEAD, OPTIONS, PUT or DELETE on `408/425/429/500/502/503/504` or a lost connection; any other method only when the connection could not be opened (the request never reached a server). Set `retries: 0` to disable retries, or pass `retries` (and optionally `retryDelayMs` / `retryOnStatuses`) to the constructor or per call to set your own budget (250 ms backoff base, no total cap). Connection failures proven never dispatched can be retried for any method. With an explicit retry budget, POST/PATCH can also retry `429` and hoody-files' `409 FILE_PATH_BUSY` refusal (nothing was changed). A streamed body is never replayed; a request marked `responseIsFinal` is replayed only when it never reached a server, and only under an explicit budget.

Recommended `baseURL`: `https://api.hoody.com` (when `baseURL` is omitted outside a browser page, `HoodyClient` uses `HOODY_BASE_URL`, then `HOODY_API_URL`, then `https://api.hoody.com`; a client with `target: 'kit'` gets no default host; in a browser page an omitted base stays relative to the page). Realm-scoped: `https://{realmId}.api.hoody.com`. Token scoping → § Auth model. Kit URLs → § Proxy URLs.

## Namespace structure

- **`hoody.api.*`** — account-level (auth, projects, containers, realms, vault, wallet, etc.). There is no `hoody.api.billing` namespace; billing endpoints live under `wallet`/`servers`.
- **`box.<ns>.*`** — kit services inside a container (terminal, files, browser, display, exec, sqlite, …). `const box = await hoody.withContainer(container)`. On a 401 the client tries one recovery and, if it succeeds, replays the request once: account calls get a new token from `onTokenExpired` or the client's refresh token / `credentials`; kit calls only recover when you supply `onKitAuthExpired`.

Pattern: `client.<ns>.<svc>.<method>`.

## Iterator + pagination

Most paginated endpoints, page-, offset- and cursor-style alike, ship three flavours (`notes.comments.list` has `listAll` / `listIterator` too):

- `list(...)` — one page; pagination shape varies per endpoint. Most container/project list endpoints expose `data.pagination.{total,page,limit,totalPages}`; some kit endpoints expose top-level `meta.page`.
- `listAll(...)` — collect all pages.
- `listIterator(...)` — an async generator for `for await`, fetches on demand, supports early `break`. Its items are typed with the row type of the list response (a `containers.listIterator()` row has `id`, `name`, `status`, …), so no cast is needed. Default for non-trivial sets.

Other paginated methods follow the same `*` / `*All` / `*Iterator` triple (e.g. `containers.listByProject*`, `snapshots.list*`, `projects.listPermissions*`).

## Errors

SDK throws **`ApiError`** on every 4xx/5xx, except where the status is the answer: `files.exists` and `sqlite.kv.exists` resolve `false` on a 404 (a missing or expired key). Type guards: `isApiError`, `isRetryableApiError`. Also `ValidationError` (client-side input) and `VaultCryptoError`. Retryable codes: `408/425/429/500/502/503/504`, plus hoody-files' `409 FILE_PATH_BUSY` (see the retry policy under § Init). Secrets (`Authorization`, `Cookie`, `?token=…`, body `{password,token,apikey}`, URL userinfo) auto-redacted to `[REDACTED]` before `catch`. See § Reference appendix.

## Streaming

- **SSE / live event endpoints** — some generated SSE methods stream: `box.proxyLogs.stream(...)` and `box.exec.logs.stream(...)` return `Promise<AsyncIterable<IStreamEvent>>` (`for await (const ev of await box.exec.logs.stream({ file, follow: true })) { ev.event; ev.raw; }`). So does `box.watch.events.stream(id, { since_id })`. Check each SSE method's return type: one that returns a buffered `Promise<ApiResponse<…>>` never resolves on a live stream. For those, use the URL with `EventSource`/`fetch`+ReadableStream, or poll the corresponding cursor endpoint.
- **WebSocket** — `box.notifications.connect`, `box.terminal.sessions.connect`, `box.curl.jobs.connect` and `box.watch.events.connect` return a wrapper: `await wrapper.connect()` to open, then per-wrapper typed callbacks — terminal exposes `onOutput` (Uint8Array); notifications exposes `onNotification` / `onHeartbeat`; curl exposes `onJobstarted` / `onJobprogress` / `onJobcompleted`; watch exposes `onFileEvent` / `onLag`; lifecycle close on every wrapper is `onDisconnect`. NOT Node-style `.on('message')`. See per-namespace SDK skill.
- **Reverse tunnels** — `box.tunnel.expose` / `pull` / `serve` on a container-scoped client; the package-root `tunnelExpose` / `tunnelPull` / `tunnelServe` take an explicit WebSocket URL.

Runnable snippets in § Core operations cheat-sheet below.

## Index

Recipes: § Core operations cheat-sheet. Per-namespace deep dives: `SKILL-SDK/<ns>.md`.

---

# Proxy URLs — capability-based per-container routing

## What it is

`https://{projectId}-{containerId}-{kit_slug}-{n}.{node}.containers.hoody.com`

- Proxy terminates TLS on `*.containers.hoody.com`, parses the hostname segments (project, container, kit, index) and routes to that kit.
- Hoody API: global `https://api.hoody.com`.
- Aliases (`my-api.{N}.containers.hoody.com`) are shortcuts; canonical URL is authoritative.

## Components

| Segment | Meaning |
|---|---|
| `projectId` | 24-char hex. |
| `containerId` | 24-char hex. Bearer credential. |
| `kit_slug` | Kit id (see Kit slug table); some namespaces differ from their slug (e.g. `notifications` → `n-1`, `proxyLogs` → `logs-1`). |
| `n` | 1-based instance index; single-instance kits use `1`. |
| `node` | Bare server hostname (use the `server_name` field from container responses). |
| Suffix | `.containers.hoody.com` |

## Every kit URL is iframable — compose a UI out of kits

Each kit URL serves a regular HTML/JS page (or HTTP/WS API) — drop it into an `<iframe>` and you have a working surface in your own app:

```html
<iframe src="https://{P}-{C}-code-1.{N}.containers.hoody.com"      ></iframe>  <!-- full VS Code -->
<iframe src="https://{P}-{C}-files-1.{N}.containers.hoody.com"     ></iframe>  <!-- file browser -->
<iframe src="https://{P}-{C}-terminal-1.{N}.containers.hoody.com"  ></iframe>  <!-- HTML5 terminal -->
<iframe src="https://{P}-{C}-display-1.{N}.containers.hoody.com"   ></iframe>  <!-- X11 desktop -->
<iframe src="https://{P}-{C}-desktop-1.{N}.containers.hoody.com"   ></iframe>  <!-- XFCE/MATE in a tab -->
<iframe src="https://{P}-{C}-notes-1.{N}.containers.hoody.com"     ></iframe>  <!-- notebooks -->
<iframe src="https://{P}-{C}-agent-1.{N}.containers.hoody.com"></iframe>  <!-- Hoody Agent GUI -->
```

You can compose a **full HTML "operating system" out of Hoody kit iframes** — no native code, no installer, just URLs. Hoody itself does this: `os.hoody.com` is essentially a kit-iframe shell.

### Collaborative embeds — work from inside the chat

Most modern collaboration tools accept iframes (or unfurl URLs into rich previews that render iframes), so a Hoody kit URL drops straight into:

| Platform | Embed surface | Outcome |
|---|---|---|
| **Slack** | Canvas embed, custom unfurls, Slack apps | Drop a `terminal-1` URL into a channel canvas → live shell that everyone in the channel can see + drive. Pair with a Cline `?extension=…` `code-1` URL for "agent-in-the-channel" support. |
| **Notion** | `/embed` block (paste URL → Embed) | Wiki page that contains the live editor / agent / file browser as part of the doc. |
| **ClickUp** | Embed view in any list / dashboard | Project board with the relevant repo's `files-1` and `code-1` panes alongside tickets. |
| **Matrix / Element** | `m.html` event, custom widgets | Same as Slack — live terminal / agent in a room. |
| **Microsoft Teams / Zoom** | Apps that accept URL iframes | Shared workbench during calls. |
| **Discord** | Activity URLs, link previews | Drop the URL; viewers click into the live surface. |
| **Confluence / Jira** | "Smart Link" / iframe macro | Runbook page with the live tool baked in. |
| **Plain HTML** | `<iframe src="…">` in any page | Internal portal, status page, customer demo. |

The point: **don't make people leave their chat.** When someone hits a bug, drop the `terminal-N` URL with a Cline / Continue extension already focused into the thread — others can read, type, kibitz, take over, all without context-switching to a new tab. The container's filesystem is shared across every embed (same kit URL = same shell), so collaborators land on the *same* state.

> ⚠ **Sharing a terminal / shell embed = giving root.** A `terminal`, `code`, `desktop`, `display`, or `agent` URL in a Slack channel, Notion page, or any other chat is effectively a root-shell credential. Anyone who can render the iframe can:
> - read every file the container can read (env vars, tokens, vault entries, source code, customer data),
> - run any command (curl exfiltration, `rm -rf`, package installs, network scans, fork-bombs),
> - leverage the container's other kit URLs and SDK accessors,
> - leave persistent footprints (cron jobs, daemons, snapshots, alias creations).
>
> An `<alias>.{N}.containers.hoody.com` does NOT add a security layer — it only hides `containerId`. **Share these URLs only with people you'd trust with `ssh root@…` access.** For broader audiences:
> - Gate the container (§ How to gate): an auth group, that group's access to the program, and `default: 'deny'` — so a recipient still has to authenticate.
> - Use a **dedicated demo container with no secrets** — wallet credentials, vault data, source code only what they need to see.
> - Set an **`expires_at`** on the alias for auto-expiry.
> - Watch **`proxyLogs`** for unexpected callers; if a URL leaks, disable its alias instantly with `proxy.aliases.disable(aliasId)`.
> - For untrusted reviewers (customers, support tickets, public demos): do not hand out a `display` kit URL as a "read-only" view — its readonly setting is client-side only, and anyone holding the URL can still call the display's input API (clicks, typing). Build a constrained `exec` script that exposes only the operation they need, such as serving a captured screenshot.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP via `proxy.containerPermissions.*` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `proxy.aliases.create({ container_id, program: '<kit>' })` to ship a brandable hostname (`https://repo-acme.{N}.containers.hoody.com`) into the iframe instead of leaking the `{containerId}`.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace.
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- Several API kits also serve a browser UI on their kit URL: `cron` (crontab manager) and `watch` at `/`, the `sqlite` studio at `/`, and the `pipe` send / receive / share pages — check a kit's own UI (and its embed views) before building a custom dashboard. `curl` renders no UI, and `http-<port>` shows whatever your app serves.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## Source IP Guard — every call goes through the kit URL

Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. A request that does not come through the program's URL gets 403, from inside the same container too. Call kits through the edge proxy on HTTPS, so the proxy's permissions, logging and hooks apply to every call.

Why uniform proxy routing:

- **Security uniformity** — requests from inside containers go through the same `proxy.containerPermissions.*` checks and `proxyLogs.*` capture as external requests, whether they came from across the internet or from a script in the next process. `proxy.hooks.*` MITM rules apply the same way, but only to services that accept hooks: `logs`, `egress` and `cdp` reject hook operations with `404`. There is no "trusted internal" loophole that leaks to attackers via SSRF.
- **One mental model** — same URL works from your laptop, from another container, from inside the container itself. You write the same code; the proxy is transparent.
- **Cost is negligible** — the proxy hop adds microseconds, not a network round-trip.

Practical consequence: from inside a container, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.containers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this. There is no other way in: the Source IP Guard refuses it.

### Container ↔ container — anyone reaches anyone (with permissions)

Because routing is uniform, **a process in container X can call any kit on container Y just by hitting Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in container X reads / writes files in container Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.containers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three containers, three kit URLs, one transparent network.
- A monitoring container scrapes `/metrics` from every container in a project's fleet by listing them via `containers.listByProject` and hitting each one's kit URL.

Cross-container access still goes through the gate stack — Y's `proxy.containerPermissions.*` rules apply to whoever's calling, no matter where they're calling from. So:

- **By default** (no gates set), Y's URL is a capability — anyone with the URL has access. Within your account that's usually fine; for production / shared / multi-tenant fleets you SHOULD gate.
- **With a gate set** (§ How to gate — an auth group alone is not a gate), X must satisfy it. A Token gate (`setTokenGroup`) is a static shared secret: you choose where it is read (one header, cookie or query parameter) and the exact value it must equal, and X sends that value on every call to Y. It does not check Hoody auth tokens or realms — an `hdy_…` token passes only if it is literally the configured value. A JWT gate (`setJwtGroup`) verifies a signed JWT instead.

This is why edge routing matters: if same-container calls were a backdoor, an attacker who pwned X could quietly read Y's data with no gate checked. Routing everything through the proxy means **every** container-to-container call sees the **same** auth + audit machinery as every external call.

## Capability-token semantics — open by default, permission for production

**The URL itself is the credential.** A well-formed kit URL routes without any `Authorization` header — anyone who knows the full URL has the same access as the owner, on every kit including `bot`'s management routes. `containerId` is the secret. Container-internal IDs (session, tab, notebook, terminal_id, displayId) follow the same "knowing the ID = having access" model.

**This is intentional for development**: spawn a container, share the URL, collaborator reaches it instantly. **It is NOT acceptable for production exposure** — leaked URL = leaked container. Treat any production deployment as "must have a gate".

### When to gate

- Anything reachable from a public network or shared with a third party.
- Anything that handles secrets, customer data, payments, or user PII.
- Anything where a leaked URL would be hard to rotate (long-lived background jobs, public dashboards, customer-facing demos).

### How to gate

Configure under `proxy.containerPermissions` (per-container) or `proxy.projectPermissions` (whole project — applies to every container in the project) on the control plane. Groups are alternatives, not layers: each named group (password, token, JWT or IP — or an OR-array of those) is one way in, a request that satisfies a group gets that group's per-program `permissions`, and a request that matches no group falls to the document's `default` (`allow` or `deny`).

A group on its own restricts nothing. It grants only the programs you give it access to, and a document the API creates for you starts at `default: 'allow'`, so everyone who matches no group still gets in. A working gate takes three calls: define the group (`set{Password,Token,Jwt,Ip}Group`), give it access to each program it should reach (`setGroupPermission` with `{ program, access: true }`), and set `setDefault` to `{ default: 'deny' }`. Every one of these writes is versioned: send the document's current `file_version` as `If-Match: file:v<N>` (`file:v0` while the document has none), which the SDK takes as the required options argument `{ ifMatch: 'file:v' + n }`. A missing header is refused with `428` and a stale one with `412`. Each call returns the updated document, so take the next call's version from it. The one partial exception: a password group with an access rule for a program answers a caller without credentials with a `401` challenge for that program even under `default: 'allow'`.

| Gate | Accessor | Caller behavior |
|---|---|---|
| Password | `setPasswordGroup` | Browser / `curl -u user:pass` — HTTP Basic. |
| Token | `setTokenGroup` | The header, cookie or query parameter you configured must carry exactly the value you configured (a static shared secret). |
| JWT | `setJwtGroup` | Verifies issuer / audience signed JWT. |
| IP | `setIpGroup` | Source IP must match a CIDR. |

`disable` sets `enable_proxy` to `false` (`enable` sets it back to `true`), which is a kill-switch for the whole proxy, not a gate toggle: while it is `false` every request that reaches the permission layer is refused with `403` before groups or `default` are evaluated, and the configured groups are kept. It never opens access. (A project-level `false` does not apply to a container whose own document sets `enable_proxy: true` — use the container-level call to cut one container reliably.)

Defense in depth: gate the kit URL AND scope any auth-token bearer (realms, IP allowlist) AND keep a short TTL on JWTs. A leaked auth-token is recoverable; a leaked-and-public kit URL is not.

## Kit slug table — every namespace's public URL

Throughout: `{P}` = `projectId` (24-hex), `{C}` = `containerId` (24-hex), `{N}` = `server_name` (e.g. `node-example-1`). All URLs route through `*.containers.hoody.com`.

| Namespace | Kit slug | Public URL (single-instance form) |
|---|---|---|
| `agent` | `agent-{index}` | `https://{P}-{C}-agent-1.{N}.containers.hoody.com` — the in-container AI agent HTTP gateway: sessions/prompt, models, skills, memory, todos, workflows, hooks, github, tools, logs |
| `api` | — (control plane) | `https://api.hoody.com` (global, not per-container) |
| `run` | `run-1` | `https://{P}-{C}-run-1.{N}.containers.hoody.com` |
| `bot` | `bot-1` | `https://{P}-{C}-bot-1.{N}.containers.hoody.com` — chat-app (Telegram) control of the container; its management routes take no account token, so gate the URL with proxy permissions |
| `browser` | `browser-1` | `https://{P}-{C}-browser-1.{N}.containers.hoody.com` |
| `code` | `code-1` (multi-instance) | `https://{P}-{C}-code-1.{N}.containers.hoody.com` (also `-code-2`, `-code-3`, …) |
| `cron` | `cron-1` | `https://{P}-{C}-cron-1.{N}.containers.hoody.com` |
| `curl` | `curl-1` | `https://{P}-{C}-curl-1.{N}.containers.hoody.com` |
| `daemon` | `daemon-1` | `https://{P}-{C}-daemon-1.{N}.containers.hoody.com` |
| `display` | `display-<N>` (multi) | `https://{P}-{C}-display-1.{N}.containers.hoody.com` (`display-1`, `-2`, …) |
| (no SDK namespace — registered program) | `desktop-<N>` | `https://{P}-{C}-desktop-1.{N}.containers.hoody.com?desktop_env=xfce` — opens a full XFCE/MATE desktop in the browser (see § Desktop alias) |
| `egress` | `egress-1` | `https://{P}-{C}-egress-1.{N}.containers.hoody.com` — outbound HTTP proxy (CONNECT + absolute-URI forwarding); every `egress-<n>` index reaches the same single process, but proxy permissions evaluate per index |
| `exec` | `exec-1`; script by PATH | `https://{P}-{C}-exec-1.{N}.containers.hoody.com/{script}` (a script under `scripts/{sub}/` is ALSO reachable at the `{sub}.…-exec-1.…` subdomain) |
| `files` | `files-1` | `https://{P}-{C}-files-1.{N}.containers.hoody.com` |
| `notes` | `notes-1` | `https://{P}-{C}-notes-1.{N}.containers.hoody.com` |
| `notifications` | `n-1` (paired w/ `display-N`) | `https://{P}-{C}-n-1.{N}.containers.hoody.com` |
| `pipe` | `pipe-1` | `https://{P}-{C}-pipe-1.{N}.containers.hoody.com` |
| `proxyLogs` | `logs-1` | `https://{P}-{C}-logs-1.{N}.containers.hoody.com` |
| `sqlite` | `sqlite-1` | `https://{P}-{C}-sqlite-1.{N}.containers.hoody.com` |
| `terminal` | `terminal-<id>` (per session) | `https://{P}-{C}-terminal-1.{N}.containers.hoody.com` (`terminal-3` for session 3, etc.) |
| `tunnel` | `tunnel-1` | `https://{P}-{C}-tunnel-1.{N}.containers.hoody.com` |
| `watch` | `watch-1` | `https://{P}-{C}-watch-1.{N}.containers.hoody.com` |
| (any port) | `http-<port>` / `https-<port>` | `https://{P}-{C}-http-8080.{N}.containers.hoody.com` (see § User-hosted services) |
| (none — direct shell) | `ssh` | `ssh root@{P}-{C}-ssh.{N}.containers.hoody.com` (see § SSH access) — port `22`, public-key only |

### Concrete example

For project `65f1...c8a`, container `65f2...41e`, server `node-example-1`:

| Surface | URL |
|---|---|
| Files API | `https://65f1...c8a-65f2...41e-files-1.node-example-1.containers.hoody.com/api/v1/files/home/user/main.py` |
| Exec script `render.ts` (flat) | `https://65f1...c8a-65f2...41e-exec-1.node-example-1.containers.hoody.com/render` (path; a `scripts/render/` dir would also serve at `render.…-exec-1.…`) |
| SQLite kit | `https://65f1...c8a-65f2...41e-sqlite-1.node-example-1.containers.hoody.com/api/v1/sqlite/db/...` |
| Display 1 (X11) | `https://65f1...c8a-65f2...41e-display-1.node-example-1.containers.hoody.com/` |
| **Full XFCE desktop** | `https://65f1...c8a-65f2...41e-desktop-1.node-example-1.containers.hoody.com/` |
| Same, but MATE | `https://65f1...c8a-65f2...41e-desktop-1.node-example-1.containers.hoody.com/?desktop_env=mate` |
| Terminal session 3 | `https://65f1...c8a-65f2...41e-terminal-3.node-example-1.containers.hoody.com/api/v1/terminal/...` |
| Proxy logs | `https://65f1...c8a-65f2...41e-logs-1.node-example-1.containers.hoody.com/` |
| Watch (file-events) | `https://65f1...c8a-65f2...41e-watch-1.node-example-1.containers.hoody.com/watchers/...` |
| Coding agent HTTP API | `https://65f1...c8a-65f2...41e-agent-1.node-example-1.containers.hoody.com/api/v1/agent/...` |
| Hoody Agent GUI (for humans) | `https://65f1...c8a-65f2...41e-agent-1.node-example-1.containers.hoody.com/` |
| User HTTP server on `:8080` | `https://65f1...c8a-65f2...41e-http-8080.node-example-1.containers.hoody.com/` |

### Conventions

- `code` and `display` are multi-instance — append a numeric instance: `-code-1`, `-code-2`, `-display-1`, `-display-7`.
- `terminal` packs the terminal **session** id into the slug (`terminal-3` = session 3). The proxy sets `?terminal_id=` from that hostname index and overwrites any value you send, so the hostname is authoritative: to act on session N (`/execute`, `/paste`, `/press`, `/raw`), call the `terminal-N` host. `terminal-0` is the "no session" host — use it with `?ephemeral=true` so the kit allocates a fresh session instead of reusing session 1.
- `display`/`terminal` pairing depends on how the session is created. A session started through a `terminal-N` URL gets `DISPLAY=:N` automatically (the proxy injects `display=N` with `terminal_id=N`; an ephemeral session drops it). A session created with a JSON `/create` body gets `DISPLAY=:N` only when the body sends `display: ':N'`. Use the same number for both by convention — `terminal_id` N, `display` `:N`, then the `display-N` kit URL shows what that session draws.
- `exec` serves each script at a **path** on the exec host: a file `hello.js` is reachable at `https://{P}-{C}-exec-1.{N}.containers.hoody.com/hello` (the `.js`/`.ts` extension is stripped; the path keeps the file name's case, so `MyTool.ts` is served at `/MyTool`, not `/mytool`). A script placed under a subdirectory `scripts/{sub}/` is ALSO reachable at the `{sub}.` **subdomain** (`{sub}.{P}-{C}-exec-1.{N}…`) — the subdomain maps to that directory, NOT to a flat top-level filename.
- `notifications` ↔ `display-{n}`: the notification kit pairs with display N at slug `n-N`.
- `proxy.aliases.create` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. Full valid program set is enumerated in the §Proxy aliases table below — note `logs` for the proxy-logs kit (not `proxy` or `proxyLogs`) and `run` (not `app`).

## Desktop alias — `desktop-<N>` (full XFCE / MATE desktop in a browser tab)

Open `https://{P}-{C}-desktop-1.{N}.containers.hoody.com` and you land on a complete Linux desktop session — no SDK call, no extra kit, no installation step. There is **no generated REST operation for this surface** (it has no namespace), but SDK helpers (`getKitUrl('desktop', container, N)`) and CLI helpers can compose or open the URL — the URL itself is the whole interface.

### How it works

`desktop-<N>` is a thin alias on top of `terminal` + `display`:

1. The proxy rewrites the request to the `terminal` kit with forced query args `desktop=true`, `redirect=display`, `terminal_id=<offset>+N`, `display=<offset>+N`.
2. The terminal kit spawns the chosen desktop environment under that virtual display.
3. As soon as the display is up, the browser is `302`'d to the matching `display-<offset>+N` kit URL.

The terminal index is offset by `1600` so desktop sessions can't collide with regular `terminal-1`/`terminal-2`/… slots. `desktop-1` uses `terminal_id=1601` and lands on `display-1601`; `desktop-7` uses `terminal_id=1607` and `display-1607`. You usually don't see those numbers — the redirect is invisible.

### Choose the desktop environment

Append `?desktop_env=`:

| Value | DE |
|---|---|
| `xfce` (default) | XFCE 4 |
| `mate` | MATE |

```
https://{P}-{C}-desktop-1.{N}.containers.hoody.com?desktop_env=mate
```

Other DEs (GNOME, KDE) are not auto-spawned by the alias — install + run them yourself via `daemon` and reach via the matching `display-<N>` URL directly.

### Forced vs caller-overridable

The proxy locks `desktop=true`, `redirect=display`, `terminal_id`, and `display` to the offset values — passing them in the query string is ignored (defense-in-depth so a caller can't escape the offset isolation). **Only `desktop_env` is honored from the URL.**

### When to use the desktop alias vs `display-<N>` directly

- **Desktop alias** — quick "give me a Linux desktop in a browser tab" surface; no setup needed.
- **`display-<N>` directly** — when a session is already running there (e.g. you launched apps from `terminal-N` so the GUI is on `display-N`), or when you want fine-grained control over the X session.

### Building kit URLs

The SDK ships builder methods so you don't compose URLs by hand: `client.getKitUrl(slug, container, idx?)` for one kit, `client.getKitUrls(container)` for the full `{terminal, browser, code, …, desktop, exec, files, …}` record. For desktop with a DE override, use the dedicated helper `client.getDesktopUrl(container, { desktopEnv: 'mate', serviceIndex: 1 })` (default DE is xfce; `listDesktopEnvironments()` lists known values). Or compose by hand with `client.getKitUrl('desktop', container, 1)` and append `?desktop_env=mate`.

To compose a kit URL by hand, read `project_id`, `id` and `server_name` from `containers.get(...)` and fill in the patterns above.

## SSH access — shell through the host-side SSH proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `sftp`, `git push` over SSH), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{containerId}-ssh.{node}.containers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). The connection ends at a host-side SSH proxy, not at a server inside the container: the proxy looks up your public key, finds the one container that key is registered to, and runs the shell, SFTP or SCP session in that container through the host. No `sshd` runs in the container. Port forwarding (`ssh -L`, `ssh -R`) is disabled.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `containers.create` / `containers.update` / `containers.copy`. The key is registered with the host-side SSH proxy, not written to an `authorized_keys` file in the container. Password auth is disabled.

**The public key MUST be unique across containers — one container per key**, because the key alone selects the container. Reusing a key that another container already holds returns `409` with a message saying the key is already in use. Generate a fresh keypair per container; you can rotate via `containers.update` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; the same shell the kit's `terminal` namespace would give you. Anything inside the container is yours.

### IP filtering

The SSH endpoint is reachable from any IP; the registered key is the access control. SSH sessions reach the container through the host-side proxy and the host, not through the container's network interface, so container firewall rules (`firewall.*` ingress rules) and in-container `iptables` / `nftables` rules do not filter them. To cut off a key, replace it with `containers.update` (new `ssh_public_key`). For kit URLs, restrict source IPs with `proxy.containerPermissions.setIpGroup`.

### When SSH vs kit URLs

| Need | Use |
|---|---|
| Anywhere-reachable HTTP, logged, gated | Kit URL (`terminal`, `files`, `exec`, `display`, `http-<port>` …) |
| `git clone <ssh url>` / `rsync` / `scp` | SSH |
| Reach an internal-only service from your laptop | Not SSH (port forwarding is disabled): use its `http-<port>` URL, gated with `proxy.containerPermissions` |
| Heavily-firewalled box that must not expose any web surface | SSH only; close all kit URLs via gates |
| Drive a TUI from REST | `terminal` namespace (proxy-logged) |
| Drive an X11 GUI from REST | `display` kit + `terminal` for spawn (proxy-logged) |
| Audit-trail of every command run | Kit URL (`terminal`) — proxy logs each request |

## User-hosted services — `http-<port>` / `https-<port>`

**Anything you bind on a container port is automatically reachable from the public URL.** Bind your HTTP(S) service to `0.0.0.0:<port>` or the container's network IP to reach it at the public URL. A listener bound only to `127.0.0.1` is not reachable through this proxy. No alias, no firewall edit, no proxy registration. Use one of two slugs:

| Slug form | Inner protocol | Edge URL |
|---|---|---|
| `http-<port>` | proxy speaks **HTTP** to `<container-network-ip>:<port>` inside the container | `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` |
| `https-<port>` | proxy speaks **HTTPS** to `<container-network-ip>:<port>` (target must terminate TLS) | `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` |

Edge is always `https://` regardless — TLS terminates at the proxy. The `http-` / `https-` slug only describes what the proxy talks on the inside.

Examples:

```
# Plain HTTP server on :8080 inside the container
https://65f1...c8a-65f2...41e-http-8080.node-example-1.containers.hoody.com

# Service that already terminates TLS on :8443
https://65f1...c8a-65f2...41e-https-8443.node-example-1.containers.hoody.com

# WebSockets just work (use `wss://`)
wss://65f1...c8a-65f2...41e-http-3000.node-example-1.containers.hoody.com/ws
```

Defaults when port omitted: `http` ⇒ port 80, `https` ⇒ port 443. Port range `1..65535`. Capability-token rules still apply — gate the URL via `proxy.containerPermissions.*` if you don't want it open.

## Friendly aliases — `<alias>.{N}.containers.hoody.com`

A **proxy alias** is a custom hostname that points at one specific program inside a container, without revealing the `projectId` / `containerId`. Same capability-token semantics — alias URL on its own is the credential — but the URL is shareable, brandable, and hides the container plumbing.

### Why use them

- **Hide `containerId`**: shipping `https://my-api.{N}.containers.hoody.com` is fine; shipping `https://65f1...c8a-65f2...41e-http-8080.{node}.containers.hoody.com` leaks the container identifier (which IS the credential of last resort).
- **Brandable**: short, memorable, copy-pasteable.
- **Stable**: alias survives container rebuilds — repoint at a new container, public URL stays the same.
- **Same gate stack**: layer Password / Token / JWT / IP via `proxy.containerPermissions` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`proxy.aliases.create({ container_id, program, alias?, index?, target_path?, allow_path_override?, expires_at?, enabled? })`

| Field | Notes |
|---|---|
| `container_id` | 24-char hex id of the target container — required. |
| `alias` | 3-61 chars, lowercase alphanumeric **plus hyphens** (`a-z0-9-`, no leading/trailing hyphen). Becomes `<alias>.{N}.containers.hoody.com`. Two independent uniqueness rules, either of which answers `409 ALIAS_IN_USE`: the name must be free on the container's physical server (across every tenant there), AND your own account may hold a given name only once across all servers. |
| `program` | Which kit/protocol to route to. Valid names, protocols first and then programs, with accepted aliases in parentheses: `http`, `https`, `ssh`, `terminal` (`tty`, `ttyd`, `t`), `display` (`d`), `desktop`, `cron`, `watch` (`w`), `notifications` (`notification`, `n`), `files` (`f`), `daemon`, `code`, `agent`, `exec` (`e`), `browser` (`b`), `cdp`, `curl`, `run`, `sqlite`, `logs` (`log`, `l`), `egress`, `pipe`, `notes` (`note`), `tunnel`, `bot`. Use only these names; `cli`, `proxy` and `proxyLogs`, for example, are refused with `400 Unknown program name`. The proxy-logs kit is `logs` (NOT `proxy` or `proxyLogs`), and `run` is NOT `app`. **`'web'` is rejected — for `hoody_kit` runners use `program: 'exec'`**. |
| `index` | Optional; defaults to `1`. Set explicitly for multi-instance programs: port for `http`/`https`, `terminal_id` for `terminal`, display number for `display`. |
| `target_path` | Optional landing path served when the alias is opened with no path (a root request), e.g. `/api/v1`; a query written in it is sent too. It is never used as a prefix: with `allow_path_override: true` a request that carries its own path is forwarded as sent, resolved from the container root, and with `false` it is the only path the alias serves (at the root and at its own path). |
| `allow_path_override` | Defaults to `true`: a root request lands on `target_path` (its query plus the visitor's parameters), and a request that carries its own path is forwarded as sent. With `false` the alias serves only `target_path`: the root `/` and the `target_path` path itself (e.g. `/run-report` when `target_path` is `/run-report`) are both served as `target_path`, and any other path — sub-paths and assets included — is refused with `404 ALIAS_PATH_PINNED`. A query key written in `target_path` wins over the visitor's value for the same key, and the instance selectors the alias's `index` sets (such as `id`, `terminal_id`, `display`) stay forced; the visitor's method, request body, other query keys, WebSocket upgrade and `Range` header pass through. Either way anyone with the link can open the alias, so restrict who may with proxy permissions. |
| `expires_at` | Auto-disable timestamp — an ISO 8601 date-time string, or `null` for never. Convert an epoch value to ISO 8601 before sending. Must be in the future. |
| `enabled` | Toggle without deleting (keeps alias slot reserved). |

### Practical examples

Each row below shows the create-call fields and the resulting public URL. Issue the call via your mode's surface (see Reference table for the exact command/endpoint).

| Goal | `program` | `index` | `target_path` | `allow_path_override` | Public URL |
|---|---|---|---|---|---|
| HTTP API on container port 8080 | `http` | `8080` | — | `true` | `https://myapi.{N}.containers.hoody.com/v1/users` |
| Land on a hoody-exec script (`/render`) at the bare hostname | `exec` | — | `/render` | — | `https://tileapi.{N}.containers.hoody.com` |
| Pipe rendezvous as drop-zone hostname | `pipe` | — | `/jobs/pending` | — | `https://upload.{N}.containers.hoody.com` |
| App exposed through a reverse tunnel on container port 3000, with auto-expiry | `http` | `3000` | — | `true` | `https://demo.{N}.containers.hoody.com` (`expires_at` a future ISO 8601 date-time) |
| GUI display 1 wrapped in a brandable host | `display` | `1` | — | `true` | `https://gui.{N}.containers.hoody.com` |
| Read-only HTTPS upstream (target self-terminates TLS) | `https` | `8443` | — | `true` | `https://secureapi.{N}.containers.hoody.com` |

With the default `allow_path_override: true`, `target_path` only decides what the bare hostname serves: every other path on that program stays reachable through the alias. To expose a single operation, set `allow_path_override: false` (the alias then serves only `target_path`, at the root and at its own path; write into `target_path` every query key the visitor must not change), and gate the container (below) to decide who may call it.

### Gating an alias

Aliases inherit the container's gate stack — gate the underlying container (§ How to gate: group, program access, `default: 'deny'`) and the alias URL is gated too. There is no per-alias-only gate; gating is at the container/project level.

### Operational notes

- `proxy.aliases.disable(aliasId)` disables the alias instantly without releasing the slot — useful to revoke a leaked URL while you investigate.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409 ALIAS_IN_USE` under either rule: the name is already taken on that physical server (by any tenant), or your account already holds the same name on any server.
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface. Show it in UI as `subserver_name ?? server_name`, but never substitute it into a kit URL.
- **After `containers.create`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `containerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full container access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — `client.api.auth.login`. Access token lives `1d`, refresh token `7d`, by default; a deployment may shorten either, so treat both as values to read from the response rather than constants. The interactive, short-lived credential.
2. **Auth token** — `auth.tokens.create`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, rotatable. Long-lived headless credential.
3. **Kit URL** — `https://{projectId}-{containerId}-{kit_slug}-{serviceIndex}.{server}.containers.hoody.com` is the bearer for that kit while no proxy permissions are configured for the container. See § Proxy URLs.

## Header rule — `Authorization: Bearer <token>`

Send `Bearer <token>` (one space, case-sensitive) for either credential. An `hdy_` auth token may also be sent bare (`Authorization: hdy_…`); a JWT may not. The two kinds are told apart by the token's own leading characters. Most endpoints accept both kinds; a few account-sensitive ones accept only a JWT.

## What each credential can do

- **Auth-token guards.** IP allowlist, expiry, enable/disable.
- **Basic.** `user:pass`, `user:authToken`, `authToken:pass`. If both sides parse as tokens (token:token), the username side is tried first then the password side falls through.
- **Container surfaces have no admin tier.** Unless proxy permissions are configured, whoever holds a kit URL has full access to that kit, the `bot` kit's management routes included. A container claim (below) grants nothing on the built-in kits; it only matters to a program you write that chooses to verify it.

## Vault — double gate

`/vault/*` auth-token needs BOTH `vault_access===true` AND the `resources.vault` permission on the token, else `403`. JWT owner passes; no cross-user override.

## Login

- `username` OR `email` + `password`.
- Response: `data.token` (not `accessToken`), `data.refreshToken`, `data.expires_in`.
- 2FA: returns `requires_2fa`, `temp_token` (5-min); exchange at `POST /api/v1/users/auth/2fa/verify`.
- Email signup → username `<localpart>-<4hex>`. Characters outside `a-z`, `A-Z`, `0-9`, `_` and `-` are removed from the local part, and a reserved local part is replaced by a neutral name.

## Kit URLs as credentials

Bearer by default. Add auth groups via `proxy.containerPermissions`/`proxy.projectPermissions` `.set{Password,Token,Jwt,Ip}Group` — groups are alternatives (a request satisfying any one gets that group's permissions; unmatched requests fall to the `default` policy), not stacked layers. A group alone restricts nothing: give it program access with `setGroupPermission` and set `setDefault` to `deny`, because a new permission document starts at `default: 'allow'`. `disable` / `enable` (`enable_proxy`) is a kill-switch that cuts the proxy entirely. See § Proxy URLs.

### Container claim — optional portable credential

Every built-in kit — **including `agent`** — accepts the bare per-container kit URL (the URL is the bearer). The `bot` kit's management routes ask for no account token either: they admit any request that reaches them, so on a container without proxy permissions anyone holding its bot URL can register, start, stop and delete bots. There is **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` handshake and no `401 CLAIM_REQUIRED` on the built-in kits; the `agent` kit behaves exactly like the others here.

Separately, `client.api.containers.createClaim(id)` mints a signed, portable **container claim** — `data: { container_claim: { kid, payload_b64, signature_hex }, expires_in, container_id, project_id }`. It is an *optional* credential for a program **you** run inside a container to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

## Realms — project isolation

A **realm** is a 24-hex-id namespace inside your account that walls off projects, containers, tokens, and vault entries. Project aliases stay unique across your whole account (not per realm), so two realms cannot hold projects with the same alias; an auth token scoped to realm A cannot see realm B on the control plane — a realm-B id is refused with `403` or `404`, depending on the route. Treat each substantial project as its own realm: an agent (or human) operating with a realm-scoped token cannot drop a container, wipe a vault key, or change settings in another realm through the API. Realms do not gate kit URLs: anyone who holds a container's kit URL reaches that kit whatever token they carry, so gate kit URLs separately (§ Proxy URLs).

### Why realms

- **Blast-radius cap** — leaked or buggy token erases at most one realm's worth of state.
- **Mistake-proof multi-project work** — the token can only see the realm whose subdomain it's invoked from; a container delete aimed at the wrong id is refused (`403` or `404`) instead of destroying another realm's container.
- **Clean separation** — projects, containers, vault entries, snapshots and proxy aliases are realm-scoped. The wallet is not: balances belong to the whole account, so restrict `financial.*` permissions on the token separately.
- **Cheap to spin up** — realms are free; create one per project rather than reusing.

### Realm-scoped URL

`https://{realmId}.api.hoody.com` — same control-plane API, but every operation that takes an id resolves only against that realm. Off-realm ids are refused with `403` or `404`, depending on the route. The subdomain is the only request-wide realm selector. A few routes also take a `realm_id` query parameter — the vault routes and some list routes (projects, containers, proxy aliases, storage shares, events), where it filters the result; it is not a general replacement for the subdomain.

### How to attach a container to a realm

Pass `realm_ids: ['<24-hex>']` when creating the container — and an array of multiple realm IDs is fine if a container needs to be visible in several. Container realm membership is **independent of project realm membership** (a project in realm A can hold a container in realms A+B). Read it back from the `realm_ids` field returned by `client.api.containers.get`.

### Auth tokens × realms

Mint a realm-scoped token via `auth.tokens.create({ realm_ids: ['<id>'] })`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL"). Add / drop realms post-mint with `client.api.auth.tokens.addRealm` / `client.api.auth.tokens.removeRealm`. Globally-scoped tokens (no `realm_ids`) can still target a specific realm by using the realm subdomain, or the `realm_id` query parameter on the routes that take one.

### Best practice — one realm + one token per project

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `client.api.realms.list`.
2. `auth.tokens.create` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `projects.create` with `realm_ids: [realm_id]` — pin the project to the realm.
4. `containers.create` with `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the container too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Create the client with `new HoodyClient({ baseURL: 'https://api.hoody.com', token, realmId })` (or that realm URL as `baseURL`) so every call goes to the right scope.

Result: that token can only see projects, containers, tokens, and vault entries in the realm. An agent given just this token cannot touch your other realms through the API — even if it's the same Hoody account. Kit URLs it already knows stay reachable; they answer to their own gates, not to the token.

## Storing auth tokens

The `hdy_…` token from `auth.tokens.create` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the container. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `vault.set('<key>', { value: 'hdy_…' })`. Stored server-side as sent — Hoody does not encrypt the value for you — and readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `vault.set`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND the `resources.vault` permission granted to it. JWT-as-owner bypasses both. See `vault.set/get/list/delete/clear`.

## Token revocation

- `client.api.auth.logoutAll` — for a JWT this is a **logout-everywhere**: every access and refresh token minted before the call stops working, on every device, not just the one that called it. Auth tokens are unaffected.
- `client.api.auth.refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. The SDK sends both for you: `client.api.auth.refresh({ refreshToken })` presents that refresh token as the bearer for that one request, whatever token the client holds. The client's automatic 401 recovery uses the same call with its stored refresh token first, and falls back to `credentials` only when that fails. For headless flows prefer minting a long-lived `auth.tokens.create`.
- `client.api.auth.tokens.delete` / disable / IP-restrict — effective next request.

## 2FA

`auth.twoFactor.startSetup` returns `{ qr_code, manual_entry_key, backup_codes }`; `auth.twoFactor.confirmSetup` enables. Backup codes rotatable, one-time, hashed. `auth.twoFactor.enableTokenGate` on → sensitive auth-token mutations need TOTP+JWT.

---

# Pre-installed tools — what every container ships with

Every Hoody container starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Containers run real systemd as PID 1 with root inside the container** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides and socket activation work as on a normal distro. Containers share the host kernel, so container root cannot load kernel modules. Two tiers of pre-installed software:

1. **Default tier** — installed when the container's resolved `hoody_kit` setting is true. Left out of `containers.create`, it is true for a login (JWT) caller; for an auth-token caller it follows the token's `containers.features.hoody_kit` permission, so it is false when the token lacks it. A container with `hoody_kit` false is not guaranteed to have these packages.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 26, Bun, Rust, Go, Nix, Docker, …). Pass it on `containers.create`; when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `pip install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours.

## `kvm: true` — run full VMs inside the container

Containers on **rented / dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the container. Pass `kvm: true` on `containers.create`, or toggle it later on a **stopped** container (`containers.enableKvm` / `containers.disableKvm`). Defaults to off. **Never available on free-tier servers** — the API refuses with `403`. `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every container response carries the current `kvm` boolean.

## `hoody` CLI is pre-installed inside every container

The `hoody` binary is on every container's `$PATH` (`/usr/bin/hoody`) for root, the default `user` account and any account that holds `user`'s group — from a shell session, an `exec` script, a `daemon` program, a cron entry or an SSH session running as one of them. Other uids cannot run it: the binary lives under `/hoody`, which only root and that group can enter; give such a uid its own install of the CLI.

Inside the container, `$HOODY_CONTAINER_ID` is pre-populated by the kit (the CLI also accepts `$HOODY_CONTAINER` as a compatibility alias) so commands targeting "this container" can skip the `--container` flag. `$HOODY_TOKEN` is NOT auto-injected — set it via vault/secrets if container code needs to call the API. Login state is per-user under `~/.hoody/config.json`.

This is the same binary as `hoody` outside the container — every example in the CLI skill works inside a container's shell exactly as it would on a developer laptop.

## Default user — `user` (uid 1000) with passwordless sudo

Containers ship with a **non-root account named `user`** (uid 1000, gid 1000, member of `sudo`). Home is `/home/user`. **`/etc/sudoers.d/user` grants `user ALL=(ALL) NOPASSWD: ALL`** — passwordless `sudo` lets agents (and humans) escalate to root for any operation without prompting.

**Use `user` for everyday work, sudo when you actually need root.** Reasons:

- Files created under `user` are owned by uid 1000 — friendlier when you copy/sync them out of the container or back-stop with rsync.
- Many apps (npm, pip in venvs, Bun, Cargo, Go, Nix single-user, Docker rootless, browsers) write into `$HOME` and behave better when `$HOME` is a real user home, not `/root`.
- `journalctl --user`, `systemctl --user`, dbus user buses all hang off a regular user.

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `daemon.programs.create({ name: 'my-app', command: '…', user: 'user' })`, `terminal.sessions.create({ terminal_id: '100', user: 'user', shell: 'bash', cwd: '/home/user' })` (`terminal_id` is required unless you pass `ephemeral: true`). The generated `client.exec.run(path, ...)` does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For containers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo rm /etc/sudoers.d/user                        # remove the drop-in
sudo passwd user                                   # set a real password
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `proxy.containerPermissions.*` gates and ideally a non-root default user.

## Default tier — with `hoody_kit`

### Network & download
`curl`, `wget`, `net-tools` (`ifconfig`/`netstat`), `dnsutils` (`dig`/`nslookup`), `traceroute`, `socat`, `ncat`, `gpg`, `screen`, `rsync`, `sshpass`.

### Shell & terminal
`bash` (default), `zsh`, `fish`, `tmux`, `nano`, `xterm`, `psmisc`, `coreutils`, `lsof`, `bc`, `tree`, `fuse3`.

### Search / parse / archive
`ripgrep` (`rg`), `jq`, `yq`, `unzip`, `rar`.

### X11 helpers
`xsel`, `xclip`, `wmctrl`, `xdotool` — drive any GUI from the shell, pair with the `display` kit.

### Version control
`git`.

### Database
`sqlite3`.

### Scheduler
`cron`.

### Build toolchain
`build-essential`, `gcc`, `g++`, `make`, `cmake`, `autoconf`, `automake`, `pkg-config`, `bison`, `flex`, `libtool`, `gettext`.

### Python (for scripts)
`python3` (system), `python3-dev`, `python3-pip`, `python3-setuptools`, plus dev bindings for cairo / GTK / dbus / cryptography / Pillow / paramiko / netifaces.

### System dev libs (headers, for compiling against)
`libssl-dev`, `libffi-dev`, `libcairo2-dev`, `libgtk-3-dev`, `libglib2.0-dev`, `libpango1.0-dev`, `libncurses-dev`, X11 dev libs (`libx11-dev`, `libxrandr-dev`, `libxext-dev`, `libxtst-dev`, …), OpenGL (`libgl1-mesa-dev`), media codecs (`libjpeg`, `libpng`, `libwebp`, `libavcodec`, `libx264`, `libvpx`, `libaom`), GStreamer.

## `dev_kit: true` tier — comprehensive coding setup

Set the flag on `containers.create` to additionally provision:

### JavaScript / TypeScript
- **Node.js 26** (system-wide via NodeSource — not nvm).
- **Bun** (system-wide).
- **Yarn + pnpm** (via Corepack).
- **npm globals**: `typescript`, `ts-node`, `tsx`, `@types/node`, `eslint`, `prettier`, `@biomejs/biome`, `npm-check-updates`, `nodemon`, `concurrently`.

### Python
- **pipx** (isolated CLI installs).

### Compiled languages
- **Rust** + **cargo** (system rustup).
- **Go** (latest).

### Package managers
- **Nix** (multi-user) — declarative installs without touching apt.
- **pkgx** — runs CLIs without installing them globally.

### Containers
- **Docker Engine** + **buildx** + **compose plugin** + **containerd**.

### CLI utilities
`shellcheck`, `direnv`, `httpie`, `fd-find` (aliased as `fd`), `bat`, `fzf`, `gh` (GitHub CLI).

### AI agent CLIs (installed by default)
- **Claude Code** (`claude`, npm `@anthropic-ai/claude-code`)
- **Codex** (`codex`, npm `@openai/codex`)
- **opencode** (`opencode`, npm `opencode-ai`)
- **Gemini CLI** (`gemini`, npm `@google/gemini-cli`)

Installed without credentials. Push your local credentials/config in afterwards
with the `agent.importLocalConfig()` helper (see core-ops § "Sync agent config")
— no manual login inside the container needed.

## How to add more

```bash
# Anything Debian-packaged
apt-get install -y <pkg>

# Python (use a venv or pipx for isolated CLIs)
pipx install <tool>

# Node global
npm i -g <pkg>

# Rust (only if dev_kit installed)
cargo install <crate>

# Go (only if dev_kit installed)
go install <module>@latest

# Nix (only if dev_kit installed) — best for one-off binaries that bring 30 deps
nix-env -iA nixpkgs.<pkg>
```

State is per-container: `containers.copy` clones the disk including everything you installed; `client.api.snapshots.create` saves a point-in-time you can later `client.api.snapshots.restore` to roll back to. There is no global "shared layer" leak — each container's filesystem is its own.

---

# SDK — Core operations cheat-sheet

TS SDK recipes against `https://api.hoody.com`. `hoody` = account `HoodyClient`; `box = await hoody.withContainer(container)` = container-scoped. See § Auth model and § Proxy URLs above.

### Setup

```typescript
import { HoodyClient } from 'hoody-sdk';
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com', token: process.env.HOODY_TOKEN });
// withContainer takes a container id (looked up with the token) or a container object: a row
// from containers.list()/get(), or one you build with id, project_id and the server, given as
// server_name, as a string `server`, or as `server: { name }`.
const box = await hoody.withContainer(containerId);
```

A hoody-exec script can load the SDK with `require` or a top-level `import`, and reaches the
container it runs in through `metadata.containerId`:

```typescript
const { HoodyClient } = require('hoody-sdk');
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com', token: process.env.HOODY_TOKEN });
const box = await hoody.withContainer(metadata.containerId);
```

### Results: what each call resolves to

- A generated call (`hoody.api.*`, `box.<kit>.*`) resolves to the envelope
  `{ statusCode, message, data }`: the result is `.data`, never the returned object itself.
- `rawResponse: true` in a call's options skips the SDK's envelope: the call resolves to the body
  the service sent (a kit's own JSON; a `hoody.api.*` body is itself `{ statusCode, message, data }`).
- `listAll()` resolves to a bare array of every row (no `.data`); `listIterator()` is an async
  iterator of rows (`for await`).
- `box.terminal.run(command)` resolves to `{ stdout, stderr, exitCode, timedOut }` (no envelope).
- `box.files.readText` / `readJson` / `readBytes` resolve to the text, the parsed value and a
  `Uint8Array` (no envelope), § 16.
- `box.sqlite.sql.query(…)` resolves to `{ rows, columns, truncated }` and
  `box.sqlite.sql.run(…)` to `{ rowsUpdated }` (no envelope), § 25.
- A 4xx/5xx answer throws an `ApiError` (`err.status` holds the HTTP status).

| Call | Where the result is |
|---|---|
| `hoody.api.containers.list()`, `containers.listByProject(projectId)` | `r.data.containers` (one page; `r.data.pagination`) |
| `hoody.api.containers.get(id)` | `r.data` |
| `hoody.api.projects.list()` | `r.data.projects` |
| `hoody.api.auth.tokens.list()` | `r.data` (array) |
| `hoody.api.servers.list()` (your servers) | `r.data` (array; `server_id`, `server.name`) |
| `hoody.api.realms.list()` | `r.data.realm_ids` (ids only) |
| `containers.listAll()`, `projects.listAll()`, `auth.tokens.listAll()` | `r` itself (array, no `.data`) |
| `box.files.readText(file)`, `readJson(file)`, `readBytes(file)` | `r` itself (string, parsed value, bytes), § 16 |
| `box.files.get(file, { responseType: 'text' })` | `r.data` (string), § 16 |
| `box.files.get(directory)` | `r.data.entries` (`{ name, is_dir, size }`) |
| `box.sqlite.sql.query({ db, sql, params })` | `r.rows` (array of row objects), `r.columns`, § 25 |
| `box.sqlite.sql.run({ db, sql, params })` | `r.rowsUpdated`, § 25 |
| `box.sqlite.sql.runTransaction(…)` | `r.data.results[i].resultSet` (rows), § 25 |
| `box.sqlite.kv.get(key, { db })` | `r.data` (the stored value), § 19 |
| `box.cron.entries.list('user')` | `r.data.entries`, § 26 |
| `box.terminal.commands.run(…)` | `r.data.stdout`, `r.data.exit_code`, § 13 |
| `box.terminal.run(command)` | `r.stdout`, `r.exitCode` (no envelope), § 13 |

Row fields keep the API's snake_case names: `id`, `name`, `status`, `project_id`, `server_name`,
`created_at`, `is_default`, `alias`, `expires_at`.

```typescript
const page = await hoody.api.containers.list();
const running = page.data.containers.filter((c) => c.status === 'running');
const all = await hoody.api.containers.listAll();          // array: all.map(c => c.name)
```

### 1. Sign up

```typescript
// Password 12-128 chars, at most 72 UTF-8 bytes, at least 3 of 4 classes (upper/lower/digit/symbol).
await hoody.api.auth.signup({
  email: 'you@example.com',
  password: process.env.HOODY_PASSWORD!,
});
```

### 2. Verify email

```typescript
await hoody.api.auth.verifyEmail({
  token: codeFromEmail, // 64-char token from the verification email link
});
```

### 3. Log in

`username` is alphanumeric with underscores and hyphens (`^[a-zA-Z0-9_-]+$`); use the separate `email` field for email-based login. Login password min length is 8 (signup is 12).

```typescript
// `hoody` is the client from Setup.
const login = await hoody.api.auth.login({
  email: 'you@example.com',  // or `username: 'alex_3'`
  password: process.env.HOODY_PASSWORD!,
});
if (!login.data || !('token' in login.data)) throw new Error('Second factor required: see step 4');
hoody.setToken(login.data.token);
```

### 4. Log in with 2FA

```typescript
const r = await hoody.api.auth.login({
  email: 'you@example.com',
  password: process.env.HOODY_PASSWORD!,
});
if (r.data && 'temp_token' in r.data) {
  // Verifies the code and adopts the session it returns, refresh token included.
  await hoody.completeTwoFactorLogin(r.data.temp_token, codeFromAuthenticator);
}
```

### 5. Mint a realm-scoped auth token

```typescript
const created = await hoody.api.auth.tokens.create({
  alias: 'Customer Acme Corp',
  permission_template: 'external_customer',
  realm_ids: ['507f1f77bcf86cd799439011'],
});
const customerToken = created.data!.token; // shown ONCE
```

### 6. List projects

```typescript
const page = await hoody.api.projects.list();          // envelope: page.data.projects
const all  = await hoody.api.projects.listAll();       // bare array of every project
const def  = all.find((p) => p.is_default);
for await (const p of hoody.api.projects.listIterator()) { /* one project per step */ }
```

### 7. Create a project

```typescript
const project = await hoody.api.projects.create({
  alias: 'acme-workspace',
  realm_ids: ['507f1f77bcf86cd799439011'],
});
const projectId = project.data!.id;
```

### 8. List containers

```typescript
const r = await hoody.api.containers.listByProject(projectId);
const names = r.data.containers.map((c) => c.name);
```

### 9. Create a container

```typescript
const c = await hoody.api.containers.create(projectId, {
  server_id: process.env.HOODY_SERVER_ID!,
  name: 'box-1',
  hoody_kit: true,
  realm_ids: ['507f1f77bcf86cd799439011'],
});
const containerId = c.data!.id!;  // response fields are typed optional; assert the id once
```

### 10. Start / stop / restart

```typescript
await hoody.api.containers.start(containerId);
// also: stop (`stop(id, undefined, { force: true })` kills without a clean shutdown), restart, pause, resume
```

### 11. Get container + build Kit URLs

```typescript
const got = await hoody.api.containers.get(containerId, { runtime: 'true' });
// The URL helpers take a container whose `id` is a string; the response types it optional.
const container = { ...got.data!, id: containerId };

// Single kit URL — pass slug + optional instance index.
const terminalUrl = hoody.getKitUrl('terminal', container);    // → terminal-1
const display3    = hoody.getKitUrl('display', container, 3);  // → display-3
const port8080    = hoody.getKitUrl('http', container, 8080);  // → http-8080

// All standard kit URL patterns at once — Record<slug, url>. This is a convenience
// method; it returns the canonical URL for every standard kit and does NOT
// check whether the program is actually live on this container.
const all = hoody.getKitUrls(container);
// { terminal, browser, code, curl, cron, daemon, display, desktop, exec,
//   files, notifications, sqlite, watch, logs, notes, run, pipe, tunnel,
//   agent, bot, egress }   ← 21 keys

// Desktop helper — picks the DE via query string. Default xfce; pass `mate`
// for MATE. Returns the same URL the user opens in a browser tab.
const xfce = hoody.getDesktopUrl(container);
const mate = hoody.getDesktopUrl(container, { desktopEnv: 'mate', serviceIndex: 1 });
```

### 12. Snapshot + restore

```typescript
await hoody.api.snapshots.create(containerId, {
  alias: 'pre-deploy',
  expiry: 30, // days
});
await hoody.api.snapshots.restore(containerId, 'pre-deploy');
```

### 13. One-shot command

`box.terminal.run(command)` runs the command in a fresh session, waits for the end, and resolves to
`{ stdout, stderr, exitCode, timedOut }` without an envelope. A non-zero exit does not throw:
check `exitCode`. `stdout` may end with a newline; `trimEnd()` it when parsing.

```typescript
const res = await box.terminal.run('df -h /');
if (res.exitCode !== 0) throw new Error(res.stderr);
const lines = res.stdout.trimEnd().split('\n');
```

The generated call underneath: the terminal host index picks the session (the proxy overwrites any `terminal_id` query with it, and the SDK's default host is `terminal-1`), so route ephemeral calls to `terminal-0` so the kit can allocate a fresh session:

```typescript
const r = await box.terminal.commands.run(
  { command: 'uname -a' },
  { ephemeral: true },
  { serviceIndex: 0 },  // terminal-0 host
);
const out = r.data.stdout;      // envelope: also r.data.stderr, r.data.exit_code
```

### 14. Persistent terminal session

```typescript
// Session N lives on the terminal-N host; pass it as serviceIndex on every call.
// create also needs the id in its body: the kit reads terminal_id only from the
// body and answers 400 "Missing 'terminal_id' field" without it.
const N = 100;  // pick 1-39999 (40000+ is the ephemeral range)
await box.terminal.sessions.create(
  { terminal_id: String(N), shell: '/bin/bash', user: 'user', cwd: '/home/user' },
  { serviceIndex: N },
);

await box.terminal.commands.run(
  { command: 'cd repo && git status' },
  {},
  { serviceIndex: N },
);
```

### 15. Run a hoody-exec script as HTTP

Scripts use the direct-execution pattern: no export and no function declaration; write the code and `return` the result (`req`, `res`, `metadata`, `shared`, `console` and `require` are injected). `module.exports = async (req, res, metadata, shared) => …` also works. Keep script validation on (the default).

```typescript
const r = await box.exec.run('/api/build');
```

### 16. Read / write a file

The readers resolve to the content itself, no envelope. `readJson` fetches the text and parses
it; content that is not JSON throws a `SyntaxError` naming the path. They take a file path (a
directory path answers its listing). A missing file throws `ApiError` with `err.status === 404`.
`files.upload` takes the content as bytes: `Buffer.from(text)` (or `new TextEncoder().encode(text)`
in a browser), a `Uint8Array` or an `ArrayBuffer`.

```typescript
const text = await box.files.readText('/home/user/notes.md');               // string
const settings = await box.files.readJson('/home/user/settings.json');      // parsed value
const png = await box.files.readBytes('/home/user/logo.png');               // Uint8Array

// Write (creates or replaces)
await box.files.upload('/home/user/hello.txt', Buffer.from('hello'));
await box.files.upload('/home/user/settings.json', Buffer.from(JSON.stringify(settings, null, 2)));

// A directory path lists it (envelope: .data.entries)
const { data: dir } = await box.files.get('/home/user');
const fileNames = (dir as { entries: Array<{ name: string; is_dir: boolean }> }).entries.filter((e) => !e.is_dir).map((e) => e.name);
```

`files.get` itself resolves to the envelope: with `responseType: 'text'` the text is `.data`, with
`'arrayBuffer'` the bytes are. Without `responseType` a `.json` file arrives already parsed and
other files as text or bytes depending on their type.

```typescript
const { data: hostname } = await box.files.get('/etc/hostname', { responseType: 'text' });
```

### 17. Browser screenshot

```typescript
// The browser-N host picks the instance (default browser-1); add { serviceIndex: N }
// as the second argument for another one (a `browser_id` option picks the host too).
const png = await box.browser.page.captureScreenshot({
  url: 'https://example.com',
  fullPage: true,
  format: 'png',
  responseType: 'arrayBuffer',
});
```

### 18. Click + type on a virtual display

```typescript
// data first (x, y, button as 1=left/2=middle/3=right), displayId in options.
await box.display.input.click({ x: 640, y: 360, button: 1 }, { displayId: 1 });
await box.display.input.type({ x: 640, y: 360, text: 'hello world' }, { displayId: 1 });
```

### 19. SQLite KV set / get

```typescript
// kv.set takes the value itself: an object, array, number or boolean is stored as JSON.
// Do NOT JSON.stringify it first: a string is stored as a JSON string, so get would return the
// text '{"name":"Ada",…}', not the object.
// db / table / path / ttl / if_match all live in options, not the body.
await box.sqlite.kv.set(
  'user:42',
  { name: 'Ada', tier: 'pro' },
  { db: '/hoody/databases/app.db', create_db_if_missing: true },  // or a bare name: 'app'
);
const { data: user } = await box.sqlite.kv.get('user:42', { db: '/hoody/databases/app.db' });
// user = { name: 'Ada', tier: 'pro' }
```

### 20. Watch a directory (SSE)

```typescript
// CreateWatcherRequest takes `paths: string[]` (NOT `path`) and `kinds`
// (NOT `events`). Recursive defaults to server config.
const w = await box.watch.watchers.create({
  paths: ['/home/user'],
  recursive: true,
  kinds: ['created', 'modified', 'removed'],
});
const watcherId = (w.data as any).id;

// streamSse yields events as they arrive; `ev.raw` is the event's JSON data.
for await (const ev of await box.watch.events.stream(watcherId)) {
  console.log(ev.event, JSON.parse(ev.raw));
}
// For catch-up and polling instead, use `box.watch.events.list` with a cursor:
let lastId: number | undefined;
for (;;) {
  const page = await box.watch.events.list(watcherId, { since_id: lastId, limit: 200 });
  const items = (page.data as any)?.items ?? [];
  for (const ev of items) lastId = ev.id;
  if (items.length === 0) break;
}
```

### 21. Reverse tunnel (localhost → public URL)

```typescript
// box.tunnel.* builds the tunnel WebSocket URL and sends box's kitAuth (never the account token)
const handle = await box.tunnel.expose({
  containerPort: 3000,               // 0 = auto; 1-1023 refused unless the kit allows privileged binds
  to: { host: '127.0.0.1', port: 3000 },   // LocalTarget = { host, port }, no `kind` field
});
console.log(hoody.getKitUrl('http', container, { port: handle.bind.containerPort }));  // the public URL
await handle.close();
```

### 22. Vault set / get

```typescript
// Top-level `value`, not `{data:{value}}`.
await hoody.api.vault.set('openai_api_key', { value: 'sk-...' });
const v = await hoody.api.vault.get('openai_api_key');
```

### 23. Wallet balance

```typescript
const b = await hoody.api.wallet.getBalances();
```

### 24. Sync agent config / credentials into a container

Dev-kit containers ship the agent CLIs (`claude`, `codex`, `opencode`, `gemini`)
but no credentials. Push your local config in so they work immediately. Needs a
container-scoped client (`withContainer`). Writes via the files kit (raw bytes),
hardens perms (files `0600`, dirs `0700`, chown to the container user).

```typescript
const box = await hoody.withContainer(container);

// Whole config dir minus history/cache (default scope):
await box.agent.importLocalConfig('codex');

// Just the auth/credential files:
await box.agent.importLocalConfig('claude', { only: 'credentials' });

// Several at once; preview without writing:
await box.agent.importLocalConfigs(['codex', 'claude', 'gemini'], { dryRun: true });

// Override the local source and/or include history:
await box.agent.importLocalConfig('opencode', { source: '/custom/opencode', includeHistory: true });

// Inspect the registry (which files each tool maps to):
box.agent.listLocalConfigTools();
```

Categories: `credentials`, `config`, `skills` (default), plus `history`/`cache`
(off by default). Narrow with `only` / `categories`, or `include`/`exclude` globs.
Known tools: `codex`, `claude`, `opencode`, `gemini`. Symlinks are skipped and
`..` paths rejected. Returns `{ planned, written, skipped, errors, bytesWritten }`.

### 25. SQLite SQL (select / insert)

`box.sqlite.sql.query({ db, sql, params })` runs one statement that returns rows (a SELECT, or
a write with `RETURNING`) and resolves to `{ rows, columns, truncated }`.
`box.sqlite.sql.run({ db, sql, params })` runs one statement for its effect (CREATE, INSERT,
UPDATE, DELETE) and resolves to `{ rowsUpdated }`. A statement whose SQL produces columns (a write with
`RETURNING`) resolves to `{ rowsUpdated, rows }` instead, with `truncated: true` when the row cap cut it
(`rowsUpdated` is then the number of rows returned). `db` is required: a bare
name (`'app'` → `/hoody/databases/app.db`) or a path. The database must exist: pass
`create_db_if_missing: true` on the call that may be the first. `params` is an array for `?`
placeholders or an object for `:name` placeholders; each value is a string, a finite number, a
boolean or null (NaN, Infinity, undefined, bytes and nested values throw before sending).
`truncated` is true when the kit's row cap cut the result.

```typescript
await box.sqlite.sql.run({
  db: 'app', create_db_if_missing: true,
  sql: 'CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, title TEXT, done INTEGER)',
});
const { rowsUpdated } = await box.sqlite.sql.run({
  db: 'app', sql: 'INSERT INTO items (title, done) VALUES (?, ?)', params: ['Write docs', 0],
});
const { rows } = await box.sqlite.sql.query({
  db: 'app', sql: 'SELECT id, title FROM items WHERE done = ? ORDER BY id', params: [0],
});
// rows = [{ id: 1, title: 'Write docs' }, …]
```

Several statements in one transaction: `sql.runTransaction` takes a list of items and
answers the results in the same order, in the envelope. A row-returning statement goes in a
**`query` item** (rows in `resultSet`); CREATE / INSERT / UPDATE / DELETE go in a **`statement`
item** (`rowsUpdated`). The kit decides by the SQL, not by the item kind: a statement whose SQL
produces columns (a SELECT, or a write with `RETURNING`) answers `resultSet` like a query.
Placeholder values go in `values`.

```typescript
const w = await box.sqlite.sql.runTransaction(
  { transaction: [
    { statement: 'INSERT INTO items (title, done) VALUES (?, ?)', values: ['Ship', 0] },
    { query: 'SELECT last_insert_rowid() AS id' },
  ] },
  { db: 'app' },
);
const inserted = w.data.results[0].rowsUpdated;      // 1
const newId = w.data.results[1].resultSet[0].id;
```

Read-only alternative (GET, SELECT/WITH only): `sql.queryReadOnly` takes the SQL as URL-safe
base64 and answers `{ columns, resultSet, rowCount }` in `.data`.

```typescript
const sql = Buffer.from('SELECT count(*) AS n FROM items').toString('base64url');
const q = await box.sqlite.sql.queryReadOnly({ db: 'app', sql });
const n = q.data.resultSet[0].n;
```

Without the SDK, the same transaction is `POST /api/v1/sqlite/db?db=<name>` on the container's
sqlite kit URL; the body is the kit's answer itself, with no envelope.

```typescript
const sqliteUrl = hoody.getKitUrl('sqlite', container);  // https://{P}-{C}-sqlite-1.{N}.containers.hoody.com
const res = await fetch(`${sqliteUrl}/api/v1/sqlite/db?db=app&create_db_if_missing=true`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ transaction: [{ query: 'SELECT id, title FROM items WHERE done = ?', values: [0] }] }),
});
const { results } = await res.json();
const rows = results[0].resultSet;
```

### 26. Cron entries

The crontab of one system user: managed entries plus the user's other lines. The user is a positional string (`'user'` is the
container's login user), never an object.

```typescript
const list = await box.cron.entries.list('user');
const commands = list.data.entries.map((e) => (e.type === 'managed' ? e.command : e.line));  // managed: { type, id, schedule, command, enabled, … }; raw: { type, line }

const created = await box.cron.entries.create('user', { schedule: '*/5 * * * *', command: '/home/user/bin/sync.sh' });
const id = created.data.id;
await box.cron.entries.update('user', id, { enabled: false });
await box.cron.entries.delete('user', id);
```

Without the SDK, the cron kit's routes sit at the root of its kit URL
(`https://{P}-{C}-cron-1.{N}.containers.hoody.com`), with no `/api/v1` prefix:

| Route | Does |
|---|---|
| `GET /users/{user}/entries?page=&limit=` | list every crontab line in order: `{ user, entries, total, page, limit }` (limit max 200); managed entries have `type:"managed"` with `id`, `schedule`, `command`; other lines come back as `type:"raw"` with `line` |
| `POST /users/{user}/entries` | create: JSON `{ schedule, command, name?, comment?, enabled?, expires_at? }` → 201, the entry with its `id` |
| `GET /users/{user}/entries/{id}` | one entry |
| `PATCH /users/{user}/entries/{id}` | update the fields you send (`schedule`, `command`, `enabled`, …) |
| `DELETE /users/{user}/entries/{id}` | delete |
| `GET /users/{user}/crontab` | the user's whole crontab: `{ user, crontab }` (`crontab` is the text) |
| `PUT /users/{user}/crontab` | replace it: JSON `{ crontab: '<text>' }` |
| `GET /crontab` | every user's crontab |

---

# SDK — Reference appendix

## `HoodyClientConfig` key options

- `baseURL` (recommended `https://api.hoody.com`; when omitted outside a browser page: `HOODY_BASE_URL`, then `HOODY_API_URL`, then `https://api.hoody.com`; none for `target: 'kit'`); `realmId` -> `{realmId}.api.hoody.com`.
- Auth: `token` and/or `credentials` (`{username,password}` or `{email,password}`; both fields are independent on `HoodyClientConfig`); `autoRefresh`, `autoRetryAuth`; hooks `onTokenExpired`, `refreshToken`, `kitAuth`+`onKitAuthExpired`, `onError`.
- Retry: `timeout`, `retries` (when omitted, eligible requests get up to two retries, with a 2-second backoff base and at most 10 seconds of total waiting; set `retries: 0` to disable retries; a value you set gets a 250 ms base and no total cap), `retryDelayMs`, `retryOnStatuses` (default 408/425/429/500/502/503/504); honours `Retry-After`, cap 30s per wait.
- Misc: `headers`, `cache{enabled,ttl}`, `transport.keepAlive`, `forceIPv4`, `forceIPv4Cache{enabled,ttlMs}`, `middlewares`, `clientId`/`clientName`, `urlTemplates`.
- Per-call: `responseType` (`json|text|arrayBuffer|blob|auto`), `timeoutMs`, `signal`, `rawResponse` (skip envelope; cast `as unknown as RawShape`).

## `ApiError`

`status, code?, url?, method?, request{method,url,body?,query?,headers?}, response{statusCode?,message?,code?,details?}`.

- `0` transport (`cause` set) · `422` control-plane request-schema validation (body `error: "Validation Error"` with the details; `err.code` is ordinarily `undefined`, so branch on the status) · `400` other bad requests, including many kit validation failures · `401` SDK tries one recovery (account: token refresh; kit: only when `onKitAuthExpired` is set) and replays the request once on success, else throws · `403` realm/permission · `404` missing in token's realm · `408/425/429/500/502/503/504` retryable.
- `code` is read from the JSON error body in this order: a top-level `code` string; else an `error` string that is itself code-shaped (SCREAMING_SNAKE); else a nested `error.code` string. When the body yields none, the `X-Hoody-Error-Code` response header is read (a `HEAD` answer has no body, so that is the only place its code can be). Prose in `error` is never promoted to a code. What you get therefore depends on which service answered:
  - **Account / control-plane** — body is `{statusCode, error, message, data?}` with no `code` key. When `error` carries an upper-case machine code (such as `SIGNING_NOT_CONFIGURED`) it reaches `err.code`; when it carries a status name (`Unauthorized`, `Bad Request`) `err.code` is `undefined`.
  - **Top-level `code`** — the body is `{code, message, details?}`, SCREAMING_SNAKE (`EXPIRES_IN_PAST`, `INVALID_EXPIRES_AT`, `ENTRY_NOT_FOUND`). These reach `err.code`.
  - **Nested `{error:{code,message}}`** — the notes kit's routes and the bot kit's management routes (`not_found`, `invalid_token`, …). The nested value reaches `err.code`.
  - **Header only** — the sqlite kit's KV `HEAD` 404 names `KEY_NOT_FOUND` / `KEY_EXPIRED` in `X-Hoody-Error-Code`.
- A lower-case `error` value is not a code: the logs kit's `429 {error: "rate_limited"}` leaves `err.code` `undefined`; read the body.
- Some values of `code` come from the CLIENT, not from any body. With `status` `0`: **`ABORTED`** when the request timed out, was aborted, or got no response headers in time (never retried), **`PARSE_ERROR`** when the response body would not parse, and **`ETIMEDOUT`** when the connection could not be opened in time or the body stalled after the headers arrived. Stream validation errors (`NOT_AN_EVENT_STREAM`, `STREAM_FRAME_TOO_LARGE`) keep the response status, and `REDIRECT_REFUSED` keeps the refused redirect's status. A timeout is the error a caller meets most often, so handle `ABORTED` explicitly.
- **So: branch on `status` first, always. Treat `code` as an optional, service-specific refinement, and never assume a documented value will appear there.**
- `retryAfterMs` is attached to the thrown error when an HTTP **error** response carried a **parseable** `Retry-After` header — any error status, not just 429. It is not attached on the client-side failures above: a `200` whose body will not parse throws `PARSE_ERROR` with `status` `0` and no `retryAfterMs`, even when the response carried the header. Delta-seconds and an HTTP-date both parse; anything else is ignored and the property stays absent, and a date already in the past gives `0` rather than a negative wait. It is set at runtime but is NOT declared on `ApiError`, so TypeScript callers must read it through a cast: `(err as ApiError & { retryAfterMs?: number }).retryAfterMs`.

## Pagination

`list()` page · `listAll()` memory-bound · `for await (... of listIterator())` streamed. Other paginated methods have the same `*All` / `*Iterator` pair, for example `containers.listByProjectIterator`, `snapshots.listIterator` and `projects.listPermissionsIterator`. Iterators are async generators typed with the row type of the list response. The helpers follow the page, offset or cursor parameter the operation takes and start from the one you pass; a walk that cannot finish (the same page twice, a cursor that ends short of the total, more than 1000 pages) throws instead of returning a partial list.

## Streaming

`proxyLogs.stream` and `exec.logs.stream` return `Promise<AsyncIterable<IStreamEvent>>` — iterate them with `for await (const ev of await box.proxyLogs.stream({...}))` or `for await (const ev of await box.exec.logs.stream({ file, follow: true }))`. `watch.events.stream(id, { since_id })` does the same: `for await (const ev of await box.watch.events.stream(id))`. Check each SSE method's return type; one that returns `Promise<ApiResponse<…>>` buffers the whole response and never resolves on a live stream — use the URL with `EventSource`/`fetch`+ReadableStream, or poll a cursor endpoint, for those. WebSocket-wrapper methods (`notifications.connect`, `terminal.sessions.connect`, `curl.jobs.connect`, `watch.events.connect`) expose `await wrapper.connect()` plus per-wrapper typed callbacks: terminal has `onOutput` (Uint8Array); notifications has `onNotification`/`onHeartbeat`; curl has `onJobstarted`/`onJobprogress`/`onJobcompleted`; watch has `onFileEvent`/`onLag`; lifecycle close on every wrapper is `onDisconnect`. Tunnel `tunnelExpose({ url | container, kitAuth?, containerPort, to: { host, port }, takeover? })` (a `token` option is ignored) from `hoody-sdk` (re-exported); `ExposeOptions` accepts either a fully-qualified `url` or a `container`. When `url` is omitted, `container` may be a hostname or an HTTP(S)/WS(S) kit URL. Public DNS names use `wss://`; HTTPS becomes WSS and HTTP becomes WS. Loopback, IP literals and single-label hosts use `ws://`. The helper appends `/api/v1/tunnel/connect` when the path lacks it.

## Type imports

`import type { HoodyClientConfig, ApiError, ApiContainersListResponse } from 'hoody-sdk'` — the root entry re-exports every generated request, response and schema type, type-only. Published namespace subpaths (e.g. `hoody-sdk/api`) work too. Deep-importing `hoody-sdk/generated/types` is blocked by the exports map; alternatively derive types via `Awaited<ReturnType<typeof client.api.containers.list>>`.

## Quirks

- **Login: raw API + `client.api.auth.login(...)` accept either `username` or `email`** + `password` on `POST /api/v1/users/auth/login`. The `HoodyClientConfig.credentials` shorthand and `HoodyClient.login(...)` accept the same choice: `{ username, password }` or `{ email, password }`. An email sent as `username` is rejected (422), so use the `email` field for email addresses.
- **`auth.refresh` sends the refresh token twice for you** — the server requires it in BOTH the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. `client.api.auth.refresh({ refreshToken })` presents that value as the bearer for that one request, whatever token the client holds. The client's automatic 401 recovery uses its stored refresh token first and falls back to `api.auth.login(credentials)` only when that fails, so a client with a refresh token recovers without `credentials` until the refresh token itself expires. For headless flows prefer minting a long-lived `auth.tokens.create`.

---

## Subskill index

- [`agent`](https://hoody.com/SKILLS/SKILL-SDK/agent.md) — In-container AI coding agent over HTTP
- [`api`](https://hoody.com/SKILLS/SKILL-SDK/api.md) — Platform control plane: identity, projects, containers, billing, vault
- [`bot`](https://hoody.com/SKILLS/SKILL-SDK/bot.md) — chat-app control of a container, Telegram first
- [`browser`](https://hoody.com/SKILLS/SKILL-SDK/browser.md) — Per-container Chromium or Firefox instances, one per slot
- [`code`](https://hoody.com/SKILLS/SKILL-SDK/code.md) — VS Code in the browser, per container
- [`cron`](https://hoody.com/SKILLS/SKILL-SDK/cron.md) — managed crontab entries per system user
- [`curl`](https://hoody.com/SKILLS/SKILL-SDK/curl.md) — full HTTP client gateway + REST-as-GET-URL bridge
- [`daemon`](https://hoody.com/SKILLS/SKILL-SDK/daemon.md) — supervisord program lifecycle (start any program; logs kept)
- [`display`](https://hoody.com/SKILLS/SKILL-SDK/display.md) — programmatic GUI desktops with screenshots, input, and windows
- [`egress`](https://hoody.com/SKILLS/SKILL-SDK/egress.md) — the container's outbound HTTP proxy
- [`exec`](https://hoody.com/SKILLS/SKILL-SDK/exec.md) — micro-services: any script or API as an instant HTTP endpoint
- [`files`](https://hoody.com/SKILLS/SKILL-SDK/files.md) — container filesystem over HTTP, with automatic Git-like change history
- [`notes`](https://hoody.com/SKILLS/SKILL-SDK/notes.md) — Collaborative notebooks, hierarchical nodes, documents, databases
- [`notifications`](https://hoody.com/SKILLS/SKILL-SDK/notifications.md) — Trigger and consume desktop notifications inside a container
- [`pipe`](https://hoody.com/SKILLS/SKILL-SDK/pipe.md) — Zero-storage streaming HTTP transfers
- [`proxyLogs`](https://hoody.com/SKILLS/SKILL-SDK/proxyLogs.md) — Per-container request/response/event log query, stats, and SSE tail
- [`run`](https://hoody.com/SKILLS/SKILL-SDK/run.md) — resolve apps to shell commands
- [`sqlite`](https://hoody.com/SKILLS/SKILL-SDK/sqlite.md) — SQLite HTTP API
- [`terminal`](https://hoody.com/SKILLS/SKILL-SDK/terminal.md) — Persistent multiplayer PTY sessions over HTTP and WebSocket
- [`tunnel`](https://hoody.com/SKILLS/SKILL-SDK/tunnel.md) — reverse tunnels for HTTP/WS/TCP via container relay
- [`watch`](https://hoody.com/SKILLS/SKILL-SDK/watch.md) — Linux inotify file-change streams with replay history
