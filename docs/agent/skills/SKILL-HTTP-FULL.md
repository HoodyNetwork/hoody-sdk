> _**HTTP skill (FULL — basic + all 19 namespaces)** · ~210,085 tokens · hoody-sdk v1.0.0-beta.11_

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

Throughout: `{P}` = `projectId` (24-hex), `{C}` = `containerId` (24-hex), `{N}` = `server_name` (e.g. `code-sg-sin-1`). All URLs route through `*.containers.hoody.com`.

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

For project `65f1...c8a`, container `65f2...41e`, server `code-sg-sin-1`:

| Surface | URL |
|---|---|
| Files API | `https://65f1...c8a-65f2...41e-files-1.code-sg-sin-1.containers.hoody.com/api/v1/files/workspace/main.py` |
| Exec script `render.ts` (flat) | `https://65f1...c8a-65f2...41e-exec-1.code-sg-sin-1.containers.hoody.com/render` (path; a `scripts/render/` dir would also serve at `render.…-exec-1.…`) |
| SQLite kit | `https://65f1...c8a-65f2...41e-sqlite-1.code-sg-sin-1.containers.hoody.com/api/v1/sqlite/db/...` |
| Display 1 (X11 / Xpra) | `https://65f1...c8a-65f2...41e-display-1.code-sg-sin-1.containers.hoody.com/` |
| **Full XFCE desktop** | `https://65f1...c8a-65f2...41e-desktop-1.code-sg-sin-1.containers.hoody.com/` |
| Same, but MATE | `https://65f1...c8a-65f2...41e-desktop-1.code-sg-sin-1.containers.hoody.com/?desktop_env=mate` |
| Terminal session 3 | `https://65f1...c8a-65f2...41e-terminal-3.code-sg-sin-1.containers.hoody.com/api/v1/terminal/...` |
| Proxy logs | `https://65f1...c8a-65f2...41e-logs-1.code-sg-sin-1.containers.hoody.com/` |
| Watch (file-events) | `https://65f1...c8a-65f2...41e-watch-1.code-sg-sin-1.containers.hoody.com/watchers/...` |
| Coding agent HTTP API | `https://65f1...c8a-65f2...41e-agent-1.code-sg-sin-1.containers.hoody.com/api/v1/agent/...` |
| Hoody Agent GUI (for humans) | `https://65f1...c8a-65f2...41e-agent-1.code-sg-sin-1.containers.hoody.com/` |
| User HTTP server on `:8080` | `https://65f1...c8a-65f2...41e-http-8080.code-sg-sin-1.containers.hoody.com/` |

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
https://65f1...c8a-65f2...41e-http-8080.code-sg-sin-1.containers.hoody.com

# Service that already terminates TLS on :8443
https://65f1...c8a-65f2...41e-https-8443.code-sg-sin-1.containers.hoody.com

# WebSockets just work (use `wss://`)
wss://65f1...c8a-65f2...41e-http-3000.code-sg-sin-1.containers.hoody.com/ws
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
curl -X POST $A/auth/signup -d '{"email":"you@example.com","password":"Hoody-Pass-12!"}'
curl -X POST $A/auth/verify-email -d '{"token":"{64-char-token}"}'
```

### 2. Login (+ 2FA branch) — returns `{data:{token,refreshToken,expires_in}}`; 2FA branch returns `{data:{requires_2fa:true,temp_token}}`
```bash
TOKEN=$(curl -X POST $A/users/auth/login \
  -d '{"username":"alex","password":"hunter2-Yz"}' | jq -r '.data.token')
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


---

<!-- ===== namespace: agent ===== -->

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `hoody-agent-d` HTTP gateway exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. 22 services — `sessions`, `agents`, `models`, `skills`, `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `system`, `loops`, `logs`, `tasks`, `statistics`, `jobs`, `discovery`, `headless`, `todos`, plus `hoody` (token bootstrap) and a namespace-root `GET /api/v1/agent/logs/export`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `POST /api/v1/agent/sessions` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `POST /api/v1/agent/sessions/{id}/prompt:sync` for one blocking call → resolve gates with `POST /api/v1/agent/sessions/{id}/confirm` / `POST /api/v1/agent/sessions/{id}/answer` → `POST /api/v1/agent/sessions/{id}/cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`GET /api/v1/agent/models` / `GET /api/v1/agent/models/{spec}`) and `GET /api/v1/agent/providers` (configure providers via `PUT /api/v1/agent/providers/{id}/auth/default` / `PUT /api/v1/agent/providers/{id}/auth/api-key` / `POST /api/v1/agent/providers/{id}/auth/oauth`); switch a session's active model with `PATCH /api/v1/agent/sessions/{id}/model`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `agents` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`GET /api/v1/agent/tools` / `GET /api/v1/agent/tools/read-only` / `GET /api/v1/agent/tools/{name}`, and `POST /api/v1/agent/tools/{name}/run` (blocks, returns the result) / `POST /api/v1/agent/tools/{name}/runAsync` (returns `{ job_id }`, poll `jobs`) / `POST /api/v1/agent/tools/{name}/stream` (one-shot result over SSE frames — not a per-token stream) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`GET /api/v1/agent/sessions/{id}/tools` for a session's *effective* tool set, `GET /api/v1/agent/sessions/{id}/tools/mcp`, and `POST /api/v1/agent/sessions/{id}/tools/{name}/run`). Unlike the sessionless `POST /api/v1/agent/tools/{name}/run`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; its mutating-tool posture comes from the live session's gate chain (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `POST /api/v1/agent/headless/runs` for a fire-and-forget agent invocation that returns a job; poll `GET /api/v1/agent/jobs/{id}` / `GET /api/v1/agent/jobs/{id}/result`.
- **GitHub from inside the agent** — first establish an account with `POST /api/v1/agent/github/auth/login` (omit the body for a GitHub device flow → poll `POST /api/v1/agent/github/auth/login/poll`; or pass a `token` PAT to persist it directly), then `GET /api/v1/agent/github/auth/status` to confirm; once an account is active, `POST /api/v1/agent/github/clone` / `POST /api/v1/agent/github/commit` (and `GET /api/v1/agent/github/status` / `GET /api/v1/agent/github/branches` / `GET /api/v1/agent/github/repos` / `POST /api/v1/agent/github/pr` / `POST /api/v1/agent/github/sync`) for repo operations the agent performs in-container.

## When NOT to use

- Want the interactive TUI, not the API? Run the bare `hoody agent` launcher (`cli/agent-command.ts`) — it opens the in-container Agent TUI over the terminal-kit WebSocket; this namespace is the HTTP control surface beside it.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (containers, billing, realms) → `api`.

## Prerequisites

- Container with the `agent` kit running (`hoody-agent-d` gateway); capability URL.
- At least one model provider configured (`GET /api/v1/agent/providers` / `GET /api/v1/agent/models` to confirm one is usable) before prompting.
- A session id from `POST /api/v1/agent/sessions` for every prompt/gate/cancel call.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Prompt a session and stream the turn

`POST /api/v1/agent/sessions` (returns a session id) → stream the turn with `{ text }` to receive live events (tool calls, gates, output deltas) — see the streaming note under Quirks for the supported per-surface method (SDK helper / HTTP SSE route / CLI command) → resolve any gate as it arrives → turn ends.

### 2. One-shot synchronous prompt

`POST /api/v1/agent/sessions` → `POST /api/v1/agent/sessions/{id}/prompt:sync` with `{ text }` — blocks until the turn finishes and returns the result in one call. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `POST /api/v1/agent/sessions/{id}/confirm`; an open question → `POST /api/v1/agent/sessions/{id}/answer` (to get a helper model to DRAFT an answer for a parked question call `POST /api/v1/agent/sessions/{id}/answer:assist` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `GET /api/v1/agent/jobs/{id}/result` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `POST /api/v1/agent/sessions/{id}/answer`; for unattended runs arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes`)). Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). Interrupt a running turn with `POST /api/v1/agent/sessions/{id}/cancel`. Tear the session down: `POST /api/v1/agent/sessions/{id}/close` removes it from the live map; `DELETE /api/v1/agent/sessions/{id}` drops the live connection but keeps the persisted record (re-attach via `POST /api/v1/agent/sessions`), while a *hard* delete (set the `hard` flag — SDK `DELETE /api/v1/agent/sessions/{id}`, HTTP `?hard=true`, CLI `--hard`) also erases the persisted record. To roll a session back without tearing it down, `POST /api/v1/agent/sessions/{id}/trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`GET /api/v1/agent/providers` to see configured providers, `GET /api/v1/agent/models` to list available models, then `PATCH /api/v1/agent/sessions/{id}/model` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec) and a successful switch PERSISTS into the chat agent's frontmatter (a global repin for future sessions of that agent). PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit `POST /api/v1/agent/sessions` (or this live `PATCH /api/v1/agent/sessions/{id}/model`) OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (`POST /api/v1/agent/sessions` with attach or backend:"acp" is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `PATCH /api/v1/agent/sessions/{id}/effort` (`{ effort }` — `low|medium|high|xhigh`, or `""` for the model default), `PATCH /api/v1/agent/sessions/{id}/verbosity` (`{ level }` — `normal|concise|terse|minimal`), `PATCH /api/v1/agent/sessions/{id}/hoody-env` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }` — bind a named profile from `agents`).

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `GET /api/v1/agent/skills` (each carries an enabled + trust state), `POST /api/v1/agent/skills/hub/install` / `GET /api/v1/agent/skills/hub/search` / `GET /api/v1/agent/skills/hub/preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `POST /api/v1/agent/skills/trust` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `POST /api/v1/agent/skills/toggle` only enables/disables by `name` (set the `disabled` flag). Like the J-class todo ops, both `POST /api/v1/agent/skills/trust` (which grants arbitrary code-execution trust) and `POST /api/v1/agent/skills/hub/install` (which writes arbitrary skill code to disk) have NO human-confirmation gate over this namespace — that denial lives only on the model-facing skill-edit tool path, and the HTTP edge has no app-level admin gate, so an autonomous API caller can silently trust and install skill code; gate these in your own caller.
- **Memory** — `POST /api/v1/agent/memory/search` for hybrid recall (BM25 + vector + graph) and `GET /api/v1/agent/memory/items` to enumerate by `project`; `POST /api/v1/agent/memory/items` / `PATCH /api/v1/agent/memory/items/{id}` / `DELETE /api/v1/agent/memory/items` to write; `GET /api/v1/agent/memory/graph` for the relation graph (or `GET /api/v1/agent/memory/items/{id}` to read one record by `id`). `PUT /api/v1/agent/memory/enabled` (`{ enabled }`) is the memory capture/privacy switch — it persists `features.memory` and flips the live store — and `POST /api/v1/agent/memory/flush` forces the store's durability barrier; both are not admin-gated. Memory is project-scoped (pass `project`); the reads (`POST /api/v1/agent/memory/search` / `GET /api/v1/agent/memory/items` / `GET /api/v1/agent/memory/graph` / `GET /api/v1/agent/memory/projects`) and `POST /api/v1/agent/memory/consolidate` are active-realm-only (a realm header is rejected), while the writes (`POST /api/v1/agent/memory/items` / `PATCH /api/v1/agent/memory/items/{id}` / `DELETE /api/v1/agent/memory/items`) carry no such restriction. `POST /api/v1/agent/memory/search` / `GET /api/v1/agent/memory/graph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `GET /api/v1/agent/todos` / `POST /api/v1/agent/todos` to file; then `POST /api/v1/agent/todos/triage` (LLM inbox pass), `POST /api/v1/agent/todos/{id}/claim` / `POST /api/v1/agent/todos/{id}/release`, `POST /api/v1/agent/todos/{id}/run` (dispatch a background orchestrator — returns `{job_id, session_id}`), `POST /api/v1/agent/todos/{id}/cancel-run` to abort an in-flight run, and `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `POST /api/v1/agent/todos/{id}/run` (a J-class autonomous run that spends model budget), while `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` spawns nothing — plus `POST /api/v1/agent/todos/{id}/snooze` / `POST /api/v1/agent/todos/{id}/archive`. To advance a todo through its lifecycle (inbox→active→done) or edit its fields, `PATCH /api/v1/agent/todos/{id}` applies a CAS-guarded patch / `state` transition — read the todo's OWN `revision` with `GET /api/v1/agent/todos/{id}` and pass it back (`GET /api/v1/agent/todos/revision` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `POST /api/v1/agent/todos/{id}/archive` is not terminal — `POST /api/v1/agent/todos/purge` permanently and irreversibly destroys all archived todos (no confirmation gate; treat as destructive). Mind the comment split: `POST /api/v1/agent/todos/{id}/messages` (`/messages`, plural) only appends a comment, whereas `POST /api/v1/agent/todos/{id}/message` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. Note `POST /api/v1/agent/todos/{id}/run` / `POST /api/v1/agent/todos/triage` / `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `GET /api/v1/agent/workflows` / `GET /api/v1/agent/workflows/{name}` / `PUT /api/v1/agent/workflows/{name}` / `DELETE /api/v1/agent/workflows/{name}` / `POST /api/v1/agent/workflows/{name}/hide` manage saved definitions; `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `GET /api/v1/agent/jobs/{id}` until its `run_id` populates (null during the brief dispatch window), then track via `GET /api/v1/agent/workflows/runs` / `GET /api/v1/agent/workflows/runs/{run_id}` and stop with `POST /api/v1/agent/workflows/runs/{run_id}/cancel`; feed a running workflow with `POST /api/v1/agent/sessions/{id}/workflow/messages` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Agent profiles** — `GET /api/v1/agent/agents` to enumerate named profiles; `POST /api/v1/agent/agents` / `POST /api/v1/agent/agents/{name}/copy` / `POST /api/v1/agent/agents/{name}/rename` / `DELETE /api/v1/agent/agents/{name}`; `GET /api/v1/agent/agents/{name}/source` → edit → `PUT /api/v1/agent/agents/{name}/source` (pass `base_gen` from the read for conflict detection); `PATCH /api/v1/agent/agents/{name}/model` / `PATCH /api/v1/agent/agents/{name}/tools` / `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` / `PATCH /api/v1/agent/agents/{name}/turns` / `POST /api/v1/agent/agents/{name}/reset-to-shipped`. To make a session use a profile, `PATCH /api/v1/agent/sessions/{id}/agent` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `DELETE /api/v1/agent/agents/{name}` refuses a shipped-default profile or the configured default chat agent (`is_error:true` — use `POST /api/v1/agent/agents/{name}/reset-to-shipped` or `PUT /api/v1/agent/agents/{name}/source` instead), and `POST /api/v1/agent/agents/{name}/reset-to-shipped` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `POST /api/v1/agent/sessions/{id}/messages` with `{ text }` dispatches a turn and returns `{ job_id }` immediately (HTTP 202) without streaming or blocking; watch completion via `agent_done` on `GET /api/v1/agent/sessions/{id}/stream`. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `GET /api/v1/agent/sessions/{id}/stream` attaches (WebSocket primary, SSE fallback) to a live session's full `event.*` stream; pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). `GET /api/v1/agent/sessions/{id}/replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring; for a non-live session there is nothing to replay — attach via `GET /api/v1/agent/sessions/{id}/stream` to receive the daemon's `event.replay` instead).
- **Recurring prompts (loops)** — `POST /api/v1/agent/sessions/{id}/loops` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `GET /api/v1/agent/sessions/{id}/loops` / `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` (pause via `{ paused: true }`) / `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` to manage, `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` to fire one immediately. Loops are entirely session-scoped.

### 7. Headless one-shot run

`POST /api/v1/agent/headless/runs` for a non-interactive invocation that returns a job handle; poll `GET /api/v1/agent/jobs/{id}` and fetch the output with `GET /api/v1/agent/jobs/{id}/result`.

### 8. Configure MCP servers for a session

Reads first: `GET /api/v1/agent/mcp/servers` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `POST /api/v1/agent/mcp/write-intents` (`{ session_id, op, scope }`, op ∈ `upsert`|`delete`|`set_enabled`|`import`, scope ∈ `user` (default)|`project`|`local`) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/import`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `POST /api/v1/agent/mcp/parse` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `POST /api/v1/agent/mcp/import` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `POST /api/v1/agent/mcp/servers/enable`. After editing a settings file by hand, or to recover a server that died, `POST /api/v1/agent/mcp/reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `POST /api/v1/agent/mcp/probe` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **hand-written TUI launcher** (`cli/agent-command.ts`), distinct from this generated HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface.
- Source of truth is the `hoody-agent-d` gateway's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit URL is itself the credential; no HTTP bearer header is required.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`); resolve it via `getKitUrl('agent', container)` rather than hand-building.
- `POST /api/v1/agent/sessions/{id}/prompt:sync` blocks until the turn finishes (or returns `{pending_gate}` the moment a turn parks on a confirm/question) — long un-parked agent turns can still exceed default HTTP client timeouts; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (The `prompt:stream` route emits **SSE** — `Content-Type: text/event-stream` — so POST it and read the event stream directly.)For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy on `POST /api/v1/agent/sessions/{id}/prompt:stream` / `POST /api/v1/agent/sessions/{id}/prompt:sync` to auto-approve confirm gates for the life of the turn (off by default) — HTTP: `?policy=auto_approve` (or the `X-Hoody-Gate-Policy: auto_approve` header); SDK: `policy: 'auto_approve'` in the prompt options; the generated CLI: `--policy auto_approve`. Note this only answers **confirm** gates, never questions. - Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `POST /api/v1/agent/sessions` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/disable-all` — plus `POST /api/v1/agent/hooks/begin-write`, and the side-effecting `POST /api/v1/agent/hooks/test` / `POST /api/v1/agent/hooks/trust/ack`, all require a live `session_id` — `POST /api/v1/agent/hooks/trust/ack` clears the per-session hook-trust prompt (the execution-trust probe `GET /api/v1/agent/hooks` reports), the gate that must be acknowledged before any hook command is allowed to fire, mirroring `POST /api/v1/agent/skills/trust` for skills; `POST /api/v1/agent/hooks/reload` accepts one only to also return the reloaded summary) AND nonce-guarded: call `POST /api/v1/agent/hooks/begin-write` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled) to mint a single-use nonce, then pass that `nonce` on the matching `PUT /api/v1/agent/hooks` / `DELETE /api/v1/agent/hooks` / `POST /api/v1/agent/hooks/toggle` / `POST /api/v1/agent/hooks/disable-all` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `PUT /api/v1/agent/hooks` persists a command that fires on lifecycle events and `POST /api/v1/agent/hooks/test` executes one immediately. The human-only confirmation gate lives only on the model-facing tool path, not on these RPCs, and the gateway HTTP edge has no app-level admin gate — the same access that authorizes any agent-kit call authorizes these too, with nothing extra, so gating this surface is the caller's/proxy's responsibility.
- **Credential VALUES are never returned by the MCP surface.** `GET /api/v1/agent/mcp/servers` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. To change a secret you must supply its real value; to leave one alone, omit the field — `PUT /api/v1/agent/mcp/servers` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `POST /api/v1/agent/mcp/servers/enable` flips only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.

## Common errors

- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `POST /api/v1/agent/sessions/{id}/confirm` for a confirm, `POST /api/v1/agent/sessions/{id}/answer` for a question. For unattended runs, arm `PATCH /api/v1/agent/sessions/{id}/auto-reply` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only auto-approves **confirm** gates, never questions; a parked question still stalls until `POST /api/v1/agent/sessions/{id}/answer` (or the auto-reply loop) answers it.
- `GET /api/v1/agent/sessions/{id}/tasks` and `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` do NOT return data inline — they ask a *live* session to emit its background-subagent snapshot/transcript onto the session's WebSocket/SSE stream (`event.tasks_snapshot` for the snapshot, `event.task_transcript` for the transcript) and return only a JSON ack; you must already be attached via `GET /api/v1/agent/sessions/{id}/stream` to receive the payload. `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` / `POST /api/v1/agent/sessions/{id}/tasks/cancel` stop background tasks mid-turn (server-layer; tasks survive `POST /api/v1/agent/sessions/{id}/cancel` but are not restartable).
- `POST /api/v1/agent/memory/consolidate` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — the gateway server-stamps a machine marker and the daemon's non-bypassable gate returns `403 human_only` for every HTTP/SDK/CLI call; it can only be triggered from an interactive human session. Do not call it programmatically.
- `POST /api/v1/agent/mcp/probe` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `POST /api/v1/agent/mcp/parse` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `PUT /api/v1/agent/mcp/servers` / `DELETE /api/v1/agent/mcp/servers` / `POST /api/v1/agent/mcp/servers/enable` / `POST /api/v1/agent/mcp/import` each require a fresh single-use `nonce` from `POST /api/v1/agent/mcp/write-intents` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `POST /api/v1/agent/mcp/write-intents` or `GET /api/v1/agent/mcp/servers`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `DELETE /api/v1/agent/workflows/{name}` only removes **user** workflows — built-in/**system** workflows are refused (`is_error:true`) and re-seed on every boot; `POST /api/v1/agent/workflows/{name}/hide` is the only way to remove a system workflow from view.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `PATCH /api/v1/agent/agents/{name}/model` with `model: ""` removes the model line (falls back to the default model), and `PATCH /api/v1/agent/agents/{name}/tools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn — check `GET /api/v1/agent/providers` returns a ready provider before you prompt (blocking or streamed).
- Calling prompt/gate/cancel against a session whose live connection was torn down (`POST /api/v1/agent/sessions/{id}/close`, or `DELETE /api/v1/agent/sessions/{id}` without `hard`) returns not-found — re-attach with `POST /api/v1/agent/sessions` if the record survives, or start fresh with `POST /api/v1/agent/sessions`. After a *hard* `DELETE /api/v1/agent/sessions/{id}` (the `hard` flag set) the record is gone and only a fresh `POST /api/v1/agent/sessions` works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Reference

### `agent` (1) — General agent operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/logs/export` | Export logs as a downloadable file. | `?source` `?min_level` `?comp` `?session_id` `?text` `?since` `?until` `?event` `?tool` `?model` `?status` `?method` `?min_status` `?max_status` `?errors_only` `?event_type` `?resource_type` `?container` `?kind` `?host` `?since_seq` `?limit` `?format` `?filename` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `source` — Log source to export (see logsSources; one local source, one platform source, or omitted for all local sources).
- `min_level` — Minimum log level (debug\|info\|warn\|error).
- `comp` — Component filter (daemon source).
- `session_id` — Session id filter.
- `text` — Case-insensitive substring filter over message+attrs.
- `since` — Lower time bound (RFC3339 or relative like 1h/7d).
- `until` — Upper time bound (RFC3339 or relative).
- `event` — Session lifecycle event filter (session source).
- `tool` — Tool name filter (tool source).
- `model` — Model filter (llm source).
- `status` — Tool outcome filter: ok\|error\|cancelled (tool source).
- `method` — HTTP method filter (activity source).
- `min_status` — Minimum HTTP status (activity source).
- `max_status` — Maximum HTTP status (activity source).
- `errors_only` — Only error rows (activity source; true/false).
- `event_type` — Event type filter (events source).
- `resource_type` — Resource type filter (events source).
- `container` — Container filter (proxy source; empty = all running realm containers). Maps to the daemon's container_id filter.
- `kind` — Proxy row kind: request\|response\|event (proxy source).
- `host` — Proxy URL host filter (exact or dot-aligned suffix).
- `since_seq` — Exclusive lower seq bound for incremental exports (local sources).
- `limit` — TOTAL row cap across the export (default: everything the snapshot matches; platform default 2000).
- `format` — Export format: jsonl (default) or txt.
- `filename` — Download filename override (reduced to a safe basename).
- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

### `agents` (12) — Chat-agent definitions and per-agent settings

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/agents/{name}/copy` | Copy a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents` | Create a chat-agent definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/agents/{name}` | Delete a custom chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/agents/{name}/source` | Read a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/agents` | List chat-agent definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/agents/{name}/source` | Write a chat agent's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents/{name}/rename` | Rename a chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/agents/{name}/reset-to-shipped` | Reset an agent to its shipped default. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/agents/{name}/model` | Set an agent's model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/agents/{name}/tools` | Set an agent's tool allow-list. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/agents/{name}/turns` | Set an agent's max-turns. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` | Toggle a single tool for an agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/agents/{name}/copy` body — `{ new_name*: string }` — Destination name (forwarded to agents.copy; the source {name} comes from the path).
  - `new_name` — Name for the copied agent.
- `POST /api/v1/agent/agents` body — `{ name*: string, frontmatter: object, system_prompt: string }` — Chat-agent definition (forwarded to agents.create).
  - `name` — Agent name (the definition file stem).
  - `frontmatter` — Optional frontmatter keys (model/tools/turns/description).
  - `system_prompt` — The agent's system prompt body.
- `PUT /api/v1/agent/agents/{name}/source` body — `{ content*: string, base_gen: int }` — New agent source (forwarded to agents.write_source; the {name} comes from the path).
  - `content` — The full markdown source (frontmatter + system prompt).
  - `base_gen` — The gen returned by agents.read_source, for conflict detection.
- `POST /api/v1/agent/agents/{name}/rename` body — `{ new_name*: string }` — New agent name (forwarded to agents.rename; the current {name} comes from the path).
  - `new_name` — New agent name.
- `PATCH /api/v1/agent/agents/{name}/model` body — `{ model: string }` — New model line (forwarded to agents.set_model; the {name} comes from the path).
  - `model` — Model spec (e.g. anthropic/claude-opus-4-8); "" removes the frontmatter model line.
- `PATCH /api/v1/agent/agents/{name}/tools` body — `{ tools: any[] }` — New tool allow-list (forwarded to agents.set_tools; the {name} comes from the path).
  - `tools` — Tool names allowed for the agent; an empty list removes the line (= all tools).
- `PATCH /api/v1/agent/agents/{name}/turns` body — `{ turns: int }` — New max-turns value (forwarded to agents.set_turns; the {name} comes from the path).
  - `turns` — Max agent turns per dispatch.
- `POST /api/v1/agent/agents/{name}/tools/{tool}/toggle` body — `object` — JSON object forwarded to the daemon `agents.toggle_tool` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The agent {name} and {tool} come fro…

### `discovery` (2) — API discovery and related-operation hints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/containers` | List containers in a realm (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/realms` | List realms (for binding). | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

### `github` (12) — GitHub auth, repos, clone, status, commit, sync, PRs

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/github/auth/status` | GitHub auth status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/github/branches` | List GitHub branches. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/clone` | Clone a GitHub repository. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/commit` | Stage all and commit. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/auth/login` | Start a GitHub device-flow login (or add a PAT). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/github/auth/login/poll` | Poll a GitHub device-flow login to completion. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/auth/logout` | Remove a linked GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/github/pr` | Open a pull request. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/repos` | List GitHub repos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/auth/active` | Switch the active GitHub account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/github/status` | GitHub working-tree status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/github/sync` | Sync (fetch → pull → push). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/github/clone` body — `{ repo: string, dir: string, full_name: string, clone_url: string, shallow: bool }` — The clone request. Supply EITHER `repo` (owner/name or an https github URL) — the service derives the canonical full_name + host-validated clone_url — OR the canonical `full_name` + `clone_url` fields directly. At least one form is required; a request with NEITHER is rejected. If BOTH are supplied…
  - `repo` — The repository to clone: "owner/name" or an https github URL (https://<host>/<owner>/<name>[.git]). Translated to full_name + clone_url against the active account host. Supply this OR the canonical full_name+clone_url; if both, the canonical fields win.
  - `dir` — Optional managed clone root override (clone_root); the traversal-safe parent/dest are derived under it.
  - `full_name` — Canonical "owner/name" (alternative to `repo`; used as-is when supplied, taking precedence over a derived value). Requires clone_url.
  - `clone_url` — Canonical https clone URL (alternative to `repo`; re-validated against the active account host; takes precedence over a derived value). Requires full_name.
  - `shallow` — Shallow clone (default true).
- `POST /api/v1/agent/github/commit` body — `{ message*: string }` — The commit request (forwarded to github.commit; cwd-scoped).
  - `message` — The commit message.
- `POST /api/v1/agent/github/auth/login` body — `{ token: string, host: string, activate: bool }` — Optional login options. Supply `token` to add a PAT directly; omit it to start a device flow. Supply `host` for GitHub Enterprise (GHES).
  - `token` — Optional PAT. When present the login validates + persists this token (no device flow); kept in env, never returned.
  - `host` — GitHub host for GitHub Enterprise (GHES); defaults to github.com. Must match the host on the subsequent poll call.
  - `activate` — Whether the linked account becomes the ACTIVE one. Defaults to FALSE — linking stores the credential without changing which account is in use, because activation decides the identity your next push authenticates as. Send true when RECOVERING from an expired/revoked token: the account is linked and…
- `POST /api/v1/agent/github/auth/login/poll` body — `{ host: string, device_code*: string, interval: int, expires_in: int }` — The device-flow handle the start reply returned.
  - `host` — The GitHub host (default github.com); must match the start call.
  - `device_code` — The device_code returned by POST /github/auth/login.
  - `interval` — The poll interval (seconds) the start reply returned.
  - `expires_in` — The device-code lifetime (seconds) the start reply returned.
- `POST /api/v1/agent/github/auth/logout` body — `{ key*: string }` — The account to remove.
  - `key` — Account handle from githubAuthStatus accounts[].key, e.g. "github.com/octocat".
- `POST /api/v1/agent/github/pr` body — `{ title*: string, body: string, base: string }` — The pull-request request (forwarded to github.pr.create).
  - `title` — The PR title (required, non-empty).
  - `body` — The PR description.
  - `base` — Optional base branch (default the repo default).
- `POST /api/v1/agent/github/auth/active` body — `{ key*: string }` — The account to activate.
- `POST /api/v1/agent/github/sync` body — `{ direction: string }` — The sync request (forwarded to the service).
  - `direction` — Optional: "pull" (fetch+pull) or "push" (push only). Default is the full fetch→pull→push.

### `headless` (1) — One-shot headless agent runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/headless/runs` | Create a headless one-shot run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/headless/runs` body — `{ prompt*: string, workflow: string, model: string, format: string, stream: bool, timeout_ms: int }` — The one-shot run request. SECURITY: write-permission is hard-wired OFF and dir-scope is home (no caller opt-in over this surface); but bash/exec are NOT write-gated, so reaching this surface grants RCE.
  - `prompt` — The prompt to drive the ephemeral session (required).
  - `workflow` — Optional workflow name to run instead of / alongside the prompt.
  - `model` — Optional model spec for the run.
  - `format` — Output rendering: text \| json \| stream-json. stream-json (or stream:true) streams the run over SSE; otherwise the run is an async job.
  - `stream` — Force SSE streaming (equivalent to format:stream-json).
  - `timeout_ms` — Optional run timeout in milliseconds (clamped to the hard ceiling).

### `hoody` (1) — Hoody operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/hoody/auth/bootstrap` | Bootstrap the Hoody platform credential (install-if-absent). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/hoody/auth/bootstrap` body — `{ token*: string, capability: string }` — The platform token to install (write-only; never returned) and an optional operator capability.
  - `token` — The raw Hoody platform token to install. Write-only; validated via the sidecar before install and never echoed.
  - `capability` — The operator bootstrap capability (--http-bootstrap-token), required only when the daemon was started with one; a mismatch is answered 404.

### `hooks` (9) — Lifecycle hook configuration

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/hooks/trust/ack` | Acknowledge hook trust. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/begin-write` | Begin a hook write (nonce). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/hooks` | Delete a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/hooks/disable-all` | Disable all hooks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/hooks` | List hooks. | `?session_id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/reload` | Reload hooks from disk. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/test` | Test-fire a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/hooks/toggle` | Toggle a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/hooks` | Upsert a hook. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `session_id` — Live session id (hooks are session-scoped; required by the daemon RPC). Query alias of the body session_id (the body value wins).

**Body shapes:**

- `POST /api/v1/agent/hooks/trust/ack` body — `object` — JSON object forwarded to the daemon `hooks.trust_ack` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Pass `session_id` (the live session the…
- `POST /api/v1/agent/hooks/begin-write` body — `{ session_id*: string, op*: string, scope*: string }` — Write target: session, op, and scope the nonce binds to.
  - `session_id` — Live session id (hooks are session-scoped).
  - `op` — The write the nonce authorizes; one of: upsert, delete, toggle, set_disabled. The nonce is rejected by any other op.
  - `scope` — Scope of the settings file the write targets (e.g. project/user); the nonce binds to its resolved path.
- `DELETE /api/v1/agent/hooks` body — `{ session_id*: string, nonce*: string, scope: string }` — Hook identity + the begin-write nonce (op:delete).
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:delete + this scope; the RPC fails closed without it.
  - `scope` — Scope of the settings file to write (must match the nonce's scope).
- `POST /api/v1/agent/hooks/disable-all` body — `{ session_id*: string, nonce*: string, scope: string }` — The begin-write nonce (op:set_disabled) + session/scope it binds to.
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:set_disabled + this scope; the RPC fails closed without it.
- `GET /api/v1/agent/hooks` body — `{ session_id: string }` — Optional: the live session_id (hooks are session-scoped). May be supplied here OR as the ?session_id query alias; the body value wins.
  - `session_id` — Live session id (hooks are session-scoped; required by the daemon RPC).
- `POST /api/v1/agent/hooks/reload` body — `object` — JSON object forwarded to the daemon `hooks.reload` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Pass `session_id` (the live session the ho…
- `POST /api/v1/agent/hooks/test` body — `object` — JSON object forwarded to the daemon `hooks.test` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Pass `session_id` (the live session the hook…
- `POST /api/v1/agent/hooks/toggle` body — `{ session_id*: string, nonce*: string, scope: string }` — The begin-write nonce (op:toggle) + session/scope it binds to.
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:toggle + this scope; the RPC fails closed without it.
- `PUT /api/v1/agent/hooks` body — `{ session_id*: string, nonce*: string, scope: string, event: string, matcher: string, command: string, timeout: int, name: string, description: string }` — Hook definition + the begin-write nonce (op:upsert).
  - `nonce` — The single-use write nonce from beginHookWrite minted for op:upsert + this scope; the RPC fails closed without it.
  - `event` — Lifecycle event the hook fires on.
  - `matcher` — Matcher selecting when the hook fires.
  - `command` — Command to run when the hook fires.
  - `timeout` — Per-fire timeout (optional).
  - `name` — Short human label shown in the Hooks tab (required when creating a new hook; omit to preserve on update).
  - `description` — Short description of what the hook does (required when creating a new hook; omit to preserve on update).

### `jobs` (3) — Async job lifecycle (observe / result / cancel)

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/jobs/{id}` | Cancel a pending/running job, or delete a finished record. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/jobs/{id}` | Get an async job's status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/jobs/{id}/result` | Get an async job's result. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

### `logs` (5) — Structured log query and read

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/logs/sources` | Log sources. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs/stats` | Log statistics. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs` | Query logs. | `?source` `?level` `?host` `?since` `?until` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs/entries/{ref}` | Read a log entry. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/logs/stream` | Stream the log tail (SSE). | `?source` `?level` `?host` `?since_seq` `?limit` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `source` — Filter to a log source/facet (see logsSources).
- `level` — Filter to a minimum log level.
- `host` — Filter to a host.
- `since` — Lower time/cursor bound (since_seq cursor passes through verbatim).
- `until` — Upper time bound.
- `limit` — Caps the result set (daemon default 200). A non-numeric value is rejected 400.
- `source` — Filter the tail to a log source/facet.
- `since_seq` — Initial resume cursor (the Last-Event-ID header overrides it). A non-numeric value is rejected 400.
- `limit` — Caps each poll batch. A non-numeric value is rejected 400.
- `Last-Event-ID` — SSE resume cursor — the gateway int64 seq to resume from; OVERRIDES the ?since_seq query param. Sent automatically by an SSE client on reconnect.

### `loops` (5) — Recurring self-paced agent loops

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/loops` | Create a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` | Delete a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/sessions/{id}/loops` | List a session's loops. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` | Run a loop immediately. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` | Update a loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/loops` body — `{ prompt*: string, interval: string, max_runs: int, stop_when: string, max_cost_usd: number, max_wall_ms: int }` — Loop definition (forwarded to loops.create; the session_id comes from the path).
  - `prompt` — The prompt fired each loop run.
  - `interval` — Run interval (duration token, e.g. "30m").
  - `max_runs` — Stop after this many runs (0 = unlimited).
  - `stop_when` — Optional stop predicate evaluated each run.
  - `max_cost_usd` — Cost ceiling (0 = unlimited).
  - `max_wall_ms` — Wall-clock ceiling in ms (0 = unlimited).
- `DELETE /api/v1/agent/sessions/{id}/loops/{loopId}` body — `object` — JSON object forwarded to the daemon `loops.delete` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The session_id and loop id come from the p…
- `POST /api/v1/agent/sessions/{id}/loops/{loopId}/run-now` body — `object` — JSON object forwarded to the daemon `loops.run_now` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The session_id and loop id come from the…
- `PATCH /api/v1/agent/sessions/{id}/loops/{loopId}` body — `{ paused: bool, expires_in: string, max_cost_usd: number, max_wall_ms: int }` — Exactly one update intent: run state, expiry, or budget.
  - `paused` — Run-state intent → loops.set_state (true pauses, false resumes).
  - `expires_in` — Expiry intent → loops.set_expiry (duration-from-now token, e.g. "2h"; ""/"never" clears).
  - `max_cost_usd` — Budget intent → loops.update (cost ceiling; 0 = unlimited).
  - `max_wall_ms` — Budget intent → loops.update (wall-clock ceiling in ms, or a duration token; 0 = unlimited).

### `mcp` (9) — Mcp operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/mcp/write-intents` | Begin an MCP config write. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/mcp/servers` | Delete an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/import` | Import MCP servers from another tool's config. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/mcp/servers` | List configured MCP servers. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/mcp/parse` | Preview an MCP config import. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/probe` | Probe an MCP server without saving it. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/reconnect` | Reload MCP config and reconnect. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/mcp/servers/enable` | Enable or disable an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/mcp/servers` | Create or update an MCP server. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.

**Body shapes:**

- `POST /api/v1/agent/mcp/write-intents` body — `{ session_id*: string, op*: "upsert" | "delete" | "set_enabled" | "import", scope: "user" | "project" | "local" }` — Which write is intended, and in which settings layer.
  - `session_id` — Live session id (MCP config is resolved against the session's settings layers).
  - `op` — Which write the nonce authorizes. The minted nonce is valid for this op alone.
  - `scope` — Settings layer to write. Defaults to user, or project when there is no user layer (which is the case under --config-dir).
- `DELETE /api/v1/agent/mcp/servers` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, expect_hash*: string }` — Server name, the begin-write nonce (op:delete) and the expected content hash.
  - `session_id` — Live session id.
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:delete and this scope.
  - `scope` — Settings layer to write. Must match the scope the nonce was minted for.
  - `name` — The server name to remove.
  - `expect_hash` — The mcp_servers hash you last read.
- `POST /api/v1/agent/mcp/import` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", document: string, servers: any[], replace: bool, expect_hash*: string }` — The document or server array, plus the begin-write nonce (op:import).
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:import and this scope.
  - `document` — A pasted config document in any supported dialect. Mutually exclusive with servers.
  - `servers` — Explicit server entries, in hoody's own shape. Mutually exclusive with document.
  - `replace` — Overwrite entries whose name already exists. Without it, a collision aborts the whole import.
- `POST /api/v1/agent/mcp/parse` body — `{ session_id*: string, document*: string }` — The document to parse.
  - `document` — A config document in any supported dialect.
- `POST /api/v1/agent/mcp/probe` body — `{ session_id*: string, server*: object }` — The candidate server config.
  - `session_id` — Live session id (supplies the deny list and transport policy).
  - `server` — The candidate entry, same shape as upsertMCPServer's server.
- `POST /api/v1/agent/mcp/reconnect` body — `{ session_id*: string }` — Which session to reconcile against.
- `POST /api/v1/agent/mcp/servers/enable` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", name*: string, enabled*: bool, expect_hash*: string }` — Server name, desired state, the begin-write nonce (op:set_enabled) and the expected content hash.
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:set_enabled and this scope.
  - `name` — The server name.
  - `enabled` — true to enable, false to disable.
- `PUT /api/v1/agent/mcp/servers` body — `{ session_id*: string, nonce*: string, scope: "user" | "project" | "local", expect_hash*: string, server*: object }` — The server entry, the begin-write nonce (op:upsert) and the expected content hash.
  - `nonce` — Single-use nonce from beginMCPWrite minted for op:upsert and this scope; the RPC fails closed without it.
  - `expect_hash` — The mcp_servers hash you last read, as returned by beginMCPWrite or listMCPServers. REQUIRED: a mismatch returns a conflict instead of overwriting a concurrent edit, and a first write into a file that does not exist yet states its expectation with the empty-array hash rather than omitting this.
  - `server` — The server entry. Fields: `name` — letters, digits, `_` and `-`, max 64 chars, no `__` (it separates the tool name), may not be `hoody` or `mcp` — both are reserved namespaces, and that check alone is case-insensitive, so `Hoody` is refused too; `type` — `stdio` (default), `http` (aliases `url`, `s…

### `memory` (11) — Long-term memory records (admin browse / CRUD)

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/memory/consolidate` | Trigger a memory consolidation pass (human-only). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `DELETE /api/v1/agent/memory/items` | Delete a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/memory/items/{id}` | Edit a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/memory/flush` | Flush the memory store. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/memory/graph` | Read a project's memory relation graph. | `?project` `?node_type` `?limit` `?offset` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/items/{id}` | Read a memory item. | `?project` `?kind` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/items` | List memory items. | `?project` `?kind` `?type` `?query` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/memory/projects` | List memory projects. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/memory/items` | Save a memory item. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/memory/search` | Search memory (hybrid recall). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/memory/enabled` | Toggle memory capture. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `project` — Project key whose graph to read.
- `node_type` — Optional node-type filter.
- `limit` — Maximum nodes/edges to return.
- `offset` — Pagination offset into the graph.
- `project` — Project key the memory belongs to.
- `kind` — Memory kind/store the record lives in.
- `project` — Project key to scope the listing to.
- `kind` — Memory kind/store to filter by.
- `type` — Memory type to filter by (e.g. workflow, fact). kind=memory ONLY — rejected 400 with a lesson/slot/observation kind.
- `query` — Free-text filter over the records. kind=memory ONLY — rejected 400 with a lesson/slot/observation kind.
- `page` — 1-based page number.
- `limit` — Items per page (1..200). 0 or omitted pages at the 200 ceiling; a value over 200 is clamped to 200. The effective page size is echoed in meta.limit. NOT "no pagination" — the daemon never returns an unbounded set.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/memory/consolidate` body — `{ project*: string, min_observations: int }` — The consolidation target.
  - `project` — Project key to consolidate (required).
  - `min_observations` — Optional minimum-observations threshold for a fact to be consolidated.
- `DELETE /api/v1/agent/memory/items` body — `{ id*: string, project: string, kind: string }` — Identity of the memory record to delete.
  - `id` — Memory record id.
- `PATCH /api/v1/agent/memory/items/{id}` body — `{ project: string, kind: string, content: string }` — Patch fields for the memory record (the {id} comes from the path).
  - `content` — Replacement memory content.
- `POST /api/v1/agent/memory/flush` body — `object` — JSON object forwarded to the daemon `memory.flush` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. No fields are required; the request scope…
- `POST /api/v1/agent/memory/items` body — `{ project*: string, content*: string, type: string }` — The memory record.
  - `content` — The memory content.
  - `type` — Memory type (e.g. workflow, fact).
- `POST /api/v1/agent/memory/search` body — `{ project: string, query: string, limit: int, kinds: any[], skip_graph: bool }` — The recall query.
  - `project` — Project key to search within.
  - `query` — The natural-language recall query (privacy-Strip'd server-side).
  - `limit` — Maximum hits to return.
  - `kinds` — Optional memory kinds/stores to restrict the search to.
  - `skip_graph` — Skip the graph-fusion component of recall.
- `PUT /api/v1/agent/memory/enabled` body — `{ enabled: bool }` — The desired enabled state.
  - `enabled` — Whether memory capture is enabled.

### `models` (16) — Catalogued models and fusion composites

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/providers/{id}/auth/accounts` | Add an OAuth account to a provider's pool. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/providers/{id}/auth/api-key` | Delete a provider API key. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/models/{spec}` | Get a model by spec. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}` | Get a provider. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}/auth` | Get a provider's auth status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/models` | List models. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}/auth/accounts` | List a provider's OAuth account pool. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers` | List LLM providers. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/providers/{id}/auth/oauth` | Remove a provider's OAuth login. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/providers/{id}/auth/oauth/{job}` | Poll a provider OAuth login. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/providers/{id}/auth/accounts/{key}` | Remove a pooled OAuth account. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/providers/{id}/auth/api-key` | Store a provider API key. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` | Make a pooled OAuth account active. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/providers/{id}/auth/default` | Set a provider's default credential method. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/providers/{id}/auth/oauth` | Start a provider OAuth login. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` | Submit a provider OAuth authorization code. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/providers/{id}/auth/accounts` body — `object` — No fields are required; the login flow is started for the {id} provider.
- `PUT /api/v1/agent/providers/{id}/auth/api-key` body — `{ api_key*: string }` — The provider API key to store (written 0600-atomic; never returned).
  - `api_key` — The provider API key. Stored in the 0600 ~/.hoody/.env store; the reply echoes only a prefix.
- `PUT /api/v1/agent/providers/{id}/auth/accounts/{key}/active` body — `object` — No body fields are required; the account is identified by the {key} path value.
- `PUT /api/v1/agent/providers/{id}/auth/default` body — `{ default*: string }` — The default credential method to set.
  - `default` — The default method: "api_key" or "oauth". Must be a method the provider supports AND has a stored credential for.
- `POST /api/v1/agent/providers/{id}/auth/oauth` body — `{ add_account: bool }` — Optional OAuth start options.
  - `add_account` — When true, the login ADDS to the provider's OAuth account pool (LoginAddAccount) instead of replacing the primary login.
- `POST /api/v1/agent/providers/{id}/auth/oauth/{job}/code` body — `{ code*: string }` — The authorization code or full redirect URL the flow is waiting for.
  - `code` — The authorization code (or the full redirect URL) to complete the exchange.

### `sessions` (25) — Create, drive, and tear down agent sessions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/answer:assist` | Propose answers for a parked question (helper model). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/answer` | Answer a parked question gate. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/cancel` | Cancel the active turn (Esc). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/close` | Close the session (teardown). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/confirm` | Answer a parked confirm gate. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions` | Create, fork, or attach a session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/sessions/{id}` | Close (and optionally hard-delete) a session. | `?hard` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}` | Get a session summary. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/transcript` | Read a session's transcript without attaching. | `?after_turn` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/cwds` | List distinct session working directories. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions` | List sessions. | `?include_system` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/messages` | Dispatch a turn (fire-and-observe). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/workflow/messages` | Send a message to a running workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/prompt:stream` | Dispatch a turn and stream the response. | `?policy` `H:X-Hoody-Gate-Policy` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/sessions/{id}/prompt:sync` | Dispatch a turn and block to completion. | `?policy` `H:X-Hoody-Gate-Policy` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/sessions/{id}/replay` | Replay a live session's buffered events. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/sessions/{id}/agent` | Switch the chat agent. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/auto-reply` | Arm/disarm the auto-reply loop. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` | Flip the auto-reply write opt-in. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/effort` | Set reasoning effort. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/hoody-env` | Toggle Hoody shell-env injection. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/sessions/{id}/model` | Switch the session model. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PATCH /api/v1/agent/sessions/{id}/verbosity` | Set response verbosity. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/sessions/{id}/stream` | Attach to a session's event stream (WebSocket / SSE). | `?since` `H:Last-Event-ID` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/trim` | Trim session history to a turn index. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `hard` — When true, also remove the persisted session record (not just the live connection).
- `after_turn` — Exclusive completed-turn skip cursor: return content strictly after completed turn N (0 = full transcript; values past the end clamp; negative/non-integer = 400).
- `include_system` — When true, also include daemon-owned system/resident sessions in the listing.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `policy` — auto_approve auto-answers confirm gates for the life of the stream (alias of the X-Hoody-Gate-Policy header); off by default.
- `X-Hoody-Gate-Policy` — Confirm-gate posture: "auto_approve" adopts the headless auto-answer posture (off by default; the in:query alias is ?policy=). Any other value is rejected 400.
- `policy` — auto_approve adopts the headless auto-answer posture (alias of the X-Hoody-Gate-Policy header); off by default.
- `since` — Resume from this gateway int64 seq (also accepted as the Last-Event-ID header).
- `Last-Event-ID` — SSE resume cursor — the gateway int64 seq to resume from (the in:header alias of ?since); sent automatically by an SSE client on reconnect.

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/answer:assist` body — `{ mode: string, model: string, gen: int }` — Helper-model suggestion request (all optional).
  - `mode` — Suggestion mode (default "suggest").
  - `model` — Helper model override; empty uses the configured helper.
  - `gen` — Generation counter to correlate the suggestion event.
- `POST /api/v1/agent/sessions/{id}/answer` body — `{ gate_id: string, generation: int, answer: string, text: string, answers: object }` — Question-gate answer. Provide answer/text for a free-form reply, or answers (a map) for a structured multi-field question. gate_id/generation are optional echoes (a mismatch is 409).
  - `gate_id` — Optional echo of the parked gate id (stale/mismatch → 409).
  - `generation` — Optional echo of the parked gate generation.
  - `answer` — Free-form answer text.
  - `text` — Alternate answer text field (forwarded alongside answer).
  - `answers` — Structured per-field answers for a multi-field question.
- `POST /api/v1/agent/sessions/{id}/confirm` body — `{ gate_id: string, generation: int, approved: bool, persist_dirs: bool }` — Confirm-gate answer. gate_id/generation are optional echoes of the parked gate (a mismatch is 409). approved defaults to true when omitted.
  - `approved` — true to approve, false to deny (defaults to true if omitted).
  - `persist_dirs` — Persist an approved directory grant to settings.json (WS↔REST parity).
- `POST /api/v1/agent/sessions` body — `{ realm: string, container: string, cwd: string, config_dir: string, model: string, agent: string, tool_mode: string, dir_scope: string, attach: string, fork: string, fork_turn_idx: int, backend: string, delegated_agent: string, headless: bool }` — Session start binding (all optional; header scope augments the body, body wins). backend:"acp" requires delegated_agent.
  - `realm` — Realm selector to scope the session (frozen at start).
  - `container` — Container id/selector to run tools on (frozen at start).
  - `cwd` — Working directory for the session (frozen at start).
  - `config_dir` — Config directory override.
  - `model` — Model for this session. On a fresh create/fork it OVERRIDES the chat agent's pinned model for this session only (it is NOT written to the agent; use PATCH /sessions/{id}/model to change it and repin the agent globally). Omit it to use the agent's pinned model (or your default). Rejected (400) toget…
  - `agent` — Initial chat-agent name. Rejected (400) together with fork (a fork inherits its parent's chat agent) or attach (a resumed session keeps its agent).
  - `tool_mode` — Initial tool mode (frozen at start).
  - `dir_scope` — Initial directory-access scope: home\|full (frozen at start).
  - `attach` — attach_session_id — attach to an existing session instead of creating one.
  - `fork` — fork_session_id — fork from an existing session.
  - `fork_turn_idx` — Turn index to fork at (with fork).
  - `backend` — Session backend: "" (Hoody LLM) or "acp" (BYOA delegated agent).
  - `delegated_agent` — BYOA agent when backend:"acp": claude.
  - `headless` — Start the session in headless posture.
- `POST /api/v1/agent/sessions/{id}/messages` body — `{ text: string, tool_mode: string, dir_scope: string }` — Turn input: the user text plus optional per-turn tool_mode / dir_scope overrides.
  - `text` — The user message text for this turn.
  - `tool_mode` — Optional per-turn tool mode override.
  - `dir_scope` — Optional per-turn directory-access scope override: home\|full.
- `POST /api/v1/agent/sessions/{id}/workflow/messages` body — `{ text: string }` — Workflow input message.
  - `text` — Feedback/input text fed to the running workflow.
- `POST /api/v1/agent/sessions/{id}/prompt:stream` body — `{ text: string, tool_mode: string, dir_scope: string }` — Turn input: the user text plus optional per-turn tool_mode / dir_scope overrides.
- `POST /api/v1/agent/sessions/{id}/prompt:sync` body — `{ text: string, tool_mode: string, dir_scope: string }` — Turn input: the user text plus optional per-turn tool_mode / dir_scope overrides.
- `PATCH /api/v1/agent/sessions/{id}/agent` body — `{ agent: string }` — New chat agent.
  - `agent` — Chat-agent name to switch to.
- `PATCH /api/v1/agent/sessions/{id}/auto-reply` body — `{ armed: bool, rounds: int, model: string, allow_writes: bool }` — Auto-reply loop config.
  - `armed` — true to arm the auto-reply loop, false to disarm.
  - `rounds` — Number of auto-reply rounds budgeted.
  - `model` — Replier model override.
  - `allow_writes` — Opt in to write-class actions during auto-reply.
- `PATCH /api/v1/agent/sessions/{id}/auto-reply/writes` body — `{ allow_writes: bool }` — Write opt-in flip.
  - `allow_writes` — New write-class opt-in state.
- `PATCH /api/v1/agent/sessions/{id}/effort` body — `{ effort: string }` — Reasoning effort.
  - `effort` — low\|medium\|high\|xhigh, or "" for the model default.
- `PATCH /api/v1/agent/sessions/{id}/hoody-env` body — `{ enabled: bool }` — Enable/disable HOODY_* shell-env injection.
  - `enabled` — Whether to inject the HOODY_* shell-env contract.
- `PATCH /api/v1/agent/sessions/{id}/model` body — `{ model*: string }` — New model.
  - `model` — Model spec to switch to (provider-prefixed, e.g. anthropic/claude-opus-4-8, or fusion/<slug>). Required — a blank value is rejected, never a silent no-op.
- `PATCH /api/v1/agent/sessions/{id}/verbosity` body — `{ level: string }` — Verbosity level.
  - `level` — normal\|concise\|terse\|minimal.
- `POST /api/v1/agent/sessions/{id}/trim` body — `{ turn_idx: int }` — Trim target.
  - `turn_idx` — Turn index to truncate history to (and including).

### `settings` (9) — Process-wide settings (home settings.json)

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/agent/settings/fusion/{slug}` | Delete a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/acp/agents` | Get BYOA ACP backend status. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/settings` | Get settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/settings/fusion` | List fusion composites. | `?include_invalid` `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PATCH /api/v1/agent/settings` | Patch settings. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `PUT /api/v1/agent/acp/agents/{agent}/model` | Set a BYOA backend's default model and effort. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/acp/agents/{agent}/enabled` | Enable or disable a BYOA ACP backend. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` | Store an ACP per-agent secret value. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PUT /api/v1/agent/settings/fusion/{slug}` | Create or update a fusion composite. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `include_invalid` — When true, also return composites that failed validation as a top-level `invalid` array beside `items` (each with a reason + raw-file index) so a broken composite is editable/deletable.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `PATCH /api/v1/agent/settings` body — `{ patch*: object }` — The settings patch.
  - `patch` — Top-level keys to merge into the home settings.json (a null value deletes the key).
- `PUT /api/v1/agent/acp/agents/{agent}/model` body — `{ model: string, effort: string }` — The default model / effort for this backend. An empty string clears the pin.
  - `model` — Backend model id or alias. Empty clears the pin.
  - `effort` — Reasoning effort (backend-specific; empty clears).
- `PUT /api/v1/agent/acp/agents/{agent}/enabled` body — `{ enabled: bool }` — Whether the backend is armed for delegated sessions.
  - `enabled` — True arms the backend; false disarms it. Defaults to true when omitted.
- `PUT /api/v1/agent/acp/agents/{agent}/secrets/{key}` body — `{ value: string }` — The secret value to store (0600-atomic; never returned). An empty value clears the reference.
  - `value` — The env secret value. Empty string clears (unsets) the reference. Stored only in the 0600 acp-secrets.env store.
- `PUT /api/v1/agent/settings/fusion/{slug}` body — `{ spec*: object }` — The fusion composite spec.
  - `spec` — The FusionSpec object (name, method, members,...).

### `skills` (15) — Reusable agent skill definitions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/skills/import/apply` | Apply a skill import. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `DELETE /api/v1/agent/skills/hub/cache` | Clear the skill hub cache. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills` | Create a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/delete` | Delete a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills/hub/cache` | Skill hub cache stats. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/skills/source` | Read a skill's source. | `?root_dir` `?rel_dir` `?root` `?rel` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills/hub/install` | Install a hub skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills` | List skills. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/skills/hub/preview` | Preview a hub skill. | `?id` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/skills/source` | Write a skill's source. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/rename` | Rename a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `GET /api/v1/agent/skills/import/scan` | Scan for importable skills. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/skills/hub/search` | Search the skill hub. | `?q` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/skills/toggle` | Enable/disable a skill. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/skills/trust` | Set a skill's trust state. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `root_dir` — Skill root directory (identity; alias: root).
- `rel_dir` — Skill relative directory (identity; alias: rel).
- `root` — Friendly alias of root_dir (translated to root_dir server-side).
- `rel` — Friendly alias of rel_dir (translated to rel_dir server-side).
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `id` — Hub skill identifier.
- `q` — Search query.

**Body shapes:**

- `POST /api/v1/agent/skills/import/apply` body — `object` — JSON object forwarded to the daemon `skills.import_apply` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Identify the discovered skill to im…
- `POST /api/v1/agent/skills` body — `{ name*: string, description: string, content: string }` — New skill definition (forwarded to skills.create).
  - `name` — Skill name (the SKILL.md directory stem).
  - `description` — Skill description (frontmatter).
  - `content` — Initial SKILL.md body.
- `POST /api/v1/agent/skills/delete` body — `{ root_dir*: string, rel_dir*: string }` — Skill identity.
- `POST /api/v1/agent/skills/hub/install` body — `{ id*: string }` — Hub skill to install (forwarded to skills.hub_install).
  - `id` — Hub skill identifier (from searchSkillHub/previewSkillHub).
- `PUT /api/v1/agent/skills/source` body — `{ root_dir*: string, rel_dir*: string, content*: string, base_gen: int }` — Skill identity + new source body.
  - `content` — New SKILL.md body (alias: source).
  - `base_gen` — The gen returned by skills.read_source, for conflict detection.
- `POST /api/v1/agent/skills/rename` body — `{ root_dir*: string, rel_dir*: string, new_name*: string }` — Skill identity + new name.
  - `new_name` — New skill directory name.
- `POST /api/v1/agent/skills/toggle` body — `{ name*: string, disabled: bool }` — Effective skill name + new disabled state.
  - `name` — Effective skill name (NOT root/rel — toggle is name-scoped).
  - `disabled` — true to disable the skill, false to enable it.
- `POST /api/v1/agent/skills/trust` body — `{ root_dir*: string, rel_dir*: string, trusted*: bool }` — Skill identity + trust flag.
  - `trusted` — true to grant execution trust, false to revoke.

### `statistics` (3) — Per-session and aggregate usage counters

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/statistics` | Cross-session statistics. | `?scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/usage/by-account` | Usage rollup by account. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/usage/by-model` | Usage rollup by model. | `?since` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `scope` — cwd (default) rolls up the current working directory; all rolls up every session.
- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `since` — Unix-seconds lower bound; omit for all-time. A negative/non-numeric value is rejected 400.

### `system` (5) — Health, metrics, and operational endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/docs` | API documentation UI. |  |
| `GET /api/v1/agent/health` | Standardized health check. |  |
| `GET /api/v1/agent/metrics` | Prometheus metrics. |  |
| `GET /api/v1/agent/openapi.json` | OpenAPI spec (JSON). |  |
| `GET /api/v1/agent/openapi.yaml` | OpenAPI spec (YAML). |  |

### `tasks` (4) — Background task management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/sessions/{id}/tasks/cancel` | Cancel all background tasks. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/tasks/{tid}/cancel` | Cancel a background task. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tasks` | Request the session's task snapshot. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tasks/{tid}/transcript` | Request a task's transcript (upsert-poll). | `?after_seq` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `after_seq` — int64 upsert-poll cursor; entries at/below it are re-sent (default 0).

### `todos` (17) — Container-aware task list management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` | Approve a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/archive` | Archive a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/cancel-run` | Cancel a todo's run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/claim` | Claim a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos` | File a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` | Deny a todo proposal. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/todos/{id}` | Read a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/todos/revision` | Get the todos store revision. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/todos` | List todos. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/message` | Comment + run an orchestrator turn. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/{id}/messages` | Comment on a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/purge` | Purge archived todos. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/release` | Release a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/run` | Run a todo's orchestrator. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/todos/{id}/snooze` | Snooze a todo. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/todos/triage` | Run an LLM triage pass. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `PATCH /api/v1/agent/todos/{id}` | Update a todo (CAS). | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/todos/{id}/proposals/{pid}/approve` body — `object` — JSON object forwarded to the daemon `todos.approve_proposal` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} and proposal {pid}…
- `POST /api/v1/agent/todos/{id}/archive` body — `{ revision*: int }` — CAS guard (forwarded to todos.archive; the {id} comes from the path).
  - `revision` — The TODO's own current `revision` (from getTodo); required — a stale or absent value is rejected.
- `POST /api/v1/agent/todos/{id}/cancel-run` body — `object` — JSON object forwarded to the daemon `todos.cancel_run` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} comes from the path; the…
- `POST /api/v1/agent/todos/{id}/claim` body — `{ revision: int }` — CAS guard (forwarded to todos.claim; the {id} comes from the path).
  - `revision` — The TODO's own current `revision` (from getTodo); required for a fresh claim (only the lease's existing owner may refresh without it).
- `POST /api/v1/agent/todos` body — `{ title*: string, body: string, priority: int, tags: any[], cwd: string }` — New todo (forwarded to todos.create; deterministic triage runs server-side). The todo's working directory is taken from the body `cwd` OR, if omitted, the X-Hoody-Cwd request-scope header; one of the two is required (todos.create rejects an empty cwd).
  - `title` — Todo title.
  - `body` — Todo body / description.
  - `priority` — Optional priority band 0..4 (0 = P0 urgent … 4 = P4 someday); defaults to 2 when omitted. Must be a JSON integer in range — a string or out-of-range value is rejected.
  - `tags` — Optional tags.
  - `cwd` — The todo's working directory (labels the record's computer/path). Defaults to the X-Hoody-Cwd request-scope header when omitted; one of the two must be set.
- `POST /api/v1/agent/todos/{id}/proposals/{pid}/deny` body — `object` — JSON object forwarded to the daemon `todos.deny_proposal` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} and proposal {pid} co…
- `GET /api/v1/agent/todos` body — `{ states: any[], tags: any[], query: string, open_only: bool, all: bool }` — Optional typed filters forwarded to todos.list. All optional; omit the body for the full list.
  - `states` — Filter to these todo states (array of strings).
  - `tags` — Filter to todos carrying these tags (array of strings).
  - `query` — Free-text filter over title/body.
  - `open_only` — When true, only open (non-terminal) todos.
  - `all` — When true, include archived/closed todos.
- `POST /api/v1/agent/todos/{id}/message` body — `{ text*: string }` — Comment text that kicks an orchestrator turn (forwarded to todos.message; the {id} comes from the path). Returns {job_id}.
  - `text` — The message that both comments and prompts the orchestrator.
- `POST /api/v1/agent/todos/{id}/messages` body — `{ text*: string }` — Comment text (forwarded to todos.post_message; the {id} comes from the path).
  - `text` — The comment body to append to the todo timeline.
- `POST /api/v1/agent/todos/purge` body — `object` — JSON object forwarded to the daemon `todos.purge` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Optional filters scoping which archived tod…
- `POST /api/v1/agent/todos/{id}/release` body — `object` — JSON object forwarded to the daemon `todos.release` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} comes from the path; the bo…
- `POST /api/v1/agent/todos/{id}/run` body — `object` — JSON object forwarded to the daemon `todos.run` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. The todo {id} comes from the path; the body i…
- `POST /api/v1/agent/todos/{id}/snooze` body — `{ wake_at*: string, revision*: int }` — Snooze target (forwarded to todos.snooze; the {id} comes from the path). The daemon reads `wake_at` + the CAS `revision` — there is no `until` field.
  - `wake_at` — Wake time, RFC3339 (e.g. 2026-07-04T09:00:00Z); an empty string clears the snooze.
  - `revision` — The TODO's own current `revision` (from getTodo); a stale value is rejected.
- `POST /api/v1/agent/todos/triage` body — `object` — JSON object forwarded to the daemon `todos.triage` RPC. Reserved `_`-prefixed keys are ignored and the request scope (cwd/config_dir) is applied automatically; all other keys are passed through, so the accepted fields are exactly those the operation reads. Optional triage scoping; an empty body tri…
- `PATCH /api/v1/agent/todos/{id}` body — `{ revision*: int, title: string, body: string, state: string, priority: int, rank: int, tags: any[], cwd: string }` — CAS-guarded field patch / state transition (forwarded to todos.update; the {id} comes from the path). Only the keys present are patched.
  - `revision` — The TODO's own current `revision` (from getTodo — NOT the store-wide revision); a stale value is rejected.
  - `title` — New title.
  - `body` — New body.
  - `state` — New state transition.
  - `priority` — New priority.
  - `rank` — New ordering rank.
  - `tags` — New tag set.
  - `cwd` — Retarget the todo's working directory.

### `tools` (9) — Tool catalogue and gated tool execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/agent/tools/{name}` | Get one tool schema. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/tools/read-only` | List the read-only tool subset. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tools/mcp` | List a session's MCP tools. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/sessions/{id}/tools` | List a session's effective tool set. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/tools` | List the tool catalogue. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/sessions/{id}/tools/{name}/run` | Run a tool inside a live session (gated). | `?confirm` `?confirm_token` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/run` | Run a tool (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/runAsync` | Run a tool asynchronously (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `POST /api/v1/agent/tools/{name}/stream` | Run a tool with a streamed result (sessionless, gated). | `?confirm` `?confirm_token` `H:X-Hoody-Tool-Mode` `H:X-Hoody-Dir-Scope` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).
- `confirm` — Query alias of the body `confirm` field — re-issue a previously-parked confirmation (pair with confirm_token).
- `confirm_token` — Query alias of the body `confirm_token` field — the single-use token returned in the 409 tool_needs_confirmation details.
- `X-Hoody-Tool-Mode` — Sessionless tool-mode for the ephemeral session (e.g. read_only / full); default per the daemon. Ignored on the in-session run (it inherits the session's frozen tool-mode).
- `X-Hoody-Dir-Scope` — Sessionless directory-access scope for the ephemeral session (e.g. home / full); default home. Ignored on the in-session run (it inherits the session's frozen dir-scope).

**Body shapes:**

- `POST /api/v1/agent/sessions/{id}/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
  - `params` — The tool's input parameters (its JSON-Schema body).
  - `confirm` — Re-issue a previously-parked confirmation. MUST be paired with the confirm_token from the prior 409; a bare confirm:true with no valid token does NOT bypass the gate (it re-parks). A wire confirmed key in params is always scrubbed.
  - `confirm_token` — The single-use token returned in the 409 tool_needs_confirmation details. Bound to the tool/session/params it was minted for; present it with confirm:true and the echoed params to approve the parked run.
  - `allow_mutations` — Sessionless only: opt a non-read-only tool into running under the full permission checks (else a sessionless mutating run is refused 400 tool_mutation_refused).
- `POST /api/v1/agent/tools/{name}/run` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
- `POST /api/v1/agent/tools/{name}/runAsync` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.
- `POST /api/v1/agent/tools/{name}/stream` body — `{ params: object, confirm: bool, confirm_token: string, allow_mutations: bool }` — Tool parameters and an optional confirmation posture. Caller-supplied `confirmed`/`_`-prefixed control keys are ignored — they are never trusted from the wire.

### `workflows` (10) — Multi-step workflow definitions and runs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/agent/workflows/runs/{run_id}/cancel` | Cancel a workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `DELETE /api/v1/agent/workflows/{name}` | Delete a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows/{name}` | Read one workflow definition. | `?include_revision` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows/runs/{run_id}` | Get one workflow run by id. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `POST /api/v1/agent/workflows/{name}/hide` | Hide or un-hide a workflow. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |
| `GET /api/v1/agent/workflows/runs` | Snapshot in-flight and recent workflow runs. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `GET /api/v1/agent/workflows` | List workflow definitions. | `?page` `?limit` `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` |
| `PUT /api/v1/agent/workflows/{name}` | Create or replace a workflow definition. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/workflows/runs/{run_id}/resume` | Resume a failed or cancelled workflow run. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body*` |
| `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` | Run a workflow onto an existing session. | `H:X-Hoody-Cwd` `H:X-Hoody-Config-Dir` `H:X-Hoody-Container` `H:X-Hoody-Realm` `?realm` `body` |

**Param notes:**

- `X-Hoody-Cwd` — Per-request working-directory scope: the.hoody project layer / record cwd / tool+workflow cwd. Required by routes that resolve a cwd (e.g. POST /todos; createTodo also accepts a body cwd).
- `X-Hoody-Config-Dir` — Per-request --config-dir override selecting which on-disk.hoody install a stateless read/write resolves (HoodyPaths).
- `X-Hoody-Container` — Per-request bound remote container (omitted = local). Rejected (400) on routes with no container dimension.
- `X-Hoody-Realm` — Per-request realm selector: "global" or a 24-hex id (also accepted as ?realm=). Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `realm` — Per-request realm selector — the in:query alias of the X-Hoody-Realm header (read only when the header is absent): "global" or a 24-hex id. Rejected (400 realm_scope_unsupported) on active-only / no-realm routes.
- `include_revision` — If "true", the tool output's first line is `revision: <opaque>` — pass that value as putWorkflow's expected_revision to guard against concurrent edits; the JSON below it is unchanged. Strictly parsed: exactly one value, "true" or "false"; anything else (empty, "TRUE", "1", repeated) is a 400 bad_request.
- `page` — 1-based page number for pagination.
- `limit` — Maximum items per page (0 = no pagination).

**Body shapes:**

- `POST /api/v1/agent/workflows/{name}/hide` body — `{ hidden: bool }` — Visibility flag (the {name} comes from the path). Defaults to hide:true.
  - `hidden` — true (default) to hide the workflow; false to un-hide it.
- `PUT /api/v1/agent/workflows/{name}` body — `{ definition*: object, expected_revision: string, expected_absent: bool }` — The workflow definition (forwarded as the upsert_workflow tool's `definition`; the {name} comes from the path), plus the optional optimistic-concurrency guards.
  - `definition` — The full workflow definition object (steps, entry_point, summary). Validated strictly server-side before an atomic write.
  - `expected_revision` — Optional optimistic-concurrency guard: the 'revision:' value from getWorkflow (?include_revision=true). If the stored workflow changed since that read, the upsert is refused with [revision_conflict] and nothing is written. Omit to save unconditionally.
  - `expected_absent` — Optional create-only guard: refuse with [already_exists] (writing nothing) if any workflow with this name already exists. Use when creating a new workflow that must not overwrite an existing one. Mutually exclusive with expected_revision.
- `POST /api/v1/agent/workflows/runs/{run_id}/resume` body — `{ session_id*: string }` — The live session that executes the resume.
  - `session_id` — A live session matching the run's realm, owner, working directory, and container binding.
- `POST /api/v1/agent/sessions/{id}/workflows/{name}/runs` body — `{ prompt: string, inputs: object }` — Optional workflow input prompt and declared input-parameter values.
  - `prompt` — Optional input text fed to the workflow run ($(workflow.prompt)).
  - `inputs` — Optional run-time values for the workflow's DECLARED input parameters (declared name → string value; resolves to $(input.<name>) in every step). A workflow with a REQUIRED declared parameter cannot run without these. Values must be strings; a non-string value is a 400.


---

<!-- ===== namespace: api ===== -->

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
- Bearer token in `Authorization`. Mint via `POST /api/v1/users/auth/login` (1d JWT / 7d refresh) or `POST /api/v1/auth/tokens` (long-lived, scopable).
- 2FA mutations have varying auth: `POST /api/v1/users/auth/2fa/setup` needs password only; `POST /api/v1/users/auth/2fa/verify-setup` needs OTP code only; `POST /api/v1/users/auth/2fa/verify` needs `temp_token` + code; `DELETE /api/v1/users/auth/2fa` needs password + OTP **or** backup code; `POST /api/v1/users/auth/2fa/backup-codes/regenerate` needs password + a **6-digit TOTP only** (`^\\d{6}$` — backup codes are rejected with 400).
- Project/container writes: project owner or matching permission row.
- Billing writes: registered payment method.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap (signup → verify → login [+2FA])

1. `POST /api/v1/auth/signup`
2. `POST /api/v1/auth/verify-email`
3. `POST /api/v1/users/auth/login`
4. `POST /api/v1/users/auth/2fa/verify` (if 2FA enabled — uses `temp_token`)
5. `GET /api/v1/users/auth/me`

### 2. Mint a long-lived auth token

1. `POST /api/v1/auth/tokens`
2. `GET /api/v1/auth/tokens`
3. `POST /api/v1/auth/tokens/{id}/add-realm`
4. `POST /api/v1/auth/tokens/{id}/remove-realm`
5. `POST /api/v1/auth/tokens/{id}/copy`
6. `DELETE /api/v1/auth/tokens/{id}`

### 3. Set up 2FA

1. `POST /api/v1/users/auth/2fa/setup`
2. `POST /api/v1/users/auth/2fa/verify-setup`
3. `GET /api/v1/users/auth/2fa/status`
4. `POST /api/v1/users/auth/2fa/backup-codes/regenerate`
5. `PUT /api/v1/users/auth/2fa/token-gate`

### 4. Create first project + container

Read kit URLs by getting the container with `include_proxy_domains` set to `true` (`GET /api/v1/containers/{id}`) — the `proxy_domains` array is only populated when `include_proxy_domains` is passed.
1. `GET /api/v1/realms/`
2. `GET /api/v1/images/user`
3. `POST /api/v1/projects/`
4. `POST /api/v1/projects/{id}/containers`
5. `POST /api/v1/containers/{id}/{operation}`
6. `GET /api/v1/containers/{id}`

### 5. Grant another user access

Project-scope analogues live under `* /api/v1/projects/{id}/proxy/permissions*`.
1. `GET /api/v1/projects/{id}/permissions`
2. `POST /api/v1/projects/{id}/permissions`
3. `PUT /api/v1/projects/{id}/permissions/{permissionId}`
4. `DELETE /api/v1/projects/{id}/permissions/{permissionId}`
5. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password`
6. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token`
7. `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt`
8. `PATCH /api/v1/containers/{id}/proxy/permissions/state`

### 6. Container exposure & shares

1. `PUT /api/v1/containers/{id}/network`
2. `POST /api/v1/containers/{id}/network/start`
3. `POST /api/v1/containers/{id}/firewall/egress`
4. `POST /api/v1/containers/{id}/firewall/ingress`
5. `POST /api/v1/proxy/aliases`
6. `PATCH /api/v1/proxy/aliases/{id}/state`
7. `POST /api/v1/containers/{id}/storage/shares`
8. `GET /api/v1/containers/{id}/storage/incoming` (container-scoped)
9. `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount`
10. `DELETE /api/v1/storage/shares/{shareId}`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `POST /api/v1/containers/{id}/snapshots`
2. `GET /api/v1/containers/{id}/snapshots`
3. `PUT /api/v1/containers/{id}/snapshots/{name}`
4. `POST /api/v1/containers/{id}/copy`
5. `DELETE /api/v1/containers/{id}/snapshots/{name}`
6. `GET /api/v1/containers/{id}/env`
7. `PUT /api/v1/containers/{id}/env/{key}`
8. `PUT /api/v1/containers/{id}/env`
9. `DELETE /api/v1/containers/{id}/env/{key}`
10. `PUT /api/v1/containers/{id}/kvm` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `POST /api/v1/projects/{id}/containers`.

### 8. Billing: wallet → rent

1. `POST /api/v1/wallet/payment-methods/`
2. `PUT /api/v1/wallet/payment-methods/{id}/default`
3. `POST /api/v1/wallet/payments/stripe/checkout` (crypto: `POST /api/v1/wallet/payments/crypto/invoice`)
4. `GET /api/v1/wallet/payments/stripe/intents/{id}` (crypto: `GET /api/v1/wallet/payments/crypto/intents/{id}`)
5. `GET /api/v1/wallet/balances`
6. `POST /api/v1/wallet/transfers`
7. `GET /api/v1/wallet/transactions`
8. `GET /api/v1/servers/available`
9. `POST /api/v1/servers/{id}/rent`
10. `GET /api/v1/rentals`
11. `POST /api/v1/rentals/{id}/extend`
12. `POST /api/v1/servers/{serverId}/execute-command`

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `POST /api/v1/users/auth/logout` is a logout-ALL for JWTs — it bumps `session_generation`, invalidating every access + refresh JWT issued before that moment (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `DELETE /api/v1/auth/tokens/{id}`). `POST /api/v1/users/auth/refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header — the generated SDK / CLI auto-refresh only send the body, so the typed call typically 401s; for headless flows mint a long-lived `POST /api/v1/auth/tokens` instead, or call refresh manually with both the body and the header set to the same refresh token.
- `GET /api/v1/auth/available-regions` returns `r.data.regions` (single-wrapped, like every other endpoint — older docs incorrectly called it doubly-wrapped).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user, the controller silently overwrites the password and re-sends the verification email; for a verified user it's a no-op. Do NOT probe with this.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — like every other kit it accepts the bare per-container kit URL directly, with no auth headers. The `POST /api/v1/containers/{id}/authorize` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- Auth tokens rejected on admin endpoints (JWT only); `x-impersonate-user` JWT only.
- `POST /api/v1/containers/{id}/{operation}` polymorphic: `POST /api/v1/containers/{id}/{operation}` from `ContainerOperation` enum (not body field).
- No admin concept on user-owned resources; permission row IS the authorization.
- Kit URL `<projectId>-<containerId>-<kit>-1.<server>.containers.hoody.com` IS the credential; watch containerId leakage.
- `GET /api/v1/containers/{id}/proxy/services` returns `services: []` often; pass `program: 'exec'` to `POST /api/v1/proxy/aliases`.
- `GET /api/v1/wallet/invoices/` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `GET /api/v1/ip` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `GET /api/v1/containers/{id}/storage/incoming` is container-scoped; pass `containerId`.
- `POST /api/v1/auth/verify-email` body has `token` + optional `response_mode` + `code_challenge` only — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `POST /api/v1/users/auth/2fa/verify`.
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
- Always-200 — `POST /api/v1/auth/forgot-password`, `POST /api/v1/auth/resend-verification`, duplicate-`POST /api/v1/auth/signup`; do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

### `activity` (2) — Activity Logs

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/users/auth/activity/stats` | Get activity stats |  |
| `GET /api/v1/users/auth/activity` | Get activity logs | `?page` `?limit` `?start_date` `?end_date` `?errors_only` `?min_status` `?max_status` `?method` `?realm_id` |

**Param notes:**

- `page` — Page number
- `limit` — Results per page
- `start_date` — Filter logs after this date
- `end_date` — Filter logs before this date
- `errors_only` — Show only errors (status >= 400)
- `min_status` — Minimum status code
- `max_status` — Maximum status code
- `method` — Filter by HTTP method
- `realm_id` — Filter by realm ID

### `ai` (1) — AI

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/ai/models` | List available AI models (Hoody catalog) |  |

### `authTokens` (12) — Auth Tokens

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/auth/tokens/{id}/add-realm` | Add realm to auth token | `body*` |
| `POST /api/v1/auth/tokens/{id}/copy` | Copy auth token | `body*` |
| `POST /api/v1/auth/tokens` | Create a new auth token | `body*` |
| `DELETE /api/v1/auth/tokens/{id}` | Delete auth token |  |
| `GET /api/v1/auth/tokens/{id}` | Get auth token by ID |  |
| `GET /api/v1/auth/tokens/me` | Get current auth token details |  |
| `GET /api/v1/auth/tokens/public-profiles/{public_key}` | Get auth token public profile by public key |  |
| `GET /api/v1/auth/tokens` | List auth tokens |  |
| `GET /api/v1/auth/tokens/templates` | List permission templates |  |
| `POST /api/v1/auth/tokens/{id}/remove-realm` | Remove realm from auth token | `body*` |
| `PUT /api/v1/auth/tokens/{id}` | Update auth token | `body*` |
| `PUT /api/v1/auth/tokens/me/public-profile` | Update current auth token public profile | `body*` |

**Param notes:**

- `public_key` — ED25519 public key to resolve

**Body shapes:**

- `POST /api/v1/auth/tokens/{id}/add-realm` body — `{ realm_id*: string, otp_code: string }`
  - `realm_id` — Realm ID to add to the token
  - `otp_code` — TOTP code (6 digits) or backup code (10 alphanumeric). Required if 2FA is enabled on the account and authenticating via JWT.
- `POST /api/v1/auth/tokens/{id}/copy` body — `{ alias: string, expires_at: string | "today" | "tomorrow" | number | null, otp_code: string }`
  - `alias` — Optional alias for the copied token. If omitted, a deterministic alias like "<source> copy" is generated.
  - `expires_at` — Optional expiration override for the copied token. If omitted, source expiration is copied when still in the future.
- `POST /api/v1/auth/tokens` body — `{ alias: string, public_key: string | null, public_storage: object | null, ip_whitelist: string[] | string, permission_template: string, permissions: { containers: object, projects: object, financial: object, resources: object, admin: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, deny_reauthorization: bool, expires_at: string | "today" | "tomorrow" | number, otp_code: string }`
  - `alias` — User-friendly alias for the token. If not provided, a random animal name will be generated (e.g., "clever-dolphin").
  - `public_key` — Optional ED25519 public key used for client identity derivation
  - `public_storage` — Public JSON profile storage attached to the token public_key (max 64KB)
  - `ip_whitelist` — IP whitelist for this token. Accepts an array of IPv4 addresses/CIDR ranges, a comma-separated string, or "*" wildcard. Defaults to "*" (allow all) if not provided.
  - `permission_template` — Optional permission template to apply. If provided, it takes precedence over `permissions`. Templates: full_access, external_customer, dev_team, finance_team, read_only.
  - `permissions` — Fine-grained permissions for this token. Any missing permission path defaults to false (deny).
  - `realm_ids` — List of realm IDs this token is restricted to. If provided, the token can ONLY be used on these specific realm subdomains.
  - `allow_no_realm` — Whether this token can be used without a realm scope (e.g. on base domain). Defaults to true (server-side). Set to false to create a strict sub-account token that ONLY works on specific realms.
  - `vault_access` — Whether this token can access user vault endpoints. Defaults to false (server-side) for security.
  - `event_access` — Whether this token can access real-time event streams and event history endpoints. Defaults to true (server-side).
  - `deny_reauthorization` — Opt-in least-privilege belt for scoped/script tokens. When true, the server strips the `resources.create_tokens` and `resources.vault` permission leaves from the resolved token, forces `vault_access` to false, and forces a bounded (non-permanent) expiry — producing a locked-down leaf that can never…
  - `expires_at` — Token expiration. Can be an ISO string, Unix timestamp, "today", or "tomorrow". If not provided, the token never expires.
- `POST /api/v1/auth/tokens/{id}/remove-realm` body — `{ realm_id*: string, otp_code: string }`
  - `realm_id` — Realm ID to remove from the token
- `PUT /api/v1/auth/tokens/{id}` body — `{ alias: string, public_key: string | null, public_storage: object | null, ip_whitelist: string[] | string, permissions: { containers: object, projects: object, financial: object, resources: object, admin: object }, realm_ids: string[], allow_no_realm: bool, vault_access: bool, event_access: bool, expires_at: string | "today" | "tomorrow" | number | null, is_enabled: bool, otp_code: string }`
  - `alias` — User-friendly alias for the token
  - `realm_ids` — List of realm IDs this token is restricted to
  - `allow_no_realm` — Whether this token can be used without a realm scope
  - `vault_access` — Whether this token can access user vault endpoints
  - `event_access` — Whether this token can access real-time event streams and event history endpoints
  - `expires_at` — Token expiration. Can be an ISO string, Unix timestamp, "today", "tomorrow", or null.
  - `is_enabled` — Enable or disable the token
- `PUT /api/v1/auth/tokens/me/public-profile` body — `{ public_key: string | null, public_storage: object | null } (at least one of: public_key | public_storage required)`

### `authentication` (28) — Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/users/auth/identity-claim` | Issue a fresh audience-bound identity claim | `body*` |
| `POST /api/v1/auth/forgot-password` | Request password reset | `body*` |
| `GET /api/v1/auth/available-regions` | Get available server regions |  |
| `GET /api/v1/users/auth/me` | Get current user profile |  |
| `GET /api/v1/users/me` | Get current user profile (alias of /users/auth/me) |  |
| `GET /api/v1/auth/config` | Get the public sign-in configuration |  |
| `GET /api/v1/auth/github/callback` | GitHub OAuth callback | `?code` `?state*` `?error` `?error_description` `?error_uri` |
| `GET /api/v1/auth/github` | Redirect to GitHub OAuth | `?client` `?intent` `?redirect_uri*` `?code_challenge*` `?invite_code` |
| `GET /api/v1/auth/google/callback` | Google OAuth callback | `?code` `?state*` `?error` `?error_description` `?error_uri` |
| `GET /api/v1/auth/google` | Redirect to Google OAuth | `?client` `?redirect_uri*` `?code_challenge*` `?invite_code` |
| `POST /api/v1/users/auth/login` | Login with username and password | `body*` |
| `POST /api/v1/users/auth/logout` | Logout |  |
| `POST /api/v1/auth/authorize` | Begin a PKCE OAuth authorization | `body*` |
| `POST /api/v1/auth/intent/cancel` | Cancel a pending OAuth AuthIntent or 2FA temp_token |  |
| `GET /api/v1/auth/device/authorize` | Start the device-leg OAuth (cookie + ticket gated) | `?ticket*` `?provider*` |
| `POST /api/v1/auth/device/code` | Start a device authorization flow (RFC-8628-inspired) | `body*` |
| `POST /api/v1/auth/device/deny` | Refuse the device ('Don't authorize') | `body*` |
| `POST /api/v1/auth/device/login` | Password sign-in for the device authorize step (cookie + ticket gated) | `body*` |
| `POST /api/v1/auth/device/token` | Poll for device-flow tokens (RFC-8628-inspired) | `body*` |
| `POST /api/v1/auth/device/verify_code` | Confirm a device user_code (verification page) | `body*` |
| `POST /api/v1/auth/exchange` | Exchange a PKCE authorization code for tokens | `body*` |
| `POST /api/v1/auth/launch/initiate` | Initiate OAuth popup-handoff launch | `body*` |
| `GET /api/v1/auth/launch/start` | Start OAuth popup-handoff via single-use ticket | `?ticket*` |
| `POST /api/v1/users/auth/refresh` | Refresh access token | `body*` |
| `POST /api/v1/auth/resend-verification` | Resend verification email | `body*` |
| `POST /api/v1/auth/reset-password` | Reset password | `body*` |
| `POST /api/v1/auth/signup` | Sign up with email and password | `body*` |
| `POST /api/v1/auth/verify-email` | Verify email address | `body*` |

**Param notes:**

- `error` — Provider-side failure code (e.g. access_denied). Present instead of `code` when the user declines.
- `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Folded into the signed OAuth state so it survives the provider round trip. Unrecognised values are recorded as "unknown".
- `intent` — OAuth intent: login (default). "star_check" is accepted but ignored (retired).
- `redirect_uri` — Frontend URL to redirect to after OAuth completes (must be on an allowed domain)
- `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier). Required — all OAuth flows must use PKCE post-migration.
- `invite_code` — Optional invite code ("coupon") captured from the signup link. Normalized and hashed at redirect time — only the hash travels in the OAuth state, never the raw code. Memorized hash-only on a NEW account and applied automatically; not validated here.
- `ticket` — One-shot ticket from /launch/initiate response

**Body shapes:**

- `POST /api/v1/users/auth/identity-claim` body — `{ audience*: string, expires_in: int }`
  - `audience` — Consumer identifier this claim is bound to (e.g. your app hostname). Verifiers reject the claim unless they expect exactly this audience. Printable ASCII, no whitespace or double quotes.
  - `expires_in` — Requested claim lifetime in seconds. Clamped to [60, min(server ceiling, remaining JWT lifetime)]. Default: server-configured (1h).
- `POST /api/v1/auth/forgot-password` body — `{ email*: string }`
  - `email` — Email address associated with the account
- `POST /api/v1/users/auth/login` body — `{ username: string, email: string, password*: string, response_mode: "intent" | "tokens", client: string, code_challenge: string } (at least one of: username | email required)`
  - `username` — Username (alphanumeric characters, underscores, and hyphens)
  - `email` — Email address (alternative to username)
  - `password` — Account password. Must be at least 8 characters with uppercase, lowercase, and number.
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange (hosted auth UI only; server forces intent mode for requests from the hosted UI origin with code_challenge).
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects authentication.
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of the code_verifier). Required when response_mode=intent.
- `POST /api/v1/auth/authorize` body — `{ code_challenge*: string, redirect_uri*: string }`
- `POST /api/v1/auth/device/code` body — `{ client_name: string, client: string, code_challenge: string }`
  - `client_name` — Shown on the verification page as "X is requesting access"
  - `code_challenge` — Optional PKCE on the device flow itself; if present the poll REQUIRES the verifier
- `POST /api/v1/auth/device/deny` body — `{ ticket*: string }`
  - `ticket` — device_verify_ticket from /device/verify_code
- `POST /api/v1/auth/device/login` body — `{ ticket*: string, username: string, email: string, password*: string } (at least one of: username | email required)`
  - `username` — Username (alternative to email)
  - `password` — Account password
- `POST /api/v1/auth/device/token` body — `{ device_code*: string, code_verifier: string }`
- `POST /api/v1/auth/device/verify_code` body — `{ user_code*: string }`
  - `user_code` — XXXX-XXXX user code (dashes optional)
- `POST /api/v1/auth/exchange` body — `{ code*: string, code_verifier*: string, redirect_uri*: string }`
- `POST /api/v1/auth/launch/initiate` body — `{ provider*: "github" | "google", client: string, code_challenge*: string, state_id*: string }`
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier, exactly 43 chars)
  - `state_id` — Per-attempt UUID v4 — plumbed through state JWT, cookie name, fragment, message filter
- `POST /api/v1/users/auth/refresh` body — `{ refreshToken*: string }`
  - `refreshToken` — Valid refresh token from previous login/refresh
- `POST /api/v1/auth/resend-verification` body — `{ email*: string }`
  - `email` — Email address to resend verification to
- `POST /api/v1/auth/reset-password` body — `{ token*: string, password*: string }`
  - `token` — Password reset token from the email link
  - `password` — New password (min 12 chars)
- `POST /api/v1/auth/signup` body — `{ email*: string, password*: string, region: string, invite_code: string, client: string }`
  - `email` — Email address for the new account
  - `password` — Password (min 12 chars, must include uppercase, lowercase, number, and special char)
  - `region` — Optional preferred server region (e.g., "eu-west"). If omitted, auto-assigned by GeoIP proximity.
  - `invite_code` — Optional invite code ("coupon") captured from the signup link. Memorized (hash-only) and applied automatically after email verification — not validated at signup.
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects account behaviour.
- `POST /api/v1/auth/verify-email` body — `{ client: string, token*: string, response_mode: "intent" | "tokens", code_challenge: string }`
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects verification.
  - `token` — Verification token from the email link
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange.
  - `code_challenge` — PKCE code_challenge (base64url SHA-256 of code_verifier). Required when response_mode=intent.

### `containers` (23) — Containers

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/authorize` | Authorize Container Access |  |
| `POST /api/v1/containers/{id}/copy` | Copy a container | `body*` |
| `POST /api/v1/projects/{id}/containers` | Create a new container | `body*` |
| `POST /api/v1/containers/{id}/snapshots` | Create container snapshot | `body*` |
| `DELETE /api/v1/containers/{id}` | Delete a container |  |
| `DELETE /api/v1/containers/{id}/snapshots/{name}` | Delete container snapshot |  |
| `GET /api/v1/containers/{id}` | Get a container by ID | `?runtime` `?include_proxy_domains` `?include_proxy_permissions` |
| `GET /api/v1/containers/{id}/network` | Get container network configuration |  |
| `GET /api/v1/containers/{id}/stats` | Get container resource statistics |  |
| `GET /api/v1/containers/{id}/status-logs` | Get status logs for a container | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/containers/` | Get all containers | `?page` `?limit` `?sort_by` `?sort_order` `?realm_id` `?runtime` `?include_proxy_domains` `?include_proxy_permissions` `?include_prespawn` `?include_expired` `?include_deleting` |
| `GET /api/v1/projects/{id}/containers` | Get all containers for a project | `?page` `?limit` `?sort_by` `?sort_order` `?runtime` `?include_proxy_domains` `?include_proxy_permissions` `?include_prespawn` `?include_deleting` |
| `GET /api/v1/containers/{id}/snapshots` | Get container snapshots |  |
| `POST /api/v1/containers/{id}/{operation}` | Manage container |  |
| `DELETE /api/v1/containers/{id}/network` | Remove container network configuration |  |
| `PUT /api/v1/containers/{id}/snapshots/{name}` | Restore container from snapshot |  |
| `PUT /api/v1/containers/{id}/kvm` | Enable or disable /dev/kvm (run VMs in the container) | `body*` |
| `POST /api/v1/containers/{id}/network/start` | Start container network proxy/blocking |  |
| `POST /api/v1/containers/{id}/network/stop` | Stop container network proxy/blocking |  |
| `POST /api/v1/containers/{id}/sync` | Sync a copied container with its source |  |
| `PUT /api/v1/containers/{id}` | Update a container | `body*` |
| `PUT /api/v1/containers/{id}/network` | Update container network configuration | `body*` |
| `PUT /api/v1/containers/{id}/snapshots/{name}/alias` | Update snapshot alias | `body*` |

**Param notes:**

- `runtime` — Include live runtime information. Accepts "true", "false", or a URL-encoded JSON string like `{"displays":true}`. An empty JSON object `{}` fetches all info. Results are cached for 2 seconds to prevent abuse.
- `include_proxy_domains` — Include proxy domains (aliases) for this container. When true, adds a proxy_domains array to the container object.
- `include_proxy_permissions` — Include the full proxy-permissions documents (container-level proxy_permissions and parent-project-level project_proxy_permissions) for each container. Returns proxy authentication group configuration including credentials — request only when explicitly needed. Auth tokens additionally require the resources.proxy_aliases permission.
- `page` — Page number for pagination - starts from 1
- `limit` — Number of containers to return per page - maximum 100 items
- `sort_by` — Field to sort containers by
- `sort_order` — Sort direction - ascending or descending
- `realm_id` — Filter by realm ID. Only returns containers that belong to this realm. Alternative to using realm subdomain in URL.
- `include_proxy_domains` — Include proxy domains (aliases) for each container. When true, adds a proxy_domains array to each container object.
- `include_prespawn` — Include prespawn containers in the listing. By default, prespawn containers are excluded from results.
- `include_expired` — Include containers that have expired due to server termination. By default, expired containers are excluded from results.
- `include_deleting` — Include containers currently being deleted. By default, deleting containers are excluded from results.
- `include_prespawn` — Include prespawn containers in the listing. By default, prespawn containers are excluded.

**Body shapes:**

- `POST /api/v1/containers/{id}/copy` body — `{ target_project_id*: string, target_server_id: string, name: string, ssh_public_key: string|null, source_snapshot: string, copy_firewall_rules: bool=false, copy_network_rules: bool=false, kvm: bool, dev_kvm: bool }`
  - `target_project_id` — ID of the project where the copy will be created
  - `target_server_id` — ID of the server where the copy will be created (defaults to source server)
  - `name` — Name for the copied container (auto-generated if not provided)
  - `ssh_public_key` — SSH public key for the copied container (must be unique, not inherited from source)
  - `source_snapshot` — Specific snapshot to copy from (copies latest state if not provided)
  - `copy_firewall_rules` — Whether to copy firewall rules (ACL) from source container to target container
  - `copy_network_rules` — Whether to copy network rules/settings from source container to target container
  - `kvm` — Grant the COPY /dev/kvm passthrough (run full VMs). The copy NEVER inherits the source's KVM grant — the source device is always stripped — so this decides KVM for the copy independently, granting it afresh on the TARGET server. Available on rented / dedicated (bare-metal) targets ONLY (never free…
  - `dev_kvm` — Accepted alias of `kvm` on input (`kvm` wins if both are sent and they must agree).
- `POST /api/v1/projects/{id}/containers` body — `{ server_id*: string, name: string, color: string, container_image: string|null, ai: bool=true, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, hoody_kit: bool=true, dev_kit: bool, kvm: bool, dev_kvm: bool, autostart: bool=true, ramdisk: bool=true, cache: bool=true, cache_image: bool=false, prespawn: bool=false, bypass_prespawn: bool=false, realm_ids: string[] }`
  - `name` — Name for the container. Must be 3-100 characters, alphanumeric with hyphens and underscores. Omit or use "rand" to generate a random name.
  - `color` — HEX color for the container (e.g., #FF0000 or FF0000). If not provided, a random color will be generated. The # prefix will be added automatically if missing, and the color will be converted to uppercase.
  - `container_image` — Container image to use. If null or not provided, will use the default configured image. Shorthand is resolved automatically: a bare distribution name or a hyphenated version ("debian", "debian-13") becomes the canonical base image ("debian/13"), as do the "debian:13" and "debian 13" forms.
  - `ai` — Whether AI features are enabled (default: true)
  - `ssh_public_key` — SSH public key for container access. SSH public keys must be unique per container (one container per key). If not provided, will inherit from project defaults.
  - `comment` — Optional comment for the container (max 16000 characters)
  - `hoody_kit` — Enable all Hoody Kit features (extra-apt-sources, basic-packages, hoody-daemon, sudo-env, remove-snapd, webview, user, hoody-ai, ttyd)
  - `dev_kit` — Enable dev_kit development tools in the container. Defaults to true when hoody_kit is true, false when hoody_kit is false (unless explicitly set). Cannot be updated after creation.
  - `kvm` — Enable /dev/kvm passthrough (run full VMs inside the container) at creation. Available on rented / dedicated (bare-metal) servers ONLY — never free tier — and rejected (403) on a free server. Defaults to false. Can also be toggled later via PUT /containers/{id}/kvm on a stopped container.
  - `autostart` — Whether the container should start automatically on host boot (default: true)
  - `ramdisk` — Whether to mount a ramdisk at /ramdisk in the container (default: true). The ramdisk KEEPS data when you stop/start/reboot the container, but LOSES data if the physical host server reboots. Can store up to 50% of total host memory. Ideal for security (data automatically wiped on server seizure), te…
  - `cache` — Enable use of cached images during container creation (--use-cache-image). When false, no cache options are added.
  - `cache_image` — Force the creation of a new cached image from the container image. This option is only available to admins or the owner of the image.
  - `prespawn` — INTERNAL — not user-settable. Prespawn cache containers are provisioned only by the system pool producer. Passing `true` is rejected (403); an explicit `false` is accepted.
  - `bypass_prespawn` — Bypass prespawn container claiming and create a fresh container directly. By default (false), the system will attempt to claim a matching prespawn container if available.
  - `realm_ids` — Realm IDs to assign this container to. If creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids. Note: Containers can have different realm membership than their parent project.
- `POST /api/v1/containers/{id}/snapshots` body — `{ alias: string, expiry: int }`
  - `alias` — Optional user-friendly alias for the snapshot
  - `expiry` — Expiry in days (1–3650). Values outside this range are rejected before the snapshot is created.
- `PUT /api/v1/containers/{id}/kvm` body — `{ kvm: bool, dev_kvm: bool }`
  - `kvm` — Enable (true) or disable (false) /dev/kvm passthrough (run VMs in the container). Rented/dedicated servers only; the container must be stopped.
- `PUT /api/v1/containers/{id}` body — `{ name: string, color: string, ai: bool, autostart: bool, ramdisk_scope: "container" | "project", ramdisk: bool, environment_vars: { [key: string]: string }, ssh_public_key: string|null, comment: string|null, realm_ids: string[] }`
  - `name` — Human-readable name for the container - must be unique within the project
  - `ai` — Whether AI features are enabled. If omitted, the current value is preserved.
  - `autostart` — Whether the container starts automatically on host boot. If omitted, the current value is preserved.
  - `ramdisk_scope` — Sharing scope for /ramdisk. `container` (default) mounts only private storage. `project` additionally mounts /ramdisk/project, shared with your other containers in this project ON THE SAME SERVER (a RAM disk cannot span servers). Refused when the project has other members, because project access is…
  - `ramdisk` — Whether to mount a ramdisk at /ramdisk. If omitted, the current value is preserved. Backed by a shared per-server memory pool (512 MiB by default, never more than 50% of the server memory) shared with your other containers on that server. Data survives container restarts but is LOST on a host reboo…
  - `environment_vars` — Environment variables to set in the container as key-value pairs
  - `ssh_public_key` — SSH public key for container access. SSH public keys must be unique per container (one container per key). Re-sending the same key for the same container is treated as a no-op. Set to null to clear or inherit from project defaults.
  - `comment` — Optional comment for the container (max 16000 characters). Set to null to clear existing comment.
  - `realm_ids` — Update realm membership for this container. Containers can have different realm membership than their parent project. Only unrestricted tokens and admin users can modify realm_ids; realm-restricted tokens cannot change realm membership for security.
- `PUT /api/v1/containers/{id}/network` body — `{ type*: "socks5" | "http" | "https" | "block", proxy: string, country: string, city: string, region: string, comment: string, dns_servers: string[] }`
  - `type` — Network configuration type - proxy type or block for traffic blocking
  - `proxy` — Proxy server URL (required for non-block types), e.g. "socks5://proxy.example.com:1080". Credentials may be embedded as userinfo ("socks5://host:port") to set/replace them; omitting userinfo on an UNCHANGED endpoint preserves the stored credentials (write-only secret). The response never echoes use…
  - `country` — Optional country for geographical proxy selection
  - `city` — Optional city for geographical proxy selection
  - `region` — Optional region for geographical proxy selection
  - `comment` — Optional comment describing the network configuration
  - `dns_servers` — Custom DNS servers (max 4, defaults to ["1.1.1.1", "8.8.8.8"])
- `PUT /api/v1/containers/{id}/snapshots/{name}/alias` body — `{ alias*: string|null }`
  - `alias` — New alias for the snapshot (set to null to remove alias)

### `env` (4) — Container Environment

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/containers/{id}/env` | Bulk set container environment variables | `body*` |
| `DELETE /api/v1/containers/{id}/env/{key}` | Delete a single environment variable |  |
| `GET /api/v1/containers/{id}/env` | List container environment variables |  |
| `PUT /api/v1/containers/{id}/env/{key}` | Set a single environment variable | `body*` |

**Param notes:**

- `key` — Environment variable key

**Body shapes:**

- `PUT /api/v1/containers/{id}/env` body — `{ [key: string]: string }`
- `PUT /api/v1/containers/{id}/env/{key}` body — `{ value*: string }`
  - `value` — Value for the environment variable

### `events` (6) — Events

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/events` | Bulk delete events | `body*` |
| `POST /api/v1/events/cleanup` | Cleanup old events | `body*` |
| `DELETE /api/v1/events/{id}` | Delete a single event |  |
| `GET /api/v1/events/{id}` | Get event details by ID |  |
| `GET /api/v1/events/stats` | Get event statistics | `?start_date` `?end_date` `?realm_id` |
| `GET /api/v1/events` | List event history | `?limit` `?offset` `?sort_by` `?sort_order` `?event_type` `?resource_type` `?resource_id` `?project_id` `?container_id` `?start_date` `?end_date` `?realm_id` |

**Param notes:**

- `start_date` — Start of time range
- `end_date` — End of time range
- `realm_id` — Filter by realm
- `limit` — Number of events to return (max 500)
- `offset` — Number of events to skip
- `sort_by` — Field to sort by
- `sort_order` — Sort direction
- `event_type` — Filter by specific event type
- `resource_type` — Filter by resource type
- `resource_id` — Filter by specific resource ID
- `project_id` — Filter by project ID
- `container_id` — Filter by container ID
- `start_date` — Filter events after this timestamp
- `end_date` — Filter events before this timestamp
- `realm_id` — Filter by realm ID

**Body shapes:**

- `DELETE /api/v1/events` body — `{ event_type: "container.creating" | "container.running" | "container.stopped" | "container.failed" | "container.deleting" | "auth.token.deleted" | "container.autostart_enabled" | "container.autostart_disabled" | …(45 values), resource_type: "container" | "storage_share" | "notification" | "project" | "server" | "firewall" | "proxy_alias" | "proxy_permissions" | …(12 values), resource_id: string, before_date: string, realm_id: string }`
  - `event_type` — Delete all events of this type
  - `resource_type` — Delete all events for this resource type
  - `resource_id` — Delete all events for this resource
  - `before_date` — Delete events before this date
  - `realm_id` — Delete events in this realm
- `POST /api/v1/events/cleanup` body — `{ retention_days*: int }`
  - `retention_days` — Delete events older than this many days

### `firewall` (8) — Container Firewall

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/firewall/egress` | Add Egress Rule | `body*` |
| `POST /api/v1/containers/{id}/firewall/ingress` | Add Ingress Rule | `body*` |
| `GET /api/v1/containers/{id}/firewall/rules` | List container firewall rules |  |
| `DELETE /api/v1/containers/{id}/firewall/egress` | Remove Egress Rule(s) | `body*` |
| `DELETE /api/v1/containers/{id}/firewall/ingress` | Remove Ingress Rule(s) | `body*` |
| `POST /api/v1/containers/{id}/firewall/reset` | Reset container firewall |  |
| `PATCH /api/v1/containers/{id}/firewall/egress` | Toggle Egress Rule State | `body*` |
| `PATCH /api/v1/containers/{id}/firewall/ingress` | Toggle Ingress Rule State | `body*` |

**Body shapes:**

- `POST /api/v1/containers/{id}/firewall/egress` body — `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, destination: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `action` — Action to take: allow (permit), reject (deny with response), drop (deny silently)
  - `protocol` — Network protocol
  - `description` — Human-readable rule description
  - `destination_port` — Port number, range (80-90), or comma-separated list (80,443). Required for TCP/UDP.
  - `destination` — Destination IPv4 address or CIDR range. Use 0.0.0.0/0 for any destination.
  - `source_port` — Source port filter (rarely used)
  - `state` — Rule state (defaults to enabled)
  - `icmp_type` — ICMP type number
  - `icmp_code` — ICMP code number
- `POST /api/v1/containers/{id}/firewall/ingress` body — `{ action*: "allow" | "reject" | "drop", protocol*: "tcp" | "udp" | "icmp4", description*: string, destination_port: string, source: string, source_port: string, state: "enabled" | "disabled", icmp_type: string, icmp_code: string }`
  - `source` — Source IPv4 address or CIDR range. Use 0.0.0.0/0 for any source.
  - `icmp_type` — ICMP type number (e.g., 8 for echo request/ping)
- `DELETE /api/v1/containers/{id}/firewall/egress` body — `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, destination: string, source_port: string, description: string, state: "enabled" | "disabled"="enabled", icmp_type: string, icmp_code: string }`
  - `all` — Remove all matching rules (default: first match only). Set to true with no other filters to remove all egress rules.
  - `action` — Action for matching traffic
  - `protocol` — Protocol type
  - `destination_port` — Destination port, range (e.g., 80-90), or list (e.g., 80,443)
  - `destination` — Destination IPv4/CIDR address(es)
  - `source_port` — Source port, range, or list
  - `description` — Rule description
  - `state` — Rule state
  - `icmp_type` — ICMP type number for icmp4 protocol
  - `icmp_code` — ICMP code number for icmp4 protocol
- `DELETE /api/v1/containers/{id}/firewall/ingress` body — `{ all: bool, action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source: string, source_port: string, description: string, state: "enabled" | "disabled"="enabled", icmp_type: string, icmp_code: string }`
  - `all` — Remove all matching rules (default: first match only). Set to true with no other filters to remove all ingress rules.
  - `source` — Source IPv4/CIDR address(es)
- `PATCH /api/v1/containers/{id}/firewall/egress` body — `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, destination: string, description: string, icmp_type: string, icmp_code: string }`
  - `state` — New state for the rule
- `PATCH /api/v1/containers/{id}/firewall/ingress` body — `{ state*: "enabled" | "disabled", action: "allow" | "reject" | "drop", protocol: "tcp" | "udp" | "icmp4", destination_port: string, source_port: string, source: string, description: string, icmp_type: string, icmp_code: string }`

### `images` (7) — Container Images

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/images/public/{id}` | Get public image details |  |
| `GET /api/v1/images/{id}/icon` | Get image icon |  |
| `POST /api/v1/images/import/{id}` | Import free image |  |
| `GET /api/v1/images/user` | List user images | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/images/public` | List public images | `?os` `?architecture` `?min_price` `?max_price` `?min_rating` `?max_rating` `?search` `?page` `?limit` `?sort_by` `?sort_order` |
| `POST /api/v1/images/purchase/{id}` | Purchase image |  |
| `POST /api/v1/images/rate/{id}` | Rate image | `body*` |

**Param notes:**

- `page` — Page number for pagination - starts from 1
- `limit` — Number of images to return per page - maximum 100 items
- `sort_by` — Field to sort user images by - currently only supports creation date
- `sort_order` — Sort direction - ascending or descending
- `os` — Filter images by operating system - e.g., ubuntu, debian, alpine, centos
- `architecture` — Filter images by CPU architecture - e.g., amd64, arm64, armhf
- `min_price` — Minimum price filter for paid images - 0 includes free images
- `max_price` — Maximum price filter for paid images - useful for budget constraints
- `min_rating` — Minimum average rating filter - filters images with rating >= this value (0-5 stars)
- `max_rating` — Maximum average rating filter - filters images with rating <= this value (0-5 stars)
- `search` — Search term to filter images by name, description, or tags
- `sort_by` — Field to sort images by - name, date added, price, or average rating

**Body shapes:**

- `POST /api/v1/images/rate/{id}` body — `{ rating*: number }`
  - `rating` — Rating for the image from 0 to 5 stars

### `meta` (2) — Meta

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/meta/public-key` | Get Hoody API Signing Public Key |  |
| `GET /api/v1/meta/social-stats` | Get Hoody Social Counters |  |

### `notifications` (4) — Notifications

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/` | Get all notifications for the authenticated user |  |
| `GET /api/v1/notifications/public` | Get all public notifications |  |
| `PUT /api/v1/notifications/read-all` | Mark all notifications as read |  |
| `PUT /api/v1/notifications/{id}/read` | Mark a notification as read |  |

### `poolInvitations` (3) — Pool Invitations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools/{id}/accept` | Accept invitation |  |
| `GET /api/v1/pools/invitations/pending` | List pending invitations |  |
| `POST /api/v1/pools/{id}/reject` | Reject invitation |  |

### `poolMembers` (3) — Pool Members

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools/{id}/members` | Invite member | `body*` |
| `DELETE /api/v1/pools/{id}/members/{userId}` | Remove member |  |
| `PUT /api/v1/pools/{id}/members/{userId}` | Update member role | `body*` |

**Body shapes:**

- `POST /api/v1/pools/{id}/members` body — `{ username*: string, role*: "admin" | "user" }`
  - `username` — Username of the user to invite
- `PUT /api/v1/pools/{id}/members/{userId}` body — `{ role*: "admin" | "user" }`

### `pools` (5) — Pools

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/pools` | Create pool | `body*` |
| `DELETE /api/v1/pools/{id}` | Delete pool |  |
| `GET /api/v1/pools/{id}` | Get pool details |  |
| `GET /api/v1/pools` | List user pools |  |
| `PUT /api/v1/pools/{id}` | Update pool | `body*` |

**Body shapes:**

- `POST /api/v1/pools` body — `{ name*: string, description: string, settings: object }`
- `PUT /api/v1/pools/{id}` body — `{ description: string, settings: object }`

### `projects` (10) — Projects

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/projects/{id}/permissions` | Grant project access | `body*` |
| `POST /api/v1/projects/` | Create a new project | `body*` |
| `DELETE /api/v1/projects/{id}` | Delete project | `?include_deleted_items` |
| `GET /api/v1/projects/{id}` | Get project by ID | `?include_permissions` |
| `GET /api/v1/projects/{id}/stats` | Get statistics for all containers in a project |  |
| `GET /api/v1/projects/` | List all projects | `?page` `?limit` `?sort_by` `?sort_order` `?realm_id` |
| `GET /api/v1/projects/{id}/permissions` | List project permissions | `?page` `?limit` `?sort_by` `?sort_order` |
| `DELETE /api/v1/projects/{id}/permissions/{permissionId}` | Revoke project access |  |
| `PUT /api/v1/projects/{id}` | Update project | `body*` |
| `PUT /api/v1/projects/{id}/permissions/{permissionId}` | Update project permission | `body*` |

**Param notes:**

- `include_deleted_items` — Include a lightweight list of deleted container IDs/names in the response for confirmation UX.
- `include_permissions` — Include project permissions with user details in response
- `page` — Page number (1-based)
- `limit` — Items per page (max 100)
- `sort_by` — Field to sort by
- `sort_order` — Sort direction
- `realm_id` — Filter by realm ID. Only returns projects that belong to this realm. Alternative to using realm subdomain in URL.

**Body shapes:**

- `POST /api/v1/projects/{id}/permissions` body — `{ user_id*: string, permission_level*: "read" | "edit" | "delete" }`
  - `user_id` — User ID to grant access to
  - `permission_level` — Access level: "read", "edit", or "delete"
- `POST /api/v1/projects/` body — `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`
  - `alias` — Human-readable project name. Must be unique across your projects (e.g., "Production", "Development", "Client-ABC").
  - `color` — HEX color code for visual organization in dashboards. Accepts 3-digit (#RGB) or 6-digit (#RRGGBB). The # prefix is auto-added if missing, and the value is auto-normalized to uppercase. If not provided, a random color is generated.
  - `max_containers` — Maximum number of containers allowed in this project. Set to null for unlimited. This quota is enforced during container creation.
  - `realm_ids` — Realm IDs to assign this project to. If you are creating from a realm subdomain (e.g., https://realm-abc.api.hoody.com), the subdomain realm is automatically included and merged with any explicitly provided realm_ids.
- `PUT /api/v1/projects/{id}` body — `{ alias*: string, color: string, max_containers: number|null, realm_ids: string[] }`
  - `alias` — New project name. Must be unique across your projects.
  - `color` — New HEX color code. Auto-normalized to uppercase with # prefix.
  - `realm_ids` — Update realm membership for this project. If updating from a realm subdomain, the subdomain realm is automatically preserved and merged. Only unrestricted tokens and admin users can modify realm_ids; realm-restricted tokens cannot change realm membership.
- `PUT /api/v1/projects/{id}/permissions/{permissionId}` body — `{ permission_level*: "read" | "edit" | "delete" }`
  - `permission_level` — New permission level

### `proxyAliases` (6) — Proxy Aliases

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/proxy/aliases` | Create a new proxy alias | `body*` |
| `DELETE /api/v1/proxy/aliases/{id}` | Delete proxy alias |  |
| `GET /api/v1/proxy/aliases/{id}` | Get proxy alias by ID |  |
| `GET /api/v1/proxy/aliases` | List proxy aliases | `?project_id` `?container_id` `?realm_id` `?enabled` `?expired` |
| `PATCH /api/v1/proxy/aliases/{id}/state` | Enable or disable proxy alias | `body*` |
| `PATCH /api/v1/proxy/aliases/{id}` | Update proxy alias | `body*` |

**Param notes:**

- `project_id` — Filter by project ID
- `container_id` — Filter by container ID
- `realm_id` — Filter by realm ID. Alternative to using realm subdomain in URL.
- `enabled` — Filter by enabled status
- `expired` — Filter by expiration: "true" = only expired, "false" = only non-expired

**Body shapes:**

- `POST /api/v1/proxy/aliases` body — `{ container_id*: string, alias: string | null | false, program*: string, port: int, index: int, target_path: string|null, allow_path_override: bool=true, expires_at: string|null, enabled: bool=true }`
  - `container_id` — Container ID that this alias points to. You must own this container.
  - `alias` — Custom alias name (a-z, 0-9, hyphens only, 3-61 chars, cannot start/end with hyphen) OR null/false for auto-generated 48-char hex. Must be unique across every container hosted on the same physical server, including containers owned by other tenants — not merely within your own account. Reserved and…
  - `program` — Which container service the alias targets — a built-in Hoody program ("terminal", "files", "code", "browser", "agent", "display", …) or a transport protocol ("http", "https", "ssh"). To point an alias at an HTTP server you run yourself inside the container (a process started via the daemon, a dev s…
  - `port` — Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000 → http://<container>:3000). Preferred, unambiguous way to point an alias at a raw HTTP/HTTPS server; takes precedence over "index" and over any port embedded in the pr…
  - `index` — Instance index, or (legacy) target port for the "http"/"https" protocol. Defaults to 1. For a built-in Hoody program it selects which running instance to route to (e.g. terminal 2). For "http"/"https" it is the port your server listens on inside the container — but prefer the dedicated "port" field…
  - `target_path` — Base path for routing. Requests to https://{alias}.../ will be forwarded to the container with this path prefix. Auto-prefixed with / if missing.
  - `allow_path_override` — Whether to allow paths beyond target_path. If false, only the exact target_path is accessible.
  - `expires_at` — Optional ISO 8601 expiration date. Alias will be automatically disabled after this date.
  - `enabled` — Whether the alias is initially enabled (defaults to true)
- `PATCH /api/v1/proxy/aliases/{id}/state` body — `{ enabled*: bool }`
  - `enabled` — Set to true to enable, false to disable
- `PATCH /api/v1/proxy/aliases/{id}` body — `{ alias: string, program: string, port: int, index: int, target_path: string|null, allow_path_override: bool, expires_at: string | number | null, enabled: bool }`
  - `alias` — New alias name. Must be unique across every container hosted on the same physical server, including containers owned by other tenants — not merely within your own account. Reserved and rejected: the exact label "containers" (an infrastructure label of the container proxy domain), and anything equal…
  - `program` — Program or protocol the alias targets — a built-in Hoody program ("terminal", "files", "code", …) or a transport protocol ("http", "https", "ssh"). Use "http"/"https" with the "port" field to reach an HTTP server running on that port inside the container (e.g. program "http" + port 3000). The combi…
  - `port` — Target port for the "http"/"https" protocol — the port your server listens on inside the container (e.g. program "http" + port 3000). Preferred over "index"; takes precedence over "index" and over any port embedded in the program string. Ignored for built-in Hoody programs.
  - `index` — Instance index, or (legacy) target port when program is "http"/"https". Prefer the dedicated "port" field; if "port" or a port embedded in the program ("http-3000") is also supplied, that wins over this index.
  - `target_path` — Base path for routing. Set to null to remove path prefix.
  - `allow_path_override` — Whether to allow paths beyond target_path
  - `expires_at` — Expiration date (ISO string, Unix timestamp seconds/ms, or null to remove expiration)
  - `enabled` — Whether the alias is enabled

### `proxyDiscovery` (5) — Proxy Discovery

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/containers/{id}/proxy/services/{service}` | Get merged proxy view for a service |  |
| `GET /api/v1/containers/{id}/proxy/settings` | Get container proxy root settings |  |
| `GET /api/v1/containers/{id}/proxy/groups` | List container proxy groups |  |
| `GET /api/v1/containers/{id}/proxy/services` | List services referenced in proxy config |  |
| `PUT /api/v1/containers/{id}/proxy/settings` | Update container proxy root settings | `H:if-match` `body*` |

**Param notes:**

- `service` — Service name
- `if-match` — file:v<N> ETag precondition

**Body shapes:**

- `PUT /api/v1/containers/{id}/proxy/settings` body — `{ enable_proxy: bool, default: "allow" | "deny" }`

### `proxyHooks` (8) — Proxy Hooks

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/proxy/hooks/{service}` | Append or insert a new hook | `H:if-match` `body*` |
| `DELETE /api/v1/containers/{id}/proxy/hooks/{service}` | Clear all hooks for a service | `H:if-match` |
| `GET /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Get a single hook by id |  |
| `GET /api/v1/containers/{id}/proxy/hooks` | List all proxy hooks for a container |  |
| `GET /api/v1/containers/{id}/proxy/hooks/{service}` | List hooks for a specific service |  |
| `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` | Move a hook to a new position | `H:if-match` `body*` |
| `DELETE /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Remove a hook | `H:if-match` |
| `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` | Replace a hook in place | `H:if-match` `body*` |

**Param notes:**

- `service` — Service name
- `if-match` — file:v<N> ETag precondition
- `hookId` — 26-char Crockford base32 ULID (lowercase)

**Body shapes:**

- `POST /api/v1/containers/{id}/proxy/hooks/{service}` body — `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`
  - `position` — 0-indexed insertion position (POST only)
- `PATCH /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}/position` body — `{ position*: int }`
- `PUT /api/v1/containers/{id}/proxy/hooks/{service}/{hookId}` body — `{ match*: { method: string | string[], path: string, headers: object }, script*: { subdomain: string, execId: string, path*: string }, timeout: int, applies_to: { groups: string[] }, position: int }`

### `proxyPermissionsContainer` (13) — Proxy Permissions Container

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/containers/{id}/proxy/permissions` | Delete container proxy permissions | `H:if-match` |
| `GET /api/v1/containers/{id}/proxy/permissions` | Get container proxy permissions |  |
| `DELETE /api/v1/containers/{id}/proxy/permissions/groups/{groupName}` | Remove container authentication group | `H:if-match` |
| `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a container group | `H:if-match` |
| `DELETE /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a container group | `H:if-match` |
| `PUT /api/v1/containers/{id}/proxy/permissions` | Replace container proxy permissions JSON | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` | Set container group program permission | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (container) | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (container) | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (container) | `H:if-match` `body*` |
| `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (container) | `H:if-match` `body*` |
| `PATCH /api/v1/containers/{id}/proxy/permissions/default` | Update container default proxy permission policy | `H:if-match` `body*` |
| `PATCH /api/v1/containers/{id}/proxy/permissions/state` | Update container proxy enable state | `H:if-match` `body*` |

**Param notes:**

- `if-match` — file:v<N> ETag precondition — read current file_version from GET first
- `groupName` — Group name to remove
- `groupName` — Group name
- `program` — Program name (e.g., http, ssh, files)

**Body shapes:**

- `PUT /api/v1/containers/{id}/proxy/permissions` body — `{ project*: string, container*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: ("user" | "admin")[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool, hooks: { [key: string]: { match*: object, script*: object, timeout: int }[] } }`
  - `project` — Project ID owning this container
  - `container` — Container ID (must match path:id)
  - `groups` — Authentication groups. Key is group name, value is group config.
  - `permissions` — Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists.
  - `default` — Defaults to deny if omitted
  - `enable_proxy` — Enable or disable the proxy. Defaults to true.
  - `hooks` — Per-service proxy hooks. Keys are service names; values are first-match-wins arrays of { match, script, timeout? } rules. Max 8 per service, 32 per file total. Reject-listed services: logs, proxy, workspaces, cdp.
- `PUT /api/v1/containers/{id}/proxy/permissions/permissions/{groupName}` body — `{ program*: string, access*: bool | number | number[] | string | "*" }`
  - `program` — Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
  - `access` — Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. For network programs like "terminal", "ssh", "ui", etc., use boole…
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` body — `{ range*: string }`
  - `range` — IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/jwt` body — `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`
  - `secret` — JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
  - `algorithm` — JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys.
  - `sources` — Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" (param: was removed;)
  - `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/password` body — `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`
  - `username` — Username for authentication. Must match exactly what the client provides.
  - `password` — Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
  - `algorithm` — Hashing algorithm used for password verification. Currently only SHA256 is supported.
  - `salt` — Salt used for password hashing. Should be unique per user/group for security.
- `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/token` body — `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }` — Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.
- `PATCH /api/v1/containers/{id}/proxy/permissions/default` body — `{ default*: "allow" | "deny" }`
  - `default` — Default access policy for unmatched requests
- `PATCH /api/v1/containers/{id}/proxy/permissions/state` body — `{ enable_proxy*: bool }`
  - `enable_proxy` — Enable or disable the proxy entirely

### `proxyPermissionsProject` (13) — Proxy Permissions Project

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/projects/{id}/proxy/permissions` | Delete project proxy permissions | `H:if-match` |
| `GET /api/v1/projects/{id}/proxy/permissions` | Get project proxy permissions |  |
| `DELETE /api/v1/projects/{id}/proxy/permissions/groups/{groupName}` | Remove project authentication group | `H:if-match` |
| `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Remove all program permissions for a project group | `H:if-match` |
| `DELETE /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}/{program}` | Remove a single program permission for a project group | `H:if-match` |
| `PUT /api/v1/projects/{id}/proxy/permissions` | Replace project proxy permissions JSON | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` | Set project group program permission | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` | Set IP authentication group (project) | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` | Set JWT authentication group (project) | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` | Set password authentication group (project) | `H:if-match` `body*` |
| `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` | Set token authentication group (project) | `H:if-match` `body*` |
| `PATCH /api/v1/projects/{id}/proxy/permissions/default` | Update project default proxy permission policy | `H:if-match` `body*` |
| `PATCH /api/v1/projects/{id}/proxy/permissions/state` | Update project proxy enable state | `H:if-match` `body*` |

**Param notes:**

- `if-match` — file:v<N> ETag precondition — read current file_version from GET first
- `groupName` — Group name to remove
- `groupName` — Group name
- `program` — Program name (e.g., http, ssh, files)

**Body shapes:**

- `PUT /api/v1/projects/{id}/proxy/permissions` body — `{ project*: string, groups*: { [key: string]: { type: "jwt" | "password" | "ip" | "token" | "hoody-identity", secret: string, algorithm: "HS256" | "RS256" | "ES256" | "sha256", sources: string[], claims: object, username: string, password: string, salt: string, range: string, header: string, cookie: string, param: string, value: string, audience: string, allow_types: ("user" | "admin")[], users: string[], max_age_seconds: int, expose_type: bool } }, permissions*: { [key: string]: { [key: string]: bool | number | number[] | string | "*" } }, default: "allow" | "deny", enable_proxy: bool }`
  - `project` — Project ID (must match path:id)
  - `groups` — Authentication groups. Key is group name (^[A-Za-z0-9_-]{1,50}$), value is group config.
  - `permissions` — Per-group program permissions. Key is group name, value is map of program→access-rule. These are ACCESS CONTROL rules defining WHAT IS ALLOWED, not inventory of what exists.
  - `default` — Default access policy when no rules match (defaults to "deny" if omitted)
  - `enable_proxy` — Enable or disable the proxy. Defaults to true.
- `PUT /api/v1/projects/{id}/proxy/permissions/permissions/{groupName}` body — `{ program*: string, access*: bool | number | number[] | string | "*" }`
  - `program` — Program name to set access rule for (e.g., http, terminal, ssh, files, exec, services, notifications)
  - `access` — Access control rule defining WHICH instances/ports are ALLOWED for this program. This is NOT a list of what exists, but a RULE for what is PERMITTED. For programs "files", "services", "notifications", "exec" only boolean is allowed. For network programs like "terminal", "ssh", "ui", etc., use boole…
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/ip` body — `{ range*: string }`
  - `range` — IPv4 CIDR range specifying allowed IP addresses. Format: "IP/mask" where mask is 0-32. Examples: "192.168.1.0/24" (subnet), "10.0.0.0/8" (class A), "203.0.113.5/32" (single IP).
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/jwt` body — `{ secret*: string, algorithm*: "HS256" | "RS256" | "ES256", sources*: string[], claims: { [key: string]: string | number | bool } }`
  - `secret` — JWT secret key used to verify token signatures. For HS256: any string. For RS256/ES256: PEM-encoded SPKI public key.
  - `algorithm` — JWT algorithm to use for signature verification. HS256 uses symmetric keys, RS256/ES256 use asymmetric keys.
  - `sources` — Where to look for JWT tokens in incoming requests. Format: "header:Name" or "cookie:Name" (param: was removed;)
  - `claims` — Optional JWT claims that must be present and match exactly. Values must be string, number, or boolean.
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/password` body — `{ username*: string, password*: string, algorithm: "sha256", salt*: string }`
  - `username` — Username for authentication. Must match exactly what the client provides.
  - `password` — Password for authentication. Can be plaintext (will be hashed) or pre-hashed SHA256(salt+password) in lowercase hex format.
  - `algorithm` — Hashing algorithm used for password verification. Currently only SHA256 is supported.
  - `salt` — Salt used for password hashing. Should be unique per user/group for security.
- `PUT /api/v1/projects/{id}/proxy/permissions/groups/{groupName}/token` body — `{ header*: string, value*: string } | { cookie*: string, value*: string } | { param*: string, value*: string }` — Token authentication configuration. Exactly one location (header, cookie, or param) must be specified.
- `PATCH /api/v1/projects/{id}/proxy/permissions/default` body — `{ default*: "allow" | "deny" }`
  - `default` — Default access policy for unmatched requests
- `PATCH /api/v1/projects/{id}/proxy/permissions/state` body — `{ enable_proxy*: bool }`
  - `enable_proxy` — Enable or disable the proxy entirely

### `realms` (1) — Realms

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/realms/` | List your realm IDs | `?include_usage` |

**Param notes:**

- `include_usage` — Include resource counts per realm_id (projects, containers, servers, auth_tokens). Adds "usage" object to response data.

### `rentals` (3) — Rentals

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/rentals/{id}/extend` | Extend rental | `body*` |
| `GET /api/v1/rentals/{id}` | Get rental details |  |
| `GET /api/v1/rentals` | List user rentals |  |

**Body shapes:**

- `POST /api/v1/rentals/{id}/extend` body — `{ expected_rental_end*: string, additional_days*: int, max_charge_cents: int }`
  - `expected_rental_end` — The rental's CURRENT rental_end, exactly as the API returned it. The extension is applied only if it still matches, so a retried request — a lost response, a double click — is refused with 409 EXTENSION_ALREADY_APPLIED instead of charging and extending a second time. Re-read the rental before retry…
  - `additional_days` — Number of additional days to extend the rental (must match server pricing durations, max 3650)
  - `max_charge_cents` — The total you confirmed, in whole cents. The extension is refused if it would cost more. REQUIRED when the rental has no frozen renewal price (409 CHARGE_CONFIRMATION_REQUIRED) — without a quoted ceiling nothing bounds what the current server tiers can charge. Optional when the rental still carries…

### `serverCommands` (2) — Server Commands

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/servers/{serverId}/execute-command` | Execute server command | `body*` |
| `GET /api/v1/servers/{serverId}/available-commands` | Get available commands | `?category` `?risk_level` |

**Param notes:**

- `category` — Filter by command category
- `risk_level` — Filter by maximum risk level

**Body shapes:**

- `POST /api/v1/servers/{serverId}/execute-command` body — `{ command_id: string, command_slug: string, parameters: object, wait: bool=true, timeout: number, confirmation_token: string } (exactly one of: command_id | command_slug required)`
  - `command_id` — Command ID to execute (one of command_id or command_slug required)
  - `command_slug` — Command slug to execute (one of command_id or command_slug required)
  - `parameters` — Parameters for command template processing
  - `wait` — Wait for command completion before returning
  - `timeout` — Command timeout in seconds (cannot exceed command max_timeout)
  - `confirmation_token` — Confirmation token for high-risk commands

### `serverRental` (10) — Server Rental

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/servers/available` | Browse rental marketplace | `?country` `?region` `?max_price_per_day` `?available_durations` `?min_cpu_cores` `?min_cpu_score` `?cpu_score_type` `?min_ram_gb` `?ram_types` `?min_total_storage_gb` `?disk_types` `?min_bandwidth_mbps` `?min_traffic_tb` `?unlimited_traffic_only` `?category` `?featured_only` |
| `GET /api/v1/servers/{id}` | Get server details (alias for /rentals/:id) |  |
| `GET /api/v1/reservations/{id}` | One of your reservations |  |
| `GET /api/v1/rentals/{id}/runtime` | Get live runtime info for a rented server or subserver |  |
| `GET /api/v1/servers/{id}/runtime` | Get live runtime info (alias for /rentals/:id/runtime) |  |
| `GET /api/v1/servers` | List user servers (alias for /rentals) |  |
| `GET /api/v1/reservations` | Your reservations | `?limit` `?offset` |
| `GET /api/v1/offers` | Browse machines available to order |  |
| `POST /api/v1/servers/{id}/rent` | Rent server | `body*` |
| `POST /api/v1/offers/{id}/reserve` | Reserve an offer (charges immediately) | `body*` |

**Param notes:**

- `country` — Filter by country code (e.g., US, DE)
- `region` — Filter by region (e.g., us-east, eu-central)
- `max_price_per_day` — Maximum price per day in USD
- `available_durations` — Filter servers that support these rental durations (days)
- `min_cpu_cores` — Minimum CPU cores
- `min_cpu_score` — Minimum CPU benchmark score
- `cpu_score_type` — CPU benchmark type for score filtering
- `min_ram_gb` — Minimum RAM in GB
- `ram_types` — Filter by RAM types
- `min_total_storage_gb` — Minimum total storage in GB
- `disk_types` — Filter servers with these disk types
- `min_bandwidth_mbps` — Minimum network bandwidth in Mbps
- `min_traffic_tb` — Minimum monthly traffic allowance in TB
- `unlimited_traffic_only` — Show only servers with unlimited traffic
- `category` — Filter by server category
- `featured_only` — Show only featured servers

**Body shapes:**

- `POST /api/v1/servers/{id}/rent` body — `{ pool_id: string, rental_days*: int, max_charge_cents: int }`
  - `rental_days` — Number of days to rent (must match server pricing durations, max 3650)
  - `max_charge_cents` — Ceiling on the TOTAL debit (rental price + one-time setup fee), in integer cents. REQUIRED for every paid rental. Omitting it returns 409 CHARGE_CONFIRMATION_REQUIRED, or 409 SETUP_FEE_CONFIRMATION_REQUIRED when the server also carries a one-time fee. It is NOT optional for fee-less servers: the fe…
- `POST /api/v1/offers/{id}/reserve` body — `{ days*: number, max_charge_cents: number, idempotency_key*: string, pool_id: string }`
  - `days` — Must be one of the offer's pricing_rules keys.
  - `max_charge_cents` — Ceiling on the TOTAL debit (rent + one-time setup fee). Required whenever a setup fee applies.
  - `idempotency_key` — Caller-generated. Replaying it returns the original reservation, unpaid twice.
  - `pool_id` — Must be a pool you own. Defaults to your default pool.

### `storageShares` (9) — Storage Shares

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/containers/{id}/storage/shares` | Create storage share | `body*` |
| `DELETE /api/v1/storage/shares/{shareId}` | Delete storage share |  |
| `GET /api/v1/containers/{id}/storage/shares/{shareId}` | Get storage share |  |
| `GET /api/v1/containers/{id}/storage/shares` | List storage shares | `?target_type` `?label` `?status` `?enabled` `?include_expired` `?realm_id` |
| `GET /api/v1/storage/shares` | List all your storage shares | `?realm_id` |
| `GET /api/v1/containers/{id}/storage/incoming` | Get incoming shares |  |
| `GET /api/v1/storage/incoming` | Get all incoming shares | `?realm_id` |
| `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount` | Toggle incoming share mount | `body*` |
| `PATCH /api/v1/containers/{id}/storage/shares/{shareId}` | Update storage share | `body*` |

**Param notes:**

- `target_type` — Filter by target type
- `label` — Filter by label
- `status` — Filter by status
- `enabled` — Filter by enabled status
- `include_expired` — Include expired shares (default: false)
- `realm_id` — Filter by realm ID. Alternative to using realm subdomain in URL.

**Body shapes:**

- `POST /api/v1/containers/{id}/storage/shares` body — `{ source_path*: string, target_container_id: string, target_project_id: string, mode*: "readonly" | "readwrite", alias: string, label: string, description: string, enabled: bool, expires_at: number }`
  - `source_path` — ARCHITECTURE: Source containers control WHAT to share (this path). Target mount paths are determined by the server, NOT by users. SECURITY-HARDENED: Character whitelist (a-z A-Z 0-9 / - _.), path normalization applied, blocks system paths (/proc/*, /sys/*, /dev/*, /boot/*, /run/*, /var/run/*), no p…
  - `target_container_id` — 1:1 Container Share: Share with a specific container. Specify this OR target_project_id, not both.
  - `target_project_id` — Project-Wide Share: Share with all containers in a project. Auto-mounts on all current and future containers. Specify this OR target_container_id, not both.
  - `mode` — Mount mode - readonly (read-only) or readwrite (read-write)
  - `alias` — Optional alias (lowercase alphanumeric with hyphens/underscores)
  - `label` — Optional label for organizing shares
  - `description` — Optional description
  - `enabled` — Whether to enable the share (default: true). Disabled shares are kept in database but not mounted.
  - `expires_at` — Unix timestamp (seconds) when share should expire
- `PATCH /api/v1/containers/{id}/storage/incoming/{shareId}/mount` body — `{ mount*: bool }`
  - `mount` — Set to true to accept and mount the share, false to reject/unmount it
- `PATCH /api/v1/containers/{id}/storage/shares/{shareId}` body — `{ mode: "readonly" | "readwrite", alias: string|null, label: string|null, description: string|null, enabled: bool, expires_at: number|null }`
  - `mode` — Mount mode
  - `alias` — Alias (null to remove)
  - `label` — Label (null to remove)
  - `description` — Description (null to remove)
  - `enabled` — Enable or disable the share
  - `expires_at` — Unix timestamp (seconds) when share expires (null to never expire)

### `tfa` (7) — Two-Factor Authentication

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/users/auth/2fa` | Disable 2FA | `body*` |
| `GET /api/v1/users/auth/2fa/status` | Get 2FA Status |  |
| `POST /api/v1/users/auth/2fa/backup-codes/regenerate` | Regenerate Backup Codes | `body*` |
| `PUT /api/v1/users/auth/2fa/token-gate` | Set 2FA token gate preference | `body*` |
| `POST /api/v1/users/auth/2fa/setup` | Initialize 2FA Setup | `body*` |
| `POST /api/v1/users/auth/2fa/verify` | Verify 2FA Code During Login | `body*` |
| `POST /api/v1/users/auth/2fa/verify-setup` | Complete 2FA Setup | `body*` |

**Body shapes:**

- `DELETE /api/v1/users/auth/2fa` body — `{ password*: string, code*: string }`
  - `password` — Current account password
  - `code` — 6-digit OTP code from authenticator app OR backup code
- `POST /api/v1/users/auth/2fa/backup-codes/regenerate` body — `{ password*: string, code*: string }`
  - `code` — 6-digit OTP code from authenticator app
- `PUT /api/v1/users/auth/2fa/token-gate` body — `{ enabled*: bool, password: string, otp_code: string }`
  - `enabled` — true = require OTP for token mutations (default), false = skip OTP gate
  - `password` — Required when setting enabled=false (security downgrade requires primary-factor reauth)
  - `otp_code` — TOTP code or backup code. Required when setting enabled=false.
- `POST /api/v1/users/auth/2fa/setup` body — `{ password*: string }`
  - `password` — Current account password for verification
- `POST /api/v1/users/auth/2fa/verify` body — `{ temp_token: string, code*: string, response_mode: "intent" | "tokens", client: string }`
  - `temp_token` — Temporary token from login response (valid for 5 minutes). Alternatively pass it as Authorization: Bearer header.
  - `code` — 6-digit OTP code from authenticator app OR 10-character backup code
  - `response_mode` — Response shape. 'tokens' (default) returns access/refresh tokens. 'intent' returns an opaque auth_intent_token for PKCE exchange.
  - `client` — Optional client-declared source channel for analytics: web \| ssh \| webssh \| cli \| sdk \| agent. Unrecognised values are recorded as "unknown"; never affects authentication.
- `POST /api/v1/users/auth/2fa/verify-setup` body — `{ code*: string }`
  - `code` — 6-digit code from authenticator app

### `users` (6) — Users

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/users/{id}` | Get user by ID |  |
| `GET /api/v1/users/me/free-tier-status` | Get free-tier claim status |  |
| `POST /api/v1/users/me/onboarding` | Mark an onboarding milestone as completed | `body*` |
| `POST /api/v1/users/me/redeem-invite` | Redeem a beta invite code | `body*` |
| `POST /api/v1/users/me/retry-setup` | Retry free-tier account setup | `body*` |
| `PUT /api/v1/users/{id}` | Update user profile | `body*` |

**Body shapes:**

- `POST /api/v1/users/me/onboarding` body — `{ milestone*: string }`
  - `milestone` — Milestone key, e.g. "hub_tour_v1".
- `POST /api/v1/users/me/redeem-invite` body — `{ code*: string }`
  - `code` — The invite code (case/format-insensitive).
- `POST /api/v1/users/me/retry-setup` body — `{ region: string }`
  - `region` — Optional preferred region override
- `PUT /api/v1/users/{id}` body — `{ alias: string, public_key: string, metadata: object, password: string, current_password: string, is_admin: bool, is_banned: bool }`
  - `alias` — New display name/alias
  - `public_key` — ED25519 public key (exactly 64 hexadecimal characters). Used for cryptographic identity and verification.
  - `metadata` — Custom metadata object for storing additional user information. Can include nested objects.
  - `password` — New password. Must be at least 12 characters, 3 of 4 character classes. Requires current_password for verification.
  - `current_password` — Current password (REQUIRED when setting new password for verification)
  - `is_admin` — Admin status (read-only)
  - `is_banned` — Ban status. Banned users cannot access the API.

### `utilities` (1) — Utilities

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/ip` | Get IP Information |  |

### `vault` (6) — User Vault

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/vault` | Clear entire vault | `?realm_id` |
| `DELETE /api/v1/vault/keys/{key}` | Delete vault key | `?realm_id` |
| `GET /api/v1/vault/keys/{key}` | Get vault key | `?realm_id` |
| `GET /api/v1/vault/stats` | Get vault statistics | `?realm_id` |
| `GET /api/v1/vault/keys` | List vault keys | `?realm_id` |
| `PUT /api/v1/vault/keys/{key}` | Set vault key | `?realm_id` `body*` |

**Param notes:**

- `realm_id` — Target a specific realm (24-char hex). When omitted and not on a realm subdomain, defaults to global scope (realm_id = ""). Case-insensitive — uppercase is normalized to lowercase.
- `key` — Vault key name (alphanumeric, dots, underscores, hyphens)

**Body shapes:**

- `PUT /api/v1/vault/keys/{key}` body — `{ value*: string, metadata: object|null }`
  - `value` — Value to store. Can be any UTF-8 string: JSON, encrypted data, plain text, etc. The API does NOT validate or verify the content - encryption is highly recommended for sensitive data such as secrets, passwords, or API keys.
  - `metadata` — Optional JSON metadata (max 256KB). Useful for file uploads to store content-type, filename, upload date, etc. Must be valid JSON or null. This counts toward your total vault storage limit.

### `waitlist` (2) — Waitlist

| Method | Summary | Params |
|--------|---------|--------|
| `PATCH /api/v1/waitlist` | Enrich an existing waitlist signup | `body*` |
| `POST /api/v1/waitlist` | Join the Hoody waitlist | `body*` |

**Body shapes:**

- `PATCH /api/v1/waitlist` body — `{ email*: string, interest: "dev" | "ai" | "saas" | "security" | "creative" | "productivity" | "it" | "other" | …(9 values), context: "individual" | "startup" | "medium" | "enterprise" | "academic" | "", industry: "softdev" | "saas" | "paas" | "cloud" | "ai-ml" | "datasci" | "cyber" | "devops" | …(29 values), role: "lead" | "manager" | "director" | "exec" | "founder" | "engineer" | "devops" | "ml" | …(14 values) }`
  - `email` — Email of an existing signup.
- `POST /api/v1/waitlist` body — `{ email*: string }`
  - `email` — Signup email address.

### `wallet` (26) — Wallet

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/wallet/payment-methods/` | Add a new payment method | `body*` |
| `POST /api/v1/wallet/github-bonus/claim` | Claim the GitHub connection bonus |  |
| `POST /api/v1/wallet/payments/crypto/invoice` | Start a crypto payment (hosted invoice) | `body*` |
| `POST /api/v1/wallet/payments/stripe/checkout` | Start a card payment (Stripe Checkout) | `body*` |
| `DELETE /api/v1/wallet/payment-methods/{id}` | Delete a payment method |  |
| `GET /api/v1/wallet/invoices/{id}/pdf` | Download invoice PDF |  |
| `POST /api/v1/wallet/invoices/generate/{id}` | Generate invoice for transaction |  |
| `GET /api/v1/wallet/balances` | Get aggregate balances (general + AI) |  |
| `GET /api/v1/wallet/balances/ai` | Get AI balance (limit, usage, remaining) |  |
| `GET /api/v1/wallet/payments/crypto/intents/{id}` | Get a crypto payment intent |  |
| `GET /api/v1/wallet/balances/general` | Get general balance only |  |
| `GET /api/v1/wallet/github-bonus` | Get GitHub connection bonus status |  |
| `GET /api/v1/wallet/invoices/{id}` | Get invoice by ID |  |
| `GET /api/v1/wallet/payment-availability` | Get top-up payment availability (providers, bounds, AI transfer fee) |  |
| `GET /api/v1/wallet/payment-methods/{id}` | Get payment method by ID |  |
| `GET /api/v1/wallet/payments/stripe/intents/{id}` | Get a card payment intent |  |
| `GET /api/v1/wallet/transactions/{id}` | Get transaction by ID |  |
| `GET /api/v1/wallet/ai-fee-history` | Get AI credit fee history | `?page` `?limit` `?sort_by` `?sort_order` |
| `GET /api/v1/wallet/payments/crypto/intents` | List crypto payment intents | `?limit` `?offset` |
| `GET /api/v1/wallet/invoices/` | Get all invoices | `?page` `?limit` `?sort_by` `?sort_order` `?filter` |
| `GET /api/v1/wallet/payment-methods/` | Get all payment methods |  |
| `GET /api/v1/wallet/payments/stripe/intents` | List card payment intents | `?limit` `?offset` |
| `GET /api/v1/wallet/transactions` | List transactions | `?limit` `?sort_by` `?sort_order` |
| `PUT /api/v1/wallet/payment-methods/{id}/default` | Set a payment method as default |  |
| `POST /api/v1/wallet/transfers` | Transfer from general balance to AI credits | `body*` |
| `PUT /api/v1/wallet/payment-methods/{id}` | Update a payment method | `body*` |

**Param notes:**

- `page` — Page number for pagination - starts from 1
- `limit` — Number of invoices to return per page - maximum 100
- `sort_by` — Field to sort by. One of: id, invoice_number, status, amount, currency, issue_date, due_date, paid_date, created_at, updated_at, user_id, transaction_id. Unrecognised values fall back to created_at.
- `filter` — JSON object string filtering by the sortable fields, e.g. {"status":"paid"} or {"amount":{"gte":10}}. Operators: eq, ne, gt, gte, lt, lte, like, in. Unknown fields or operators are rejected with 400.

**Body shapes:**

- `POST /api/v1/wallet/payment-methods/` body — `{ name*: string, details: object, is_default: bool }`
- `POST /api/v1/wallet/payments/crypto/invoice` body — `{ amount*: string, idempotency_key: string }`
  - `amount` — USD amount as a strict decimal string (e.g., "25" or "25.00")
  - `idempotency_key` — Optional caller idempotency key (must contain a non-whitespace character); repeats return the original intent
- `POST /api/v1/wallet/payments/stripe/checkout` body — `{ amount*: string, idempotency_key: string }`
- `POST /api/v1/wallet/transfers` body — `{ amount*: string, idempotency_key: string, expected_fee_bps: int }`
  - `amount` — USD amount as a string with up to 2 decimals, e.g., "10.00". No exponent, no negatives.
  - `idempotency_key` — Optional caller idempotency key. Retrying with the SAME key AND same amount returns the original receipt without moving funds again; the same key with a different amount is rejected (409 TRANSFER_IDEMPOTENCY_KEY_REUSED). Recommended for the UI to make a double-click / retry-after-timeout safe.
  - `expected_fee_bps` — Optional: the platform fee (basis points) the client displayed at confirmation. If it no longer matches the current server fee, the transfer is rejected (409 TRANSFER_FEE_CHANGED) so the user re-confirms — so an irreversible transfer can never be charged a fee the user was not shown.
- `PUT /api/v1/wallet/payment-methods/{id}` body — `{ details: object, status: "active" | "inactive", is_default: bool }`


---

<!-- ===== namespace: browser ===== -->

# `browser` — Per-container Chromium/Firefox via Playwright/Patchright

## Purpose

- Long-lived browser instances per container, keyed by `browser_id`.
- Playwright default; Patchright on `stealth=true`.
- Surfaces: nav, screenshot, JS eval, PDF, HTML/text, cookies, console+network logs, history, CDP.

## When to use

- JS-heavy pages, screenshots, PDFs.
- Authenticated sessions across navs.
- Anti-fingerprint via `stealth=true`.
- Console/network capture.
- Dedicated recorded "project browser" the user can watch live and you can inspect anytime (workflow 6).
- External CDP via `GET /devtools-url` (Chromium ships `webSocketDebuggerUrl` ON by default — pass `useRemoteDebuggingPort=false` to disable; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Start + navigate
1. `GET /start` — `browser_id` + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `GET /browse`/`POST /browse` — `tab_id`, `only_if_not_exists=true`.
3. `GET /metadata`.

### 2. Extract content
After browse: `GET /html`/`GET /text`/`GET /screenshot`/`GET /pdf` — params in Reference.

### 3. Authenticated scraping
1. `GET /start` matching `userAgent`/`viewport`/`locale`.
2. `POST /cookies` — POST array (Playwright `addCookies` shape).
3. `GET /browse` to protected URL.
4. `GET /html`/`GET /text`.
5. `DELETE /cookies`.

### 4. JS eval + logs
1. `GET /start` → `GET /browse`.
2. `GET /eval` (`?script=`) or `POST /eval` (raw JS body).
3. `GET /console` (`since`,`type`,`clear=true`).
4. `GET /network`.

### 5. History
`GET /history` (filters: `since`/`domain`/`browser_id`) and `DELETE /history` (`before` + `browser_id` AND).

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on the matching display: `GET /start` with a stable `browser_id` (the project slug), `browser_port` (e.g. 30000+X), `display` 500+X, `showBrowser=true` — plus any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — it's the standard kit URL with the `browser-` slug: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/`. The root page of `browser-X` embeds display 500+X live, so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `GET /devtools-url` adds a live DevTools inspector as a second link.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-`browser_id` history (`GET /history`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped after ~1h idle (see Quirks) — history survives; re-run `GET /start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `GET /console`/`GET /network` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

## Quirks & gotchas

- `browser_id` is an opaque, 0-based string. The kit's request handler reads `browser_port || port` from query/body (NOT `browser_id`); the generated SDK sends `browser_id` as a query param; the URL serviceIndex slot (e.g. `-browser-1.`) is a separate proxy routing variable set via `_templateVars`, defaulting to 1. Drive via the SDK and prefer `browser_id`; raw `curl` against the kit must send `browser_port=<num>`.
- Endpoints auto-create unless `start=false` or `--disable-auto-start`.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `GET /stop` first.
- `stealth=true` ignored on Firefox (Patchright is Chromium-only).
- Extensions need `showBrowser=true`; force persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **Idle instances are killed after `HOODY_INSTANCE_MAX_AGE` ms (default 3 600 000 = 1 h).** Cleanup runs every `HOODY_CLEANUP_INTERVAL` ms (default 300000 = 5 min) and SIGTERMs anything past max-age. Heartbeat any active instance with a request to refresh `lastAccessed`. Long-running scrape loops or warm cookies WILL silently lose state across hours of idle.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retention 30 d (`HOODY_HISTORY_RETENTION_DAYS`). Disable: `--history-disable` / `HOODY_HISTORY_DISABLE=true`.
- **`DELETE /history` with no filters wipes all history** — pair `before` + `browser_id` (or both).
- `browser_id` history filter sanitised as path component.
- `eval` POST accepts BOTH `Content-Type: application/json` with `{"script":"..."}` (what the SDK and CLI send) and `Content-Type: text/plain` with the raw JS body — the kit tries JSON parse first, falls back to storing the body as `__raw`.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; `GET /devtools-url` only 404s when the instance itself is missing (NOT when CDP is "off"). To disable CDP exposure, pass `useRemoteDebuggingPort=false` at start. CDP listener binds to `0.0.0.0` by default — treat it as a security-relevant default and either keep CDP off in shared environments or front it with the kit URL's capability gate.
- `viewport` and `geolocation` query/body values are **JSON strings**, not free-form `"WxH"` / `"lat,lng"` — the kit `JSON.parse`s and rejects anything else. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — bad `browser_id`, malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `GET /stop`, `GET /devtools-url`, `start=false` no instance.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints with `--history-disable`.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `GET /stop` then `GET /start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `GET /start` and no `$DISPLAY` env.
- `TIMEOUT` 408 — exceeds `HOODY_REQUEST_TIMEOUT` (600000ms).
- `METHOD_NOT_ALLOWED` 405 — only GET/POST/DELETE/PUT/PATCH.

## Related namespaces

- `display` — headful renders into `display-{n}`; root URL iframes it.
- `terminal` — helper CLIs.
- `curl` — JS-free HTTP.
- `files` — pull artefacts out.
- `sqlite` — persist scraped data.
- `exec` — server post-processing.

## Examples

Every step in every example was live-tested against a real `browser-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. ⚠ The kit keys instances on **`browser_port`**, not `browser_id` — on instance endpoints `browser_id` is ignored (it only namespaces history), so calls that differ only in `browser_id` all resolve to the same default instance. The examples run sequentially against that single default instance; for genuinely concurrent flows add a unique `browser_port=$((30000+i))` to every call, as Example 2 does (see the Quirks gotcha).

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `GET /start` is idempotent — calling again with the same `browser_id` returns the existing instance.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf "$KIT/start?browser_id=$BID&showBrowser=false&stealth=false" \
  | jq '{browser_id,engine,headless,chromiumBuildId,browser_port}'
```
**Step 2 — navigate.** `GET /browse` opens or reuses a tab and waits for load.

```bash
curl -sf "$KIT/browse?browser_id=$BID&url=https%3A%2F%2Fhttpbin.org%2Fhtml" | jq '.'
```
### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
# Raw PNG bytes:
curl -sf "$KIT/screenshot?browser_port=$((30000+BID))&fullPage=true&url=https%3A%2F%2Fhttpbin.org%2Fhtml" \
  -o /tmp/page.png
file /tmp/page.png
# Or base64-wrapped:
curl -sf "$KIT/screenshot?browser_port=$((30000+BID))&fullPage=true&format=base64" | jq -r .data | head -c 80
```
### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`GET /text` calls Playwright `innerText` on `body`).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf "$KIT/html?browser_id=$BID"  | head -c 200
echo
curl -sf "$KIT/text?browser_id=$BID"  | head -c 200
```
### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. `GET /eval` puts the script in `?script=` (size-bound by URL). `POST /eval` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns the result.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
# GET — small expression:
curl -sf "$KIT/eval?browser_id=$BID&script=$(python3 -c 'import urllib.parse; print(urllib.parse.quote("document.title"))')"
echo
# POST — JSON body:
curl -sf -X POST "$KIT/eval?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"script":"JSON.stringify({title: document.title, links: document.querySelectorAll(\"a\").length})"}'
```
### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is the Playwright `addCookies` shape: an array of `{ name, value, url }` (or `{ name, value, domain, path }`). Each cookie REQUIRES either `url` OR `domain+path`.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf -X POST "$KIT/cookies?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"cookies":[
        {"name":"session","value":"abc123","url":"https://httpbin.org"},
        {"name":"theme","value":"dark","url":"https://httpbin.org"}
      ]}' | jq .
# → {"added": 2}
curl -sf "$KIT/cookies?browser_id=$BID&url=https%3A%2F%2Fhttpbin.org" | jq .
```
### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="examples-auth-9c"
curl -sf "$KIT/start?browser_id=$BID&showBrowser=false&stealth=false" >/dev/null
curl -sf -X POST "$KIT/cookies?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"cookies":[{"name":"sessionid","value":"REAL_TOKEN","url":"https://app.example.com"}]}'
curl -sf "$KIT/browse?browser_id=$BID&url=https%3A%2F%2Fapp.example.com%2Fdashboard"
curl -sf "$KIT/text?browser_id=$BID"   | head -c 400
curl -sX DELETE "$KIT/cookies?browser_id=$BID"   # → {"cleared": true}
```
### 7. `POST /browse` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `GET /start`; `POST /browse` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="examples-mobile-fr"
curl -sf "$KIT/start?browser_id=$BID&showBrowser=false&stealth=true\
&viewport=%7B%22width%22%3A390%2C%22height%22%3A844%7D\
&locale=fr-FR\
&timezoneId=Europe%2FParis\
&userAgent=Mozilla%2F5.0%20(iPhone%3B%20CPU%20iPhone%20OS%2017_4%20like%20Mac%20OS%20X)%20AppleWebKit%2F605.1.15%20(KHTML%2C%20like%20Gecko)%20Version%2F17.4%20Mobile%2F15E148%20Safari%2F604.1\
&geolocation=%7B%22latitude%22%3A48.8566%2C%22longitude%22%3A2.3522%2C%22accuracy%22%3A20%7D" >/dev/null
curl -sf -X POST "$KIT/browse?browser_id=$BID" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/headers","active":true,"onlyIfNotExists":false}'
curl -sf "$KIT/text?browser_id=$BID" | head -c 500
```
### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
# All navs in the last hour, max 50:
SINCE=$(date -u -d '1 hour ago' +%FT%TZ)
curl -sf "$KIT/history?since=$SINCE&limit=50" | jq '{total, has_more, sample: .entries[0]}'
# Just one domain:
curl -sf "$KIT/history?domain=httpbin.org&limit=20" | jq '.entries | length'
# Drop entries older than 7 days for one browser_id:
BEFORE=$(date -u -d '7 days ago' +%FT%TZ)
curl -sX DELETE "$KIT/history?before=$BEFORE&browser_id=0" | jq .
# → {"deleted": <n>}
```
### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
BID="0"
curl -sf "$KIT/metadata?browser_id=$BID&start=false" \
  | jq '{engine, stealth, headless, chromiumBuildId, browser_host, browser_port, fingerprintId, display, iframe_url}'
# Live tabs in the instance:
curl -sf "$KIT/tabs?browser_id=$BID&start=false" | jq '.'
```
For an external CDP attachment, `GET /devtools-url` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests within a kit-process lifetime (graceful kit restart SIGTERMs every child — see Quirks & gotchas); if you forget to shut down you'll exhaust the per-container port pool and the next `GET /start` will fail with `Failed to start server. Is port 30001 in use?` (live-verified — orphaned chromium on the starting port permanently jams the kit until the container is restarted).

`GET /stop` and `GET /shutdown` both terminate the child and delete any extension profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`); persistent profile dirs only exist when extensions were loaded. One `GET /stop` per instance is a complete teardown — calling both is redundant.

```bash
KIT="https://${P}-${C}-browser-1.${N}.containers.hoody.com"
for BID in 0 examples-auth-9c examples-mobile-fr; do
  curl -sX GET "$KIT/stop?browser_id=$BID" | jq .
done
# If you use /shutdown in teardown, ALWAYS pass start=false — without it the endpoint
# auto-creates a missing instance instead of tearing down:
#   curl -sX GET "$KIT/shutdown?browser_id=$BID&start=false"
# Confirm nothing's left:
curl -sf "$KIT/metrics" | jq '.instances'
```
A `404 Instance not found` from `GET /stop` means it was already gone — safe to ignore. `GET /shutdown` auto-creates a missing instance unless you pass `start=false`; always include `start=false` in teardown calls.

## Reference

### `cookies` (3) — Browser State

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /cookies` | Clear all cookies | `?browser_id*` `?start` |
| `GET /cookies` | Get cookies | `?browser_id*` `?start` `?url` |
| `POST /cookies` | Set cookies | `?browser_id*` `?start` `body*` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `url` — Filter cookies by URL

**Body shapes:**

- `POST /cookies` body — `{ cookies*: { name*: string, value*: string, url*: string, domain: string, path: string, httpOnly: bool, secure: bool }[] }`

### `debugging` (2) — Debugging

| Method | Summary | Params |
|--------|---------|--------|
| `GET /console` | Get console logs | `?browser_id*` `?tabId` `?start` `?type` `?since` `?clear` |
| `GET /network` | Get network logs | `?browser_id*` `?tabId` `?start` `?since` `?clear` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `tabId` — The ID of the tab to interact with
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `type` — Filter by message type (log, error, warning, info, etc.)
- `since` — Only return logs after this ISO timestamp
- `clear` — Clear the buffer after reading

### `health` (4) — Server monitoring and health check operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/browser/health` | Health check |  |
| `GET /metrics` | Server metrics |  |
| `GET /openapi.json` | Get OpenAPI specification (JSON) |  |
| `GET /openapi.yaml` | Get OpenAPI specification (YAML) |  |

### `history` (2) — Operations for querying and managing persistent browsing history

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /history` | Delete browsing history | `?before` `?browser_id` |
| `GET /history` | Query browsing history | `?since` `?domain` `?browser_id` `?limit` `?offset` |

**Param notes:**

- `before` — Delete entries before this ISO 8601 timestamp
- `browser_id` — Delete entries for specific browser ID only
- `since` — Return entries after this ISO 8601 timestamp
- `domain` — Filter by domain (exact match)
- `browser_id` — Filter by browser ID
- `limit` — Maximum entries to return (1-500)
- `offset` — Number of entries to skip for pagination

### `instances` (3) — Operations for creating and managing browser instances

| Method | Summary | Params |
|--------|---------|--------|
| `GET /restart` | Restart browser instance | `?browser_id*` `?chromiumVersion` `?fingerprintId` `?useRemoteDebuggingPort` `?remoteDebuggingPort` `?remoteDebuggingAddress` `?extensions` `?extensionsDir` `?extensionsStoreIds` `?proxyServer` `?proxyUsername` `?proxyPassword` `?proxyBypass` `?enableQuic` `?enableDnsOverHttps` `?dnsOverHttpsUrl` `?display` `?showBrowser` `?sessionName` `?timezoneId` `?locale` `?userAgent` `?viewport` `?noViewport` `?geolocation` `?launchArguments` `?browser` `?firefoxVersion` `?firefoxExecutablePath` `?showDevtools` `?userProfile` `?stealth` `?iframe` `?iframe_url` `?maximize_new_windows` |
| `GET /start` | Create or retrieve browser instance | `?browser_id*` `?chromiumVersion` `?fingerprintId` `?useRemoteDebuggingPort` `?remoteDebuggingPort` `?remoteDebuggingAddress` `?extensions` `?extensionsDir` `?extensionsStoreIds` `?proxyServer` `?proxyUsername` `?proxyPassword` `?proxyBypass` `?enableQuic` `?enableDnsOverHttps` `?dnsOverHttpsUrl` `?display` `?showBrowser` `?sessionName` `?timezoneId` `?locale` `?userAgent` `?viewport` `?noViewport` `?geolocation` `?stealth` `?iframe` `?iframe_url` `?maximize_new_windows` |
| `GET /stop` | Stop browser instance | `?browser_id*` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `chromiumVersion` — Chromium/Chrome version selection for the instance. This option applies only when `browser=chromium`.  Supported formats: - Full version: `136.0.7103.113` - Major version: `136` (mapped to a known stable patch for the current OS) - Channel tag: `stable`, `beta`, `dev`, `canary`  The server will **block** until the required browser is downloaded into `BROWSERS_DIR`.
- `fingerprintId` — Base fingerprint profile id. The server will load `storage/config/fingerprints/<fingerprintId>.json` and use its `context` and `launch` defaults, then apply any request overrides.
- `useRemoteDebuggingPort` — If `true`, the child process will launch Chromium with `--remote-debugging-port` and will populate `webSocketDebuggerUrl` in metadata responses.
- `remoteDebuggingPort` — Optional fixed DevTools port (only used when `useRemoteDebuggingPort=true`). If omitted, a free port is chosen.
- `remoteDebuggingAddress` — Interface address for DevTools. Defaults to `127.0.0.1`. Use `0.0.0.0` only in trusted environments.
- `extensions` — Comma-separated list (or JSON array string) of absolute extension directory paths to load. Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile.
- `extensionsDir` — Directory containing extension subfolders to load (each subfolder is treated as an extension). Extensions require `showBrowser=true` (headful mode) and will launch a persistent profile.
- `extensionsStoreIds` — Chrome Web Store extension IDs to download and load (Chromium only). Requires `showBrowser=true` and works only with `browser=chromium`.
- `proxyServer` — Proxy server URL (http, https, socks5, socks5h)
- `proxyUsername` — Proxy username (if required)
- `proxyPassword` — Proxy password (if required)
- `proxyBypass` — Comma-separated list of hosts that should bypass the proxy
- `enableQuic` — Enable QUIC/HTTP3 transport. Defaults to `false` (QUIC blocked). Use `enableQuic=true` to re-enable QUIC.
- `enableDnsOverHttps` — Enable DNS-over-HTTPS for browser DNS resolution. Defaults to `true`.
- `dnsOverHttpsUrl` — DoH resolver URL (HTTPS only). Defaults to Cloudflare: `https://cloudflare-dns.com/dns-query`.
- `display` — X display number or identifier for headful mode. Required when `showBrowser=true` and no `DISPLAY` environment variable is set on the server.
- `showBrowser` — Whether to run the browser headful (visible). Defaults to `true`.
- `sessionName` — Custom session name for identifying this browser instance
- `timezoneId` — IANA timezone identifier for browser geolocation
- `locale` — BCP 47 language tag for browser locale
- `userAgent` — User agent string to apply to the browser context.
- `viewport` — Viewport configuration as JSON string. Example: {"width":1920,"height":1080,"deviceScaleFactor":1} Pass `null` to disable fixed-viewport emulation entirely — the page then follows the real browser window size (responsive; most useful in headful mode).
- `noViewport` — Set to `true` to disable fixed-viewport emulation (alias for `viewport=null`). The page then resizes with the browser window instead of being pinned to an emulated resolution. Cannot be combined with a fixed `viewport` object.
- `geolocation` — Geolocation configuration as JSON string. Example: {"latitude":40.7128,"longitude":-74.0060,"accuracy":100}
- `launchArguments` — Additional browser launch arguments (repeatable or JSON array)
- `browser` — Browser engine to use (`chromium` or `firefox`)
- `firefoxVersion` — Firefox version label (informational only). Playwright-managed Firefox builds are used by default. If omitted, a Playwright Firefox build is downloaded on demand.
- `firefoxExecutablePath` — Absolute path to a custom Firefox executable (overrides download)
- `showDevtools` — Whether to open DevTools on launch (Chromium only)
- `userProfile` — Optional user profile object (JSON string) for fingerprinting defaults
- `stealth` — Launch Chromium in stealth mode using Patchright (anti-detection patches). Only applies to `browser=chromium`. Ignored for Firefox. Defaults to `true`. Bare `?stealth` is treated as `true`.
- `iframe` — Enable or disable the full-page display iframe on the root URL.
- `iframe_url` — Explicit URL for the display iframe.
- `maximize_new_windows` — Control the `maximize_new_windows` flag stamped onto the generated display URL (always explicit `true`/`false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to opt out.
- `extensionsStoreIds` — Comma-separated list (or JSON array string) of Chrome Web Store extension IDs to download and load. Requires `showBrowser=true` and works only with `browser=chromium`.
- `proxyServer` — Proxy server for browser traffic. Supports `http://`, `https://`, `socks5://`, or `socks5h://`. Example: `socks5://127.0.0.1:9050`
- `iframe` — Enable or disable the full-page display iframe on the root URL. When enabled (default), navigating to `/` serves an HTML page with an iframe pointing to the Hoody display URL.
- `iframe_url` — Explicit URL for the display iframe. If not provided, the URL is auto-detected from the Host header subdomain pattern.
- `maximize_new_windows` — Control the `maximize_new_windows` flag stamped onto generated display URLs (iframe pages, status pages, `iframe_url` metadata). The flag is always explicit (`true` or `false`); when true the hoody-display client opens new top-level app windows maximized. Enabled by default; set to `false` to keep the display client's centered default-size placement (the explicit `false` also overrides a display-side `default-settings.txt` enable). Explicit `iframe_url` values are never modified.

### `interaction` (5) — Operations for interacting with browser tabs and content

| Method | Summary | Params |
|--------|---------|--------|
| `GET /browse` | Navigate to URL | `?browser_id*` `?start` `?url` `?tabId` `?active` `?onlyIfNotExists` `?ignoreGetParameters` |
| `POST /browse` | Navigate to URL (POST) | `?browser_id*` `?start` `body*` |
| `GET /eval` | Execute JavaScript | `?browser_id*` `?start` `?script*` |
| `POST /eval` | Execute JavaScript (POST) | `?browser_id*` `?start` `body*` |
| `GET /screenshot` | Capture browser screenshot | `?browser_id*` `?start` `?url` `?tabId` `?onlyIfNotExists` `?ignoreGetParameters` `?format` `?quality` `?fullPage` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `url` — The URL to navigate to
- `tabId` — The ID of the tab to interact with
- `active` — Make the tab active (focused) after navigation
- `onlyIfNotExists` — Only create a new tab if no tab with the same URL exists
- `ignoreGetParameters` — Ignore query parameters when checking for existing URL
- `script` — JavaScript code to execute (can be base64 encoded)
- `ignoreGetParameters` — Ignore query strings when checking for existing URL
- `format` — Output format
- `quality` — Image quality for JPEG format (0-100)
- `fullPage` — Capture the entire scrollable page

**Body shapes:**

- `POST /browse` body — `{ url*: string, tabId: int, active: bool=true, onlyIfNotExists: bool=false, ignoreGetParameters: bool=false }`
- `POST /eval` body — `{ script: string }` — Executes a JavaScript snippet provided in the request body
  - `script` — JavaScript code to execute

### `introspection` (7) — Operations for inspecting and controlling browser instances

| Method | Summary | Params |
|--------|---------|--------|
| `POST /tab/close` | Close a browser tab | `?browser_id*` `?start` `body` |
| `GET /devtools-url` | Get DevTools URLs | `?browser_id*` `?start` |
| `GET /metadata` | Get instance metadata | `?browser_id*` `?start` |
| `GET /viewport` | Get the current viewport policy | `?browser_host` `?browser_port` |
| `GET /tabs` | List browser tabs | `?browser_id*` `?start` |
| `POST /viewport` | Change the viewport at runtime | `?browser_host` `?browser_port` `body*` |
| `GET /shutdown` | Shutdown browser instance | `?browser_id*` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `browser_host` — Instance host. Optional — must be paired with browser_port; when both are omitted the single running instance is selected (400 AMBIGUOUS_INSTANCE with more than one).
- `browser_port` — Instance port. Optional — must be paired with browser_host.

**Body shapes:**

- `POST /tab/close` body — `{ tabId: int }`
  - `tabId` — The ID of the tab to close
- `POST /viewport` body — `{ viewport*: { width*: int, height*: int }|null }`
  - `viewport` — Fixed size {width,height} (integers 1..8192, no other keys), or null for responsive.

### `page` (3) — Page Content

| Method | Summary | Params |
|--------|---------|--------|
| `GET /pdf` | Export page as PDF | `?browser_id*` `?tabId` `?start` `?url` `?format` `?landscape` `?printBackground` `?margin` |
| `GET /html` | Get page HTML | `?browser_id*` `?tabId` `?start` |
| `GET /text` | Get page text | `?browser_id*` `?tabId` `?start` |

**Param notes:**

- `browser_id` — Unique identifier for the browser instance (0-based index)
- `tabId` — The ID of the tab to interact with
- `start` — Controls instance creation behavior. - Default mode: instances are created automatically. Set to `false` to prevent creation. - When auto-start is disabled globally: set to `true` to create an instance.
- `url` — Optional URL to navigate to before generating the PDF
- `format` — Paper format (e.g. A4, Letter)
- `landscape` — Use landscape orientation
- `printBackground` — Include background graphics
- `margin` — Uniform margin (e.g. '1cm', '0.5in')


---

<!-- ===== namespace: code ===== -->

# `code` — VS Code in the browser, per container

## Purpose

**This is the VS Code IDE running in a browser tab — not a programmatic API.** Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/?folder=<abs-path>&id=1` and you get the full editor: file tree, diff view, debugger, terminals, extensions marketplace, all backed by the container's filesystem. The public `code-1` URL is served by an **orchestrator** that requires both `folder` and `id` query params on `/` (it boots child editor instance `id` and iframes it from the `{P}-{C}-http-<60000+id>.{N}` subdomain); with neither param it serves the OpenAPI spec, with only one it returns 400. The `code` namespace methods documented here exist mainly to *configure* the editor (open a folder, install an extension, mint a path-proxy URL) — the day-to-day use is "open the URL".

Like every Hoody kit URL, `code` is **iframable**: drop the `code-1` URL into an `<iframe>` and you've embedded VS Code in your own page. Same for every other kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of Hoody kit iframes with no native code, just URLs and standard CSP / cookie wiring.

**Headline mode: extension-only embed.** Add `&extension=<publisher>.<name>` (alongside the required `folder` and `id` params) and the editor boots into a **single extension's UI** — no file tree, no command palette, no marketplace, no IDE chrome. Just that extension's panel filling the viewport. Pair the extension with the iframable kit URL and you have:

- A coding agent (e.g. **Cline** — `saoudrizwan.claude-dev`) accessible from any browser, including mobile phones with no IDE installed.
- The same agent embedded into your own dashboard, a docs site, a Notion page, a Slack canvas (URL preview), a CRM, or any other HTML surface.
- A focused tool surface (Continue, Copilot Chat, Roo Cline, GitLens, Marquee, Excalidraw, Markdown previewer, Jupyter, …) without exposing the full editor.
- A "Cline-as-a-service" deployment: brand it via `POST /api/v1/proxy/aliases` and ship a URL like `https://agent.{server_name}.containers.hoody.com` to your team, hiding the `containerId`.

The container's filesystem still backs the extension (it can edit files, run terminals, hit the network, etc.) — same persistent state as the full IDE. Multiple child instances let you run multiple single-extension surfaces side-by-side under one container — same `code-1` URL, different `id` values (e.g. Cline at `?extension=…&folder=…&id=1`, Continue at `…&id=2`).

## When to use

- **Humans editing code**: hand the user the URL — that's the whole product.
- **Single-extension embed for an agent or tool** — `?extension=<publisher>.<name>` boots straight into that extension's UI; iframable, mobile-friendly, distributable as a brand-able alias.
- Pre-open a workspace/folder for them via `?folder=` / `?workspace=` (so the URL is bookmarkable).
- Pre-install extensions (custom internal VSIX) via the kit's launch flags or in-editor — the `* /api/v1/code/extensions/*` HTTP endpoints are spec-only, not implemented (see Quirks).
- Tunnel an in-container port through the editor's path-proxy on the **child instance** subdomain: `/proxy/{port}` (rewrites `req.base`) or `/absproxy/{port}` (verbatim — use this for APIs/WS).

## When NOT to use

Not for: non-interactive shell → `terminal`/`exec`, file I/O without a UI → `files`, long-lived processes → `daemon`, headless web → `browser`. Not a coding-agent control plane → `agent` (the typed in-container AI-agent HTTP namespace, slug `agent`; the Hoody Agent browser GUI on the same `-agent-1` host is the human surface).

## Prerequisites

- Password mode: session cookie via the HTML form login at the **child instance** root (`POST /login`, form-encoded — see Example 7). The generated `* /api/v1/code/log*` accessors build `/api/v1/code/login|logout`, which no surface routes.
- VSIX install: the `* /api/v1/code/extensions/*` HTTP endpoints are spec-only (not implemented) — pre-install via the child launch flags or in-editor (see Example 3).

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

## Common workflows

### 1. Open a workspace folder

1. Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/?folder=<abs-path>&id=1` — both `folder` and `id` are required at the public kit URL.
2. `GET /api/v1/code` (`folder`/`workspace`/`locale`) is the child-instance surface behind it; `ew=true` clears the persisted folder.

### 2. Embed a single extension (single-tool browser surface)

Pin one extension as the entire UI of a `code-N` instance — no editor chrome around it.

1. Make sure the extension is installed in the container's VS Code: pre-install via the child launch flags (`--install-extension`, `--preload-builtin-extensions-dir`) or in-editor — the `POST /api/v1/code/extensions/install`/`GET /api/v1/code/extensions/list` HTTP endpoints are spec-only (see Quirks).
2. Open / iframe `https://{P}-{C}-code-1.{N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<abs-path>&id=1` (`folder` and `id` are required). Examples:
   - `?extension=saoudrizwan.claude-dev` — Cline (autonomous coding agent), works on a phone.
   - `?extension=continue.continue` — Continue chat.
   - `?extension=ms-toolsai.jupyter` — Jupyter notebooks UI only.
   - `?extension=eamodio.gitlens` — GitLens panel.
3. Point `folder` at the repo you want the extension to see (it is required either way).
4. Embed: `<iframe src="…/?extension=…&folder=…" allow="clipboard-read; clipboard-write"></iframe>` — works in any HTML page, mobile browser, Slack URL preview surface, etc.
5. Brand the URL: `POST /api/v1/proxy/aliases` → `https://agent.{server_name}.containers.hoody.com`. Hides the `containerId`; gate via `proxyPermissionsContainer.*` for production.

To run two distinct single-extension surfaces under the same container, use different `id` values at the same `code-1` URL (`id=1` for Cline, `id=2` for Continue, etc. — each `id` is its own child editor instance).

### 3. Install and verify a VSIX

`POST /api/v1/code/extensions/install` / `GET /api/v1/code/extensions/list` are spec-only — not implemented by the current kit (see Quirks). Pre-install via the child launch flags or in-editor, then verify on disk (Example 4).

### 4. Tunnel a container port

The **child instance** mounts `/proxy/:port` and `/absproxy/:port` at its root (`{P}-{C}-http-<60000+id>.{N}` subdomain); the public `code-1` root does NOT route them. The generated accessors `GET /api/v1/code/proxy/{port}/{path}` / `GET /api/v1/code/absproxy/{port}/{path}` build URLs against `/api/v1/code/proxy/...` which no surface routes — drive path-proxy with raw URLs (`https://{P}-{C}-http-60001.{N}.containers.hoody.com/proxy/{port}/...`) or the hand-extended embed-URL builder under the `code.vscode` service (see Quirks for `embedUrl`).

### 5. Authenticate password mode

Form-POST the password to the **child instance** root `/login` (see Example 7) — the generated `* /api/v1/code/log*` accessors build `/api/v1/code/login|logout`, which no surface routes.

## Quirks & gotchas

- Login limit 2/min, 12/hr per process.
- `/api/v1/code/health` resets idle heartbeat; only `/healthz` excluded.
- 3 mount prefixes; use `/api/v1/code`.
- `GET /api/v1/code` persists `folder`/`workspace` as the last-opened workspace in the instance's user-data dir; `ew=true` wipes.
- `POST /api/v1/code/mint-key` idempotent.
- `POST /api/v1/code/extensions/install` / `GET /api/v1/code/extensions/list` are declared in the kit OpenAPI (and surfaced by the generated SDK/CLI) but the current kit does NOT implement them — no extensions router is mounted anywhere; requests fall through (child: vscode catch-all SPA/302; `code-1`: orchestrator plain-text 404). Pre-install via the child launch flags (`--install-extension`, `--install-builtin-extension`, `--preload-builtin-extensions-dir`) or in-editor.
- `/proxy/:port` and `/absproxy/:port` are mounted at the **child instance root** (`{P}-{C}-http-<60000+id>.{N}` subdomain), NOT under `/api/v1/code` and NOT at the public `code-1` root — the orchestrator has no proxy routes. Use `https://{P}-{C}-http-60001.{N}.containers.hoody.com/proxy/{port}/...` (or `/absproxy/{port}/...`).
- `/proxy/:port/...` rewrites `req.base` so the upstream sees `/<rest>`; `/absproxy/:port/...` keeps the full `/absproxy/:port/...` prefix verbatim — use `absproxy` for APIs/WS where the upstream cares about its own base path.
- `GET /api/v1/code/update/check` (the generated accessor — the `update.*` service does not exist) queries GitHub releases. NOTE: the generated path is `/api/v1/code/update/check`, but `/update` is mounted on the **child instance** root only — the generated call and the public `code-1` root both miss it (orchestrator has no `/update` route). Call `https://{P}-{C}-http-<60000+id>.{N}…/update/check` directly. The route returns `{ checked, latest, current, isLatest }`, but the generated TS type `CodeHealthCheckUpdateResponse` (from the OpenAPI spec) mis-declares `{ current, latest, updateAvailable }` and drops `checked` — read `.isLatest`/`.checked` from the raw JSON, not `.updateAvailable`. `?force=true` bypasses the 24 h cache (kit-level only — not exposed via the generated SDK or CLI surfaces; reachable only by raw HTTP to `/update/check?force=true`).
- `GET /api/v1/code/health` at the public `code-1` URL hits the ORCHESTRATOR, which returns the standardized 9-field `{ status: "ok", service, built, started, memory, fds, pid, ip, userAgent }` envelope — matching the generated TS type. The flat `{ status: "alive" | "expired", lastHeartbeat }` shape only appears on the child instance's health route (`{P}-{C}-http-<60000+id>.{N}` subdomain).
- `kit_slug` always `code`.
- `embedUrl` is a hand-extended SDK builder hung off the `code.vscode` service; an equivalent embed builder also exists on the CLI surface. Composes the iframe URL without firing a request.

## Common errors

- `POST /api/v1/code/extensions/install` / `GET /api/v1/code/extensions/list`: not implemented — at `code-1` the orchestrator returns a plain-text 404; on the child the request falls through to the vscode catch-all (SPA / 302 / 401). The `MISSING_URL`/`INVALID_URL_FORMAT`/`DOWNLOAD_FAILED`/`INSTALLATION_FAILED` codes exist only in the OpenAPI spec, never at runtime.
- Path-proxy 400 `Invalid port`. The cited line only checks `isNaN(port)`; the 1024–65535 range is enforced by the OpenAPI client validator before the request lands.
- `/proxy/{port}/` unauth root returns 302 `/login`; deeper 401.
- `POST /api/v1/code/login` rate-limit returns HTML, not JSON.
- Unauth `GET /api/v1/code` returns 302 `/login`, not 401.
- On the **child instance** (`-http-<port>` subdomain) unmatched `/api/v1/code/*` paths fall through to the editor's catch-all route, which serves the SPA shell / 401 / 302 depending on auth — NOT a JSON 404. At the public `code-1` URL they return the orchestrator's plain-text 404 instead. Test against an explicit known-good path (e.g. `/api/v1/code/health`) for kit liveness.

## Related namespaces

→ `terminal`, `files`, `exec`, `browser`, `daemon`.

## Examples

`code` is a **URL-first** namespace — for most workflows the kit URL itself (with the right query string and / or iframe wrapper) IS the deliverable. The methods here exist to *configure* the editor (install an extension, mint a key, log in), not to drive it. Each example below is a copy-pasteable recipe in the mode you're reading. URL-composition steps are pure string templates and need no kit call. HTTP / SDK steps were verified against the kit source (orchestrator + child-instance routes). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

### 1. Open the editor with a folder pre-loaded — bookmarkable URL

**Goal:** ship a teammate a single URL that opens VS Code already pointing at the right repo. `?folder=<absolute-path>` is persisted as the last-opened workspace in the instance's user-data dir, so even subsequent un-querystringed visits land back on it (until you pass `?ew=true` to clear).

```bash
KIT="https://${P}-${C}-code-1.${N}.containers.hoody.com"
URL="$KIT/?folder=/workspace/myrepo&id=1"
echo "$URL"
# Send / paste / bookmark. The orchestrator boots child instance 1 and iframes the editor
# with /workspace/myrepo in the file tree. (The raw editor surface /api/v1/code?folder=…
# lives on the child subdomain ${P}-${C}-http-60001.${N}…, not on code-1.)
```
To clear the persisted folder later (so the next visit opens the welcome page), append `?ew=true` (`GET /api/v1/code` with `ew=true` wipes the persisted workspace).

### 2. Extension-only embed — boot straight into one extension's UI

**Goal:** open `code-1` as a single extension's panel — no file tree, no command palette, no marketplace. The whole viewport is that extension. Pair with a folder so the extension opens with the right repo selected.

URL pattern (no kit call):

```
https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<absolute-path>&id=1
```

```bash
KIT="https://${P}-${C}-code-1.${N}.containers.hoody.com"
URL="$KIT/?extension=saoudrizwan.claude-dev&folder=/workspace/myrepo&id=1"
echo "$URL"
```
The `extension` query value MUST match `^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$` — `publisher.name` only, no version.

### 3. Install a custom VSIX programmatically

**Goal:** push an internal extension (`.vsix`) into the container's VS Code. ⚠ **`POST /api/v1/code/extensions/install` is spec-only** — the current kit mounts no extensions router, so the documented `POST /api/v1/code/extensions/install` never reaches a handler (`code-1`: orchestrator plain-text 404; child: vscode catch-all SPA/302). What actually works:

- **At child boot (launch flags):** `--install-extension <id-or-vsix-path>`, `--install-builtin-extension <vsix-path>`, or drop VSIXes in the preload dir consumed by `--preload-builtin-extensions-dir` (the platform passes `/hoody/storage/hoody-code/extensions` by default).
- **In-editor:** Extensions view → `…` menu → "Install from VSIX…" (the VSIX must already be on the container filesystem — push it via the `files` namespace).

### 4. List installed extensions + verify a specific one is present

**Goal:** sanity-check after a deploy that the extensions you expected are actually loaded. ⚠ **`GET /api/v1/code/extensions/list` is spec-only** (same as `POST /api/v1/code/extensions/install` — no extensions router is mounted). Verify on disk instead: each child instance keeps its extensions at `/hoody/storage/hoody-code/data/<id>/extensions`, with directory names like `<publisher>.<name>-<version>`. Run the check inside the container via the `terminal` / `exec` namespaces:

```bash
ls /hoody/storage/hoody-code/data/1/extensions
# → ms-python.python-2024.0.0  saoudrizwan.claude-dev-3.7.0  …
ls /hoody/storage/hoody-code/data/1/extensions | grep -q '^saoudrizwan\.claude-dev-' \
  || echo "MISSING: saoudrizwan.claude-dev"
```

(Generated `GET /api/v1/code/extensions/list` accessors on any surface target the unimplemented endpoint and return no data.)

### 5. Path-proxy a container port through the editor — `/proxy/{port}` for browser previews

**Goal:** surface a dev server (Vite, Next.js, `python -m http.server`) running inside the container at `localhost:3000` to your laptop's browser. `/proxy/{port}` rewrites `req.base` so relative URLs in the upstream HTML still resolve under the proxy prefix — use this for **browser-rendered apps with relative asset paths**.

```
https://${P}-${C}-http-60001.${N}.containers.hoody.com/proxy/3000/
```

(`http-<60000+id>` is the **child instance** subdomain — `60001` for `id=1`. The public `code-1` root does NOT route `/proxy`.)

```bash
CHILD="https://${P}-${C}-http-60001.${N}.containers.hoody.com"
# 1. (inside container, e.g. via terminal kit) start a dev server on :3000
# 2. From your laptop:
curl -sIL "$CHILD/proxy/3000/" | head -5
# Unauth root returns 302 → /login; deeper paths return 401. Authenticate first
# (see example 7) then re-issue the request with the session cookie.
```
Port range is `1024–65535`; the kit only enforces `isNaN(port)` at `pathProxy.ts:18` (returns `400 Invalid port`); the 1024–65535 range is enforced by the SDK client validator (`proxy.service.generated.ts:157`) but NOT by the server — raw HTTP callers (curl/fetch) must self-enforce the range.

### 6. Absproxy a container port — `/absproxy/{port}` for raw API / WebSocket passthrough

**Goal:** call a JSON API or open a WebSocket running inside the container with the **path preserved verbatim**. Use this — not `/proxy/` — for any case where the upstream cares about the literal request path (REST APIs, gRPC-Web, WebSockets at fixed routes). The `/proxy` variant rewrites `req.base` and will break path-sensitive servers.

```
https://${P}-${C}-http-60001.${N}.containers.hoody.com/absproxy/8080/v1/items?q=cake
                                                                              ^^^^^^^^^^^^^^^^^ ← upstream sees exactly this path
```

```bash
CHILD="https://${P}-${C}-http-60001.${N}.containers.hoody.com"
# REST GET against the in-container API on :8080:
curl -sf -b /tmp/code-cookie.txt "$CHILD/absproxy/8080/v1/items?q=cake"
# WebSocket (with wscat / SDK):
#   wss://${P}-${C}-http-60001.${N}.containers.hoody.com/absproxy/8080/ws
```
`/proxy` and `/absproxy` share the same auth gate: unauth root returns `302 /login`, deeper paths `401`.

### 7. Authenticate password mode — `GET /api/v1/code/login` + `POST /api/v1/code/login`

**Goal:** when the kit is launched with `--password <plaintext>` / `--hashed-password <argon2>`, every route is gated. The login flow is HTML-form-based (not a JSON API): fetch `/login` to bootstrap, then `POST /login` form-encoded to get a session cookie.

```bash
CHILD="https://${P}-${C}-http-60001.${N}.containers.hoody.com"   # child instance for id=1
# (/login lives on the CHILD root only — the public code-1 URL has no login surface.)
JAR=/tmp/code-cookie.txt; rm -f "$JAR"
# Step 1 — bootstrap the login page (sets the CSRF / pre-session cookies):
curl -sf -c "$JAR" "$CHILD/login" -o /dev/null
# Step 2 — submit the password form-encoded (NOT JSON):
curl -sf -c "$JAR" -b "$JAR" -X POST "$CHILD/login?to=/" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "password=$CODE_PASSWORD" \
  -D - -o /dev/null | grep -iE '^(location|set-cookie):'
# Step 3 — every subsequent child call uses -b "$JAR" (200 = authenticated):
curl -s -b "$JAR" -o /dev/null -w '%{http_code}\n' "$CHILD/api/v1/code"
```
Rate limit: **2/min, 12/hr per process**. Hitting the limit returns HTML, not JSON — tail the body for the literal string `Login rate limited!` (i18n LOGIN_RATE_LIMIT, English locale value).

### 8. Health check + extension verify — post-deploy smoke test

**Goal:** after a container rebuild, confirm the `code` kit is up AND the extensions you ship pre-installed actually loaded. One-shot smoke.

```bash
KIT="https://${P}-${C}-code-1.${N}.containers.hoody.com"
# 1. Health — the public code-1 URL hits the ORCHESTRATOR's standardized envelope:
#    {status:"ok", service:"hoody-code", built, started, memory, fds, pid, ip, userAgent}
HEALTH=$(curl -sf --max-time 30 "$KIT/api/v1/code/health" | jq -r .status)
[ "$HEALTH" = "ok" ] || { echo "kit unhealthy"; exit 1; }
# (The flat {status:"alive"|"expired", lastHeartbeat} shape lives on the CHILD health
#  route — probe https://${P}-${C}-http-60001.${N}…/api/v1/code/health if you need it.)
# 2. Extensions — verify on disk (extensions.list is spec-only, see Example 4); run
#    inside the container via terminal/exec:
#      ls /hoody/storage/hoody-code/data/1/extensions | grep '^saoudrizwan\.claude-dev-'
echo "smoke PASS"
```
⚠ On the **child instance**, `/api/v1/code/health` resets the idle-shutdown heartbeat — only `/healthz` (kit-internal, not surfaced through the public path) is excluded; hitting it on a cron keeps the child hot. The orchestrator's `code-1` health endpoint does not touch child heartbeats.

### 9. Logout + verify the session cookie is revoked

**Goal:** end the password-mode session cleanly when a teammate steps away. `GET /api/v1/code/logout` clears the cookie server-side; subsequent requests with the old cookie redirect to `/login`.

```bash
CHILD="https://${P}-${C}-http-60001.${N}.containers.hoody.com"   # /logout lives on the CHILD root
JAR=/tmp/code-cookie.txt
# 1. Logout — kit clears the session and 302s back to /login:
curl -sf -b "$JAR" "$CHILD/logout" -D - -o /dev/null | grep -iE '^location:'
# 2. Verify: any auth-gated route now redirects to /login (302), confirming revocation:
curl -s -b "$JAR" -o /dev/null -w 'status=%{http_code} loc=%{redirect_url}\n' \
  "$CHILD/api/v1/code"
# Expected → status=302 loc=…/login?to=%2F
```
Note: on the child instance, `/api/v1/code` unauth → `302 /login` (NOT `401`); plan your client to follow / catch the redirect rather than expect a JSON `401` body.

### 10. Embed the extension URL in an iframe — drop VS Code into your own page

**Goal:** ship a brand-able dashboard / docs site / Notion-style canvas with VS Code (or a single extension) embedded as a panel. The kit URL is iframable; just hand the right `src` and `allow` attributes.

```html
<!-- Full editor, with a folder pre-loaded -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=/workspace/myrepo&id=1"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write; cross-origin-isolated"
></iframe>

<!-- Single extension only (no IDE chrome) — Cline as a service -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=saoudrizwan.claude-dev&folder=/workspace/myrepo&id=1"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write"
></iframe>
```

To hide the `containerId` behind a brandable host, wrap the URL with a `POST /api/v1/proxy/aliases` — the iframe `src` becomes `https://agent.{server_name}.containers.hoody.com`, the `containerId` never leaves the server. Gate it via `proxyPermissionsContainer.*` for production (IP allow-list, basic-auth, etc. — see the `api` namespace).

The same iframe pattern works for **every** Hoody kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …) — compose a full HTML "operating system" out of kit iframes with no native code.

## Reference

### `auth` (3) — Authentication endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/code/login` | Get login page | `?to` |
| `POST /api/v1/code/login` | Submit login credentials | `?to` |
| `GET /api/v1/code/logout` | Logout |  |

**Param notes:**

- `to` — URL to redirect to after successful login

### `extensions` (2) — Extension management (CLI)

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/code/extensions/install` | Install VS Code extension from URL | `body*` |
| `GET /api/v1/code/extensions/list` | List installed extensions |  |

**Body shapes:**

- `POST /api/v1/code/extensions/install` body — `{ url*: string, asBuiltin: bool=false }`
  - `url` — URL to the VSIX file to install. Supports: - HTTPS URLs (recommended) - HTTP URLs
  - `asBuiltin` — If true, install as a system/built-in extension. Built-in extensions cannot be uninstalled by users.

### `health` (2) — Health and monitoring

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/code/health` | Service health check |  |
| `GET /api/v1/code/update/check` | Check for updates |  |

### `proxy` (2) — Port forwarding and proxying

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/code/proxy/{port}/{path}` | Proxy to local port (path-based) |  |
| `GET /api/v1/code/absproxy/{port}/{path}` | Proxy to local port (absolute path) |  |

**Param notes:**

- `port` — Local port to proxy to
- `path` — Path to append to the proxied request
- `path` — Path (preserved in forwarded request)

### `static` (5) — Static assets and resources

| Method | Summary | Params |
|--------|---------|--------|
| `GET /_static/{path}` | Get static asset |  |
| `GET /hoody-code/injected/{script}` | Get Hoody Code injected script |  |
| `GET /openapi.yaml` | Get OpenAPI specification |  |
| `GET /robots.txt` | Get robots.txt |  |
| `GET /security.txt` | Get security policy |  |

**Param notes:**

- `path` — Path to static file
- `script` — Script filename

### `vscode` (3) — VS Code web interface

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/code/manifest.json` | Get PWA manifest |  |
| `GET /api/v1/code` | Get VS Code web interface | `?folder` `?workspace` `?extension` `?ew` `?locale` |
| `POST /api/v1/code/mint-key` | Generate server web key |  |

**Param notes:**

- `folder` — Absolute path to folder to open in VS Code.  - Takes precedence over `workspace` parameter - Can be a local filesystem path - Stored in settings for next session
- `workspace` — Absolute path to VS Code workspace file (.code-workspace).  - Used when `folder` is not provided - Workspace files can contain multiple folders and settings - Stored in settings for next session
- `extension` — Extension identifier to open in extension-only mode.  **Format**: `PUBLISHER.NAME`  **Behavior when set**: - File explorer is hidden - Extension's views and UI are prominently displayed - Perfect for creating extension-powered web apps  **Use cases**: - Custom web-based tools built on VS Code extensions - Specialized editors (Jupyter notebooks, database tools, etc.) - Kiosk mode for specific workflows  **Examples**: - `ms-python.python` - Python development - `ms-toolsai.jupyter` - Jupyter notebooks - `ms-azuretools.vscode-docker` - Docker management - `redhat.vscode-yaml` - YAML editing
- `ew` — "Empty Window" flag - indicates workspace was closed.  When present, clears the last opened folder/workspace from settings.
- `locale` — Display language for VS Code UI.  Format: IETF language tag (e.g., en, fr, de, ja, zh-CN)  See: https://en.wikipedia.org/wiki/IETF_language_tag


---

<!-- ===== namespace: cron ===== -->

# `cron` — managed crontab entries per system user

## Purpose

Edit `crontab(1)` of a system user. UUID-keyed managed entries (name, comment, expiry, enabled) coexist with hand-written lines. Sweep drops expired.

## When to use

- Recurring jobs via cron daemon.
- Future commands with `expires_at` cleanup.
- Repair crontab without losing hand-written lines.

## When NOT to use

Not for: ad-hoc → `terminal`/`exec`, long-runners → `daemon`, FS triggers → `watch`.

## Prerequisites

- `crontab(1)` + cron daemon present; `user` in `/etc/passwd`.
- `user`-scoped.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Schedule

`POST /users/{user}/entries` schedule + command (+ name/comment/expires_at/enabled) → `ManagedEntry` with `id`.

### 2. List

`GET /users/{user}/entries` (`page`/`limit`, max 200); the SDK additionally offers auto-pagination helpers (`GET /users/{user}/entries`, `GET /users/{user}/entries`) over the same endpoint.

### 3. Edit / disable / extend

`PATCH /users/{user}/entries/{id}` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

`GET /users/{user}/crontab` (sweep) then `PUT /users/{user}/crontab` body — revalidates `# hoody-cron:` blocks; response has `removed_expired`.

### 5. Audit all users

`GET /crontab` → paginated `{ items: [{ user, crontab }], total, page, limit }`; the SDK additionally offers auto-pagination helpers (`GET /crontab`, `GET /crontab`) over the same endpoint.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject newline/null/VT/FF/NEL/LS/PS; caps 4096/120/500.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB (configurable via `max_crontab_bytes`, default 256 KiB) AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`PUT /users/{user}/crontab` is a full overwrite — destroys every managed entry on the target user, not just the raw lines.** Server persists only the parsed payload via `state.backend.set(&user, &cleaned)`; entries not in the request body are gone. If you mix `POST /users/{user}/entries` and `PUT /users/{user}/crontab` on the same user, every PUT wipes prior managed state. Strategy: pick one (managed-only via the `entries` endpoints, OR raw-only via `PUT /users/{user}/crontab`); if you must mix, treat the PUT body as the canonical source of truth and re-create managed entries after each PUT.
- Forged `# hoody-cron:` lines in PUT body are revalidated and rejected.
- `GET /users/{user}/entries`/`GET /users/{user}/entries/{id}` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `GET /users/{user}/entries` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
- Sweep every 60s default; per-user lock.

## Common errors

- `400 INVALID_EXPIRES_AT` / `EXPIRES_IN_PAST`.
- `400 INVALID_SCHEDULE / Invalid schedule` — Vixie 5-field plus `@`-macros only; Quartz / 6-field rejected.
- `413 PAYLOAD_TOO_LARGE` — body exceeds 256 KiB cap.
- `500 BACKEND_ERROR` — `crontab(1)` fail / 30s timeout.
- `403 Forbidden` — private IP, no dev-server.

## Related namespaces

- `terminal`, `daemon`, `exec`, `watch`, `files`.

## Examples

Every step in every example was live-tested against a real `cron-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the container's LOCAL timezone (the kit does no TZ conversion; only `expires_at` is UTC-anchored), set the entry to expire end of 2026; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
ID=$(curl -sX POST "$KIT/users/root/entries" \
  -H 'Content-Type: application/json' \
  -d '{
    "schedule": "0 2 * * *",
    "command": "pg_dump -U postgres mydb | gzip > /backups/db-$(date +\\%F).sql.gz",
    "name": "nightly-db-backup",
    "expires_at": "2026-12-31T23:59:59Z"
  }' | jq -r '.id')
echo "id=$ID"
```
**Step 2 — trial-run** by tightening to every minute. Wait ~70 s then `tail /var/log/syslog` (via the `terminal` kit) to confirm cron actually fired the job.

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"schedule":"* * * * *","comment":"TEST MODE — revert before merge"}'
```
**Step 3 — promote back to nightly** with a clean comment.

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"schedule":"0 2 * * *","comment":"production schedule"}'
```
### 2. Maintenance window — pause every managed job, do work, resume

**Goal:** disable every managed entry so nothing fires during a 30-min DB migration; re-enable once clean.

**Step 1 — capture every enabled managed id.**

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
IDS=$(curl -sf "$KIT/users/root/entries" \
  | jq -r '.entries[] | select(.type=="managed" and .enabled) | .id')
echo "$IDS"
```
**Step 2 — bulk disable.**

```bash
for id in $IDS; do
  curl -sX PATCH "$KIT/users/root/entries/$id" \
    -H 'Content-Type: application/json' \
    -d '{"enabled":false}' >/dev/null
done
```
**Step 3 — run your migration. Step 4 — bulk re-enable** (same loop, body `{ enabled: true }`). Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields. ⚠ Read the warning at step 3 before running anything destructive.

**Step 1 — read the raw crontab.** `GET /users/{user}/entries` shows the same lines as `{ type: 'raw', line: '...' }` items.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
curl -sf "$KIT/users/root/crontab" | jq -r .crontab
```
**Step 2 — re-create as managed.** Parse each raw line into `(schedule, command)` and POST it.

```bash
# expects each $LINE to be `<schedule> <command>` (5 fields + remainder)
SCHED=$(echo "$LINE" | awk '{print $1,$2,$3,$4,$5}')
CMD=$(echo "$LINE"   | awk '{$1=$2=$3=$4=$5=""; sub(/^ +/,""); print}')
curl -sX POST "$KIT/users/root/entries" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg s "$SCHED" --arg c "$CMD" --arg n "$NAME" \
    '{schedule:$s,command:$c,name:$n}')"
```
**Step 3 — ⚠ DESTRUCTIVE — wipe the raw lines.** `PUT /users/{user}/crontab` REPLACES the entire crontab including managed entries (live-verified — see Quirks). Do this ONLY after step 2 has succeeded, and re-create the managed entries AFTER the wipe if you want them back.

```bash
curl -sX PUT "$KIT/users/root/crontab" \
  -H 'Content-Type: application/json' \
  -d '{"crontab":""}'
```
### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.**

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
ID=$(curl -sf "$KIT/users/root/entries" \
  | jq -r '.entries[] | select(.type=="managed" and .name=="health-poll") | .id')
```
**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' -d '{"schedule":"*/5 * * * *"}'
```
**Step 3 — restore** to hourly with body `{ schedule: '0 * * * *' }` once the investigation is over (same call, different schedule string).

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
ID=$(curl -sX POST "$KIT/users/root/entries" \
  -H 'Content-Type: application/json' \
  -d '{
    "schedule":"@daily",
    "command":"/opt/metrics/sample.sh",
    "name":"metrics-experiment",
    "expires_at":"2026-07-08T00:00:00Z"
  }' | jq -r .id)
```
After the timestamp passes, the kit's 60 s sweep **deletes** expired managed entries. `GET /users/{user}/entries`/`GET /users/{user}/entries/{id}` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `PUT /users/{user}/crontab` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (push out by 30 days):

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"expires_at":"2026-08-07T00:00:00Z"}'
```
**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```bash
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' -d '{"clear_expiration":true}'
```
### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.**

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
ENTRY_ID=$(curl -sf "$KIT/users/root/entries" \
  | jq -r '.entries[] | select(.type=="managed" and .name=="noisy-job") | .id')
echo "$ENTRY_ID"
# → e.g. ced921ab-a14e-410e-99e2-0a5c35ee730b
```
**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```bash
curl -sX PATCH "$KIT/users/root/entries/$ENTRY_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"enabled\":false,\"comment\":\"disabled $(date -u +%FT%TZ) — investigating\"}"
```
**Step 3 — re-enable later** by calling the same update with `{ enabled: true }`.

### 7. Audit which users on the container have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". Container has 60+ system users; you want one shot.

`GET /crontab` returns one record per account in `/etc/passwd` (`{ user, crontab }`). Filter client-side for non-empty `crontab`.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
curl -sf "$KIT/crontab?limit=200" \
  | jq '.items[] | select(.crontab | test("\\S")) | {user, crontab}'
```
For each non-empty user, drill in via `GET /users/{user}/entries` for the managed view, or read the `crontab` text directly from step 1.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. ⚠ Destructive — wipes managed AND raw entries.

**Step 1 — snapshot current state** for forensics:

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
curl -sf "$KIT/users/root/crontab" > /tmp/cron-snapshot.json
```
**Step 2 — push the canonical config.** Body MUST be `application/json` (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```bash
NEW=$(cat /etc/iac/canonical-crontab.txt)
curl -sX PUT "$KIT/users/root/crontab" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$NEW" '{crontab:$c}')"
```
### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without risking changing what the entry does. PATCH is partial — fields you don't pass stay put.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
curl -sX PATCH "$KIT/users/root/entries/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"comment":"owner: @team · runbook: https://wiki.example.com/cron-x"}'
```
`updated_at` advances; `schedule` / `command` / `enabled` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw).

**Step 1 — fetch** the multi-line string. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back.** ⚠ This also wipes any managed entries — re-create them with `POST /users/{user}/entries` afterwards if you had any.

```bash
KIT="https://${P}-${C}-cron-1.${N}.containers.hoody.com"
CUR=$(curl -sf "$KIT/users/root/crontab" | jq -r .crontab)
NEW=$(echo "$CUR" | grep -v '^\*/30 \* \* \* \* /old\.sh')
curl -sX PUT "$KIT/users/root/crontab" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$NEW" '{crontab:$c}')"
```

## Reference

### `crontab` (3) — Raw crontab management

| Method | Summary | Params |
|--------|---------|--------|
| `GET /users/{user}/crontab` | Get Crontab |  |
| `GET /crontab` | List All Crontabs | `?page` `?limit` |
| `PUT /users/{user}/crontab` | Put Crontab | `body*:cron_RawCrontabRequest` |

**Param notes:**

- `user` — System username
- `page` — Page number (1-based)
- `limit` — Items per page (max 200)

### `entries` (5) — Managed entry CRUD

| Method | Summary | Params |
|--------|---------|--------|
| `POST /users/{user}/entries` | Create Entry | `body*:cron_CreateEntryRequest` |
| `DELETE /users/{user}/entries/{id}` | Delete Entry |  |
| `GET /users/{user}/entries/{id}` | Get Entry |  |
| `GET /users/{user}/entries` | List Entries | `?page` `?limit` |
| `PATCH /users/{user}/entries/{id}` | Update Entry | `body*:cron_UpdateEntryRequest` |

**Param notes:**

- `user` — System username
- `page` — Page number (1-based)
- `limit` — Items per page (max 200)

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /health` | Health Check |  |

### `system` (2) — System endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /openapi.json` | Get Open Api Json |  |
| `GET /openapi.yaml` | Get Open Api Yaml |  |


### Body schemas

- `cron_RawCrontabRequest` — `{ crontab*: string }`
- `cron_CreateEntryRequest` — `{ command*: string, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule*: string }`
- `cron_UpdateEntryRequest` — `{ clear_expiration: bool|null, command: string|null, comment: string|null, enabled: bool|null, expires_at: string|null, name: string|null, schedule: string|null }`

---

<!-- ===== namespace: curl ===== -->

# `curl` — full HTTP client gateway + REST-as-GET-URL bridge

## Purpose

Full HTTP client gateway. Sync/async jobs, cookie jars, bodies to storage, cron schedules. **Killer use case: turn any REST request — POST / PUT / PATCH / DELETE with bodies and headers — into a single GET-able URL** that works in a browser tab, a webhook field that only takes a URL, an LLM tool with web-search-only access, an `<img src>` / `<a href>`, or any environment that can't issue a non-GET request. The kit takes care of the actual HTTP call; the caller just hits a query-string URL.

## When to use

- **REST-as-GET bridge** — any environment that can only do GET (browsers, restricted webhooks, agents with only "fetch URL" capability, RSS-style schedulers, copy-pasteable links). See workflow #1 for the URL recipe.
- A full HTTP client surface (TLS, client certs, HTTP/2/3, proxies, retries) when you can't / don't want to use `fetch()`.
- Long downloads as background jobs.
- Multi-step auth with cookie jars (server-side session reused across hits).
- Recurring HTTP (pings, scrapes, webhooks) on a cron.

## When NOT to use

Not for: browser → `browser`, shell → `exec`/`terminal`, KV/SQL → `sqlite`, files → `files`, non-HTTP timers → `cron`.

## Prerequisites

- Instance `1`; no workspace ID.
- `* /api/v1/curl/schedule*` 404s if disabled.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Convert any REST call into a single GET-able URL (`GET /api/v1/curl/request`)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }`. Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; standard OR URL-safe base64, padding optional; takes precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Only `form`/multipart and binary `--data-binary @file` uploads remain POST-only.

Live examples (verified — replace the kit URL with your container's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `POST /api/v1/proxy/aliases` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

The CLI command and the SDK accessor `GET /api/v1/curl/request` **execute** the request and return the envelope; they do NOT just compose a URL string. To compose a URL without firing it, build it client-side or use `POST /api/v1/proxy/aliases` to get a stable prefix.

For the imperative full-cURL surface (binary uploads, `--data-binary @file`, multipart, follow-redirects, custom TLS, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`POST /api/v1/curl/request` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `POST /api/v1/curl/request` with `mode:"async"` → `job_id`.
2. Poll `GET /api/v1/curl/jobs/{id}` or subscribe `GET /api/v1/curl/ws` filtered by `job_id`.
3. `GET /api/v1/curl/jobs/{id}/result`; `DELETE /api/v1/curl/jobs/{id}` aborts.

### 4. Cookie-jar session

1. `POST /api/v1/curl/request` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `GET /api/v1/curl/sessions/{id}/cookies` / `DELETE /api/v1/curl/sessions/{id}`.

### 5. Save download

1. `POST /api/v1/curl/request` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `GET /api/v1/curl/storage`/`GET /api/v1/curl/storage/{path}`/`DELETE /api/v1/curl/storage/{path}` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `POST /api/v1/curl/schedule` with `{cron,request}` → `schedule_id`.
2. `GET /api/v1/curl/schedule`/`GET /api/v1/curl/schedule/{id}`/`PATCH /api/v1/curl/schedule/{id}/toggle` (`{"enabled":bool}`)/`DELETE /api/v1/curl/schedule/{id}`.
3. Each firing creates a job; inspect via `GET /api/v1/curl/jobs`.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **Each saved download is mirrored under three indexes** for navigation: `by-job/{job_id}/<save_path>`, `by-domain/<host>/<job_id>`, `by-date/<YYYY-MM-DD>/<job_id>`. `GET /api/v1/curl/storage` returns one item per index path; the bytes are the same file (live-verified — `storage.list?limit=5` after one save returns 3 items pointing to the same content).
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `* /api/v1/curl/schedule*` 404s if disabled.
- `PATCH /api/v1/curl/schedule/{id}/toggle` needs explicit boolean `enabled`; else 400.
- **`schedules.create.cron` is 6-field (with seconds), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- `GET /api/v1/curl/ws` is WebSocket `/api/v1/curl/ws`; filter by `job_id`.

## Common errors

- `408 timeout` — raise timeout or use async (upstream libcurl timeouts surface as `504` instead).
- `410 cancelled`.
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Every step in every example was live-tested against a real `curl-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

### 1. Webhook receiver bridge — outbound system can only fire GETs

**Goal:** your CRM can fire URLs but not POST. Translate a click → real upstream POST with JSON body + bearer.

**Step 1 — compose the bridge URL — body and headers go right in the query string.** The GET bridge takes `url`, `method`, the timing/session/response flags (`response`, `mode`, `session_id`, `timeout`, `bearer_token`, …), **plus the request body + headers**: `data` (raw body), `json` (JSON body; sets `Content-Type: application/json`), `data_base64` (binary-safe base64, standard or URL-safe, precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the method GET→POST.** So a real `POST … {json} + headers` becomes one GET-able link a CRM/webhook can fire:

```
# Full POST as ONE GET URL (json body + header; method auto-upgrades to POST):
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&json=%7B%22event%22%3A%22X%22%7D&header=Authorization:%20Bearer%20XYZ
# For payloads with &, quotes, newlines, or binary, prefer data_base64 (URL-safe base64) to dodge escaping:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<target>&data_base64=eyJldmVudCI6IlgifQ&header=Content-Type:%20application/json
```

(`form`/multipart and binary `--data-binary @file` uploads remain POST-only — use the POST form below for those.)

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
# Drive the upstream POST directly from the kit (server-to-server, no clickable URL):
curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://my-api/events","method":"POST","data":"{\"event\":\"X\"}","headers":{"Content-Type":"application/json"}}'
```
**Step 2 — hide the `containerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```bash
curl -sX POST "https://api.hoody.com/api/v1/proxy/aliases" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg cid "$C" '{container_id:$cid, alias:"webhook-bridge", program:"curl", target_path:"/api/v1/curl/request", allow_path_override:true}')"
```
### 2. Multi-step OAuth login — cookie jar reuse across hits

**Goal:** authenticate against an API that uses a CSRF token + session cookie, then issue an authorized call. Pick a unique `session_id` per flow — once deleted, the same id returns `404 Session not found: <id> (tombstoned)` until the tombstone is garbage-collected (~24 h), after which the id is reusable again.

**Step 1 — fetch CSRF.** The Set-Cookie / response cookies are stored in the kit's jar.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
SID="oauth-$(date +%s)"
TOKEN=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{url:"https://api.example.com/csrf", method:"GET", session_id:$sid, response:"json"}')" \
  | jq -r '.body | fromjson | .csrf_token')
echo "csrf=$TOKEN  session=$SID"
```
**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar.

```bash
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" --arg t "$TOKEN" '{
    url:"https://api.example.com/login", method:"POST",
    data:"username=alex&password=secret&csrf="+$t,
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    session_id:$sid
  }')"
```
**Step 3 — authorized call.** Stored cookie is auto-attached.

```bash
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{url:"https://api.example.com/me", method:"GET", session_id:$sid, response:"json"}')" \
  | jq -r .body
# Inspect the jar:
curl -sf "$KIT/api/v1/curl/sessions/$SID/cookies"
# Drop when done:
curl -sX DELETE "$KIT/api/v1/curl/sessions/$SID"
```
### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JOBS=()
for URL in https://httpbin.org/delay/1 https://httpbin.org/delay/2 https://httpbin.org/get; do
  JID=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg u "$URL" '{url:$u, method:"GET", mode:"async"}')" \
    | jq -r .job_id)
  JOBS+=("$JID")
done
echo "${JOBS[@]}"
```
**Step 2 — poll until all complete.** Live-verified — 3 httpbin jobs reached `completed/200` within ~4 s.

```bash
while :; do
  done=true
  for JID in "${JOBS[@]}"; do
    S=$(curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq -r .status)
    [ "$S" = "completed" ] || done=false
  done
  $done && break
  sleep 1
done
```
**Step 3 — collect bodies.** `GET /api/v1/curl/jobs/{id}/result` returns just the upstream body.

```bash
for JID in "${JOBS[@]}"; do
  curl -sf "$KIT/api/v1/curl/jobs/$JID/result" > "/tmp/$JID.json"
done
```
### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Status flips from `running` to `cancelled`, and the cancelled job's `error` field is set to `Cancelled`.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JID=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/delay/30","method":"GET","mode":"async","timeout":60}' \
  | jq -r .job_id)
sleep 1
curl -sX DELETE "$KIT/api/v1/curl/jobs/$JID"
sleep 1
curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq '{status, error}'
```
### 5. Schedule + drift detection — fire every 15 min, audit history

**Goal:** ping a health endpoint every 15 min, fast-find failures. ⚠ Scheduler uses **6-field** cron syntax (with seconds) — `*/15 * * * *` (5-field) is rejected as `Invalid cron expression`.

**Step 1 — create.**

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
SID=$(curl -sf -X POST "$KIT/api/v1/curl/schedule" \
  -H 'Content-Type: application/json' \
  -d '{
    "cron":"0 */15 * * * *",
    "request":{"url":"https://prod.example.com/health","method":"GET","job_name":"prod-health"}
  }' | jq -r .schedule_id)
echo "schedule=$SID"
```
**Step 2 — audit failures.**

```bash
curl -sf "$KIT/api/v1/curl/jobs?limit=200" \
  | jq '.items[] | select(.status=="failed") | select(.name=="prod-health")'
```
**Step 3 — pause during deploy** (toggle `enabled: false` and back, or `delete` to drop entirely):

```bash
curl -sX PATCH "$KIT/api/v1/curl/schedule/$SID/toggle" \
  -H 'Content-Type: application/json' -d '{"enabled":false}'
# Resume: same call with {"enabled":true}. Drop entirely:
curl -sX DELETE "$KIT/api/v1/curl/schedule/$SID"
```
### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JID=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{
    "url":"https://example.com/big.iso","method":"GET","mode":"async",
    "save":true,"save_path":"iso/ubuntu.iso","timeout":600
  }' | jq -r .job_id)
```
**Step 2 — wait + inspect storage.** Three index entries point at the SAME bytes (`by-job/`, `by-domain/`, `by-date/`).

```bash
while [ "$(curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq -r .status)" != "completed" ]; do sleep 2; done
curl -sf "$KIT/api/v1/curl/storage?limit=10" | jq '.items[] | .path'
```
**Step 3 — fetch & delete.** Single delete on ANY of the three mirror paths removes all three (live-verified — others return `404` afterwards).

```bash
curl -sf "$KIT/api/v1/curl/storage/by-job/$JID/iso/ubuntu.iso" > /tmp/ubuntu.iso
curl -sX DELETE "$KIT/api/v1/curl/storage/by-job/$JID/iso/ubuntu.iso"
```
### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Live-verified against `httpbin.org/bearer` (`{"authenticated":true,"token":"…"}`).

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{
    "url":"https://api.github.com/user","method":"GET",
    "bearer_token":"ghp_xxxxxxxxxxxx","response":"json"
  }' | jq '{status_code, headers: .headers | {x_ratelimit_remaining: .["x-ratelimit-remaining"], x_ratelimit_reset: .["x-ratelimit-reset"]}, body}'
```
**HTTP Basic alternative** — swap the auth fields. Body `{ url, method, auth_user, auth_password, auth_method: 'basic' }`. Live-verified against `httpbin.org/basic-auth/alex/secret` → `{"authenticated":true,"user":"alex"}`.

### 8. REST→GET bridge for chat-channel embedding

**Goal:** drop a one-liner URL into Slack so a teammate can re-trigger a build by clicking. URL pattern + alias + IP gate.

**Step 1 — compose** (no kit call — URL pattern). The GET bridge carries the full request in the query string — `url`, `method`, body via `data`/`json`/`data_base64`, and repeatable `header=Name: Value` (a body auto-upgrades the method to POST). So a build-trigger that needs a JSON body + auth header is still one clickable link.

```
# GET-bridge URL — a real POST (json body + bearer header) as a single clickable link:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<url-encoded-build-trigger>&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ
```

**Step 2 — wrap with an alias** so the public URL hides `containerId`:

```bash
ENCODED='/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST'
curl -sX POST "https://api.hoody.com/api/v1/proxy/aliases" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg cid "$C" --arg p "$ENCODED" \
    '{container_id:$cid, alias:"rebuild-main", program:"curl", target_path:$p, allow_path_override:false}')"
```
**Step 3 — gate it** — only your office IPs can fire it (uses `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Job records are NOT auto-expired by the kit — they persist until the container's storage is cleared.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`):

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JID=$(curl -sf "$KIT/api/v1/curl/jobs?limit=200" \
  | jq -r '.items[] | select(.status=="completed" and .name=="prod-health" and (.completed_at | fromdate) > (now - 86400)) | .id' \
  | head -1)
```
**Step 2 — fetch.** `GET /api/v1/curl/jobs/{id}/result` returns just the upstream body; `GET /api/v1/curl/jobs/{id}` returns the full record (timing, headers, original request).

```bash
curl -sf "$KIT/api/v1/curl/jobs/$JID/result"   # body only
curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq '.' # full record
```
### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%d)
curl -sf "$KIT/api/v1/curl/storage?limit=200" \
  | jq -r --arg c "$CUTOFF" '.items[] | select(.path | startswith("by-date/")) | select((.path | split("/")[1]) < $c) | .path' \
  | while IFS= read -r P; do
      curl -sX DELETE "$KIT/api/v1/curl/storage/$P"
    done
# Single delete on any one of the 3 mirror paths removes all 3.
```

## Reference

### `curl` (2) — cURL execution endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/curl/request` | Execute HTTP request with full cURL capabilities | `body*:curl_CurlRequest` |
| `GET /api/v1/curl/request` | Execute simple HTTP request via query parameters | `?url*` `?method` `?response` `?mode` `?session_id` `?follow_redirects` `?timeout` `?user_agent` `?referer` `?bearer_token` `?save` `?save_path` `?insecure` `?compressed` `?job_name` `?data` `?json` `?header` `?data_base64` |

**Param notes:**

- `url` — Target URL (required)
- `method` — HTTP method (default: GET)
- `response` — Response mode: transparent or json (default: json)
- `mode` — Execution mode: sync or async (default: sync)
- `session_id` — Session ID for cookie persistence
- `follow_redirects` — Follow redirects (default: true)
- `timeout` — Timeout in seconds
- `user_agent` — User-Agent header
- `referer` — Referer header
- `save` — Save to storage
- `save_path` — Custom save path, relative to downloads/by-job/{job_id} (no absolute paths or `..`)
- `insecure` — Allow insecure SSL
- `compressed` — Request compressed
- `job_name` — Job name for async
- `data` — Raw request body (curl --data); alias `body`; presence upgrades default method to POST
- `json` — JSON request body, sent with Content-Type: application/json (curl --json); upgrades default method to POST
- `header` — Custom header as `Name: Value`. Repeatable — supply once per header
- `data_base64` — Base64 request body (binary-safe; standard or URL-safe); alias `body_base64`. Takes precedence over data/json; upgrades default method to POST

### `events` (3) — WebSocket event endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/curl/sse` | Subscribe to job events over Server-Sent Events | `?job_id` |
| `GET /api/v1/curl/ws` | Subscribe to job events over WebSocket | `?job_id` |
| `GET /api/v1/curl/channel` | Execute cURL requests over a WebSocket channel | `?max_concurrent` `?max_concurrent_streams` `?max_pool` `?max_queue` `?max_frame_bytes` `?max_request_bytes` `?chunk_bytes` `?stream_timeout_secs` `?idle_timeout_secs` `?max_outbound_messages` |

**Param notes:**

- `job_id` — Optional job ID filter
- `max_concurrent` — Alias for max concurrent streams on this channel connection
- `max_concurrent_streams` — Maximum concurrently executing streams on this channel connection
- `max_pool` — Alias for max_concurrent; does not configure outbound libcurl connection pooling
- `max_queue` — Maximum queued streams waiting for a per-connection execution slot
- `max_frame_bytes` — Maximum inbound WebSocket text frame size in bytes
- `max_request_bytes` — Maximum assembled request JSON size in bytes
- `chunk_bytes` — Maximum upstream response bytes encoded into one channel body frame
- `stream_timeout_secs` — Per-stream execution timeout in seconds
- `idle_timeout_secs` — Idle channel timeout in seconds
- `max_outbound_messages` — Maximum queued outbound channel messages

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/curl/health` | Service health check |  |

### `jobs` (4) — Job management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/jobs/{id}` | Cancel a pending or running job |  |
| `GET /api/v1/curl/jobs/{id}` | Get detailed job information |  |
| `GET /api/v1/curl/jobs/{id}/result` | Get job response body |  |
| `GET /api/v1/curl/jobs` | List all async jobs | `?page` `?limit` |

**Param notes:**

- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

### `ops` (1) — Operational endpoints (health and metrics)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /metrics` | Prometheus metrics |  |

### `schedules` (5) — Schedule management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/curl/schedule` | Create a recurring scheduled job | `body*:curl_CreateScheduleRequest` |
| `DELETE /api/v1/curl/schedule/{id}` | Delete a schedule |  |
| `GET /api/v1/curl/schedule/{id}` | Get schedule details |  |
| `GET /api/v1/curl/schedule` | List all scheduled jobs | `?page` `?limit` |
| `PATCH /api/v1/curl/schedule/{id}/toggle` | Enable or disable a schedule | `body*` |

**Param notes:**

- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

**Body shapes:**

- `PATCH /api/v1/curl/schedule/{id}/toggle` body — `any` — Toggle a schedule between enabled and disabled states without deleting it. Request body: {"enabled": true} or {"enabled": false}

### `sessions` (4) — Session management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/sessions/{id}` | Delete a session |  |
| `GET /api/v1/curl/sessions/{id}` | Get session details |  |
| `GET /api/v1/curl/sessions/{id}/cookies` | Get session cookies only |  |
| `GET /api/v1/curl/sessions` | List all cookie sessions | `?page` `?limit` |

**Param notes:**

- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

### `storage` (3) — Storage management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/storage/{path}` | Delete a saved file |  |
| `GET /api/v1/curl/storage/{path}` | Download a saved file |  |
| `GET /api/v1/curl/storage` | List all saved downloads | `?page` `?limit` |

**Param notes:**

- `path` — Relative path to file in storage
- `path` — Relative path to file in storage (supports nested paths)
- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)


### Body schemas

- `curl_CurlRequest` — `{ auth_method: string|null, auth_password: string|null, auth_user: string|null, bearer_token: string|null, cacert: string|null, cert: string|null, cert_type: string|null, compressed: bool|null, connect_timeout: int|null, cookie: string|null, data: string|null, follow_redirects: bool|null, form: { [key: string]: string }|null, headers: { [key: string]: string }|null, insecure: bool|null, job_name: string|null, json: any, keepalive: bool|null, keepalive_time: int|null, key: string|null, max_filesize: int|null, max_redirects: int|null, method: string|null, mode: null | curl_ExecutionMode, proxy: string|null, proxy_password: string|null, proxy_user: string|null, range: string|null, referer: string|null, response: null | curl_ResponseMode, retry_count: int|null, retry_delay: int|null, save: bool|null, save_path: string|null, schedule: string|null, session_id: string|null, speed_limit: int|null, speed_time: int|null, tcp_nodelay: bool|null, timeout: int|null, url*: string, user_agent: string|null }`
- `curl_CreateScheduleRequest` — `{ cron*: string, request*: curl_CurlRequest }`
- `curl_ExecutionMode` — `"sync" | "async"`
- `curl_ResponseMode` — `"transparent" | "json"`

---

<!-- ===== namespace: daemon ===== -->

# `daemon` — supervisord program lifecycle (start any program; logs always retained)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Log FILES outlive the process on disk, but the ephemeral tracking entry is reaped on stop/exit — after that `GET /api/v1/daemon/quick-start/{id}/logs` 404s (see Quirks); capture logs before stopping, or read the on-disk files directly (e.g. via the `files` namespace). `GET /api/v1/daemon/programs/{id}/logs` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, no config write)** — `quickStart.launch { command, user, ttl?, wait?, timeout? }`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). Logs survive the process; pull with `GET /api/v1/daemon/quick-start/{id}/logs`. Optional `ttl` auto-stops after N seconds.
- **Registered program (durable, persists across kit restarts)** — `programs.add { name, command, user, enabled: true, boot: true?, autorestart: 'unexpected', … }` → `control.start { wait: true }`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `POST /api/v1/daemon/quick-start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `POST /api/v1/daemon/programs/add` + `POST /api/v1/daemon/programs/{id}/start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → use `terminal` with a **pinned non-ephemeral `terminal_id`**, NOT `daemon`. Daemon programs have no TTY.
- Need to pipe input mid-run / send keystrokes → `terminal` (`POST /api/v1/terminal/press`, `POST /api/v1/terminal/paste`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant container fleets) — `POST /api/v1/daemon/programs/add` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the container's "default-on" baseline (boots with the container, never managed externally).

## Prerequisites

- `/dev/hoody`, `/hoody`, `LOG_BASE_DIR=/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `POST /api/v1/daemon/programs/add` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `POST /api/v1/daemon/programs/{id}/start` `{ wait: true, timeout: 30 }` -> `GET /api/v1/daemon/status/{id}` (`include_stats`); `GET /api/v1/daemon/programs/{id}/logs` on failure.

### 2. Ephemeral with TTL

- `POST /api/v1/daemon/quick-start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `GET /api/v1/daemon/quick-start/{id}/status`/`GET /api/v1/daemon/quick-start/{id}/logs`; `POST /api/v1/daemon/quick-start/{id}/stop` to terminate.

### 3. Lazy port-range fleet

- `POST /api/v1/daemon/programs/add` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `programs.list?port=8042&include_status=true`. `POST /api/v1/daemon/programs/{id}/start` `{ port: 8042 }`; `POST /api/v1/daemon/programs/{id}/stop` `{ port }` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `proxyPermissionsContainer.*` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`POST /api/v1/daemon/programs/edit/{id}` field-merge; `POST /api/v1/daemon/programs/{id}/disable`/`POST /api/v1/daemon/programs/{id}/enable`; `POST /api/v1/daemon/programs/remove/{id}`; `POST /api/v1/daemon/programs/reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`; `1`/`yes`/`0`/`""` -> 400.
- Webhook URLs HTTPS-only unless `NODE_ENV=development` (which also skips every host check below). Userinfo is always rejected; in production the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`) — but only when the URL authority is already an IP literal or `localhost`. A DNS name is accepted whatever it resolves to, so treat this as input validation, not an egress control. Redirects are never followed.
- Webhook edits deep-merge (omitted fields NOT cleared); events need `notifications.enabled` + `event_listener_enabled` + supervisord `eventlistener`.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` confined to `LOG_BASE_DIR`.
- `POST /api/v1/daemon/programs/{id}/start` on `port_range` REQUIRES `{ port }`; `POST /api/v1/daemon/programs/{id}/stop` `{ port }` or `{ all: true }`.
- `quick_<ms>_<seq>` IDs (e.g. `quick_1700000000000_1`) are produced by the kit (which accepts `^quick_[a-zA-Z0-9_]+$` via `sanitize_temp_id`) but the OpenAPI path-param schema is the stricter `^quick_\d+$`, and the generated **TypeScript SDK enforces it client-side** — the CLI and raw HTTP pass the full id straight to the kit and work fine. In SDK mode, drive `GET /api/v1/daemon/quick-start/{id}/status` / `POST /api/v1/daemon/quick-start/{id}/stop` via raw HTTP to avoid the local validator, OR call `GET /api/v1/daemon/quick-start` and select by `name`. TTL polled ~10 s.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `POST /api/v1/daemon/quick-start/{id}/stop`, the in-memory tracking entry is removed (the on-disk log files persist but are unreachable through `GET /api/v1/daemon/quick-start/{id}/logs`, which returns `404`). Capture logs (read `GET /api/v1/daemon/quick-start/{id}/logs` or fetch the on-disk file directly) BEFORE calling `stop`.
- `POST /api/v1/daemon/programs/{id}/start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running (port-range responses include an `instance` block with per-instance status/pid; standard programs return `instance: null` — no pid). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `POST /api/v1/daemon/programs/edit/{id}` (not per-key merge). If the existing env is `{A:1,B:2}` and you PATCH `{environment:{A:9}}`, the result is `{A:9}`. To preserve secrets, GET the program first and re-send the merged map.
- Webhook delivery requires THREE flags ON: per-program `webhooks.enabled: true`, kit-level `notifications.enabled: true`, AND kit-level `event_listener_enabled: true`. Toggling only the per-program flag will not fire callbacks.
- Proxy `X-Bypass-Local-Restrictions` strips `command`/`environment`/`directory`/`user`/`webhooks`/`stdout_logfile`/`stderr_logfile`.
- CLI `--port-range-{start,end}` -> nested `port_range`.

## Common errors

- 400 webhook: `must use HTTPS`, `contains userinfo`, `reserved IP range`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required` / `Program with ID {id} is disabled` -> `POST /api/v1/daemon/programs/{id}/enable`.
- Direct private-IP connections get a plain `403 Forbidden` (the kit logs `connection blocked reason=private_ip` server-side; that string is NOT in the response) -> use the capability URL.
- 1 MB JSON body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Every step in every example was live-tested against a real `daemon-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `POST /api/v1/daemon/programs/add` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
ID=$(curl -sX POST "$KIT/api/v1/daemon/programs/add" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"examples-daemon-tick",
    "command":"sh -c '\''while :; do echo tick $(date -u +%s); sleep 5; done'\''",
    "user":"user","enabled":true,"boot":true,"autorestart":"unexpected"
  }' | jq -r '.program.id')
echo "id=$ID"
```
**Step 2 — `POST /api/v1/daemon/programs/{id}/start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (live-verified — `wait:true,timeout:30` returned client-side timeout). Pass `wait: false` and poll `GET /api/v1/daemon/status/{id}` instead.

```bash
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"wait":false}'
# Poll until running:
while [ "$(curl -sf "$KIT/api/v1/daemon/status/$ID" | jq -r .status.status)" != "running" ]; do sleep 1; done
```
### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no config write), let it run up to 10 minutes, retrieve its output. ⚠ **Major quirk (TypeScript SDK only)** — `POST /api/v1/daemon/quick-start` returns `temporary_id = "quick_<ms>_<seq>"` (e.g. `quick_1700000000000_1`), but the generated SDK's client-side validator rejects that exact id on `GET /api/v1/daemon/quick-start/{id}/status` with `id must match pattern: ^quick_\d+$` (live-verified); the CLI and raw HTTP accept the full id and work fine. Truncating to `quick_<ms>` returns 404. **SDK workaround:** use `GET /api/v1/daemon/quick-start` to find the entry by `name`, or call `GET /api/v1/daemon/quick-start/{id}/logs` (which DOES accept the full id) to verify the run.

**Step 1 — launch.**

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
QID=$(curl -sX POST "$KIT/api/v1/daemon/quick-start" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"examples-daemon-qs",
    "command":"sh -c \"for i in $(seq 1 30); do echo qs-$i; sleep 1; done\"",
    "user":"user","ttl":600
  }' | jq -r .temporary_id)
echo "qid=$QID"   # e.g. quick_1700000000000_1
```
**Step 2 — find via `GET /api/v1/daemon/quick-start` (in SDK mode this avoids the TypeScript SDK's client-side `^quick_\d+$` pattern validator on `GET /api/v1/daemon/quick-start/{id}/status`; CLI and raw HTTP don't need the detour).**

```bash
curl -sf "$KIT/api/v1/daemon/quick-start" \
  | jq '.ephemeral_programs[] | select(.name=="examples-daemon-qs") | {temporary_id,status,expires_at}'
```
**Step 3 — tail logs (the full id with `_<seq>` is accepted here).**

```bash
curl -sf "$KIT/api/v1/daemon/quick-start/$QID/logs?type=stdout&lines=10" | jq -r .logs
```
**Step 4 — stop.** ⚠ The kit's `POST /api/v1/daemon/quick-start/{id}/stop` accepts the full `quick_<ms>_<seq>` id (as do the CLI and raw HTTP), but the **generated TypeScript SDK enforces a stricter `^quick_\d+$` pattern client-side** and rejects real ids returned by `POST /api/v1/daemon/quick-start`. In SDK mode drive stop via raw HTTP **POST** to `/api/v1/daemon/quick-start/{id}/stop`, or look up by `name` via `GET /api/v1/daemon/quick-start` and use the SDK only for ids matching the stricter pattern.

```bash
curl -sX POST "$KIT/api/v1/daemon/quick-start/$QID/stop"
```
### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (live-verified — kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. The kit appends ` <flag> <port>` to your command at start-time.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
ID=$(curl -sX POST "$KIT/api/v1/daemon/programs/add" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"examples-daemon-fanout",
    "command":"python3 -m http.server",
    "user":"user","enabled":true,
    "port_range":{"start":18800,"end":18802},
    "port_param":"--port","lazy_load":true
  }' | jq -r .program.id)
```
**Step 2 — start one specific port and read fleet-wide status.** `programs.list?port=18800&include_status=true` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block (live-verified).

```bash
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"port":18800}'
curl -sf "$KIT/api/v1/daemon/programs?port=18800&include_status=true" \
  | jq '.programs[].status'
```
The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`GET /api/v1/daemon/programs/{id}/logs` with type / lines)

**Goal:** investigate why a worker keeps restarting. `GET /api/v1/daemon/programs/{id}/logs` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log` (live-verified).

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/daemon/programs/$ID/logs?type=stderr&lines=200" | jq -r .logs
```
For a port-range program, pass `?port=18800` to read the per-instance log file.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** unless `NODE_ENV=development` (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: live-verified the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/edit/$ID" \
  -H 'Content-Type: application/json' \
  -d '{
    "webhooks":{
      "enabled":true,
      "urls":["https://hooks.example.com/daemon-events"],
      "events":["FATAL","BACKOFF"],
      "headers":{"X-Source":"hoody-daemon"},
      "timeout":10,"retry":2
    }
  }'
```
⚠ Webhook edits **deep-merge** — fields you omit from the `webhooks` block are NOT cleared. To turn off, send `{ webhooks: { enabled: false } }`. To rotate URLs, send the new full `urls` array (it replaces — array-set, not array-add). The **generated SDK type** (`ProgramInput`) marks `name`, `command`, and `user` as required on every `POST /api/v1/daemon/programs/edit/{id}` body (re-send them from a `GET /api/v1/daemon/programs/{id}` snapshot); the raw kit HTTP API does NOT require them on updates — it field-merges and accepts a partial `ProgramData`, so for surgical patches drop down to `fetch()`.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call. (This step is intentionally NOT live-tested — it would break the shared test container; pattern shown for reference.)

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
# 1) snapshot
curl -sf "$KIT/api/v1/daemon/programs" > /tmp/daemon-snapshot.json   # programs.list takes no `limit` query
# 2) reset
curl -sX POST "$KIT/api/v1/daemon/programs/reset"
# 3) restore the entries you want by replaying programs.add for each
```
### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `POST /api/v1/daemon/programs/edit/{id}` is a partial merge — fields you don't pass are preserved (live-verified — the response shows merged `environment` plus all original fields intact).

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/edit/$ID" \
  -H 'Content-Type: application/json' \
  -d '{"environment":{"LOG_LEVEL":"debug","BUILD":"examples"}}'
# Restart so the child inherits the new env
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/stop"
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"wait":false}'
```
⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:1,B:2}` and PATCH `{A:9}`, you end up with just `{A:9}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. `status.get?include_stats=true` returns the basic `{ id, status }` plus stats fields when the process is actually `running` (when in `backoff`/`stopped`, only `status` and a string `uptime` like `"too quickly (process log may have details)"` come back — live-verified).

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/daemon/status/$ID?include_stats=true" | jq .
```
⚠ `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

### 9. Stop one port instance OR every instance in a port-range fleet

**Goal:** kill just port 18800 vs. drain the whole fleet for a deploy.

**Single port** (other ports keep running):

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/stop" \
  -H 'Content-Type: application/json' -d '{"port":18800}'
```
**Whole fleet** (`all: true`):

```bash
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/stop" \
  -H 'Content-Type: application/json' -d '{"all":true}'
```
⚠ For a port-range program, `POST /api/v1/daemon/programs/{id}/start` REQUIRES `{ port }` (single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `POST /api/v1/daemon/programs/{id}/disable` flips `enabled: false` (process stays in the listing for forensics); `POST /api/v1/daemon/programs/{id}/enable` brings it back without touching `command`/`environment`.

```bash
KIT="https://${P}-${C}-daemon-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/disable"
# … run migration …
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/enable"
# Then explicitly start (enable does NOT auto-start the process, only flips the flag):
curl -sX POST "$KIT/api/v1/daemon/programs/$ID/start" \
  -H 'Content-Type: application/json' -d '{"wait":false}'
```
⚠ Trying `POST /api/v1/daemon/programs/{id}/start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `POST /api/v1/daemon/programs/{id}/enable` first.

## Reference

### `control` (4) — Program control endpoints - enable, disable, start, and stop programs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/daemon/programs/{id}/disable` | Disable a program |  |
| `POST /api/v1/daemon/programs/{id}/enable` | Enable a program |  |
| `POST /api/v1/daemon/programs/{id}/start` | Start a program or port instance | `body` |
| `POST /api/v1/daemon/programs/{id}/stop` | Stop a program or port instance | `body` |

**Body shapes:**

- `POST /api/v1/daemon/programs/{id}/start` body — `{ port: int, wait: bool=false, timeout: int=30, if_not_running: bool=false }` — Optional port parameter for port-range programs
  - `port` — Port number to start (required for port-range programs)
  - `wait` — Wait for program to reach RUNNING state before returning
  - `timeout` — Timeout in seconds when wait=true (default: 30)
  - `if_not_running` — Only start if not already running (idempotent mode). If true, checks if instance is running first. Returns already_running field in response. Use this for edge proxy automation.
- `POST /api/v1/daemon/programs/{id}/stop` body — `{ port: int, all: bool }` — Optional parameters for port-range programs
  - `port` — Specific port to stop
  - `all` — Stop all instances (for port-range programs)

### `health` (1) — Service health check endpoint - returns standardized 9-field health response for monitoring and readiness probes

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/daemon/health` | Service health check |  |

### `programs` (6) — Program management endpoints - create, read, update, and delete daemon programs

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/daemon/programs/add` | Add a new CUSTOM program | `body*:daemon_ProgramInput` |
| `POST /api/v1/daemon/programs/edit/{id}` | Edit a program | `body*:daemon_ProgramInput` |
| `GET /api/v1/daemon/programs/{id}` | Get a specific program |  |
| `GET /api/v1/daemon/programs` | List all programs | `?hoody_kit` `?lazy_load` `?enabled` `?boot` `?port` `?port_from` `?port_to` `?include_status` `?include_stats` |
| `POST /api/v1/daemon/programs/remove/{id}` | Remove a program |  |
| `POST /api/v1/daemon/programs/reset` | Reset programs to default |  |

**Param notes:**

- `hoody_kit` — Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only.
- `lazy_load` — Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start.
- `enabled` — Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only.
- `boot` — Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs.
- `port` — Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042.
- `port_from` — Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start <= port_to AND program.end >= port_from.
- `port_to` — Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap.
- `include_status` — Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details.
- `include_stats` — Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs.

### `quickStart` (5) — Ephemeral program launcher - Create temporary programs that auto-cleanup when stopped or on reboot

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/daemon/quick-start/{id}/logs` | Get ephemeral program logs | `?type` `?lines` |
| `GET /api/v1/daemon/quick-start/{id}/status` | Get ephemeral program status |  |
| `POST /api/v1/daemon/quick-start` | Launch ephemeral CUSTOM program | `body*:daemon_EphemeralProgramInput` |
| `GET /api/v1/daemon/quick-start` | List all ephemeral programs |  |
| `POST /api/v1/daemon/quick-start/{id}/stop` | Stop ephemeral program |  |

**Param notes:**

- `type` — Log stream: stdout or stderr
- `lines` — Number of lines to return from end of file

### `status` (3) — Status monitoring endpoints - monitor runtime status of programs and instances

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/daemon/status/{id}` | Get specific program status | `?port` `?include_stats` |
| `GET /api/v1/daemon/status` | Get all program statuses |  |
| `GET /api/v1/daemon/programs/{id}/logs` | Get program logs | `?type` `?lines` `?port` |

**Param notes:**

- `port` — Filter to specific port instance (for port-range programs only)
- `include_stats` — Include resource stats (CPU, memory, process tree) for running programs. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown.
- `type` — Log stream: stdout or stderr
- `lines` — Number of lines to return from end of file
- `port` — Port number (required for port-range programs)


### Body schemas

- `daemon_ProgramInput` — `{ id: int, name*: string, description: string, command*: string, user*: string, enabled: bool=true, boot: bool=false, delay_seconds: int=0, autorestart: "true" | "false" | "unexpected"="unexpected", directory: string, priority: int=999, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, environment: { [key: string]: string }, hoody_kit: bool=false, port_range: { start*: int, end*: int }, port_param: string="--port", lazy_load: bool=false, display: string|null, terminal_id: int, terminal_shell: "bash" | "zsh" | "fish" | "sh" | "tmux"|null, terminal_interactive: bool|null, webhooks: { enabled: bool, urls: string[], events: string | string[], headers: object, timeout: int, retry: int }|null }`
- `daemon_EphemeralProgramInput` — `{ command*: string, user*: string, name: string, autorestart: "true" | "false" | "unexpected"="unexpected", directory: string, environment: { [key: string]: string }, priority: int=999, delay_seconds: int=0, stdout_logfile: string, stderr_logfile: string, logs_enabled: bool=true, log_max_bytes: int=5242880, log_backups: int=2, ttl: int, wait: bool=false, timeout: int=30, display: string|null, terminal_id: int, terminal_shell: "bash" | "zsh" | "fish" | "sh" | "tmux"|null, terminal_interactive: bool|null }`

---

<!-- ===== namespace: display ===== -->

# `display` — programmatic GUI desktops with screenshots, input, and windows

## Purpose

Per-container HTML5 desktop (X11 via proxy): screenshots, input, windows, clipboard.

## When to use

- Click/type/drag/scroll at coords; screenshots/thumbnails for vision; X11 window ops; clipboard r/w.
- **Multiple GUI apps → one display (one `terminal_id`) per app (almost always the right call).** A single X display *can* host many windows, but giving each app its own display (`display: ":N"` paired to a distinct `terminal_id`) gives each its own `display-<N>` kit URL — a dedicated full-surface stream you can screenshot, embed / iframe, and route input to **independently, per window** — with no window-search / focus juggling on a shared display. Pin matching ids (`terminal_id=1`↔`:1`, `terminal_id=2`↔`:2`, …) so the routing stays one-to-one. Reuse a single display only when you deliberately want the apps composited together (e.g. a full desktop — see the `desktop-<N>` alias).

## When NOT to use

Not for: shell → `terminal`/`exec`, files → `files`, headless web → `browser`, toasts → `notifications`.

## Prerequisites

- Active Xpra/X11 (`DISPLAY=:N`). To render X apps from a terminal into display `:N`, create the terminal session with an explicit string `display: "N"` (or CLI `--display N`); `terminal_id=N` alone does NOT set `DISPLAY`.
- Display ID resolution: `*-display-N.*` host (e.g. `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` for display `1`) or query override `?displayId=N`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `GET /api/v1/display/screenshot` (`base64=true` for vision).
2. `POST /api/v1/display/input/click-at` / `POST /api/v1/display/input/type-at`.
3. `GET /api/v1/display/screenshot/info` — cheap timestamp check.
4. Re-capture only when timestamp advanced.

### 2. Find and focus a window

1. `GET /api/v1/display/windows` (`onlyVisible=true`).
2. `POST /api/v1/display/window/search` — name/class/classname.
3. `POST /api/v1/display/window/focus` / `POST /api/v1/display/window/raise`.
4. `GET /api/v1/display/window/{windowId}/geometry` — coords.
5. `GET /api/v1/display/window/active` — confirm.

### 3. Drag / select

1. `POST /api/v1/display/mouse/move` — optional pre-position.
2. `POST /api/v1/display/input/drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `POST /api/v1/display/input/select` — click + shift-click.
4. `POST /api/v1/display/input/reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `POST /api/v1/display/clipboard` — `text`, optional `selection`.
2. `POST /api/v1/display/keyboard/key` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `GET /api/v1/display/clipboard` — read back after GUI copy.

### 5. Batch input replay

1. `POST /api/v1/display/input/batch` — POST ordered actions.
2. `POST /api/v1/display/input/wait` — interleave waits.
3. `GET /api/v1/display/screenshot` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (regex `^\d+$` at displayContext.ts:22, range check at :24); invalid silently falls through to host-derived id by :31.
- All endpoints except `health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; `base64=true` for JSON.
- `getByTimestamp` needs numeric `timestamp`, not `timestamp_human`.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Window IDs accept decimal or hex (`0x...`); returns decimal.
- `GET /api/v1/display/` returns HTML, browser-only.
- SDK-only quirk: the screenshot-list accessor hangs off the namespace root (`GET /api/v1/display/screenshots`), not the `screenshots` service — there is no `screenshots.list`.
- `GET /api/v1/display/info` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the Xvfb canvas dimensions (those live on `GET /api/v1/display/input/display-geometry`, see `inputRoutes.ts:499`).
- `POST /api/v1/display/input/reset` clears stuck modifiers/buttons.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — X server for displayId unreachable; thrown by `inputService.parseError` (re-emitted by the input route handler) and also by the clipboard/window route handlers.
- `404` on `getByTimestamp` — no match. Refresh by calling `GET /api/v1/display/screenshot/info` (`/api/v1/display/screenshot/info`) — that endpoint **takes a fresh screenshot** and returns its metadata, not just a timestamp lookup; then retry `getByTimestamp` with the new ts. (`/screenshot/last/info`/`GET /api/v1/display/screenshot/last/info` only returns metadata for the *latest* screenshot — not a usable replacement for a missed timestamp.)

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Every step in every example was live-tested against a real `display-1` kit driving an Xpra/X11 session inside a Hoody container. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first, and pick a `DID` (the active display id, e.g. `1`). The `display-1` in the kit URL is the kit instance, NOT the display id — `?displayId=N` (or `--display-id N`) selects the X server.

### 1. See-then-act loop — capture, click, re-capture, diff

**Goal:** snapshot the screen, click a coordinate, snapshot again, and use cheap metadata (`timestamp`) to detect that the second capture is fresh — typical inner loop for vision-driven agents.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
TS_BEFORE=$(curl -sf "$KIT/api/v1/display/screenshot/info?displayId=1" | jq -r .timestamp)
B64=$(curl -sf "$KIT/api/v1/display/screenshot?displayId=1&base64=true" | jq -r .image.data)
echo "before=$TS_BEFORE  bytes=${#B64}"
```
**Step 2 — click at `(75, 50)`.** `POST /api/v1/display/input/click-at` moves AND clicks in one call; default `button=1` (left).

```bash
curl -sX POST "$KIT/api/v1/display/input/click-at?displayId=1" \
  -H 'Content-Type: application/json' -d '{"x":75,"y":50,"button":1}'
```
**Step 3 — cheap freshness check, then full re-capture only if the timestamp advanced.** `screenshot/info` returns metadata without the PNG bytes — much cheaper than a full capture for polling.

```bash
TS_AFTER=$(curl -sf "$KIT/api/v1/display/screenshot/info?displayId=1" | jq -r .timestamp)
[ "$TS_AFTER" != "$TS_BEFORE" ] && curl -sf "$KIT/api/v1/display/screenshot?displayId=1&base64=true" | jq -r .image.data > /tmp/after.b64
```
### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `POST /api/v1/display/window/search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns just an array of `windowId` integers.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/api/v1/display/window/search?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"pattern":"xeyes","name":true,"class":true,"classname":true}' \
  | jq -r '.windows[0]')
echo "wid=$WID"
```
**Step 2 — focus + confirm.** `GET /api/v1/display/window/active` returns the currently focused id; compare with what you focused.

```bash
curl -sX POST "$KIT/api/v1/display/window/focus?displayId=1" \
  -H 'Content-Type: application/json' -d "{\"windowId\":$WID}"
ACTIVE=$(curl -sf "$KIT/api/v1/display/window/active?displayId=1" | jq -r .windowId)
[ "$ACTIVE" = "$WID" ] && echo "focused OK"
```
### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
# 1. click to set keyboard focus on the field
curl -sX POST "$KIT/api/v1/display/input/click-at?displayId=1" \
  -H 'Content-Type: application/json' -d '{"x":120,"y":80}'
# 2. type. `delay` is inter-keystroke ms (0..1000)
curl -sX POST "$KIT/api/v1/display/keyboard/type?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"text":"hello world","delay":20}'
```
`POST /api/v1/display/input/type-at` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`.

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/drag?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"startX":50,"startY":50,"endX":200,"endY":150,"steps":20,"button":1}'
```
If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `POST /api/v1/display/input/reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. ⚠ See quirk: clipboard ops can fail with `CLIPBOARD_FAILED` / "no HOME directory" if the X session was launched without a writable `$HOME` for the kit user; verify by reading back the clipboard after the write.

**Step 1 — `POST /api/v1/display/clipboard` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/clipboard?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{"text":"pasted via hoody","selection":"clipboard"}'
# Verify
curl -sf "$KIT/api/v1/display/clipboard?displayId=1&selection=clipboard" | jq -r .text
```
**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

```bash
curl -sX POST "$KIT/api/v1/display/keyboard/key?displayId=1" \
  -H 'Content-Type: application/json' -d '{"keys":["ctrl+v"]}'
```
### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/window/$WID/properties?displayId=1" | jq '.properties'
# → { wmClass:["xeyes","XEyes"], wmName:"xeyes", wmRole:null, pid:null, wmState:[], wmType:[], transientFor:null }
curl -sf "$KIT/api/v1/display/window/$WID/geometry?displayId=1" | jq '{x,y,width,height}'
```
`windowId` accepts decimal or hex (`0x...`); the response always normalises to decimal.

### 7. List visible windows with `onlyVisible` filter

**Goal:** enumerate everything mapped on screen (not iconified / withdrawn), pick the one with a name matching `xeyes`, no regex.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/windows?displayId=1&onlyVisible=true" \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```
Each item carries `windowId`, `name`, `class` (the WM_CLASS pair as 2 strings), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) atomically. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The response lists every step with success/failure indexed back to the request order.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/batch?displayId=1" \
  -H 'Content-Type: application/json' \
  -d '{
    "actions":[
      {"action":"mouse/move",   "params":{"x":120,"y":80}},
      {"action":"input/wait",   "params":{"ms":150}},
      {"action":"mouse/click",  "params":{"button":1}},
      {"action":"keyboard/type","params":{"text":"replayed","delay":15}}
    ]
  }'
```
`POST /api/v1/display/input/wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `POST /api/v1/display/input/batch`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `GET /api/v1/display/input/display-geometry` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/display/info?displayId=1" \
  | jq '{display, pid, session_name, user, start_time, connected_clients, latency, windowCount: (.windows|length), screenshotCount: (.screenshots|length)}'
# Just the geometry (cheaper):
curl -sf "$KIT/api/v1/display/input/display-geometry?displayId=1" | jq '{width,height,screen}'
# → e.g. { width: 8192, height: 4096, screen: 0 }  (Xpra fakescreen — much larger than any "monitor")
```
Note: the geometry returned is the underlying Xvfb canvas (often `8192x4096` for Hoody Xpra sessions), not a physical monitor size. Click coordinates are in this canvas space.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `POST /api/v1/display/keyboard/key-down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `POST /api/v1/display/input/reset` releases everything in one call.

```bash
KIT="https://${P}-${C}-display-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/display/input/reset?displayId=1" \
  -H 'Content-Type: application/json' -d '{}'
# → {"success":true,"action":"reset","details":{"message":"All modifier keys and mouse buttons released"}}
```
Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

### `display` (7) — Display information and management

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/` | Access the HTML5 Display client interface | `?displayId` `?decorations` `?toolbar` `?menu` `?maximize_new_windows` `?readonly` `?dark_mode` `?node` `?project_id` `?container_id` `?url_display_id` `?ssl` `?webtransport` `?path` `?action` `?display` `?encoding` `?offscreen` `?bandwidth_limit` `?override_width` `?override_height` `?vrefresh` `?suspend_inactive_tab` `?sound` `?audio_codec` `?keyboard` `?keyboard_layout` `?swap_keys` `?clipboard` `?clipboard_preferred_format` `?clipboard_poll` `?printing` `?file_transfer` `?video` `?mediasource_video` `?open_url` `?notification_server_url` `?web_notifications` `?display_notifications` `?notification_connection_type` `?sharing` `?steal` `?reconnect` `?floating_menu` `?clock` `?scroll_reverse_y` `?scroll_reverse_x` `?title_show_hoody` `?title_show_display_id` `?app` `?remote_logging` `?insecure` `?debug_main` `?debug_keyboard` `?debug_geometry` `?debug_mouse` `?debug_clipboard` `?debug_draw` `?debug_audio` `?debug_network` `?debug_file` |
| `GET /api/v1/display/clipboard` | Read clipboard text | `?displayId` `?selection` |
| `GET /api/v1/display/info` | Get display information and screenshots | `?displayId` |
| `GET /api/v1/display/window/{windowId}/properties` | Get extended properties for a window | `?displayId` |
| `GET /api/v1/display/screenshots` | List all available screenshots | `?displayId` |
| `GET /api/v1/display/windows` | List windows on the current display | `?displayId` `?onlyVisible` |
| `POST /api/v1/display/clipboard` | Write clipboard text | `?displayId` `body*:display_ClipboardWriteBody` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `decorations` — Show window decorations (title bar with close/minimize/maximize buttons). Set to false for headless/kiosk mode.
- `toolbar` — Show entire toolbar/menu area (menu trigger + menu). Set to false to hide all menu UI elements. Takes precedence over the menu parameter.
- `menu` — Show Hoody menu trigger icon. Set to false to hide menu completely. Note: toolbar parameter takes precedence over this.
- `maximize_new_windows` — Open new top-level application windows maximized instead of centered at the default size (max 1024x1024). Only applies to windows that do not request their own position, and skips override-redirect windows, dialogs, other non-NORMAL window types, and windows the app itself marks undecorated via metadata (which would have no title bar to un-maximize from). Windows can still be un-maximized from their title bar. Combining with the global decorations=false parameter is honoured as explicit kiosk intent: windows open maximized without a title bar.
- `readonly` — Enable read-only/view-only mode. Blocks all keyboard and mouse input from the client. Perfect for dashboards, monitoring, or demo scenarios. Works independently or combines with server readonly setting.
- `dark_mode` — Enable dark mode theme
- `node` — Hoody node identifier (e.g., example-1, example-2)
- `project_id` — Hoody project ID
- `container_id` — Hoody container ID
- `url_display_id` — Display ID for URL construction
- `ssl` — Use SSL/TLS for WebSocket connection
- `webtransport` — Use WebTransport (HTTP3) instead of WebSocket
- `path` — Connection path for the display server
- `action` — Connection action type. - `connect` - Connect to existing session - `start` - Start new session - `shadow` - Shadow existing display
- `display` — Display number to connect to
- `encoding` — Video encoding type. Use auto for best automatic selection.
- `offscreen` — Use offscreen canvas for rendering
- `bandwidth_limit` — Bandwidth limit in bits per second (0 = unlimited)
- `override_width` — Override virtual desktop width (auto or numeric value)
- `override_height` — Override virtual desktop height (auto or numeric value 480-4320)
- `vrefresh` — Vertical refresh rate in Hz. Use -1 for auto-detect. Minimum 30 when explicitly set.
- `suspend_inactive_tab` — Suspend client updates when browser tab is inactive. Enables power saving by calling client.suspend() on tab hide and client.resume() on tab show. Recommended to keep enabled for better performance.
- `sound` — Enable audio forwarding
- `audio_codec` — Preferred audio codec
- `keyboard` — Show on-screen virtual keyboard
- `keyboard_layout` — Keyboard layout (us, gb, fr, de, etc.)
- `swap_keys` — Swap Cmd/Ctrl keys (useful for macOS)
- `clipboard` — Enable clipboard sharing
- `clipboard_preferred_format` — Preferred clipboard format
- `clipboard_poll` — Enable clipboard polling (browser-dependent default)
- `printing` — Enable printing support
- `file_transfer` — Enable file transfer support
- `video` — Enable video encoding support
- `mediasource_video` — Enable MediaSource API for video
- `open_url` — Allow opening URLs from the remote session in the local browser
- `notification_server_url` — External notification server URL for real-time notification integration.  **URL Format:** `https://{project}-{container}-n-{display}.{node}.containers.hoody.com/notification-client.js`  **Auto-detection:** If not provided, the client will attempt to auto-detect from the current hostname pattern. The client transforms the display URL pattern by replacing 'display' with 'n'.  **Examples:** - Manual: `?notification_server_url=https://my-project-container-n-6.node.containers.hoody.com/notification-client.js` - Auto-detected from: `https://my-project-container-display-6.node.containers.hoody.com`  **Integration:** The notification server (port 3999) provides: - Historical notification retrieval - Real-time WebSocket notification updates - Notification icons serving - Desktop notification triggering  See external notification server OpenAPI spec for complete API documentation.
- `web_notifications` — Enable browser web notifications (native OS notifications)
- `display_notifications` — Show notifications within display UI
- `notification_connection_type` — Notification server connection type. - websocket: Real-time updates via WebSocket (recommended) - polling: Periodic HTTP polling (fallback)
- `sharing` — Allow session sharing
- `steal` — Steal existing sessions
- `reconnect` — Auto-reconnect on connection loss
- `floating_menu` — Show floating menu
- `clock` — Show server clock
- `scroll_reverse_y` — Reverse vertical scrolling direction (auto, true, false)
- `scroll_reverse_x` — Reverse horizontal scrolling direction
- `title_show_hoody` — Show "Hoody" in browser title
- `title_show_display_id` — Show display ID in browser title
- `app` — Target application to launch or focus. Can be an application name, a REGEX pattern, or a window ID.
- `remote_logging` — Enable remote logging to the display server
- `insecure` — Allow insecure authentication (not recommended for production)
- `debug_main` — Enable main debug logging
- `debug_keyboard` — Enable keyboard debug logging
- `debug_geometry` — Enable geometry debug logging
- `debug_mouse` — Enable mouse debug logging
- `debug_clipboard` — Enable clipboard debug logging
- `debug_draw` — Enable draw debug logging
- `debug_audio` — Enable audio debug logging
- `debug_network` — Enable network debug logging
- `debug_file` — Enable file transfer debug logging
- `selection` — Clipboard buffer selection
- `onlyVisible` — If true, only include visible windows

### `health` (1) — Server health and status endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/health` | Service health check |  |

### `input` (31) — Mouse, keyboard, and window control operations via xdotool

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/display/input/act` | Execute one action with optional screenshot | `?displayId` `body*:display_ActBody` |
| `POST /api/v1/display/input/batch` | Execute a sequence of actions | `?displayId` `body*:display_BatchBody` |
| `POST /api/v1/display/input/click-at` | Move cursor and click | `?displayId` `body*:display_ClickAtBody` |
| `POST /api/v1/display/input/drag` | Drag from one position to another | `?displayId` `body*:display_DragBody` |
| `GET /api/v1/display/input/display-geometry` | Get display dimensions | `?displayId` |
| `POST /api/v1/display/keyboard/key` | Press key combinations | `?displayId` `body*:display_KeyboardKeyBody` |
| `POST /api/v1/display/keyboard/key-down` | Hold a key down | `?displayId` `body*:display_KeyboardKeyDownBody` |
| `POST /api/v1/display/keyboard/key-up` | Release a held key | `?displayId` `body*` |
| `POST /api/v1/display/keyboard/type` | Type a string of text | `?displayId` `body*:display_KeyboardTypeBody` |
| `POST /api/v1/display/mouse/click` | Click a mouse button | `?displayId` `body:display_MouseClickBody` |
| `POST /api/v1/display/mouse/double-click` | Double-click a mouse button | `?displayId` `body` |
| `POST /api/v1/display/mouse/down` | Press and hold a mouse button | `?displayId` `body` |
| `GET /api/v1/display/mouse/location` | Get cursor position | `?displayId` |
| `POST /api/v1/display/mouse/move` | Move cursor to absolute position | `?displayId` `body*:display_MouseMoveBody` |
| `POST /api/v1/display/mouse/move-relative` | Move cursor by offset | `?displayId` `body*` |
| `POST /api/v1/display/mouse/scroll` | Scroll in a direction | `?displayId` `body*:display_MouseScrollBody` |
| `POST /api/v1/display/mouse/up` | Release a mouse button | `?displayId` `body` |
| `POST /api/v1/display/input/reset` | Emergency release all inputs | `?displayId` |
| `POST /api/v1/display/input/select` | Select a range via click + shift-click | `?displayId` `body*:display_SelectBody` |
| `POST /api/v1/display/input/type-at` | Move, click, and type in one operation | `?displayId` `body*:display_TypeAtBody` |
| `POST /api/v1/display/input/wait` | Wait for a duration with optional screenshot | `?displayId` `body*:display_WaitBody` |
| `GET /api/v1/display/window/active` | Get the active window ID | `?displayId` |
| `POST /api/v1/display/window/close` | Close a window | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/focus` | Focus/activate a window | `?displayId` `body*:display_WindowIdBody` |
| `GET /api/v1/display/window/{windowId}/geometry` | Get window position and size | `?displayId` |
| `POST /api/v1/display/window/minimize` | Minimize a window | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/move` | Move a window | `?displayId` `body*:display_WindowMoveBody` |
| `GET /api/v1/display/window/{windowId}/name` | Get window title | `?displayId` |
| `POST /api/v1/display/window/raise` | Raise a window to the top | `?displayId` `body*:display_WindowIdBody` |
| `POST /api/v1/display/window/resize` | Resize a window | `?displayId` `body*:display_WindowResizeBody` |
| `POST /api/v1/display/window/search` | Search for windows by pattern | `?displayId` `body*:display_WindowSearchBody` |

**Param notes:**

- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999

**Body shapes:**

- `POST /api/v1/display/keyboard/key-up` body — `{ key*: string, window: int | string }`
- `POST /api/v1/display/mouse/double-click` body — `{ button: int=1, window: int | string }`
- `POST /api/v1/display/mouse/down` body — `{ button: int=1, window: int | string, holdMs: int }`
  - `holdMs` — Auto-release after this many milliseconds
- `POST /api/v1/display/mouse/move-relative` body — `{ x*: int, y*: int, sync: bool }`
- `POST /api/v1/display/mouse/up` body — `{ button: int=1, window: int | string }`

### `screenshots` (5) — Screenshot capture and retrieval operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/screenshot` | Capture a new screenshot | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/info` | Capture screenshot and return metadata only | `?displayId` |
| `GET /api/v1/display/screenshot/{timestamp}` | Retrieve a specific screenshot by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/last` | Retrieve the most recent screenshot | `?base64` `?displayId` |
| `GET /api/v1/display/screenshot/last/info` | Get metadata for the most recent screenshot | `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default)
- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `timestamp` — Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security.

### `thumbnails` (3) — Thumbnail image operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/display/thumbnail` | Capture a new screenshot thumbnail | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/{timestamp}` | Retrieve a specific thumbnail by timestamp | `?base64` `?displayId` |
| `GET /api/v1/display/thumbnail/last` | Retrieve the most recent thumbnail | `?base64` `?displayId` |

**Param notes:**

- `base64` — Return base64-encoded JSON response instead of binary image. Useful for AI agents and systems that can't handle binary data.  Accepted values: - `true`, `1`, `` (empty) - Return base64 JSON - `false`, `0` - Return binary (default)
- `displayId` — Display ID to use (overrides the `*-display-N.*` hostname pattern). Valid range: 1-999999
- `timestamp` — Unix timestamp of the screenshot. Use the `timestamp` field returned by screenshot metadata/list endpoints. Do not use `timestamp_human` for path queries. Must be numeric only for security.


### Body schemas

- `display_ClipboardWriteBody` — `{ text*: string, selection: "clipboard" | "primary" | "secondary"="clipboard" }`
- `display_MouseClickBody` — `{ button: int=1, repeat: int=1, delay: int, window: int | string }`
- `display_MouseMoveBody` — `{ x*: int, y*: int, window: int | string, screen: int, sync: bool }`
- `display_MouseScrollBody` — `{ direction*: "up" | "down" | "left" | "right", clicks: int=5 }`
- `display_KeyboardTypeBody` — `{ text*: string, window: int | string, delay: int, clearModifiers: bool }`
- `display_KeyboardKeyBody` — `{ keys*: string[], window: int | string, delay: int, clearModifiers: bool }`
- `display_KeyboardKeyDownBody` — `{ key*: string, window: int | string, holdMs: int }`
- `display_WindowIdBody` — `{ windowId*: int | string }`
- `display_WindowMoveBody` — `{ windowId*: int | string, x*: int, y*: int, sync: bool, relative: bool }`
- `display_WindowResizeBody` — `{ windowId*: int | string, width*: int, height*: int, sync: bool, useHints: bool }`
- `display_WindowSearchBody` — `{ pattern*: string, name: bool, class: bool, classname: bool, onlyVisible: bool }`
- `display_ClickAtBody` — `{ x*: int, y*: int, button: int=1 }`
- `display_TypeAtBody` — `{ x*: int, y*: int, text*: string, delay: int }`
- `display_DragBody` — `{ startX*: int, startY*: int, endX*: int, endY*: int, button: int=1, steps: int }`
- `display_SelectBody` — `{ x*: int, y*: int, endX*: int, endY*: int }`
- `display_ActBody` — `{ action*: string, params: object, screenshot: bool=true, screenshotDelay: int=100, screenshotRegion: string }`
- `display_WaitBody` — `{ ms*: int, screenshot: bool=false }`
- `display_BatchBody` — `{ actions*: { action*: string, params: object }[] }`

---

<!-- ===== namespace: exec ===== -->

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To make a script **public**: create a `POST /api/v1/proxy/aliases` — get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` leak in the URL. Layer Password / Token / JWT / IP gates via `proxyPermissionsContainer.*` exactly like any other kit URL.

**Trust model — read carefully.** Scripts run inside the container with full container privileges. They are NOT a sandbox for untrusted user code. Anyone who can invoke a script can do everything the script can do (read files, hit other kits, spawn processes). Use them for *your* APIs / cron logic / webhooks / ETL — don't expose them as an arbitrary code-execution surface to anonymous internet users without thinking through the gate stack first.

## When to use

- "Write me an API endpoint that does X" — default to a `hoody-exec` script before reaching for a Node app + framework.
- **"Build a workflow"** — multi-step pipelines (call agent A → validate with agent B → trigger action C, fan-out / fan-in, retry logic, conditional branches). One script = one orchestrator; each step is a function call inside the same Bun process, so no inter-service plumbing. State between requests via `bun:sqlite` (`Database`), the `sqlite` kit, the `files` kit, or in-process module-scope.
- Webhooks (GitHub / Stripe / your CI), ETL pipelines, batch transformers, AI agent tools.
- Wrap a bash one-liner or Python helper as an HTTP API with zero scaffolding.
- Schematize inputs / outputs via magic-comment annotations, auto-publish OpenAPI.
- Pin npm deps per script, stream logs/metrics, drop a `package.json` like any normal JS project.

## When NOT to use

- **Untrusted-input code execution** — it's not sandboxed. Use a fresh container (or a stricter runtime) per untrusted caller.
- Long-lived processes / supervisors → `daemon` (exec is request/response).
- Schedules outliving the kit → `cron` (`exec.schedules.*` is in-process and dies with the kit).
- File I/O outside the scripts dir → `files`. Interactive shells → `terminal`. Container lifecycle → `daemon`. Headless web → `browser`.

## Prerequisites

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `POST /api/v1/exec/scripts/write`.
- **`require('hoody-sdk')` works with no install step** — the runtime auto-installs any `require()`d npm package on first execution (it is not pre-injected or bundled). Import from `'hoody-sdk'` (NOT `'hoody-sdk'`). The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the Hoody Proxy — no localhost bypass — so all the usual capability gates / request hooks / proxy logs apply (see § No local bypass in `SKILL-HTTP.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out: `Bun.$\`hoody projects list\`` from the same script works end-to-end.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Write, validate, invoke

1. `POST /api/v1/exec/scripts/write` — `path`, `content`, `createDirs:true`, `validate:true` (default); 400 + `validation` on fail.
2. `GET /api/v1/exec/scripts/read` — confirm bytes.
3. `POST {EXEC_BASE_URL}/<path-without-extension>` — body parsed, return auto-serialised, output streamed.
4. `GET /api/v1/exec/scripts/list` — verify.

### 2. Pin deps, iterate

1. `POST /api/v1/exec/dependencies/check` → `POST /api/v1/exec/dependencies/install` → `POST /api/v1/exec/package/pin`.
2. `POST /api/v1/exec/validate/script` + `POST /api/v1/exec/validate/magic-comments` (`// @description`, `// @cors`, `// @timeout`).
3. `POST /api/v1/exec/scripts/write` (auto-validates unless `validate:false`).
4. `POST /api/v1/exec/cache/clear` — drop compiled cache; ephemeral runtime, no state across recompiles.

### 3. Debug + OpenAPI

1. `GET /api/v1/exec/logs/list` / `POST /api/v1/exec/logs/search` / `POST /api/v1/exec/logs/read` (streamed `--lines`/`--tail`).
2. `GET /api/v1/exec/monitor/active-requests` / `GET /api/v1/exec/monitor/stats` / `POST /api/v1/exec/monitor/script-performance`.
3. `GET /api/v1/exec/user-openapi/list` → `POST /api/v1/exec/user-openapi/generate` → `POST /api/v1/exec/user-openapi/merge` → `GET /api/v1/exec/user-openapi/spec` → `POST /api/v1/exec/user-openapi/validate`.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. The stored file is ALWAYS kept verbatim; the pattern-normaliser rewrites the code at load time on every request, independent of `validate`.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `DELETE /api/v1/exec/scripts/delete` needs literal `confirm=true`.
- `POST /api/v1/exec/scripts/write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `GET /api/v1/containers/{id}/proxy/services` returning `[]` is normal.
- `POST /api/v1/exec/scripts/write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every script gets pre-injected globals: `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`, default model **`hoody-ai/hoody-free`**). **No `require()`, no base URL, and no API key** — the key auto-defaults to `container-<hash>` and is a usage-tracking tag, NOT auth, so you specify nothing. **The default model is the free tier: it costs nothing and needs no wallet credit, so a script with no `// @ai-model` line runs on a brand-new account.** Overriding it with a catalog model (`GET https://api.hoody.com/api/v1/ai/models`) bills the wallet and is **refused outright** while `ai_limit` is `0.00` — check `GET /api/v1/wallet/balances/ai` before you name one. Override per-script with magic comments (`// @ai-model minimax/minimax-m3` — paid, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — recheck `safePath`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`POST /api/v1/exec/system/restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Every step in every example was live-tested against a real `exec-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST {KIT}/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when syntax + TS-transpile + dependency-check + magic-comment parse all pass.

```bash
KIT="https://${P}-${C}-exec-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "echo.js",
    "content": "module.exports = (req, res) => res.json({ ok: true, body: req.body });\n"
  }'
```
**Step 2 — invoke `POST /echo`** (bare path, NOT `/api/v1/exec/echo`). Body is auto-parsed; the return value of `res.json(...)` is the wire body.

```bash
curl -sX POST "$KIT/echo" \
  -H 'Content-Type: application/json' \
  -d '{"hello":"world"}'
# → {"ok":true,"body":{"hello":"world"}}
```
**Step 3 — read it back.** `GET /api/v1/exec/scripts/read` returns the literal content + parsed `magicComments` + metadata.

```bash
curl -sf "$KIT/api/v1/exec/scripts/read?path=echo.js" | jq .content
```
### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `POST /api/v1/curl/request` / SDK calls.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "workflow.js",
  "content": "module.exports = async (req, res) => {\n  const callA = async () => ({ score: 0.91, label: 'spam' });\n  const checkB = async (a) => ({ verdict: a.score > 0.8 ? 'block' : 'allow' });\n  const actC  = async (v) => ({ executed: v === 'block' ? 'quarantined' : 'delivered' });\n  const a = await callA();\n  const b = await checkB(a);\n  const c = await actC(b.verdict);\n  res.json({ a, b, c });\n};\n"
}
JSON
curl -sX POST "$KIT/workflow" -H 'Content-Type: application/json' -d '{}'
# → {"a":{"score":0.91,"label":"spam"},"b":{"verdict":"block"},"c":{"executed":"quarantined"}}
```
### 3. Webhook receiver with HMAC signature verification

**Goal:** GitHub-style `X-Hub-Signature-256` verification using `crypto.timingSafeEqual`. Reject 401 on bad sig.

**Step 1 — write the verifier.** No `npm install` needed — `crypto` is a runtime built-in.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "webhook.js",
  "content": "const crypto = require('crypto');\nconst SECRET = process.env.WEBHOOK_SECRET || 'shhh-test';\nmodule.exports = async (req, res) => {\n  const sig = req.headers['x-hub-signature-256'] || '';\n  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});\n  const expect = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');\n  let ok = false;\n  try { ok = sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch {}\n  if (!ok) return res.status(401).json({ error: 'bad sig' });\n  res.json({ accepted: true, payload: req.body });\n};\n"
}
JSON
```
**Step 2 — fire a signed request.** The Bun `req.body` is an *object* if Content-Type was JSON, so re-serialise before HMAC'ing on both sides for byte-stable signing.

```bash
BODY='{"event":"push","ref":"main"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'shhh-test' | awk '{print $2}')"
curl -sX POST "$KIT/webhook" \
  -H 'Content-Type: application/json' \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
# → {"accepted":true,"payload":{"event":"push","ref":"main"}}
```
### 4. Pin npm deps — `POST /api/v1/exec/dependencies/check` → `POST /api/v1/exec/dependencies/install` → `POST /api/v1/exec/package/pin`

**Goal:** add `lodash` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```bash
curl -sX POST "$KIT/api/v1/exec/dependencies/check" \
  -H 'Content-Type: application/json' \
  -d '{"code":"const _ = require(\"lodash\");"}'
# → {"missing":["lodash"], ...}
```
**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"lodash@4.17.21"`).

```bash
curl -sX POST "$KIT/api/v1/exec/dependencies/install" \
  -H 'Content-Type: application/json' \
  -d '{"modules":["lodash"]}'
```
**Step 3 — pin to exact versions** (drops the leading `^`/`~`).

```bash
curl -sX POST "$KIT/api/v1/exec/package/pin" \
  -H 'Content-Type: application/json' \
  -d '{"packages":["lodash"]}'
# → {"pinned":["lodash: ^4.17.21 → 4.17.21"], ...}
```
### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```bash
CODE='// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });'

# Full validation: syntax + TS transpile + deps + magic comments
curl -sX POST "$KIT/api/v1/exec/validate/script" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$CODE" '{code:$c}')"

# Just the magic-comment parser
curl -sX POST "$KIT/api/v1/exec/validate/magic-comments" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$CODE" '{code:$c}')"
```
If `valid:true`, ship it via `POST /api/v1/exec/scripts/write` (default `validate:true` will re-run the same checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies,magicComments}` slots tell you exactly which checker rejected it.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry (and inferred request/response shapes from any handler-attached schema) in a single OpenAPI 3.0 document the proxy can serve.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```bash
curl -sf "$KIT/api/v1/exec/user-openapi/list" | jq '.data.scripts[] | {path, routePath, hasSchema}'
```
**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```bash
curl -sf "$KIT/api/v1/exec/user-openapi/spec?format=json" > /tmp/user-scripts.openapi.json
```
**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `POST /api/v1/exec/user-openapi/merge`. `POST /api/v1/exec/user-openapi/generate` rebuilds the on-disk spec from current scripts; `POST /api/v1/exec/user-openapi/validate` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `GET /api/v1/exec/logs/list` returns kit-wide log files; `POST /api/v1/exec/logs/read` slices a specific one.

```bash
# Discover available log files
curl -sf "$KIT/api/v1/exec/logs/list" | jq '.logs[] | {name, size, modified}'   # entries key on `name`, not `file`

# Read last 200 lines of a specific file
curl -sX POST "$KIT/api/v1/exec/logs/read" \
  -H 'Content-Type: application/json' \
  -d '{"file":"<name-from-logs/list>","lines":200,"tail":true}'

# Live-stream (SSE)
curl -N "$KIT/api/v1/exec/logs/stream?file=<name-from-logs/list>&follow=true"
```
Access logging is ON by default (`@log-level` defaults to `standard`); the magic comments opt *out* — `// @log-level none` disables it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `GET /api/v1/exec/monitor/stats` is a single snapshot; `GET /api/v1/exec/monitor/active-requests` lists in-flight HTTP/WS; `POST /api/v1/exec/monitor/script-performance` aggregates by script.

```bash
curl -sf "$KIT/api/v1/exec/monitor/stats" \
  | jq '{uptime, requests, websocket, cron, cache}'

curl -sf "$KIT/api/v1/exec/monitor/active-requests" | jq .

curl -sX POST "$KIT/api/v1/exec/monitor/script-performance" \
  -H 'Content-Type: application/json' -d '{}' | jq .
```
For Prometheus scraping, `GET /api/v1/exec/monitor/metrics` returns text/plain in standard exposition format.

### 9. Wrap a bash one-liner as an HTTP API with `Bun.$`

**Goal:** turn `df -h /` into a JSON HTTP endpoint with no scaffolding. `Bun.$` is in scope inside any script.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "disk-usage.js",
  "content": "module.exports = async (req, res) => {\n  const out = await Bun.$`df -h --output=source,size,used,avail,target /`.text();\n  res.json({ disk: out.trim().split('\\n').slice(1).map(l => l.split(/\\s+/)) });\n};\n"
}
JSON
curl -sf "$KIT/disk-usage"
# → {"disk":[["/dev/<device>","<size>","<used>","<avail>","/"]]}
```
Same pattern works for `python3 -c "..."`, `ffmpeg`, native binaries, anything on `$PATH`. The script handler runs inside the container as a normal process.

### 10. In-process schedule via `@schedule` directive

**Goal:** fire a script every 5 minutes WITHOUT the `cron` namespace. The schedule lives inside the kit; if the kit restarts, the schedule re-registers from disk on boot. (For schedules that must survive a kit-down — use the `cron` namespace instead.)

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log; `res.json` is what an HTTP `POST /api/v1/exec/schedules/trigger` call returns.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "tick.js",
  "content": "// @schedule */5 * * * *\n// @description Heartbeat — fires every 5 minutes\nmodule.exports = async (req, res) => {\n  console.log('[tick] fired at', new Date().toISOString());\n  res.json({ ok: true, ts: Date.now() });\n};\n"
}
JSON
```
**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, and the absolute on-disk `scriptPath` you'll need to trigger it.

```bash
curl -sf "$KIT/api/v1/exec/schedules/list" \
  | jq '.schedules[] | {scriptRel, expression, registeredAt}'
```
**Step 3 — fire it on demand.** `scriptPath` accepts either the absolute path returned in step 2 OR a path relative to the kit's scripts dir (the handler resolves relative paths against `scriptDir`). `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only.

```bash
curl -sX POST "$KIT/api/v1/exec/schedules/trigger" \
  -H 'Content-Type: application/json' \
  -d '{"scriptPath":"/hoody/storage/hoody-exec/scripts/default/1/tick.js","force":true}'
# → {"triggered":true,"runId":"...","status":"ok","durationMs":14}

curl -sf "$KIT/api/v1/exec/schedules/history?limit=5" | jq '.entries[]'
```
**Stop the schedule** by deleting the script (`scripts.delete?path=tick.js&confirm=true`) or by editing the file to remove the `// @schedule` directive and calling `POST /api/v1/exec/schedules/reload`.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. The runtime pre-injects `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key auto-defaults to `container-<hash>` (a usage-tracking tag, not auth). Default model is **`hoody-ai/hoody-free`**, the free tier — no wallet credit needed, so the script below works on a brand-new account with `ai_limit: "0.00"`. Override per-script with `// @ai-model <provider/model>` **only when you need a paid catalog model and have confirmed the wallet has AI credit**, and set a system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "path": "summarize.js",
  "content": "// @description One-line summary via built-in Hoody AI (no key/setup, free model by default)\nmodule.exports = async (req, res) => {\n  const text = metadata.query.q || 'Say hello in one sentence.';\n  const result = await ai.generate('Summarize in one line: ' + text);\n  res.json({ summary: result.text });\n};\n"
}
JSON
```
**Step 2 — invoke it** (bare path on the exec kit URL). No key anywhere in the call:

```
https://{P}-{C}-exec-1.{N}.containers.hoody.com/summarize?q=Hoody+is+a+remote-first+computing+platform
# → {"summary":"..."}
```

For structured output use `ai.object({ schema, prompt })` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`.

## Reference

### `cache` (1) — Cache

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/cache/clear` | Clear Cache | `body` |

**Body shapes:**

- `POST /api/v1/exec/cache/clear` body — `{ hostname: string, scriptPath: string, clearVm: bool=true, clearState: bool=false, clearAll: bool=false }`
  - `scriptPath` — DEPRECATED: scriptPath-based clear returns HTTP 400. VM cache is keyed by hostname. Use hostname or clearAll=true instead.
  - `clearVm` — Clear Vm
  - `clearState` — Clear State
  - `clearAll` — Clear All

### `dependencies` (3) — Dependencies

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/dependencies/check` | Check Dependencies | `body` |
| `POST /api/v1/exec/dependencies/install` | Install Dependencies | `body*` |
| `GET /api/v1/exec/dependencies/bundled` | List Bundled Dependencies |  |

**Body shapes:**

- `POST /api/v1/exec/dependencies/check` body — `{ code: string, modules: string }`
- `POST /api/v1/exec/dependencies/install` body — `{ modules*: string | string[], force: bool=false }`
  - `modules` — One npm module spec (e.g. `"lodash"`, `"axios@1.2.3"`) or an array of specs. Array form installs every module in sequence.
  - `force` — When true, reinstall modules that are already present instead of reporting them as `already-installed`.

### `execution` (1) — Script Execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}` | Execute Script (GET) |  |

**Param notes:**

- `path` — Script path (supports Next.js-style routing)

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/health` | Health Check |  |

### `ids` (1) — List

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/list` | List All Exec Ids |  |

### `logs` (5) — Logs

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/logs/clear` | Clear Logs | `?file` `?type` `?olderThanDays` `?confirm` |
| `GET /api/v1/exec/logs/list` | List Logs | `?type` `?limit` |
| `POST /api/v1/exec/logs/read` | Read Log | `body` |
| `POST /api/v1/exec/logs/search` | Search Logs | `body` |
| `GET /api/v1/exec/logs/stream` | Stream Logs | `?file*` `?follow` |

**Param notes:**

- `file` — File query parameter
- `type` — Type query parameter
- `olderThanDays` — OlderThanDays query parameter
- `confirm` — Confirm query parameter
- `limit` — Limit query parameter
- `follow` — Follow query parameter

**Body shapes:**

- `POST /api/v1/exec/logs/read` body — `{ file: string, executionId: string, lines: int=100, tail: bool=true, search: string }`
  - `executionId` — Execution Id
- `POST /api/v1/exec/logs/search` body — `{ query: string, regex: string, files: any[], limit: int=1000, caseSensitive: bool=false }`
  - `caseSensitive` — Case Sensitive

### `magic` (4) — Magic-comments

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/magic-comments/bulk-update` | Bulk Update Magic Comments | `body` |
| `GET /api/v1/exec/magic-comments/schema` | Get Magic Comments Schema |  |
| `GET /api/v1/exec/magic-comments/read` | Read Magic Comments | `?path*` |
| `PUT /api/v1/exec/magic-comments/update` | Update Magic Comments Handler | `body*` |

**Param notes:**

- `path` — Path query parameter

**Body shapes:**

- `POST /api/v1/exec/magic-comments/bulk-update` body — `{ directory: string, execId: string, comments: string, extension: string=".ts", recursive: bool=true, dry_run: bool=false }`
  - `execId` — Exec Id
  - `dry_run` — Dry_run
- `PUT /api/v1/exec/magic-comments/update` body — `{ path*: string, comments: string, dry_run: bool=false }`

### `monitor` (5) — Monitor

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/monitor/active-requests` | Get Active Requests |  |
| `POST /api/v1/exec/monitor/script-performance` | Get Script Performance | `body` |
| `GET /api/v1/exec/monitor/stats` | Get Stats |  |
| `GET /api/v1/exec/monitor/scripts` | List Monitor Scripts | `?limit` `?sort` |
| `GET /api/v1/exec/monitor/metrics` | Prometheus Export |  |

**Param notes:**

- `limit` — Max number of scripts to return. Clamped to [1, 500]. Default 100.
- `sort` — Sort key. `lastActivity` (default) sorts by most recent activity; other keys sort descending by the matching metric.

**Body shapes:**

- `POST /api/v1/exec/monitor/script-performance` body — `object` — Request payload

### `openapi` (6) — User-openapi

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/user-openapi/generate` | Generate User Open A P I | `body*` |
| `GET /api/v1/exec/user-openapi/list` | List User Scripts | `?directory` `?dir` `?subdomain` `?execId` |
| `POST /api/v1/exec/user-openapi/merge` | Merge Open A P I Specs | `body*` |
| `GET /api/v1/exec/user-openapi/spec` | Serve Generated Spec | `?dir` `?directory` `?format` `?subdomain` `?execId` |
| `GET /api/v1/exec/user-openapi/schema` | Serve Schema File | `?file` `?path` |
| `POST /api/v1/exec/user-openapi/validate` | Validate User Schema | `body*` |

**Param notes:**

- `directory` — Script directory to list (absolute or relative to scripts-dir). Default: `scripts`.
- `dir` — Alias of `directory`. Ignored when `directory` is provided.
- `subdomain` — Limit scan to scripts under this subdomain. Falls back to the Host header when omitted.
- `execId` — Limit scan to scripts under this execId. Falls back to the Host header when omitted.
- `dir` — Script directory to scan (absolute or relative to scripts-dir). Default: `scripts`.
- `directory` — Alias of `dir`. Ignored when `dir` is provided.
- `format` — Output format. `json` (default) or `yaml`.
- `file` — Absolute or scripts-dir-relative path to the target script (e.g. `default/api/users/[id].ts`). Either `file` or `path` must be provided.
- `path` — Alias of `file`. Either `file` or `path` must be provided.

**Body shapes:**

- `POST /api/v1/exec/user-openapi/generate` body — `object` — Request payload
- `POST /api/v1/exec/user-openapi/merge` body — `object` — Request payload
- `POST /api/v1/exec/user-openapi/validate` body — `object` — Request payload

### `package` (6) — Package

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/package/compare` | Compare Packages | `body*` |
| `POST /api/v1/exec/package/init` | Init Package Json | `body` |
| `POST /api/v1/exec/package/install` | Install Packages | `body` |
| `POST /api/v1/exec/package/pin` | Pin Versions | `body` |
| `GET /api/v1/exec/package/read` | Read Package Json |  |
| `POST /api/v1/exec/package/update` | Update Package Json | `body` |

**Body shapes:**

- `POST /api/v1/exec/package/compare` body — `object` — Request payload
- `POST /api/v1/exec/package/init` body — `{ name: string="hoody-exec-project", version: string="1.0.0", description: string="Hoody Exec project", force: bool=false }`
- `POST /api/v1/exec/package/install` body — `{ packages: any[], dev: bool=false, save: bool=true, force: bool=false }`
- `POST /api/v1/exec/package/pin` body — `{ packages: any[] }`
- `POST /api/v1/exec/package/update` body — `{ dependencies: string, scripts: string, metadata: object, remove: string }`

### `route` (3) — Route

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/route/discover` | Discover Routes | `body` |
| `POST /api/v1/exec/route/resolve` | Resolve Route | `body*` |
| `POST /api/v1/exec/route/test` | Test Route | `body*` |

**Body shapes:**

- `POST /api/v1/exec/route/discover` body — `{ baseDir: string="", includeMetadata: bool=false }`
  - `baseDir` — Base Dir
  - `includeMetadata` — Include Metadata
- `POST /api/v1/exec/route/resolve` body — `object` — Request payload
- `POST /api/v1/exec/route/test` body — `object` — Request payload

### `schedules` (4) — Schedules

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/schedules/list` | List Schedules |  |
| `POST /api/v1/exec/schedules/reload` | Reload Schedules | `body` |
| `GET /api/v1/exec/schedules/history` | Schedule History | `?scriptPath` `?since` `?limit` `?includeRotated` |
| `POST /api/v1/exec/schedules/trigger` | Trigger Schedule | `body*` |

**Param notes:**

- `scriptPath` — Filter entries to a specific script (relative to scripts-dir). Optional.
- `since` — ISO 8601 lower bound on `ts`. Optional.
- `limit` — Max entries to return. Default 100, hard max 1000.
- `includeRotated` — When true, also scan rotated fires.log.* files (slower).

**Body shapes:**

- `POST /api/v1/exec/schedules/reload` body — `{ dry_run: bool=false }` — Request payload
  - `dry_run` — When true, compute the diff against the filesystem but do not apply. Returns the same shape with {added, kept, removed} lists.
- `POST /api/v1/exec/schedules/trigger` body — `{ scriptPath*: string, force: bool=false }`
  - `scriptPath` — Script path (absolute or relative to scripts-dir) of a script with a valid @schedule directive.
  - `force` — When true, bypass the @token refusal. Use with care — this fires the script as cron (no token auth).

### `scripts` (6) — Scripts

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/scripts/delete` | Delete Script | `?path*` `?confirm` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/scripts/tree` | Get Script Tree | `?execId` `?exec_id` `?subdomain` `body` |
| `GET /api/v1/exec/scripts/list` | List Scripts | `?dir` `?filter` `?metadata` `?label` `?tags` `?mode` `?enabled` `?websocket` `?recursive` `?include_comments` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/scripts/move` | Move Script | `?execId` `?exec_id` `?subdomain` `body*` |
| `GET /api/v1/exec/scripts/read` | Read Script | `?path*` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/scripts/write` | Write Script | `?execId` `?exec_id` `?subdomain` `body*` |

**Param notes:**

- `path` — Path query parameter
- `confirm` — Confirm query parameter
- `execId` — Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body.
- `exec_id` — Alias for execId (snake_case).
- `subdomain` — Optional subdomain namespace used with execId for path resolution.
- `dir` — Dir query parameter
- `filter` — Filter query parameter
- `metadata` — Metadata query parameter
- `label` — Label query parameter
- `tags` — Tags query parameter
- `mode` — Mode query parameter
- `enabled` — Enabled query parameter
- `websocket` — Websocket query parameter
- `recursive` — Recursive query parameter
- `include_comments` — Include_comments query parameter

**Body shapes:**

- `POST /api/v1/exec/scripts/tree` body — `{ baseDir: string="", maxDepth: int=10, includeMetadata: bool=false, execId: string, exec_id: string, subdomain: string }`
  - `baseDir` — Base Dir
  - `maxDepth` — Max Depth
  - `includeMetadata` — Include Metadata
  - `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided.
- `POST /api/v1/exec/scripts/move` body — `{ from*: string, to*: string, overwrite: bool=false, execId: string, exec_id: string, subdomain: string }`
- `POST /api/v1/exec/scripts/write` body — `{ path*: string, content*: string, createDirs: bool=true, validate: bool=true, execId: string, exec_id: string, subdomain: string }`
  - `createDirs` — Create Dirs

### `sdk` (4) — Sdk

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/sdk/:id` | Delete S D K |  |
| `GET /api/v1/exec/sdk/:id` | Get S D K |  |
| `POST /api/v1/exec/sdk/import` | Import S D K | `body*` |
| `GET /api/v1/exec/sdk/list` | List S D Ks |  |

**Param notes:**

- `id` — Id parameter

**Body shapes:**

- `POST /api/v1/exec/sdk/import` body — `{ execId*: string, source_url*: string, source_auth: string, middleware: string, magic_comments: string, force: bool=false }`
  - `execId` — Exec Id
  - `source_url` — Source_url
  - `source_auth` — Source_auth
  - `magic_comments` — Magic_comments

### `state` (3) — Shared-state

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/shared-state/clear` | Clear Shared State | `body*` |
| `POST /api/v1/exec/shared-state/get` | Get Shared State | `body*` |
| `POST /api/v1/exec/shared-state/set` | Set Shared State | `body*` |

**Body shapes:**

- `POST /api/v1/exec/shared-state/clear` body — `{ hostname*: string, path: string, clearAll: bool=false }`
  - `clearAll` — Clear All
- `POST /api/v1/exec/shared-state/get` body — `{ hostname*: string, path: string }`
- `POST /api/v1/exec/shared-state/set` body — `{ hostname*: string, path: string, value*: any, merge: bool=false }`
  - `value` — Arbitrary JSON value to store

### `system` (4) — System

| Method | Summary | Params |
|--------|---------|--------|
| `GET /openapi.json` | Get OpenAPI Specification (JSON) |  |
| `GET /openapi.yaml` | Get OpenAPI Specification (YAML) |  |
| `GET /api/v1/exec/system/restart-status` | Get Restart Status |  |
| `POST /api/v1/exec/system/restart` | Restart Server | `body` |

**Body shapes:**

- `POST /api/v1/exec/system/restart` body — `{ graceful: bool=true, drainTimeoutMs: int=5000, reason: string="API restart request" }`
  - `drainTimeoutMs` — Drain Timeout Ms

### `templates` (6) — Templates

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/templates/create-custom` | Create Custom Template | `body*` |
| `DELETE /api/v1/exec/templates/delete-custom/:name` | Delete Custom Template |  |
| `POST /api/v1/exec/templates/generate` | Generate From Template | `body*` |
| `GET /api/v1/exec/templates/list` | List Templates | `?category` `?includeBuiltin` `?includeCustom` |
| `GET /api/v1/exec/templates/preview` | Preview Template | `?name*` `?variables` |
| `PUT /api/v1/exec/templates/update-custom/:name` | Update Custom Template | `body` |

**Param notes:**

- `name` — Name parameter
- `category` — Filter templates to a single metadata category (e.g. `api`, `utility`). Omit to list all categories.
- `includeBuiltin` — Include built-in templates in the result set. Default `true`. Accepts `true`/`false`/`1`/`0`.
- `includeCustom` — Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`.
- `name` — Name query parameter
- `variables` — Variables query parameter

**Body shapes:**

- `POST /api/v1/exec/templates/create-custom` body — `object` — Request payload
- `POST /api/v1/exec/templates/generate` body — `{ name*: string, variables: object, outputPath: string, saveFile: bool=false }`
  - `outputPath` — Output Path
  - `saveFile` — Save File
- `PUT /api/v1/exec/templates/update-custom/:name` body — `{ code: string, metadata: object }`

### `validate` (6) — Validate

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/validate/dependencies` | Validate Dependencies | `body*` |
| `POST /api/v1/exec/validate/magic-comments` | Validate Magic Comments | `body*` |
| `POST /api/v1/exec/validate/return-type` | Validate Return Type | `body*` |
| `POST /api/v1/exec/validate/script` | Validate Script | `body*` |
| `POST /api/v1/exec/validate/syntax` | Validate Syntax | `body*` |
| `POST /api/v1/exec/validate/typescript` | Validate Type Script | `body*` |

**Body shapes:**

- `POST /api/v1/exec/validate/dependencies` body — `{ code*: string }`
- `POST /api/v1/exec/validate/magic-comments` body — `{ code*: string }`
- `POST /api/v1/exec/validate/return-type` body — `{ typeDefinition*: string, value*: any }`
  - `typeDefinition` — Type Definition
  - `value` — Arbitrary JSON value to validate against the declared return type
- `POST /api/v1/exec/validate/script` body — `{ code*: string }`
- `POST /api/v1/exec/validate/syntax` body — `{ code*: string }`
- `POST /api/v1/exec/validate/typescript` body — `{ code*: string }`


---

<!-- ===== namespace: files ===== -->

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with optional automatic mutation journaling when the kit is started with `--journal-path`.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/workspace/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **You never lose a previous version of a journaled path.** The journal lets you:

- **Time-travel a single file** — `GET /api/v1/files/{path}` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `GET /api/v1/files/{path}` `?history=1` walks every revision of the path.
- **Diff between revisions** — `GET /api/v1/files/{path}` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `GET /api/v1/journal` `?path=<p>&after_id=<seq>` streams every operation since seq `N`. Run `POST /api/v1/journal/flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When provisioned with `--journal-path`, no per-write setup is needed — every covered write is recorded (add `--allow-journal` to expose the journal query endpoints — history, revision, diff, stats, flush — over the API). Treat it as "always-on undo for the whole filesystem." Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments without those flags will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` (or `?type=<rclone-type>`) to operate against any of the 60+ rclone backend types you've connected (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, Git, …) instead of the local FS. Requires `--allow-remote` server-side flag. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `POST /api/v1/mounts` to surface a remote backend AS a path in the local FS. Same `--allow-remote` requirement.
- **chmod / chown** — Unix-only, requires `--allow-chmod` / `--allow-chown` server flags.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Always available because every write is journaled.
- **Audit / replay every change to the filesystem** — `GET /api/v1/journal` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3 / Git** — append `?backend=<id>` on `GET /api/v1/files/{path}` / `PUT /api/v1/files/{path}` / `DELETE /api/v1/files/{path}` / `PATCH /api/v1/files/{path}` / `POST /api/v1/files/{path}` calls (the methods that accept a `backend` option). The same endpoints transparently target the remote.
- **FUSE-mount a remote into the local FS** — when downstream code needs to read the remote as a regular path (`/mnt/s3/…`).

## When NOT to use

Run binaries -> `terminal`/`exec`, live events -> `watch`, TS/JS gen -> `exec`, indexed queries -> `sqlite`, traffic logs -> `proxyLogs`.

## Prerequisites

- **For plain read/write/stat/list (the default)**: nothing beyond the kit URL. Paths are absolute container paths; the namespace is not workspace-scoped, so use `/workspace/...`, `/home/user/...`, etc.
- **For glob / grep**: kit started with `--allow-search` / `--allow-grep` (403 "not allowed" otherwise; enabled in the standard hoody_kit container image).
- **For remote backends** (`?backend=` / `?type=` / FUSE mounts): the kit must be started with `--allow-remote`.
- **For chmod / chown**: kit started with `--allow-chmod` / `--allow-chown`, and the container is Unix.
- Cross-host file propagation (`/external/...` paths that route to another container) goes via SSHFS — that travels by container-to-container, not via this kit's API surface.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `GET /api/v1/files/{path}` `?stat`/`?lines=10-50`.
2. `GET /api/v1/files/glob/{path}` `?pattern=**/*.ts`; `GET /api/v1/files/grep/{path}` `?pattern=TODO&context=2` (local only).
3. `PUT /api/v1/files/{path}` `?append=true`; `DELETE /api/v1/files/{path}`.

### 2. Download, extract, FUSE-mount

1. `GET /{directory}?download` `GET /{dir}?download=<url>`; `GET /{directory}?downloads` to poll.
2. `GET /{archive}?preview` `?preview`; `GET /{archive}?extract` `?extract=src/**&dest=work-src` (`?dest=` MUST be relative).
3. `POST /api/v1/backends/s3` (60+ `connect*`) -> `GET /api/v1/files/{path}` for one-shot reads OR `POST /api/v1/mounts` -> `GET /{path}` for a regular FS view -> `DELETE /api/v1/mounts/{id}`/`DELETE /api/v1/backends/{id}`. (`GET /{path}` itself has no `backend` option; `GET /api/v1/files/{path}`/`PUT /api/v1/files/{path}`/`DELETE /api/v1/files/{path}` do.)

### 3. Journal time-travel + TUS-like upload

1. `GET /api/v1/files/{path}` `?history=1`, `?revision=N`/`?at=<unix-ms>`, `?diff=1&from_seq=<N>`.
2. `GET /api/v1/journal` `?path=<p>&after_id=<seq>`; `POST /api/v1/journal/flush` first.
3. Resumable: `PUT /{path}` first chunk, then `PATCH /{path}` `X-Update-Range: append` per chunk.

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix in `api/files.rs`, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. (`/api/v1/files/health` is intercepted by a separate top-level route in `api/mod.rs:106` before this dispatcher sees it.)
- `GET /api/v1/files/glob/{path}`/`GET /api/v1/files/grep/{path}`/`GET /api/v1/files/realpath/{path}`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need `--allow-remote`.
- `PATCH /api/v1/files/chmod/{path}`/`PATCH /api/v1/files/chown/{path}` Unix-only + `--allow-chmod`/`--allow-chown`.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- Cross-host propagation is SSHFS-only via `/external/...`.
- `GET /api/v1/files/realpath/{path}` follows symlinks even where blocked.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit offset must fall INSIDE the current file, so it can only overwrite, never extend past EOF; use `PUT /api/v1/files/append/{path}` to extend. [live-verified]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir. [live-verified]
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`. [live-verified]
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `GET /{archive}?extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **Journal default `max_file_size` is 2 MiB; oversized files still produce a journal entry with hash + size, but the body bytes are not stored**.
- **`journal.is_excluded(<relative-path>)` gates which paths are recorded.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless you pass `--no-journal-ignore-dev-dirs`. `.git` is always excluded regardless of that flag (separate hardcoded check, not part of the toggleable list). Custom excludes via `--journal-exclude`. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `PATCH /api/v1/files/chmod/{path}`, `PATCH /api/v1/files/chown/{path}`, `PUT /{path}?touch`, `?append=true` and copy/move ARE recorded. Always call `POST /api/v1/journal/flush` then `GET /api/v1/journal` (or `?history=1`) to inspect what was actually recorded — don't assume coverage. [live-verified]
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Disable these with `--no-journal-ignore-dev-dirs` at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even with `--no-journal-ignore-dev-dirs`.
- **`/tmp/...` paths appear NOT to be journaled** at all (live-verified — 0 entries for `/tmp/files-examples-*` writes). Use `/home/user/...` (or another non-`/tmp` path) when you need history.
- **`HEAD /api/v1/files/{path}` returns `405`**; the `HEAD /{path}` operation in mappings is the WebDAV-style `HEAD /{path}` route (no `/api/v1/files/` prefix). Use `GET /api/v1/files/stat/{path}` (`GET /api/v1/files/stat/{path}`) for a JSON envelope instead. [live-verified]
- **`PATCH /api/v1/files/chown/{path}` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even if the kit has `--allow-chown`. Use a non-root user (`nobody`, `user`, …). [live-verified]
- **FUSE mount paths are confined to a configured mount-dir** (`/hoody/mounts` by default); arbitrary paths return `400 Mount path must be under the configured mount directory`. Override at kit start with `--mount-dir <path>`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed). [live-verified]
- **`hoody-files` test container goes to sleep** between requests on a quiet kit; first hit may return `502` from the proxy with a `<!DOCTYPE html>…Error 502` body. Retry 2-3× with a few seconds backoff and the kit wakes up. [live-verified]
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the container's files mount natively as a drive/folder with no install: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL; cross-platform/scripted, via `hoody mount <containerId> <localDir>` (WebDAV-backed remote mount; `--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags). This is the inverse of the server-side FUSE `* /api/v1/mounts*` family (which mounts remote backends INTO the container).

## Common errors

- 400 not supported with remote backends -- drop `?backend=`.
- 400 Cannot combine realpath with other ops.
- 400 Cannot preview a directory as archive.
- 400 Unknown operation -- POST needs one query op.
- 400 Missing query or body -- PATCH needs op or body.

## Related namespaces

- `terminal` -- run binaries.
- `exec` -- TS/JS gen.
- `watch` -- live events.
- `sqlite` -- indexed queries.
- `browser`/`curl` -- scripted HTTP.

## Examples

Every step in every example was live-tested against a real `files-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. Paths under `/tmp/...` are NOT journaled by default — examples that need history use `/home/user/...`.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `GET /api/v1/files/stat/{path}` returns size, owner/group, octal permissions, mtime, plus a `revisions` count (how many journal entries exist for this path). Use this BEFORE downloading a file you don't know the size of.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/files/stat/etc/hostname"
# → {"name":"hostname","path":"/etc/hostname","path_type":"File","size":13,"permissions":"644","owner":"root","group":"root","mtime":...,"revisions":0,...}
```
**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```bash
curl -sf "$KIT/api/v1/files/var/log/syslog?lines=2-3"
# returns just two lines, plain text
```
**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```bash
curl -sf "$KIT/api/v1/files/etc/hostname" -o /tmp/hostname.txt
```
### 2. Find files then grep them — TODO scan across a tree

**Goal:** find every `.md` file under a directory, then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true`.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/files/glob/home/user?pattern=**/*.md&max_results=200" \
  | jq '.entries[].name'
```
**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```bash
curl -sf "$KIT/api/v1/files/grep/home/user?pattern=TODO&glob=**/*.md&context=2&ignore_case=true" \
  | jq '.matches[] | {path, line_number, line}'
```
### 3. Resumable upload — split a payload into PUT-then-PATCH-append chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
DST=/home/user/upload-test.bin
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk1.bin
curl -sf -X PUT "$KIT/api/v1/files$DST" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @/tmp/chunk1.bin
# → {"path":"...","size":8388608,"success":true}
```
**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk2.bin
curl -sf -X PATCH "$KIT$DST" \
  -H 'X-Update-Range: append' \
  --data-binary @/tmp/chunk2.bin
curl -sf "$KIT/api/v1/files/stat$DST" | jq '.size'   # → 16777216
```
**Step 3 — same shape for resume after a network drop.** Re-append the missing chunk with `X-Update-Range: append` if you tracked the cursor client-side. An explicit `bytes=<start>-<end>` offset (no `/<total>` suffix — that is rejected) only overwrites INSIDE the existing file and cannot extend it, so it is not a resume mechanism. The generated **SDK and CLI currently expose only `X-Update-Range: append`**; explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Journal tracks every PUT under `/home/user/...` (NOT `/tmp/...` — see Quirks).

**Step 1 — write two revisions.**

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
P=/home/user/config.toml
curl -sf -X PUT "$KIT/api/v1/files$P" --data-binary 'verbose = false'
sleep 1
curl -sf -X PUT "$KIT/api/v1/files$P" --data-binary 'verbose = true'
curl -sf -X POST "$KIT/api/v1/journal/flush"   # force-persist before query
```
**Step 2 — list history.** `?history=1` returns the per-revision log: each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
curl -sf "$KIT/api/v1/files$P?history=1" \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```
**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```bash
curl -sf "$KIT/api/v1/files$P?revision=1"        # → "verbose = false"
curl -sf "$KIT/api/v1/files$P?diff=1&from_seq=1" # unified diff seq 1 → current
```
**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.

### 5. Audit — stream every mutation since seq N via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `POST /api/v1/journal/flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/journal/flush"
```
**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

```bash
LAST=0   # cursor; persist client-side
curl -sf "$KIT/api/v1/journal?after_id=$LAST&limit=200" \
  | jq '{count, next: .next_after_id, ops: [.entries[] | {seq, op, path, ts, size_after, hash}]}'
```
**Step 3 — health check.** Watch `GET /api/v1/journal/stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
curl -sf "$KIT/api/v1/journal/stats" | jq '{writer_healthy, parse_failures, skipped_overflow, entries_skipped_total}'
```
### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — fire-and-poll.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). Returns a `download_id` for tracking.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
DIR=/home/user/inbox
curl -sf -X POST "$KIT/api/v1/files$DIR?mkdir=true"
URL='https://httpbin.org/robots.txt'
curl -sf "$KIT$DIR?download=$(printf '%s' "$URL" | jq -sRr @uri)&filename=robots.txt&timeout=15"
# → {"download_id":"…","filename":"robots.txt","path":"…/robots.txt","success":true}
```
**Step 2 — list active.** `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing (live-verified).

```bash
curl -sf "$KIT$DIR/?downloads"        # active in this dir
curl -sf "$KIT/?download_history"     # global history (across all dirs)
```
### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s (live-verified).

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
ARCHIVE=/home/user/inbox/hello.zip
curl -sf "$KIT$ARCHIVE?preview" \
  | jq '{format, total_files, total_size, entries: [.entries[] | {path, size, is_dir}]}'
```
**Step 2 — extract a subset.** `?extract=<glob>` selects entries (empty = all). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
curl -sf "$KIT$ARCHIVE?extract=Hello-World-master/&dest=extracted"
# → {"destination":"/home/user/inbox/extracted","extracted_files":2,...}
curl -sf "$KIT/api/v1/files/home/user/inbox/extracted" | jq -r '.entries[].name'   # via files.get (directory listing on /api/v1/files/{path})
```
**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<glob>` and `?extract_file=<path>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=` (or alongside the archive if omitted).

```bash
curl -sf "$KIT$ARCHIVE?extract=Hello-World-master/README&extract_file=Hello-World-master/README&dest=extracted"
```
### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
SRC=/home/user/staging/app.toml
DST=/etc/myapp/app.toml
curl -sf -X POST "$KIT/api/v1/files/copy$SRC?copy_to=$DST&overwrite=true"
# → {"source":"…","destination":"…","success":true}
```
**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires `--allow-chmod` at kit start; Unix-only.

```bash
curl -sf -X PATCH "$KIT/api/v1/files/chmod$DST?chmod=600"
```
**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```bash
curl -sf -X POST "$KIT/api/v1/files/move$SRC?move_to=/home/user/archive/app.toml"
```
### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here: `local` for portability — swap in `s3`/`sftp`/`drive` etc.) and surface it as a regular FS path via FUSE. Requires `--allow-remote` at kit start.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `{id, type, vfs_backend_type}`.

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
BID=$(curl -sf -X POST "$KIT/api/v1/backends/local" \
  -H 'Content-Type: application/json' \
  -d '{"description":"local-passthrough"}' \
  | jq -r '.data.id')
echo "backend=$BID"
curl -sf "$KIT/api/v1/backends/$BID/test" | jq '.status'   # → "connected"
```
**Step 2 — mount.** `mount_path` MUST sit under the kit's configured mount-dir (default `/hoody/mounts/...`) — arbitrary paths return `400 Mount path must be under the configured mount directory`.

```bash
MID=$(curl -sf -X POST "$KIT/api/v1/mounts" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg b "$BID" '{backend_id:$b, label:"local-mount", mount_path:"/hoody/mounts/local-test"}')" \
  | jq -r '.data.id')
echo "mount=$MID"
```
**Step 3 — read through the mount as a regular path.**

```bash
curl -sf "$KIT/api/v1/files/hoody/mounts/local-test" | jq '.entries[].name'
```
**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
curl -sf -X DELETE "$KIT/api/v1/mounts/$MID"
curl -sf -X DELETE "$KIT/api/v1/backends/$BID"
```
### 10. Bulk delete a tree atomically — and verify nothing leaked

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```bash
KIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
DIR=/home/user/files-examples-cleanup
curl -sf -X DELETE "$KIT/api/v1/files$DIR"
# → {"success":true,"path":"…"}
```
**Step 2 — verify.** A `404` from `GET /api/v1/files/stat/{path}` is what you want.

```bash
curl -s -o /dev/null -w '%{http_code}\n' "$KIT/api/v1/files/stat$DIR"   # → 404
```
**Step 3 — confirm via journal.** A successful tree-delete emits `op: "delete"` (or `op: "dir_deleted"` per child). Flush first.

```bash
curl -sf -X POST "$KIT/api/v1/journal/flush" >/dev/null
curl -sf "$KIT/api/v1/journal?path=$DIR&limit=10" \
  | jq '.entries[] | {seq, op, ts}'
```

## Reference

### `archives` (8) — Archive operations - extract, preview, download directories as ZIP

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{directory}?zip` | Download directory as ZIP | `?zip*` |
| `GET /{archive}?extract` | Extract archive | `?extract*` `?dest` |
| `GET /{archive}?extract_file` | Extract file from archive | `?extract*` `?dest` |
| `GET /?extraction_history` | Extraction history | `?extraction_history*` |
| `GET /?extractions` | List active extractions | `?extractions*` |
| `GET /api/v1/extractions` | List active extractions |  |
| `GET /{archive}?preview` | Preview archive contents or read file | `?preview` `?contents` |
| `GET /{archive}?view_file` | View file from archive | `?preview*` |

**Param notes:**

- `extract` — Empty for full extraction; path for selective (e.g. "src/" or "lib/")
- `dest` — Destination directory name (default: archive name)
- `archive` — Path to archive file
- `extract` — Path of the file or directory inside the archive to extract (e.g. "src/" or "lib/")
- `preview` — Empty value lists archive contents; non-empty value reads a specific file from the archive (alias: ?contents)
- `contents` — Alias for ?preview
- `preview` — Path of the file inside the archive to view (e.g. "src/" or "README.md")

### `authentication` (2) — Authentication operations - check auth status and logout

| Method | Summary | Params |
|--------|---------|--------|
| `CHECKAUTH /{path}` | Check authentication status |  |
| `LOGOUT /{path}` | Clear authentication |  |

### `backends` (67) — Backend management - connect, list, test, and disconnect remote cloud storage backends

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/backends/alias` | Connect to alias backend | `body*` |
| `POST /api/v1/backends/azureblob` | Connect to azureblob backend | `body*` |
| `POST /api/v1/backends/azurefiles` | Connect to azurefiles backend | `body*` |
| `POST /api/v1/backends/b2` | Connect to b2 backend | `body*` |
| `POST /api/v1/backends/box` | Connect to box backend | `body*` |
| `POST /api/v1/backends/cache` | Connect to cache backend | `body*` |
| `POST /api/v1/backends/chunker` | Connect to chunker backend | `body*` |
| `POST /api/v1/backends/cloudinary` | Connect to cloudinary backend | `body*` |
| `POST /api/v1/backends/combine` | Connect to combine backend | `body*` |
| `POST /api/v1/backends/compress` | Connect to compress backend | `body*` |
| `POST /api/v1/backends/crypt` | Connect to crypt backend | `body*` |
| `POST /api/v1/backends/drive` | Connect to drive backend | `body*` |
| `POST /api/v1/backends/dropbox` | Connect to dropbox backend | `body*` |
| `POST /api/v1/backends/fichier` | Connect to fichier backend | `body*` |
| `POST /api/v1/backends/filefabric` | Connect to filefabric backend | `body*` |
| `POST /api/v1/backends/filescom` | Connect to filescom backend | `body*` |
| `POST /api/v1/backends/ftp` | Connect to ftp backend | `body*` |
| `POST /api/v1/backends/gofile` | Connect to gofile backend | `body*` |
| `POST /api/v1/backends/google-cloud-storage` | Connect to google cloud storage backend | `body*` |
| `POST /api/v1/backends/google-photos` | Connect to google photos backend | `body*` |
| `POST /api/v1/backends/hasher` | Connect to hasher backend | `body*` |
| `POST /api/v1/backends/hdfs` | Connect to hdfs backend | `body*` |
| `POST /api/v1/backends/hidrive` | Connect to hidrive backend | `body*` |
| `POST /api/v1/backends/http` | Connect to http backend | `body*` |
| `POST /api/v1/backends/iclouddrive` | Connect to iclouddrive backend | `body*` |
| `POST /api/v1/backends/imagekit` | Connect to imagekit backend | `body*` |
| `POST /api/v1/backends/internetarchive` | Connect to internetarchive backend | `body*` |
| `POST /api/v1/backends/jottacloud` | Connect to jottacloud backend | `body*` |
| `POST /api/v1/backends/koofr` | Connect to koofr backend | `body*` |
| `POST /api/v1/backends/linkbox` | Connect to linkbox backend | `body*` |
| `POST /api/v1/backends/local` | Connect to local backend | `body*` |
| `POST /api/v1/backends/mailru` | Connect to mailru backend | `body*` |
| `POST /api/v1/backends/mega` | Connect to mega backend | `body*` |
| `POST /api/v1/backends/memory` | Connect to memory backend | `body*` |
| `POST /api/v1/backends/netstorage` | Connect to netstorage backend | `body*` |
| `POST /api/v1/backends/onedrive` | Connect to onedrive backend | `body*` |
| `POST /api/v1/backends/opendrive` | Connect to opendrive backend | `body*` |
| `POST /api/v1/backends/oracleobjectstorage` | Connect to oracleobjectstorage backend | `body*` |
| `POST /api/v1/backends/pcloud` | Connect to pcloud backend | `body*` |
| `POST /api/v1/backends/pikpak` | Connect to pikpak backend | `body*` |
| `POST /api/v1/backends/pixeldrain` | Connect to pixeldrain backend | `body*` |
| `POST /api/v1/backends/premiumizeme` | Connect to premiumizeme backend | `body*` |
| `POST /api/v1/backends/protondrive` | Connect to protondrive backend | `body*` |
| `POST /api/v1/backends/putio` | Connect to putio backend | `body*` |
| `POST /api/v1/backends/qingstor` | Connect to qingstor backend | `body*` |
| `POST /api/v1/backends/quatrix` | Connect to quatrix backend | `body*` |
| `POST /api/v1/backends/s3` | Connect to s3 backend | `body*` |
| `POST /api/v1/backends/seafile` | Connect to seafile backend | `body*` |
| `POST /api/v1/backends/sftp` | Connect to sftp backend | `body*` |
| `POST /api/v1/backends/sharefile` | Connect to sharefile backend | `body*` |
| `POST /api/v1/backends/sia` | Connect to sia backend | `body*` |
| `POST /api/v1/backends/smb` | Connect to smb backend | `body*` |
| `POST /api/v1/backends/storj` | Connect to storj backend | `body*` |
| `POST /api/v1/backends/sugarsync` | Connect to sugarsync backend | `body*` |
| `POST /api/v1/backends/swift` | Connect to swift backend | `body*` |
| `POST /api/v1/backends/tardigrade` | Connect to tardigrade backend | `body*` |
| `POST /api/v1/backends/ulozto` | Connect to ulozto backend | `body*` |
| `POST /api/v1/backends/union` | Connect to union backend | `body*` |
| `POST /api/v1/backends/uptobox` | Connect to uptobox backend | `body*` |
| `POST /api/v1/backends/webdav` | Connect to webdav backend | `body*` |
| `POST /api/v1/backends/yandex` | Connect to yandex backend | `body*` |
| `POST /api/v1/backends/zoho` | Connect to zoho backend | `body*` |
| `DELETE /api/v1/backends/{id}` | Disconnect backend |  |
| `GET /api/v1/backends/{id}` | Get backend details |  |
| `GET /api/v1/backends` | List all backends |  |
| `GET /api/v1/backends/{id}/test` | Test backend connection |  |
| `PUT /api/v1/backends/{id}` | Update backend credentials | `body*` |

**Body shapes:**

- `POST /api/v1/backends/alias` body — `{ description: string="", remote*: string="" }` — alias backend configuration
  - `description` — Description of the remote.
  - `remote` — Remote or path to alias.  Can be "myremote:path/to/dir", "myremote:bucket", "myremote:" or "/local/path".
- `POST /api/v1/backends/azureblob` body — `{ access_tier: string="", account: string="", archive_tier_delete: bool=false, chunk_size: string="4194304", client_certificate_password: string="", client_certificate_path: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, delete_snapshots: "" | "include" | "only"="", description: string="", directory_markers: bool=false, disable_checksum: bool=false, disable_instance_discovery: bool=false, encoding: string="21078018", endpoint: string="", env_auth: bool=false, key: string="", list_chunk: int=5000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", no_check_container: bool=false, no_head_object: bool=false, password: string="", public_access: "" | "blob" | "container"="", sas_url: string="", service_principal_file: string="", tenant: string="", upload_concurrency: int=16, upload_cutoff: string="", use_az: bool=false, use_emulator: bool=false, use_msi: bool=false, username: string="" }` — azureblob backend configuration
  - _(37 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/azurefiles` body — `{ account: string="", chunk_size: string="4194304", client_certificate_password: string="", client_certificate_path: string="", client_id: string="", client_secret: string="", client_send_certificate_chain: bool=false, connection_string: string="", description: string="", encoding: string="54634382", endpoint: string="", env_auth: bool=false, key: string="", max_stream_size: string="10737418240", msi_client_id: string="", msi_mi_res_id: string="", msi_object_id: string="", password: string="", sas_url: string="", service_principal_file: string="", share_name: string="", tenant: string="", upload_concurrency: int=16, use_msi: bool=false, username: string="" }` — azurefiles backend configuration
  - _(25 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/b2` body — `{ account*: string="", chunk_size: string="100663296", copy_cutoff: string="4294967296", description: string="", disable_checksum: bool=false, download_auth_duration: int=604800, download_url: string="", encoding: string="50438146", endpoint: string="", hard_delete: bool=false, key*: string="", lifecycle: int=0, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, test_mode: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", version_at: string="0001-01-01T00:00:00Z", versions: bool=false }` — b2 backend configuration
  - _(19 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/box` body — `{ access_token: string="", auth_url: string="", box_config_file: string="", box_sub_type: "user" | "enterprise"="user", client_credentials: bool=false, client_id: string="", client_secret: string="", commit_retries: int=100, description: string="", encoding: string="52535298", impersonate: string="", list_chunk: int=1000, owned_by: string="", root_folder_id: string="0", token: string="", token_url: string="", upload_cutoff: string="52428800" }` — box backend configuration
  - `access_token` — Box App Primary Access Token  Leave blank normally.
  - `auth_url` — Auth server URL.  Leave blank to use the provider defaults.
  - `box_config_file` — Box App config.json location  Leave blank normally.  Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`.
  - `client_credentials` — Use client credentials OAuth flow.  This will use the OAUTH2 client Credentials Flow as described in RFC 6749.
  - `client_id` — OAuth Client Id.  Leave blank normally.
  - `client_secret` — OAuth Client Secret.  Leave blank normally.
  - `commit_retries` — Max number of times to try committing a multipart file.
  - `encoding` — The encoding for the backend.  See the [encoding section in the overview](/overview/#encoding) for more info.
  - `impersonate` — Impersonate this user ID when using a service account.  Setting this flag allows Hoody, when using a JWT service account, to act on behalf of another user by setting the as-user header.  The user ID is the Box identifier for a user. User IDs can found for any user via the GET /users endpoint, which…
  - `list_chunk` — Size of listing chunk 1-1000.
  - `owned_by` — Only show items owned by the login (email address) passed in.
  - `root_folder_id` — Fill in for Hoody to use a non root folder as its starting point.
  - `token` — OAuth Access Token as a JSON blob.
  - `token_url` — Token server url.  Leave blank to use the provider defaults.
  - `upload_cutoff` — Cutoff for switching to multipart upload (>= 50 MiB).
- `POST /api/v1/backends/cache` body — `{ chunk_clean_interval: int=60, chunk_no_memory: bool=false, chunk_path: string="/home/user/.cache/hoody-vfs/cache-backend", chunk_size: "1M" | "5M" | "10M"="5242880", chunk_total_size: "500M" | "1G" | "10G"="10737418240", db_path: string="/home/user/.cache/hoody-vfs/cache-backend", db_purge: bool=false, db_wait_time: int=1, description: string="", info_age: "1h" | "24h" | "48h"=21600, plex_insecure: string="", plex_password: string="", plex_token: string="", plex_url: string="", plex_username: string="", read_retries: int=10, remote*: string="", rps: int=-1, tmp_upload_path: string="", tmp_wait_time: int=15, workers: int=4, writes: bool=false }` — cache backend configuration
  - _(22 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/chunker` body — `{ chunk_size: string="2147483648", description: string="", fail_hard: "true" | "false"=false, hash_type: "none" | "md5" | "sha1" | "md5all" | "sha1all" | "md5quick" | "sha1quick"="md5", meta_format: "none" | "simplejson"="simplejson", name_format: string="*.hoody-vfs_chunk.###", remote*: string="", start_from: int=1, transactions: "rename" | "norename" | "auto"="rename" }` — chunker backend configuration
  - `chunk_size` — Files larger than chunk size will be split in chunks.
  - `fail_hard` — Choose how chunker should handle files with missing or invalid chunks.
  - `hash_type` — Choose how chunker handles hash sums.  All modes but "none" require metadata.
  - `meta_format` — Format of the metadata object or "none".  By default "simplejson". Metadata is a small JSON file named after the composite file.
  - `name_format` — String format of chunk file names.  The two placeholders are: base file name (*) and chunk number (#...). There must be one and only one asterisk and one or more consecutive hash characters. If chunk number has less digits than the number of hashes, it is left-padded by zeros. If there are more dig…
  - `remote` — Remote to chunk/unchunk.  Normally should contain a ':' and a path, e.g. "myremote:path/to/dir", "myremote:bucket" or maybe "myremote:" (not recommended).
  - `start_from` — Minimum valid chunk number. Usually 0 or 1.  By default chunk numbers start from 1.
  - `transactions` — Choose how chunker should handle temporary files during transactions.
- `POST /api/v1/backends/cloudinary` body — `{ api_key*: string="", api_secret*: string="", cloud_name*: string="", description: string="", encoding: string="52543246", eventually_consistent_delay: int=0, upload_prefix: string="", upload_preset: string="" }` — cloudinary backend configuration
  - `api_key` — Cloudinary API Key
  - `api_secret` — Cloudinary API Secret
  - `cloud_name` — Cloudinary Environment Name
  - `eventually_consistent_delay` — Wait N seconds for eventual consistency of the databases that support the backend operation
  - `upload_prefix` — Specify the API endpoint for environments out of the US
  - `upload_preset` — Upload Preset to select asset manipulation on upload
- `POST /api/v1/backends/combine` body — `{ description: string="", upstreams*: string }` — combine backend configuration
  - `upstreams` — Upstreams for combining  These should be in the form   dir=remote:path dir2=remote2:path  Where before the = is specified the root directory and after is the remote to put there.  Embedded spaces can be added using quotes   "dir=remote:path with space" "dir2=remote2:path with space"
- `POST /api/v1/backends/compress` body — `{ description: string="", level: int=-1, mode: "gzip"="gzip", ram_cache_limit: string="20971520", remote*: string="" }` — compress backend configuration
  - `level` — GZIP compression level (-2 to 9).  Generally -1 (default, equivalent to 5) is recommended. Levels 1 to 9 increase compression at the cost of speed. Going past 6  generally offers very little return.  Level -2 uses Huffman encoding only. Only use if you know what you are doing. Level 0 turns off com…
  - `mode` — Compression mode.
  - `ram_cache_limit` — Some remotes don't allow the upload of files with unknown size. In this case the compressed file will need to be cached to determine it's size.  Files smaller than this limit will be cached in RAM, files larger than  this limit will be cached on disk.
  - `remote` — Remote to compress.
- `POST /api/v1/backends/crypt` body — `{ description: string="", directory_name_encryption: "true" | "false"=true, filename_encoding: "base32" | "base64" | "base32768"="base32", filename_encryption: "standard" | "obfuscate" | "off"="standard", no_data_encryption: "true" | "false"=false, pass_bad_blocks: bool=false, password*: string="", password2: string="", remote*: string="", server_side_across_configs: bool=false, show_mapping: bool=false, strict_names: bool=false, suffix: string=".bin" }` — crypt backend configuration
  - `directory_name_encryption` — Option to either encrypt directory names or leave them intact.  NB If filename_encryption is "off" then this option will do nothing.
  - `filename_encoding` — How to encode the encrypted filename to text string.  This option could help with shortening the encrypted filename. The  suitable option would depend on the way your remote count the filename length and if it's case sensitive.
  - `filename_encryption` — How to encrypt the filenames.
  - `no_data_encryption` — Option to either encrypt file data or leave it unencrypted.
  - `pass_bad_blocks` — If set this will pass bad blocks through as all 0.  This should not be set in normal operation, it should only be set if trying to recover an encrypted file with errors and it is desired to recover as much of the file as possible.
  - `password` — Password or pass phrase for encryption.
  - `password2` — Password or pass phrase for salt.  Optional but recommended. Should be different to the previous password.
  - `remote` — Remote to encrypt/decrypt.  Normally should contain a ':' and a path, e.g. "myremote:path/to/dir", "myremote:bucket" or maybe "myremote:" (not recommended).
  - `server_side_across_configs` — Deprecated: use --server-side-across-configs instead.  Allow server-side operations (e.g. copy) to work across different crypt configs.  Normally this option is not what you want, but if you have two crypts pointing to the same backend you can use it.  This can be used, for example, to change file…
  - `show_mapping` — For all files listed show how the names encrypt.  If this flag is set then for each file that the remote is asked to list, it will log (at level INFO) a line stating the decrypted file name and the encrypted file name.  This is so you can work out which encrypted names are which decrypted names jus…
  - `strict_names` — If set, this will raise an error when crypt comes across a filename that can't be decrypted.  (By default, Hoody will just log a NOTICE and continue as normal.) This can happen if encrypted and unencrypted files are stored in the same directory (which is not recommended.) It may also indicate a mor…
  - `suffix` — If this is set it will override the default suffix of ".bin".  Setting suffix to "none" will result in an empty suffix. This may be useful  when the path length is critical.
- `POST /api/v1/backends/drive` body — `{ acknowledge_abuse: bool=false, allow_import_name_change: bool=false, alternate_export: bool=false, auth_owner_only: bool=false, auth_url: string="", chunk_size: string="8388608", client_credentials: bool=false, client_id: string="", client_secret: string="", copy_shortcut_content: bool=false, description: string="", disable_http2: bool=true, encoding: string="16777216", env_auth: "false" | "true"=false, export_formats: string="docx,xlsx,pptx,svg", fast_list_bug_fix: bool=true, formats: string="", impersonate: string="", import_formats: string="", keep_revision_forever: bool=false, list_chunk: int=1000, metadata_labels: "off" | "read" | "write" | "failok" | "read,write"="0", metadata_owner: "off" | "read" | "write" | "failok" | "read,write"="1", metadata_permissions: "off" | "read" | "write" | "failok" | "read,write"="0", pacer_burst: int=100, pacer_min_sleep: int=0, resource_key: string="", root_folder_id: string="", scope: "drive" | "drive.readonly" | "drive.file" | "drive.appfolder" | "drive.metadata.readonly"="", server_side_across_configs: bool=false, service_account_credentials: string="", service_account_file: string="", shared_with_me: bool=false, show_all_gdocs: bool=false, size_as_quota: bool=false, skip_checksum_gphotos: bool=false, skip_dangling_shortcuts: bool=false, skip_gdocs: bool=false, skip_shortcuts: bool=false, starred_only: bool=false, stop_on_download_limit: bool=false, stop_on_upload_limit: bool=false, team_drive: string="", token: string="", token_url: string="", trashed_only: bool=false, upload_cutoff: string="8388608", use_created_date: bool=false, use_shared_date: bool=false, use_trash: bool=true, v2_download_min_size: string="-1" }` — drive backend configuration
  - _(51 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/dropbox` body — `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="52469762", impersonate: string="", pacer_min_sleep: int=0, root_namespace: string="", shared_files: bool=false, shared_folders: bool=false, token: string="", token_url: string="" }` — dropbox backend configuration
  - _(18 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/fichier` body — `{ api_key: string="", cdn: bool=false, description: string="", encoding: string="52666494", file_password: string="", folder_password: string="", shared_folder: string="" }` — fichier backend configuration
  - `api_key` — Your API Key, get it from https://1fichier.com/console/params.pl.
  - `cdn` — Set if you wish to use CDN download links.
  - `file_password` — If you want to download a shared file that is password protected, add this parameter.
  - `folder_password` — If you want to list the files in a shared folder that is password protected, add this parameter.
  - `shared_folder` — If you want to download a shared folder, add this parameter.
- `POST /api/v1/backends/filefabric` body — `{ description: string="", encoding: string="50429954", permanent_token: string="", root_folder_id: string="", token: string="", token_expiry: string="", url*: "https://storagemadeeasy.com" | "https://eu.storagemadeeasy.com" | "https://yourfabric.smestorage.com"="", version: string="" }` — filefabric backend configuration
  - `permanent_token` — Permanent Authentication Token.  A Permanent Authentication Token can be created in the Enterprise File Fabric, on the users Dashboard under Security, there is an entry you'll see called "My Authentication Tokens". Click the Manage button to create one.  These tokens are normally valid for several…
  - `root_folder_id` — ID of the root folder.  Leave blank normally.  Fill in to make Hoody start with directory of a given ID.
  - `token` — Session Token.  This is a session token which Hoody caches in the config file. It is usually valid for 1 hour.  Don't set this value - Hoody will set it automatically.
  - `token_expiry` — Token expiry time.  Don't set this value - Hoody will set it automatically.
  - `url` — URL of the Enterprise File Fabric to connect to.
  - `version` — Version read from the file fabric.  Don't set this value - Hoody will set it automatically.
- `POST /api/v1/backends/filescom` body — `{ api_key: string="", description: string="", encoding: string="60923906", password: string="", site: string="", username: string="" }` — filescom backend configuration
  - `api_key` — The API key used to authenticate with Files.com.
  - `password` — The password used to authenticate with Files.com.
  - `site` — Your site subdomain (e.g. mysite) or custom domain (e.g. myfiles.customdomain.com).
  - `username` — The username used to authenticate with Files.com.
- `POST /api/v1/backends/ftp` body — `{ ask_password: bool=false, close_timeout: int=60, concurrency: int=0, description: string="", disable_epsv: bool=false, disable_mlsd: bool=false, disable_tls13: bool=false, disable_utf8: bool=false, encoding: "Asterisk,Ctl,Dot,Slash" | "BackSlash,Ctl,Del,Dot,RightSpace,Slash,SquareBracket" | "Ctl,LeftPeriod,Slash"="35749890", explicit_tls: bool=false, force_list_hidden: bool=false, host*: string="", idle_timeout: int=60, no_check_certificate: bool=false, no_check_upload: bool=false, pass: string="", port: int=21, shut_timeout: int=60, socks_proxy: string="", tls: bool=false, tls_cache_size: int=32, user: string="user", writing_mdtm: bool=false }` — ftp backend configuration
  - `ask_password` — Allow asking for FTP password when needed.  If this is set and no password is supplied then Hoody will ask for a password
  - `close_timeout` — Maximum time to wait for a response to close. (in seconds)
  - `concurrency` — Maximum number of FTP simultaneous connections, 0 for unlimited.  Note that setting this is very likely to cause deadlocks so it should be used with care.  If you are doing a sync or copy then make sure concurrency is one more than the sum of `--transfers` and `--checkers`.  If you use `--check-fir…
  - `disable_epsv` — Disable using EPSV even if server advertises support.
  - `disable_mlsd` — Disable using MLSD even if server advertises support.
  - `disable_tls13` — Disable TLS 1.3 (workaround for FTP servers with buggy TLS)
  - `disable_utf8` — Disable using UTF-8 even if server advertises support.
  - `explicit_tls` — Use Explicit FTPS (FTP over TLS).  When using explicit FTP over TLS the client explicitly requests security from the server in order to upgrade a plain text connection to an encrypted one. Cannot be used in combination with implicit FTPS.
  - `force_list_hidden` — Use LIST -a to force listing of hidden files and folders. This will disable the use of MLSD.
  - `host` — FTP host to connect to.  E.g. "ftp.example.com".
  - `idle_timeout` — Max time before closing idle connections.  If no connections have been returned to the connection pool in the time given, Hoody will empty the connection pool.  Set to 0 to keep connections indefinitely. (in seconds)
  - `no_check_certificate` — Do not verify the TLS certificate of the server.
  - `no_check_upload` — Don't check the upload is OK  Normally Hoody will try to check the upload exists after it has uploaded a file to make sure the size and modification time are as expected.  This flag stops Hoody doing these checks. This enables uploading to folders which are write only.  You will likely need to use…
  - `pass` — FTP password.
  - `port` — FTP port number.
  - `shut_timeout` — Maximum time to wait for data connection closing status. (in seconds)
  - `socks_proxy` — Socks 5 proxy host.   Supports the format user:pass@host:port, user@host:port, host:port.   Example:    myUser:myPass@localhost:9005
  - `tls` — Use Implicit FTPS (FTP over TLS).  When using implicit FTP over TLS the client connects using TLS right from the start which breaks compatibility with non-TLS-aware servers. This is usually served over port 990 rather than port 21. Cannot be used in combination with explicit FTPS.
  - `tls_cache_size` — Size of TLS session cache for all control and data connections.  TLS cache allows to resume TLS sessions and reuse PSK between connections. Increase if default size is not enough resulting in TLS resumption errors. Enabled by default. Use 0 to disable.
  - `user` — FTP username.
  - `writing_mdtm` — Use MDTM to set modification time (VsFtpd quirk)
- `POST /api/v1/backends/gofile` body — `{ access_token: string="", account_id: string="", description: string="", encoding: string="323331982", list_chunk: int=1000, root_folder_id: string="" }` — gofile backend configuration
  - `access_token` — API Access token  You can get this from the web control panel.
  - `account_id` — Account ID  Leave this blank normally, Hoody will fill it in automatically.
  - `list_chunk` — Number of items to list in each call
  - `root_folder_id` — ID of the root folder  Leave this blank normally, Hoody will fill it in automatically.  If you want Hoody to be restricted to a particular folder you can fill it in - see the docs for more info.
- `POST /api/v1/backends/google-cloud-storage` body — `{ access_token: string="", anonymous: bool=false, auth_url: string="", bucket_acl: "authenticatedRead" | "private" | "projectPrivate" | "publicRead" | "publicReadWrite"="", bucket_policy_only: bool=false, client_credentials: bool=false, client_id: string="", client_secret: string="", decompress: bool=false, description: string="", directory_markers: bool=false, encoding: string="50348034", endpoint: string="", env_auth: "false" | "true"=false, location: "" | "asia" | "eu" | "us" | "asia-east1" | "asia-east2" | "asia-northeast1" | "asia-northeast2" | …(36 values)="", no_check_bucket: bool=false, object_acl: "authenticatedRead" | "bucketOwnerFullControl" | "bucketOwnerRead" | "private" | "projectPrivate" | "publicRead"="", project_number: string="", service_account_credentials: string="", service_account_file: string="", storage_class: "" | "MULTI_REGIONAL" | "REGIONAL" | "NEARLINE" | "COLDLINE" | "ARCHIVE" | "DURABLE_REDUCED_AVAILABILITY"="", token: string="", token_url: string="", user_project: string="" }` — google cloud storage backend configuration
  - `access_token` — Short-lived access token.  Leave blank normally. Needed only if you want use short-lived access token instead of interactive login.
  - `anonymous` — Access public buckets and objects without credentials.  Set to 'true' if you just want to download files and don't configure credentials.
  - `bucket_acl` — Access Control List for new buckets.
  - `bucket_policy_only` — Access checks should use bucket-level IAM policies.  If you want to upload objects to a bucket with Bucket Policy Only set then you will need to set this.  When it is set, Hoody:  - ignores ACLs set on buckets - ignores ACLs set on objects - creates buckets with Bucket Policy Only set  Docs: https:…
  - `decompress` — If set this will decompress gzip encoded objects.  It is possible to upload objects to GCS with "Content-Encoding: gzip" set. Normally Hoody will download these files as compressed objects.  If this flag is set then Hoody will decompress these files with "Content-Encoding: gzip" as they are receive…
  - `directory_markers` — Upload an empty object with a trailing slash when a new directory is created  Empty folders are unsupported for bucket based remotes, this option creates an empty object ending with "/", to persist the folder.
  - `endpoint` — Endpoint for the service.  Leave blank normally.
  - `env_auth` — Get GCP IAM credentials from runtime (environment variables or instance meta data if no env vars).  Only applies if service_account_file and service_account_credentials is blank.
  - `location` — Location for the newly created buckets.
  - `no_check_bucket` — If set, don't attempt to check the bucket exists or create it.  This can be useful when trying to minimise the number of transactions Hoody does if you know the bucket exists already.
  - `object_acl` — Access Control List for new objects.
  - `project_number` — Project number.  Optional - needed only for list/create/delete buckets - see your developer console.
  - `service_account_credentials` — Service Account Credentials JSON blob.  Leave blank normally. Needed only if you want use SA instead of interactive login.
  - `service_account_file` — Service Account Credentials JSON file path.  Leave blank normally. Needed only if you want use SA instead of interactive login.  Leading `~` will be expanded in the file name as will environment variables such as `${RCLONE_CONFIG_DIR}`.
  - `storage_class` — The storage class to use when storing objects in Google Cloud Storage.
  - `user_project` — User project.  Optional - needed only for requester pays.
- `POST /api/v1/backends/google-photos` body — `{ auth_url: string="", batch_commit_timeout: int=600, batch_mode: string="sync", batch_size: int=0, batch_timeout: int=0, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50348034", include_archived: bool=false, proxy: string="", read_only: bool=false, read_size: bool=false, start_year: int=2000, token: string="", token_url: string="" }` — google photos backend configuration
  - `batch_commit_timeout` — Max time to wait for a batch to finish committing (in seconds)
  - `batch_mode` — Upload file batching sync\|async\|off.  This sets the batch mode used by Hoody.  This has 3 possible values  - off - no batching - sync - batch uploads and check completion (default) - async - batch upload and don't check completion  Hoody-VFS will close any outstanding batches when it exits which ma…
  - `batch_size` — Max number of files in upload batch.  This sets the batch size of files to upload. It has to be less than 50.  By default this is 0 which means Hoody will calculate the batch size depending on the setting of batch_mode.  - batch_mode: async - default batch_size is 50 - batch_mode: sync - default ba…
  - `batch_timeout` — Max time to allow an idle upload batch before uploading.  If an upload batch is idle for more than this long then it will be uploaded.  The default for this is 0 which means Hoody will choose a sensible default based on the batch_mode in use.  - batch_mode: async - default batch_timeout is 10s - ba…
  - `include_archived` — Also view and download archived media.  By default, Hoody does not request archived media. Thus, when syncing, archived media is not visible in directory listings or transferred.  Note that media in albums is always visible and synced, no matter their archive status.  With this flag, archived media…
  - `proxy` — Use the gphotosdl proxy for downloading the full resolution images  The Google API will deliver images and video which aren't full resolution, and/or have EXIF data missing.  However if you ue the gphotosdl proxy tnen you can download original, unchanged images.  This runs a headless browser in the…
  - `read_only` — Set to make the Google Photos backend read only.  If you choose read only then Hoody will only request read only access to your photos, otherwise Hoody will request full access.
  - `read_size` — Set to read the size of media items.  Normally Hoody does not read the size of media items since this takes another transaction. This isn't necessary for syncing. However Hoody mount needs to know the size of files in advance of reading them, so setting this flag when using Hoody mount is recommend…
  - `start_year` — Year limits the photos to be downloaded to those which are uploaded after the given year.
- `POST /api/v1/backends/hasher` body — `{ auto_size: string="0", description: string="", hashes: string, max_age: int=0, remote*: string="" }` — hasher backend configuration
  - `auto_size` — Auto-update checksum for files smaller than this size (disabled by default).
  - `hashes` — Comma separated list of supported checksum types.
  - `max_age` — Maximum time to keep checksums in cache (0 = no cache, off = cache forever). (in seconds)
  - `remote` — Remote to cache checksums for (e.g. myRemote:path).
- `POST /api/v1/backends/hdfs` body — `{ data_transfer_protection: "privacy"="", description: string="", encoding: string="50430082", namenode*: string, service_principal_name: string="", username: "root"="" }` — hdfs backend configuration
  - `data_transfer_protection` — Kerberos data transfer protection: authentication\|integrity\|privacy.  Specifies whether or not authentication, data signature integrity checks, and wire encryption are required when communicating with the datanodes. Possible values are 'authentication', 'integrity' and 'privacy'. Used only with KER…
  - `namenode` — Hadoop name nodes and ports.  E.g. "namenode-1:8020,namenode-2:8020,..." to connect to host namenodes at port 8020.
  - `service_principal_name` — Kerberos service principal name for the namenode.  Enables KERBEROS authentication. Specifies the Service Principal Name (SERVICE/FQDN) for the namenode. E.g. \"hdfs/namenode.hadoop.docker\" for namenode running as service 'hdfs' with FQDN 'namenode.hadoop.docker'.
  - `username` — Hadoop user name.
- `POST /api/v1/backends/hidrive` body — `{ auth_url: string="", chunk_size: string="50331648", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", disable_fetching_member_count: bool=false, encoding: string="33554434", endpoint: string="https://api.hidrive.strato.com/2.1", root_prefix: "/" | "root" | ""="/", scope_access: "rw" | "ro"="rw", scope_role: "user" | "admin" | "owner"="user", token: string="", token_url: string="", upload_concurrency: int=4, upload_cutoff: string="100663296" }` — hidrive backend configuration
  - `chunk_size` — Chunksize for chunked uploads.  Any files larger than the configured cutoff (or files of unknown size) will be uploaded in chunks of this size.  The upper limit for this is 2147483647 bytes (about 2.000Gi). That is the maximum amount of bytes a single upload-operation will support. Setting this abo…
  - `disable_fetching_member_count` — Do not fetch number of objects in directories unless it is absolutely necessary.  Requests may be faster if the number of objects in subdirectories is not fetched.
  - `endpoint` — Endpoint for the service.  This is the URL that API-calls will be made to.
  - `root_prefix` — The root/parent folder for all paths.  Fill in to use the specified folder as the parent for all paths given to the remote. This way Hoody can use any folder as its starting point.
  - `scope_access` — Access permissions that Hoody should use when requesting access from HiDrive.
  - `scope_role` — User-level that Hoody should use when requesting access from HiDrive.
  - `upload_concurrency` — Concurrency for chunked uploads.  This is the upper limit for how many transfers for the same file are running concurrently. Setting this above to a value smaller than 1 will cause uploads to deadlock.  If you are uploading small numbers of large files over high-speed links and these uploads do not…
  - `upload_cutoff` — Cutoff/Threshold for chunked uploads.  Any files larger than this will be uploaded in chunks of the configured chunksize.  The upper limit for this is 2147483647 bytes (about 2.000Gi). That is the maximum amount of bytes a single upload-operation will support. Setting this above the upper limit wil…
- `POST /api/v1/backends/http` body — `{ description: string="", headers: string, no_escape: bool=false, no_head: bool=false, no_slash: bool=false, url*: string="" }` — http backend configuration
  - `headers` — Set HTTP headers for all transactions.  Use this to set additional HTTP headers for all transactions.  The input format is comma separated list of key,value pairs. Standard [CSV encoding](https://godoc.org/encoding/csv) may be used.  For example, to set a Cookie use 'Cookie,name=value', or '"Cookie…
  - `no_escape` — Do not escape URL metacharacters in path names.
  - `no_head` — Don't use HEAD requests.  HEAD requests are mainly used to find file sizes in dir listing. If your site is being very slow to load then you can try this option. Normally Hoody does a HEAD request for each potential file in a directory listing to:  - find its size - check it really exists - check to…
  - `no_slash` — Set this if the site doesn't end directories with /.  Use this if your target website does not use / on the end of directories.  A / on the end of a path is how Hoody normally tells the difference between files and directories. If this flag is set, then Hoody will treat all files with Content-Type:…
  - `url` — URL of HTTP host to connect to.  E.g. "https://example.com", or "https://example.com" to use a username and password.
- `POST /api/v1/backends/iclouddrive` body — `{ apple_id*: string="", client_id: string="d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d", cookies: string="", description: string="", encoding: string="50438146", password*: string="", trust_token: string="" }` — iclouddrive backend configuration
  - `apple_id` — Apple ID.
  - `cookies` — cookies (internal use only)
  - `password` — Password.
- `POST /api/v1/backends/imagekit` body — `{ description: string="", encoding: string="117553486", endpoint*: string="", only_signed: bool=false, private_key*: string="", public_key*: string="", upload_tags: string="", versions: bool=false }` — imagekit backend configuration
  - `endpoint` — You can find your ImageKit.io URL endpoint in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `only_signed` — If you have configured `Restrict unsigned image URLs` in your dashboard settings, set this to true.
  - `private_key` — You can find your ImageKit.io private key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `public_key` — You can find your ImageKit.io public key in your [dashboard](https://imagekit.io/dashboard/developer/api-keys)
  - `upload_tags` — Tags to add to the uploaded files, e.g. "tag1,tag2".
  - `versions` — Include old versions in directory listings.
- `POST /api/v1/backends/internetarchive` body — `{ access_key_id: string="", description: string="", disable_checksum: bool=true, encoding: string="50446342", endpoint: string="https://s3.us.archive.org", front_endpoint: string="https://archive.org", secret_access_key: string="", wait_archive: int=0 }` — internetarchive backend configuration
  - `access_key_id` — IAS3 Access Key.  Leave blank for anonymous access. You can find one here: https://archive.org/account/s3.php
  - `disable_checksum` — Don't ask the server to test against MD5 checksum calculated by Hoody. Normally Hoody will calculate the MD5 checksum of the input before uploading it so it can ask the server to check the object against checksum. This is great for data integrity checking but can cause long delays for large files t…
  - `endpoint` — IAS3 Endpoint.  Leave blank for default value.
  - `front_endpoint` — Host of InternetArchive Frontend.  Leave blank for default value.
  - `secret_access_key` — IAS3 Secret Key (password).  Leave blank for anonymous access.
  - `wait_archive` — Timeout for waiting the server's processing tasks (specifically archive and book_op) to finish. Only enable if you need to be guaranteed to be reflected after write operations. 0 to disable waiting. No errors to be thrown in case of timeout. (in seconds)
- `POST /api/v1/backends/jottacloud` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50431886", hard_delete: bool=false, md5_memory_limit: string="10485760", no_versions: bool=false, token: string="", token_url: string="", trashed_only: bool=false, upload_resume_limit: string="10485760" }` — jottacloud backend configuration
  - `hard_delete` — Delete files permanently rather than putting them into the trash.
  - `md5_memory_limit` — Files bigger than this will be cached on disk to calculate the MD5 if required.
  - `no_versions` — Avoid server side versioning by deleting files and recreating files instead of overwriting them.
  - `trashed_only` — Only show files that are in the trash.  This will show trashed files in their original directory structure.
  - `upload_resume_limit` — Files bigger than this can be resumed if the upload fail's.
- `POST /api/v1/backends/koofr` body — `{ description: string="", encoding: string="50438146", endpoint*: string="", mountid: string="", password*: string="", provider: "koofr" | "digistorage" | "other"="", setmtime: bool=true, user*: string="" }` — koofr backend configuration
  - `endpoint` — The Koofr API endpoint to use.
  - `mountid` — Mount ID of the mount to use.  If omitted, the primary mount is used.
  - `password` — Your password for Hoody (generate one at your service's settings page).
  - `provider` — Choose your storage provider.
  - `setmtime` — Does the backend support setting modification time.  Set this to false if you use a mount ID that points to a Dropbox or Amazon Drive backend.
  - `user` — Your user name.
- `POST /api/v1/backends/linkbox` body — `{ description: string="", token*: string="" }` — linkbox backend configuration
  - `token` — Token from https://www.linkbox.to/admin/account
- `POST /api/v1/backends/local` body — `{ case_insensitive: bool=false, case_sensitive: bool=false, copy_links: bool=false, description: string="", encoding: string="33554434", links: bool=false, no_check_updated: bool=false, no_clone: bool=false, no_preallocate: bool=false, no_set_modtime: bool=false, no_sparse: bool=false, nounc: "true"=false, one_file_system: bool=false, skip_links: bool=false, time_type: "mtime" | "atime" | "btime" | "ctime"="0", unicode_normalization: bool=false, zero_size_links: bool=false }` — local backend configuration
  - _(17 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/mailru` body — `{ auth_url: string="", check_hash: "true" | "false"=true, client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50440078", pass*: string="", quirks: string="", speedup_enable: "true" | "false"=true, speedup_file_patterns: "" | "*" | "*.mkv,*.avi,*.mp4,*.mp3" | "*.zip,*.gz,*.rar,*.pdf"="*.mkv,*.avi,*.mp4,*.mp3,*.zip,*.gz,*.rar,*.pdf", speedup_max_disk: "0" | "1G" | "3G"="3221225472", speedup_max_memory: "0" | "32M" | "256M"="33554432", token: string="", token_url: string="", user*: string="", user_agent: string="" }` — mailru backend configuration
  - `check_hash` — What should copy do if file checksum is mismatched or invalid.
  - `pass` — Password.  This must be an app password - Hoody will not work with your normal password. See the Configuration section in the docs for how to make an app password.
  - `quirks` — Comma separated list of internal maintenance flags.  This option must not be used by an ordinary user. It is intended only to facilitate remote troubleshooting of backend issues. Strict meaning of flags is not documented and not guaranteed to persist between releases. Quirks will be removed when th…
  - `speedup_enable` — Skip full upload if there is another file with same data hash.  This feature is called "speedup" or "put by hash". It is especially efficient in case of generally available files like popular books, video or audio clips, because files are searched by hash in all accounts of all mailru users. It is…
  - `speedup_file_patterns` — Comma separated list of file name patterns eligible for speedup (put by hash).  Patterns are case insensitive and can contain '*' or '?' meta characters.
  - `speedup_max_disk` — This option allows you to disable speedup (put by hash) for large files.  Reason is that preliminary hashing can exhaust your RAM or disk space.
  - `speedup_max_memory` — Files larger than the size given below will always be hashed on disk.
  - `user` — User name (usually email).
  - `user_agent` — HTTP user agent used internally by client.  Defaults to "Hoody/VERSION" or "--user-agent" provided on command line.
- `POST /api/v1/backends/mega` body — `{ debug: bool=false, description: string="", encoding: string="50331650", hard_delete: bool=false, pass*: string="", use_https: bool=false, user*: string="" }` — mega backend configuration
  - `debug` — Output more debug from Mega.  If this flag is set (along with -vv) it will print further debugging information from the mega backend.
  - `hard_delete` — Delete files permanently rather than putting them into the trash.  Normally the mega backend will put all deletions into the trash rather than permanently deleting them. If you specify this then Hoody will permanently delete objects instead.
  - `pass` — Password.
  - `use_https` — Use HTTPS for transfers.  MEGA uses plain text HTTP connections by default. Some ISPs throttle HTTP connections, this causes transfers to become very slow. Enabling this will force MEGA to use HTTPS for all transfers. HTTPS is normally not necessary since all data is already encrypted anyway. Enabl…
  - `user` — User name.
- `POST /api/v1/backends/memory` body — `{ description: string="" }` — memory backend configuration
- `POST /api/v1/backends/netstorage` body — `{ account*: string="", description: string="", host*: string="", protocol: "http" | "https"="https", secret*: string="" }` — netstorage backend configuration
  - `account` — Set the NetStorage account name
  - `host` — Domain+path of NetStorage host to connect to.  Format should be `<domain>/<internal folders>`
  - `protocol` — Select between HTTP or HTTPS protocol.  Most users should choose HTTPS, which is the default. HTTP is provided primarily for debugging purposes.
  - `secret` — Set the NetStorage account secret/G2O key for authentication.  Please choose the 'y' option to set your own password then enter your secret.
- `POST /api/v1/backends/onedrive` body — `{ access_scopes: "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" | "Files.Read Files.Read.All Sites.Read.All offline_access" | "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All offline_access", auth_url: string="", av_override: bool=false, chunk_size: string="10485760", client_credentials: bool=false, client_id: string="", client_secret: string="", delta: bool=false, description: string="", disable_site_permission: bool=false, drive_id: string="", drive_type: string="", encoding: string="57386894", expose_onenote_files: bool=false, hard_delete: bool=false, hash_type: "auto" | "quickxor" | "sha1" | "sha256" | "crc32" | "none"="auto", link_password: string="", link_scope: "anonymous" | "organization"="anonymous", link_type: "view" | "edit" | "embed"="view", list_chunk: int=1000, metadata_permissions: "off" | "read" | "write" | "read,write" | "failok"="0", no_versions: bool=false, region: "global" | "us" | "de" | "cn"="global", root_folder_id: string="", server_side_across_configs: bool=false, tenant: string="", token: string="", token_url: string="" }` — onedrive backend configuration
  - _(28 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/opendrive` body — `{ chunk_size: string="10485760", description: string="", encoding: string="62007182", password*: string="", username*: string="" }` — opendrive backend configuration
  - `chunk_size` — Files will be uploaded in chunks this size.  Note that these chunks are buffered in memory so increasing them will increase memory use.
  - `username` — Username.
- `POST /api/v1/backends/oracleobjectstorage` body — `{ attempt_resume_upload: bool=false, chunk_size: string="5242880", compartment: string="", config_file: "~/.oci/config"="~/.oci/config", config_profile: "Default"="Default", copy_cutoff: string="4999610368", copy_timeout: int=60, description: string="", disable_checksum: bool=false, encoding: string="50331650", endpoint: string="", leave_parts_on_error: bool=false, max_upload_parts: int=10000, namespace*: string="", no_check_bucket: bool=false, provider*: "env_auth" | "user_principal_auth" | "instance_principal_auth" | "workload_identity_auth" | "resource_principal_auth" | "no_auth"="env_auth", region*: string="", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_file: ""="", sse_customer_key_sha256: ""="", sse_kms_key_id: ""="", storage_tier: "Standard" | "InfrequentAccess" | "Archive"="Standard", upload_concurrency: int=10, upload_cutoff: string="209715200" }` — oracleobjectstorage backend configuration
  - _(25 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/pcloud` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", hostname: "api.pcloud.com" | "eapi.pcloud.com"="api.pcloud.com", password: string="", root_folder_id: string="d0", token: string="", token_url: string="", username: string="" }` — pcloud backend configuration
  - `hostname` — Hostname to connect to.  This is normally set when Hoody initially does the oauth connection, however you will need to set it by hand if you are using remote config with Hoody authorize.
  - `password` — Your pcloud password.
  - `username` — Your pcloud username.   This is only required when you want to use the cleanup command. Due to a bug in the pcloud API the required API does not support OAuth authentication so we have to rely on user password authentication for it.
- `POST /api/v1/backends/pikpak` body — `{ chunk_size: string="5242880", description: string="", device_id: string="", encoding: string="56829838", hash_memory_limit: string="10485760", no_media_link: bool=false, pass*: string="", root_folder_id: string="", trashed_only: bool=false, upload_concurrency: int=5, use_trash: bool=true, user*: string="", user_agent: string="Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" }` — pikpak backend configuration
  - `chunk_size` — Chunk size for multipart uploads. 	 Large files will be uploaded in chunks of this size.  Note that this is stored in memory and there may be up to "--transfers" * "--pikpak-upload-concurrency" chunks stored at once in memory.  If you are transferring large files over high-speed links and you have…
  - `device_id` — Device ID used for authorization.
  - `hash_memory_limit` — Files bigger than this will be cached on disk to calculate hash if required.
  - `no_media_link` — Use original file links instead of media links.  This avoids issues caused by invalid media links, but may reduce download speeds.
  - `pass` — Pikpak password.
  - `root_folder_id` — ID of the root folder. Leave blank normally.  Fill in for Hoody to use a non root folder as its starting point.
  - `upload_concurrency` — Concurrency for multipart uploads.  This is the number of chunks of the same file that are uploaded concurrently for multipart uploads.  Note that chunks are stored in memory and there may be up to "--transfers" * "--pikpak-upload-concurrency" chunks stored at once in memory.  If you are uploading…
  - `use_trash` — Send files to the trash instead of deleting permanently.  Defaults to true, namely sending files to the trash. Use `--pikpak-use-trash=false` to delete files permanently instead.
  - `user` — Pikpak username.
  - `user_agent` — HTTP user agent for pikpak.  Defaults to "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0" or "--pikpak-user-agent" provided on command line.
- `POST /api/v1/backends/pixeldrain` body — `{ api_key: string="", api_url*: string="https://pixeldrain.com/api", description: string="", root_folder_id: string="me" }` — pixeldrain backend configuration
  - `api_key` — API key for your pixeldrain account. Found on https://pixeldrain.com/user/api_keys.
  - `api_url` — The API endpoint to connect to. In the vast majority of cases it's fine to leave this at default. It is only intended to be changed for testing purposes.
  - `root_folder_id` — Root of the filesystem to use.  Set to 'me' to use your personal filesystem. Set to a shared directory ID to use a shared directory.
- `POST /api/v1/backends/premiumizeme` body — `{ api_key: string="", auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438154", token: string="", token_url: string="" }` — premiumizeme backend configuration
  - `api_key` — API Key.  This is not normally used - use oauth instead.
- `POST /api/v1/backends/protondrive` body — `{ 2fa: string="", app_version: string="macos-drive@1.0.0-alpha.1+hoody-vfs", client_access_token: string="", client_refresh_token: string="", client_salted_key_pass: string="", client_uid: string="", description: string="", enable_caching: bool=true, encoding: string="52559874", mailbox_password: string="", original_file_size: bool=true, password*: string="", replace_existing_draft: bool=false, username*: string="" }` — protondrive backend configuration
  - `2fa` — The 2FA code  The value can also be provided with --protondrive-2fa=000000  The 2FA code of your proton drive account if the account is set up with  two-factor authentication
  - `app_version` — The app version string   The app version string indicates the client that is currently performing  the API request. This information is required and will be sent with every  API request.
  - `client_access_token` — Client access token key (internal use only)
  - `client_refresh_token` — Client refresh token key (internal use only)
  - `client_salted_key_pass` — Client salted key pass key (internal use only)
  - `client_uid` — Client uid key (internal use only)
  - `enable_caching` — Caches the files and folders metadata to reduce API calls  Notice: If you are mounting ProtonDrive as a VFS, please disable this feature,  as the current implementation doesn't update or clear the cache when there are  external changes.   The files and folders on ProtonDrive are represented as link…
  - `mailbox_password` — The mailbox password of your two-password proton account.  For more information regarding the mailbox password, please check the  following official knowledge base article:  https://proton.me/support/the-difference-between-the-mailbox-password-and-login-password
  - `original_file_size` — Return the file size before encryption   The size of the encrypted file will be different from (bigger than) the  original file size. Unless there is a reason to return the file size  after encryption is performed, otherwise, set this option to true, as  features like Open() which will need to be s…
  - `password` — The password of your proton account.
  - `replace_existing_draft` — Create a new revision when filename conflict is detected  When a file upload is cancelled or failed before completion, a draft will be  created and the subsequent upload of the same file to the same location will be  reported as a conflict.  The value can also be set by --protondrive-replace-existi…
  - `username` — The username of your proton account
- `POST /api/v1/backends/putio` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50438146", token: string="", token_url: string="" }` — putio backend configuration
- `POST /api/v1/backends/qingstor` body — `{ access_key_id: string="", chunk_size: string="4194304", connection_retries: int=3, description: string="", encoding: string="16842754", endpoint: string="", env_auth: "false" | "true"=false, secret_access_key: string="", upload_concurrency: int=1, upload_cutoff: string="209715200", zone: "pek3a" | "sh1a" | "gd2a"="" }` — qingstor backend configuration
  - `access_key_id` — QingStor Access Key ID.  Leave blank for anonymous access or runtime credentials.
  - `chunk_size` — Chunk size to use for uploading.  When uploading files larger than upload_cutoff they will be uploaded as multipart uploads using this chunk size.  Note that "--qingstor-upload-concurrency" chunks of this size are buffered in memory per transfer.  If you are transferring large files over high-speed…
  - `connection_retries` — Number of connection retries.
  - `endpoint` — Enter an endpoint URL to connection QingStor API.  Leave blank will use the default value "https://qingstor.com:443".
  - `env_auth` — Get QingStor credentials from runtime.  Only applies if access_key_id and secret_access_key is blank.
  - `secret_access_key` — QingStor Secret Access Key (password).  Leave blank for anonymous access or runtime credentials.
  - `upload_concurrency` — Concurrency for multipart uploads.  This is the number of chunks of the same file that are uploaded concurrently.  NB if you set this to > 1 then the checksums of multipart uploads become corrupted (the uploads themselves are not corrupted though).  If you are uploading small numbers of large files…
  - `upload_cutoff` — Cutoff for switching to chunked upload.  Any files larger than this will be uploaded in chunks of chunk_size. The minimum is 0 and the maximum is 5 GiB.
  - `zone` — Zone to connect to.  Default is "pek3a".
- `POST /api/v1/backends/quatrix` body — `{ api_key*: string="", description: string="", effective_upload_time: string="4s", encoding: string="50438146", hard_delete: bool=false, host*: string="", maximal_summary_chunk_size: string="100000000", minimal_chunk_size: string="10000000", skip_project_folders: bool=false }` — quatrix backend configuration
  - `api_key` — API key for accessing Quatrix account
  - `effective_upload_time` — Wanted upload time for one chunk
  - `hard_delete` — Delete files permanently rather than putting them into the trash
  - `host` — Host name of Quatrix account
  - `maximal_summary_chunk_size` — The maximal summary for all chunks. It should not be less than 'transfers'*'minimal_chunk_size'
  - `minimal_chunk_size` — The minimal size for one chunk
  - `skip_project_folders` — Skip project folders in operations
- `POST /api/v1/backends/s3` body — `{ access_key_id: string="", acl: "default" | "private" | "public-read" | "public-read-write" | "authenticated-read" | "bucket-owner-read" | "bucket-owner-full-control"="", bucket_acl: "private" | "public-read" | "public-read-write" | "authenticated-read"="", chunk_size: string="5242880", copy_cutoff: string="4999610368", decompress: bool=false, description: string="", directory_bucket: bool=false, directory_markers: bool=false, disable_checksum: bool=false, disable_http2: bool=false, download_url: string="", encoding: string="50331650", endpoint*: "objects-us-east-1.dream.io" | "syd1.digitaloceanspaces.com" | "sfo3.digitaloceanspaces.com" | "fra1.digitaloceanspaces.com" | "nyc3.digitaloceanspaces.com" | "ams3.digitaloceanspaces.com" | "sgp1.digitaloceanspaces.com" | "localhost:8333" | …(35 values)="", env_auth: "false" | "true"=false, force_path_style: bool=true, leave_parts_on_error: bool=false, list_chunk: int=1000, list_url_encode: string, list_version: int=0, location_constraint: string="", max_upload_parts: int=10000, memory_pool_flush_time: int=60, memory_pool_use_mmap: bool=false, might_gzip: string, no_check_bucket: bool=false, no_head: bool=false, no_head_object: bool=false, no_system_metadata: bool=false, profile: string="", provider: "AWS" | "Alibaba" | "ArvanCloud" | "Ceph" | "ChinaMobile" | "Cloudflare" | "DigitalOcean" | "Dreamhost" | …(34 values)="", region: "" | "other-v2-signature"="", requester_pays: bool=false, sdk_log_mode: string="0", secret_access_key: string="", server_side_encryption: "" | "AES256" | "aws:kms"="", session_token: string="", shared_credentials_file: string="", sse_customer_algorithm: "" | "AES256"="", sse_customer_key: ""="", sse_customer_key_base64: ""="", sse_customer_key_md5: ""="", sse_kms_key_id: "" | "arn:aws:kms:us-east-1:*"="", storage_class: "STANDARD" | "LINE" | "GLACIER" | "DEEP_ARCHIVE"="", sts_endpoint: string="", upload_concurrency: int=4, upload_cutoff: string="209715200", use_accelerate_endpoint: bool=false, use_accept_encoding_gzip: string, use_already_exists: string, use_dual_stack: bool=false, use_multipart_etag: string, use_multipart_uploads: string, use_presigned_request: bool=false, use_unsigned_payload: string, v2_auth: bool=false, version_at: string="0001-01-01T00:00:00Z", version_deleted: bool=false, versions: bool=false }` — s3 backend configuration
  - _(59 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/seafile` body — `{ 2fa: bool=false, auth_token: string="", create_library: bool=false, description: string="", encoding: string="16850954", library: string="", library_key: string="", pass: string="", url*: "https://cloud.seafile.com/"="", user*: string="" }` — seafile backend configuration
  - `2fa` — Two-factor authentication ('true' if the account has 2FA enabled).
  - `auth_token` — Authentication token.
  - `create_library` — Should Hoody create a library if it doesn't exist.
  - `library` — Name of the library.  Leave blank to access all non-encrypted libraries.
  - `library_key` — Library password (for encrypted libraries only).  Leave blank if you pass it through the command line.
  - `url` — URL of seafile host to connect to.
  - `user` — User name (usually email address).
- `POST /api/v1/backends/sftp` body — `{ ask_password: bool=false, chunk_size: string="32768", ciphers: string, concurrency: int=64, connections: int=0, copy_is_hardlink: bool=false, description: string="", disable_concurrent_reads: bool=false, disable_concurrent_writes: bool=false, disable_hashcheck: bool=false, host*: string="", host_key_algorithms: string, idle_timeout: int=60, key_exchange: string, key_file: string="", key_file_pass: string="", key_pem: string="", key_use_agent: bool=false, known_hosts_file: "~/.ssh/known_hosts"="", macs: string, md5sum_command: string="", pass: string="", path_override: string="", port: int=22, pubkey: string="", pubkey_file: string="", server_command: string="", set_env: string, set_modtime: bool=true, sha1sum_command: string="", shell_type: "none" | "unix" | "powershell" | "cmd"="", skip_links: bool=false, socks_proxy: string="", ssh: string, subsystem: string="sftp", use_fstat: bool=false, use_insecure_cipher: "false" | "true"=false, user: string="user" }` — sftp backend configuration
  - _(38 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/sharefile` body — `{ auth_url: string="", chunk_size: string="67108864", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="57091982", endpoint: string="", root_folder_id: "" | "favorites" | "allshared" | "connectors" | "top"="", token: string="", token_url: string="", upload_cutoff: string="134217728" }` — sharefile backend configuration
  - `chunk_size` — Upload chunk size.  Must a power of 2 >= 256k.  Making this larger will improve performance, but note that each chunk is buffered in memory one per transfer.  Reducing this will reduce memory usage but decrease performance.
  - `endpoint` — Endpoint for API calls.  This is usually auto discovered as part of the oauth process, but can be set manually to something like: https://XXX.sharefile.com
  - `root_folder_id` — ID of the root folder.  Leave blank to access "Personal Folders". You can use one of the standard values here or any folder ID (long hex number ID).
  - `upload_cutoff` — Cutoff for switching to multipart upload.
- `POST /api/v1/backends/sia` body — `{ api_password: string="", api_url: string="http://127.0.0.1:9980", description: string="", encoding: string="50436354", user_agent: string="Sia-Agent" }` — sia backend configuration
  - `api_password` — Sia Daemon API Password.  Can be found in the apipassword file located in HOME/.sia/ or in the daemon directory.
  - `api_url` — Sia daemon API URL, like http://sia.daemon.host:9980.  Note that siad must run with --disable-api-security to open API port for other hosts (not recommended). Keep default if Sia daemon runs on localhost.
  - `user_agent` — Siad User Agent  Sia daemon requires the 'Sia-Agent' user agent by default for security
- `POST /api/v1/backends/smb` body — `{ case_insensitive: bool=true, description: string="", domain: string="WORKGROUP", encoding: string="56698766", hide_special_share: bool=true, host*: string="", idle_timeout: int=60, pass: string="", port: int=445, spn: string="", user: string="user" }` — smb backend configuration
  - `case_insensitive` — Whether the server is configured to be case-insensitive.  Always true on Windows shares.
  - `domain` — Domain name for NTLM authentication.
  - `hide_special_share` — Hide special shares (e.g. print$) which users aren't supposed to access.
  - `host` — SMB server hostname to connect to.  E.g. "example.com".
  - `pass` — SMB password.
  - `port` — SMB port number.
  - `spn` — Service principal name.  Hoody-VFS presents this name to the server. Some servers use this as further authentication, and it often needs to be set for clusters. For example:   cifs/remotehost:1020  Leave blank if not sure.
  - `user` — SMB username.
- `POST /api/v1/backends/storj` body — `{ access_grant: string="", api_key: string="", description: string="", passphrase: string="", provider: "existing" | "new"="existing", satellite_address: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io"="us1.storj.io" }` — storj backend configuration
  - `access_grant` — Access grant.
  - `api_key` — API key.
  - `passphrase` — Encryption passphrase.  To access existing objects enter passphrase used for uploading.
  - `provider` — Choose an authentication method.
  - `satellite_address` — Satellite address.  Custom satellite address should match the format: `<nodeid>@<address>:<port>`.
- `POST /api/v1/backends/sugarsync` body — `{ access_key_id: string="", app_id: string="", authorization: string="", authorization_expiry: string="", deleted_id: string="", description: string="", encoding: string="50397186", hard_delete: bool=false, private_access_key: string="", refresh_token: string="", root_id: string="", user: string="" }` — sugarsync backend configuration
  - `access_key_id` — Sugarsync Access Key ID.  Leave blank to use Hoody's.
  - `app_id` — Sugarsync App ID.  Leave blank to use Hoody's.
  - `authorization` — Sugarsync authorization.  Leave blank normally, will be auto configured by Hoody.
  - `authorization_expiry` — Sugarsync authorization expiry.  Leave blank normally, will be auto configured by Hoody.
  - `deleted_id` — Sugarsync deleted folder id.  Leave blank normally, will be auto configured by Hoody.
  - `hard_delete` — Permanently delete files if true otherwise put them in the deleted files.
  - `private_access_key` — Sugarsync Private Access Key.  Leave blank to use Hoody's.
  - `refresh_token` — Sugarsync refresh token.  Leave blank normally, will be auto configured by Hoody.
  - `root_id` — Sugarsync root id.  Leave blank normally, will be auto configured by Hoody.
  - `user` — Sugarsync user.  Leave blank normally, will be auto configured by Hoody.
- `POST /api/v1/backends/swift` body — `{ application_credential_id: string="", application_credential_name: string="", application_credential_secret: string="", auth: "https://auth.api.rackspacecloud.com/v1.0" | "https://lon.auth.api.rackspacecloud.com/v1.0" | "https://identity.api.rackspacecloud.com/v2.0" | "https://auth.storage.memset.com/v1.0" | "https://auth.storage.memset.com/v2.0" | "https://auth.cloud.ovh.net/v3" | "https://authenticate.ain.net"="", auth_token: string="", auth_version: int=0, chunk_size: string="5368709120", description: string="", domain: string="", encoding: string="16777218", endpoint_type: "public" | "internal" | "admin"="public", env_auth: "false" | "true"=false, fetch_until_empty_page: bool=false, key: string="", leave_parts_on_error: bool=false, no_chunk: bool=false, no_large_objects: bool=false, partial_page_fetch_threshold: int=0, region: string="", storage_policy: "" | "pcs" | "pca"="", storage_url: string="", tenant: string="", tenant_domain: string="", tenant_id: string="", use_segments_container: string, user: string="", user_id: string="" }` — swift backend configuration
  - _(27 fields carry longer docs — fetch `GET /openapi.json` on this service for full field semantics)_
- `POST /api/v1/backends/tardigrade` body — `{ access_grant: string="", api_key: string="", description: string="", passphrase: string="", provider: "existing" | "new"="existing", satellite_address: "us1.storj.io" | "eu1.storj.io" | "ap1.storj.io"="us1.storj.io" }` — tardigrade backend configuration
- `POST /api/v1/backends/ulozto` body — `{ app_token: string="", description: string="", encoding: string="50438146", list_page_size: int=500, password: string="", root_folder_slug: string="", username: string="" }` — ulozto backend configuration
  - `app_token` — The application token identifying the app. An app API key can be either found in the API doc https://uloz.to/upload-resumable-api-beta or obtained from customer service.
  - `list_page_size` — The size of a single page for list commands. 1-500
  - `password` — The password for the user.
  - `root_folder_slug` — If set, Hoody will use this folder as the root folder for all operations. For example, if the slug identifies 'foo/bar/', 'ulozto:baz' is equivalent to 'ulozto:foo/bar/baz' without any root slug set.
  - `username` — The username of the principal to operate as.
- `POST /api/v1/backends/union` body — `{ action_policy: string="epall", cache_time: int=120, create_policy: string="epmfs", description: string="", min_free_space: string="1073741824", search_policy: string="ff", upstreams*: string="" }` — union backend configuration
  - `action_policy` — Policy to choose upstream on ACTION category.
  - `cache_time` — Cache time of usage and free space (in seconds).  This option is only useful when a path preserving policy is used.
  - `create_policy` — Policy to choose upstream on CREATE category.
  - `min_free_space` — Minimum viable free space for lfs/eplfs policies.  If a remote has less than this much free space then it won't be considered for use in lfs or eplfs policies.
  - `search_policy` — Policy to choose upstream on SEARCH category.
  - `upstreams` — List of space separated upstreams.  Can be 'upstreama:test/dir upstreamb:', '"upstreama:test/space:ro dir" upstreamb:', etc.
- `POST /api/v1/backends/uptobox` body — `{ access_token: string="", description: string="", encoding: string="50561070", private: bool=false }` — uptobox backend configuration
  - `access_token` — Your access token.  Get it from https://uptobox.com/my_account.
  - `private` — Set to make uploaded files private
- `POST /api/v1/backends/webdav` body — `{ auth_redirect: bool=false, bearer_token: string="", bearer_token_command: string="", description: string="", encoding: string="", headers: string, nextcloud_chunk_size: string="10485760", owncloud_exclude_mounts: bool=false, owncloud_exclude_shares: bool=false, pacer_min_sleep: int=0, pass: string="", unix_socket: string="", url*: string="", user: string="", vendor: "fastmail" | "nextcloud" | "owncloud" | "sharepoint" | "sharepoint-ntlm" | "hoody-vfs" | "other"="" }` — webdav backend configuration
  - `auth_redirect` — Preserve authentication on redirect.  If the server redirects Hoody to a new domain when it is trying to read a file then normally Hoody will drop the Authorization: header from the request.  This is standard security practice to avoid sending your credentials to an unknown webserver.  However this…
  - `bearer_token` — Bearer token instead of user/pass (e.g. a Macaroon).
  - `bearer_token_command` — Command to run to get a bearer token.
  - `encoding` — The encoding for the backend.  See the [encoding section in the overview](/overview/#encoding) for more info.  Default encoding is Slash,LtGt,DoubleQuote,Colon,Question,Asterisk,Pipe,Hash,Percent,BackSlash,Del,Ctl,LeftSpace,LeftTilde,RightSpace,RightPeriod,InvalidUtf8 for sharepoint-ntlm or identit…
  - `headers` — Set HTTP headers for all transactions.  Use this to set additional HTTP headers for all transactions  The input format is comma separated list of key,value pairs. Standard [CSV encoding](https://godoc.org/encoding/csv) may be used.  For example, to set a Cookie use 'Cookie,name=value', or '"Cookie"…
  - `nextcloud_chunk_size` — Nextcloud upload chunk size.  We recommend configuring your NextCloud instance to increase the max chunk size to 1 GB for better upload performances. See https://docs.nextcloud.com/server/latest/admin_manual/configuration_files/big_file_upload_configuration.html#adjust-chunk-size-on-nextcloud-side…
  - `owncloud_exclude_mounts` — Exclude ownCloud mounted storages
  - `owncloud_exclude_shares` — Exclude ownCloud shares
  - `pacer_min_sleep` — Minimum time to sleep between API calls. (in seconds)
  - `unix_socket` — Path to a unix domain socket to dial to, instead of opening a TCP connection directly
  - `url` — URL of http host to connect to.  E.g. https://example.com.
  - `user` — User name.  In case NTLM authentication is used, the username should be in the format 'Domain\User'.
  - `vendor` — Name of the WebDAV site/service/software you are using.
- `POST /api/v1/backends/yandex` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="50429954", hard_delete: bool=false, spoof_ua: bool=true, token: string="", token_url: string="" }` — yandex backend configuration
  - `spoof_ua` — Set the user agent to match an official version of the yandex disk client. May help with upload performance.
- `POST /api/v1/backends/zoho` body — `{ auth_url: string="", client_credentials: bool=false, client_id: string="", client_secret: string="", description: string="", encoding: string="16875520", region: "com" | "eu" | "in" | "jp" | "com.cn" | "com.au"="", token: string="", token_url: string="", upload_cutoff: string="10485760" }` — zoho backend configuration
  - `region` — Zoho region to connect to.  You'll have to use the region your organization is registered in. If not sure use the same top level domain as you connect to in your browser.
  - `upload_cutoff` — Cutoff for switching to large file upload api (>= 10 MiB).
- `PUT /api/v1/backends/{id}` body — `{ [key: string]: string|null }` — Credential fields to update. Allowed keys: pass, password, key, passphrase, token, refresh_token, auth_token, bearer_token, session_token, secret, secret_key, secret_access_key, access_key_id, client_secret, client_id, service_account_credentials, private_key. Values must be strings or null (null d…

### `directories` (1) — Directory operations - create, list, download as ZIP

| Method | Summary | Params |
|--------|---------|--------|
| `MKCOL /{path}` | Create directory |  |

### `downloads` (4) — Downloads

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{directory}?download` | Download file from remote URL | `?download*` `?filename` `?timeout` |
| `GET /?download_history` | Download history | `?download_history*` |
| `GET /{directory}?downloads` | List active downloads | `?downloads*` |
| `GET /api/v1/downloads` | List active downloads |  |

**Param notes:**

- `directory` — Destination directory
- `download` — URL to download from
- `filename` — Custom filename for downloaded file
- `timeout` — Download timeout in seconds

### `files` (21) — File operations - upload, download, delete, list files

| Method | Summary | Params |
|--------|---------|--------|
| `PUT /api/v1/files/append/{path}` | Append data to file | `?owner` |
| `PATCH /api/v1/files/chmod/{path}` | Change file permissions | `?chmod*` |
| `PATCH /api/v1/files/chown/{path}` | Change file ownership | `?chown*` |
| `POST /api/v1/files/copy/{path}` | Copy file or directory | `?copy_to*` `?overwrite` `?owner` |
| `DELETE /api/v1/files/{path}` | Delete file or directory | `?backend` |
| `DELETE /{path}` | Delete file or directory |  |
| `GET /api/v1/files/{path}` | List directory or download file | `?backend` `?hash` `?sha256` `?base64` `?preview` `?contents` `?stat` `?thumbnail` `?grep` `?ignore_case` `?fixed_string` `?glob` `?context` `?max_count` `?max_matches` `?max_depth` `?max_filesize` `?timeout` `?no_ignore` `?max_results` `?max_files_scanned` `?sort` `?order` `?lines` `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` `?zip` |
| `HEAD /{path}` | Get file metadata | `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` |
| `GET /api/v1/files/glob/{path}` | Find files by glob pattern | `?pattern*` `?max_results` `?max_depth` `?max_files_scanned` `?timeout` `?no_ignore` `?sort` `?order` |
| `GET /api/v1/files/grep/{path}` | Search file contents (grep) | `?pattern*` `?ignore_case` `?fixed_string` `?glob` `?context` `?max_count` `?max_matches` `?max_depth` `?max_filesize` `?timeout` `?no_ignore` |
| `GET /{path}` | List directory contents or download file | `?json` `?simple` `?sort` `?order` `?hash` `?sha256` `?base64` `?edit` `?view` `?download` `?content-type` `?history` `?at` `?revision` `?diff` `?from_seq` `?from_ts` `?to_seq` `?to_ts` `?after_id` `?limit` |
| `POST /api/v1/files/move/{path}` | Move file or directory | `?move_to*` `?owner` |
| `POST /api/v1/files/{path}` | File operations (mkdir, extract, download, move, copy) | `?backend` `?mkdir` `?extract` `?dest` `?download_from` `?move_to` `?copy_to` `?overwrite` `?owner` |
| `PATCH /{path}` | File operations | `H:X-Update-Range` `body` |
| `PATCH /api/v1/files/{path}` | Modify file properties or move/rename | `?backend` `?owner` `?chmod` `?chown` `body` |
| `PUT /api/v1/files/{path}` | Upload or append file | `?backend` `?append` `?owner` |
| `GET /api/v1/files/realpath/{path}` | Resolve canonical path (realpath) |  |
| `GET /{directory}?q` | Search directory | `?q*` `?json` |
| `GET /api/v1/files/stat/{path}` | Get file metadata (stat) |  |
| `PUT /{path}?touch` | Touch file (create or update mtime) | `?touch*` |
| `PUT /{path}` | Upload file |  |

**Param notes:**

- `path` — File path
- `owner` — Create-time owner (user[:group]/uid[:gid]) when this append creates a new file. Requires --allow-chown + allowlist; refuses root. Absent → server default.
- `path` — File or directory path
- `chmod` — Octal permission mode (e.g., 755, 644, 0755)
- `chown` — Owner and optional group (e.g., user:group, user,:group, or UID:GID)
- `path` — Source file or directory path
- `copy_to` — Destination path to copy the file/directory to
- `overwrite` — Allow overwriting existing destination (default: false)
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created copies. Requires --allow-chown + allowlist; refuses root. Overwritten existing files preserve their owner. Absent → server default.
- `backend` — Backend ID for remote file deletion
- `path` — Path to file or directory to delete
- `backend` — Backend ID for remote file access
- `hash` — Get SHA256 hash of file
- `sha256` — Get SHA256 hash of file (alias for hash)
- `base64` — Get file content as base64
- `preview` — Preview archive contents (for zip/tar files). Alias: ?contents
- `contents` — Alias for ?preview - list archive contents
- `stat` — Get file/directory metadata (stat) without downloading content
- `thumbnail` — Return a processed image (resize, format convert, blur, grayscale). Requires the service to be started with --allow-thumbnails; returns 403 when disabled.
- `grep` — Search file/directory contents for regex pattern (or literal if fixed_string=true). Requires --allow-grep.
- `ignore_case` — Case-insensitive grep matching
- `fixed_string` — Treat grep pattern as literal string, not regex
- `glob` — Find files matching glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}'). Requires --allow-search. Directory paths only.
- `context` — Number of context lines before/after each grep match
- `max_count` — Max matches per file for grep
- `max_matches` — Total max matches across all files for grep
- `max_depth` — Directory recursion depth for grep
- `max_filesize` — Skip files larger than this (bytes) during grep
- `timeout` — Grep timeout in seconds
- `no_ignore` — Bypass.gitignore filtering during grep
- `max_results` — Max entries returned for glob search
- `max_files_scanned` — Max filesystem entries scanned during glob search
- `sort` — Sort glob results by: mtime (default), name, or size
- `order` — Sort order for glob results. Default: desc for mtime, asc for name/size
- `lines` — Extract specific lines from a file. Formats: '10-50' (range, 1-indexed inclusive), '100' (single line), '-20' (last 20 lines / tail), '50-' (line 50 to end). Returns text/plain with X-Line-Range header. X-Total-Lines header included when naturally known (scan reached EOF). Max 100,000 lines or 64MB per request.
- `history` — List all revisions of a file. Returns JSON with revisions array, pagination via after_id. Mutually exclusive with at/revision/diff.
- `at` — Read file content at a point in time. Accepts RFC3339 timestamp or Unix milliseconds. Mutually exclusive with history/revision/diff. Composable with ?lines, ?hash, ?base64.
- `revision` — Read file content by stable per-path sequence number. Mutually exclusive with history/at/diff. Composable with ?lines, ?hash, ?base64.
- `diff` — Compute unified diff between two versions. Requires from_seq or from_ts. Optional to_seq or to_ts (defaults to current file). Mutually exclusive with history/at/revision.
- `from_seq` — Source revision seq number for ?diff. Mutually exclusive with from_ts.
- `from_ts` — Source timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with from_seq.
- `to_seq` — Target revision seq number for ?diff. Mutually exclusive with to_ts. Default: current file on disk.
- `to_ts` — Target timestamp for ?diff (RFC3339 or Unix ms). Mutually exclusive with to_seq.
- `after_id` — Cursor for ?history pagination. Returns entries with id > after_id.
- `limit` — Max entries to return for ?history.
- `zip` — Download a directory as a streaming zip archive (bare flag, e.g. ?zip). Local directories only; requires --allow-archive. Same behavior as the WebDAV-style /{directory}?zip.
- `path` — Directory path to search within
- `pattern` — Glob pattern (e.g. '**/*.rs', 'src/**/*.{ts,tsx}', '*.md')
- `max_results` — Maximum entries to return
- `max_depth` — Maximum directory recursion depth
- `max_files_scanned` — Maximum filesystem entries to scan
- `timeout` — Search timeout in seconds
- `no_ignore` — Bypass.gitignore filtering
- `sort` — Sort results by: mtime (modification time), name, or size
- `order` — Sort order. Default: desc for mtime, asc for name/size
- `path` — File or directory path to search
- `pattern` — Search pattern (regex by default, literal if fixed_string=true)
- `ignore_case` — Case-insensitive matching
- `fixed_string` — Treat pattern as literal string, not regex
- `glob` — Filter files by glob pattern (e.g. '*.rs', '*.{ts,tsx}')
- `context` — Number of context lines before and after each match
- `max_count` — Maximum matches per file
- `max_matches` — Total maximum matches across all files
- `max_filesize` — Skip files larger than this (bytes)
- `json` — Return JSON format instead of HTML
- `simple` — Return simple text listing
- `sort` — Sort by field
- `order` — Sort order
- `hash` — Get SHA256 hash of file (returns plain text hash)
- `base64` — Get file content as base64 encoded string
- `edit` — Open file in Web UI editor (requires allow-upload permission)
- `view` — View file in Web UI (read-only mode)
- `download` — For file paths only: force browser download (Content-Disposition: attachment). Accepted values: empty (?download), 1, or true. For directory paths, ?download is the URL download-manager operation.
- `content-type` — Override Content-Type header for file downloads
- `move_to` — Destination path to move the file/directory to
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created destination PARENT directories. Requires --allow-chown + --allowed-create-owners; refuses root. The moved inode itself preserves its existing owner. Absent → server default.
- `mkdir` — Create directory
- `extract` — Extract archive. Empty value extracts all; non-empty value is a selective path to extract (e.g. "src/" or "lib/")
- `dest` — Destination directory name for extraction (default: archive name without extension)
- `download_from` — Download file from remote URL
- `move_to` — Move file/directory to destination path
- `copy_to` — Copy file/directory to destination path
- `overwrite` — Allow overwriting existing destination (for copy)
- `owner` — Create-time owner for newly-created inodes as user[:group] or uid[:gid]. Requires --allow-chown and must resolve to an entry in --allowed-create-owners; refuses root (uid/gid 0). Absent → the server default create owner. Applies to mkdir/extract/download_from/copy_to.
- `X-Update-Range` — Set to 'append' to append data to the end of the file. Perfect for logs and incremental writes. Example: curl -X PATCH -H 'X-Update-Range: append' --data-binary @data.txt http://server/file.log
- `backend` — Backend ID for remote file operations
- `owner` — Create-time owner (user[:group]/uid[:gid]) for newly-created destination parent directories on a JSON-body move_to. Requires --allow-chown + --allowed-create-owners; cannot be root. The moved item keeps its own owner. Absent → server default.
- `chmod` — Set file permissions using octal mode value (e.g., ?chmod=755)
- `chown` — Set file ownership (e.g., ?chown=user:group or ?chown=user)
- `backend` — Backend ID for remote upload
- `append` — Append body to end of existing file (create if missing) instead of overwriting
- `owner` — Create-time owner (user[:group]/uid[:gid]) for a newly-created file. Requires --allow-chown + --allowed-create-owners; refuses root. Overwrites/appends to an existing file preserve its owner. Absent → server default.
- `path` — File or directory path to resolve
- `q` — Search query (case-insensitive filename match). Maximum 512 BYTES of UTF-8 after form/percent decoding, measured both before and after Unicode lowercasing — lowercasing can change a string's byte length in either direction. Longer queries are rejected with 400; they are not truncated. Note this is a byte limit, not a character limit, so it is deliberately not expressed as `maxLength`.
- `path` — File path to touch
- `touch` — Flag to indicate touch operation
- `path` — Destination file path

**Body shapes:**

- `PATCH /{path}` body — `files_ChmodRequest | files_ChownRequest | files_RenameRequest`
- `PATCH /api/v1/files/{path}` body — `files_MoveRequest | files_RenameRequest`

### `ftp` (1) — WebDAV-compatible API for FTP/FTPS

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=ftp` | Access file via FTP | `?type*` `?server*` `?user` `?pass` `?ftp_secure` `?ftp_passive` |

**Param notes:**

- `ftp_secure` — Use FTPS (FTP over TLS)
- `ftp_passive` — Use passive mode

### `git` (1) — WebDAV-compatible API for Git repositories

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=git` | Fetch file from Git repository | `?type*` `?url*` `?ref` `?pass` |

**Param notes:**

- `url` — Full GitHub/GitLab/Bitbucket URL or repository URL
- `ref` — Branch, tag, or commit (defaults to HEAD or extracted from URL)
- `pass` — Personal Access Token (base64 encoded) for private repos

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/files/health` | Service health check |  |

### `images` (1) — On-the-fly image conversion, resizing, and effects with format conversion (JPEG/PNG/WebP/GIF/BMP), multiple resize modes, quality control, blur, grayscale, and two-tier caching (memory + disk)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{image}?thumbnail` | Process and convert images | `?thumbnail*` `?format` `?size` `?width` `?height` `?resize` `?quality` `?q` `?blur` `?grayscale` `?bg` |

**Param notes:**

- `image` — Path to image file
- `thumbnail` — Enable image processing
- `format` — Output format (default: jpeg)
- `size` — Width×Height in pixels (max: 2000×2000)
- `width` — Width in pixels (height auto-calculated)
- `height` — Height in pixels (width auto-calculated)
- `resize` — Resize mode: fit (preserve aspect, fit within), fill (exact size, crop), cover (cover area), exact (force dimensions)
- `quality` — Resize algorithm quality: low (box filter), medium (bilinear), high (Lanczos3)
- `q` — JPEG/WebP quality (1-100, higher is better quality)
- `blur` — Gaussian blur radius (0-50)
- `grayscale` — Convert to grayscale/black-and-white
- `bg` — Background color for transparency (hex RGB, e.g., 'ffffff' for white)

### `journal` (3) — Journal

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/journal/flush` | Flush journal to disk |  |
| `GET /api/v1/journal/stats` | Get journal statistics |  |
| `GET /api/v1/journal` | Query journal entries | `?path` `?op` `?since` `?limit` `?after_id` |

**Param notes:**

- `path` — Filter entries by path prefix
- `op` — Filter by operation type(s), comma-separated (e.g. 'write,delete')
- `since` — Filter entries since timestamp (RFC3339 or Unix ms)
- `limit` — Max entries to return
- `after_id` — Cursor: return entries with id > after_id

### `mounts` (5) — Mount management - create, list, and remove FUSE filesystem mounts for remote backends

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/mounts` | Create persistent FUSE mount | `body*` |
| `GET /api/v1/mounts/{id}` | Get mount details |  |
| `GET /api/v1/mounts` | List all mounts | `?label` |
| `DELETE /api/v1/mounts/{id}` | Unmount filesystem |  |
| `PATCH /api/v1/mounts/{id}` | Update mount VFS configuration | `body*` |

**Param notes:**

- `label` — Filter mounts by label. Only mounts with this exact label will be returned.

**Body shapes:**

- `POST /api/v1/mounts` body — `{ backend_id*: string, label: string, mount_path: string, vfs_config: { cache_max_age: int | string=3600, cache_max_size: int | string=10737418240, cache_mode: "off" | "minimal" | "writes" | "full"="writes", dir_cache_time: int | string=300 } }`
  - `backend_id` — ID of an existing backend connection
  - `label` — Optional human-readable label for this mount (e.g., "My NAS", "Work S3", "Photos Backup"). Used by the UI to identify mounts. Can be used to filter mounts via GET /api/v1/mounts?label=...
  - `mount_path` — Path for the mount. If omitted, defaults to /hoody/mounts/mount_{uuid}. Relative paths are resolved under the server's mount directory (/hoody/mounts/ by default).
  - `vfs_config` — VFS configuration for performance tuning (optional)
- `PATCH /api/v1/mounts/{id}` body — `{ vfs_config*: object }`
  - `vfs_config` — VFS configuration parameters

### `s3` (1) — WebDAV-compatible API for S3 storage

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=s3` | Access file from S3 | `?type*` `?server*` `?s3_bucket*` `?s3_region*` `?user` `?pass` `?s3_endpoint` |

**Param notes:**

- `s3_bucket` — S3 bucket name
- `user` — AWS Access Key ID
- `pass` — AWS Secret Key (base64 encoded)
- `s3_endpoint` — Custom S3 endpoint for MinIO, etc.

### `ssh` (2) — WebDAV-compatible API for SSH/SFTP

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=ssh` | Access file via SSH/SFTP | `?type*` `?server*` `?user*` `?pass` `?key` `?passphrase` |
| `PUT /{path}?type=ssh` | Upload file via SSH/SFTP | `?server*` `?user*` `?pass` `?key` `?passphrase` |

**Param notes:**

- `server` — Server hostname:port
- `user` — SSH username
- `pass` — Password (base64 encoded)
- `key` — Private key PEM (base64 encoded)
- `passphrase` — Key passphrase (base64 encoded)

### `system` (1) — System endpoints - health checks, version info, and status monitoring

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/version` | Get API version |  |

### `webdav` (8) — WebDAV protocol operations - PROPFIND, PROPPATCH, COPY, MOVE, LOCK, UNLOCK, OPTIONS

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}?type=webdav` | Access file via WebDAV | `?type*` `?server*` `?user` `?pass` `?webdav_path` |
| `COPY /{path}` | Copy file or directory | `H:Destination*` `H:Depth` |
| `OPTIONS /{path}` | Get allowed methods |  |
| `LOCK /{path}` | Lock file (WebDAV compatibility) | `H:Depth` |
| `MOVE /{path}` | Move or rename file/directory | `H:Destination*` |
| `PROPFIND /{path}` | Get WebDAV properties | `H:Depth` |
| `PROPPATCH /{path}` | Update WebDAV properties |  |
| `UNLOCK /{path}` | Unlock file (WebDAV compatibility) | `H:Lock-Token*` |

**Param notes:**

- `webdav_path` — WebDAV endpoint path
- `path` — Source file or directory path
- `Destination` — Destination URL for the copy
- `Depth` — Copy depth: 0 (file only) or infinity (recursive for directories)
- `Destination` — Destination URL for the move
- `Depth` — Depth of property retrieval: 0 (resource only), 1 (immediate children), infinity (recursive)
- `Lock-Token` — Lock token to release


### Body schemas

- `files_MoveRequest` — `{ move_to*: string }`
- `files_RenameRequest` — `{ name*: string }`
- `files_ChmodRequest` — `{ mode*: string }`
- `files_ChownRequest` — `{ group: string, owner: string }`

---

<!-- ===== namespace: notes ===== -->

# `notes` — Collaborative notebooks, hierarchical nodes, documents, databases

## Purpose

Per-container notebooks of hierarchical nodes (sections, pages, channels, messages, databases, records) with rich-text bodies, comments, reactions, versions, collaborators, TUS attachments, WS mutation feed.

## When to use

Section→page wikis; typed `database`/`record` nodes; comments/reactions/versions/collaborators; TUS attachments; WS-driven UI.

## When NOT to use

SQL/KV → `sqlite`, container fs → `files`, desktop notifs → `notifications`, cross-container identity → `api`, scheduled writes → `cron`.

## Prerequisites

- `notebookId` per call; first `GET /api/v1/notes/me` auto-provisions notebook+user from `?username=` (default `user`).
- HTTP/raw fetch supports `X-Idempotency-Key` for retry-safe creates. **Most generated SDK service methods do NOT expose per-call request headers** (`requestOptions` has no `headers` field), so idempotency-keyed retries on those must use raw `fetch()` against the kit URL. **The exception is `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`, which accepts the key as `options.XIdempotencyKey`** — so the recommended document-writing path is fully retry-safe from the SDK. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` resolve access via `getNodeAccess` and reject viewers/read-only collaborators with `403`. Documents attach only to `page` and `record` nodes (the node types that declare a `documentSchema`); `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `GET /api/v1/notes/notebooks/{notebookId}/nodes` `type:"section"` → pick `Home` → `POST /api/v1/notes/notebooks/{notebookId}/nodes` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`. Creates the document if absent; pass `X-Idempotency-Key` (SDK `options.XIdempotencyKey`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `GET /api/v1/notes/me` → `{userId,username,role,notebookId}` (auto-provisions a notebook + `Home` section + starter pages). `GET /api/v1/notes/notebooks`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` OVERWRITES the whole document; `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` shallow-merges at the TOP level only (submitting `content.blocks` REPLACES the entire blocks map — it does NOT merge per-block). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real `EditorNodeTypes` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 3.
4. **Database CRUD** — `POST /api/v1/notes/notebooks/{notebookId}/nodes` `type:"database"`; then `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`/`GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records`/`GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search`/`PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` (merges `fields`)/`DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}`. Page with `page`/`count` on `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` (count max 100). ⚠ SDK-only: the auto-pagination helpers (listIterator / listAll) are misconfigured upstream — they send `limit`/`offset` while the route accepts `page`/`count`; prefer manual paged list loops.
5. **Comments + versions** — `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` (`admin`/`editor`/`collaborator`/`viewer`). `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` (top-level, anchored, or reply); `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`/`delete`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` accept optional `expectedVersion` for optimistic concurrency. `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions`/`list`/`get`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore`.
6. **TUS upload + download** — `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` for `fileId`; `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `PATCH`+`Upload-Offset`; `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `HEAD` returns resume offset; `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` cancels. `GET /api/v1/notes/notebooks/{notebookId}/files`, `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}`.

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — wrong values store silently but render blank.** Valid block types are the `EditorNodeTypes` values: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. The block schema is loose (`type:z.string()`, `attrs:z.record`), so a bad `type`/`props` is accepted with `200` and stored — the CRDT bridge validates with `safeParse` but writes the ORIGINAL object, persisting the junk key — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id; putting text directly on the container makes it render empty. See §Examples 0 and 3 for the exact nesting.
- **Prefer `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types without a `documentSchema` (only `page`/`record`) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **`POST /api/v1/notes/notebooks/{notebookId}/nodes` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — `YDoc.update()` throws on the attribute `safeParse` before the create transaction's try/catch (unknown type / missing parent → `400`; permission/`canCreate` → `403`). A page needs `attributes.name` + `parentId` and cannot be root-level; a manually-created `section` must include `attributes.collaborators` with the creator as `admin` and is root-only — easiest is to reuse the auto-provisioned `Home` section.
- `notebookAuthenticator` re-anchors identity to URL `notebookId`; one bearer reaches any notebook the username joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` route + WS feed: each mutation type (`document.update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document`/`PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` are last-writer-wins JSON overlays on top of the same store; two concurrent PATCHes will clobber each other unless drivers coordinate via the WS mutation feed.
- `identity.get?username=&role=` creates user+notebook and runs `initializeNotebookContent`. Priority Bearer → `ticket` → `?username=&role=`; invalid Bearer = 401 even with fallback. **Without any of the three, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=` on every unauthenticated call, or attach Bearer / `ticket`. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes only** — read endpoints still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409.
- `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` merges `fields`; access runs through `getNodeAccess(notebookId, databaseId, userId)`, which resolves your role from the `collaborations` row on the notebook **root** node, then walks the database's full ancestor chain and returns `403` if any ancestor is a private `section`, or a `channel` whose `attributes.collaborators` map omits you (notebook owner/admin bypasses the privacy walk). A root collaboration alone is therefore NOT sufficient. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.
- `documents.get?output=html` needs single-use export `ticket` on `GET .../document`. `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` overwrites; `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` top-level spreads the request body over current content — submitting `content.blocks` REPLACES the blocks map, it does not merge per-block. For per-block CRDT merging use the `POST /api/v1/notes/notebooks/{notebookId}/mutations` WS feed instead. `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}`/`delete`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` accept optional `expectedVersion`.
- `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` matches against record names AND field values (not just names).
- Text filter operators in `databases.list?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). SDK-only: the generated tusUploadChunk method takes no chunk-body or Upload-Offset parameter, so drop to raw `@tus/client`/`fetch` for the actual byte transfer.

## Common errors

- `400 bad_request` validation (`details[]`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (db needs `collaborations` or `canCreate`).
- `404 not_found` — node/file/comment/version missing or `notebook_id` mismatch. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Every step in every example was live-tested against a real `notes-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first; bootstrap identity once with `GET /api/v1/notes/me?username=...&role=owner` to auto-provision `notebookId`.

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body.** A document is
`{ "content": { "type": "rich_text", "blocks": { "<blockId>": <block> } } }`. Each
block is `{ id, type, parentId, index, content?, attrs? }`:

- `type` is one of the real `EditorNodeTypes` strings. There is **no** `code`,
  `bullet_list_item`, `quote`, or `numbered_list_item`. Block attributes live under
  `attrs` (**never** `props`).
- **Leaf blocks** carry text directly in `content`: `paragraph`, `heading1`,
  `heading2`, `heading3`, `codeBlock` (language in `attrs.language`). `horizontalRule`
  is a leaf with no text/content.
- **Container blocks carry NO direct text** — each holds a child `paragraph`:
  `bulletList`/`orderedList` → `listItem` → `paragraph`; `taskList` → `taskItem`
  (`attrs.checked`) → `paragraph`; `blockquote` → `paragraph`; `table` → `tableRow` →
  `tableHeader`/`tableCell` → `paragraph`. The child's `parentId` is the container's id.
- `index` is a lexicographic ordering string per sibling group (server uses
  fractional indexing). For a brand-new document, monotonically increasing strings
  (`a0`,`a1`,`a2`,…) sort correctly. To INSERT between two existing blocks you need a
  key that sorts strictly between them — another reason to prefer append.
- Inline `content` leaves are `{ "type":"text", "text":"…", "marks?":[…] }`. Marks:
  `bold`, `italic`, `strike`, `underline`, `code` (no attrs); `link`
  (`attrs:{href,target,rel}`); `color` (`attrs:{color}`); `highlight`
  (`attrs:{highlight}`); `comment` (`attrs:{commentId}`). `mention` is an inline NODE
  (`{type:'mention',attrs:{id,target}}`), not a mark; `hardBreak`
  (`{type:'hardBreak'}`) forces a line break inside a paragraph.

Leaf blocks (text/code carry `content` directly):

```json
{ "h":  {"id":"h","type":"heading1","parentId":"PAGE","index":"a0","content":[{"type":"text","text":"Runbook"}]},
  "p":  {"id":"p","type":"paragraph","parentId":"PAGE","index":"a1","content":[{"type":"text","text":"Intro with ","marks":[]},{"type":"text","text":"bold","marks":[{"type":"bold"}]}]},
  "c":  {"id":"c","type":"codeBlock","parentId":"PAGE","index":"a2","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "hr": {"id":"hr","type":"horizontalRule","parentId":"PAGE","index":"a3"} }
```

Bulleted list — `bulletList → listItem → paragraph` (use `orderedList` for numbered):

```json
{ "bl":  {"id":"bl","type":"bulletList","parentId":"PAGE","index":"a0"},
  "li1": {"id":"li1","type":"listItem","parentId":"bl","index":"a0"},
  "li1p":{"id":"li1p","type":"paragraph","parentId":"li1","index":"a0","content":[{"type":"text","text":"First item"}]},
  "li2": {"id":"li2","type":"listItem","parentId":"bl","index":"a1"},
  "li2p":{"id":"li2p","type":"paragraph","parentId":"li2","index":"a0","content":[{"type":"text","text":"Second item"}]} }
```

Task list (`attrs.checked` on the item) and blockquote:

```json
{ "tl":  {"id":"tl","type":"taskList","parentId":"PAGE","index":"a0"},
  "ti1": {"id":"ti1","type":"taskItem","parentId":"tl","index":"a0","attrs":{"checked":false}},
  "ti1p":{"id":"ti1p","type":"paragraph","parentId":"ti1","index":"a0","content":[{"type":"text","text":"Open task"}]},
  "bq":  {"id":"bq","type":"blockquote","parentId":"PAGE","index":"a1"},
  "bqp": {"id":"bqp","type":"paragraph","parentId":"bq","index":"a0","content":[{"type":"text","text":"Quoted line"}]} }
```

Table — `table → tableRow → tableHeader/tableCell → paragraph`:

```json
{ "tbl": {"id":"tbl","type":"table","parentId":"PAGE","index":"a0"},
  "r1":  {"id":"r1","type":"tableRow","parentId":"tbl","index":"a0"},
  "h1":  {"id":"h1","type":"tableHeader","parentId":"r1","index":"a0"},
  "h1p": {"id":"h1p","type":"paragraph","parentId":"h1","index":"a0","content":[{"type":"text","text":"Col A"}]},
  "r2":  {"id":"r2","type":"tableRow","parentId":"tbl","index":"a1"},
  "c1":  {"id":"c1","type":"tableCell","parentId":"r2","index":"a0"},
  "c1p": {"id":"c1p","type":"paragraph","parentId":"c1","index":"a0","content":[{"type":"text","text":"Val 1"}]} }
```

### 1. Bootstrap identity, create a page, and append the first content (recommended)

**Goal:** stand up a fresh notebook from scratch, attach a page under the auto-created Home section, give it a one-block document.

**Step 1 — bootstrap identity & create notebook.** First call to `GET /api/v1/notes/me` with `?username=&role=` auto-provisions a default notebook + Home section + Welcome page; pass it once per `username`. Then `POST /api/v1/notes/notebooks` for a second, named one.

```bash
KIT="https://${P}-${C}-notes-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/notes/me?username=alex&role=owner" | jq .   # one-time auto-provision
NBID=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks" \
  -H 'Content-Type: application/json' \
  -d '{"name":"team-wiki","description":"engineering docs"}' | jq -r .id)
echo "NBID=$NBID"
```
**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `POST /api/v1/notes/notebooks/{notebookId}/nodes` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes?limit=100" \
  | jq -r '.nodes[] | select(.type=="section") | .id' | head -1)
PAGE=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"page\",\"parentId\":\"$SEC\",\"attributes\":{\"name\":\"Runbook\"}}" \
  | jq -r .id)
```
**Step 3 — append the first content (recommended).** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only; containers (lists/tables) need `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` (Example 3).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```bash
# one block from plain text
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' -H "X-Idempotency-Key: runbook-h1" \
  -d '{"type":"heading1","text":"Runbook"}'
# a batch of flat blocks (note codeBlock language goes in attrs)
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' \
  -d '{"blocks":[
        {"type":"paragraph","content":[{"type":"text","text":"Run the deploy script:"}]},
        {"type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]}
      ]}'
```
### 2. Build a structured document with `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`); a
wrong type/`props` is stored silently and renders blank. (2) `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` does
NOT merge by block id — it REPLACES the entire `blocks` map (live-verified). To add to
an existing doc, `GET` the current blocks, mutate locally, `PUT` the union back (or
just use `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`).

```bash
PAGE=...
B1=$(openssl rand -hex 12); B2=$(openssl rand -hex 12); B3=$(openssl rand -hex 12)
BL=$(openssl rand -hex 12); LI1=$(openssl rand -hex 12); LI1P=$(openssl rand -hex 12)
LI2=$(openssl rand -hex 12); LI2P=$(openssl rand -hex 12)
cat > /tmp/doc.json <<EOF
{"content":{"type":"rich_text","blocks":{
  "$B1":{"id":"$B1","parentId":"$PAGE","index":"a0","type":"heading1","content":[{"type":"text","text":"Deploy Steps"}]},
  "$B2":{"id":"$B2","parentId":"$PAGE","index":"a1","type":"paragraph","content":[{"type":"text","text":"Run the script below, then verify."}]},
  "$B3":{"id":"$B3","parentId":"$PAGE","index":"a2","type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "$BL":{"id":"$BL","parentId":"$PAGE","index":"a3","type":"bulletList"},
  "$LI1":{"id":"$LI1","parentId":"$BL","index":"a0","type":"listItem"},
  "$LI1P":{"id":"$LI1P","parentId":"$LI1","index":"a0","type":"paragraph","content":[{"type":"text","text":"Smoke-test /healthz"}]},
  "$LI2":{"id":"$LI2","parentId":"$BL","index":"a1","type":"listItem"},
  "$LI2P":{"id":"$LI2P","parentId":"$LI2","index":"a0","type":"paragraph","content":[{"type":"text","text":"Tag the release"}]}
}}}
EOF
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d @/tmp/doc.json
```
### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

```bash
DOC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document")
echo "$DOC" | jq '.content.blocks | to_entries | map({k:.key,t:.value.type,i:.value.index})'
```
**Step 2 — mutate locally + PUT back.** Set the target block's `index` to a key that sorts FIRST (e.g. prefix `Z` → swap to `9`, or use a fresh small string like `_a0`); rewrite its `content`.

```bash
NEW=$(echo "$DOC" | jq --arg t "Updated intro paragraph (now first)." '
  .content.blocks
  | to_entries
  | map(if .value.type=="paragraph" then .value.index="_a0" | .value.content=[{type:"text",text:$t}] else . end)
  | from_entries
  | {content:{type:"rich_text",blocks:.}}')
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d "$NEW"
```
### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```bash
DOC=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document")
NEW=$(echo "$DOC" | jq 'del(.content.blocks["'"$B3"'"]) | {content:{type:"rich_text",blocks:.content.blocks}}')
curl -sf -X PUT "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  -H 'Content-Type: application/json' -d "$NEW"
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document" \
  | jq '.content.blocks | to_entries | sort_by(.value.index) | map(.value.type)'
```
### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `POST /api/v1/notes/notebooks/{notebookId}/nodes` for `type:"database"` REQUIRES `attributes.fields` populated — without it the kit returns `500` (the attribute `safeParse` throws inside `YDoc.update` before the create transaction's try/catch — a `canCreate` failure would be a `403`). Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
DBID=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"database\",\"parentId\":\"$SEC\",\"attributes\":{
    \"name\":\"Tasks\",
    \"fields\":{
      \"f_status\":{\"id\":\"f_status\",\"type\":\"text\",\"name\":\"Status\",\"index\":\"a0\"},
      \"f_priority\":{\"id\":\"f_priority\",\"type\":\"number\",\"name\":\"Priority\",\"index\":\"a1\"},
      \"f_done\":{\"id\":\"f_done\",\"type\":\"boolean\",\"name\":\"Done\",\"index\":\"a2\"}
    }
  }}" | jq -r .id)

for i in 1 2 3; do
  curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records" \
    -H 'Content-Type: application/json' \
    -d "{\"name\":\"Task $i\",\"fields\":{
      \"f_status\":{\"type\":\"text\",\"value\":\"todo\"},
      \"f_priority\":{\"type\":\"number\",\"value\":$i},
      \"f_done\":{\"type\":\"boolean\",\"value\":false}
    }}" >/dev/null
done
```
### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. ⚠ `filters` MUST be a **JSON array** (not an object) of `{ id, type:"field", fieldId, operator, value }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array).

```bash
F='[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]'
S='[{"id":"s1","fieldId":"f_priority","direction":"desc"}]'
ENC_F=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$F")
ENC_S=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$S")
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?filters=$ENC_F&sorts=$ENC_S&count=50" \
  | jq '.records[] | {n:.name, p:.fields.f_priority.value}'
```
A simpler full-text alternative is `databases.search?q=...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` PATCH MERGES `fields` (live-verified: sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

```bash
RID=$(curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?count=50" \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
curl -sf -X PATCH "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records/$RID" \
  -H 'Content-Type: application/json' \
  -d '{"fields":{"f_status":{"type":"text","value":"done"},"f_done":{"type":"boolean","value":true}}}' \
  | jq '.fields'
```
### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). The **generated SDK service methods do not expose per-call headers**, so idempotency keys must be sent via raw `fetch()` (or `client.api.http.*` low-level if available).

```bash
cat > /tmp/tasks.csv <<EOF
name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress
EOF
tail -n +2 /tmp/tasks.csv | while IFS=, read -r name pri stat; do
  KEY=$(echo -n "import-2026-05-07:$name" | sha256sum | cut -d' ' -f1)
  curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records" \
    -H 'Content-Type: application/json' -H "X-Idempotency-Key: $KEY" \
    -d "$(jq -nc --arg n "$name" --argjson p "$pri" --arg s "$stat" \
      '{name:$n, fields:{
         f_priority:{type:"number",value:$p},
         f_status:{type:"text",value:$s},
         f_done:{type:"boolean",value:false}}}')" >/dev/null
done
```
### 9. Export a page to HTML — single-use ticket flow

**Goal:** publish a static HTML snapshot of a page. `documents.get?output=html` requires a single-use export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Tickets default to 3 uses and expire in ~2 minutes (live-verified). Anyone with the kit URL + ticket can download until it expires.

**Step 1 — create a ticket.**

```bash
TICKET=$(curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/export-ticket" \
  -H 'Content-Type: application/json' \
  -d '{"output":"html","themeMode":"light","includeComments":"appendix"}' \
  | jq -r .ticket)
```
**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document?output=html&ticket=$TICKET" > /tmp/page.html
# Markdown export — no ticket needed:
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document?output=md" > /tmp/page.md
```
### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (live-verified — one DELETE on the section emptied the notebook). Then `DELETE /api/v1/notes/notebooks/{notebookId}` removes the notebook itself.

`DELETE /api/v1/notes/notebooks/{notebookId}` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `GET /api/v1/notes/notebooks` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
# delete records
curl -sf "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records?count=100" \
  | jq -r '.records[].id' \
  | while read RID; do
      curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/databases/$DBID/records/$RID" >/dev/null
    done
# delete the database node
curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/nodes/$DBID" >/dev/null
# cascade-delete by removing the section (drops every page/db underneath)
curl -sf -X DELETE "$KIT/api/v1/notes/notebooks/$NBID/nodes/$SEC" >/dev/null
# notebook delete (returns 200 immediately, soft-delete — see note above)
curl -s  -X DELETE "$KIT/api/v1/notes/notebooks/$NBID" -o /dev/null -w '%{http_code}\n'
# fallback: rename so it's clearly disused
curl -sf -X PATCH "$KIT/api/v1/notes/notebooks/$NBID" \
  -H 'Content-Type: application/json' \
  -d '{"name":"team-wiki-DELETED"}'
```

## Reference

### `avatars` (2) — avatars

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/avatars/{avatarId}` | Download an avatar image |  |
| `POST /api/v1/notes/avatars` | Upload an avatar image |  |

### `collaborators` (4) — collaborators

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | Add a collaborator | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` | List collaborators |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Remove a collaborator |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` | Update collaborator role | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators` body — `{ collaboratorId*: string, role*: "admin" | "editor" | "collaborator" | "viewer" }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/collaborators/{collaboratorId}` body — `{ role*: "admin" | "editor" | "collaborator" | "viewer" }`

### `comments` (7) — comments

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | Create a comment | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Delete a comment | `?expectedVersion` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` | Edit a comment | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` | List comments | `?limit` `?offset` `?cursor` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comment-anchors` | List comment anchors | `?limit` `?offset` `?cursor` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` | Re-anchor a comment thread | `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` | Resolve a comment | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments` body — `{ content*: string, parentId: string, anchorBlockId: string, anchor: object }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}` body — `{ content*: string, expectedVersion: int }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/reanchor` body — `{ anchor*: object, expectedVersion: int }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/comments/{commentId}/resolve` body — `{ expectedVersion: int }`

### `databases` (6) — databases

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | Create a database record | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Delete a database record |  |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Get a database record |  |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` | List database records | `?filters` `?sorts` `?page` `?count` |
| `GET /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/search` | Search database records | `?q` `?exclude` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` | Update a database record | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records` body — `{ id: string, name: string="Untitled", avatar: string | null, fields: { [key: string]: any } }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/databases/{databaseId}/records/{recordId}` body — `{ name: string, avatar: string | null, fields: { [key: string]: object } }`

### `documents` (6) — documents

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` | Append blocks to a document | `H:X-Idempotency-Key` `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` | Create secure HTML export ticket | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/blocks/{blockId}/svg` | Export drawing block as SVG | `?bg` `?scale` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Get document content | `?blockIds` `?lines` `?output` `?includeComments` `?ticket` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Merge document content | `body*` |
| `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` | Create or replace document | `body*` |

**Param notes:**

- `X-Idempotency-Key` — Optional idempotency key (max 256 chars). Reusing the same key with an identical request body and node replays the original response; reusing it with a different body or node returns 409.

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` body — `{ text*: string, type: "paragraph" | "heading1" | "heading2" | "heading3" | "codeBlock"="paragraph", attrs: object | null } | { blocks*: object[] }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/export-ticket` body — `{ output: "html"="html", includeComments: "none" | "appendix"="none", includeBackground: bool=true, themeMode: "light" | "dark"="dark", themeId: string | null, themeVariables: { [key: string]: string }, fileName: string }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body — `{ content*: { [key: string]: any } }`
- `PUT /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document` body — `{ content*: { [key: string]: any } }`

### `files` (6) — files

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/notebooks/{notebookId}/files/{fileId}` | Download a file |  |
| `GET /api/v1/notes/notebooks/{notebookId}/files` | List all uploaded files | `?limit` `?offset` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Abort a TUS upload |  |
| `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Check a TUS upload's offset (for resuming) |  |
| `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Create a resumable (TUS) upload |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` | Upload a chunk to a TUS upload |  |

### `health` (1) — health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/health` | Service health and runtime info |  |

### `identity` (1) — identity

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notes/me` | Get current identity |  |

### `interactions` (2) — interactions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` | Mark node as opened | `body*` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` | Mark node as seen | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/opened` body — `{ openedAt: string }`
- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/interactions/seen` body — `{ seenAt: string }`

### `mutations` (1) — mutations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/mutations` | Sync client mutations | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/mutations` body — `{ mutations*: object[] }`

### `nodes` (7) — nodes

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes` | Create a node | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Delete a node |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Get a node |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/alias/{alias}` | Resolve page by alias |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes` | List nodes | `?type` `?parentId` `?rootId` `?limit` `?offset` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/children` | List child nodes | `?limit` `?offset` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` | Update a node | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes` body — `{ id: string, type*: string, parentId: string, attributes*: { [key: string]: any } }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}` body — `{ attributes*: { [key: string]: any } }`

### `notebooks` (5) — notebooks

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks` | Create a notebook | `body*` |
| `DELETE /api/v1/notes/notebooks/{notebookId}` | Delete a notebook |  |
| `GET /api/v1/notes/notebooks/{notebookId}` | Get notebook details |  |
| `GET /api/v1/notes/notebooks` | List notebooks |  |
| `PATCH /api/v1/notes/notebooks/{notebookId}` | Update notebook settings | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks` body — `{ name*: string, description: string | null, avatar: string | null }`
- `PATCH /api/v1/notes/notebooks/{notebookId}` body — `{ name*: string, description: string | null, avatar: string | null }`

### `reactions` (3) — reactions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | Add a reaction | `body*` |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` | List reactions |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions/{reaction}` | Remove a reaction |  |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/reactions` body — `{ reaction*: string }`

### `sockets` (2) — sockets

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/sockets` | Initialize a WebSocket session |  |
| `GET /api/v1/notes/sockets/{socketId}` | Open a WebSocket connection |  |

### `users` (2) — users

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/users` | Invite users to notebook | `body*` |
| `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role` | Update user role | `body*` |

**Body shapes:**

- `POST /api/v1/notes/notebooks/{notebookId}/users` body — `{ users*: ({ username*: string, role*: "owner" | "admin" | "collaborator" | "guest" | "none" })[] }`
- `PATCH /api/v1/notes/notebooks/{notebookId}/users/{userId}/role` body — `{ role*: "owner" | "admin" | "collaborator" | "guest" | "none" }`

### `versions` (5) — versions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | Create a document version snapshot |  |
| `DELETE /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Delete a document version |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}` | Get a specific document version |  |
| `GET /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions` | List document versions | `?limit` `?offset` |
| `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/versions/{versionId}/restore` | Restore a document version |  |


---

<!-- ===== namespace: notifications ===== -->

# `notifications` — Trigger and consume desktop notifications inside a container

## Purpose

Two jobs in one namespace. First and most useful: **remotely inform the human operator** — an agent fires a notification from inside a container and it pops on the user's phone, desktop, or smartwatch even when they're away from the session. Second: drive and read the container's own desktop (`notify-send`) toasts on an X display. The user opens the kit's web page once (see § Capability URL), grants browser-notification permission, and leaves it backgrounded; from then on every notification the agent fires is delivered to them as a real OS notification, and is also queryable and streamable over the HTTP API.

## When to use

- **Tell the human something happened while they're away** — "build finished", "needs your input", "deploy failed" — and have it reach their phone/desktop/smartwatch via the backgrounded web page. This is the supported way for an agent to reach its operator out-of-band.
- Surface progress or alerts from a long-running agent task as desktop toasts on a container display (`:1`, `:2`, …).
- Pull the notification log after a task; subscribe (WS/SSE) to react to new entries in real time.
- Dismiss handled entries (or restore them); fetch a notification's icon.

## When NOT to use

- Status you'll read yourself in the same session → just read the command output (→ see `terminal` / `exec`); a notification is for reaching a human who isn't watching.
- Account-level inbox, email, SMS, or verification mail → see `api` (the control-plane account inbox, unrelated to this kit).
- Cross-process or agent-to-agent message passing with no human and no display → see `pipe`.
- Reacting to file changes rather than pushing a message to someone → see `watch`.
- Managing the X display or windows themselves → see `display`.

## Prerequisites

- Target display exists.
- Required: `display`+`summary` on `POST /api/v1/notifications/notify`; `display` on `GET /api/v1/notifications/{display}`; `displays` on `GET /api/v1/notifications/stream`.

## Capability URL

Kit slug is `n` (not `notifications`): `https://{P}-{C}-n-1.{N}.containers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all` in any browser and it requests notification permission, then turns every streamed entry into a real OS notification (works backgrounded; auto-reconnects, polling fallback). The hostname itself is the credential, so no token or header goes in the URL — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `GET /api/v1/containers/{id}`. → See `SKILL-HTTP.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`POST /api/v1/notifications/notify` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. CLI: `hoody notifications trigger --display :0 --summary "Build done"`.

### 2. Read recent notifications

`GET /api/v1/notifications/{display}` — `display`: `":0"`, `"0"`, `"0,:1,2"`, or `"all"`. Optional `limit` (1–1000, default 100), `since` (ms), `username`, `session`. **`after_id` is supported by the kit HTTP route but is NOT in the generated SDK options** (`notifications.service.generated.ts:340-422`); use raw HTTP/curl when you need cursor pagination. The SDK additionally exposes `GET /api/v1/notifications/{display}` (one-shot fetch-all) and `GET /api/v1/notifications/{display}` (async page iterator) on top of plain list; the CLI exposes only a single `GET /api/v1/notifications/{display}` subcommand under `hoody notifications`. CLI: see CLI-broken caveat in Quirks.

### 3. Subscribe to events

`GET /api/v1/notifications/stream` — `displays`: `"all"`, `"*"`, or 1–3-digit IDs comma list. WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`). WS sends `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`GET /api/v1/notifications/{display}` → int `id`s → `POST /api/v1/notifications/dismiss` POST `{"notificationIds":[<int>,…],"displayId":":0"}`. `DELETE /api/v1/notifications/dismiss` DELETE (optional `displayId`) restores. CLI: `hoody notifications dismiss --display-id 1 --notification-ids 12,13`.

### 5. Fetch an icon

`GET /api/v1/notifications/{display}` → `icon` → `GET /api/v1/notifications/icons/{iconId}` by `iconId`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL), grant browser-notification permission, and leave the tab backgrounded. Agent side: `POST /api/v1/notifications/notify` with a `display` (any real display number — the kit auto-ensures it, so you do NOT have to set up X first), a `summary`, and optional `body`/`urgency`. The kit records the entry and broadcasts it on its stream; the operator's page renders it as an OS notification. Full copy-paste recipe in Example 11.

## Quirks & gotchas

- Kit slug is `n`, not `notifications`.
- `dismiss.notificationIds` MUST be integers (strings → `400`); `displayId` strips leading `:`.
- `POST /api/v1/notifications/notify` limits: `summary` ≤200, `body` ≤1000, `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`.
- `list.display` numeric or `"all"`; `connectStream.displays` accepts 1–5-digit IDs (`20001` is valid; 6+ digits rejected) (`"1000"` rejected).
- `list.limit` `[1,1000]` def 100; cursor `after_id`; `username`/`session` 1–100 ASCII alnum.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s heartbeat. WS: per-IP caps, origin allow-list, drops after 2 missed pongs.
- `DELETE /api/v1/notifications/dismiss`=DELETE, `POST /api/v1/notifications/dismiss`=POST, same path.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-container kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `* /api/v1/notifications/*` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated.
- The CLI uses `namespace: 'notifications'`, which routes through `normalizeKitProgram` to the kit slug `n` and builds `https://{P}-{C}-n-{N}.{server}.containers.hoody.com/api/v1/notifications/...` — `hoody --container <C> notifications {list|dismiss|icon|trigger}` reaches the kit correctly.
- `notifications stream` mapping has no `cli_stream` flag — the generated CLI buffers SSE events forever instead of streaming. Use SDK `GET /api/v1/notifications/stream` (returns a WebSocket wrapper, not void) or hit `/api/v1/notifications/stream` directly with `EventSource`/`fetch` for live feeds.
- `GET /api/v1/notifications/stream` returns a `Promise<NotificationsConnectNotificationStreamWebSocket>` wrapper. Wire callbacks first (`wrapper.onNotification(cb)` / `onHeartbeat(cb)` / `onDisconnect(cb)` / `onError(cb)`), then `await wrapper.connect()`. Close with `wrapper.close()`. There is NO `onMessage`/`onClose` — those names are wrong. `displays` is typed optional in the TS signature but is required at runtime — the SDK throws `ValidationError('displays is required')` if omitted, so always pass it.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias): it connects to the stream and raises a browser `Notification` per entry, with a polling fallback and auto-reconnect. Mount it as `?displays=all` to catch every display. This is the supported path for delivering an agent's notifications to a human's device; no token goes in the URL (the hostname is the capability).
- `POST /api/v1/notifications/notify` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit runs `hoody-terminal create --terminal-id N --display-id N --wait-for-display --wait-timeout S` (where `S` is the display-ensure timeout, default 30 s; results are cached 60 s) to bring the target display up before calling `notify-send`, so firing to e.g. `:1` works on demand. It still returns `500 "No D-Bus session available"` if the display genuinely can't be brought up — pick another display instead of retrying the same one.

## Common errors

- `400 "Notification dispatch failed"` w/ details; non-`Invalid` → `500`.
- WS `1008` origin-deny; `1001` heartbeat timeout. `429` on `POST /api/v1/notifications/notify` / `GET /api/v1/notifications/icons/{iconId}`; both are enforced by the shared per-IP rate-limit middleware.
- `/health` 200 ≠ authorised endpoints reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Every step in every example was live-tested against a real `n-1` kit (kit slug is `n`, NOT `notifications` — the long form returns DNS NXDOMAIN). Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first, and tag your test traffic with a distinctive `category` like `sdk-doc-*` so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. ⚠ Display `:0` typically has no D-Bus session in headless containers (`500 "No D-Bus session available for display :0"`); use a display that an X session is actually attached to (`:2` and `3` were live on the test container).

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{
    "display": "2",
    "summary": "Build done",
    "body": "v1.4.2 deployed",
    "urgency": "normal",
    "category": "sdk-doc-build"
  }'
```
**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
ENTRY=$(curl -sf "$KIT/api/v1/notifications/2?limit=10" \
  | jq '.data.notifications[] | select(.category=="sdk-doc-build") | {id, display_id}' | head -n 4)
echo "$ENTRY"
```
### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the container. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and per-display id sequences are independent (display `:2` and `:3` each have their own `id=1`, `id=2`…).

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
for D in 2 3; do
  curl -sX POST "$KIT/api/v1/notifications/notify" \
    -H 'Content-Type: application/json' \
    -d "{\"display\":\"$D\",\"summary\":\"Maintenance in 5m\",\"urgency\":\"critical\",\"category\":\"sdk-doc-fanout\"}"
done
curl -sf "$KIT/api/v1/notifications/2,3?limit=20" \
  | jq '.data.notifications[] | select(.category=="sdk-doc-fanout") | {id, display_id}'
```
### 3. Subscribe to the live SSE stream and react to new notifications

**Goal:** keep a long-lived consumer that processes every new notification as it arrives. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. Frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry).

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
# Open the stream in one shell — first frame is `data: {"type":"connected","displays":"all"}`,
# then a heartbeat every 15s, then live `notification` frames as they happen.
curl -sN "$KIT/api/v1/notifications/stream?displays=all"

# In another shell, fire something:
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{"display":"2","summary":"hello-stream","category":"sdk-doc-stream"}'
```
### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. ⚠ `notificationIds` MUST be **integers** — strings return `400 "notificationIds must contain valid integer IDs"`. ⚠ Scoped dismiss (with `displayId`) hides the entries from `GET /:displayId` but they remain visible from `GET /all`; for cross-display hide, omit `displayId` (see example 5).

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
IDS=$(curl -sf "$KIT/api/v1/notifications/2?limit=50" \
  | jq -c '[.data.notifications[].id]')   # e.g. [2,3,4]
curl -sX POST "$KIT/api/v1/notifications/dismiss" \
  -H 'Content-Type: application/json' \
  -d "{\"notificationIds\":$IDS,\"displayId\":\"2\"}"
# → {"success":true,"message":"3 notification(s) dismissed"}
```
### 5. Restore everything you just dismissed

**Goal:** undo step 4 — bring dismissed items back into the listing. `DELETE /api/v1/notifications/dismiss` is `DELETE /dismiss` (same path as POST `POST /api/v1/notifications/dismiss`); pass `displayId` to scope, or omit it for global restore.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
# Scoped restore — only display 2:
curl -sX DELETE "$KIT/api/v1/notifications/dismiss?displayId=2"

# Global restore — every display:
curl -sX DELETE "$KIT/api/v1/notifications/dismiss"
```
### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); an unsupported extension or path traversal returns `400 "Icon ID is invalid or has an unsupported extension."`, and an existing-but-unreadable icon returns `500` — NOT 404, despite the openapi.yaml documenting a 404 for this case.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
ICON=$(curl -sf "$KIT/api/v1/notifications/2?limit=10" \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
# First fetch — capture ETag:
ETAG=$(curl -sI "$KIT/api/v1/notifications/icons/$ICON" | awk '/^[Ee][Tt][Aa][Gg]:/{print $2}' | tr -d '\r')
# Revalidate — server returns 304 if unchanged:
curl -sI -H "If-None-Match: $ETAG" "$KIT/api/v1/notifications/icons/$ICON"
```
### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me everything new on display `:2` since the last poll, with a stable cursor for the next call." `since` is **Unix milliseconds**, `after_id` is the per-display integer cursor (HTTP only — neither the SDK nor the CLI exposes `after_id`). `display_id` in responses is a `DisplayIdValue` — either a number or a string depending on the entry source — but the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
SINCE=$(( $(date +%s%3N) - 60000 ))   # last 60s
curl -sf "$KIT/api/v1/notifications/2?limit=100&since=$SINCE&after_id=10" \
  | jq '.data | {count, last_id: ([.notifications[].id] | max)}'
```
### 8. Page through history — newest 50, then walk backwards

**Goal:** the listing default is 100 newest; you want clean pagination. The kit hands back items already in newest-first order. There's no `before_id` flag — you walk by re-querying with `after_id` for forward catch-up, or take page slices client-side. The SDK adds two helpers on top of plain list: a one-shot fetch-all and a streaming iterator (both shown in the SDK example below).

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
PAGE1=$(curl -sf "$KIT/api/v1/notifications/all?limit=50")
LAST=$(echo "$PAGE1" | jq '[.data.notifications[].id] | min')
# Forward catch-up — anything newer than LAST since you last polled:
curl -sf "$KIT/api/v1/notifications/all?limit=50&after_id=$LAST"
```
### 9. Audit notifications by username / session

**Goal:** "show me everything user `alex` saw in session `sessabc`." `username` and `session` are filter query params on `GET /api/v1/notifications/{display}`; pure ASCII alnum 1–100 chars — hyphens/underscores are rejected with `400` (e.g. `sess-abc` would fail validation). ⚠ Unknown values DO NOT 404 — the kit returns `count` of whatever it has from the wider context (live-confirmed: `username=root` returned non-empty even though notifications never had that field set), so always combine with `display`+`since` to keep the result tight.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
SINCE=$(( $(date +%s%3N) - 86400000 ))   # last 24h
curl -sf "$KIT/api/v1/notifications/all?limit=200&since=$SINCE&username=alex&session=sessabc" \
  | jq '.data.notifications | length'
```
### 10. Survive a 429 rate-limit burst on `POST /api/v1/notifications/notify`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. The kit per-IP rate-limits both `POST /api/v1/notifications/notify` and `GET /api/v1/notifications/icons/{iconId}`. Strategy: cap concurrency client-side, exponential-backoff on `429`, and never retry on `400` (validation — fix the body instead). On `500 "No D-Bus session available"`, the display has no live X session — pick another display, don't retry the same one.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
trigger() {
  local body="$1" delay=1
  for try in 1 2 3 4 5; do
    code=$(curl -sX POST "$KIT/api/v1/notifications/notify" \
      -H 'Content-Type: application/json' -d "$body" -o /tmp/out -w '%{http_code}')
    case "$code" in
      200) return 0 ;;
      429) sleep "$delay"; delay=$((delay*2)) ;;
      400|500) cat /tmp/out; return 1 ;;
    esac
  done
  return 1
}
trigger '{"display":"2","summary":"queued","category":"sdk-doc-burst"}'
```
### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to whatever device they left the page open on. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser, click "Allow" when prompted, and leave the tab in the background (phone, desktop, or a browser that mirrors notifications to a smartwatch). `{P}`/`{C}`/`{N}` come from `GET /api/v1/containers/{id}`; `?displays=all` catches notifications fired on any display:

```
https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all
```

The page asks for notification permission on first load, reconnects on its own, and falls back to polling if WebSocket is blocked. No token goes in the URL — the hostname is the credential.

**Agent side** — fire the alert. Any real display number works; the kit auto-ensures it, so you don't need to set up X first.

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/notifications/notify" \
  -H 'Content-Type: application/json' \
  -d '{"display":"1","summary":"Build finished","body":"v1.4.2 is deployed — review when you can","urgency":"normal"}'
```

## Reference

### `health` (2) — Server health check

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/health` | Service health check |  |
| `GET /api/v1/notifications/metrics` | Prometheus-compatible metrics endpoint |  |

### `icons` (1) — Serve notification icons

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/notifications/icons/{iconId}` | Get notification icon |  |

### `notifications` (4) — Retrieve historical notifications

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/notifications/dismiss` | Clear dismissed notifications | `?displayId` |
| `GET /api/v1/notifications/stream` | Real-time notification stream via WebSocket | `?displays*` |
| `POST /api/v1/notifications/dismiss` | Dismiss notifications | `body*` |
| `GET /api/v1/notifications/{display}` | Get notifications for specified display(s) | `?limit` `?since` `?username` `?session` |

**Param notes:**

- `displayId` — Optional display ID to scope the clear operation
- `displays` — Comma-separated display IDs to subscribe to (e.g., "1,:2,3"), or "all" to receive notifications from every display.
- `limit` — Maximum number of notifications to return
- `since` — Unix timestamp in milliseconds to get notifications after this time
- `username` — Filter notifications by username
- `session` — Filter notifications by session ID

**Body shapes:**

- `POST /api/v1/notifications/dismiss` body — `{ displayId: string, notificationIds*: int[] }`
  - `displayId` — Optional display ID to scope the dismissal
  - `notificationIds` — Array of notification IDs to dismiss

### `notify` (1) — Trigger new notifications

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/notifications/notify` | Trigger a new desktop notification | `body*:notifications_NotifyRequest` |


### Body schemas

- `notifications_NotifyRequest` — `{ body: string, category: string, display*: string, expire_time: int, icon: string, summary*: string, urgency: "low" | "normal" | "critical"="normal" }`

---

<!-- ===== namespace: pipe ===== -->

# `pipe` — Zero-storage streaming HTTP transfers

## Purpose

HTTP rendezvous. Sender POST/PUTs a path; receivers GET it; bytes fan out
in-memory, zero server storage. Paths exist only while pending/active.

## When to use

- Endpoint-to-endpoint bytes without staging.
- Fan-out (`?n=<count>`, N ≤ 256).
- Live video via `?video`.
- Telemetry via `?progress`.
- Browser upload UI via `/noscript` or `/`.

## When NOT to use

Persist → `files`, HTTP client → `curl`, shell → `terminal`; no replay/queue (no storage).

## Prerequisites

- All peers share kit URL, `{path}`, `n`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

Drive via SDK (`POST /api/v1/pipe/{path}` / `GET /api/v1/pipe/{path}`), `curl` against the kit URL, or the hand-written `hoody pipe` CLI surface (subcommands `send`, `receive`, `progress`, `url`, `forward-tcp`, `health`, `help-cheatsheet` — a hand-written CLI surface, NOT part of the auto-generated command mapping).

### 1. One-to-one

`GET /api/v1/pipe/{path}` with `path` (blocks); `POST /api/v1/pipe/{path}` same `path`. `n=1`.

### 2. Fan-out (N ≤ 256)

All peers call with same `path` + `n=<N>`. Mismatch → 400.

### 3. Download / inline per receiver

`GET /api/v1/pipe/{path}` with `download=1` and/or `filename=<n>` → attachment; `download=0`
→ inline.

### 4. Watch via `?progress`

`GET /api/v1/pipe/{path}` with `progress=1`. `Accept: text/event-stream` → SSE; `text/html`
→ dashboard. No receiver slot.

### 5. Video via `?video`

`GET /api/v1/pipe/{path}` with `video=1` + `Accept: text/html` → MSE player; non-browser →
raw bytes. Sender: WebM / fMP4 / MPEG-TS.

## Quirks & gotchas

- Generated SDK + HTTP plus a hand-written `hoody pipe` CLI; the file does NOT cover its subcommands — they are a hand-written CLI surface.
- `/api/v1/pipe/{path}` ≡ bare `/{path}`.
- Reserved: `/`, `/noscript`, `/help`, `/favicon.ico`, `/robots.txt` (alias-hardened).
- `n` ≤ 256; peers must agree. Caps 1000 pending + 1000 active.
- Path ≤ 1024 enforced by kit; URL ≤ 4096 is a deployment-layer cap (proxy/Cloudflare) — `MAX_URL_LENGTH = 4096` is declared but not enforced in the kit validator. Control/backslash/%-slash → 400.
- Half-pipes / idle active evicted after 5 min.
- Dangerous sender MIME (HTML/SVG/JS) → `text/plain`; `nosniff` forced.
- Forwarded sender→receiver headers: `Content-Type` (sanitized — dangerous MIME → `text/plain`), `Content-Length` (when set), `X-Piping`, `X-Hoody-Pipe` (each ≤8 KiB, CRLF-stripped). `Content-Disposition` is rebuilt per-receiver from sender metadata + receiver `?download`/`?filename` params.
- `?download` enum (SDK-validated): `"true"`/`"false"`/`"yes"`/`"no"`/`"1"`/`"0"` (attach / inline). The kit is more permissive — bare `?download` (no value) and any non-`false`/`no`/`0` string are treated as truthy. `?filename=<v>` implies attach, sanitised (255 chars, RFC 5987).
- `?video` HTML player only on `Accept: text/html`; no receiver slot.
- `?progress` no receiver slot. Caps: 50/path, 500 groups, 30 min TTL.
- `Service-Worker: script` → 400.
- `Content-Range` on POST/PUT → 400.
- Multipart: only **first file part** used, 30s deadline.

## Common errors

- 400 — active / sender attached / `n` mismatch / slots full / `n`>256 / reserved / forbidden chars / `Service-Worker` / `Content-Range`.
- 405 — method (HEAD only on reserved).
- 408 — receivers timeout.
- 414 — path > 1024.
- 429 — pending/active/spectator cap.

## Related namespaces

`files` persist · `curl` HTTP client · `tunnel` long-lived bidi · `terminal`/`exec` shell.

## Examples

`pipe` examples below use HTTP and the generated SDK. A separate hand-written `hoody pipe` CLI also exists (subcommands `send`, `receive`, `progress`, `url`, `forward-tcp`, `health`, `help-cheatsheet`) — hand-written, NOT auto-generated. Every step in every example
was live-tested against a real `pipe-1` kit. Set `P`, `C`, `N` (project id,
container id, server name) from `GET /api/v1/containers/{id}` first, then
`KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"`.

Pipe paths are reservations: receivers and senders rendezvous on the same path.
Pick a unique path (e.g. `transfer-$(openssl rand -hex 4)`) per transfer — once
it's claimed by a sender or receiver, the same path can't host another transfer
until the first one finishes or the 5-min idle TTL evicts it.

### 1. One-to-one transfer — receiver waits, sender pushes bytes

**Goal:** stream a payload from one endpoint to another with zero staging. Receiver opens the GET first; the connection blocks until the sender POSTs to the same path.

**Step 1 — start the receiver in the background.** It blocks until the sender connects.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="transfer-$(openssl rand -hex 4)"
curl -s "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/received.bin &
RECVPID=$!
```
**Step 2 — send the bytes.** Sender's response is a streamed `[INFO]` log:
```
[INFO] Waiting for 1 receiver(s) to connect...
[INFO] 1 receiver(s) already connected.
[INFO] Streaming to 1 receiver(s)...
[INFO] Upload complete.
[INFO] Transfer complete.
```

```bash
printf 'hello pipe!' \
  | curl -s -X POST --data-binary @- -H 'Content-Type: text/plain' \
      "$KIT/api/v1/pipe/$PATH_NAME"
wait $RECVPID
cat /tmp/received.bin   # → hello pipe!
```
### 2. Fan-out 1-to-3 — one sender, three receivers

**Goal:** broadcast the same bytes to three endpoints in lockstep. All four parties (3 receivers + 1 sender) must agree on `n=3`; mismatch → 400.

**Step 1 — open three receivers.** Each must pass `?n=3`.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="broadcast-$(openssl rand -hex 4)"
for i in 1 2 3; do
  curl -s "$KIT/api/v1/pipe/$PATH_NAME?n=3" -o "/tmp/recv-$i.bin" &
  sleep 0.5
done
```
**Step 2 — send once; all three receivers get an identical copy.** Lockstep fan-out: the slowest receiver paces the transfer.

```bash
printf 'fan-out-payload' \
  | curl -s -X POST --data-binary @- "$KIT/api/v1/pipe/$PATH_NAME?n=3"
wait
ls -la /tmp/recv-*.bin   # all three identical
```
### 3. Force a download with a custom filename

**Goal:** make the browser save the response to disk with a specific name, regardless of what (or whether) the sender provided a `Content-Disposition`. `?filename=<v>` implies `?download` and overrides any sender-supplied filename.

**Live-tested response header:** `content-disposition: attachment; filename="report.bin"`.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="dl-$(openssl rand -hex 4)"
# Receiver: force download to report.bin
curl -s -OJ "$KIT/api/v1/pipe/$PATH_NAME?download=1&filename=report.bin" &
sleep 1
# Sender: arbitrary bytes, no Content-Disposition needed
printf 'BINARYPAYLOAD' | curl -s -X POST --data-binary @- \
    "$KIT/api/v1/pipe/$PATH_NAME"
wait
```
### 4. Force inline display, overriding a sender's `attachment`

**Goal:** the sender (e.g. a legacy script) marks every payload as `Content-Disposition: attachment; filename="leaked.txt"`, but you want to render it inline in your app. `?download=0` strips Content-Disposition entirely on the receiver side — per receiver, not globally.

**Live-tested:** sender sent `Content-Disposition: attachment; filename="leaked.txt"`; receiver got `content-type: text/plain` only — no Content-Disposition.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="inline-$(openssl rand -hex 4)"
curl -sD - "$KIT/api/v1/pipe/$PATH_NAME?download=0" -o /tmp/inline.txt &
sleep 1
printf 'inline body' | curl -s -X POST --data-binary @- \
  -H 'Content-Type: text/plain' \
  -H 'Content-Disposition: attachment; filename="leaked.txt"' \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait
```
### 5. Watch a transfer with `?progress` (SSE)

**Goal:** monitor live state + bytes/sec from a third process, without consuming a receiver slot. `?progress=1` with `Accept: text/event-stream` returns SSE events; the spectator never blocks the transfer.

**Live-tested SSE stream** for a 50 KB payload:
```
event: state    data: {"state":"idle",...}
event: state    data: {"state":"waiting","hasSender":true,"activeReceivers":1,...}
event: state    data: {"state":"streaming",...}
event: progress data: {"bytesTransferred":50000,"totalBytes":50000,...}
event: done     data: {"state":"complete","bytesTransferred":50000,"avgSpeed":7142857}
```

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="watched-$(openssl rand -hex 4)"
# Spectator: SSE
curl -sN -H 'Accept: text/event-stream' \
  "$KIT/api/v1/pipe/$PATH_NAME?progress=1" &
SSE=$!
sleep 1
# Real receiver
curl -s "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/payload.bin &
sleep 1
# Sender pushes 50 KB
yes abcd | head -c 50000 | curl -s -X POST --data-binary @- \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait $!  # receiver
sleep 2 ; kill $SSE 2>/dev/null
```
### 6. Embed an HTML transfer dashboard

**Goal:** give a non-technical user a live dashboard view of an in-flight transfer. Same `?progress=1` endpoint, but `Accept: text/html` returns a self-contained HTML page (CSP nonces, EventSource client baked in). Pop it in an `<iframe>` or open it in a new tab.

**Live-tested:** ~6 KB HTML page titled `"Hoody Pipe — Transfer Progress"` with `EventSource` wired to the same path. Dashboard never consumes a receiver slot.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="watched-$(openssl rand -hex 4)"
# Save the dashboard page
curl -s -H 'Accept: text/html' \
  "$KIT/api/v1/pipe/$PATH_NAME?progress=1" > /tmp/dashboard.html
# Or just paste into a browser:
echo "Open in browser: $KIT/api/v1/pipe/$PATH_NAME?progress=1"
```
### 7. Stream a screen-recording to an MSE video player

**Goal:** stream live MPEG-TS / fMP4 / WebM from `ffmpeg` and watch it in a browser without serving a separate frontend. `?video=1` + `Accept: text/html` returns an HTML page that auto-detects the codec from the first bytes; non-browser clients (VLC, mpv, ffplay) fall through to the raw stream automatically.

**Live-tested:** ~7.7 KB HTML page titled `"Hoody Pipe — Video"` with `MediaSource` + `data-path` baked in.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="screencast-$(openssl rand -hex 4)"
# 1) Open the player URL in a browser:
echo "Watch: $KIT/api/v1/pipe/$PATH_NAME?video=1"
# 2) Then on the source machine, push the live encode:
ffmpeg -f x11grab -i :0.0 -c:v libx264 -preset ultrafast -f mpegts - \
  | curl --upload-file - "$KIT/api/v1/pipe/$PATH_NAME"
# Non-browser viewers (VLC/mpv/ffplay) use the same URL — they get raw bytes:
mpv "$KIT/api/v1/pipe/$PATH_NAME?video=1"
```
### 8. Multipart upload — only the first file part is forwarded

**Goal:** accept an HTML form upload. Pipe extracts the **first file part** of a `multipart/form-data` body, drains the rest, and forwards the file's `Content-Type` + `Content-Disposition` (auto-upgraded to `attachment`).

**Live-tested:** sent `field1=ignored` + `file=@a.txt` + `extra=@b.txt`. Receiver got body `first-file-content` only, with headers `content-type: text/plain` and `content-disposition: attachment; filename="a.txt"` — second file silently dropped.

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="upload-$(openssl rand -hex 4)"
# Receiver
curl -sD /tmp/headers "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/file.bin &
sleep 1
# Sender: form fields are drained; only the FIRST file part survives
echo -n first-file-content  > /tmp/a.txt
echo -n second-file-content > /tmp/b.txt
curl -s -X POST \
  -F 'field1=ignored-form-field' \
  -F 'file=@/tmp/a.txt;type=text/plain' \
  -F 'extra=@/tmp/b.txt;type=text/plain' \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait
grep -i 'content-disposition' /tmp/headers   # → attachment; filename="a.txt"
cat /tmp/file.bin                             # → first-file-content
```
### 9. Path / URL length limits — 1024-char path is the cap

**Goal:** know what blows up at the validator. Path > 1024 chars → `414 Path too long`; URL > 4096 chars → 414 from the proxy before the kit even sees it.

**Live-tested:**
- 1100-char path POST: kit returned `414` with body `[ERROR] Path too long (max 1024 characters).`
- 1024-char path: accepted by the path validator (sender hangs waiting for receiver as expected).

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"

# A 1100-char path is rejected with HTTP 414
LONG=$(printf 'x%.0s' {1..1100})
curl -s -o /tmp/err -w 'code=%{http_code}\n' \
  -X POST --data-binary 'data' "$KIT/api/v1/pipe/$LONG"
# → code=414
cat /tmp/err   # → [ERROR] Path too long (max 1024 characters).

# Stay under the cap — keep paths short and use a random suffix:
SHORT="t-$(openssl rand -hex 8)"  # ~17 chars total
```
### 10. Sidechannel metadata via `X-Hoody-Pipe`

**Goal:** attach commit / build / job metadata to the transfer without polluting the body. The kit forwards `X-Hoody-Pipe` and `X-Piping` (≤ 8 KiB each, CRLF-stripped) to receivers and exposes them via `Access-Control-Expose-Headers` so browsers can read them.

**Live-tested response headers** with `X-Hoody-Pipe: build-id=42; commit=abc1234` + `X-Piping: legacy-meta=true`:
```
access-control-expose-headers: X-Piping, X-Hoody-Pipe
x-hoody-pipe: build-id=42; commit=abc1234
x-piping: legacy-meta=true
```

```bash
KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"
PATH_NAME="meta-$(openssl rand -hex 4)"
curl -sD /tmp/h "$KIT/api/v1/pipe/$PATH_NAME" -o /tmp/body &
sleep 1
printf 'metadata payload' | curl -s -X POST --data-binary @- \
  -H 'X-Hoody-Pipe: build-id=42; commit=abc1234' \
  -H 'X-Piping: legacy-meta=true' \
  -H 'Content-Type: application/octet-stream' \
  "$KIT/api/v1/pipe/$PATH_NAME"
wait
grep -iE '^x-hoody-pipe|^x-piping' /tmp/h
```

## Reference

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe/health` | Service health check |  |

### `info` (1) — info

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe/help` | Get help text with curl examples |  |

### `pipe` (3) — pipe

| Method | Summary | Params |
|--------|---------|--------|
| `OPTIONS /api/v1/pipe/{path}` | CORS preflight |  |
| `GET /api/v1/pipe/{path}` | Receive data from a pipe | `?n` `?download` `?filename` `?video` `?progress` |
| `POST /api/v1/pipe/{path}` | Send data to a pipe | `?n` |

**Param notes:**

- `path` — Any path — OPTIONS is handled identically for all paths
- `path` — Pipe path name to receive from — must match the path used by the sender.  Reserved paths (`/help`, `/noscript`, etc.) return their own content on GET instead of acting as pipe receivers.
- `n` — Expected number of receivers. Must match the sender's `n` value exactly — a mismatch returns 400.  When `n > 1`, the pipe waits for all `n` receivers and the sender before streaming.
- `download` — Control whether the response triggers a browser download.  - `?download` (bare), `?download=true`, `?download=yes`, `?download=1` — force `Content-Disposition: attachment` (triggers download). Uses sender's filename if available, otherwise pipe path basename. - `?download=false`, `?download=no`, `?download=0` — suppress `Content-Disposition` entirely, even if sender set one (forces inline display). - Absent — passthrough sender's Content-Disposition as-is. Multipart `form-data` dispositions are auto-converted to `attachment`.  Works per-receiver — with `n=2`, one receiver can have `?download` and the other can display inline.
- `filename` — Set a custom download filename. Implies `?download` — the response will have `Content-Disposition: attachment; filename="<value>"`.  **Priority:** `?filename` overrides any filename from the sender's Content-Disposition header.  **Sanitization:** Null bytes, CRLF, path separators (`/`, `\`), leading dots, and control characters are stripped. Truncated to 255 characters. Non-ASCII filenames use RFC 5987 `filename*=UTF-8''...` encoding.  Filenames that sanitize to empty fall back to bare `attachment`.
- `video` — Return an HTML page with an embedded MSE (MediaSource Extensions) video player instead of raw pipe data. The player page fetches the raw stream internally — no pipe receiver slot is consumed by the page itself.  **Browser detection:** Only serves the HTML player when the client sends `Accept: text/html` (i.e. a browser). Non-browser clients (VLC, mpv, curl, ffplay) with `?video` fall through to normal pipe receiver behavior and get the raw stream — ensuring automatic compatibility with media players.  **Auto-detection:** The player detects the container/codec from the stream's first bytes: - WebM (VP8/VP9/AV1 + Opus/Vorbis) - MP4/fMP4 (H.264/H.265/VP09/AV01 + AAC) - MPEG-TS  **UI features:** - Click to unmute (autoplay requires muted) - Right-click to pause/resume - Status overlay: "Waiting for stream…", "Connected", "Stream ended" - Buffer trimming (>30s behind currentTime removed)  **Values:** `?video` (bare), `?video=true`, `?video=yes`, `?video=1` → show player. `?video=false`, `?video=no`, `?video=0` → normal pipe receiver.  **Security:** CSP with nonces (`script-src`, `style-src`), `connect-src 'self'`, `media-src blob:`, `default-src 'none'`. Pipe path HTML-escaped in `data-path` attribute.
- `progress` — Return real-time transfer progress as a Server-Sent Events (SSE) stream or HTML dashboard. Does NOT consume a pipe receiver slot — spectators are completely independent of the transfer.  **Accept header routing:** - `Accept: text/event-stream` → SSE stream (EventSource, curl) - `Accept: text/html` → HTML dashboard page (browser) - `Accept: */*` or missing → SSE stream (default to data, not markup)  **SSE event types:** - `state` — State transitions: idle → waiting → streaming → complete/failed - `progress` — During streaming (throttled 250ms): bytesTransferred, speed, ETA, receivers - `done` — Terminal event: final stats (bytesTransferred, duration, avgSpeed)  **State machine:** `idle` (no pipe) → `waiting` (sender/receivers connecting) → `streaming` (data flowing) → `complete` or `failed`  **DoS protections:** Max 50 spectators per path, 500 total groups, 30-min connection TTL, 30s post-transfer linger.  **Values:** `?progress` (bare), `?progress=true`, `?progress=yes`, `?progress=1` → show progress. `?progress=false`, `?progress=no`, `?progress=0` → normal pipe receiver.  **Security:** HTML dashboard uses CSP with nonces. Pipe path HTML-escaped. SSE includes `X-Accel-Buffering: no` for Nginx compatibility.
- `path` — Unique pipe path name. Must not be a reserved path (`/`, `/help`, `/noscript`, `/favicon.ico`, `/robots.txt`).  Examples: `myfile`, `transfer123`, `secret.png`, `logs/today`
- `n` — Number of receivers to wait for before starting the transfer. All receivers get identical copies of the data (fan-out). Must be a positive integer, max 256.

### `ui` (2) — ui

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/pipe` | Index page (web UI) |  |
| `GET /api/v1/pipe/noscript` | No-JavaScript upload page | `?path` `?mode` |

**Param notes:**

- `path` — Pre-fill the pipe path. Only URL-safe characters allowed.
- `mode` — Input mode: `file` for file picker, `text` for textarea


---

<!-- ===== namespace: proxyLogs ===== -->

# `proxyLogs` — Per-container request/response/event log query, stats, and SSE tail

## Purpose

Read-only access to the container reverse-proxy log store: query, stats, SSE tail.

## When to use

- Debug 4xx/5xx on a kit subdomain.
- Live-tail during deploys.
- Status-code mix; filter by `kind`/`level`/`method`/`serviceName`.

## When NOT to use

App stdout/stderr → `exec`/`daemon`, file events → `watch`, user SQLite → `sqlite`, shell → `terminal`; clearing logs not exposed.

## Prerequisites

- Project + container running; logging automatic.
- Matrix needs `"logs": true`. `"*"` does NOT grant.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. List recent

- `GET /_logs` with `last: N` or `limit`+`offset` (SNI-bound).
- Sweep: `GET /_logs` / `GET /_logs`.

### 2. Drill into 5xx

- `GET /_logs` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate with `limit`/`offset` (DB rowids); `afterId` on the kit URL hits the ring buffer where `id: 0`.

### 3. Live-tail with resume

- `GET /_logs/stream` — SSE; live frames carry `id: <ringSeq>` (initial replay frame is a data-only array with no `id:` line).
- Reconnect with `Last-Event-ID`; replays from ~5000-entry ring.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Status snapshot

- `GET /_logs/stats` — totals + status breakdown.

### 5. Bodies for a slice

- `GET /_logs` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `GET /_logs` ignored — SNI auto-scopes.
- `cursor` is only accepted when the deployment enables cursor pagination.
- `level` accepts ONE value at a time; despite the mapping description claiming comma-separated, `level=warn,error` returns `total: 0` — query each level separately and union client-side.
- `serviceName` handling is path-dependent: the kit/SNI `/_logs` LIST handler silently ignores `serviceName`, but the kit/SNI `/_logs/stream` BOUNCE forwards `serviceName`/`source` to the management port; the management-port `/_logs` handler always honours it. The generated SDK `GET /_logs` sends the param either way, but on a kit-URL list it is a no-op — scan + client-side filter. The generated **streamLogs** SDK method does not expose `serviceName` at all. `traceId` is not exposed as a query param anywhere; scan with `limit/afterId` and filter client-side.
- Response shape switches on which paging param you use: `limit/offset` → `{entries,total,limit,offset}`; `last=N` and `afterId` → flat `LogEntry[]` (and `id: 0` placeholders on the `last=N` shape) — but only when bodies are NOT requested; with `includeRequestBody`/`includeResponseBody=true` even the flat-paging paths fall through to the wrapped `{entries,total,limit,offset}` shape.
- `includeRequestBody`/`includeResponseBody` default `false`.
- Ring ~5000 (~50s @ 100/s); longer gaps lose rows.
- `event: reset` rebases ringSeq ≥10000 — drop cursor.
- `logs` strict-boolean; `"*"` does NOT grant.
- `kind` = `request`/`response`/`event`.

## Common errors

- 403 — missing `logs: true` (permission / blocked-path gate).
- 429 — `AUDIT_SNI_RATE_LIMIT_PER_MIN` (default 30) per-scope read/stat/stream rate limit tripped on any SNI read (list, getStats, streamLogs) → `{error:"rate_limited"}` with `Retry-After: 2`; back off.
- 404 on `/_logs/{config,health,export,db/*}`.
- 405 on `DELETE /_logs`.
- 410 NDJSON `snapshot_expired` (admin `cursor`); restart no-cursor.
- Desync if `event:` lines unparsed; reset on `reset`.

## Related namespaces

- `exec`/`daemon` — app logs.
- `terminal` — reproduce.
- `watch` — fs events.
- `api` — lifecycle.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

> **CLI caveat — `hoody proxy logs …` does NOT target the kit.** `GET /_logs`/`stats` declare `namespace: 'api'` and `GET /api/v1/exec/logs/stream` builds from the client base URL, so `--container` is IGNORED and the call goes to your configured API/management base URL (`--base-url`), where no `/_logs` route exists. The kit-URL behaviours documented below (flat `last=N` array, `id: 0` ring rows) apply to the HTTP and SDK forms only.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. We picked **7** end-to-end recipes that exercise every working filter, both response shapes, the stats endpoint, and SSE resume. Three additional scenarios from the suggestion list — *filter by program*, *filter by source IP*, and *search by alias hostname* — were dropped because the kit does **not** filter on those fields server-side (`serviceName`, `clientIp`, alias-hostname are *not* honoured as query params on `GET /_logs`); the only way to scope by them is client-side `.filter()` after a paged scan, which is already shown in §2 (status) and §5 (traceId).

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns a flat ARRAY (no `entries` wrapper) ordered **oldest-first within the returned last-N slice** with `id: 0` placeholders — the cheapest call you can make.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?last=50" | jq -r '.[] | "\(.tsIso)  \(.kind)/\(.level)  \(.serviceName)  \(.method) \(.url) \(.status // "—")"'
```
### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?level=error&limit=200" \
  | jq '[.entries[] | select(.status >= 500 and .status < 600)] | sort_by(.id) | reverse'
```
### 3. Walk the full window with `limit`/`offset` paging (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. On the kit URL **do not** cursor-page by `id`: a bare `afterId`/`last` (no bodies) routes to the in-memory ring buffer where every entry is `id: 0`, so `max(id)` is always `0` and `afterId=0` never advances. Page with `limit`/`offset` instead — that path queries the DB, returns the wrapped `{entries,total,limit,offset}` shape, and carries real rowids. Walk pages until `entries` is empty.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
OFFSET=0
while :; do
  PAGE=$(curl -s "$KIT/_logs?limit=500&offset=${OFFSET}")
  COUNT=$(echo "$PAGE" | jq '.entries | length')
  [ "$COUNT" -eq 0 ] && break
  echo "$PAGE" | jq -c '.entries[] | {id,tsIso,serviceName,status}'
  OFFSET=$((OFFSET + COUNT))
done
```
### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byContainer, byService }` — perfect for a dashboard tile.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs/stats" | jq '{
  total,
  warn_pct: ((.byLevel.warn // 0) / .total * 100 | floor),
  noisiest: (.byService | to_entries | sort_by(-.value) | .[:3])
}'
```
### 5. Trace one request across kits via `traceId`

**Goal:** one HTTP request that fans out to multiple internal kits shares a single `traceId` (UUID for edge entries; 32-char hex for backend hops). The kit does not filter on `traceId` server-side, so scan a recent window and group client-side. Each `traceId` typically yields a `kind: "request"` (edge) + one or more `kind: "request"`/`"response"` (backend) frames.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
TID="$1"   # e.g. 354a5a0222e7107c46ae2851ded57fa6
curl -s "$KIT/_logs?limit=1000&includeRequestBody=true&includeResponseBody=true" \
  | jq --arg tid "$TID" '[.entries[] | select(.traceId == $tid)] | sort_by(.tsMs)'
```
### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and pick up exactly where you left off after a network blip. Live frames carry `id: <ringSeq>`; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
LAST=${LAST:-0}
curl -sN -H 'Accept: text/event-stream' \
  -H "Last-Event-ID: ${LAST}" \
  "$KIT/_logs/stream?level=warn"
# First frame may be `data: [...]\n\n` with no `id:` line; later live frames are `id: 12345\ndata: {...}\n\n`.
# Heartbeat every 30s:  ": keepalive\n\n"   (ignore)
```
### 7. Capture request + response bodies for a debug slice

**Goal:** body payloads are off by default. Turn them on for a narrow window (e.g. recent warns) to inspect what the upstream actually sent or received. Bodies are capped at `maxBodySize` (default 65 536 B) and content-types in the kit's `excludeContentTypes` (`image/`, `video/`, `audio/`, `application/octet-stream`, `font/`) are skipped — `bodyTruncated: true` flags both cases.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?level=warn&limit=20&includeRequestBody=true&includeResponseBody=true" \
  | jq '.entries[] | select(.bodyTruncated == false) | {
      id, tsIso, status, url,
      reqBody: (.requestBody // null),
      resBody: (.responseBody // null)
    }'
```

## Reference

### `logs` (3) — logs

| Method | Summary | Params |
|--------|---------|--------|
| `GET /_logs/stats` | Get log statistics |  |
| `GET /_logs` | Query centralized logs | `?limit` `?offset` `?projectId` `?containerId` `?serviceName` `?level` `?includeRequestBody` `?includeResponseBody` `?last` `?afterId` `?cursor` `?kind` `?method` `?source` |
| `GET /_logs/stream` | Live-tail logs over Server-Sent Events (v8 SSE contract) | `?projectId` `?containerId` `?kind` `?level` `H:Last-Event-ID` |

**Param notes:**

- `level` — Comma-separated levels (debug,info,warn,error)
- `last` — Return only the last N entries
- `afterId` — Return entries with SQLite row ID greater than this (ASC cursor)
- `cursor` — pagination cursor (signed opaque base64).
- `projectId` — Filter to a single project
- `containerId` — Filter to a single container
- `Last-Event-ID` — numeric ringSeq of the last event received. Server skips entries ≤ this value from the ring buffer on reconnect.


---

<!-- ===== namespace: run ===== -->

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

## When to use

- Resolve `firefox`/`react`/`owner/repo` to a command.
- Cross-provider candidates with stable `set_id`.
- Preview the resolved command via `print_curl` / `preflight`.
- Batch via `POST /api/v1/run/batch`; persist profiles/recipes.

## When NOT to use

Not for: command known → `terminal`, long-lived process → `daemon`, one-shot remote exec → `exec`, arbitrary HTTP → `curl`.

## Prerequisites

- Kit slug `run`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. `GET /api/v1/run/search` → `{ set_id, candidates[] }`.
2. `POST /api/v1/run/resolve` → `shell_command`.

### 2. Preflight

1. `POST /api/v1/run/preflight` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. `POST /api/v1/run/resolve` → resolved command + preview.

### 3. Cursor-paged search

`POST /api/v1/run/search/paged` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; drain manually by carrying `next_cursor` forward until it's null/absent.
### 4. Batch

`POST /api/v1/run/batch`. `mode:"run"` resolves each item to a command.

### 5. Recipes

`POST /api/v1/run/recipes`; invoke via `POST /api/v1/run/recipes/{name}/run` — generated SDK takes `name` positional + a body, NOT a single options object.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint is `GET|POST /api/v1/run/resolve` (operations `GET /api/v1/run/resolve` / `POST /api/v1/run/resolve`).
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). Pass `kind` in the selector to narrow (`kind:'cli'`, `kind:'gui'`), or `kind:'any'` for no filter.
- `limit` default 25, clamped 1..=100.
- 30s query cache; `HOODY_RUN_QUERY_CACHE_TTL_MS`.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only: the response `status` is `"dry-run"` (a single picked candidate) or `"resolved"` (an unpicked candidate set), and carries a `handoff` object whose `state` is `"preview"`. When the resolved candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated. The kit never launches the app or executes anything.
- `POST /api/v1/run/batch` only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `POST /api/v1/run/recipes/{name}/run` / `POST /api/v1/run/recipes/{name}/search` reject disallowed overrides with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped.
- `selected.run_plan` carries `command`/`env`/`cwd`; `argv` is on `selected.execution_plan`.
- `/go/...` are alias routes for bookmarkable resolve URLs — `GET /api/v1/run/go/{rest}` (selector parsed from path segments) and `GET /api/v1/run/t/{terminal_id}/go/{rest}` (terminal id baked into the path prefix). Both are public and supported, but the canonical machine-facing entrypoint is `POST /api/v1/run/resolve` (`GET|POST /api/v1/run/resolve`) — prefer it for programmatic callers.
## Common errors

- `400 INVALID_PICK` — bad `pick_index`/`candidate_id`.
- `409 cursor set expired` — re-search.
- `502 SOURCE_RESOLUTION_FAILED` — a source (e.g. `nix`/`pkgx`) failed or is missing.

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. The default `pick` mode is `ask` (returns candidates, no selection); use `first` to auto-pick the highest-ranked one.

**Step 1 — search.** Returns a `set_id` (binds your follow-up `pick` against this exact candidate list — `set_id` expires after ~300s) and `candidates[]` ranked by score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/run/search?app=firefox&kind=any&limit=5" \
  | jq '{set_id, count: (.candidates|length), top: (.candidates[0]|{candidate_id,title,provider,kind,score})}'
```
**Step 2 — resolve to a command.** `pick: 'first'` returns `shell_command` for the top candidate.

```bash
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d '{"app":"firefox","kind":"any","pick":"first"}' \
  | jq '{shell_command, candidate_id: .selected.candidate_id, status}'
# → { "shell_command": "'/usr/bin/firefox'", "candidate_id": "system-path:/usr/bin/firefox", "status": "dry-run" }
```
### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the resolved shell-form) and `execution_plan.{argv,env,cwd}` (the argv-form). When the candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated so a caller can open the preview; resolve itself never launches anything.

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d '{"app":"echo","kind":"cli","pick":"first"}' \
  | jq '{status, shell_command, argv: .selected.execution_plan.argv, preview_terminal_url}'
```
### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` resolves to `system-path:/usr/bin/git` by default, but you specifically want the `pkgx` candidate at index 2. Bind the pick to a `set_id` to avoid the candidate list shifting under you.

**Step 1 — list candidates with `set_id`.**

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/run/search?app=git&kind=cli&limit=5" \
  | jq '{set_id, listing: (.candidates | to_entries | map({i: .key, id: .value.candidate_id, provider: .value.provider, score: .value.score}))}'
```
**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

```bash
SET="<paste set_id from step 1>"
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg s "$SET" '{app:"git",kind:"cli",set_id:$s,pick:"index",pick_index:2}')" \
  | jq '{shell_command, picked: .selected.candidate_id, provider: .selected.provider}'
```
**Pick by id alternative** — when you know the exact candidate, use `pick: 'id'` + `candidate_id`:

```bash
curl -sf -X POST "$KIT/api/v1/run/resolve" \
  -H 'Content-Type: application/json' \
  -d '{"app":"git","kind":"cli","pick":"id","candidate_id":"system-path:/usr/bin/git"}' \
  | jq .shell_command
```
### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → no filter. `kind` narrows by classification (`cli` / `gui` / `any`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/run/search?app=jq&os=linux&arch=amd64&kind=cli&source=system&limit=5" \
  | jq '{count: (.candidates|length), providers: [.candidates[].provider]}'
# → { "count": 1, "providers": ["system"] }
```
**Tags** are free-form ranking hints (e.g. `tags: ['portable']` boosts AppImage / pkgx candidates). Combine with `kind: 'gui'` for X11 apps, or `os: 'windows'` to filter the catalog to Wine-runnable variants.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/preflight" \
  -H 'Content-Type: application/json' \
  -d '{"app":"xeyes","kind":"gui","pick":"first"}' \
  | jq '{recommended_mode, missing_requirements, policy: .effective_policy}'
```
### 6. Pagination — walk a long candidate list with `POST /api/v1/run/search/paged`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
RESP=$(curl -sf -X POST "$KIT/api/v1/run/search/paged" \
  -H 'Content-Type: application/json' \
  -d '{"selector":{"app":"git","kind":"cli"},"page_size":3}')
echo "$RESP" | jq '{total_count, count: (.items|length), next_cursor}'
CURSOR=$(echo "$RESP" | jq -r .next_cursor)
```
**Step 2 — fetch all pages.** ⚠ The `search/paged` endpoint returns one page per call — there is no built-in drain-all behavior, so walk it manually by carrying `next_cursor` between calls until it's null/absent.
```bash
# Manual: walk by feeding back next_cursor
while [ -n "$CURSOR" ] && [ "$CURSOR" != "null" ]; do
  RESP=$(curl -sf -X POST "$KIT/api/v1/run/search/paged" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg c "$CURSOR" '{selector:{app:"git",kind:"cli"},page_size:3,cursor:$c}')")
  echo "$RESP" | jq '.items | length'
  CURSOR=$(echo "$RESP" | jq -r .next_cursor)
done
```
⚠ `409 cursor set expired` after ~300s — re-run the initial search with `selector` (no cursor) to get a fresh `set_id`.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

⚠ `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form returns `Failed to deserialize ... missing field 'app'`.

**Step 1 — submit.**

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
JID=$(curl -sf -X POST "$KIT/api/v1/run/search/jobs" \
  -H 'Content-Type: application/json' \
  -d '{"app":"firefox","kind":"any"}' \
  | jq -r .job_id)
echo "$JID"   # e.g. 7cbf9b58-1aeb-499d-a8fa-6ed160c90893
```
**Step 2 — poll.** Status transitions `queued → running → done` (or `error`). Search-resolve jobs have a 10-minute TTL refreshed on every status/result read, so polling keeps them alive — but plan to read the result the moment status flips to `done`/`error` rather than relying on the TTL.

```bash
while :; do
  S=$(curl -sf "$KIT/api/v1/run/jobs/$JID" | jq -r .status)
  echo "$S"
  case "$S" in done|error) break;; esac
  sleep 1
done
curl -sf "$KIT/api/v1/run/jobs/$JID" | jq '{status, result}'
```
### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response) or `result: 'run'` (with `selected` + `shell_command`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/batch" \
  -H 'Content-Type: application/json' \
  -d '{"items":[
    {"request_id":"a","mode":"run","selector":{"app":"ls","kind":"cli","pick":"first"}},
    {"request_id":"b","mode":"run","selector":{"app":"echo","kind":"cli","pick":"first"}},
    {"request_id":"c","mode":"search","selector":{"app":"git","kind":"cli","limit":3}}
  ]}' \
  | jq '.items | map({request_id, result, shell: .run.shell_command, count: (.search.candidates|length // null)})'
```
### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; any `overrides.*` outside it is rejected with `400 "recipe override not allowed: <field>"` on `POST /api/v1/run/recipes/{name}/run` — update the recipe to widen the allow-list.

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/recipes" \
  -H 'Content-Type: application/json' \
  -d '{
    "name":"team-js-runtime",
    "description":"Resolve a JS runtime; team-default = node CLI",
    "selector_template":{"app":"node","kind":"cli","os":"linux","arch":"amd64","pick":"first"},
    "allowed_overrides":["app","version","tags"]
  }' | jq 'map(.name)'
```
**Step 2 — list / get / update / delete.**

```bash
curl -sf "$KIT/api/v1/run/recipes" | jq 'map({name, description})'
curl -sf "$KIT/api/v1/run/recipes/team-js-runtime" | jq .
curl -sf -X PATCH "$KIT/api/v1/run/recipes/team-js-runtime" \
  -H 'Content-Type: application/json' \
  -d '{"description":"Updated: now also resolves bun/deno via override"}'
# When done:
curl -sX DELETE "$KIT/api/v1/run/recipes/team-js-runtime"
```
### 10. Invoke a recipe with overrides — `POST /api/v1/run/recipes/{name}/run`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `POST /api/v1/run/resolve` (`{ status, shell_command, selected, ... }`).

```bash
KIT="https://${P}-${C}-run-1.${N}.containers.hoody.com"
curl -sf -X POST "$KIT/api/v1/run/recipes/team-js-runtime/run" \
  -H 'Content-Type: application/json' \
  -d '{"overrides":{"app":"bun"}}' \
  | jq '{status, shell_command, picked: .selected.candidate_id}'
```
**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `POST /api/v1/run/recipes/{name}/search`:

```bash
curl -sf -X POST "$KIT/api/v1/run/recipes/team-js-runtime/search" \
  -H 'Content-Type: application/json' \
  -d '{"overrides":{"app":"node"}}' \
  | jq '{set_id, count: (.candidates|length), providers: [.candidates[].provider] | unique}'
```
⚠ Overrides outside `allowed_overrides` are **rejected** with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped. Use `PATCH /api/v1/run/recipes/{name}` to widen the allow-list.

## Reference

### `configuration` (1) — APIs for retrieving consolidated runtime configuration state including active profile selection

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/config` | Get full runtime configuration |  |

### `documentation` (2) — Self-documenting specification endpoints in JSON and YAML formats

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/openapi.json` | OpenAPI specification (JSON) |  |
| `GET /api/v1/run/openapi.yaml` | OpenAPI specification (YAML) |  |

### `jobs` (2) — APIs for tracking async job status with optional long-polling support for sync and background operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/search/jobs` | Start an async search job | `body*:run_Selector` |
| `GET /api/v1/run/jobs/{job_id}` | Get job status | `?wait` `?timeout_ms` |

**Param notes:**

- `wait` — Set to 'done' to long-poll until job completes
- `timeout_ms` — Long-poll timeout in milliseconds (default 0, max 120000)

### `profiles` (5) — APIs for managing user profiles and defaults including source overrides, pick mode, and display preferences

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/profiles` | Create a new profile | `body*:run_ProfileConfig` |
| `DELETE /api/v1/run/profiles/{profile}` | Delete a profile |  |
| `GET /api/v1/run/profiles` | List all profiles |  |
| `POST /api/v1/run/profiles/{profile}/select` | Select the active profile |  |
| `PATCH /api/v1/run/profiles/{profile}` | Update a profile | `body*` |

**Param notes:**

- `profile` — Profile name
- `profile` — Profile name to select

**Body shapes:**

- `PATCH /api/v1/run/profiles/{profile}` body — `object` — Partial profile fields to update

### `recipes` (7) — APIs for managing saved selector templates and invoking them with controlled overrides

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/recipes` | Create a saved recipe | `body*:run_RecipeConfig` |
| `DELETE /api/v1/run/recipes/{name}` | Delete a saved recipe |  |
| `GET /api/v1/run/recipes/{name}` | Get a saved recipe |  |
| `GET /api/v1/run/recipes` | List saved launch recipes |  |
| `POST /api/v1/run/recipes/{name}/run` | Run using a saved recipe | `body*:run_RecipeExecutionRequest` |
| `POST /api/v1/run/recipes/{name}/search` | Search using a saved recipe | `body*:run_RecipeExecutionRequest` |
| `PATCH /api/v1/run/recipes/{name}` | Update a saved recipe | `body*` |

**Param notes:**

- `name` — Recipe name

**Body shapes:**

- `PATCH /api/v1/run/recipes/{name}` body — `object` — Partial recipe update

### `run` (9) — APIs for searching and running applications across multiple package sources with automatic candidate ranking and selection

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/run/health` | Service health check |  |
| `POST /api/v1/run/preflight` | Preflight a run request | `body*:run_Selector` |
| `POST /api/v1/run/resolve` | Resolve an application via JSON body | `body*:run_Selector` |
| `GET /api/v1/run/resolve` | Resolve an application and return exact shell command | `?app*` `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?terminal_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` |
| `POST /api/v1/run/batch` | Execute a batch of search or run requests | `body*:run_BatchRequest` |
| `GET /api/v1/run/go/{rest}` | Path-based resolve (positional or key-value) | `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?terminal_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` |
| `GET /api/v1/run/t/{terminal_id}/go/{rest}` | Terminal-anchored path-based resolve | `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?pick` `?pick_index` `?candidate_id` `?set_id` `?display` `?origin` `?dry_run` `?print_curl` `?format` `?limit` |
| `GET /api/v1/run/search` | Search for app candidates | `?app*` `?os` `?source` `?kind` `?arch` `?tags` `?profile` `?channel` `?version` `?variant` `?publisher` `?repo` `?release` `?asset` `?limit` |
| `POST /api/v1/run/search/paged` | Search for app candidates with cursor pagination | `body*:run_PagedSearchRequest` |

**Param notes:**

- `app` — Primary name query
- `os` — Target OS filter
- `source` — Source kind filter (repeatable)
- `kind` — App kind filter
- `arch` — Target CPU architecture filter
- `tags` — Free-form tags for filtering and ranking (repeatable)
- `profile` — Named profile for default preferences
- `channel` — Release channel hint
- `version` — Exact version or provider-defined version constraint
- `variant` — Provider-specific variant hint
- `publisher` — Publisher hint for curated registries
- `repo` — Repository hint such as owner/name
- `release` — Release hint such as a tag name
- `asset` — Desired asset name or pattern
- `pick` — Candidate selection mode (ask, first, index, id)
- `pick_index` — Candidate index (required when pick=index)
- `candidate_id` — Specific candidate ID (required when pick=id)
- `set_id` — Bind pick to a specific candidate set
- `terminal_id` — Terminal session ID (default 1)
- `display` — X11 DISPLAY number
- `origin` — Origin identifier for observability propagation
- `dry_run` — If true, force command-only response (hoody-run never executes)
- `print_curl` — Generate curl command (hoody-run)
- `format` — Output format (json or html)
- `limit` — Max candidates (default 25)
- `rest` — Path segments for positional or key-value app specification
- `os` — Target OS filter when not supplied in the path
- `kind` — App kind filter when not supplied in the path
- `terminal_id` — Terminal session ID when not supplied in the path
- `rest` — Path segments for app specification
- `app` — Primary name query (aliases q, name)
- `kind` — App kind filter (gui, cli, any)
- `channel` — Release channel hint (for example stable or beta)
- `variant` — Provider-specific variant hint (for example portable or headless)
- `limit` — Max candidates to return (default 25)

### `sources` (7) — APIs for managing package sources including CRUD operations, enable/disable, priority control, and sync triggers

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/run/sources` | Create a new package source | `body*:run_SourceConfig` |
| `DELETE /api/v1/run/sources/{source_id}` | Delete a package source |  |
| `GET /api/v1/run/sources/{source_id}/diagnostics` | Get runtime diagnostics for a source |  |
| `GET /api/v1/run/sources` | List all package sources |  |
| `POST /api/v1/run/sources/sync` | Sync all sources |  |
| `POST /api/v1/run/sources/{source_id}/sync` | Sync a single source |  |
| `PATCH /api/v1/run/sources/{source_id}` | Update a package source | `body*` |

**Body shapes:**

- `PATCH /api/v1/run/sources/{source_id}` body — `object` — Partial source configuration fields to update


### Body schemas

- `run_PagedSearchRequest` — `{ selector*: run_Selector, cursor: string, page_size: int }`
- `run_Selector` — `{ app*: string, os: run_Os, kind: run_AppKind, source: run_SourceKind[], arch: run_Arch, tags: string[], profile: string, channel: string, version: string, variant: string, publisher: string, repo: string, release: string, asset: string, pick: run_PickMode, pick_index: int, candidate_id: string, set_id: string, terminal_id: int, display: string, origin: string, format: run_OutputFormat, dry_run: bool, print_curl: run_PrintCurlMode, limit: int }`
- `run_BatchRequest` — `{ items: run_BatchItemRequest[] }`
- `run_SourceConfig` — `{ source_id*: string, enabled*: bool, priority*: int, provider*: run_SourceKind, source_type*: run_SourceType, pin: run_SourcePin, config: object }`
- `run_ProfileConfig` — `{ name*: string, description: string, defaults: run_ProfileDefaults, sources_mode: run_ProfileSourceMode, sources: run_ProfileSourceOverride[], policy: run_PolicyConfig }`
- `run_RecipeConfig` — `{ name*: string, description: string, selector_template: run_SelectorTemplate, allowed_overrides: string[] }`
- `run_RecipeExecutionRequest` — `{ overrides: run_SelectorTemplate }`
- `run_Os` — `"linux" | "windows" | "any"`
- `run_AppKind` — `"gui" | "cli" | "any"`
- `run_SourceKind` — `"nix" | "pkgx" | "appimage" | "oci" | "registry" | "system" | "any"`
- `run_Arch` — `"amd64" | "arm64" | "any"`
- `run_PickMode` — `"ask" | "first" | "index" | "id"`
- `run_OutputFormat` — `"json" | "html"`
- `run_PrintCurlMode` — `"hoody-run"`
- `run_BatchItemRequest` — `{ request_id*: string, mode*: run_BatchMode, selector*: run_Selector }`
- `run_SourceType` — `"nix-pkgs" | "nix-flake" | "pkgx" | "app-image-pinned" | "app-image-git-hub-releases" | "app-image-catalog" | "oci-local-images" | "manifest-registry" | …(11 values)`
- `run_SourcePin` — `{ url*: string, sha256: string, author_pubkey_ed25519: string, sig_ed25519: string }`
- `run_ProfileDefaults` — `{ os: run_Os, kind: run_AppKind, source: run_SourceKind[], pick: run_PickMode, terminal_id: int, display: string, limit: int }`
- `run_ProfileSourceMode` — `"inherit" | "allowlist"`
- `run_ProfileSourceOverride` — `{ source_id*: string, enabled: bool, priority: int }`
- `run_PolicyConfig` — `{ require_verified: bool, require_integrity: bool, deny_providers: run_SourceKind[], deny_source_ids: string[] }`
- `run_SelectorTemplate` — `{ app: string, os: run_Os, kind: run_AppKind, source: run_SourceKind[], arch: run_Arch, tags: string[], profile: string, channel: string, version: string, variant: string, publisher: string, repo: string, release: string, asset: string, pick: run_PickMode, pick_index: int, candidate_id: string, set_id: string, terminal_id: int, display: string, origin: string, format: run_OutputFormat, dry_run: bool, print_curl: run_PrintCurlMode, limit: int }`
- `run_BatchMode` — `"search" | "run"`

---

<!-- ===== namespace: sqlite ===== -->

# `sqlite` — SQLite HTTP API

## Purpose

hoody-sqlite: SQL tx, JSON KV, history, time-travel. Keyed by `db` query param. No workspace scoping.

## When to use

- Durable structured state without Postgres.
- KV: TTL, CAS, atomic incr/decr/push/pop, JSON-path, per-key history.
- Multi-statement SQL tx over HTTP; time-travel rollback by N ops or timestamp.

## When NOT to use

Blobs → `files`, supervisors → `daemon`, notebooks → `notes`, control-plane → `api`.

## Prerequisites

- Outside `/hoody/databases` needs `--allow-any-absolute-db-path`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`POST /api/v1/sqlite/db/create` `path` (bare/`./name`/abs under `/hoody/databases`), `init_kv: true` for KV table → `POST /api/v1/sqlite/db` `{ transaction: [{ statement, values?|valuesBatch? }] }` (`create_db_if_missing: true` skips create) → `GET /api/v1/sqlite/history`.

### KV CRUD + CAS + counters

- `PUT /api/v1/sqlite/kv/{key}` — `ttl`, `if_match` (CAS), `path`, `history`.
- `GET /api/v1/sqlite/kv/{key}` — `path`, `at_timestamp`. `HEAD /api/v1/sqlite/kv/{key}` takes only `db`/`table`; `DELETE /api/v1/sqlite/kv/{key}` takes only `db`/`table`/`history` (`history` keeps the tombstone).
- `POST /api/v1/sqlite/kv/{key}/incr`/`POST /api/v1/sqlite/kv/{key}/decr`/`POST /api/v1/sqlite/kv/{key}/push`/`pop`/`POST /api/v1/sqlite/kv/{key}/remove` — atomic, `path`-aware.

### Time-travel (needs `history: true`)

- `GET /api/v1/sqlite/kv/{key}/history` (default 50, max 1000); `GET /api/v1/sqlite/kv/{key}/snapshot` at `op_number`.
- `GET /api/v1/sqlite/kv/snapshot` / `GET /api/v1/sqlite/kv/diff` — Unix `timestamp` / diff.
- `POST /api/v1/sqlite/kv/{key}/rollback` last N; `POST /api/v1/sqlite/kv/rollback`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). Body is **required** by SDK/CLI; pass `{}` for full-table rollback or `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope.

### Bulk + shareable

- `POST /api/v1/sqlite/kv/batch/set`/`POST /api/v1/sqlite/kv/batch/get`/`POST /api/v1/sqlite/kv/batch/delete` — single SQLite tx.
- `GET /api/v1/sqlite/query` — GET, URL-safe base64 `sql`, read-only. `GET /api/v1/sqlite/health`/`GET /api/v1/sqlite/health/cache`.

## Quirks & gotchas

- **Bare-URL auth (no claim/token headers).** Like every kit (including `agent`), the `sqlite` kit accepts the bare per-container kit URL — no `X-Hoody-Container-Claim` or `X-Hoody-Token` headers required. The capability URL itself is the bearer.
- **Tx item key matters: `"query"` vs `statement` are NOT interchangeable.** Each `transaction[i]` MUST carry exactly one of `"query"` (returns rows) or `statement` (rows-affected only). If you put a SELECT under `statement`, you silently get back `rowsUpdated: 0` and no data. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). Relative paths containing `/` or `\` are **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Outside `/hoody/databases` needs `--allow-any-absolute-db-path`. Symlinks followed; outward targets rejected. `:memory:` databases are rejected.
- Directory mode requires absolute db (`directory-mode: invalid path input: path must be absolute`).
- Tx items: `statement` or alias `sql`. `POST /api/v1/sqlite/db` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), PRAGMA writes, VACUUM, ATTACH/DETACH. Use `POST /api/v1/sqlite/db` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`PUT /api/v1/sqlite/kv/{key}` body is a JSON-encoded STRING**, not an object. Generated SDK type is `string`; encode objects yourself before sending (e.g. JSON-stringify the value). Same for the `POST /api/v1/sqlite/kv/batch/set` per-item `value`.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to skip recording — but later `GET /api/v1/sqlite/kv/{key}/history` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `GET /api/v1/sqlite/kv` w/ `at_timestamp` → time-travel handler (different envelope, ignores `offset`). `getHistory.limit`: 0→50, >1000→1000.
- `GET /api/v1/sqlite/query` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — the kit URL alone is the credential, share carefully.
- CLI: `hoody db` (aliases `sql`, `sqlite`); KV under `hoody kv`.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute`.
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 in-memory databases are not supported`.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `POST /api/v1/sqlite/kv/batch/set` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409 time-travel chain gap` when the requested timestamp falls inside a `history: false` window.
- Per-statement tx errors → `{ reqIdx, error }`; HTTP 200 if tx parsed.

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Every step in every example was live-tested against a real `sqlite-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree need the kit's `--allow-any-absolute-db-path` flag (`/tmp/...` works on dev kits).

**Two SQL field names that are NOT interchangeable:** in a transaction item, the `"query":"..."` key is for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key is for DDL/DML (returns `rowsUpdated` only). Putting a SELECT under `"statement"` runs it but throws away rows — `rowsUpdated:0` even when matches exist. The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/tmp/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```bash
KIT="https://${P}-${C}-sqlite-1.${N}.containers.hoody.com"
DB="/tmp/sqlite-examples-$RANDOM.db"
curl -sf -X POST "$KIT/api/v1/sqlite/db/create?path=$DB&init_kv=true"
```
**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[
    {"statement":"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)"},
    {"statement":"CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"},
    {"statement":"INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)","values":["Ada","ada@example.com",1778191500]}
  ]}'
```
**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key — `statement` returns `rowsUpdated` only and silently drops rows).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[{"query":"SELECT id, name, email FROM users"}]}' | jq '.results[0].resultSet'
```
### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `HEAD /api/v1/sqlite/kv/{key}` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the raw JSON value (string, object, array — kit infers `content_type`); query params carry `ttl` in seconds.

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/session:alex?db=$DB&ttl=60" \
  -H 'Content-Type: application/json' \
  --data '{"user_id":"d6ec...","scopes":["read","write"]}'
```
**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses.

```bash
curl -sf -I "$KIT/api/v1/sqlite/kv/session:alex?db=$DB" -o /dev/null -w '%{http_code}\n'
```
**Step 3 — explicit delete** (don't wait for TTL). `DELETE /api/v1/sqlite/kv/{key}` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `GET /api/v1/sqlite/kv/{key}`.

```bash
curl -sf -X DELETE "$KIT/api/v1/sqlite/kv/session:alex?db=$DB"
```
### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/config?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"version":1,"feature_x":false}'
```
**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```bash
CUR=$(curl -sf "$KIT/api/v1/sqlite/kv/config?db=$DB")
ENC=$(jq -rn --arg s "$CUR" '$s|@uri')
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/config?db=$DB&if_match=$ENC" \
  -H 'Content-Type: application/json' \
  --data '{"version":2,"feature_x":true}'
```
**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X PUT "$KIT/api/v1/sqlite/kv/config?db=$DB&if_match=stale" \
  -H 'Content-Type: application/json' --data '{"version":99}'
# → 412
```
### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `POST /api/v1/sqlite/kv/{key}/incr`/`POST /api/v1/sqlite/kv/{key}/decr` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `POST /api/v1/sqlite/kv/{key}/decr` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/incr?db=$DB&delta=1"
```
**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `POST /api/v1/sqlite/kv/{key}/decr` to go the other way — a negative `delta` is rejected with `400`.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/incr?db=$DB&delta=10"
```
**Step 3 — burn down by 3** (e.g. consume 3 quota units). Final value is plain text — `GET /api/v1/sqlite/kv/{key}` returns the integer body directly, not wrapped.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/rate:alex:hour/decr?db=$DB&delta=3"
curl -sf "$KIT/api/v1/sqlite/kv/rate:alex:hour?db=$DB"   # → 8
```
### 5. JSON-path read & partial update on a nested doc

**Goal:** stash a user-prefs document, read **one** field with `path=`, then mutate **only** that field without rewriting the whole blob. The path applies to both reads and writes.

**Step 1 — seed full document.**

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/profile?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Ada","prefs":{"theme":"dark","lang":"en"}}'
```
**Step 2 — read just `prefs.theme`**: returns the leaf value (`"dark"`), not the parent object.

```bash
curl -sf "$KIT/api/v1/sqlite/kv/profile?db=$DB&path=prefs.theme"
# → "dark"
```
**Step 3 — patch one leaf**. The PUT body is the **new leaf value** (here `"light"`), not the full document. `lang` and `name` are untouched.

```bash
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/profile?db=$DB&path=prefs.theme" \
  -H 'Content-Type: application/json' --data '"light"'
curl -sf "$KIT/api/v1/sqlite/kv/profile?db=$DB"
# → {"name":"Ada","prefs":{"lang":"en","theme":"light"}}
```
### 6. Time-travel — record three states of a feature flag, roll back two

**Goal:** undo the last two writes on a key without losing earlier history. Requires `history=true` on every write you want to be reversible.

**Step 1 — three sequential states** with history recording.

```bash
for v in '{"chat":false,"voice":false}' '{"chat":true,"voice":false}' '{"chat":true,"voice":true}'; do
  curl -sf -X PUT "$KIT/api/v1/sqlite/kv/feature-flags?db=$DB&history=true" \
    -H 'Content-Type: application/json' --data "$v"
done
```
**Step 2 — inspect history** (`GET /api/v1/sqlite/kv/{key}/history` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` are base64 and appear only for non-JSON content types).

```bash
curl -sf "$KIT/api/v1/sqlite/kv/feature-flags/history?db=$DB&limit=10" | jq '.operations | map({op_number, op: .operation.op})'
```
**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/feature-flags/rollback?db=$DB&steps=2"
curl -sf "$KIT/api/v1/sqlite/kv/feature-flags?db=$DB"
# → {"chat":false,"voice":false}
```
### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `GET /api/v1/sqlite/kv/{key}/snapshot` (per-key, by `op_number`) and `GET /api/v1/sqlite/kv/diff` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```bash
curl -sf "$KIT/api/v1/sqlite/kv/feature-flags/snapshot?db=$DB&op_number=1"
# → {"value":{"chat":false,"voice":false},"op_number":1,"content_type":"application/json","success":true}
```
**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```bash
FROM=$(date +%s); sleep 1
curl -sf -X PUT "$KIT/api/v1/sqlite/kv/cmp-test?db=$DB&history=true" \
  -H 'Content-Type: application/json' --data '{"v":1}'
sleep 1; TO=$(date +%s)
```
**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```bash
curl -sf "$KIT/api/v1/sqlite/kv/diff?db=$DB&from=$FROM&to=$TO" | jq '.stats, .changes'
```
### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. Each call wraps in a single SQLite tx; cap is 100 items per batch.

**Important wire-format detail:** in `POST /api/v1/sqlite/kv/batch/set`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/batch/set?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"items":[
    {"key":"u:1","value":"{\"name\":\"alice\"}","content_type":"application/json"},
    {"key":"u:2","value":"{\"name\":\"bob\"}","content_type":"application/json"},
    {"key":"u:3","value":"{\"name\":\"carol\"}","content_type":"application/json","ttl":3600}
  ]}'
```
**Step 2 — bulk get** (missing keys come back as `null`, present ones as `{value, content_type}`).

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/batch/get?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"keys":["u:1","u:2","u:3","u:404"]}'
```
**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/kv/batch/delete?db=$DB" \
  -H 'Content-Type: application/json' --data '{"keys":["u:1","u:2","u:3"]}'
```
### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** mint a one-shot URL that runs a SELECT — safe to embed in dashboards / logs because the kit enforces read-only. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted (the kit falls back to `base64.RawURLEncoding`).

**Step 1 — encode** the query.

```bash
SQL='SELECT id, name, email FROM users LIMIT 10'
SQL_B64=$(printf '%s' "$SQL" | base64 -w0 | tr '+/' '-_')   # URL-safe base64; padding optional
echo "$SQL_B64"
```
**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```bash
curl -sfG "$KIT/api/v1/sqlite/query" \
  --data-urlencode "db=$DB" \
  --data-urlencode "sql=$SQL_B64"
```
**Step 3 — paste-able URL** (e.g. dashboard link). The kit URL itself is the auth grant — guard who you share it with.

```bash
echo "$KIT/api/v1/sqlite/query?db=$(printf '%s' "$DB" | jq -sRr @uri)&sql=$SQL_B64"
```
### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) through one prepared statement instead of one tx item per row. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[{
    "statement":"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
    "valuesBatch":[
      ["Bob","bob@example.com",1778000000],
      ["Carol","carol@example.com",1778000100],
      ["Dan","dan@example.com",1778000200]
    ]
  }]}'
```
**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key).

```bash
curl -sf -X POST "$KIT/api/v1/sqlite/db?db=$DB" \
  -H 'Content-Type: application/json' \
  --data '{"transaction":[{"query":"SELECT COUNT(*) AS n FROM users"}]}' | jq '.results[0].resultSet'
```
**Step 3 — clean up** (drop the throwaway db file via `files`, or just leave under `/tmp/` for the next reboot to reclaim).

```bash
# Via files kit:
FKIT="https://${P}-${C}-files-1.${N}.containers.hoody.com"
curl -sf -X DELETE "$FKIT/api/v1/files/${DB#/}"   # strip leading / for route param
```

## Reference

### `database` (2) — Database

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/db/create` | Create new SQLite database | `?path*` `?init_kv` `?kv_table` |
| `POST /api/v1/sqlite/db` | Execute SQL transaction | `?db*` `?create_db_if_missing` `body*:sqlite_main.request` |

**Param notes:**

- `path` / `db` — Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db)
- `init_kv` — Initialize KV store tables
- `kv_table` — Custom KV table name
- `create_db_if_missing` — Create database file if it is missing

### `docs` (2) — API documentation

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/openapi.json` | Get OpenAPI specification (JSON redirect) |  |
| `GET /api/v1/sqlite/openapi.yaml` | Get OpenAPI specification (YAML) |  |

### `health` (2) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/health` | Health check |  |
| `GET /api/v1/sqlite/health/cache` | Cache health snapshot |  |

### `history` (4) — Query execution history and statistics

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/sqlite/history` | Clear query history | `?db*` |
| `DELETE /api/v1/sqlite/history/{index}` | Delete history entry | `?db*` |
| `GET /api/v1/sqlite/history/stats` | Get history statistics | `?db*` |
| `GET /api/v1/sqlite/history` | Get query history | `?db*` `?limit` |

**Param notes:**

- `db` — Database file path
- `limit` — Maximum number of entries to return

### `kvStore` (19) — Key-Value store operations with TTL and namespaces

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/kv/batch/delete` | Batch delete multiple keys | `?db*` `?table` `body*:sqlite_main.kvBatchDeleteRequest` |
| `POST /api/v1/sqlite/kv/batch/get` | Batch get multiple keys | `?db*` `?table` `body*:sqlite_main.kvBatchGetRequest` |
| `POST /api/v1/sqlite/kv/batch/set` | Batch set multiple keys | `?db*` `?table` `body*:sqlite_main.kvBatchSetRequest` |
| `GET /api/v1/sqlite/kv/diff` | Compare table snapshots | `?db*` `?table` `?from*` `?to*` `?keys` |
| `POST /api/v1/sqlite/kv/{key}/decr` | Atomic decrement | `?db*` `?table` `?delta` `?path` `?history` |
| `DELETE /api/v1/sqlite/kv/{key}` | Delete key | `?db*` `?table` `?history` |
| `HEAD /api/v1/sqlite/kv/{key}` | Check if key exists | `?db*` `?table` |
| `GET /api/v1/sqlite/kv/{key}` | Get value by key | `?db*` `?table` `?path` `?at_timestamp` `?rebuild` |
| `GET /api/v1/sqlite/kv/{key}/history` | Get key operation history | `?db*` `?table` `?limit` |
| `GET /api/v1/sqlite/kv/{key}/snapshot` | Get key snapshot at operation | `?db*` `?table` `?op_number*` |
| `GET /api/v1/sqlite/kv/snapshot` | Get table snapshot at timestamp | `?db*` `?table` `?timestamp*` `?limit` `?prefix` |
| `POST /api/v1/sqlite/kv/{key}/incr` | Atomic increment | `?db*` `?table` `?delta` `?path` `?history` |
| `GET /api/v1/sqlite/kv` | List keys | `?db*` `?table` `?prefix` `?limit` `?offset` `?at_timestamp` |
| `POST /api/v1/sqlite/kv/{key}/pop` | Remove from array end | `?db*` `?table` `?path` `?history` |
| `POST /api/v1/sqlite/kv/{key}/push` | Append to array | `?db*` `?table` `?path` `?history` `body*` |
| `POST /api/v1/sqlite/kv/{key}/remove` | Remove array element | `?db*` `?table` `?path` `?index` `?history` `body*` |
| `POST /api/v1/sqlite/kv/{key}/rollback` | Rollback key operations | `?db*` `?table` `?steps` |
| `POST /api/v1/sqlite/kv/rollback` | Rollback entire table | `?db*` `?table` `?to_timestamp*` `?dry_run` `?confirm` `body*:sqlite_main.kvTableRollbackRequest` |
| `PUT /api/v1/sqlite/kv/{key}` | Set value for key | `?db*` `?table` `?path` `?ttl` `?if_match` `?history` `?create_db_if_missing` `body*:string` |

**Param notes:**

- `db` — Database file path
- `table` — Custom table name
- `from` — Starting timestamp (Unix)
- `to` — Ending timestamp (Unix)
- `keys` — Comma-separated list of keys to compare (optional)
- `key` — Key name
- `delta` — Amount to decrement
- `path` — JSON path to nested numeric value
- `history` — Enable history tracking
- `db` — Database file path or directory
- `key` — Key name (supports / for hierarchical keys)
- `path` — JSON path for nested value extraction
- `at_timestamp` — Unix timestamp for time-travel query (selects handleKVAtTimestamp)
- `rebuild` — Rebuild cache (directory mode only)
- `limit` — Maximum number of operations to return (0 → default 50, clamped to maximum 1000)
- `op_number` — Operation number to reconstruct from
- `timestamp` — Unix timestamp to reconstruct from
- `limit` — Maximum number of keys to return
- `prefix` — Filter keys by prefix
- `delta` — Amount to increment
- `limit` — Maximum number of results
- `offset` — Skip N results for pagination (regular LIST only; ignored when at_timestamp is set)
- `at_timestamp` — Unix timestamp for time-travel LIST (selects handleKVListAtTimestamp; returns a different envelope and ignores offset)
- `path` — JSON path to nested array
- `index` — Array index to remove
- `steps` — Number of operations to rollback
- `to_timestamp` — Target timestamp to rollback to (Unix)
- `dry_run` — Preview changes without applying
- `confirm` — Must be 'yes' to execute actual rollback
- `path` — JSON path for nested value update
- `ttl` — Time-to-live in seconds
- `if_match` — Current value for compare-and-swap
- `create_db_if_missing` — Create database file if it is missing

**Body shapes:**

- `POST /api/v1/sqlite/kv/{key}/push` body — `object` — Value to append
- `POST /api/v1/sqlite/kv/{key}/remove` body — `object` — Request body with value to match and remove
- `PUT /api/v1/sqlite/kv/{key}` body — `string` — Value to store

### `query` (1) — Query

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/sqlite/query` | Execute shareable SQL query | `?db*` `?sql*` |

**Param notes:**

- `db` — Database file path
- `sql` — Base64-encoded SQL query

### `sql` (1) — SQL database operations

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/sqlite/maintenance` | Run a database maintenance operation | `?db*` `?timeout` `body*` |

**Param notes:**

- `db` — Database path (absolute path, bare name, or./name shorthand resolved to /hoody/databases/*.db)
- `timeout` — Request deadline in seconds (clamped to [1, 300])

**Body shapes:**

- `POST /api/v1/sqlite/maintenance` body — `object` — Maintenance request: {op: wal_checkpoint_truncate\|vacuum_into\|quick_check, dest_path?: string}


### Body schemas

- `sqlite_main.request` — `{ resultFormat: string, transaction: sqlite_main.requestItem[] }`
- `sqlite_main.kvBatchDeleteRequest` — `{ keys*: string[] }`
- `sqlite_main.kvBatchGetRequest` — `{ keys*: string[] }`
- `sqlite_main.kvBatchSetRequest` — `{ items*: sqlite_main.kvBatchSetItem[] }`
- `sqlite_main.kvTableRollbackRequest` — `{ exclude_keys: string[], keys: string[] }`
- `sqlite_main.requestItem` — `{ noFail: bool, query: string, statement: string, values: int[], valuesBatch: int[][], sql: string }`
- `sqlite_main.kvBatchSetItem` — `{ content_type: string, key*: string, ttl: int, value: string }`

---

<!-- ===== namespace: terminal ===== -->

# `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket

## Purpose

Real PTY per container, numeric `terminal_id` (1–65535). REST + WebSocket. Multiplayer; sessions persist.

## When to use

- **Interactive TUIs** that paint the screen (Claude Code, Codex, vim, htop, less, fzf, ssh, etc.) — these need a real PTY; only `terminal` provides one.
- **Durable / long-lived programs that you may need to interact with later** (the agent you spawned, a coding assistant, a chat REPL) — pin a stable `terminal_id` (1–39999) and reattach over WS or REST. Daemon-supervised processes have no TTY, so they can't host these.
- Sequenced commands sharing shell state, keystroke automation, screen capture, regex-search the rendered buffer.
- SSH / SOCKS5 sessions (`ssh_*` / `socks5_*`).
- Host introspection (`* /api/v1/system/*`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process — the `display-<terminal_id>` kit URL also pairs by id, so reusing breaks GUI routing too. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `40000–65535`, run the command, then evict at 300 s; your Claude Code / Codex session would die when the timer fires.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- One-shot synchronous request/response → `exec`.
- File I/O → `files`. GUI rendering → `display`. Schedule → `cron`.

## Prerequisites

- Container with `terminal` kit running; capability URL.
- SSH needs reachable `ssh_host:ssh_port`; automation needs existing `terminal_id`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Persistent interactive session

`POST /api/v1/terminal/create` (pin `terminal_id` or `ephemeral=true`) → `POST /api/v1/terminal/execute` (`wait=true` is the default → sync; pass `wait=false` for async `command_id`; shares shell state) → `GET /api/v1/terminal/result/{command_id}` → `GET /api/v1/terminal/raw`/`GET /api/v1/terminal/screenshot` → `DELETE /api/v1/terminal/{terminal_id}`.

### 2. Ephemeral one-off execute

`POST /api/v1/terminal/execute` `ephemeral=true`, `wait=true` — auto ID 40000–65535, runs `cmd`, cleans up. Later: `GET /api/v1/terminal/result/{command_id}` before ephemeral-result-timeout (300s).

### 3. Automate a TUI

`POST /api/v1/terminal/create` (or `POST /api/v1/terminal/execute` to launch) → `POST /api/v1/terminal/press` (`Down`/`Enter`/`F2`; `GET /api/v1/terminal/keys`) → `POST /api/v1/terminal/paste` (`bracketed=true`) → `POST /api/v1/terminal/wait` (`stable` or `pattern`) → `GET /api/v1/terminal/snapshot`/`GET /api/v1/terminal/find`.

### 4. Live stream — WebSocket

`GET /api/v1/terminal/ws` at `/api/v1/terminal/ws?terminal_id=…`. Multiple WS clients attach simultaneously; writes broadcast to PTY. Inject from REST via `POST /api/v1/terminal/write` or `POST /api/v1/terminal/press`. `POST /api/v1/terminal/execute/{command_id}/abort` interrupts by `command_id`.

### 5. Container introspection

`GET /api/v1/system/processes`, `GET /api/v1/system/processes/{pid}`, `POST /api/v1/system/process/signal`, `GET /api/v1/system/ports`, `GET /api/v1/system/resources`, `GET /api/v1/system/displays`, `GET /api/v1/system/daemon`, `POST /api/v1/system/reboot`/`POST /api/v1/system/shutdown`. Both `GET /api/v1/system/processes` and `GET /api/v1/system/ports` also have streamed `*Iterator` variants for paginated traversal.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–39999, **never** the ephemeral range 40000–65535, **never** re-use one another program is on).
2. `POST /api/v1/terminal/create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/workspace'` (or wherever).
3. `POST /api/v1/terminal/execute` `cmd: 'claude code'` (or `codex`, `aider`, `gemini …`) with `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request.
4. Reattach any time: `GET /api/v1/terminal/ws` (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or REST via `POST /api/v1/terminal/press` / `POST /api/v1/terminal/paste` to drive it.
5. Tear down only when really done: `sessions.delete <terminal_id>`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a container reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `1`, Codex on `2`). The `display-<id>` kit URL pairs by id, so non-collision keeps GUI routing clean too.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. **You must explicitly pair the IDs** — the kit injects `DISPLAY` from the JSON `display` field on `POST /api/v1/terminal/create`; there is no automatic `terminal_id ⇒ DISPLAY=:N` mapping.

1. `POST /api/v1/terminal/create` with a pinned `terminal_id` (e.g. `1`) AND a matching `display: "1"` field (string in the SDK type), so the kit exports `DISPLAY=:1` into the PTY.
2. From that session: `POST /api/v1/terminal/execute` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-1`.
3. Open the matching display kit URL — `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` (read `projectId`, `containerId`, and `server_name` from `GET /api/v1/containers/{id}`; the SDK exposes `getKitUrl('display', container, 1)` and `getKitUrls(container)` if you want to skip the string manipulation).
4. Drive the GUI via the `display` namespace:
   - `GET /api/v1/display/screenshot` — see what's on screen (use `base64=true` for vision agents).
   - `POST /api/v1/display/input/click-at` `{ x, y, button }` — left/right click; `POST /api/v1/display/input/type-at` `{ text }` — keyboard.
   - `POST /api/v1/display/window/search` `{ name | class }` → `POST /api/v1/display/window/focus` / `GET /api/v1/display/window/{windowId}/geometry` / `GET /api/v1/display/window/active` to focus + locate.
   - `POST /api/v1/display/input/batch` — bulk input replay; `POST /api/v1/display/input/wait` between actions.
5. Tear down: kill the X process via `POST /api/v1/system/process/signal` from the terminal session, or `DELETE /api/v1/terminal/{terminal_id}` to drop the whole shell + its child GUIs.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=1`↔`display:":1"`, `terminal_id=2`↔`display:":2"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, swap step 3 for the `desktop-<N>` alias (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-HTTP.md`). The desktop alias auto-spawns the DE for you; this recipe is for spawning **specific** apps under your own control.

## Quirks & gotchas

- **Sharing a terminal URL = handing out root.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as root: read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `proxyPermissionsContainer`. Share only with people you'd trust with `ssh root@…`. For wider audiences, gate (`setPasswordGroup` / `setTokenGroup` / `setIpGroup`), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script or a read-only `display` stream over a live PTY.
- `terminal_id` numeric **1–65535**. **40000–65535 reserved for ephemeral**; pin manual IDs in 1–39999.
- `terminal_id=0` = sentinel "treat as absent".
- **Display pairing.** GUI apps run with the `DISPLAY` value supplied by the JSON `display` field on `POST /api/v1/terminal/create`. There is no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — if you want X11 rendering on display `:N`, pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` returns `/execute` immediately even with `wait=true`; queues until named PID exits (TUI-safe).
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is sent as RAW UTF-8 (written straight into the PTY unmodified); only the URL-form `?cmd=<base64>` is base64-decoded.**
- **`/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A body-only `terminal_id` is rejected by the validator before routing.
- Completion via `COMMAND_COMPLETED_MARKER_{id}` tail; stripped before `/result/{id}`. Programs swallowing it hang `wait=true`.
- **`wait=false` returns `status:"queued"` or `"running"` immediately** (NOT `"completed"`) — the kit only tracks the prompt-marker, not the underlying PID. Re-check actual output via `GET /api/v1/terminal/raw` / `GET /api/v1/terminal/snapshot`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. (Note: the generated SDK type only allows `png | jpeg | gif`, so `jpg` works only via raw HTTP.)
- **`POST /api/v1/system/process/signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).
- `hoody pty` (and `hoody ssh`, `hoody run`) rewrite to `hoody shell` — an interactive PTY, or a one-shot via a POSITIONAL command (`hoody pty <cid> -- uname -a`). There is no `--command` flag and no `--ephemeral` flag on `shell`. For pinned ids on the automation surface use `terminal sessions exec --terminal-id <n>`.

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id; the lower-level validator logs a near-identical `0-65535` warning.
- `400` config-error on `POST /api/v1/terminal/create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `404` on `GET /api/v1/terminal/result/{command_id}` after ephemeral-result-timeout — buffer GC'd.
- "Unknown program name" on `POST /api/v1/proxy/aliases` → use `program=exec`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Every step in every example was live-tested against a real `terminal-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

⚠ The HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body parser only consumes the `command`, `id`, `timeout`, the boolean wait sync flag, `cwd` and `env` keys); missing the query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`. Always pass `?terminal_id=N`. The `command` body field is sent as **raw UTF-8** (written straight into the PTY unmodified; only the URL form `?cmd=<base64>` is base64-decoded). `wait=true` returns when the kit sees the completion marker; programs that swallow the marker or only background-fork can return `status:"completed"` with empty stdout — re-check via `GET /api/v1/terminal/raw` if in doubt. SDK callers pass `terminal_id` / `ephemeral` / `defer_pid` / `display` / `ssh_*` in the **options object** (2nd arg), NOT in the body: `POST /api/v1/terminal/execute`.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session. All four steps live-verified.

**Step 1 — create the session.** `terminal_id` is required in the body; pin in `1–39999`.

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{"terminal_id":100,"shell":"/bin/bash","cols":120,"rows":30}'
# → { "status":"ok", "terminal_id":"100", "shell_ready":true, ... }
```
**Step 2 — execute** with `wait=true`. The body's `command` field is **raw UTF-8** (no base64).

```bash
RESP=$(curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=100&wait=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"echo HELLO; uname -a"}')
CID=$(echo "$RESP" | jq -r .command_id)
echo "command_id=$CID"
```
**Step 3 — re-fetch the result later** via `GET /api/v1/terminal/result/{command_id}`. This is a pinned (non-ephemeral) session, so the result stays available until the session is idle-reaped at `terminal-idle-timeout` (300 s default).

```bash
curl -sf "$KIT/api/v1/terminal/result/$CID" | jq '{status, exit_code, stdout: (.stdout|tostring|.[0:200])}'
```
**Step 4 — clean up.** Always delete the session you created — autostart may re-spawn id 1, so explicit delete keeps your pinned ids tidy.

```bash
curl -sX DELETE "$KIT/api/v1/terminal/100"
```
### 2. Ephemeral one-off — run a command without pinning anything

**Goal:** behave like `child_process.exec` — auto-allocated PTY, runs, evicts. No need to track a terminal_id.

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/execute?ephemeral=true&wait=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"date -u +%FT%TZ; uname -m"}' \
  | jq '{terminal_id, exit_code, stdout}'
```
⚠ Ephemeral allocates from `40000–65535` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

### 3. Automate a TUI — paste, press, wait, snapshot, find

**Goal:** drive an interactive program (here a simple shell echo, but the same recipe works for `htop`, `vim`, `fzf`, …). All five automation calls live-verified against a real session.

**Step 1 — create the session and paste a line** (raw, not base64; bracketed-paste optional).

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":101}' >/dev/null
curl -sX POST "$KIT/api/v1/terminal/paste?terminal_id=101" \
  -H 'Content-Type: application/json' \
  -d '{"text":"echo PASTED_TEXT","bracketed":false}'
```
**Step 2 — press Enter, wait for the screen to go stable, snapshot + regex-find.**

```bash
curl -sX POST "$KIT/api/v1/terminal/press?terminal_id=101" \
  -H 'Content-Type: application/json' -d '{"keys":["enter"]}'
curl -sX POST "$KIT/api/v1/terminal/wait?terminal_id=101" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"stable","debounce_ms":500,"timeout_ms":3000}' | jq .status
curl -sf "$KIT/api/v1/terminal/snapshot?terminal_id=101" | jq '.lines[0:4]'
curl -sf "$KIT/api/v1/terminal/find?terminal_id=101&pattern=PASTED" | jq .hits
```
**Step 3 — discover what keys you can press** (named keys differ per kit build):

```bash
curl -sf "$KIT/api/v1/terminal/keys" | jq '.keys | length, .keys[0:8]'
```
Cleanup: `DELETE /api/v1/terminal/101`.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL, `terminal_id` in query. Inject input via REST `/write` or `/press`; the WS receives the rendered bytes.

```bash
# Make sure session exists:
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":102}' >/dev/null
WS=$(echo "$KIT" | sed 's|^https://|wss://|')
# Stream live (websocat / wscat):
websocat "$WS/api/v1/terminal/ws?terminal_id=102&readonly=true" &
# Drive from another shell — output appears on the WS reader:
curl -sX POST "$KIT/api/v1/terminal/write?terminal_id=102" \
  -H 'Content-Type: application/json' -d '{"input":"echo VIA_WRITE\n"}'
```
`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `DELETE /api/v1/terminal/{terminal_id}`.

### 5. Container introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness. All five endpoints live-verified.

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/system/resources"          | jq '{used_pct: .memory.used_percent, load: .cpu.load_1min}'
curl -sf "$KIT/api/v1/system/processes?limit=5"  | jq '.processes[] | {pid, name, cpu_percent}'
curl -sf "$KIT/api/v1/system/ports"              | jq '.[] | {port, program, user}'
curl -sf "$KIT/api/v1/system/displays"           | jq '.[] | {display, user, connected_clients}'
curl -sf "$KIT/api/v1/system/daemon"             | jq '.[] | {name, enabled}'
curl -sf "$KIT/api/v1/system/processes/1"        | jq '{pid, name, cmdline}'
```
⚠ `POST /api/v1/system/reboot` and `POST /api/v1/system/shutdown` exist on the same surface — don't call them on a shared dev container, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. **You must pair the ids explicitly**: pass `display: 10` on `POST /api/v1/terminal/create` so the kit exports `DISPLAY=:10` (the kit does NOT auto-derive DISPLAY from `terminal_id`).

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{"terminal_id":10,"display":"10"}' >/dev/null
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=10&wait=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"xeyes &"}'
```
**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```bash
curl -sf "$KIT/api/v1/system/displays" \
  | jq '.[] | select(.display==10) | {display, user, windows: (.windows|length)}'
DISPLAY_KIT="https://${P}-${C}-display-10.${N}.containers.hoody.com"
# ... then any display.* call against $DISPLAY_KIT
```
Cleanup: kill `xeyes` via `system.sendSignal { name: 'xeyes', signal: 'SIGTERM' }` or just `DELETE /api/v1/terminal/{terminal_id}` (drops the shell + child GUIs).

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the container's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{
    "terminal_id":11,
    "shell":"ssh",
    "ssh_host":"10.0.0.42",
    "ssh_user":"deploy",
    "ssh_port":"22",
    "ssh_password":"hunter2"
  }'
# Then drive it like any other PTY (body `command` is raw UTF-8):
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=11&wait=true" \
  -H 'Content-Type: application/json' -d '{"command":"hostname; whoami"}'
```
For SOCKS5, swap to `socks5_host` / `socks5_port` / `socks5_user` / `socks5_pass`. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with `wait=false`** so the request returns instantly while the agent stays alive in the PTY:

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create?cwd_auto_create=true" \
  -H 'Content-Type: application/json' \
  -d '{"terminal_id":50,"shell":"bash","cwd":"/workspace"}'
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=50&wait=false" \
  -H 'Content-Type: application/json' \
  -d '{"command":"sleep 600; echo agent-stopped"}'   # placeholder for `claude`/`codex`
```
**Step 2 — reattach later** — same `terminal_id`, WS or REST, multiplayer:

```bash
WS=$(echo "$KIT" | sed 's|^https://|wss://|')
websocat "$WS/api/v1/terminal/ws?terminal_id=50"
# Or peek without connecting:
curl -sf "$KIT/api/v1/terminal/snapshot?terminal_id=50" | jq '.lines[-5:]'
```
⚠ `wait=false` returns `status:"queued"` or `"running"` immediately (NOT `"completed"`) because the kit only tracks the prompt marker, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `GET /api/v1/terminal/raw` / `GET /api/v1/terminal/snapshot`. **Never** start a durable agent with `ephemeral=true`: the 300 s sweep would kill it.

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` finishes. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":60}' >/dev/null
# Find the parent pid however you want — here: a long-running build pid you already know.
PARENT_PID=12345
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=60&defer_pid=$PARENT_PID&wait=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"echo build-finished; ./run-tests.sh"}'
```
`defer_pid` returns `/execute` immediately even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits. Pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (`wait=false`), capture `command_id`.**

```bash
KIT="https://${P}-${C}-terminal-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":70}' >/dev/null
CID=$(curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=70&wait=false" \
  -H 'Content-Type: application/json' \
  -d '{"command":"sleep 120"}' | jq -r .command_id)
echo "cid=$CID"
```
**Step 2 — abort** the command tracker. Add `force:true` to send SIGKILL; default sends SIGINT.

```bash
curl -sX POST "$KIT/api/v1/terminal/execute/$CID/abort" \
  -H 'Content-Type: application/json' -d '{"force":true}'
```
**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `POST /api/v1/system/process/signal` by name. Targets every process matching the name.

```bash
curl -sX POST "$KIT/api/v1/system/process/signal" \
  -H 'Content-Type: application/json' \
  -d '{"name":"sleep","signal":"SIGTERM","force":false}'
# Live-verified shape: {"success":true,"message":"Signal SIGTERM sent to N process(es)","affected_pids":[...]}
```
Cleanup: `DELETE /api/v1/terminal/{terminal_id}`. ⚠ Never call `POST /api/v1/system/shutdown` / `POST /api/v1/system/reboot` to recover from a hung command — they wipe the entire container.

## Reference

### `docs` (2) — Self-documenting API specification endpoints in JSON and YAML formats

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/openapi.json` | Get OpenAPI specification in JSON format |  |
| `GET /api/v1/terminal/openapi.yaml` | Get OpenAPI specification in YAML format |  |

### `execution` (2) — APIs for executing commands in terminal sessions and retrieving their results

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/terminal/execute` | Execute command in terminal session | `?terminal_id` `?ephemeral` `?defer_pid` `?defer_start_time_ticks` `?defer_timeout_ms` `?defer_poll_ms` `?reset` `?cwd` `?cwd_auto_create` `?shell` `?user` `?cmd` `?env` `?skip_display_wait` `?display_wait_timeout` `?display` `?ssh_host` `?ssh_user` `?ssh_port` `?ssh_password` `?socks5_host` `?socks5_port` `?socks5_user` `?ssh_key` `?socks5_pass` `body*` |
| `GET /api/v1/terminal/result/{command_id}` | Get command result |  |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric 1-65535). Use terminal_id=0 as an explicit sentinel meaning "no terminal ID" (treated as absent, useful when a reverse proxy always injects a terminal_id). Required unless ephemeral=true, in which case it is auto-generated if not provided
- `ephemeral` — When true, auto-generates a unique terminal_id (if not provided), skips display/dbus initialization, and applies aggressive cleanup. Designed for programmatic CLI command execution like child_process.exec (default: false). WARNING: Do NOT use ephemeral=true for GUI applications that require a display. Ephemeral sessions strip the DISPLAY environment variable, which means X11/GUI applications will not work. Use a regular terminal session with an explicit terminal_id and display parameter instead for GUI workloads
- `defer_pid` — Defer command injection until this PID exits (TUI-safe). If set, the API returns immediately regardless of wait=true
- `defer_start_time_ticks` — Optional /proc/<pid>/stat field 22 (starttime in clock ticks since boot) to avoid PID reuse bugs. If it mismatches, command executes immediately
- `defer_timeout_ms` — Max time to wait for defer_pid exit before failing (default: 60000)
- `defer_poll_ms` — Poll interval while waiting for defer_pid exit (default: 50, minimum: 10)
- `reset` — Reset existing session and reconfigure (kills current process, clears state, allows switching from bash to SSH or changing any parameter) - Use 'true', '1', or no value
- `cwd` — Working directory for local bash sessions (ignored for SSH)
- `cwd_auto_create` — Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new or reset local session. Enable with 'true', '1', or no value (default: false)
- `shell` — Shell to use for local sessions: bash (case-insensitive), zsh, fish, sh, etc. (default: server startup command, only applies to new sessions or after reset)
- `user` — System user to spawn shell as (requires su permissions, only applies to new sessions or after reset)
- `cmd` — Base64-encoded command to execute automatically (works with both new and active shells, executes every time URL is visited)
- `env` — Environment variable in KEY=VALUE format (can be repeated for multiple variables, e.g., ?env=DEBUG=1&env=API_KEY=abc)
- `skip_display_wait` — Skip waiting for Hoody Display readiness before executing command. By default, if a DISPLAY is configured, the endpoint blocks until the display server on port 4000+display_num is ready (default: false)
- `display_wait_timeout` — Timeout in seconds for display readiness wait (default: 10, capped at 10 seconds to prevent event-loop pin; values <=0 or malformed also map to the 10-second cap). Ignored if skip_display_wait=true
- `display` — DISPLAY environment variable for X11 applications (auto-formats:display if number provided, e.g., ?display=1 becomes DISPLAY=:1)
- `ssh_host` — SSH server hostname or IP address (creates SSH session if provided with ssh_user)
- `ssh_user` — SSH username (required if ssh_host is provided)
- `ssh_port` — SSH port number (default: 22)
- `ssh_password` — SSH password for authentication (use with caution, prefer key-based auth)
- `socks5_host` — SOCKS5 proxy hostname for SSH connection
- `socks5_port` — SOCKS5 proxy port (default: 1080)
- `socks5_user` — SOCKS5 proxy username for authentication
- `ssh_key` — Base64-encoded SSH private key for key-based authentication (prefer over password-based auth)
- `socks5_pass` — SOCKS5 proxy password for authentication

**Body shapes:**

- `POST /api/v1/terminal/execute` body — `{ command*: string, id: string, timeout: int, wait: bool, cwd: string, env: object }` — Command execution parameters
  - `command` — The command to execute
  - `id` — Custom command ID (numeric 1-65535, auto-generated if not provided)
  - `timeout` — Timeout in seconds (0 = no timeout, default: 0)
  - `wait` — Whether to wait for completion (default: true; forced false when defer_pid is set)
  - `cwd` — Working directory for command execution (for local bash only)
  - `env` — Environment variables as key-value pairs

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/health` | Service health check |  |

### `sessions` (7) — APIs for managing terminal sessions, retrieving output, and viewing session history

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/screenshot` | Capture terminal screenshot | `?terminal_id*` `?format` `?foreground` `?background` `?fontsize` `?save` |
| `GET /api/v1/terminal/ws` | WebSocket terminal connection | `?terminal_id` `?readonly` `?cwd` `?cwd_auto_create` `?shell` `?user` `?cmd` `?env` `?display` `?pid` `?ssh_host` `?ssh_user` `?ssh_port` `?ssh_password` `?socks5_host` `?socks5_port` |
| `POST /api/v1/terminal/create` | Create a terminal session | `body*` |
| `DELETE /api/v1/terminal/{terminal_id}` | Delete a terminal session |  |
| `GET /api/v1/terminal/raw` | Get raw terminal output | `?terminal_id` `?format` `?tail` |
| `GET /api/v1/terminal/sessions` | List all terminal sessions | `?history_limit` `?history_lines` |
| `GET /api/v1/terminal/history/{terminal_id}` | Get terminal command history |  |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric 1-65535)
- `format` — Output format: png, jpeg, gif (default: png)
- `foreground` — Foreground color: black, red, green, yellow, blue, magenta, cyan, white, or RGB (R,G,B,A) (default: white)
- `background` — Background color: same as foreground options (default: black)
- `fontsize` — Font size in pixels (default: 20)
- `save` — Save to storage directory (default: true)
- `terminal_id` — Terminal session ID (numeric 1-65535, auto-generated if not provided) - Multiple clients can share by using same ID
- `readonly` — Enable read-only mode for this client (blocks keyboard input) - Use 'true', '1', or no value
- `cwd` — Working directory for new sessions
- `cwd_auto_create` — Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new local session. Enable with 'true', '1', or no value (default: false)
- `shell` — Shell to use (bash, zsh, fish, tmux, ssh, etc.)
- `user` — System user to spawn shell as (requires permissions)
- `cmd` — Base64-encoded command to auto-execute on spawn
- `env` — Environment variable KEY=VALUE (repeatable)
- `display` — DISPLAY variable for X11 apps (auto-formats:N)
- `pid` — Attach to existing process PID for monitoring
- `ssh_host` — SSH server hostname/IP for remote connections
- `ssh_user` — SSH username (required if ssh_host provided)
- `ssh_port` — SSH port (default: 22)
- `ssh_password` — SSH password (use with caution)
- `socks5_host` — SOCKS5 proxy for SSH
- `socks5_port` — SOCKS5 port (default: 1080)
- `terminal_id` — Terminal session ID (numeric 1-65535, defaults to "1" if not provided)
- `format` — Output format: download, text, or html (defaults to "download" if not provided)
- `tail` — Return only the last N lines of output
- `history_limit` — Max command_history entries to include per session (default: 50, max: 1000)
- `history_lines` — Alias of history_limit

**Body shapes:**

- `POST /api/v1/terminal/create` body — `{ terminal_id: string, ephemeral: bool, display: string, shell: string, user: string, cwd: string, startup_script: string, welcome: bool, debug: bool, desktop: bool, desktop_env: string, cols: int, rows: int, wait_until_display: bool, wait_timeout: int, ssh_host: string, ssh_user: string, ssh_port: string, ssh_password: string, ssh_key: string, socks5_host: string, socks5_port: string, socks5_user: string, socks5_pass: string }`
  - `terminal_id` — Terminal session ID (numeric 1-65535). Required unless ephemeral is true, in which case it is auto-generated (range 40000-65535).
  - `ephemeral` — Auto-generate terminal ID and enable ephemeral session mode. Ephemeral sessions auto-clean after idle timeout and strip DISPLAY environment. (default: false)
  - `display` — X11 display number (e.g., "1" or ":1"). Sets the DISPLAY env var and enables Hoody Display readiness waiting.
  - `shell` — Shell to use (bash/zsh/fish/sh). Ignored for SSH sessions.
  - `user` — System user to spawn the shell as. Ignored for SSH sessions.
  - `cwd` — Working directory for the terminal. Ignored for SSH sessions.
  - `startup_script` — Path to startup script to run
  - `welcome` — Show welcome message on startup (default: false)
  - `debug` — Enable debug output in wrapper script (default: false)
  - `desktop` — Enable Hoody Display desktop mode. Provides a full desktop environment instead of seamless individual windows (default: false)
  - `desktop_env` — Desktop environment to launch (implies desktop=true). Valid values: xfce, mate
  - `cols` — Terminal columns (default: 80)
  - `rows` — Terminal rows (default: 24)
  - `wait_until_display` — Whether to wait for Hoody Display readiness (default: true when display is configured)
  - `wait_timeout` — Timeout in seconds for waiting (default: 300)
  - `ssh_host` — SSH hostname/IP. Required together with ssh_user for SSH sessions.
  - `ssh_user` — SSH username. Required together with ssh_host for SSH sessions.
  - `ssh_password` — SSH password. Cannot contain shell-dangerous characters.
  - `ssh_key` — Base64-encoded SSH private key (PEM format)
  - `socks5_host` — SOCKS5 proxy hostname/IP for routing SSH connections
  - `socks5_port` — SOCKS5 proxy port (default: 1080)
  - `socks5_user` — SOCKS5 proxy authentication username
  - `socks5_pass` — SOCKS5 proxy authentication password

### `system` (11) — APIs for monitoring system resources, processes, network ports, and controlling system state

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/system/processes/freeze` | Freeze (SIGSTOP) a process or process tree | `body*` |
| `GET /api/v1/system/daemon` | Get daemon programs configuration |  |
| `GET /api/v1/system/displays` | Get display information |  |
| `GET /api/v1/system/processes/{pid}` | Get process details by PID |  |
| `GET /api/v1/system/resources` | Get system resources and statistics |  |
| `GET /api/v1/system/ports` | List all listening network ports | `?protocol` `?user` `?port` `?ip` `?skip_program` `?http_only` `?hoody_only` |
| `GET /api/v1/system/processes` | List all system processes | `?sort` `?limit` `?filter` |
| `POST /api/v1/system/reboot` | Reboot the system | `?delay` |
| `POST /api/v1/system/process/signal` | Send signal to process(es) | `body*` |
| `POST /api/v1/system/shutdown` | Shutdown the system | `?delay` |
| `POST /api/v1/system/processes/unfreeze` | Unfreeze (SIGCONT) a process or process tree | `body*` |

**Param notes:**

- `protocol` — Filter by protocol: tcp, udp, or comma-separated list
- `user` — Filter by user (exact match)
- `port` — Filter by specific port number
- `ip` — Filter by IP address (comma-separated list)
- `skip_program` — Exclude specific programs (comma-separated list)
- `http_only` — Only return HTTP services
- `hoody_only` — Only return Hoody Kit services
- `sort` — Sort by field: cpu, memory, pid, name (default: pid)
- `limit` — Maximum number of processes to return (default: all)
- `filter` — Filter by process name (substring match, case-insensitive)
- `delay` — Delay in seconds before reboot, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response.
- `delay` — Delay in seconds before shutdown, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response.

**Body shapes:**

- `POST /api/v1/system/processes/freeze` body — `{ pid: int, name: string, include_descendants: bool }` — Target selector and options
  - `pid` — Process ID to freeze (mutually exclusive with name). PIDs 1 (init), 2 (kthreadd), the server's own PID, and the server's parent PID are guarded — freezing them would wedge the host or the daemon — and are rejected with 403.
  - `name` — Process name (case-insensitive `comm` match — freezes EVERY matching process; mutually exclusive with pid). NOTE: Linux truncates `comm` to TASK_COMM_LEN-1 = 15 chars; a name longer than 15 characters silently matches nothing.
  - `include_descendants` — When true, also freezes every descendant via a one-shot /proc PPID snapshot (bounded at 65535 PIDs). Default false. The parent is signalled before descendants to shrink the fork/escape race window — but the operation is best-effort, not atomic. With descendants, by-name dedupes overlapping subtrees…
- `POST /api/v1/system/process/signal` body — `{ pid: int, name: string, signal: string|integer, force: bool }` — Signal parameters
  - `pid` — Process ID to signal (mutually exclusive with name)
  - `name` — Process name to signal - signals ALL matching processes (mutually exclusive with pid)
  - `signal` — Signal to send. String form accepts `SIGTERM`, `TERM`, `15`, etc. (with or without `SIG` prefix). Integer form accepts any value in `[0, NSIG)` including realtime signals `SIGRTMIN`..`SIGRTMAX` (typically 34..64 on Linux), which have no portable string names.
  - `force` — Shorthand for SIGKILL (true) or SIGTERM (false) - overrides signal parameter
- `POST /api/v1/system/processes/unfreeze` body — `{ pid: int, name: string, include_descendants: bool }` — Target selector and options
  - `pid` — Process ID to unfreeze (mutually exclusive with name). The guarded-PID set (1, 2, self, parent) is the same as for freeze; calling unfreeze on a guarded PID returns 403.
  - `name` — Process name (case-insensitive comm match; mutually exclusive with pid). NOTE: Linux truncates `comm` to 15 chars; longer names silently match nothing.
  - `include_descendants` — Also unfreeze all descendants via /proc PPID snapshot (bounded at 65535 PIDs). Default false. By-name dedupes overlapping subtrees.

### `terminal` (2) — Terminal

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/terminal/execute/{command_id}/abort` | Abort a running command | `body` |
| `POST /api/v1/terminal/write` | Write input to terminal | `?terminal_id*` `body` |

**Param notes:**

- `terminal_id` — Terminal session ID to write to

**Body shapes:**

- `POST /api/v1/terminal/execute/{command_id}/abort` body — `{ force: bool }` — Abort parameters
  - `force` — Send SIGKILL to process group instead of SIGINT (default: false)
- `POST /api/v1/terminal/write` body — `{ input*: string, enter: bool }` — JSON object with input and optional enter flag
  - `input` — The text to type into the terminal
  - `enter` — Auto-append Enter (newline) after input. Default: true. Set to false for raw keystroke input

### `terminalAutomation` (9) — Agent-facing automation primitives: screen snapshot, regex find, named key presses, text paste, and async wait conditions backed by a server-side libvterm parser

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/find` | Search terminal screen with regex | `?terminal_id*` `?pattern*` `?scope` `?limit` `?case_insensitive` `?scroll_offset` |
| `GET /api/v1/terminal/automation/metrics` | Get terminal automation metrics |  |
| `GET /api/v1/terminal/{terminal_id}/automation` | Get per-session automation state |  |
| `GET /api/v1/terminal/snapshot` | Get rendered terminal snapshot | `?terminal_id*` `?include_colors` `?include_highlights` `?scroll_offset` |
| `GET /api/v1/terminal/keys` | List supported key names for /press endpoint |  |
| `POST /api/v1/terminal/paste` | Paste text into terminal | `?terminal_id*` `body*` |
| `POST /api/v1/terminal/press` | Send named key presses to terminal | `?terminal_id*` `body*` |
| `POST /api/v1/terminal/mouse` | Send cell-based mouse events to terminal | `?terminal_id*` `body*` |
| `POST /api/v1/terminal/wait` | Wait for terminal condition | `?terminal_id*` `body*` |

**Param notes:**

- `terminal_id` — Terminal session ID
- `pattern` — PCRE2 regex pattern to search for (max 1024 bytes)
- `scope` — Search scope: screen (default), scrollback, or all
- `limit` — Maximum number of hits to return (default 100, max 1000)
- `case_insensitive` — Case-insensitive matching. Default: false
- `scroll_offset` — Scrollback offset for screen scope (0 = live viewport). Default: 0
- `terminal_id` — Terminal session ID (numeric 1-65535)
- `include_colors` — Include ANSI SGR colored_lines array alongside plain text lines. Default: false
- `include_highlights` — Include reverse-video highlight spans. Default: true
- `scroll_offset` — Lines into scrollback (0 = live viewport). Default: 0

**Body shapes:**

- `POST /api/v1/terminal/paste` body — `{ text*: string, bracketed: bool }` — Paste text specification
  - `text` — Text to paste (UTF-8)
  - `bracketed` — Use bracketed paste mode if the program supports it. Default: true
- `POST /api/v1/terminal/press` body — `{ keys: any[], key: string }` — Key press specification (exactly one of `keys` or `key` required)
  - `keys` — Array of key names to press in sequence (e.g. ["ctrl+c", "arrow_up", "enter"]). Mutually exclusive with `key`. Maximum 256 entries per request.
  - `key` — Single key name for one-shot press (e.g. "enter"). Mutually exclusive with `keys`
- `POST /api/v1/terminal/mouse` body — `{ event: terminal_TerminalMouseEvent, events: terminal_TerminalMouseEvent[] } (exactly one of: event | events required)` — Mouse event specification
- `POST /api/v1/terminal/wait` body — `{ mode: string, debounce_ms: int, pattern: string, timeout_ms: int, search_scope: string, include_colors: bool, include_highlights: bool }` — Wait condition specification
  - `mode` — Wait mode: stable, regex, or either. Default: stable
  - `debounce_ms` — Stable mode debounce in milliseconds (10-60000). Default: 100
  - `pattern` — PCRE2 regex pattern (required for regex/either modes, max 1024 bytes)
  - `timeout_ms` — Hard deadline in milliseconds (10-300000). Default: 5000
  - `search_scope` — Where to search: screen, scrollback, or all. Default: screen
  - `include_colors` — Include colored_lines in response snapshot. Default: false
  - `include_highlights` — Include highlights in response snapshot. Default: true

### `terminalDragAndDrop` (4) — Terminal Drag-and-Drop

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/terminal/drop-begin` | Begin a drag-and-drop staging transaction | `?terminal_id*` |
| `POST /api/v1/terminal/drop-commit` | Finalize a drop and inject the OSC frame | `?terminal_id*` `?drop*` `?token*` `body*` |
| `POST /api/v1/terminal/drop` | One-shot drop (begin + stage + commit) | `?terminal_id*` `body*` |
| `POST /api/v1/terminal/upload` | Upload a raw file slice into a drop | `?terminal_id*` `?drop*` `?token*` `?path*` `?offset*` |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric 1-65535)
- `drop` — Drop id from /drop-begin
- `token` — Drop token from /drop-begin
- `path` — Sanitized relative path of the staged file (no `..`, not absolute)
- `offset` — Byte offset to write at (must equal the current staged size)

**Body shapes:**

- `POST /api/v1/terminal/drop-commit` body — `{ ctx*: string, r: int, c: int, cr: string, items*: any[] }` — Manifest draft
  - `ctx` — Drop context: "drop" or "paste"
  - `r` — Drop cell row (Chat grid pane mapping)
  - `c` — Drop cell column
  - `cr` — Clip-read correlation nonce ([A-Za-z0-9_-]{1,64}); echoed verbatim as the injected frame's cr field so the TUI can match a clipboard-read landing. Invalid/oversized values are ignored.
  - `items` — Manifest entries [{p,d,s,name,h?}]
- `POST /api/v1/terminal/drop` body — `{ ctx*: string, r: int, c: int, items*: any[] }` — One-shot drop payload
  - `r` — Drop cell row
  - `items` — File/dir items ([{name,b64}\|{name,dir:true,items:[...]}])

### `terminalState` (1) — Client render/connection diagnostics beacon

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/terminal/state` | Client render/connection diagnostics beacon | `body` |

**Body shapes:**

- `POST /api/v1/terminal/state` body — `{ build_id: string, renderer: string, reason: string }` — Small client-state envelope (renderer, WebGL
  - `build_id` — Frontend build identifier
  - `renderer` — Effective renderer (webgl\|dom)
  - `reason` — What triggered this beacon

### `web` (1) — Web-based terminal interface with customizable display and session parameters

| Method | Summary | Params |
|--------|---------|--------|
| `GET /` | Get web terminal interface | `?terminal_id` `?cwd` `?cwd_auto_create` `?shell` `?user` `?cmd` `?readonly` `?title` `?fontSize` `?backgroundColor` `?panel` `?panel-visible` `?panel-position` `?panel-width` `?panel-resizable` `?hide-toolbar` `?ssh_host` `?ssh_user` `?ssh_port` `?ssh_password` `?socks5_host` `?socks5_port` `?socks5_user` `?socks5_pass` `?desktop` `?desktop_env` `?redirect` `?redirect_delay` `?arg` `?welcome` `?debug` `?reset` `?pid` `?env` `?display` `?env_inject` `?startup_script` `?ssh_key` `?panel-height` |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric 1-65535, auto-generated if not provided) - Allows multiple clients to share the same terminal session
- `cwd` — Initial working directory for new terminal sessions (only applied when session is first created)
- `cwd_auto_create` — Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new session. Enable with 'true', '1', or no value (default: false)
- `shell` — Shell to use: bash, zsh, fish, sh, etc. (default: server startup command, only applies to new sessions)
- `user` — System user to spawn shell as (requires su permissions, only applies to new sessions, user must exist on system)
- `cmd` — Base64-encoded command to execute automatically on spawn (executes once when shell starts)
- `readonly` — Enable read-only mode (blocks keyboard input, allows viewing only) - Use 'true', '1', or no value
- `title` — Browser window/tab title (default: application default) - HTML tags removed, max 200 characters, useful for organizing multiple terminal tabs
- `fontSize` — Terminal font size in pixels (default: 13, range: 8-72) - Accepts 'px' suffix (e.g., 16px), applied immediately when terminal loads
- `backgroundColor` — Terminal background color (default: #2b2b2b) - Supports hex colors (#RGB, #RRGGBB, #RRGGBBAA) or CSS named colors (black, white, red, blue, green, navy, etc.)
- `panel` — URL to display in side panel iframe (enables panel feature)
- `panel-visible` — Show panel on load (default: true if panel URL provided, false otherwise)
- `panel-position` — Panel position: 'left' or 'right' (default: right)
- `panel-width` — Initial panel width in pixels or percentage (default: 400px)
- `panel-resizable` — Allow panel resizing via drag handle (default: true)
- `hide-toolbar` — Hide the terminal toolbar (default: false)
- `ssh_host` — SSH server hostname or IP address (creates SSH session if provided with ssh_user)
- `ssh_user` — SSH username (required if ssh_host is provided)
- `ssh_port` — SSH port number (default: 22)
- `ssh_password` — SSH password for authentication (use with caution, prefer key-based auth)
- `socks5_host` — SOCKS5 proxy hostname for SSH connection
- `socks5_port` — SOCKS5 proxy port (default: 1080)
- `socks5_user` — SOCKS5 proxy username for authentication
- `socks5_pass` — SOCKS5 proxy password for authentication
- `desktop` — Enable Hoody Display desktop mode. Provides a full desktop environment instead of seamless individual windows (default: false)
- `desktop_env` — Desktop environment to launch (implies desktop=true). Starts the specified DE session after the display is ready. Valid values: xfce, mate
- `redirect` — Redirect mode. When set to "display", creates/ensures the terminal session, waits for X11 display readiness, then returns HTTP 302 redirect to the display URL. Requires terminal_id and display params
- `redirect_delay` — Extra delay in seconds after display is ready before redirecting. Only used when redirect=display (default: 0)
- `arg` — Command-line arguments to pass to shell (requires --url-arg server option, can be repeated)
- `welcome` — Show welcome message on startup (default: false). Supports ?welcome=true, ?welcome=1, or ?welcome (no value = true)
- `debug` — Enable debug output in wrapper script (default: false)
- `reset` — Kill existing terminal process and reconfigure session (default: false). Use to switch shell, user, or from shell to SSH
- `pid` — Attach to an existing process by PID instead of spawning a new shell. Implies reset
- `env` — Inject environment variable as KEY=VALUE. Can be repeated for multiple variables (e.g., ?env=FOO=bar&env=BAZ=qux)
- `display` — X11 display number for GUI applications. Accepts number (e.g., 1) or:number (e.g.,:1). Shorthand for ?env=DISPLAY=:N
- `env_inject` — Inject HOODY_* environment variables into shell session (default: true). Set to false to disable
- `startup_script` — Path to startup script to execute before shell launch (only applied on first session creation)
- `ssh_key` — Base64-encoded SSH private key for key-based authentication (prefer over password-based auth)
- `panel-height` — Initial panel height for top/bottom positioned panels (default: 300px)


### Body schemas

- `terminal_TerminalMouseEvent` — `{ type*: "move" | "down" | "up" | "click" | "scroll", row*: int, col*: int, button: int, amount: int, direction: "up" | "down", modifiers: ("shift" | "alt" | "meta" | "ctrl" | "control")[] }`

---

<!-- ===== namespace: tunnel ===== -->

# `tunnel` — reverse tunnels for HTTP/WS/TCP via container relay

## Purpose

**Mental model: ngrok, but built into every container, with the rest of the platform glued in for free.** Same job — reverse tunnel laptop ↔ container — but the public URL lives on the container's own `*.containers.hoody.com` host, so it inherits everything the proxy already does:

- **Capability gates** (`proxyPermissionsContainer.*`) apply unchanged — Password / Token / JWT / IP groups gate the tunnel URL the same way they gate any kit URL.
- **Request hooks (MITM)** — wire `proxyHooks.*` rules to inspect, transform, redirect, or block requests before they reach the tunnel; same engine as the rest of the platform.
- **Proxy logs** — every tunnel request is captured by `proxyLogs.*` automatically (status, latency, headers, source IP). No extra setup.
- **Friendly aliases** — point a `<alias>.{server_name}.containers.hoody.com` at the tunnel via `POST /api/v1/proxy/aliases` so the public URL hides `containerId`.

Two surfaces:
- **EXPOSE**: publish laptop HTTP/1.1 (+WS) on container's public domain. (ngrok `http`)
- **PULL**: project laptop TCP onto container loopback. (ngrok `tcp` reverse)

Each surface has:
- **Data plane** (open the tunnel) — long-running WebSocket process. Lives in a separate driver (see Quirks).
- **Control plane** (inspect / kill) — short request/response: `GET /api/v1/tunnel/tunnels`, `GET /api/v1/tunnel/sessions`, `GET /api/v1/tunnel/bindings`, `GET /api/v1/tunnel/metrics`, `GET /api/v1/tunnel/health`, `DELETE /api/v1/tunnel/sessions/{session_id}`.

## When to use

- Publish laptop HTTP/WS on `*.containers.hoody.com`.
- Project laptop TCP onto container `127.0.0.1:<port>`.
- Inspect, scrape metrics, kill sessions.

## When NOT to use

Container-hosted HTTP → `exec`, browser → `browser`, one-shot HTTP → `curl`, edge logs → `proxyLogs`, container↔container TCP not supported.

## Prerequisites

- `hoody-tunnel` kit running; base port reserved.
- EXPOSE URL needs `HOODY_TUNNEL_PUBLIC_URL_PATTERN`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Inspect

`GET /api/v1/tunnel/tunnels` → sessions, bindings, streams, orphans, FD budget. Drill via `GET /api/v1/tunnel/sessions` / `GET /api/v1/tunnel/bindings`. `GET /api/v1/tunnel/health`; `GET /api/v1/tunnel/metrics` → Prometheus.

### 2. Kill stuck session

1. `GET /api/v1/tunnel/sessions` → `sessionId`.
2. `DELETE /api/v1/tunnel/sessions/{session_id}` with `grace_ms` 0–5000 (default 50). Returns `202`. Live → GOAWAY then close; orphans drop now (parking skipped).
3. Re-list before re-binding.

### 3. MITM / log / gate the tunnel

Tunnel traffic flows through the same proxy as every other kit URL, so:

- **Logs**: `client.proxyLogs.logs.list({ serviceName: 'tunnel' })` returns every request that hit the tunnel — status, latency, source IP, headers — and `client.proxyLogs.logs.streamLogs(...)` for live tail; the generated SDK stream method does **not** expose `serviceName`, so use `list({ serviceName: 'tunnel', ... })` for tunnel-scoped polling. (proxyLogs query params on `list` are `limit` / `offset` / `projectId` / `containerId` / `serviceName` / `level` / `includeRequestBody` / `includeResponseBody` / `last` / `afterId` / `cursor` / `kind` / `method` / `source`; there is no `program` filter.) No agent on the laptop needed.
- **Hooks (MITM)**: register a `proxyHooks` rule scoped to `program: 'tunnel'` (or by alias hostname) to inspect / rewrite / inject / block requests before they reach the WS data plane. Same hook DSL as for any kit. Useful for: stripping a bearer header on the way through, redacting PII, rate-limiting, swapping bodies on the fly, fault-injecting for tests.
- **Gates**: layer `proxyPermissionsContainer.set{Password,Token,Jwt,Ip}Group` on the container; the tunnel URL becomes auth-gated without the laptop ever needing to handle it.

## Quirks & gotchas

- The data-plane (open / pull) is a long-running driver process, not a request/response call. Runtime: Bun 1.3+ or Node 20+ (the listening-server form is Bun-only). The main `tunnel` namespace covers only the read/observability + admin surface (`GET /api/v1/tunnel/tunnels`, `GET /api/v1/tunnel/sessions`, `GET /api/v1/tunnel/bindings`, `GET /api/v1/tunnel/metrics`, `DELETE /api/v1/tunnel/sessions/{session_id}`).
- `BIND_OK.publicUrl=null` without `HOODY_TUNNEL_PUBLIC_URL_PATTERN`.
- `grace_ms` capped at 5000ms; over → `400`.
- Ports `<80` rejected; `80..=1023` need `--allow-privileged-expose`/`--allow-privileged-pull`.
- PULL loopback-only. EXPOSE has atomic takeover (`takeover:true`); old owner gets `RESET(BIND_TAKEOVER)`+`BIND_REVOKED`. PULL takeover → `BIND_ERR(INVALID_KIND)`.
- Idle reaping needs zero streams AND zero bindings. Orphans with parked bindings wait 60s takeover-grace.
- v1 vs v2 subprotocols share `/connect` (`hoody-tunnel.v1` for single-WS sessions, `hoody-tunnel.v2` for multi-WS shard pools); `isV2` on `GET /api/v1/tunnel/sessions` reports the shape. Both subprotocols support graceful resume via `resume.sessionId` in HELLO; `isV2:false` does NOT mean "no resume".
- Multi-WS (v2) drop semantics: dropping the **primary** socket closes the whole session; dropping a **secondary** shard makes the driver close streams pinned to that shard while the kit detaches the shard and the session continues.
- Pre-auth connection cap defaults to `--max-pre-auth-connections=32`; exceeding it closes the socket before HELLO (no explicit close code). HELLO timeout defaults to 5 s.
- **No UDP support.** EXPOSE is HTTP/1.1+WS only; PULL is TCP only.
- `GET /api/v1/tunnel/connect` is the WS-upgrade endpoint of the data plane. The generated SDK exposes it as a plain `http.get` returning an `ApiResponse<unknown>` — that is NOT a working tunnel attach. Use the driver helpers (`tunnelExpose` / `tunnelPull` / `tunnelServe`) re-exported from the main SDK package, which handle the WS subprotocol, HELLO frame, and resume; do not call `GET /api/v1/tunnel/connect` directly.

## Common errors

- `404` on kill — session gone; no retry.
- `403` — SSRF guard; not via Hoody Proxy.
- Upgrade `400` — missing/unsupported subprotocol; WS `1002` — HELLO rejected after upgrade; plain socket close — HELLO timeout or pre-auth cap reached.
- `BIND_ERR` codes: `ALREADY_BOUND` (retry `takeover:true`), `PORT_IN_USE`, `RESERVED_PORT`, `INVALID_HOST`, `PRIVILEGED_PORT`, `BIND_CAP_EXCEEDED`, `INVALID_KIND` (unsupported `(kind, mode)` combo, or `takeover:true` on PULL), `INTERNAL` (server-side, e.g. random-port exhaustion).
- `GOAWAY(IDLE_TIMEOUT)` — no PONG in 60s; reconnect via `resume.sessionId`.
- `503`+`Retry-After:5` at visitor URL — orphan takeover-grace window (set by `expose` driver kill, NOT by admin `DELETE /api/v1/tunnel/sessions/{session_id}` which skips orphan parking).

## Related namespaces

- `proxyLogs` — every tunnel request appears here automatically; filter by `serviceName: 'tunnel'` (there is no `program` filter on the proxy-log API).
- `api` — `proxyHooks.*` (MITM rules), `proxyPermissionsContainer.*` (capability gates), `POST /api/v1/proxy/aliases` (friendly hostnames hiding `containerId`).
- `exec` — for one-off HTTP handlers hosted directly inside the container (no laptop). `curl` — outbound HTTP from the container. `browser` — full headless Chromium. `daemon` — supervise long-running processes.

## Examples

The `tunnel` namespace covers only the **observability + admin** surface — `GET /api/v1/tunnel/health`, `GET /api/v1/tunnel/tunnels`, `GET /api/v1/tunnel/sessions`, `GET /api/v1/tunnel/bindings`, `GET /api/v1/tunnel/metrics`, `DELETE /api/v1/tunnel/sessions/{session_id}`. The data plane (open / pull) is a long-running WebSocket driver that lives in a separate package; it is intentionally out of scope here, so these 7 examples assume *somebody else* (a teammate's tunnel expose/pull session, your CI machine's tunnel session, a test rig) is currently holding the tunnel. You're the operator: inspecting it, scraping metrics, killing it. Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

Read-only steps were live-attempted against the test container; on this deployment the tunnel kit process was not running on that container at the moment of writing (502); the admin endpoints serve independently of any session. Schemas, status codes, response shapes and CLI flags are verified against `generated/openapi.public.json`, `docs/reference/CLI-COMMANDS.md`, and a previously-recorded happy-path run (`scenarios/logs/2026-05-05_22-21-38/tunnel-kit.json`).

### 1. Health probe — kit alive, FD budget not exhausted

**Goal:** before any other call, confirm the tunnel kit is reachable and not saturated. Response includes `pid`, `started`, `userAgent`, `fds` (Unix-only file-descriptor count when available), and `memory.rss`.

```bash
KIT="https://${P}-${C}-tunnel-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/tunnel/health" | jq '{status, service, started, pid, fds, rss: .memory.rss}'
# {"status":"ok","service":"hoody-tunnel","started":"2026-05-05T22:00:11Z","pid":42,"fds":128,"rss":52428800}
```
If the response is HTML / `Error 502` instead of JSON, the kit base listener isn't reachable through the proxy (kit crashed / not installed / proxy mis-route) — the admin endpoints are designed to stay live independent of any active session. Lack of an active session shows up as `sessions: []`, not 502.

### 2. List every active tunnel — combined sessions + bindings + FD budget

**Goal:** "what's currently tunneling on this container?" One call returns `sessions[]` (each with `peerAddr`, `protocol`, `connectionsGranted`, `activeStreams`, `exposeBindings[]`, `pullBindings[]`), `orphanedSessions` count, `totalStreams`, `totalBindings`, and `fdPermitsAvailable`.

```bash
KIT="https://${P}-${C}-tunnel-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/tunnel/tunnels" | jq '{
  active: (.sessions | length),
  orphans: .orphanedSessions,
  streams: .totalStreams,
  binds: .totalBindings,
  fdBudget: .fdPermitsAvailable,
  ids: [.sessions[].sessionId]
}'
```
`GET /api/v1/tunnel/tunnels` is the one-shot overview. For per-session detail (peer addr, max-stream cap, v2 flag) drill in via `GET /api/v1/tunnel/sessions` (example #3). Note: `protocol` is per-session and reflects the negotiated control-plane protocol, NOT the upstream — for the "is this an EXPOSE or PULL" answer, look at which of `exposeBindings` / `pullBindings` is non-empty.

### 3. Drill into one session — peer addr, stream load, capacity

**Goal:** you got a `sessionId` from #2; now you want the operator-facing detail (who's connected, how loaded). Returns `peerAddr` (`<ip>:<port>` of the laptop holding the tunnel), `connectionsGranted` (lifetime), `activeStreams` (right now), `maxStreams` (negotiated cap), `isV2` (control-plane protocol), and `bindings[]`.

```bash
KIT="https://${P}-${C}-tunnel-1.${N}.containers.hoody.com"
SID="S-466ab70d-92e8-49b5-95a9-8c0d585dc2b9"
curl -sf "$KIT/api/v1/tunnel/sessions" \
  | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s) | {
      peer: .peerAddr,
      v2: .isV2,
      load: "\(.activeStreams)/\(.maxStreams)",
      lifetimeConnections: .connectionsGranted,
      binds: [.bindings[] | "\(.kind)/\(.mode):\(.containerPort)#\(.bindId)"]
    }'
```
`activeStreams / maxStreams` is the headroom number — a session sitting at `48/50` is one curl away from `STREAM_LIMIT`. `isV2:false` means the session negotiated the single-WebSocket v1 control plane; resume is still supported via `resume.sessionId` while the orphan is in takeover grace.

### 4. List bindings — which ports are exposed across every session

**Goal:** answer "what container ports are tunnels eating right now?". `GET /api/v1/tunnel/bindings` flattens across one row per active binding — `port`, `kind` (`http` / `tcp`), `mode` (`expose` / `pull`). EXPOSE rows include the owning `sessionId`/`bindId`; current PULL rows report `sessionId: ""` and `bindId: 0`.

```bash
KIT="https://${P}-${C}-tunnel-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/tunnel/bindings" | jq '
  .bindings | group_by(.mode) | map({mode: .[0].mode, count: length, ports: map(.port)})
'
```
Useful pre-flight check before someone tries to bind another port — `BIND_ERR(PORT_IN_USE)` is one of the most common BIND failures. Also: the wire field is `port` here but `containerPort` inside the per-session `bindings[]` array of #3 — same value, different name (verified against `tunnel_BindingDetail` vs `tunnel_BindingInfo` in the openapi spec).

### 5. Scrape Prometheus metrics — sessions, bindings, FD permits

**Goal:** wire the tunnel kit into your scrape job. Endpoint emits Prometheus text (one of the few endpoints that's not JSON). Three live-verified counters: `hoody_tunnel_sessions_active`, `hoody_tunnel_bindings_active`, `hoody_tunnel_fd_permits_available`.

```bash
KIT="https://${P}-${C}-tunnel-1.${N}.containers.hoody.com"
curl -sf "$KIT/api/v1/tunnel/metrics" \
  | grep -E '^hoody_tunnel_(sessions_active|bindings_active|fd_permits_available)\b'
# hoody_tunnel_sessions_active 1
# hoody_tunnel_bindings_active 2
# hoody_tunnel_fd_permits_available 1022
```
For a dashboard, register the kit URL as a Prometheus scrape target via `POST /api/v1/proxy/aliases` so the scrape config doesn't carry `containerId`, then gate it with `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip` so only your monitoring VPC can hit `/api/v1/tunnel/metrics`.

### 6. Kill a stuck session (recipe — needs a real session)

**Goal:** a teammate's tunnel expose session is wedged; you want it gone without restarting the kit. `DELETE /api/v1/tunnel/sessions/{session_id}` returns `202` with `{sessionId, status}`. `grace_ms` ∈ [0, 5000] (default 50, anything above 5000 → `400`); the kit sends GOAWAY then waits up to that many ms for in-flight streams before closing. Orphan sessions skip the parking grace window and drop immediately.

⚠ Don't run this in the doc as live verification — it kills whoever's actually connected. Recipe only.

```bash
KIT="https://${P}-${C}-tunnel-1.${N}.containers.hoody.com"
SID=$(curl -sf "$KIT/api/v1/tunnel/sessions" \
  | jq -r '.sessions[] | select(.peerAddr | startswith("203.0.113.")) | .sessionId' | head -1)
[ -n "$SID" ] || { echo "no matching session"; exit 1; }

# Give in-flight requests 1 second to drain, then close.
curl -sX DELETE "$KIT/api/v1/tunnel/sessions/$SID?grace_ms=1000" | jq .
# {"sessionId":"S-466ab70d-...","status":"closing"}

# Re-list to confirm it's gone (404 on a second kill is expected — see Common errors).
curl -sf "$KIT/api/v1/tunnel/sessions" | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s) | "still here"'
```
After a non-admin driver disconnect, visitors of an orphaned `expose` URL see `503 Retry-After:5` during takeover grace. `DELETE /api/v1/tunnel/sessions/{session_id}` (admin) skips orphan parking and tears bindings down, so do **not** expect that 60 s 503 window from an admin kill — bindings drop immediately. PULL bindings drop instantly in both paths.

### 7. Auto-discover orphans + low-FD alert (monitoring recipe)

**Goal:** one cron-able script that watches both the orphan count (parked bindings whose laptop dropped) and the FD permits remaining; pages on either. `GET /api/v1/tunnel/tunnels` carries both numbers.

```bash
KIT="https://${P}-${C}-tunnel-1.${N}.containers.hoody.com"
J=$(curl -sf "$KIT/api/v1/tunnel/tunnels")
ORPH=$(echo "$J" | jq '.orphanedSessions')
FDS=$(echo "$J" | jq '.fdPermitsAvailable')

# Threshold: alert if FDs < 64 OR orphans > 0 (orphans hold takeover-grace; can wedge BIND).
if [ "$FDS" -lt 64 ] || [ "$ORPH" -gt 0 ]; then
  echo "ALERT tunnel kit ${C}: orphans=${ORPH} fds=${FDS}"
  # …route to PagerDuty / Slack here…
fi
```
For a continuous live tail of `GOAWAY` / `IDLE_TIMEOUT` / `BIND_REVOKED` events as they happen, attach with the tunnel driver helpers (`TunnelSession` / `tunnelExpose` / `tunnelPull`, re-exported from the main SDK package) to `/api/v1/tunnel/connect` — that's the data-plane driver's surface and lives outside this namespace; do **not** use generated `GET /api/v1/tunnel/connect` for a real attach. The polling recipe above stays inside the request/response admin surface.

## Reference

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/tunnel/health` | Kit health |  |

### `tunnel` (6) — Tunnel control plane (WebSocket + health + management)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/tunnel/metrics` | Prometheus metrics |  |
| `DELETE /api/v1/tunnel/sessions/{session_id}` | Terminate an active tunnel session | `?grace_ms` |
| `GET /api/v1/tunnel/bindings` | List active bindings across all sessions |  |
| `GET /api/v1/tunnel/sessions` | List active tunnel sessions |  |
| `GET /api/v1/tunnel/tunnels` | List all active tunnels (combined sessions + bindings) |  |
| `GET /api/v1/tunnel/connect` | Tunnel WebSocket control plane |  |

**Param notes:**

- `grace_ms` — GOAWAY drain budget in ms (0-5000, default 50)


---

<!-- ===== namespace: watch ===== -->

# `watch` — Linux inotify file-change streams with replay history

## Purpose

Per-container filesystem-event service. Configure watchers (paths, globs, ignore-dirs, coalesce window); consume events via paginated history, SSE, or WebSocket. Bounded in-memory replay buffer supports `since_id` resume.

## When to use

- Live-tail FS changes inside a container (build, hot-reload, log tail)
- Detect `created | modified | removed | renamed | metadata` events on paths/trees
- Audit writes by filtering `kinds`
- Resume after disconnect via `since_id` / `since_timestamp`

## When NOT to use

- One-shot listing/stat, file-content tail, shell-process lifecycle, cross-container aggregation (see §Related namespaces).

## Prerequisites

- Container with `hoody-watch` kit (Linux only); see `SKILL-HTTP.md` for auth + URL routing.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Provision and verify

1. `POST /watchers` — paths plus optional `recursive`, `include`, `exclude`, `kinds`, `ignore_dirs`, `skip_hidden`, `coalesce_ms`, `history_size`
2. `GET /watchers/{id}` — read back `id`, `WatcherConfigView`, `WatcherStats`

### 2. SSE live-tail with resume

1. `POST /watchers`
2. `GET /watchers/{id}/events/sse` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `GET /watchers/{id}/events`/`Iterator` with `since_id`; persist highest `id`.

### 4. WebSocket consumer

1. `POST /watchers`
2. `GET /watchers/{id}/events/ws` — respond to server `Ping` within ~20s or socket closes
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory and teardown

List/inspect/delete via `GET /watchers`/`get`/`DELETE /watchers/{id}`.

## Quirks & gotchas

- Linux only; on non-Linux hosts the binary exits before opening the listener (no HTTP served) — typically with code 0 via the container-path check, or code 1 if those paths exist. The 501 `UNSUPPORTED_PLATFORM` mapping in `api.rs` is a defensive branch that is unreachable from a normal startup.
- No kit-level auth header; do not add `Authorization` on direct kit calls
- `recursive` defaults `true`; `coalesce_ms` defaults `100`
- `ignore_dirs` default: `node_modules, .git, target, __pycache__, .hg, .svn, .cache, dist, .next, .nuxt, vendor, bower_components`. Pass `[]` to disable; `null` falls back to default
- Hard limits: 128 watchers/kit, 32 paths/watcher, 64 stream clients/watcher, replay buffer 100 000 events or 16 MiB (first hit)
- Watcher ids are UUIDs (`Path<Uuid>`); non-UUID segment yields 400 from axum extractor
- `since_id` and `since_timestamp` mutually exclusive — both = 400 `INVALID_CURSOR`
- `since_timestamp` accepts RFC3339, unix seconds, or millis (switches to ms when `|n| >= 100_000_000_000`)
- WS message cap 64 KiB (`ws_max_message_bytes`); server pings every 20s, disconnects on missed pong
- `kind` (wire field name): `created | modified | removed | renamed | metadata | overflow | other` (snake_case enum); `overflow` = inotify dropped events

## Common errors

- `400 INVALID_PAGINATION` — `page < 1` or `limit ∉ [1,200]`; defaults `page=1, limit=50`
- `400 INVALID_REQUEST` — empty `paths`, invalid/missing path, or glob compile fail (`EmptyPaths`, `InvalidPath`, `PathNotFound`, `InvalidPattern`, `InvalidIgnoreDir`)
- `400 INVALID_CURSOR` — both cursor fields, or unparseable timestamp
- `404 WATCHER_NOT_FOUND` — UUID syntactically valid but no watcher; also raised pre-upgrade on stream endpoints
- `409 LIMIT_EXCEEDED` — `paths > 32` or `active_watchers >= 128` on create
- `409 HISTORY_GAP` — cursor older than oldest retained; body `details` carries `oldest_available_id` / `newest_available_id`
- `429 MAX_CLIENTS_REACHED` — >64 concurrent SSE+WS on one watcher; capacity incremented after checks pass (no slot leak)
- `503 SHUTTING_DOWN` — only on `GET /watchers/{id}/events/sse`/`GET /watchers/{id}/events/ws` while draining; history reads still work
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Every step in every example was live-tested against a real `watch-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. **There is no `update` endpoint** — change a watcher's config = delete + recreate.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history.

**Step 1 — create the watcher.** Capture `id`. `recursive` defaults to `true`; tighten `coalesce_ms` from the default 100 ms to 50 ms for snappier debounce.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' \
  -d '{"paths":["/tmp/wt"],"recursive":true,"coalesce_ms":50}' | jq -r .id)
echo "WID=$WID"
```
**Step 2 — read back stats** (response carries `config` + `stats`; `events_seen > 0` after the first FS touch confirms the inotify watch is live).

```bash
curl -sf "$KIT/watchers/$WID" | jq '{id, config: .config | {paths, recursive, coalesce_ms}, stats}'
```
### 2. SSE live-tail with `since_id` resume after disconnect

**Goal:** subscribe to live events; on disconnect, replay everything missed.

**Step 1 — open the SSE stream.** Each frame is `id: <n>\nevent: file_event\ndata: {…json…}\n\n`. The `id` is monotonic; persist it as your resume cursor.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
curl -sN -H 'Accept: text/event-stream' "$KIT/watchers/$WID/events/sse"
# id: 519
# event: file_event
# data: {"id":519,"watcher_id":"…","kind":"created","path":"/tmp/wt/app.log","new_size_bytes":0,"is_dir":false,"timestamp":"…"}
```
**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if the buffer rolled past your cursor you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```bash
curl -sN -H 'Accept: text/event-stream' \
  "$KIT/watchers/$WID/events/sse?since_id=$LAST_ID"
```
### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer needs binary frames or bidirectional control. Server sends Ping every ~20 s; miss the pong and the socket closes.

```bash
# wscat or any WS client. URL is wss://, NOT https://, on the SAME host.
wscat -c "wss://${P}-${C}-watch-1.${N}.containers.hoody.com/watchers/$WID/events/ws?since_id=37000"
# < {"id":37511,"watcher_id":"…","kind":"created","path":"/tmp/wt/ws-trigger.txt",…}
# (server Ping arrives every ~20s; client lib auto-pongs)
```
A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from `newest_available_id`. Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
PAGE=1
while :; do
  R=$(curl -sf "$KIT/watchers/$WID/events?since_id=$LAST&page=$PAGE&limit=200")
  N=$(jq '.items | length' <<< "$R")
  jq -c '.items[]' <<< "$R" >> /tmp/events.ndjson
  [ "$N" -lt 200 ] && break
  PAGE=$((PAGE+1))
done
LAST=$(jq -r '.newest_available_id' <<< "$R")
echo "resume cursor=$LAST"
```
### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild only on real content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' \
  -d '{"paths":["/tmp/wt"],"kinds":["modified"],"coalesce_ms":50}' | jq -r .id)
# Sanity-check that only modified events arrive after a few writes:
curl -sf "$KIT/watchers/$WID/events?limit=20" \
  | jq '[.items[].kind] | unique'   # → ["modified"]
```
⚠ A single `writeFile` triggers two `inotify` events on Linux: the `created` (size 0) and a follow-up `modified` once data is written. With `kinds: ["modified"]` you skip the empty-file noise and only see real writes — live-verified.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' \
  -d '{
    "paths":["/tmp/wt"],
    "include":["**/*.log"],
    "exclude":["**/secret-*.log"]
  }' | jq -r .id)
# After a few writes, only non-secret .log paths show up:
curl -sf "$KIT/watchers/$WID/events?limit=40" | jq '[.items[].path] | unique'
# → ["/tmp/wt/app.log"]   (secret-1.log and data.json are filtered out)
```
### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` is the inotify-side counter (post-coalesce); `active_clients` counts live SSE+WS connections.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
curl -sf "$KIT/watchers?limit=200" \
  | jq '.items[] | {id, paths: .config.paths, kinds: (.config.kinds // []),
                    events_seen: .stats.events_seen,
                    active_clients: .stats.active_clients}'
```
### 8. Change a watcher's config — there is no `update`, you delete and recreate

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. The kit exposes only `create | get | delete` — there is **no** `PATCH /watchers/{id}`. Pattern: snapshot the old config, delete, create new, hand off the resume cursor.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
# 1. snapshot
OLD=$(curl -sf "$KIT/watchers/$WID")
LAST=$(curl -sf "$KIT/watchers/$WID/events?limit=1" | jq -r '.newest_available_id // 0')
# 2. delete
curl -sX DELETE "$KIT/watchers/$WID"
# 3. recreate with merged config; reuse paths/include/exclude/coalesce_ms from $OLD
NEW_CFG=$(jq '.config | {paths, recursive, include, exclude, ignore_dirs, coalesce_ms,
                          history_size, kinds: ["modified","removed"]}' <<<"$OLD")
NEW=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' -d "$NEW_CFG" | jq -r .id)
# 4. consumer reconnects to NEW with since_id="$LAST" — but ids are per-watcher,
#    Event ids are process-global (monotonic AtomicU64 on WatchServiceInner — see models.rs:20),
#    so the new watcher's first event has id ≥ the global counter at swap time; treat HISTORY_GAP
#    as the trigger for a full re-list, not the swap itself.
echo "old=$WID new=$NEW (caller MUST drop the old cursor; new id space)"
```
⚠ Event ids are process-global, not per-watcher; the `since_id` cursor remains numerically valid across the swap, but the new watcher's first event will have an id ≥ the global counter, so any gap below that is from the old watcher's stream — treat HISTORY_GAP as the trigger for a full re-list, not the swap itself.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /watchers/{id}` and `/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
curl -sX DELETE "$KIT/watchers/$WID"   # → {"id":"…","deleted":true}
# Verify gone:
curl -sw '\n%{http_code}\n' "$KIT/watchers/$WID"          # → 404 WATCHER_NOT_FOUND
curl -sw '\n%{http_code}\n' "$KIT/watchers/$WID/events"   # → 404 WATCHER_NOT_FOUND
```
### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
TS=$(date -u -d '5 minutes ago' +%FT%TZ)
curl -sf "$KIT/watchers/$WID/events?since_timestamp=$TS&limit=200" \
  | jq '{count: (.items|length), kinds: [.items[].kind] | unique, oldest_available_id, newest_available_id}'
```
For a rename the kit relies on the notify backend's combined `RenameMode::Both` event, which carries both paths: it emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side with `old_path: null`. Filter on `old_path != null` to keep only the paired form.

## Reference

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/watch/health` | Health Check |  |

### `streams` (3) — Real-time event streams

| Method | Summary | Params |
|--------|---------|--------|
| `GET /watchers/{id}/events` | List Watcher Events | `?since_id` `?since_timestamp` `?page` `?limit` |
| `GET /watchers/{id}/events/sse` | Stream Watcher Events Sse | `?since_id` `?since_timestamp` |
| `GET /watchers/{id}/events/ws` | Stream Watcher Events Ws | `?since_id` `?since_timestamp` |

**Param notes:**

- `since_id` — Replay events strictly after this event id.
- `since_timestamp` — Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123)
- `page` — Page number (1-based).
- `limit` — Items per page (1-200).

### `system` (2) — System endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /openapi.json` | Get Open Api Json |  |
| `GET /openapi.yaml` | Get Open Api Yaml |  |

### `watchers` (4) — Watcher management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /watchers` | Create Watcher | `body*:watch_CreateWatcherRequest` |
| `DELETE /watchers/{id}` | Delete Watcher |  |
| `GET /watchers/{id}` | Get Watcher |  |
| `GET /watchers` | List Watchers | `?page` `?limit` |

**Param notes:**

- `page` — Page number (1-based).
- `limit` — Items per page (1-200).


### Body schemas

- `watch_CreateWatcherRequest` — `{ coalesce_ms: int|null, exclude: string[]|null, history_size: int|null, ignore_dirs: string[]|null, include: string[]|null, kinds: watch_WatchEventKind[]|null, paths*: string[], recursive: bool|null, skip_hidden: bool|null }`
- `watch_WatchEventKind` — `"created" | "modified" | "removed" | "renamed" | "metadata" | "overflow" | "other"`
