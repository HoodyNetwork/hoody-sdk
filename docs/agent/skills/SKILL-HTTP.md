> _**HTTP skill (basic)** · ~15,795 tokens · hoody-sdk v1.0.0-beta.12_

# HTTP mode — drive Hoody with curl

Drive Hoody with `curl` or any HTTP client. No SDK or CLI.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud containers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A container is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...containers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + container plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.containers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit URL is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service, kept warm by the kit; **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST?** Use `curl` — `GET /api/v1/curl/request?url=…&method=POST` on the curl kit URL turns any REST call into a single GET-able link (the GET surface takes 19 query params — including `data`, `json`, `data_base64` and a repeatable `header`, so bodies AND headers DO work as query params, and supplying a body auto-upgrades the upstream call GET→POST; only multipart `form` uploads stay `POST /api/v1/curl/request`-only). See `curl` namespace.

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

- Control plane: header starts with `Bearer ` (one space, capital B). Kit URL: none.
- Login: `POST /api/v1/users/auth/login` with `{ username, password }` — field **`token`**.
- Long-lived: `POST /api/v1/auth/tokens`.

## Response envelope

Success: `{ "statusCode": 200, "message": "...", "data": { ...payload } }`.

Paginated: shape varies per route. The page-based shape is `data.{<resource>: [...], pagination: { total, page, limit, totalPages }}` (e.g. projects, containers); iterate `?page=` until `totalPages`. A few routes (e.g. events) use `{ total, limit, offset, has_more }` instead — check the response type for the call you're making.

`GET /api/v1/auth/available-regions` returns `r.data.regions` (single envelope wrap, like every other API response — earlier docs incorrectly called it doubly-wrapped).

Errors: `{ "statusCode": 401, "error": "...", "message": "..." }`. Codes: § Reference appendix.

## Streaming

- **SSE** — `Accept: text/event-stream`; use `curl --no-buffer`. Resume mechanism is per-endpoint: watcher uses `?since_id=` / `?since_timestamp=`; proxy-logs `/_logs/stream` honours `Last-Event-ID:`; `exec/logs/stream` has no resume cursor (re-reads the file). Endpoints: watcher events, `exec/logs/stream`, proxy-logs `/_logs/stream`. (Notifications uses WebSocket, not SSE.)
- **WebSocket** — watcher `events/ws`, tunnel data planes. Use `websocat`/`wscat`.

## Index of common ops

§ Core ops cheat-sheet covers: auth (signup/login/2FA/refresh/long-lived); projects + containers (list/create/start, kit-URL resolution); exec, terminal; files r/w/append; browser screenshot; display click-at; sqlite KV; watch SSE; tunnels; snapshot/restore; vault; wallet.

Per-namespace recipes in `SKILL-HTTP/<ns>.md`: `agent api browser code cron curl daemon display exec files notes notifications pipe proxyLogs run sqlite terminal tunnel watch`.

---

# Proxy URLs — capability-based per-container routing

## What it is

`https://{projectId}-{containerId}-{kit_slug}-{n}.{node}.containers.hoody.com`

- Proxy terminates TLS on `*.containers.hoody.com`, parses segments, routes.
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
| Suffix | `.containers.hoody.com` (or the configured containers domain derived from the API base URL — Hoody accepts `.com` / `.run` / `.icu` / `.lat` siblings). |

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
> - Layer **`proxyPermissionsContainer.set{Password,Token,Jwt,Ip}Group`** so a recipient still has to authenticate.
> - Use a **dedicated demo container with no secrets** — wallet credentials, vault data, source code only what they need to see.
> - Set an **`expires_at`** on the alias for auto-expiry.
> - Watch **`proxyLogs`** for unexpected callers; revoke via `PATCH /api/v1/proxy/aliases/{id}/state` instantly if leaked.
> - For untrusted reviewers (customers, support tickets, public demos): prefer a **read-only `display`** embed of a screenshot stream over a live terminal, or build a constrained `exec` script that exposes only the operation they need.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP via `* /api/v1/containers/{id}/proxy/permissions*` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `POST /api/v1/proxy/aliases` to ship a brandable hostname (`https://repo-acme.{N}.containers.hoody.com`) into the iframe instead of leaking the `{containerId}`.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace.
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- API kits (`sqlite`, `cron`, `watch`, `curl`, `pipe`, `http-<port>`, …) don't render a UI but you can still iframe them for status-page widgets, long-poll dashboards, etc.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## No local bypass — every call goes through Hoody Proxy

There is **no raw localhost-port bypass** to a kit. Even from inside the same container, every call to a kit service goes through the Hoody Proxy on HTTPS — the kit binds to an internal interface that requires the proxy's authenticated, capability-checked, hook-instrumented path. An agent script trying to bypass via `http://127.0.0.1:<kit_port>` will not reach the kit. For in-container self-calls, use the supported proxy-local shorthand `https://localhost.containers.hoody.com/<service-segment>` (resolves to the local kit via the proxy with the same auth path) or the full `{projectId}-{containerId}-…` kit URL.

Why uniform proxy routing:

- **Security uniformity** — the same `* /api/v1/containers/{id}/proxy/permissions*` gates, `* /api/v1/containers/{id}/proxy/hooks*` MITM rules, and `proxyLogs.*` capture apply to every request, whether it came from across the internet or from a script in the next process. No "trusted internal" loophole that leaks to attackers via SSRF.
- **One mental model** — same URL works from your laptop, from another container, from inside the container itself. You write the same code; the proxy is transparent.
- **Cost is negligible** — when source and kit are co-located on the same physical machine, the proxy hop adds microseconds (Unix socket / loopback under the hood), not a network round-trip.

Practical consequence: from inside a container, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.containers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this. Don't try to discover and target the kit's internal port — it is firewalled and won't accept the connection.

### Container ↔ container — anyone reaches anyone (with permissions)

Because routing is uniform, **a process in container X can call any kit on container Y just by hitting Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in container X reads / writes files in container Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.containers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three containers, three kit URLs, one transparent network.
- A monitoring container scrapes `/metrics` from every container in a project's fleet by listing them via `GET /api/v1/projects/{id}/containers` and hitting each one's kit URL.

Cross-container access still goes through the gate stack — Y's `* /api/v1/containers/{id}/proxy/permissions*` rules apply to whoever's calling, no matter where they're calling from. So:

- **By default** (no gates set), Y's URL is a capability — anyone with the URL has access. Within your account that's usually fine; for production / shared / multi-tenant fleets you SHOULD gate.
- **With gates set**, X must satisfy them — typically `setTokenGroup` with an auth-token whose `realm_ids` include Y's realm, or a JWT issued for Y's surface. Mint the token in X via `POST /api/v1/auth/tokens` (with realm-scope), inject it as `Authorization: Bearer …` on the call to Y.

This is why "no local bypass" matters: if same-container calls were a backdoor, an attacker who pwned X could quietly read Y's data with no gate checked. Routing everything through the proxy means **every** container-to-container call sees the **same** auth + audit machinery as every external call.

## Capability-token semantics — open by default, permission for production

**The URL itself is the credential.** A well-formed kit URL routes without any `Authorization` header — anyone who knows the full URL has the same access as the owner. `containerId` is the secret. Container-internal IDs (session, tab, notebook, terminal_id, displayId) follow the same "knowing the ID = having access" model.

**This is intentional for development**: spawn a container, share the URL, collaborator reaches it instantly. **It is NOT acceptable for production exposure** — leaked URL = leaked container. Treat any production deployment as "must have a gate".

### When to gate

- Anything reachable from a public network or shared with a third party.
- Anything that handles secrets, customer data, payments, or user PII.
- Anything where a leaked URL would be hard to rotate (long-lived background jobs, public dashboards, customer-facing demos).

### How to gate

Configure under `proxyPermissionsContainer` (per-container) or `proxyPermissionsProject` (whole project — applies to every container in the project) on the control plane. Multiple gates compose with AND — all must pass.

| Gate | Accessor | Caller behavior |
|---|---|---|
| Password | `setPasswordGroup` | Browser / `curl -u user:pass` — HTTP Basic. |
| Token | `setTokenGroup` | `Authorization: Bearer <token>`. |
| JWT | `setJwtGroup` | Verifies issuer / audience signed JWT. |
| IP | `setIpGroup` | Source IP must match a CIDR. |

Toggle the whole gate stack on/off via `updateState` without dropping the configured groups (handy for break-glass debugging).

Defense in depth: gate the kit URL AND scope any auth-token bearer (realms, IP allowlist) AND keep a short TTL on JWTs. A leaked auth-token is recoverable; a leaked-and-public kit URL is not.

## Kit slug table — every namespace's public URL

Throughout: `{P}` = `projectId` (24-hex), `{C}` = `containerId` (24-hex), `{N}` = `server_name` (e.g. `node-example-1`). All URLs route through `*.containers.hoody.com`.

| Namespace | Kit slug | Public URL (single-instance form) |
|---|---|---|
| `agent` | `agent-{index}` | `https://{P}-{C}-agent-1.{N}.containers.hoody.com` — the in-container AI agent HTTP gateway (`hoody-agent-d`): sessions/prompt, models, skills, memory, todos, workflows, hooks, github, tools, logs |
| `api` | — (control plane) | `https://api.hoody.com` (global, not per-container) |
| `run` | `run-1` | `https://{P}-{C}-run-1.{N}.containers.hoody.com` |
| `browser` | `browser-1` | `https://{P}-{C}-browser-1.{N}.containers.hoody.com` |
| `code` | `code-1` (multi-instance) | `https://{P}-{C}-code-1.{N}.containers.hoody.com` (also `-code-2`, `-code-3`, …) |
| `cron` | `cron-1` | `https://{P}-{C}-cron-1.{N}.containers.hoody.com` |
| `curl` | `curl-1` | `https://{P}-{C}-curl-1.{N}.containers.hoody.com` |
| `daemon` | `daemon-1` | `https://{P}-{C}-daemon-1.{N}.containers.hoody.com` |
| `display` | `display-<N>` (multi) | `https://{P}-{C}-display-1.{N}.containers.hoody.com` (`display-1`, `-2`, …) |
| (no SDK namespace — registered program) | `desktop-<N>` | `https://{P}-{C}-desktop-1.{N}.containers.hoody.com?desktop_env=xfce` — opens a full XFCE/MATE desktop in the browser (see § Desktop alias) |
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
| Files API | `https://65f1...c8a-65f2...41e-files-1.node-example-1.containers.hoody.com/api/v1/files/workspace/main.py` |
| Exec script `render.ts` (flat) | `https://65f1...c8a-65f2...41e-exec-1.node-example-1.containers.hoody.com/render` (path; a `scripts/render/` dir would also serve at `render.…-exec-1.…`) |
| SQLite kit | `https://65f1...c8a-65f2...41e-sqlite-1.node-example-1.containers.hoody.com/api/v1/sqlite/db/...` |
| Display 1 (X11 / Xpra) | `https://65f1...c8a-65f2...41e-display-1.node-example-1.containers.hoody.com/` |
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
- `terminal` packs the terminal **instance** index into the slug (`terminal-3` = instance 3). That is separate from `?terminal_id=`, which selects the **session** on the kit's own routes (`/execute`, `/paste`, `/press`, `/raw`) and is still required there.
- `display`/`terminal` index pairs by default: a session with `terminal_id=N` runs `DISPLAY=:N`, reachable at the matching `display-N` kit URL. Override by setting `DISPLAY` explicitly in the session env.
- `exec` serves each script at a **path** on the exec host: a file `hello.js` is reachable at `https://{P}-{C}-exec-1.{N}.containers.hoody.com/hello` (extension stripped, lower-cased). A script placed under a subdirectory `scripts/{sub}/` is ALSO reachable at the `{sub}.` **subdomain** (`{sub}.{P}-{C}-exec-1.{N}…`) — the subdomain maps to that directory, NOT to a flat top-level filename.
- `notifications` ↔ `display-{n}`: the notification kit pairs with display N at slug `n-N`.
- `POST /api/v1/proxy/aliases` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. Full valid program set is enumerated in the §Proxy aliases table below — note `proxy` (not `proxyLogs`) and `run` (not `app`).

## Desktop alias — `desktop-<N>` (full XFCE / MATE desktop in a browser tab)

Open `https://{P}-{C}-desktop-1.{N}.containers.hoody.com` and you land on a complete Linux desktop session — no SDK call, no extra kit, no installation step. There is **no generated REST operation for this surface** (it has no namespace), but SDK helpers (`getKitUrl('desktop', container, N)`) and CLI helpers can compose or open the URL — the URL itself is the whole interface.

### How it works

`desktop-<N>` is a thin alias on top of `terminal` + `display`:

1. The proxy rewrites the request to the `terminal` kit with forced query args `desktop=true`, `redirect=display`, `terminal_id=<offset>+N`, `display=<offset>+N`.
2. The terminal kit spawns the chosen desktop environment under that virtual display.
3. As soon as Xpra is up, the browser is `302`'d to the matching `display-<offset>+N` kit URL.

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

### SDK helpers

The SDK ships builder methods so you don't compose URLs by hand: `client.getKitUrl(slug, container, idx?)` for one kit, `client.getKitUrls(container)` for the full `{terminal, browser, code, …, desktop, exec, files, …}` record. For desktop with a DE override, use the dedicated helper `client.getDesktopUrl(container, { desktopEnv: 'mate', serviceIndex: 1 })` (default DE is xfce; `getDesktopEnvironments()` lists known values). Or compose by hand with `client.getKitUrl('desktop', container, 1)` and append `?desktop_env=mate`. CLI / HTTP consumers compose the URLs from `GET /api/v1/containers/{id}` (`projectId`, `id`, `server_name`) using the patterns above.

## SSH access — direct shell, no proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `git push` over SSH, port-forward `-L`/`-R`), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{containerId}-ssh.{node}.containers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). This URL routes to TCP `22` on the container.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `POST /api/v1/projects/{id}/containers` / `PUT /api/v1/containers/{id}` / `POST /api/v1/containers/{id}/copy` — that becomes the container's `authorized_keys` (root). Password auth is disabled.

**The public key MUST be unique across containers — one container per key.** Reusing a key returns `409` ("This SSH public key is already in use. SSH public keys must be unique per container."). Generate a fresh keypair per container; you can rotate via `PUT /api/v1/containers/{id}` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; the same shell the kit's `terminal` namespace would give you. Anything inside the container is yours.

### IP filtering

By default the SSH endpoint is reachable from any IP (URL is the credential, plus the keypair check). To restrict source IPs:

- **Control plane** — `POST /api/v1/containers/{id}/firewall/ingress` on TCP `22` with `source` CIDR list. Surface is per-container and reflects in `GET /api/v1/containers/{id}/firewall/rules`.
- **In-container** — `iptables` / `nftables` rules baked into the image, runtime-installed by your provisioning, or wired to a `daemon` program. Useful when you want a baseline allow-list independent of Hoody's firewall surface.

Either layer applies to SSH only; it does NOT gate kit URLs (those go through the proxy on a different IP path). For kit URLs, use `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` instead.

### When SSH vs kit URLs

| Need | Use |
|---|---|
| Anywhere-reachable HTTP, logged, gated | Kit URL (`terminal`, `files`, `exec`, `display`, `http-<port>` …) |
| `git clone <ssh url>` / `rsync` / `scp` | SSH |
| Port-forward an internal-only service back to your laptop | SSH (`-L 8080:localhost:8080`) |
| Heavily-firewalled box that must not expose any web surface | SSH only; close all kit URLs via gates |
| Drive a TUI from REST | `terminal` namespace (proxy-logged) |
| Drive an X11 GUI from REST | `display` kit + `terminal` for spawn (proxy-logged) |
| Audit-trail of every command run | Kit URL (`terminal`) — proxy logs each request |

## User-hosted services — `http-<port>` / `https-<port>`

**Anything you bind on a container port is automatically reachable from the public URL.** No alias, no firewall edit, no proxy registration. Use one of two slugs:

| Slug form | Inner protocol | Edge URL |
|---|---|---|
| `http-<port>` | proxy speaks **HTTP** to `localhost:<port>` inside the container | `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` |
| `https-<port>` | proxy speaks **HTTPS** to `localhost:<port>` (target must terminate TLS) | `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` |

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
- **Same gate stack**: layer Password / Token / JWT / IP via `proxyPermissionsContainer` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`POST /api/v1/proxy/aliases`

| Field | Notes |
|---|---|
| `container_id` | 24-char hex id of the target container — required. |
| `alias` | 3-61 chars, lowercase alphanumeric **plus hyphens** (`a-z0-9-`, no leading/trailing hyphen). Becomes `<alias>.{N}.containers.hoody.com`. Globally unique per server. |
| `program` | Which kit/protocol to route to. Server validates against `container-programs.json`. Valid names: `http`, `https`, `agent`, `browser`, `cdp`, `cli`, `code`, `cron`, `curl`, `daemon`, `desktop`, `display`, `exec`, `files`, `notes`, `notifications`, `pipe`, `proxy`, `run`, `sqlite`, `ssh`, `terminal`, `tunnel`, `watch`, `workspaces` — plus every declared alias of those. Note `proxy` (NOT `proxyLogs`) and `run` (NOT `app`). **`'web'` is rejected — for `hoody_kit` runners use `program: 'exec'`**. |
| `index` | Optional; defaults to `1`. Set explicitly for multi-instance programs: port for `http`/`https`, `terminal_id` for `terminal`, display number for `display`. |
| `target_path` | Optional path appended to inner request (`/api/v1` or `/index.php?debug=1`). |
| `allow_path_override` | Defaults to `true`. If `true`, callers can append path segments after the alias hostname; if `false`, only `target_path` is reachable. |
| `expires_at` | Auto-disable timestamp — ISO 8601 string, Unix seconds, or Unix milliseconds (auto-detected when value > 1e12). Must be in the future. |
| `enabled` | Toggle without deleting (keeps alias slot reserved). |

### Practical examples

Each row below shows the create-call fields and the resulting public URL. Issue the call via your mode's surface (see Reference table for the exact command/endpoint).

| Goal | `program` | `index` | `target_path` | `allow_path_override` | Public URL |
|---|---|---|---|---|---|
| HTTP API on container port 8080 | `http` | `8080` | — | `true` | `https://myapi.{N}.containers.hoody.com/v1/users` |
| Pin a single hoody-exec script (`/render` only) | `exec` | — | `/render` | `false` | `https://tileapi.{N}.containers.hoody.com` |
| Pipe rendezvous as drop-zone hostname | `pipe` | — | `/jobs/pending` | `false` | `https://upload.{N}.containers.hoody.com` |
| Reverse tunnel public URL with auto-expiry | `tunnel` | — | — | — | `https://demo.{N}.containers.hoody.com` (expires `2026-06-01`) |
| GUI display 1 wrapped in a brandable host | `display` | `1` | — | `true` | `https://gui.{N}.containers.hoody.com` |
| Read-only HTTPS upstream (target self-terminates TLS) | `https` | `8443` | — | `true` | `https://secureapi.{N}.containers.hoody.com` |

### Gating an alias

Aliases inherit the container's gate stack — set `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` (etc.) on the underlying container and the alias URL becomes password-gated too. There is no per-alias-only gate; gating is at the container/project level.

### Operational notes

- `PATCH /api/v1/proxy/aliases/{id}/state` disables the alias instantly without releasing the slot — useful to revoke a leaked URL while you investigate.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409`: same alias name on the same physical server, uniqueness enforced across all users and slices (not per-user).
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface — show it in UI as `subserver_name ?? server_name` but never substitute it into a kit URL.
- **After `POST /api/v1/projects/{id}/containers`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `containerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full container access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — `POST /api/v1/users/auth/login`. TTL `1d`/`7d` (defaults; configurable via `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`). Sole credential for admin+impersonation.
2. **Auth token** — `POST /api/v1/auth/tokens`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, rotatable. Long-lived headless credential.
3. **Kit URL** — `https://{projectId}-{containerId}-{kit_slug}-{serviceIndex}.{server}.containers.hoody.com` is the bearer for that kit. See § Proxy URLs.

## Header rule — `Authorization: Bearer <token>`

`Bearer <token>` (one space, case-sensitive) else `401`. JWT vs auth-token by `startsWith(tokenPrefix)`; each rejects the other.

## What each credential can do

- **Admin — JWT only.** `requireAdmin` rejects auth tokens regardless of `is_admin`.
- **Impersonation — JWT + `is_admin` only.** On an auth-token `x-impersonate-user` is **silently ignored** (the whole impersonation block is gated on `!isAuthToken`); the `403` fires only for a non-admin JWT.
- **Auth-token guards.** IP allowlist, expiry, enable/disable.
- **Basic.** `user:pass`, `user:authToken`, `authToken:pass`. If both sides parse as tokens (token:token), the username side is tried first then the password side falls through; no impersonation.
- **Container surfaces — no admin tier**; claim or kit URL = full access.

## Vault — double gate

`/vault/*` auth-token needs BOTH `vault_access===true` AND `hasPermission(token,'resources.vault')` else `403`. JWT owner passes; no cross-user override.

## Login

- `username` OR `email` + `password`.
- Response: `data.token` (not `accessToken`), `POST /api/v1/users/auth/refresh`, `expires_in`.
- 2FA: returns `requires_2fa`, `temp_token` (5-min); exchange at `POST /api/v1/users/auth/2fa/verify`.
- Email signup → username `<localpart>-<4hex>`.

## Kit URLs as credentials

Bearer by default. Layer gates (AND) via `proxyPermissionsContainer`/`proxyPermissionsProject` `.set{Password,Token,Jwt,Ip}Group`, toggled by `updateState`. See § Proxy URLs.

### Container claim — optional portable credential

Every built-in kit — **including `agent`** — accepts the bare per-container kit URL (the URL is the bearer). There is **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` handshake and no `401 CLAIM_REQUIRED` on the built-in kits; the `agent` kit behaves exactly like the others here.

Separately, `POST /api/v1/containers/:id/authorize` (SDK: `POST /api/v1/containers/{id}/authorize`; CLI: `hoody containers authorize <cid>`) mints a signed, portable **container claim** — `data: { container_claim: { kid, payload_b64, signature_hex }, expires_in, container_id, project_id }`. It is an *optional* credential for a program **you** run inside a container to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

## Realms — workspace isolation

A **realm** is a 24-hex-id namespace inside your account that walls off projects, containers, tokens, and vault entries. Two realms can hold same-named projects without colliding; an auth token scoped to realm A literally cannot see realm B — `404` on every realm-B id. Treat each substantial project as its own realm: an agent (or human) operating with a realm-scoped token can never accidentally drop a container, wipe a vault key, or run a script in someone else's workspace.

### Why realms

- **Blast-radius cap** — leaked or buggy token erases at most one realm's worth of state.
- **Mistake-proof multi-project work** — the token can only see the realm whose subdomain it's invoked from; a `containers.delete <wrong-id>` becomes a `404` instead of a destructive op.
- **Clean separation** — billing, vault, snapshots, and proxy-aliases are all realm-scoped.
- **Cheap to spin up** — realms are free; create one per project rather than reusing.

### Realm-scoped URL

`https://{realmId}.api.hoody.com` — same control-plane API, but every operation that takes an id resolves only against that realm. Off-realm ids return `404` (or `403` for cross-realm-only operations like `POST /api/v1/containers/{id}/copy`/`sync`). Operations targeting a specific realm without the subdomain accept `?realm_id=<id>` instead.

### How to attach a container to a realm

Pass `realm_ids: ['<24-hex>']` when creating the container — and an array of multiple realm IDs is fine if a container needs to be visible in several. Container realm membership is **independent of project realm membership** (a project in realm A can hold a container in realms A+B). Read it back from `containers.get(...).realm_ids`.

### Auth tokens × realms

Mint a realm-scoped token via `POST /api/v1/auth/tokens`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL"). Add / drop realms post-mint with `POST /api/v1/auth/tokens/{id}/add-realm` / `POST /api/v1/auth/tokens/{id}/remove-realm`. Globally-scoped tokens (no `realm_ids`) can still target a specific realm by using the realm subdomain or `?realm_id=`.

### Best practice — one realm + one token per project

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `GET /api/v1/realms/`.
2. `POST /api/v1/auth/tokens` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `POST /api/v1/projects/` with `realm_ids: [realm_id]` — pin the project to the realm.
4. `POST /api/v1/projects/{id}/containers` with `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the container too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Set the token in `HOODY_TOKEN` and the realm in `HOODY_REALM` (or use the `--realm` flag) so every call goes to the right scope.

Result: that token can only see projects, containers, tokens, and vault entries in the realm. An agent given just this token cannot accidentally touch your other realms — even if it's the same Hoody account.

## Storing auth tokens

The `hdy_…` token from `POST /api/v1/auth/tokens` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the container. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `PUT /api/v1/vault/keys/{key}`. Encrypted at rest server-side; readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `PUT /api/v1/vault/keys/{key}`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND `hasPermission(token, 'resources.vault')`. JWT-as-owner bypasses both. See `PUT /api/v1/vault/keys/{key}` / `GET /api/v1/vault/keys/{key}` / `GET /api/v1/vault/keys` / `DELETE /api/v1/vault/keys/{key}` / `DELETE /api/v1/vault`.

## Token revocation

- `POST /api/v1/users/auth/logout` — for a JWT this is a **logout-everywhere**: it bumps `session_generation`, revoking every access and refresh token minted before the call. Auth tokens are unaffected.
- `POST /api/v1/users/auth/refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. **No client injects it for you** — the generated SDK sends the body only, and the CLI sets `skipAuth` (stripping `Authorization` entirely), so SDK, CLI and raw `fetch`/`curl` callers must all set the header themselves. For headless flows prefer minting a long-lived `POST /api/v1/auth/tokens`.
- `DELETE /api/v1/auth/tokens/{id}` / disable / IP-restrict — effective next request.

## 2FA

`POST /api/v1/users/auth/2fa/setup` returns `{ qr_code, manual_entry_key, backup_codes }`; `POST /api/v1/users/auth/2fa/verify-setup` enables. Backup codes rotatable, one-time, hashed. `PUT /api/v1/users/auth/2fa/token-gate` on → sensitive auth-token mutations need TOTP+JWT.

---

# Pre-installed tools — what every container ships with

Every Hoody container starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Containers run real systemd as PID 1 with full root, just like a VM** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides, socket activation, kernel modules, and every other distro affordance Just Work. Two tiers of pre-installed software:

1. **Default tier** — installed on every container, no flag needed.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 24, Bun, Rust, Go, Nix, Docker, …). Pass on `POST /api/v1/projects/{id}/containers` (or `--dev-kit` flag); when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `pip install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours.

## `kvm: true` — run full VMs inside the container

Containers on **rented / dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the container. Pass `kvm: true` on `POST /api/v1/projects/{id}/containers` (`--kvm` flag), or toggle it later on a **stopped** container (`PUT /api/v1/containers/{id}/kvm`). Defaults to off. **Never available on free-tier servers** — the API refuses with `403`. `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every container response carries the current `kvm` boolean.

## `hoody` CLI is pre-installed inside every container

The `hoody` binary is on every container's `$PATH` for every user (root, `user`, dynamic uids, even from a cron job's environment). You can call it from a shell session, an `exec` script, a `daemon` program, a cron entry, an SSH session — anywhere. No install step, no extra package.

Inside the container, `$HOODY_CONTAINER_ID` is pre-populated by the kit (the CLI also accepts `$HOODY_CONTAINER` as a compatibility alias) so commands targeting "this container" can skip the `--container` flag. `$HOODY_TOKEN` is NOT auto-injected — set it via vault/secrets if container code needs to call the API. Login state is per-user under `~/.hoody/config.json`.

This is the same binary as `hoody` outside the container — every example in the CLI skill works inside a container's shell exactly as it would on a developer laptop.

## Default user — `user` (uid 1000) with passwordless sudo

Containers ship with a **non-root account named `user`** (uid 1000, gid 1000, member of `sudo`). Home is `/home/user`. **`/etc/sudoers.d/user` grants `user ALL=(ALL) NOPASSWD: ALL`** — passwordless `sudo` lets agents (and humans) escalate to root for any operation without prompting. Live-verified.

**Use `user` for everyday work, sudo when you actually need root.** Reasons:

- Files created under `user` are owned by uid 1000 — friendlier when you copy/sync them out of the container or back-stop with rsync.
- Many apps (npm, pip in venvs, Bun, Cargo, Go, Nix single-user, Docker rootless, browsers) write into `$HOME` and behave better when `$HOME` is a real user home, not `/root`.
- `journalctl --user`, `systemctl --user`, dbus user buses all hang off a regular user.

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `POST /api/v1/daemon/programs/add`, `POST /api/v1/terminal/create`. The generated `GET /{path}` does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For containers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo rm /etc/sudoers.d/user                        # remove the drop-in
sudo passwd user                                   # set a real password
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `* /api/v1/containers/{id}/proxy/permissions*` gates and ideally a non-root default user.

## Default tier — always present

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

### Build toolchain (always)
`build-essential`, `gcc`, `g++`, `make`, `cmake`, `autoconf`, `automake`, `pkg-config`, `bison`, `flex`, `libtool`, `gettext`.

### Python (always — for scripts)
`python3` (system), `python3-dev`, `python3-pip`, `python3-setuptools`, plus dev bindings for cairo / GTK / dbus / cryptography / Pillow / paramiko / netifaces.

### System dev libs (headers, for compiling against)
`libssl-dev`, `libffi-dev`, `libcairo2-dev`, `libgtk-3-dev`, `libglib2.0-dev`, `libpango1.0-dev`, `libncurses-dev`, X11 dev libs (`libx11-dev`, `libxrandr-dev`, `libxext-dev`, `libxtst-dev`, …), OpenGL (`libgl1-mesa-dev`), media codecs (`libjpeg`, `libpng`, `libwebp`, `libavcodec`, `libx264`, `libvpx`, `libaom`), GStreamer.

## `dev_kit: true` tier — comprehensive coding setup

Set the flag on `POST /api/v1/projects/{id}/containers` to additionally provision:

### JavaScript / TypeScript
- **Node.js 24** (system-wide via NodeSource — not nvm).
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
with the SDK `syncAgentConfig()` helper (see SDK core-ops § "Sync agent config")
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

State is per-container: `POST /api/v1/containers/{id}/copy` clones the disk including everything you installed; `snapshots.create` saves a point-in-time you can later `snapshots.restore` to roll back to. There is no global "shared layer" leak — each container's filesystem is its own.

---

# HTTP — Core ops cheat-sheet

Vars (P=projectId, C=containerId, N=`server_name`): `A=https://api.hoody.com/api/v1`; `K(k)=https://{P}-{C}-${k}-1.{N}.containers.hoody.com/api/v1/${k}`; `H=-H "Authorization: Bearer ${TOKEN}"`, `J=-H 'Content-Type: application/json'`; `T=K(terminal)`, `F=K(files)`, `D=K(display)`, `S=K(sqlite)`. Watch exception (routes mounted at root, NOT `/api/v1/watch/...`): `W=https://{P}-{C}-watch-1.{N}.containers.hoody.com/watchers`.

All curls assume `-sS`; SSE adds `-N`. JSON bodies imply `-H 'Content-Type: application/json'` ($J). API calls require `-H 'Authorization: Bearer $TOKEN'` ($H); kit URLs (T/F/D/S/W) don't.

### 1. Sign up + verify email — 200 on success / 400 on validation / 403 when registration disabled; user=`<local>-<4hex>`
```bash
# password must be 12-128 chars with at least 3 of 4 classes (upper/lower/digit/symbol).
# Signup + verify-email live under /auth (NOT /users/auth); login + 2FA live under /users/auth.
curl -X POST $A/auth/signup -d '{"email":"you@example.com","password":"<your-password>"}'
curl -X POST $A/auth/verify-email -d '{"token":"{64-char-token}"}'
```

### 2. Login (+ 2FA branch) — returns `{data:{token,refreshToken,expires_in}}`; 2FA branch returns `{data:{requires_2fa:true,temp_token}}`
```bash
TOKEN=$(curl -X POST $A/users/auth/login \
  -d '{"username":"alex","password":"<your-password>"}' | jq -r '.data.token')
curl -X POST $A/users/auth/2fa/verify \
  -d '{"temp_token":"{tt}","code":"123456"}'
```

### 3. Refresh — server requires the refresh token in BOTH the body AND a MATCHING `Authorization: Bearer` header; no SDK/CLI injects it for you
```bash
curl -X POST $A/users/auth/refresh \
  -H "Authorization: Bearer ${REFRESH_TOKEN}" \
  -d "{\"refreshToken\":\"${REFRESH_TOKEN}\"}"
```

### 4. Long-lived token (one-shot)
```bash
curl -X POST $A/auth/tokens -d '{"alias":"ci"}'
```

### 5. List + create projects — trailing `/`; paginate `?page=2`
```bash
curl $A/projects/ | jq '.data.projects[]|{id,alias}'
curl -X POST $A/projects/ -d '{"alias":"x"}'
```

### 6. List + create containers — `server_id` from `$A/rentals`; defaults = 19 kits+runtimes
```bash
curl $A/projects/{P}/containers | jq '.data.containers[]|{id,name,status,server_name}'
curl -X POST $A/projects/{P}/containers \
  -d '{"server_id":"{s}","hoody_kit":true,"dev_kit":true}'
```

### 7. Lifecycle — start/stop/force-stop/restart/pause/resume; poll until `running`
```bash
curl -X POST $A/containers/{C}/start
```

### 8. Container details — `{N}`=`server_name`; never `subserver_name`
```bash
curl $A/containers/{C} | jq '{id,status,server_name}'
```

### 9. One-off shell — `?ephemeral=true`
```bash
curl -X POST "$T/execute?ephemeral=true" -d '{"command":"ls","wait":true}'
```

### 10. Terminal session — id for `/execute,/paste,/press,/raw`
```bash
curl -X POST "$T/create" -d '{"shell":"/bin/bash"}'
```

### 11. File up/down/append — `P`=absolute path
```bash
curl -o n.md "$F$P"                           # GET=download (P starts with /)
curl -X PUT --data-binary @n.md "$F$P"        # PUT=upload
curl -X PUT --data-binary 'x' "$F/append$P"   # PUT=append (the append/ prefix dispatches inside the kit)
```

### 12. Screenshot — `?base64=true`/`?displayId=N`
```bash
curl -o s.png "$D/screenshot"
```

### 13. Click coord — `button` is **numeric** (1=left, 2=middle, 3=right; 4..7 also valid)
```bash
curl -X POST "$D/input/click-at" -d '{"x":640,"y":480,"button":1}'
```

### 14. SQLite db — absolute path; `init_kv=true` adds KV
```bash
curl -X POST "$S/db/create?path=/data/app.db&init_kv=true"
```

### 15. SQLite KV — `/` hierarchy; GET `?path=.foo.bar`. The kit stores the raw request body bytes verbatim and returns them as-is on GET (no `{data:...}` envelope). Pick any content-type / encoding you like; the kit is opaque.
```bash
KV="$S/kv/u:42?db=/data/app.db"
curl -X PUT "$KV" -H 'Content-Type: application/json' --data-raw '{"name":"A"}'
curl "$KV"   # → {"name":"A"}
```

### 16. Watch+SSE — req `paths`; replay via `?since_id=` or `?since_timestamp=` (the watch SSE endpoint does NOT honour `Last-Event-ID`; only proxy-logs SSE does)
```bash
WID=$(curl -X POST "$W" -d '{"paths":["/home/user/src"]}' | jq -r '.data.id')
curl -N -H 'Accept: text/event-stream' "$W/$WID/events/sse"
```

### 17. List tunnels
```bash
curl "$(K tunnel)/tunnels" | jq .data   # K(tunnel) already ends in /api/v1/tunnel
```

### 18. Snapshot/restore — restore rewinds FS, kills procs
```bash
SS=$A/containers/{C}/snapshots
curl -X POST $SS
curl -X PUT $SS/{n}
```

### 19. Vault — E2E; `GET /vault/keys`=metadata; `DELETE /vault` wipes
```bash
V=$A/vault/keys/gh
curl -X PUT $V -d '{"value":"ghp_xxxx"}'
curl $V | jq -r .data.value
```

### 20. Wallet — `general`+`ai`; `/wallet/invoices/` returns `200 {statusCode,message,data:{invoices:[],pagination:{...}}}` when empty
```bash
curl $A/wallet/balances | jq .data
curl $A/wallet/invoices/ | jq .data
```

### 21. Proxy alias — public URL is `{alias}.{server_name}.containers.hoody.com` (the alias is a subdomain LABEL, not an external host you choose); `program`=kit; `exec` safe for `hoody_kit`
```bash
curl -X POST $A/proxy/aliases \
  -d '{"container_id":"{C}","alias":"a","program":"exec"}'
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
{"statusCode":400,"error":"Bad Request","message":"...","data":[{"instancePath":"/email","message":"..."}]}
```

200-on-missing (don't infer existence): `POST /api/v1/auth/{forgot-password,resend-verification,signup}`.

## Pagination

`?page=N&limit=M`. Shared fallback: `page=1`, `limit=20`, hard cap `limit ≤ 200`. Many routes set their own per-route default (10/50/100, e.g. project schemas, container routes). Ordering is per-route via `[[sortBy, sortOrder]]` — there is no global stable-sort guarantee. No cursor. Iterate until `page > totalPages`.

```json
{"data":{"projects":[],"pagination":{"total":451,"page":1,"limit":100,"totalPages":5}}}   /* `projects` / `containers` / route-specific resource key (NOT a literal `<r>`) */
```

## SSE

WHATWG `field: value` + blank line. `id:` monotonic. `:keepalive` interval is per-kit — observed: watch SSE 10s, pipe 15s, proxy-logs 30s — ignore the heartbeat lines. Reconnect mechanism is per-endpoint: `Last-Event-ID` header (proxy-logs — emits `event: epoch_mismatch` on Last-Event-ID epoch mismatch, `event: scope_changed` on workspace rebind); `?since_id=` / `?since_timestamp=` (watch — emits `lag` on id gaps). Curl: `--no-buffer -N`.

**WebSocket** — `GET /api/v1/notifications/stream` is a WebSocket (`wss://...-n-1.{N}.containers.hoody.com/api/v1/notifications/stream`; kit slug is `n-{serviceIndex}`, not `notifications-`), 15s heartbeat, NOT SSE.

## Rate limits

Only `/auth/login` uses `skipSuccessfulRequests` (failures-only); all other limiters (including `/auth/refresh`) count every request. 429 responses set `Retry-After`. The defaults below are **env-overridable per route** (see `LOGIN_RATE_LIMIT_MAX`, `RATE_LIMIT_MAX_MULTIPLIER`, etc.).

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
- [`browser`](https://hoody.com/SKILLS/SKILL-HTTP/browser.md) — Per-container Chromium/Firefox via Playwright/Patchright
- [`code`](https://hoody.com/SKILLS/SKILL-HTTP/code.md) — VS Code in the browser, per container
- [`cron`](https://hoody.com/SKILLS/SKILL-HTTP/cron.md) — managed crontab entries per system user
- [`curl`](https://hoody.com/SKILLS/SKILL-HTTP/curl.md) — full HTTP client gateway + REST-as-GET-URL bridge
- [`daemon`](https://hoody.com/SKILLS/SKILL-HTTP/daemon.md) — supervisord program lifecycle (start any program; logs always retained)
- [`display`](https://hoody.com/SKILLS/SKILL-HTTP/display.md) — programmatic GUI desktops with screenshots, input, and windows
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
