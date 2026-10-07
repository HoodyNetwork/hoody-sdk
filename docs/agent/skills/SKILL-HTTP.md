> _**HTTP skill (basic)** · ~19,497 tokens · hoody-sdk v1.0.0-beta.16_

# HTTP mode — drive Hoody with curl

Drive Hoody with `curl` or any HTTP client. No SDK or CLI.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud containers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A container is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...containers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + container plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.containers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit URL is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service, kept warm by the kit; **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST?** Use `curl` — `GET /api/v1/curl/request?url=…&method=POST` on the curl kit URL turns any REST call into a single GET-able link (the GET surface takes 21 query params (`body` and `body_base64` are aliases of `data` and `data_base64`) — including `data`, `json`, `data_base64` and a repeatable `header`, so bodies AND headers DO work as query params, and supplying a body auto-upgrades the upstream call GET→POST; only multipart `form` uploads stay `POST /api/v1/curl/request`-only). See `curl` namespace.

**Stuck, or unsure how to do something?** Ask Hoody's public docs assistant — an unauthenticated MCP endpoint at `https://chatbot.hoody.com/mcp` (one tool, `search_hoody_docs`; or the `POST /api/chat` SSE fallback) answers any "how do I…" with cited doc URLs. Use it for discovery when you're not sure which namespace fits.

## When to choose HTTP

Use when there's no SDK for your language, you need copy-pasteable recipes (runbooks, CI, webhooks), gluing into an HTTP toolchain, or debugging the wire. Skip for SDK ergonomics (`SKILL-SDK.md`) or `hoody` CLI (`SKILL-CLI.md`). You handle pagination, retries, errors.

## Endpoint surface

| Surface | Hostname | Auth |
|---|---|---|
| Control plane | `https://api.hoody.com` | `Authorization: Bearer <token>` |
| Container kit | `https://{projectId}-{containerId}-{kit_slug}-{serviceIndex}.{server}.containers.hoody.com` | URL is the credential |

See § Proxy URLs and § Auth model below.

## Reference table sigils

Per-namespace `## Reference` tables compress params with sigils:

- `{x}` — path param (already in URL).
- `?x` / `?x*` — query param (`*` = required).
- `body` / `body*` — JSON body (`*` = required); `body*:foo_CreateInput` names the schema.
- `H:x` / `H:x*` — header param.
- Type column dropped — inferable from name (`id` string, `limit` int, `enabled` bool). Body schema refs are kept verbatim.

Bare `body*` rows are spelled out under the same service in a **Body shapes** block: `{ field*: type=default, … }` one-liners (`*` = required, `=v` = default, `|` = alternatives) plus field-semantics bullets. Named refs (`body*:foo_CreateInput`) resolve in the namespace's **Body schemas** appendix.


## Auth

- Control plane: header starts with `Bearer ` (one space, capital B); an `hdy_` auth token may also be sent bare. Kit URL: none, on every kit including `bot`'s management routes — gate kit URLs with proxy permissions.
- Login: `POST /api/v1/users/auth/login` with `{ username, password }` **or** `{ email, password }` — field **`token`**. `password` plus one identifier (`username` or `email`) is required; `username` must match `^[a-zA-Z0-9_-]+$` (3–50 chars), so an email address authenticates **only** through the `email` field — sending one as `username` returns `422 Validation failed`. Every Hoody account is created with an email, so `email` is the common path.
- Long-lived: `POST /api/v1/auth/tokens`.

## Response envelope

Control plane (`api.hoody.com`) success: `{ "statusCode": 200, "message": "...", "data": { ...payload } }`.

Paginated: shape varies per route. The page-based shape is `data.{<resource>: [...], pagination: { total, page, limit, totalPages }}` (e.g. projects, containers); iterate `?page=` until `totalPages`. A few routes (e.g. events) use `{ total, limit, offset, has_more }` instead — check the response type for the call you're making.

`GET /api/v1/auth/available-regions` returns `r.data.regions` (single envelope wrap, like every other API response — earlier docs incorrectly called it doubly-wrapped).

Errors: `{ "statusCode": 401, "error": "...", "message": "..." }`. Codes: § Reference appendix.

Kit URLs use per-kit shapes: many answer bare JSON with no `data` wrapper (e.g. watch `POST /watchers` returns `{id,...}` at the root; tunnel `GET /tunnels` returns `{sessions,...}`). Check the kit's response schema before writing a `jq` path.

## Streaming

- **SSE** — `Accept: text/event-stream`; use `curl --no-buffer`. Resume mechanism is per-endpoint: watcher uses `?since_id=` / `?since_timestamp=`; proxy-logs `/_logs/stream` honours `Last-Event-ID:` (on `event: reset` discard the saved id and reconnect fresh); `exec/logs/stream` has no resume cursor (re-reads the file). Endpoints: watcher events, `exec/logs/stream`, proxy-logs `/_logs/stream`. (Notifications `GET /api/v1/notifications/stream` serves both: a WebSocket upgrade, or SSE on a plain GET with `?displays=all` or a display list; the SDK's `notifications.connect` uses WebSocket.)
- **WebSocket** — watcher `events/ws`, tunnel data planes. Use `websocat`/`wscat`.

## Index of common ops

§ Core ops cheat-sheet covers: auth (signup/login/2FA/refresh/long-lived); projects + containers (list/create/lifecycle, kit-URL resolution); one-off shell and terminal sessions; files up/down/append; display screenshot and click; sqlite db and KV; watch SSE; tunnels; snapshot/restore; vault; wallet; proxy alias.

Per-namespace recipes in `SKILL-HTTP/<ns>.md`: `agent api bot browser code cron curl daemon display egress exec files notes notifications pipe proxyLogs run sqlite terminal tunnel watch`.

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
> - Watch **`proxyLogs`** for unexpected callers; if a URL leaks, disable its alias instantly with `PATCH /api/v1/proxy/aliases/{aliasId}/state` with body `{"enabled":false}`.
> - For untrusted reviewers (customers, support tickets, public demos): do not hand out a `display` kit URL as a "read-only" view — its readonly setting is client-side only, and anyone holding the URL can still call the display's input API (clicks, typing). Build a constrained `exec` script that exposes only the operation they need, such as serving a captured screenshot.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP via `* /api/v1/containers/{id}/proxy/permissions*` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `POST /api/v1/proxy/aliases` with `{ container_id, program: '<kit>' }` to ship a brandable hostname (`https://repo-acme.{N}.containers.hoody.com`) into the iframe instead of leaking the `{containerId}`.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace.
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- Several API kits also serve a browser UI on their kit URL: `cron` (crontab manager) and `watch` at `/`, the `sqlite` studio at `/`, and the `pipe` send / receive / share pages — check a kit's own UI (and its embed views) before building a custom dashboard. `curl` renders no UI, and `http-<port>` shows whatever your app serves.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## Source IP Guard — every call goes through the kit URL

Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. A request that does not come through the program's URL gets 403, from inside the same container too. Call kits through the edge proxy on HTTPS, so the proxy's permissions, logging and hooks apply to every call.

Why uniform proxy routing:

- **Security uniformity** — requests from inside containers go through the same `* /api/v1/containers/{id}/proxy/permissions*` checks and `* /_logs*` capture as external requests, whether they came from across the internet or from a script in the next process. `* /api/v1/containers/{id}/proxy/hooks*` MITM rules apply the same way, but only to services that accept hooks: `logs`, `egress` and `cdp` reject hook operations with `404`. There is no "trusted internal" loophole that leaks to attackers via SSRF.
- **One mental model** — same URL works from your laptop, from another container, from inside the container itself. You write the same code; the proxy is transparent.
- **Cost is negligible** — the proxy hop adds microseconds, not a network round-trip.

Practical consequence: from inside a container, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.containers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this. There is no other way in: the Source IP Guard refuses it.

### Container ↔ container — anyone reaches anyone (with permissions)

Because routing is uniform, **a process in container X can call any kit on container Y just by hitting Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in container X reads / writes files in container Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.containers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three containers, three kit URLs, one transparent network.
- A monitoring container scrapes `/metrics` from every container in a project's fleet by listing them via `GET /api/v1/projects/{id}/containers` and hitting each one's kit URL.

Cross-container access still goes through the gate stack — Y's `* /api/v1/containers/{id}/proxy/permissions*` rules apply to whoever's calling, no matter where they're calling from. So:

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

A group on its own restricts nothing. It grants only the programs you give it access to, and a document the API creates for you starts at `default: 'allow'`, so everyone who matches no group still gets in. A working gate takes three calls: define the group (`set{Password,Token,Jwt,Ip}Group`), give it access to each program it should reach (`setGroupPermission` with `{ program, access: true }`), and set `setDefault` to `{ default: 'deny' }`. Every one of these writes is versioned: send the document's current `file_version` as `If-Match: file:v<N>` (`file:v0` while the document has none). A missing header is refused with `428` and a stale one with `412`. Each call returns the updated document, so take the next call's version from it. The one partial exception: a password group with an access rule for a program answers a caller without credentials with a `401` challenge for that program even under `default: 'allow'`.

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
- `POST /api/v1/proxy/aliases` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. Full valid program set is enumerated in the §Proxy aliases table below — note `logs` for the proxy-logs kit (not `proxy` or `proxyLogs`) and `run` (not `app`).

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

To compose a kit URL by hand, read `project_id`, `id` and `server_name` from `GET /api/v1/containers/{id}` and fill in the patterns above.

## SSH access — shell through the host-side SSH proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `sftp`, `git push` over SSH), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{containerId}-ssh.{node}.containers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). The connection ends at a host-side SSH proxy, not at a server inside the container: the proxy looks up your public key, finds the one container that key is registered to, and runs the shell, SFTP or SCP session in that container through the host. No `sshd` runs in the container. Port forwarding (`ssh -L`, `ssh -R`) is disabled.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `POST /api/v1/projects/{id}/containers` / `PUT /api/v1/containers/{id}` / `POST /api/v1/containers/{id}/copy`. The key is registered with the host-side SSH proxy, not written to an `authorized_keys` file in the container. Password auth is disabled.

**The public key MUST be unique across containers — one container per key**, because the key alone selects the container. Reusing a key that another container already holds returns `409` with a message saying the key is already in use. Generate a fresh keypair per container; you can rotate via `PUT /api/v1/containers/{id}` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; the same shell the kit's `terminal` namespace would give you. Anything inside the container is yours.

### IP filtering

The SSH endpoint is reachable from any IP; the registered key is the access control. SSH sessions reach the container through the host-side proxy and the host, not through the container's network interface, so container firewall rules (`* /api/v1/containers/{id}/firewall/*` ingress rules) and in-container `iptables` / `nftables` rules do not filter them. To cut off a key, replace it with `PUT /api/v1/containers/{id}` (new `ssh_public_key`). For kit URLs, restrict source IPs with `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`.

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

Defaults when port omitted: `http` ⇒ port 80, `https` ⇒ port 443. Port range `1..65535`. Capability-token rules still apply — gate the URL via `* /api/v1/containers/{id}/proxy/permissions*` if you don't want it open.

## Friendly aliases — `<alias>.{N}.containers.hoody.com`

A **proxy alias** is a custom hostname that points at one specific program inside a container, without revealing the `projectId` / `containerId`. Same capability-token semantics — alias URL on its own is the credential — but the URL is shareable, brandable, and hides the container plumbing.

### Why use them

- **Hide `containerId`**: shipping `https://my-api.{N}.containers.hoody.com` is fine; shipping `https://65f1...c8a-65f2...41e-http-8080.{node}.containers.hoody.com` leaks the container identifier (which IS the credential of last resort).
- **Brandable**: short, memorable, copy-pasteable.
- **Stable**: alias survives container rebuilds — repoint at a new container, public URL stays the same.
- **Same gate stack**: layer Password / Token / JWT / IP via `proxy.containerPermissions` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`POST /api/v1/proxy/aliases` with `{ container_id, program, alias?, index?, target_path?, allow_path_override?, expires_at?, enabled? }`

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

- `PATCH /api/v1/proxy/aliases/{aliasId}/state` with `{"enabled":false}` disables the alias instantly without releasing the slot — useful to revoke a leaked URL while you investigate.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409 ALIAS_IN_USE` under either rule: the name is already taken on that physical server (by any tenant), or your account already holds the same name on any server.
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface. Show it in UI as `subserver_name ?? server_name`, but never substitute it into a kit URL.
- **After `POST /api/v1/projects/{id}/containers`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `containerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full container access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — `POST /api/v1/users/auth/login`. Access token lives `1d`, refresh token `7d`, by default; a deployment may shorten either, so treat both as values to read from the response rather than constants. The interactive, short-lived credential.
2. **Auth token** — `POST /api/v1/auth/tokens`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, rotatable. Long-lived headless credential.
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

Separately, `POST /api/v1/containers/{id}/authorize` mints a signed, portable **container claim** — `data: { container_claim: { kid, payload_b64, signature_hex }, expires_in, container_id, project_id }`. It is an *optional* credential for a program **you** run inside a container to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

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

Pass `realm_ids: ['<24-hex>']` when creating the container — and an array of multiple realm IDs is fine if a container needs to be visible in several. Container realm membership is **independent of project realm membership** (a project in realm A can hold a container in realms A+B). Read it back from the `realm_ids` field returned by `GET /api/v1/containers/{id}`.

### Auth tokens × realms

Mint a realm-scoped token via `POST /api/v1/auth/tokens` with `{ realm_ids: ['<id>'] }`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL"). Add / drop realms post-mint with `POST /api/v1/auth/tokens/{id}/add-realm` / `POST /api/v1/auth/tokens/{id}/remove-realm`. Globally-scoped tokens (no `realm_ids`) can still target a specific realm by using the realm subdomain, or the `realm_id` query parameter on the routes that take one.

### Best practice — one realm + one token per project

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `GET /api/v1/realms/`.
2. `POST /api/v1/auth/tokens` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `POST /api/v1/projects/` with `realm_ids: [realm_id]` — pin the project to the realm.
4. `POST /api/v1/projects/{id}/containers` with `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the container too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Send every request to that host with `Authorization: Bearer <token>`.

Result: that token can only see projects, containers, tokens, and vault entries in the realm. An agent given just this token cannot touch your other realms through the API — even if it's the same Hoody account. Kit URLs it already knows stay reachable; they answer to their own gates, not to the token.

## Storing auth tokens

The `hdy_…` token from `POST /api/v1/auth/tokens` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the container. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `PUT /api/v1/vault/keys/{key}` with `{ value: 'hdy_…' }`. Stored server-side as sent — Hoody does not encrypt the value for you — and readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `PUT /api/v1/vault/keys/{key}`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND the `resources.vault` permission granted to it. JWT-as-owner bypasses both. See `PUT /api/v1/vault/keys/{key}` / `GET /api/v1/vault/keys/{key}` / `GET /api/v1/vault/keys` / `DELETE /api/v1/vault/keys/{key}` / `DELETE /api/v1/vault`.

## Token revocation

- `POST /api/v1/users/auth/logout` — for a JWT this is a **logout-everywhere**: every access and refresh token minted before the call stops working, on every device, not just the one that called it. Auth tokens are unaffected.
- `POST /api/v1/users/auth/refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. Nothing adds the header for you: send the same refresh token in the `{"refreshToken":"…"}` body and as `Authorization: Bearer <refreshToken>`. For headless flows prefer minting a long-lived `POST /api/v1/auth/tokens`.
- `DELETE /api/v1/auth/tokens/{id}` / disable / IP-restrict — effective next request.

## 2FA

`POST /api/v1/users/auth/2fa/setup` returns `{ qr_code, manual_entry_key, backup_codes }`; `POST /api/v1/users/auth/2fa/verify-setup` enables. Backup codes rotatable, one-time, hashed. `PUT /api/v1/users/auth/2fa/token-gate` on → sensitive auth-token mutations need TOTP+JWT.

---

# Pre-installed tools — what every container ships with

Every Hoody container starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Containers run real systemd as PID 1 with root inside the container** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides and socket activation work as on a normal distro. Containers share the host kernel, so container root cannot load kernel modules. Two tiers of pre-installed software:

1. **Default tier** — installed when the container's resolved `hoody_kit` setting is true. Left out of `POST /api/v1/projects/{id}/containers`, it is true for a login (JWT) caller; for an auth-token caller it follows the token's `containers.features.hoody_kit` permission, so it is false when the token lacks it. A container with `hoody_kit` false is not guaranteed to have these packages.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 26, Bun, Rust, Go, Nix, Docker, …). Pass it on `POST /api/v1/projects/{id}/containers`; when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `pip install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours.

## `kvm: true` — run full VMs inside the container

Containers on **rented / dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the container. Pass `kvm: true` on `POST /api/v1/projects/{id}/containers`, or toggle it later on a **stopped** container (`PUT /api/v1/containers/{id}/kvm` / `PUT /api/v1/containers/{id}/kvm`). Defaults to off. **Never available on free-tier servers** — the API refuses with `403`. `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every container response carries the current `kvm` boolean.

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

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `POST /api/v1/daemon/programs/add` with `{ name: 'my-app', command: '…', user: 'user' }`, `POST /api/v1/terminal/create` with `{ terminal_id: '100', user: 'user', shell: 'bash', cwd: '/home/user' }` (`terminal_id` is required unless you pass `ephemeral: true`). The generated `GET /{path}` does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For containers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo rm /etc/sudoers.d/user                        # remove the drop-in
sudo passwd user                                   # set a real password
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `* /api/v1/containers/{id}/proxy/permissions*` gates and ideally a non-root default user.

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

Set the flag on `POST /api/v1/projects/{id}/containers` to additionally provision:

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

Installed without credentials.

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

State is per-container: `POST /api/v1/containers/{id}/copy` clones the disk including everything you installed; `POST /api/v1/containers/{id}/snapshots` saves a point-in-time you can later `PUT /api/v1/containers/{id}/snapshots/{name}` to roll back to. There is no global "shared layer" leak — each container's filesystem is its own.

---

# HTTP — Core ops cheat-sheet

Vars (P=projectId, C=containerId, N=`server_name`): `API=https://api.hoody.com/api/v1` (already includes `/api/v1`); `K(k)=https://{P}-{C}-${k}-1.{N}.containers.hoody.com/api/v1/${k}`; `T=K(terminal)`, `F=K(files)`, `D=K(display)`, `S=K(sqlite)`. Watch exception (routes mounted at root, NOT `/api/v1/watch/...`): `W=https://{P}-{C}-watch-1.{N}.containers.hoody.com/watchers`.

All curls assume `-sS`; SSE adds `-N`. Every JSON body needs `-H 'Content-Type: application/json'` (plain `curl -d` sends a form content type, which the API refuses with `415`). API calls need `-H "Authorization: Bearer $TOKEN"` (double quotes, so the shell expands `$TOKEN`); kit URLs (T/F/D/S/W) don't. That includes the `bot` kit's management routes; gate kit URLs with proxy permissions. The commands below spell both headers out.

### 1. Sign up + verify email — 200 on success / 422 on request-schema validation (missing field, bad email, short password) / 400 on other invalid input (e.g. unknown region) / 403 when registration disabled; user=`<local>-<4hex>`
```bash
# password: 12-128 chars, at most 72 UTF-8 bytes, at least 3 of 4 classes (upper/lower/digit/symbol).
# Using all four is safest: the interactive `hoody signup` prompt demands all four.
# Signup + verify-email live under /auth (NOT /users/auth); login + 2FA live under /users/auth.
curl -X POST "$API/auth/signup" -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"<your-password>"}'
curl -X POST "$API/auth/verify-email" -H 'Content-Type: application/json' -d '{"token":"{64-char-token}"}'
```

### 2. Login (+ 2FA branch) — returns `{data:{token,refreshToken,expires_in}}`; 2FA branch returns `{data:{requires_2fa:true,temp_token}}`
```bash
# Body takes EITHER {email,password} OR {username,password}: password AND one identifier are required.
# `username` must match ^[a-zA-Z0-9_-]+$ — an email sent as `username` returns 422.
TOKEN=$(curl -X POST "$API/users/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<your-password>"}' | jq -r '.data.token')
# username form: -d '{"username":"alex","password":"<your-password>"}'
curl -X POST "$API/users/auth/2fa/verify" -H 'Content-Type: application/json' \
  -d '{"temp_token":"{tt}","code":"123456"}'
```

### 3. Refresh — server requires the refresh token in BOTH the body AND a MATCHING `Authorization: Bearer` header; over raw HTTP you send both yourself
```bash
curl -X POST "$API/users/auth/refresh" \
  -H "Authorization: Bearer ${REFRESH_TOKEN}" -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"
```

### 4. Long-lived token (one-shot)
```bash
curl -X POST "$API/auth/tokens" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"alias":"ci"}'
```

### 5. List + create projects — trailing `/`; paginate `?page=2`
```bash
curl "$API/projects/" -H "Authorization: Bearer $TOKEN" | jq '.data.projects[]|{id,alias}'
curl -X POST "$API/projects/" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"alias":"x"}'
```

### 6. List + create containers — `server_id` from `$API/rentals`; `hoody_kit`/`dev_kit` default true with a login token; with an auth token, an omitted `hoody_kit` follows the token's `containers.features.hoody_kit` permission and an omitted `dev_kit` follows `hoody_kit`, so send both explicitly
```bash
curl "$API/projects/{P}/containers" -H "Authorization: Bearer $TOKEN" | jq '.data.containers[]|{id,name,status,server_name}'
curl -X POST "$API/projects/{P}/containers" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"server_id":"{s}","hoody_kit":true,"dev_kit":true}'
```

### 7. Lifecycle — start/stop/force-stop/restart/pause/resume; poll until `running`
```bash
curl -X POST "$API/containers/{C}/start" -H "Authorization: Bearer $TOKEN"
```

### 8. Container details — `{N}`=`server_name`; never `subserver_name`
```bash
curl "$API/containers/{C}" -H "Authorization: Bearer $TOKEN" | jq '.data | {id,status,server_name}'
```

### 9. One-off shell — `?ephemeral=true` on the `terminal-0` host (the host index is authoritative: the proxy overwrites `?terminal_id=` from it, so on `terminal-1` an "ephemeral" call lands in session 1)
```bash
T0=https://{P}-{C}-terminal-0.{N}.containers.hoody.com/api/v1/terminal
curl -X POST "$T0/execute?ephemeral=true" -H 'Content-Type: application/json' -d '{"command":"ls","wait":true}'
```

### 10. Terminal session — later calls for session N go to the host `terminal-N` (`T` is session 1). `/create` reads `terminal_id` only from the JSON body (without it it returns `400 Missing 'terminal_id' field`, unless the body sends `"ephemeral":true`, which allocates an id in 40000-65535), so send the same N in the body
```bash
curl -X POST "$T/create" -H 'Content-Type: application/json' -d '{"terminal_id":"1","shell":"/bin/bash"}'   # T is the terminal-1 host → id "1"
```

### 11. File up/down/append — `FP`=absolute path in the container
```bash
FP=/home/user/n.md
curl -o n.md "$F$FP"                           # GET=download (FP starts with /)
curl -X PUT --data-binary @n.md "$F$FP"        # PUT=upload
curl -X PUT --data-binary 'x' "$F/append$FP"   # PUT=append (the append/ prefix dispatches inside the kit)
```

### 12. Screenshot — `?base64=true`/`?displayId=N`
```bash
curl -o s.png "$D/screenshot"
```

### 13. Click coord — `button` is **numeric** (1=left, 2=middle, 3=right; 4..7 also valid)
```bash
curl -X POST "$D/input/click-at" -H 'Content-Type: application/json' -d '{"x":640,"y":480,"button":1}'
```

### 14. SQLite db — a bare name (resolved under `/hoody/databases`) or an absolute path under `/hoody/databases`; `init_kv=true` adds KV
```bash
curl -X POST "$S/db/create?path=/hoody/databases/app.db&init_kv=true"
```

### 15. SQLite KV — `/` hierarchy; GET `?path=.foo.bar`. KV stores accepted bytes verbatim and returns them as-is on GET (no `{data:...}` envelope). With `Content-Type: application/json`, the body must be valid JSON; invalid JSON returns `400 INVALID_JSON_VALUE`. Send arbitrary text or bytes as `text/plain` or `application/octet-stream`.
```bash
KV="$S/kv/u:42?db=/hoody/databases/app.db"
curl -X PUT "$KV" -H 'Content-Type: application/json' --data-raw '{"name":"A"}'
curl "$KV"   # → {"name":"A"}
```

### 16. Watch+SSE — req `paths`; replay via `?since_id=` or `?since_timestamp=` (the watch SSE endpoint does NOT honour `Last-Event-ID`; only proxy-logs SSE does)
```bash
WID=$(curl -X POST "$W" -H 'Content-Type: application/json' -d '{"paths":["/home/user/src"]}' | jq -r '.id')   # watch answers bare JSON, no {data:...} envelope
curl -N -H 'Accept: text/event-stream' "$W/$WID/events/sse"
```

### 17. List tunnels
```bash
TUN=https://{P}-{C}-tunnel-1.{N}.containers.hoody.com/api/v1/tunnel   # K(tunnel)
curl "$TUN/tunnels" | jq .   # bare JSON {sessions,totalBindings,...}, no envelope
```

### 18. Snapshot/restore — restore rewinds FS, kills procs
```bash
SS=$API/containers/{C}/snapshots
curl -X POST "$SS" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}'   # body required; optional {alias,expiry}
curl -X PUT "$SS/{n}" -H "Authorization: Bearer $TOKEN"
```

### 19. Vault — stores `value` verbatim (the API does not encrypt it; encrypt secrets client-side first); `GET /vault/keys`=metadata; `DELETE /vault` wipes
```bash
V=$API/vault/keys/gh
curl -X PUT "$V" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"value":"<ciphertext or plain value>"}'
curl "$V" -H "Authorization: Bearer $TOKEN" | jq -r .data.value
```

### 20. Wallet — `general`+`ai`; `/wallet/invoices/` returns `200 {statusCode,message,data:{invoices:[],pagination:{...}}}` when empty
```bash
curl "$API/wallet/balances" -H "Authorization: Bearer $TOKEN" | jq .data
curl "$API/wallet/invoices/" -H "Authorization: Bearer $TOKEN" | jq .data
```

### 21. Proxy alias — public URL is `{alias}.{server_name}.containers.hoody.com` (the alias is a subdomain LABEL, not an external host you choose); `program`=kit; `exec` safe for `hoody_kit`
```bash
curl -X POST "$API/proxy/aliases" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"container_id":"{C}","alias":"demo-api","program":"exec"}'   # alias: 3-61 chars, a-z 0-9 -
```

### 22. SQLite SQL — `POST $S/db?db=<name>` runs a transaction; a row-returning statement goes in a `query` item (rows in `results[i].resultSet`), CREATE/INSERT/UPDATE/DELETE in a `statement` item (`results[i].rowsUpdated`; a statement whose SQL produces columns, such as `… RETURNING`, answers `resultSet` instead); placeholder values in `values`; the db must exist or take `create_db_if_missing=true`
```bash
curl -X POST "$S/db?db=app&create_db_if_missing=true" -H 'Content-Type: application/json' -d '{"transaction":[
  {"statement":"CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY, title TEXT)"},
  {"statement":"INSERT INTO items (title) VALUES (?)","values":["Write docs"]},
  {"query":"SELECT id, title FROM items WHERE title = ?","values":["Write docs"]}]}'
# → {"results":[{…}, {"success":true,"rowsUpdated":1},
#    {"success":true,"resultHeaders":["id","title"],"resultSet":[{"id":1,"title":"Write docs"}]}]}   (no envelope)
```

### 23. Cron entries — routes at the ROOT of the cron kit URL (no `/api/v1`); `{user}` is the system user (`user` is the container's login user)
```bash
CR="https://{P}-{C}-cron-1.{N}.containers.hoody.com"
curl "$CR/users/user/entries"                                       # → {user, entries:[{type:"managed",id,schedule,command,enabled,…} | {type:"raw",line}], total, page, limit}
curl -X POST "$CR/users/user/entries" -H 'Content-Type: application/json' -d '{"schedule":"*/5 * * * *","command":"/home/user/bin/sync.sh"}'   # → 201 {id,…}
curl -X PATCH "$CR/users/user/entries/$ID" -H 'Content-Type: application/json' -d '{"enabled":false}'
curl -X DELETE "$CR/users/user/entries/$ID"
curl "$CR/users/user/crontab"                                       # → {user, crontab} (the raw text)
```

---

# HTTP — Reference appendix

## Status codes

| Code | Meaning |
|---|---|
| 200/201 | OK/Created. `{statusCode,message,data}` |
| 400/401 | Bad JSON / missing-or-bad JWT (`Bearer `) |
| 403/404 | Forbidden / missing-or-no-perm |
| 409/412/415 | Conflict / cond-failed / wrong CT |
| 422/428/429 | Field errors / If-Match required / rate-limited |
| 500/503 | Sanitised internal / retriable |

Kit URLs (`*.containers.hoody.com`) use per-kit shapes.

## Error envelope

```json
{"statusCode":422,"error":"Validation Error","message":"Validation failed: /email ...","data":[{"instancePath":"/email","message":"..."}]}
```

Request-schema failures return `422` with `error: "Validation Error"` and the failing fields in `data`. Other refusals use the same shape with their own status, and `error` may carry a machine-readable code instead of the status name.

200-on-missing (don't infer existence): `POST /api/v1/auth/{forgot-password,resend-verification,signup}`.

## Pagination

Control-plane list routes: `?page=N&limit=M`. Shared fallback: `page=1`, `limit=20`. **Use `limit ≤ 100` unless a route documents more.** Each route's own schema caps `limit` and is validated *before* any handler runs, and the common list routes (projects, containers) declare `maximum: 100` — so `limit=200` returns `422 Validation failed: /limit must be <= 100`. Routes also set their own defaults (10/50/100). Ordering is per-route, selected by the `sort_by` / `sort_order` query params — there is no global stable-sort guarantee. **The `sort_order` query param is an enum of exactly `asc` | `desc` (default `desc`) on all 11 routes that expose it — spelling it `descending` returns `422 Validation failed: /sort_order must be equal to one of the allowed values`.** `sort_by` is a per-route enum, so read the route's own parameter list for its allowed fields. These page-based routes have no cursor: iterate until `page > totalPages`. Kit APIs differ — e.g. notes lists take `?cursor=` and return `nextCursor`/`hasMore`, some routes use `offset`/`has_more`; follow each route's own schema.

```json
{"data":{"projects":[],"pagination":{"total":451,"page":1,"limit":100,"totalPages":5}}}   /* `projects` / `containers` / route-specific resource key (NOT a literal `<r>`) */
```

## SSE

WHATWG `field: value` + blank line. `id:` is per-endpoint: watch and proxy-logs send monotonic ids for resuming (proxy-logs also sends some id-less frames), pipe progress sends none. `:keepalive` interval is per-kit — observed: watch SSE 10s, pipe 15s, proxy-logs 15s — ignore the heartbeat lines. Reconnect mechanism is per-endpoint: `Last-Event-ID` header (proxy-logs — a server restart drops the stream; reconnecting with the saved id answers `event: gap` (`{after, resumedFrom}`) when the retained history no longer reaches it, so treat a `gap` as lost events. An `event: reset` you do receive means discard the saved id and reconnect fresh. It also sends `event: scope-destroyed` when the container is destroyed, after which the stream closes); `?since_id=` / `?since_timestamp=` (watch — emits `lag` on id gaps). Curl: `--no-buffer -N`.

**WebSocket** — `GET /api/v1/notifications/stream` is a WebSocket (`wss://...-n-1.{N}.containers.hoody.com/api/v1/notifications/stream`; kit slug is `n-{serviceIndex}`, not `notifications-`), 15s heartbeat, NOT SSE.

## Rate limits

Only `/auth/login` and `/auth/device/login` count failures alone — a successful sign-in does not consume budget; every other limiter (including `/auth/refresh`) counts every request. 429 responses set `Retry-After`. The numbers below are **defaults a deployment may raise or lower per route**, so read `Retry-After` rather than assuming them.

| Endpoint | Cap/Win |
|---|---|
| `/users/auth/login` | 1000f/30m |
| `/users/auth/refresh` | 30/30m |
| `/auth/signup` | 5/1h |
| `/auth/verify-email` | 10/1h |
| `/auth/reset-password` | 10/1h |
| `/auth/resend-verification`, `/forgot-password` | 3/1h |
| `/users/me/retry-setup` | 1/1m |

## Curl idioms

```bash
curl -sS --max-time 600 -X POST -H "Authorization: Bearer $T" \
  -H 'Content-Type: application/json' -d '{"k":"v"}' "$URL"  # std
curl -sS --no-buffer -N "$URL"             # SSE
curl -sS -o out.bin "$URL"                 # binary
curl -sS --data-binary @body.json "$URL"   # file body
```

---

## Subskill index

- [`agent`](https://hoody.com/SKILLS/SKILL-HTTP/agent.md) — In-container AI coding agent over HTTP
- [`api`](https://hoody.com/SKILLS/SKILL-HTTP/api.md) — Platform control plane: identity, projects, containers, billing, vault
- [`bot`](https://hoody.com/SKILLS/SKILL-HTTP/bot.md) — chat-app control of a container, Telegram first
- [`browser`](https://hoody.com/SKILLS/SKILL-HTTP/browser.md) — Per-container Chromium or Firefox instances, one per slot
- [`code`](https://hoody.com/SKILLS/SKILL-HTTP/code.md) — VS Code in the browser, per container
- [`cron`](https://hoody.com/SKILLS/SKILL-HTTP/cron.md) — managed crontab entries per system user
- [`curl`](https://hoody.com/SKILLS/SKILL-HTTP/curl.md) — full HTTP client gateway + REST-as-GET-URL bridge
- [`daemon`](https://hoody.com/SKILLS/SKILL-HTTP/daemon.md) — supervisord program lifecycle (start any program; logs kept)
- [`display`](https://hoody.com/SKILLS/SKILL-HTTP/display.md) — programmatic GUI desktops with screenshots, input, and windows
- [`egress`](https://hoody.com/SKILLS/SKILL-HTTP/egress.md) — the container's outbound HTTP proxy
- [`exec`](https://hoody.com/SKILLS/SKILL-HTTP/exec.md) — micro-services: any script or API as an instant HTTP endpoint
- [`files`](https://hoody.com/SKILLS/SKILL-HTTP/files.md) — container filesystem over HTTP, with automatic Git-like change history
- [`notes`](https://hoody.com/SKILLS/SKILL-HTTP/notes.md) — Collaborative notebooks, hierarchical nodes, documents, databases
- [`notifications`](https://hoody.com/SKILLS/SKILL-HTTP/notifications.md) — Trigger and consume desktop notifications inside a container
- [`pipe`](https://hoody.com/SKILLS/SKILL-HTTP/pipe.md) — Zero-storage streaming HTTP transfers
- [`proxyLogs`](https://hoody.com/SKILLS/SKILL-HTTP/proxyLogs.md) — Per-container request/response/event log query, stats, and SSE tail
- [`run`](https://hoody.com/SKILLS/SKILL-HTTP/run.md) — resolve apps to shell commands
- [`sqlite`](https://hoody.com/SKILLS/SKILL-HTTP/sqlite.md) — SQLite HTTP API
- [`terminal`](https://hoody.com/SKILLS/SKILL-HTTP/terminal.md) — Persistent multiplayer PTY sessions over HTTP and WebSocket
- [`tunnel`](https://hoody.com/SKILLS/SKILL-HTTP/tunnel.md) — reverse tunnels for HTTP/WS/TCP via container relay
- [`watch`](https://hoody.com/SKILLS/SKILL-HTTP/watch.md) — Linux inotify file-change streams with replay history
