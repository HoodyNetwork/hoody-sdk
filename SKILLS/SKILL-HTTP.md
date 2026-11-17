> _**HTTP skill (basic)** · ~27,478 tokens · hoody-sdk v1.0.1_

# HTTP mode — drive Hoody with curl

Drive Hoody with `curl` or any HTTP client. No SDK or CLI.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud computers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A computer is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...computers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + computer plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.computers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit UI is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …; an exec script's response keeps the framing policy it sends) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service (serverless: a fresh VM per request; `// @mode worker` keeps one VM per deployment); **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST?** Use `curl` — `GET /api/v1/curl/request?url=…&method=POST` on the curl kit URL turns any REST call into a single GET-able link (the GET surface takes 21 query params (`body` and `body_base64` are aliases of `data` and `data_base64`) — including `data`, `json`, `data_base64` and a repeatable `header`, so bodies AND headers DO work as query params, and supplying a body defaults the upstream method to POST when `method` is omitted (an explicit `method` is used as supplied); URL-encoded `form` fields, a headers map, cookies, Basic auth and the connection limits stay `POST /api/v1/curl/request`-only, and neither form sends multipart uploads). See `curl` namespace.

**Stuck, or unsure how to do something?** Ask Hoody's public docs assistant — an unauthenticated MCP endpoint at `https://chatbot.hoody.com/mcp` (one tool, `search_hoody_docs`; or the `POST /api/chat` SSE fallback) answers any "how do I…" with cited doc URLs. Use it for discovery when you're not sure which namespace fits.

## When to choose HTTP

Use when there's no SDK for your language, you need copy-pasteable recipes (runbooks, CI, webhooks), gluing into an HTTP toolchain, or debugging the wire. Skip for SDK ergonomics (`SKILL-SDK.md`) or `hoody` CLI (`SKILL-CLI.md`). You handle pagination, retries, errors.

## Endpoint surface

| Surface | Hostname | Auth |
|---|---|---|
| Control plane | `https://api.hoody.com` | `Authorization: Bearer <token>` |
| Computer kit | `https://{projectId}-{computerId}-{kit_slug}-{serviceIndex}.{server}.computers.hoody.com` | URL is the credential under the default allow policy; proxy permissions can require more |

See § Proxy URLs and § Auth model below.

## Reference table sigils

Per-namespace `## Reference` tables compress params with sigils:

- `{x}` — path param (already in URL).
- `?x` / `?x*` — query param (`*` = required).
- `body` / `body*` — request body (`*` = required), JSON unless the suffix is a media type: `body*:foo_CreateInput` names a JSON schema, while `body*:application/octet-stream`, `body*:text/plain` or `body*:multipart/form-data` means send that content type, not JSON.
- `H:x` / `H:x*` — header param.
- Type column dropped — inferable from name (`id` string, `limit` int, `enabled` bool). Body schema refs are kept verbatim.

Bare `body*` rows are spelled out under the same service in a **Body shapes** block: `{ field*: type=default, … }` one-liners (`*` = required, `=v` = default, `|` = alternatives) plus field-semantics bullets. Named refs (`body*:foo_CreateInput`) resolve in the namespace's **Body schemas** appendix.


## Auth

- Control plane: header starts with `Bearer ` (one space, capital B); an `hdy_` auth token may also be sent bare. Kit URL: no credential of its own — gate kit URLs with proxy permissions; an `exec` script can also require its own token (`// @token`, or `// @remote-token` for remote operations) and answers `401` without a match (see the `exec` skill).
- Sign-in: browser sign-in is the default — `POST /api/v1/auth/device/code`, give the user the link and code, poll `POST /api/v1/auth/device/token` (§ Login). Existing account: always browser sign-in first; if it fails, stalls or is refused, ask for a token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password (use one only if offered). Never repeat or store a secret.
- Password login (last resort): `POST /api/v1/users/auth/login` with `{ username, password }` **or** `{ email, password }` — field **`token`**. An account with 2FA answers `data: { requires_2fa: true, temp_token }` and no `token`: send `temp_token` and the code to `POST /api/v1/users/auth/2fa/verify`, whose answer carries the token (§ Login shows the branch). `password` plus one identifier (`username` or `email`) is required; `username` must match `^[a-zA-Z0-9_-]+$` (3–50 chars), so an email address authenticates **only** through the `email` field — sending one as `username` returns `422 Validation failed`. Every Hoody account is created with an email, so `email` is the common path.
- Long-lived: `POST /api/v1/auth/tokens`, only for unattended automation the user asked for.

## Response envelope

Control plane (`api.hoody.com`) success, common shape: `{ "statusCode": 200, "message": "...", "data": { ...payload } }`. Some endpoints omit `message`, including a successful `POST /api/v1/auth/device/token`; read `statusCode` and `data`.

Paginated: shape varies per route. The page-based shape is `data.{<resource>: [...], pagination: { total, page, limit, totalPages }}` (e.g. projects, computers); iterate `?page=` until `totalPages`. A few routes (e.g. events) use `{ total, limit, offset, has_more }` instead — check the response type for the call you're making.

`GET /api/v1/auth/available-regions` has the regions at `data.regions` in the response body (single envelope wrap, like every other API response — earlier docs incorrectly called it doubly-wrapped).

Errors: `{ "statusCode": 401, "error": "...", "message": "..." }`. Codes: § Reference appendix.

Kit URLs use per-kit shapes: many answer bare JSON with no `data` wrapper (e.g. watch `POST /api/v1/watch/watchers` returns `{id,...}` at the root; tunnel `GET /api/v1/tunnel/tunnels` returns `{sessions,...}`). Check the kit's response schema before writing a `jq` path.

## Streaming

- **SSE** — `Accept: text/event-stream`; use `curl --no-buffer`. Resume mechanism is per-endpoint: watcher uses `?since_id=` / `?since_timestamp=`; proxy-logs `/_logs/stream` honours `Last-Event-ID:` (on `event: reset` discard the saved id and reconnect fresh); `/api/v1/exec/logs/stream?file=<log-file>` has no resume cursor (re-reads the file). Endpoints: watcher events, `/api/v1/exec/logs/stream?file=<log-file>`, proxy-logs `/_logs/stream`. (Notifications `GET /api/v1/notifications/stream` serves both: a WebSocket upgrade, or SSE on a plain GET with `?displays=all` or a display list; the SDK's `notifications.connect` uses WebSocket.)
- **WebSocket** — watcher `events/ws`, tunnel data planes. Use `websocat`/`wscat`.

## Index of common ops

§ Core ops cheat-sheet covers: auth (signup/login/2FA/refresh/long-lived); projects + computers (list/create/lifecycle, kit-URL resolution); one-off shell and terminal sessions; files up/down/append; display screenshot and click; sqlite db and KV; watch SSE; tunnels; snapshot/restore; vault; wallet; proxy alias.

Per-namespace recipes in `SKILL-HTTP/<ns>.md`: `agent api browser code cron curl daemon display egress exec files notes notifications pipe proxyLogs run sqlite terminal tunnel vm watch`.

---

# Proxy URLs — capability-based per-computer routing

## What it is

`https://{projectId}-{computerId}-{kit_slug}-{n}.{node}.computers.hoody.com`

- Proxy terminates TLS on `*.computers.hoody.com`, parses the hostname segments (project, computer, kit, index) and routes to that kit.
- Hoody API: global `https://api.hoody.com`.
- Aliases (`my-api.{N}.computers.hoody.com`) are shortcuts; canonical URL is authoritative.

## Components

| Segment | Meaning |
|---|---|
| `projectId` | 24-char hex. |
| `computerId` | 24-char hex. Bearer credential. |
| `kit_slug` | Kit id (see Kit slug table); some namespaces differ from their slug (e.g. `notifications` → `n`, `proxyLogs` → `logs`). |
| `n` | 1-based instance index; single-instance kits use `1`. |
| `node` | Bare server hostname (use the `server_name` field from computer responses). |
| Suffix | `.computers.hoody.com` |

## Embed kit UIs — compose a UI out of kits

Each kit URL serves a regular HTML/JS page (or HTTP/WS API). Drop a UI page into an `<iframe>` where its framing policy permits it and you have a working surface in your own app. Not every page does: an exec script's response carries its own framing policy:

```html
<iframe src="https://{P}-{C}-code-1.{N}.computers.hoody.com"      ></iframe>  <!-- full VS Code -->
<iframe src="https://{P}-{C}-files-1.{N}.computers.hoody.com"     ></iframe>  <!-- file browser -->
<iframe src="https://{P}-{C}-terminal-1.{N}.computers.hoody.com"  ></iframe>  <!-- HTML5 terminal -->
<iframe src="https://{P}-{C}-display-1.{N}.computers.hoody.com"   ></iframe>  <!-- X11 desktop -->
<iframe src="https://{P}-{C}-desktop-1.{N}.computers.hoody.com"   ></iframe>  <!-- XFCE/MATE in a tab -->
<iframe src="https://{P}-{C}-notes-1.{N}.computers.hoody.com"     ></iframe>  <!-- notebooks -->
<iframe src="https://{P}-{C}-agent-1.{N}.computers.hoody.com"></iframe>  <!-- Hoody Agent GUI -->
```

You can compose a **full HTML "operating system" out of Hoody kit iframes** — no native code, no installer, just URLs.

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

The point: **don't make people leave their chat.** When someone hits a bug, drop a `code-N` URL with `?extension=<publisher>.<name>` (focuses Cline / Continue) or a `terminal-N` URL into the thread — others can read, type, kibitz, take over, all without context-switching to a new tab. The computer's filesystem is shared across every embed (same kit URL = same shell), so collaborators land on the *same* state.

> Warning: **Sharing a terminal / shell embed = giving root.** A `terminal`, `code`, `desktop`, `display`, or `agent` URL in a Slack channel, Notion page, or any other chat is effectively a root-shell credential. Anyone who can render the iframe can:
> - read every file the computer can read (env vars, tokens, vault entries, source code, customer data),
> - run any command (curl exfiltration, `rm -rf`, package installs, network scans, fork-bombs),
> - leverage the computer's other kit URLs and SDK accessors,
> - leave persistent footprints (cron jobs, daemons, snapshots, alias creations).
>
> An `<alias>.{N}.computers.hoody.com` does NOT add a security layer — it only hides `computerId`. **Share these URLs only with people you'd trust with `ssh root@…` access.** For broader audiences:
> - Gate the computer (§ How to gate): an auth group, that group's access to the program, and `default: 'deny'` — so a recipient still has to authenticate.
> - Use a **dedicated demo computer with no secrets** — wallet credentials, vault data, source code only what they need to see.
> - Set an **`expires_at`** on the alias for auto-expiry.
> - Watch **`proxyLogs`** for unexpected callers; if a URL leaks, disable its alias with `PATCH /api/v1/proxy/aliases/{aliasId}/state` with body `{"enabled":false}` (not instant: it usually stops serving within about 30 seconds and can take longer).
> - For untrusted reviewers (customers, support tickets, public demos): do not hand out a `display` kit URL as a "read-only" view — its readonly setting is client-side only, and anyone holding the URL can still call the display's input API (clicks, typing). Build a constrained `exec` script that exposes only the operation they need, such as serving a captured screenshot.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP / Hoody identity via `* /api/v1/computers/{id}/proxy/permissions*` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `POST /api/v1/proxy/aliases` with `{ computer_id, program: '<kit>', alias: 'repo-acme' }` to ship a brandable hostname (`https://repo-acme.{N}.computers.hoody.com`) into the iframe instead of the `{computerId}` URL. `agent` is the exception: an alias to it is accepted but never routes, so embed the agent by its kit URL.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace. They apply on a `display-<N>` URL only: a `desktop-<N>` URL redirects to its display without its query, so open the display URL (or add the params to the URL you are redirected to).
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- Several API kits also serve a browser UI on their kit URL: `cron` (crontab manager) and `watch` at `/`, the `sqlite` studio at `/`, and the `pipe` send / receive / share pages — check a kit's own UI (and its embed views) before building a custom dashboard. `curl` renders no UI, and `http-<port>` shows whatever your app serves.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## Source IP Guard

Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. (403 `forbidden`.)

## One URL form from everywhere

Call kits through their kit URLs on HTTPS, so the proxy's permissions, logging and hooks apply to every call.

What that gives you:

- **The same checks everywhere** — requests from inside computers go through the same `* /api/v1/computers/{id}/proxy/permissions*` checks and `* /_logs*` capture as external requests. The `* /api/v1/computers/{id}/proxy/hooks*` request hooks apply the same way, but only to services that accept hooks: `logs`, `egress` and `cdp` reject hook operations with `404`.
- **One mental model** — the same URL works from your laptop, from another computer and from inside the computer itself. You write the same code everywhere.

Practical consequence: from inside a computer, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.computers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this.

### Computer ↔ computer — anyone reaches anyone (with permissions)

**A process in computer X can call any kit on computer Y just by calling Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in computer X reads / writes files in computer Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.computers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three computers, three kit URLs, one transparent network.
- A monitoring computer scrapes `/metrics` from every computer in a project's fleet by listing them via `GET /api/v1/projects/{id}/computers` and hitting each one's kit URL.

Cross-computer access still goes through the gate stack — Y's `* /api/v1/computers/{id}/proxy/permissions*` rules apply to whoever's calling, no matter where they're calling from. So:

- **By default** (no gates set), Y's URL is a capability — anyone with the URL has access. Within your account that's usually fine; for production / shared / multi-tenant fleets you SHOULD gate.
- **With a gate set** (§ How to gate — an auth group alone is not a gate), X must satisfy it. A Token gate (`PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/token`) is a static shared secret: you choose where it is read (one header, cookie or query parameter) and the exact value it must equal, and X sends that value on every call to Y. It does not check Hoody auth tokens or realms — an `hdy_…` token passes only if it is literally the configured value. A JWT gate (`PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/jwt`) verifies a signed JWT instead; by default a valid token in any of its configured sources counts. For a cookie, use a `__Host-` name set by the address it protects.

Every computer-to-computer call gets the same permission checks and logs as an external call.

## Capability-token semantics — open by default, permission for production

**Under the default allow policy, the URL itself is the credential.** A well-formed kit URL routes without any `Authorization` header — anyone who knows the full URL has the same access as the owner, on every kit (an `exec` script that requires its own token is the one exception: it answers `401` without it). `computerId` is the secret. Computer-internal IDs (session, tab, notebook, terminal_id, displayId) follow the same "knowing the ID = having access" model.

**This is intentional for development**: spawn a computer, share the URL, collaborator reaches it instantly. **It is NOT acceptable for production exposure** — leaked URL = leaked computer. Treat any production deployment as "must have a gate".

### When to gate

- Anything reachable from a public network or shared with a third party.
- Anything that handles secrets, customer data, payments, or user PII.
- Anything where a leaked URL would be hard to rotate (long-lived background jobs, public dashboards, customer-facing demos).

### How to gate

Configure under `* /api/v1/computers/{id}/proxy/permissions*` (per-computer) or `* /api/v1/projects/{id}/proxy/permissions*` (project defaults for every computer in the project; a computer's own document overrides them: its groups and permission cells of the same name, its `default` (unless it is `inherit`, which uses the project's) and its `enable_proxy` win, so check the computer's document before you count on a project-level gate) on the control plane. Groups are alternatives, not layers: each named group (password, token, JWT, IP or hoody-identity — or an OR-array of those) is one way in, a request that satisfies a group gets that group's per-program `permissions`, and a request that matches no group falls to the document's `default` (`allow` or `deny`; on a computer, `inherit` applies the project's).

A group on its own restricts nothing. It grants only the programs you give it access to. With no stored policy, a project reads as `default: 'allow'` and a computer as `default: 'inherit'` (its project's default), and a request that matches no group gets in whenever the effective default is `allow`. A full `set` that leaves `default` out stores `deny`. A working gate takes three calls: define the group (`PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/password`, `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/token`, `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/jwt` or `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/ip`; a `hoody-identity` group has no granular setter, so write it with the whole document through `PUT /api/v1/computers/{id}/proxy/permissions`), give it access to each program it should reach (`PUT /api/v1/computers/{id}/proxy/permissions/permissions/{groupName}` with `{ program, access: true }`; for `http` and `https` name the application ports instead, for example `{ program: 'http', access: [8080] }`, because a boolean or `"*"` is refused with `422`), and set `PATCH /api/v1/computers/{id}/proxy/permissions/default` to `{ default: 'deny' }`. Every one of these writes is versioned: send the document's current `file_version` as `If-Match: file:v<N>` (`file:v0` while the document has none). A missing header is refused with `428` and a stale one with `412`. A granular write answers with the written document: its `data.file_version` is the new version and `data.etag` is the same version as `file:v<N>` (also sent as the `ETag` response header). Use it for the next write, or read the document again. The one partial exception: a password group with an access rule for a program answers a caller without credentials with a `401` challenge for that program even under `default: 'allow'`.

| Gate | Accessor | Caller behavior |
|---|---|---|
| Password | `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/password` | Browser / `curl -u user:pass` — HTTP Basic. |
| Token | `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/token` | The header, cookie or query parameter you configured must carry exactly the value you configured (a static shared secret). Name a cookie with the `__Host-` prefix. |
| JWT | `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/jwt` | Verifies the JWT's signature and its `exp` / `nbf` when present; issuer, audience and any other claim are checked only when you list them in the group's `claims` (exact match). |
| IP | `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/ip` | Source IP must match a CIDR. |
| Hoody identity | the whole document: `PUT /api/v1/computers/{id}/proxy/permissions` (no granular setter) | The caller presents a Hoody identity claim whose audience equals the group's `audience`; optional `allow_types`, `users` (24-hex user ids) and `max_age_seconds` narrow who passes. |

`disable` sets `enable_proxy` to `false` (`enable` sets it back to `true`), which is a kill-switch for the whole proxy, not a gate toggle: while it is `false` every request that reaches the permission layer is refused with `403` before groups or `default` are evaluated, and the configured groups are kept. It never opens access. (A project-level `false` does not apply to a computer whose own document sets `enable_proxy: true` — use the computer-level call to cut one computer reliably.)

Defense in depth: gate the kit URL AND scope any auth-token bearer (realms, IP allowlist) AND keep a short TTL on JWTs. A leaked auth-token is recoverable; a leaked-and-public kit URL is not.

## Kit slug table — every namespace's public URL

Throughout: `{P}` = `projectId` (24-hex), `{C}` = `computerId` (24-hex), `{N}` = `server_name` (e.g. `node-example-1`). All URLs route through `*.computers.hoody.com`.

The middle column shows the host service segment, including an instance index or, for `exec`, an exec ID. For `{kit_slug}` in the URL formula, use the bare slug, such as `n`, `logs` or `watch`.

| Namespace | Host service segment (kit slug plus instance index) | Public URL (single-instance form) |
|---|---|---|
| `agent` | `agent-{index}` | `https://{P}-{C}-agent-1.{N}.computers.hoody.com` — the in-computer AI agent HTTP gateway: sessions/prompt, models, skills, memory, todos, workflows, hooks, github, tools, logs |
| `api` | — (control plane) | `https://api.hoody.com` (global, not per-computer) |
| `run` | `run-1` | `https://{P}-{C}-run-1.{N}.computers.hoody.com` |
| `browser` | `browser-1` (multi-instance) | `https://{P}-{C}-browser-1.{N}.computers.hoody.com` (also `-browser-2`, …) |
| `code` | `code-1` (multi-instance) | `https://{P}-{C}-code-1.{N}.computers.hoody.com` (also `-code-2`, `-code-3`, …) |
| `cron` | `cron-1` | `https://{P}-{C}-cron-1.{N}.computers.hoody.com` |
| `curl` | `curl-1` | `https://{P}-{C}-curl-1.{N}.computers.hoody.com` |
| `daemon` | `daemon-1` | `https://{P}-{C}-daemon-1.{N}.computers.hoody.com` |
| `display` | `display-<N>` (multi) | `https://{P}-{C}-display-1.{N}.computers.hoody.com` (`display-1`, `-2`, …) |
| (no SDK namespace — registered program) | `desktop-<N>` | `https://{P}-{C}-desktop-1.{N}.computers.hoody.com?desktop_env=xfce` — opens a full XFCE/MATE desktop in the browser (see § Desktop alias) |
| `egress` | `egress-1` | `https://{P}-{C}-egress-1.{N}.computers.hoody.com` — outbound HTTP proxy (CONNECT + absolute-URI forwarding); every `egress-<n>` index reaches the same single process, but proxy permissions evaluate per index |
| `exec` | `exec-<id>` (an exec ID, e.g. `exec-1`); script by PATH | `https://{P}-{C}-exec-1.{N}.computers.hoody.com/{script}` |
| `files` | `files-1` | `https://{P}-{C}-files-1.{N}.computers.hoody.com` |
| `notes` | `notes-1` | `https://{P}-{C}-notes-1.{N}.computers.hoody.com` |
| `notifications` | `n-<display>` (the API names the display in each request) | `https://{P}-{C}-n-1.{N}.computers.hoody.com` |
| `pipe` | `pipe-1` | `https://{P}-{C}-pipe-1.{N}.computers.hoody.com` |
| `proxyLogs` | `logs-1` | `https://{P}-{C}-logs-1.{N}.computers.hoody.com` |
| `sqlite` | `sqlite-1` | `https://{P}-{C}-sqlite-1.{N}.computers.hoody.com` |
| `terminal` | `terminal-<id>` (per session) | `https://{P}-{C}-terminal-1.{N}.computers.hoody.com` (`terminal-3` for session 3, etc.) |
| `tunnel` | `tunnel-1` | `https://{P}-{C}-tunnel-1.{N}.computers.hoody.com` |
| `vm` | `vm-1` | `https://{P}-{C}-vm-1.{N}.computers.hoody.com` — virtual machines inside the computer (the computer needs `kvm: true`; there is no software emulation fallback) |
| `watch` | `watch-1` | `https://{P}-{C}-watch-1.{N}.computers.hoody.com` |
| (any port) | `http-<port>` / `https-<port>` | `https://{P}-{C}-http-8080.{N}.computers.hoody.com` (see § User-hosted services) |
| (none — direct shell) | `ssh` | `ssh root@{P}-{C}-ssh.{N}.computers.hoody.com` (see § SSH access) — port `22`, public-key only |

### Concrete example

For project `65f1...c8a`, computer `65f2...41e`, server `node-example-1`:

| Surface | URL |
|---|---|
| Files API | `https://65f1...c8a-65f2...41e-files-1.node-example-1.computers.hoody.com/api/v1/files/home/user/main.py` |
| Exec script `render.ts` (flat) | `https://65f1...c8a-65f2...41e-exec-1.node-example-1.computers.hoody.com/render` (path) |
| SQLite kit | `https://65f1...c8a-65f2...41e-sqlite-1.node-example-1.computers.hoody.com/api/v1/sqlite/db/...` |
| Display 1 (X11) | `https://65f1...c8a-65f2...41e-display-1.node-example-1.computers.hoody.com/` |
| **Full XFCE desktop** | `https://65f1...c8a-65f2...41e-desktop-1.node-example-1.computers.hoody.com/` |
| Same, but MATE | `https://65f1...c8a-65f2...41e-desktop-1.node-example-1.computers.hoody.com/?desktop_env=mate` |
| Terminal session 3 | `https://65f1...c8a-65f2...41e-terminal-3.node-example-1.computers.hoody.com/api/v1/terminal/...` |
| Proxy logs | `https://65f1...c8a-65f2...41e-logs-1.node-example-1.computers.hoody.com/` |
| Watch (file-events) | `https://65f1...c8a-65f2...41e-watch-1.node-example-1.computers.hoody.com/api/v1/watch/watchers/...` |
| Coding agent HTTP API | `https://65f1...c8a-65f2...41e-agent-1.node-example-1.computers.hoody.com/api/v1/agent/...` |
| Hoody Agent GUI (for humans) | `https://65f1...c8a-65f2...41e-agent-1.node-example-1.computers.hoody.com/` |
| User HTTP server on `:8080` | `https://65f1...c8a-65f2...41e-http-8080.node-example-1.computers.hoody.com/` |

### Conventions

- `code`, `display` and `browser` are multi-instance — append a numeric instance: `-code-1`, `-code-2`, `-display-1`, `-display-7`, `-browser-2` (each `browser-N` is a separate browser).
- `terminal` packs the terminal **session** id into the instance index (`terminal-3` = session 3). The proxy sets `?terminal_id=` from that hostname index and overwrites any value you send, so the hostname is authoritative: to act on session N (`/execute`, `/paste`, `/press`, `/raw`), call the `terminal-N` host. New sessions use ids 1–9999; with the default bands 1601–4500 back desktops (`desktop-N` = 1600+N), 4501–5000 back agents and are refused on a `terminal-N` host, 5001–7999 is the ephemeral pool and 8001–9999 is taken by program terminals, so pin your own in 1–1600. A session an older kit version created above 9999 cannot be reached through a kit URL: with 24-character project and computer ids, a five-digit `terminal-N` label exceeds the 63-character DNS label limit, and the shorter `t-N` form, when it reaches the proxy with an index above 9999, gets `404 SERVICE_INDEX_OUT_OF_RANGE`. `terminal-0` is the "no session" host — use it with `?ephemeral=true` so the kit allocates a fresh session instead of reusing session 1.
- `display`/`terminal` pairing depends on how the session is created. A session started through a `terminal-N` URL gets `DISPLAY=:N` automatically (the proxy injects `display=N` with `terminal_id=N`; an ephemeral session drops it). A session created with a JSON `/create` body gets `DISPLAY=:N` only when the body sends `display: ':N'`. Use the same number for both by convention — `terminal_id` N, `display` `:N`, then the `display-N` kit URL shows what that session draws.
- `exec` serves each script at a **path** on the exec host: a file `hello.js` is reachable at `https://{P}-{C}-exec-1.{N}.computers.hoody.com/hello` (the `.js`/`.ts` extension is stripped; the path keeps the file name's case, so `MyTool.ts` is served at `/MyTool`, not `/mytool`). For public requests, the kit looks first in `scripts/default/<id>/`, then falls back through `scripts/default/`, `scripts/<id>/`, and `scripts/`. An `.exclusive` file in `scripts/default/<id>/` disables those fallbacks. Worker state is kept separately per deployment, so `exec-1` and `exec-2` have separate worker contexts. Scripts are served by path on the exec host; a `{sub}.`-prefixed host is not routed by the edge, so do not rely on the exec kit's `scripts/{sub}/` subdomain trees from a kit URL.
- `notifications`: every `n-<N>` host reaches the same notifications service. The API ignores N, so name the target display in each request (`display` in the `notify` body, `{display}` in the list path). The kit's web page at `/` uses N as its default display (`n-3` opens the page for display :3), so embed `n-<N>` for display N.
- `POST /api/v1/proxy/aliases` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. The program names to use for an alias are listed in the `program` row of the Anatomy table under §Friendly aliases below — note `logs` for the proxy-logs kit (not `proxy` or `proxyLogs`) and `run` (not `app`).

## Desktop alias — `desktop-<N>` (full XFCE / MATE desktop in a browser tab)

Open `https://{P}-{C}-desktop-1.{N}.computers.hoody.com` and you land on a complete Linux desktop session — no SDK call, no extra kit, no installation step. There is **no generated REST operation for this surface** (it has no namespace), but SDK helpers (`getKitUrl('desktop', computer, N)`) and CLI helpers can compose or open the URL — the URL itself is the whole interface.

### How it works

`desktop-<N>` is a thin alias on top of `terminal` + `display`:

1. The proxy rewrites the request to the `terminal` kit with forced query args `desktop=true`, `redirect=display`, `terminal_id=<offset>+N`, `display=<offset>+N`.
2. The terminal kit spawns the chosen desktop environment under that virtual display.
3. As soon as the display is up, the browser is `302`'d to the matching `display-<offset>+N` kit URL.

By default the terminal index is offset by `1600` so desktop sessions sit in a separate range from regular `terminal-1`/`terminal-2`/… slots (a deployment can change the offset). The ranges share one ID space, though: an ordinary terminal at `1601` is the same session as `desktop-1`, so do not allocate ordinary sessions at IDs your desktops use. With the default offset, `desktop-1` uses `terminal_id=1601` and lands on `display-1601`; `desktop-7` uses `terminal_id=1607` and `display-1607`. You usually don't see those numbers — the redirect is invisible.

### Choose the desktop environment

Append `?desktop_env=`:

| Value | DE |
|---|---|
| `xfce` (default) | XFCE 4 |
| `mate` | MATE |

```
https://{P}-{C}-desktop-1.{N}.computers.hoody.com?desktop_env=mate
```

`desktop_env` only picks the environment when the desktop starts. Opening a `desktop-<N>` that is already running with a different value does not switch it: use a free index, or stop that display first (`POST /api/v1/system/displays/{display}/stop`) and open the URL again.

Other DEs (GNOME, KDE) are not auto-spawned by the alias — install + run them yourself via `daemon` and reach via the matching `display-<N>` URL directly.

### Forced vs caller-overridable

The proxy locks `desktop=true`, `redirect=display`, `terminal_id`, and `display` to the offset values — passing them in the query string is ignored (defense-in-depth so a caller can't escape the offset isolation). **`desktop_env` is caller-overridable, and other query parameters pass through; only those four are forced.**

### When to use the desktop alias vs `display-<N>` directly

- **Desktop alias** — quick "give me a Linux desktop in a browser tab" surface; no setup needed.
- **`display-<N>` directly** — when a session is already running there (e.g. you launched apps from `terminal-N` so the GUI is on `display-N`), or when you want fine-grained control over the X session.

### Building kit URLs

To compose a kit URL by hand, read `project_id`, `id` and `server_name` from `GET /api/v1/computers/{id}` and fill in the patterns above.

## SSH access — shell through the host-side SSH proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `sftp`, `git push` over SSH), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{computerId}-ssh.{node}.computers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). The connection ends at a host-side SSH proxy, not at a server inside the computer: the proxy looks up your public key, finds the one computer that key is registered to, and runs the shell, SFTP or SCP session in that computer through the host. No `sshd` runs in the computer. Port forwarding (`ssh -L`, `ssh -R`) is disabled.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `POST /api/v1/projects/{id}/computers` / `PUT /api/v1/computers/{id}` / `POST /api/v1/computers/{id}/copy`. The key is registered with the host-side SSH proxy, not written to an `authorized_keys` file in the computer. Password auth is disabled.

**The public key MUST be unique across computers — one computer per key**, because the key alone selects the computer. Reusing a key that another computer already holds returns `409` with a message saying the key is already in use (when two creates race for the same key, the losing one still creates its computer, without the key: `ssh_public_key` is `null` and `message` says so, so check it before you connect). Generate a fresh keypair per computer; you can rotate via `PUT /api/v1/computers/{id}` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; terminal sessions can instead run as a requested user or the terminal server's configured default user. Anything inside the computer is yours.

### IP filtering

The SSH endpoint accepts IPv4 connections only and any IPv4 address may connect; the registered key is the access control. SSH sessions reach the computer through the host-side proxy and the host, not through the computer's network interface, so computer firewall rules (`* /api/v1/computers/{id}/firewall/r*` ingress rules) and in-computer `iptables` / `nftables` rules do not filter them. To cut off a key, replace it with `PUT /api/v1/computers/{id}` (new `ssh_public_key`). For kit URLs, restrict source IPs with `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/ip`.

### When SSH vs kit URLs

| Need | Use |
|---|---|
| Anywhere-reachable HTTP, logged, gated | Kit URL (`terminal`, `files`, `exec`, `display`, `http-<port>` …) |
| `git clone <ssh url>` / `rsync` / `scp` | SSH |
| Reach an internal-only service from your laptop | Not SSH (port forwarding is disabled): use its `http-<port>` URL, gated with `* /api/v1/computers/{id}/proxy/permissions*` |
| Heavily-firewalled box that must not expose any web surface | SSH only; close all kit URLs via gates |
| Drive a TUI from REST | `terminal` namespace (proxy-logged) |
| Drive an X11 GUI from REST | `display` kit + `terminal` for spawn (proxy-logged) |
| A record of the requests made to a kit | Kit URL (`terminal`) — the proxy logs each HTTP request (terminal input is not logged command by command) |

## User-hosted services — `http-<port>` / `https-<port>`

**Anything you bind on a computer port is automatically reachable from the public URL.** Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers. No alias, no firewall edit, no proxy registration. Use one of two slugs:

| Slug form | Inner protocol | Edge URL |
|---|---|---|
| `http-<port>` | proxy speaks **HTTP** to `<computer-network-ip>:<port>` inside the computer | `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` |
| `https-<port>` | proxy speaks **HTTPS** to `<computer-network-ip>:<port>` (target must terminate TLS) | `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` |

Edge is always `https://` regardless — TLS terminates at the proxy. The `http-` / `https-` slug only describes what the proxy talks on the inside.

Examples:

```
# Plain HTTP server on :8080 inside the computer
https://65f1...c8a-65f2...41e-http-8080.node-example-1.computers.hoody.com

# Service that already terminates TLS on :8443
https://65f1...c8a-65f2...41e-https-8443.node-example-1.computers.hoody.com

# WebSockets just work (use `wss://`)
wss://65f1...c8a-65f2...41e-http-3000.node-example-1.computers.hoody.com/ws
```

Defaults when port omitted: `http` ⇒ port 80, `https` ⇒ port 443. Port range `1..65535`. Capability-token rules still apply — gate the URL via `* /api/v1/computers/{id}/proxy/permissions*` if you don't want it open.

## Friendly aliases — `<alias>.{N}.computers.hoody.com`

A **proxy alias** is a custom hostname that points at one specific program inside a computer, without putting the `projectId` / `computerId` in the URL you share. Same capability-token semantics — alias URL on its own is the credential — but the URL is shareable, brandable, and hides the computer plumbing.

### Why use them

- **Hide `computerId`**: shipping `https://my-api.{N}.computers.hoody.com` is fine; shipping `https://65f1...c8a-65f2...41e-http-8080.{node}.computers.hoody.com` leaks the computer identifier (which IS the credential of last resort). Not every program keeps it hidden: a `desktop` alias redirects the browser to the canonical `display` URL, which carries both ids. An alias is not an access rule either, and disabling or expiring it does not close the canonical URL: restrict who may open the program with `* /api/v1/computers/{id}/proxy/permissions*`.
- **Brandable**: short, memorable, copy-pasteable.
- **Retargetable within its computer**: an update can change the alias's program, port, instance index or landing path while the public URL stays the same. It cannot move the alias to another computer (the update takes no `computer_id`); for a new computer, delete the alias and create it there.
- **Same gate stack**: layer Password / Token / JWT / IP / Hoody identity via `* /api/v1/computers/{id}/proxy/permissions*` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`POST /api/v1/proxy/aliases` with `{ computer_id, program, alias?, index?, port?, target_path?, allow_path_override?, expires_at?, enabled? }`

| Field | Notes |
|---|---|
| `computer_id` | 24-char hex id of the target computer — required. |
| `alias` | 3-61 chars, lowercase alphanumeric **plus hyphens** (`a-z0-9-`, no leading/trailing hyphen). Omit `alias` or send `null`/`false` for a random 48-character hex name. Some names are reserved and refused with `400`, including the whole labels `computers` and `containers`, `egress` and names starting `egress-`, and names resembling canonical computer hostnames. Distinct labels such as `egressmyapp` and `computers-my-app` are allowed. Becomes `<alias>.{N}.computers.hoody.com`. Three rules, any of which answers `409 ALIAS_IN_USE`: the name must be free on the computer's physical server (across every tenant there); your own account may hold a given name only once across all servers; and a name another account deleted or renamed away from on that server stays reserved to that account for 90 days (on every server when its computer was deleted). A name you released yourself is not held against you. |
| `program` | Which kit/protocol to route to. Names to use, protocols first and then programs, with accepted aliases in parentheses: `http`, `https`, `ssh`, `terminal` (`tty`, `ttyd`, `t`), `display` (`d`), `desktop`, `cron`, `watch` (`w`), `notifications` (`notification`, `n`), `files` (`f`), `daemon`, `code`, `agent`, `exec` (`e`), `browser` (`b`), `cdp`, `curl`, `run`, `sqlite`, `logs` (`log`, `l`), `egress`, `pipe`, `notes` (`note`), `tunnel`, `vm`. A name the API does not know, such as `cli`, `proxy` or `proxyLogs`, is refused with `400 Unknown program name`. The proxy-logs kit is `logs` (NOT `proxy` or `proxyLogs`), and `run` is NOT `app`. **`'web'` is rejected — for `hoody_kit` runners use `program: 'exec'`**. `agent` is accepted but the alias never routes: reach the agent by its kit URL. |
| `index` | For a built-in program, the instance to route to (`terminal_id` for `terminal`, display number for `display`); defaults to `1`. For `http`/`https` it is the target port and has **no default**: give the port in `port` (preferred; it wins over `index` and over a port in the program name), as `http-<port>` (e.g. `http-8080`), or in `index`; with none of the three the create is refused with `400 PORT_REQUIRED`. |
| `port` | Target port for `http`/`https`, an integer from 1 to 65535. The preferred way to give the port: it wins over `index` and over a port in the program name. Ignored for built-in programs, whose kit ports are fixed. |
| `target_path` | Optional landing path served when the alias is opened with no path (a root request), e.g. `/api/v1`; a query written in it is sent too, except an instance selector (`id`, `terminal_id`, `display`, `browser_port`) or another key the proxy sets for that program: the alias is created, but opening it answers `404 ALIAS_TARGET_QUERY_FORCED_KEY`; `index` picks the instance. It is never used as a prefix: with `allow_path_override: true` a request that carries its own path is forwarded as sent, resolved from the computer root, and with `false` it is the only path the alias serves (at the root and at its own path). |
| `allow_path_override` | Defaults to `true`: a root request lands on `target_path` (its query plus the visitor's parameters), and a request that carries its own path is forwarded as sent. With `false` the alias serves only `target_path`: the root `/` and the `target_path` path itself (e.g. `/run-report` when `target_path` is `/run-report`) are both served as `target_path`, and any other path — sub-paths and assets included — is refused with `404 ALIAS_PATH_PINNED`. A query key written in `target_path` wins over the visitor's value for the same key, and the instance selectors the alias's `index` sets (such as `id`, `terminal_id`, `display`) stay forced; the visitor's method, request body, other query keys, WebSocket upgrade and `Range` header pass through. Either way anyone with the link can open the alias, so restrict who may with proxy permissions. |
| `expires_at` | Auto-disable timestamp — an ISO 8601 date-time string, or `null` for never. Convert an epoch value to ISO 8601 before sending. Must be in the future. |
| `enabled` | Toggle without deleting (keeps alias slot reserved). |

### Practical examples

Each row below shows the create-call fields and the resulting public URL. Issue the call via your mode's surface (the `proxy.aliases` rows of the `api` namespace page give the exact command or endpoint).

| Goal | `program` | `index` | `target_path` | `allow_path_override` | Public URL |
|---|---|---|---|---|---|
| HTTP API on computer port 8080 | `http` | `8080` | — | `true` | `https://myapi.{N}.computers.hoody.com/v1/users` |
| Land on a hoody-exec script (`/render`) at the bare hostname | `exec` | — | `/render` | — | `https://tileapi.{N}.computers.hoody.com` |
| Pipe rendezvous as drop-zone hostname | `pipe` | — | `/jobs/pending` | — | `https://upload.{N}.computers.hoody.com` |
| App exposed through a reverse tunnel on computer port 3000, with auto-expiry | `http` | `3000` | — | `true` | `https://demo.{N}.computers.hoody.com` (`expires_at` a future ISO 8601 date-time) |
| GUI display 1 wrapped in a brandable host | `display` | `1` | — | `true` | `https://gui.{N}.computers.hoody.com` |
| HTTPS upstream (target self-terminates TLS) | `https` | `8443` | — | `true` | `https://secureapi.{N}.computers.hoody.com` |

With the default `allow_path_override: true`, `target_path` only decides what the bare hostname serves: every other path on that program stays reachable through the alias. To expose a single path, set `allow_path_override: false` (the alias then serves only `target_path`, at the root and at its own path; write into `target_path` every other query key the visitor must not change: the instance selectors `index` sets are already fixed, and a `target_path` that names one is created but answers `404 ALIAS_TARGET_QUERY_FORCED_KEY` when the alias is opened). The visitor's method and body still pass through, so every method that path accepts stays reachable. Gate the computer (below) to decide who may call it.

### Gating an alias

Aliases inherit the computer's gate stack — gate the underlying computer (§ How to gate: group, program access, `default: 'deny'`) and the alias URL is gated too. There is no per-alias-only gate; gating is at the computer/project level.

### Operational notes

- `PATCH /api/v1/proxy/aliases/{aliasId}/state` with `{"enabled":false}` disables the alias without releasing the slot — useful to revoke a leaked URL while you investigate. Disable, enable, update and delete are not instant: they usually reach the alias URL within about 30 seconds and can take longer, and until then the alias keeps its previous behavior.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409 ALIAS_IN_USE` under any of the three rules: the name is taken on that physical server (by any tenant), your account already holds it on any server, or another account released it on that server within the last 90 days.
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface. Show it in UI as `subserver_name ?? server_name`, but never substitute it into a kit URL.
- **After `POST /api/v1/projects/{id}/computers`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `computerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full computer access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — browser sign-in (§ Login) or `POST /api/v1/users/auth/login`. Access token lives `1d`, refresh token `7d`, by default; a deployment may shorten either, so treat both as values to read from the response rather than constants. The interactive, short-lived credential.
2. **Auth token** — `POST /api/v1/auth/tokens`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, replaceable (copy it for a new secret, then delete the old one). Long-lived headless credential.
3. **Kit URL** — `https://{projectId}-{computerId}-{kit_slug}-{serviceIndex}.{server}.computers.hoody.com` is the bearer for that kit at the proxy while neither the computer nor its project has proxy permissions configured (an `exec` script can still require its own token with `// @token`). See § Proxy URLs.

## Header rule — `Authorization: Bearer <token>`

Send `Bearer <token>` (one space, case-sensitive) for either credential. An `hdy_` auth token may also be sent bare (`Authorization: hdy_…`); a JWT may not. The two kinds are told apart by the token's own leading characters. Most endpoints accept both kinds; a few account-sensitive ones accept only a JWT.

## What each credential can do

- **Auth-token guards.** IP allowlist, expiry, enable/disable.
- **Basic.** `user:pass`, `user:authToken`, `authToken:pass`. If both sides parse as tokens (token:token), the username side is tried first then the password side falls through.
- **Computer surfaces have no admin tier.** Unless proxy permissions are configured for the computer or its project, whoever holds a kit URL passes the proxy and has full access to that kit, except that an `exec` script can also require its own token (`// @token`, or `// @remote-token` for remote operations) and answers `401` without a match. A computer claim (below) grants nothing on the built-in kits; it only matters to a program you write that chooses to verify it.

## Vault — double gate

`/vault/*` auth-token needs BOTH `vault_access===true` AND the `resources.vault` permission on the token, else `403`. JWT owner passes; no cross-user override.

## Login

**Sign the user in through their own browser.** This is the default whenever a person is present. They type their password, use GitHub or Google, and pass two-factor on Hoody's page; you never see a secret. No account yet? Send them to `https://api.hoody.com/auth/signup` to sign up and verify their email in the browser, then start here.

1. **Start.** `POST https://api.hoody.com/api/v1/auth/device/code` with JSON `{"client_name":"<your name>","client":"agent"}`. No bearer token. `data` holds `device_code` (keep it private), `user_code`, `verification_uri`, `verification_uri_complete`, `interval` (seconds, 5) and `expires_in` (seconds, 900); use the returned values.
2. **Hand over the link.** Give the user `data.verification_uri_complete` and the `data.user_code`: "Open this link, check that the page shows code `<user_code>`, sign in and approve. If you did not ask me to sign you in, choose *Don't authorize this device*." The page shows your `client_name` and marks it as unverified, so name yourself plainly.
3. **Poll.** `POST https://api.hoody.com/api/v1/auth/device/token` with `{"device_code":"…"}`, one request every `interval` seconds, until `expires_in` runs out. The waiting states are answers, not failures: HTTP 400 with the state in **`data.error`**, not a top-level `error`:
   - `authorization_pending`: keep polling.
   - `slow_down`: polled too soon; poll every 5 seconds from now on (the interval is a fixed 5 s after `slow_down`, not an increment).
   - `access_denied`: stop. The user refused (or a PKCE verifier was missing or wrong).
   - `expired_token`: stop; the code expired or was already redeemed. Offer a fresh link.
   - HTTP `429`: wait `Retry-After`, then continue. HTTP `404`: browser sign-in is not enabled on this deployment.
4. **Signed in.** HTTP 200 returns the same session as a password login: `data.token` (send as `Authorization: Bearer`), `data.refreshToken`, `data.expires_in`. Keep both tokens for this session only: never repeat them in chat, print them a second time or write them to a file yourself (the `hoody` CLI keeps its own session in `~/.hoody/config.json`, and `hoody logout` clears it). The code redeems once; if that response is lost, start a new sign-in.

Optional PKCE: make a random `code_verifier` of 43–128 characters from `A-Z a-z 0-9 _ -`, send `code_challenge` = unpadded base64url of its SHA-256 when you start, and the `code_verifier` with every poll.

Run these as two separate commands, so the user gets the link before you start polling. Each command stands alone: carry the values over by hand.

```bash
# Start: prints device_code, user_code, verification_uri_complete, interval and deadline (epoch seconds).
curl -sS --max-time 20 -X POST https://api.hoody.com/api/v1/auth/device/code \
  -H 'Content-Type: application/json' -d '{"client_name":"<your name>","client":"agent"}' \
  | jq '.data + {deadline: ((now | floor) + .data.expires_in)}'
```

Now give the user `verification_uri_complete` and `user_code`. Then poll; one run lasts at most a minute and prints one line. While it prints `pending INTERVAL=… NEXT=…`, run it again with those two values (on the first run `NEXT` is `0`). `NEXT` carries a wait across runs: a `slow_down` or an HTTP 429 (which waits the `Retry-After` the API sends) can push the next poll past the end of a run.

```bash
( DEVICE='<device_code>'; INTERVAL='<interval>'; DEADLINE='<deadline>'; NEXT='<next, 0 on the first run>'
  STOP=$(( $(date +%s) + 50 )); RESULT=
  while :; do
    NOW=$(date +%s); [ "$NEXT" -gt 0 ] || NEXT=$((NOW + INTERVAL))
    [ "$NEXT" -lt "$DEADLINE" ] || { RESULT=expired; break; }
    [ "$NEXT" -le "$STOP" ] || break
    [ "$NEXT" -le "$NOW" ] || sleep $((NEXT - NOW))
    NOW=$(date +%s); [ "$NOW" -lt "$DEADLINE" ] || { RESULT=expired; break; }
    [ "$NOW" -le "$STOP" ] || break
    NEXT=0
    R=$(curl -sS --max-time 10 -w '\n%{http_code} %header{retry-after}' -X POST https://api.hoody.com/api/v1/auth/device/token \
      -H 'Content-Type: application/json' -d "{\"device_code\":\"$DEVICE\"}") || { RESULT='stopped: curl failure; sign-in outcome unconfirmed'; break; }
    TAIL=${R##*$'\n'}; CODE=${TAIL%% *}; WAIT=${TAIL#* }; BODY=${R%$'\n'*}
    STATE=$(jq -r '.data.error? // empty' <<<"$BODY" 2>/dev/null)
    case "$CODE:$STATE" in
      400:authorization_pending) ;;
      400:slow_down) INTERVAL=5 ;;   # fixed 5 s after slow_down
      429:*) case "$WAIT" in ''|*[!0-9]*) WAIT=300 ;; esac; NEXT=$(( $(date +%s) + WAIT )) ;;
      200:*) RESULT="signed in $(jq -c '{token: .data.token, refreshToken: .data.refreshToken}' <<<"$BODY")"; break ;;
      *) RESULT="stopped: HTTP $CODE ${STATE:-$(head -c 200 <<<"$BODY")}"; break ;;
    esac
  done
  echo "${RESULT:-pending INTERVAL=$INTERVAL NEXT=$NEXT}" )
```

A curl failure leaves the sign-in outcome unconfirmed; it is not a refusal. Report it, make at most one bounded connectivity check, and do not restart polling in a loop.

The `signed in` line is the one place the session is printed: the code redeems once, so the poll has to hand you both tokens in its own output. Read them from that line and send `token` as `Authorization: Bearer` on later calls. That output is for you, not for the chat: do not echo the tokens again or quote them in a reply.

Use a long-lived auth token (§ Storing auth tokens) only when the user asks for unattended automation; never mint one just to finish sign-in.

### Password login (fallback)

Existing account: always browser sign-in first (above); if it fails, stalls or is refused, ask for an auth token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password; use one only if they offer it, or they run the login themselves. Never repeat or store a secret.

- `username` OR `email` + `password`.
- Response: `data.token` (not `accessToken`), `data.refreshToken`, `data.expires_in`.
- 2FA: returns `requires_2fa`, `temp_token` (5-min); exchange at `POST /api/v1/users/auth/2fa/verify`.
- Email signup → generated username, usually `<localpart>-<4hex>`. Characters outside `a-z`, `A-Z`, `0-9`, `_` and `-` are removed from the local part; a reserved local part, or a repeated collision, gives an opaque random name, so log in with the email.

## Kit URLs as credentials

Bearer by default. Add password, token, JWT, IP or Hoody-identity auth groups in the computer's or project's proxy permissions. Groups are alternatives (a request satisfying any one gets that group's permissions; a request that matches no group falls to the `default` policy, except that a password group with access set for the requested program answers it with a `401` Basic challenge first, even under `allow`), not stacked layers. A group alone restricts nothing: give it access to the intended programs and set the default policy to `deny`, because a project with no stored policy defaults to `allow` and a computer with none inherits its project's default. Disabling the proxy (`enable_proxy`) is a kill-switch that cuts it entirely. See § Proxy URLs for the operations and the required version headers.

### Computer claim — optional portable credential

Every built-in kit — **including `agent`** — is subject to the effective computer and project proxy permissions. By default the bare per-computer kit URL is the bearer; a restricting policy may require the request to match an allowed auth group or may deny it, and a disabled proxy refuses every request (§ Kit URLs as credentials). There is **no** claim handshake on the built-in kits; the `agent` kit behaves exactly like the others here.

Separately, `POST /api/v1/computers/{id}/authorize` mints a signed, portable **computer claim** — `data: { computer_claim: { kid, payload_b64, signature_hex }, expires_in, computer_id, project_id }`. It is an *optional* credential for a program **you** run inside a computer to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

## Realms — project isolation

A **realm** is a 24-hex-id namespace inside your account that walls off projects, computers, tokens, and vault entries. Project aliases stay unique across your whole account (not per realm), so two realms cannot hold projects with the same alias; an auth token scoped to realm A cannot see realm B's projects, computers, tokens or vault entries on the control plane — a realm-B id is refused with `403` or `404`, depending on the route. Treat each substantial project as its own realm: an agent (or human) operating with a realm-scoped token cannot drop a computer, wipe a vault key, or change settings in another realm through the API. Account-wide data is not divided by realm (see Clean separation below). Realms do not gate kit URLs: a realm-scoped token adds nothing to a kit URL, which is governed only by the effective project and computer proxy permissions, so gate kit URLs separately (§ Proxy URLs).

### Why realms

- **Blast-radius cap** — a leaked or buggy token restricted to one realm can affect only that realm's realm-scoped resources; a token allowed in several realms can affect each of them.
- **Mistake-proof multi-project work** — the token can only see the realm whose subdomain it's invoked from; a computer delete aimed at the wrong id is refused (`403` or `404`) instead of destroying another realm's computer.
- **Clean separation** — projects, computers, vault entries, snapshots and proxy aliases are realm-scoped. The wallet is not: balances belong to the whole account. A token restricted to realms is refused the wallet's balances and history, invoices and payment methods (`403 REALM_TOKEN_ACCOUNT_MONEY`) but can still spend (transfers, purchases), so restrict its `financial.*` permissions separately. The notification inbox is not either: it is account-wide, so a token restricted to realms is refused it (`403`), even with `resources.read_account`; an unrestricted token needs that permission, and a login session reads it.
- **Cheap to spin up** — realms are free; create one per project rather than reusing.

### Realm-scoped URL

`https://{realmId}.api.hoody.com` — same control-plane API, but every operation on a realm-scoped resource (project, computer, token, vault entry, snapshot, proxy alias) resolves its id only against that realm. Off-realm ids are refused with `403` or `404`, depending on the route. The subdomain is the only request-wide realm selector. A few routes also take a `realm_id` query parameter — the vault routes and some list routes (projects, computers, proxy aliases, storage shares, events), where it filters the result; it is not a general replacement for the subdomain.

### How to attach a computer to a realm

Pass `realm_ids: ['<24-hex>']` when creating the computer — and an array of multiple realm IDs is fine if a computer needs to be visible in several, except with a realm-restricted auth token: it must call the realm-scoped host, naming any other realm in `realm_ids` is refused with `403` ("This token cannot assign computers to other realms"), and an omitted or same-realm array is replaced with the realm of the host you call. Computer realm membership is **independent of project realm membership** (a project in realm A can hold a computer in realms A+B). Read it back from the `realm_ids` field returned by `GET /api/v1/computers/{id}`.

### Auth tokens × realms

Mint a realm-scoped token via `POST /api/v1/auth/tokens` with `{ realm_ids: ['<id>'] }`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL", except GET/HEAD `/api/v1/auth/tokens/me`, which allows current-token introspection without a realm host). Add / drop realms post-mint with `POST /api/v1/auth/tokens/{id}/add-realm` / `POST /api/v1/auth/tokens/{id}/remove-realm`. Tokens with no `realm_ids` can still target a specific realm by using the realm subdomain; only when `allow_no_realm` is true can they also use the `realm_id` query parameter on the routes that take one (with `allow_no_realm: false` the bare host is refused).

### Best practice — one realm + one token per project

This is for unattended automation the user asked for, or for handing a scoped credential to another program. For interactive work with the user present, keep the browser sign-in session and select the realm with its realm URL.

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `GET /api/v1/realms/`.
2. `POST /api/v1/auth/tokens` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `POST /api/v1/projects/` with its required `alias` and `realm_ids: [realm_id]` — pin the project to the realm.
4. `POST /api/v1/projects/{id}/computers` with its required `server_id` and `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the computer too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Send every request to that host with `Authorization: Bearer <token>`.
   The exception is project-wide access: adding, changing or removing a project member and every `* /api/v1/projects/{id}/proxy/permissions*` read or write need the base API host (`https://api.hoody.com`) and an unrestricted credential (browser sign-in, or a token with no realm restriction). A realm host or a realm-restricted token is refused with `403`, even for a project in that realm.

Result: that token can only see projects, computers, tokens, and vault entries in the realm. An agent given just this token cannot touch your other realms' resources through the API — even if it's the same Hoody account. Account-wide data is not divided by realm: the wallet's balances and history and the notification inbox refuse a realm-restricted token outright; restrict `financial.*` on the token to stop it spending. Kit URLs it already knows stay reachable; they answer to their own gates, not to the token.

## Storing auth tokens

Mint an `hdy_…` token only when the user asks for unattended automation; the session from browser sign-in is not one, so don't save it yourself. The token from `POST /api/v1/auth/tokens` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the computer. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `PUT /api/v1/vault/keys/{key}` with `{ value: 'hdy_…' }`. Stored server-side as sent — Hoody does not encrypt the value for you — and readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `PUT /api/v1/vault/keys/{key}`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND the `resources.vault` permission granted to it. JWT-as-owner bypasses both. See `PUT /api/v1/vault/keys/{key}` / `GET /api/v1/vault/keys/{key}` / `GET /api/v1/vault/keys` / `DELETE /api/v1/vault/keys/{key}` / `DELETE /api/v1/vault`.

## Token revocation

- `POST /api/v1/users/auth/logout` — for a JWT this is a **logout-everywhere**: every access and refresh token minted before the call stops working, on every device, not just the one that called it. Auth tokens are unaffected.
- `POST /api/v1/users/auth/refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header; a missing or mismatched bearer answers `401 Invalid refresh token`, and a missing or empty body field is refused as `422` schema validation. Nothing adds the header for you: send the same refresh token in the `{"refreshToken":"…"}` body and as `Authorization: Bearer <refreshToken>`. For unattended automation the user asked for, a long-lived `POST /api/v1/auth/tokens` token avoids refresh handling.
- `DELETE /api/v1/auth/tokens/{id}` / disable / IP-restrict — effective next request.

## 2FA

`POST /api/v1/users/auth/2fa/setup` returns `data: { qr_code, manual_entry_key, backup_codes }` inside the usual `{ statusCode, message, data }` envelope; `POST /api/v1/users/auth/2fa/verify-setup` enables. Backup codes rotatable, one-time, hashed. `PUT /api/v1/users/auth/2fa/token-gate` with `{"enabled":true}` on → sensitive auth-token mutations made with a login-session JWT need an `otp_code` (a TOTP or a one-time backup code). Basic auth has already proved 2FA at authentication, and delegation by an auth token holding `resources.create_tokens` is exempt.

---

# Pre-installed tools — what every computer ships with

Every Hoody computer starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Computers run real systemd as PID 1 with root inside the computer** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides and socket activation work as on a normal distro. Computers share the host kernel, so computer root cannot load kernel modules. Two tiers of pre-installed software:

1. **Default tier** — installed when the computer's resolved `hoody_kit` setting is true. Left out of `POST /api/v1/projects/{id}/computers`, it is true for a login (JWT) caller; for an auth-token caller it follows the token's `computers.features.hoody_kit` permission, so it is false when the token lacks it. A computer with `hoody_kit` false is not guaranteed to have these packages.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 26, Bun, Rust, Go, Nix, Docker, …). Pass it on `POST /api/v1/projects/{id}/computers`; when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours. The system Python is externally managed (PEP 668), so a bare `pip install` is refused: use a virtual environment for libraries and `pipx install` for Python CLIs. The `dev_kit` installer attempts to install `python3-venv` and `pipx`; if either is missing, run `sudo apt install python3-venv pipx`

## `kvm: true` — run full VMs inside the computer

Computers on **dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the computer. Pass `kvm: true` on `POST /api/v1/projects/{id}/computers`, or toggle it later on a **stopped** computer using `PUT /api/v1/computers/{id}/kvm` with JSON body `{"kvm":true}` to enable or `{"kvm":false}` to disable. Defaults to off. **Never available on free-tier servers or paid subservers (slices)**: the API refuses with `403`. An auth token also needs the `computers.features.kvm` permission (otherwise `403`). `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every computer response carries the current `kvm` boolean. A create with KVM requested can still come back `kvm: false` with a `kvm_note` (KVM was not enabled automatically, so the computer was created with KVM off): check both `kvm` and `kvm_note` in the answer, and if it is off, enable it with the toggle once the computer is stopped.

## `hoody` CLI is pre-installed inside every computer

The `hoody` binary is on every computer's `$PATH` (`/usr/bin/hoody`) for root, the default `user` account and any account that holds `user`'s group — from a shell session, an `exec` script, a `daemon` program, a cron entry or an SSH session running as one of them. Other uids cannot run it: the binary lives under `/hoody`, which only root and that group can enter; give such a uid its own install of the CLI.

Do not assume that a shell or program inside the computer has a default computer id. When a command needs one, pass `--computer <computerId>` or set `HOODY_COMPUTER=<computerId>`. The CLI checks `HOODY_COMPUTER`, then `HOODY_COMPUTER_ID`, then the older `HOODY_CONTAINER` and `HOODY_CONTAINER_ID`. Whether a terminal session or a `daemon` program receives these variables depends on its environment injection settings and on what environment is available to it; a cron job can set them in its crontab. Hoody Agent shells can receive the computer bound to the agent session. `$HOODY_TOKEN` is not set in ordinary terminal, `exec`, `daemon` or cron processes: give that code a token through its own environment (a script's `.env`, the program's env) if it needs to call the API. Hoody Agent shells can be the exception: with the agent's Hoody integration on and a usable credential, the agent injects `HOODY_TOKEN` and the API base URL into its bash tool (for a realm session normally a minted realm token; some installs fall back to the account token, and a failed mint or a restricted login injects nothing). Login state is per-user under `~/.hoody/config.json`.

This is the same binary as `hoody` outside the computer, so the CLI skill's examples work the same way inside a computer's shell, once that environment has the sign-in and the `--computer` target an example needs.

## Default user — `user` (uid 1000) with passwordless sudo

Computers created with the Hoody Kit (`hoody_kit: true`) ship with a **non-root account named `user`** (uid 1000, gid 1000, member of `sudo`). Home is `/home/user`. **`/etc/sudoers.d/user` grants `user ALL=(ALL) NOPASSWD: ALL`** — passwordless `sudo` lets agents (and humans) escalate to root for any operation without prompting.

The Hoody Agent runs as `user` and its shell follows this setting: with the drop-in in place the agent can sudo; once the drop-in is removed (or narrowed to some commands) the agent's shell gets exactly what `user` gets without a password.

**Use `user` for everyday work, sudo when you actually need root.** Reasons:

- Files created under `user` are owned by uid 1000 — friendlier when you copy/sync them out of the computer or back-stop with rsync.
- Many apps (npm, pip in venvs, Bun, Go, Nix single-user, Docker rootless, browsers) write into `$HOME` and behave better when `$HOME` is a real user home, not `/root`. (The Rust toolchain is shared: it lives under `/usr/local/cargo` and `/usr/local/rustup`, not under `$HOME`.)
- `journalctl --user`, `systemctl --user`, dbus user buses all hang off a regular user.

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `POST /api/v1/daemon/programs/add` with `{ name: 'my-app', command: '…', user: 'user' }`, `POST /api/v1/terminal/create` with `{ terminal_id: '100', user: 'user', shell: 'bash', cwd: '/home/user' }` (`terminal_id` may be omitted when the `terminal-N` host supplies it, or when `ephemeral: true` generates it. On a computer-scoped client the SDK takes the host index from the body id; if you also pass `serviceIndex`, it must be the same id, or the SDK throws a `ValidationError` before sending. A request that reaches the kit with a mismatched id is refused with `400 TERMINAL_ID_MISMATCH`. The `terminal-0` host creates only ephemeral sessions). The generated `GET /{path}` does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For computers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo passwd user && sudo rm /etc/sudoers.d/user    # set a real password first (the account may have none), then remove the drop-in only if that worked
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `* /api/v1/computers/{id}/proxy/permissions*` gates and ideally a non-root default user.

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

Set the flag on `POST /api/v1/projects/{id}/computers` to additionally provision:

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
- **Nix** (multi-user daemon install, falling back to single-user if that fails) — declarative installs without touching apt.
- **pkgx** — runs CLIs without installing them globally.

### Containers (Docker)
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
# As root; as `user` (passwordless sudo), prefix the system-wide installs with sudo
# Anything Debian-packaged
apt-get install -y jq

# Python (install python3-venv and pipx if missing)
pipx install httpie

# Node global
npm i -g typescript

# Rust (only if dev_kit installed; installs into the caller's own CARGO_HOME, which must be writable)
cargo install ripgrep

# Go (only if dev_kit installed)
go install golang.org/x/tools/gopls@latest

# Nix (only if dev_kit installed) — best for one-off binaries that bring 30 deps
nix-env -iA nixpkgs.hello
```

State is per-computer: `POST /api/v1/computers/{id}/copy` clones the disk including everything you installed; `POST /api/v1/computers/{id}/snapshots` saves a point-in-time you can later `PUT /api/v1/computers/{id}/snapshots/{name}` to roll back to. There is no global "shared layer" leak — each computer's filesystem is its own.

---

# HTTP — Core ops cheat-sheet

Vars: set these as shell variables before running the commands below. `P`=project id, `C`=computer id and `N`=`server_name`, read from the answers of §5, §6 and §8 (`C=$(curl … | jq -r '.data.id')` style; never type the braces). `API=https://api.hoody.com/api/v1` (already includes `/api/v1`); a kit base `K(k)` is `https://${P}-${C}-${k}-1.${N}.computers.hoody.com/api/v1/${k}`, so `T="https://${P}-${C}-terminal-1.${N}.computers.hoody.com/api/v1/terminal"`, and `F`, `D` and `S` are the same with `files`, `display` and `sqlite`. Watch: `W="https://${P}-${C}-watch-1.${N}.computers.hoody.com/api/v1/watch/watchers"`.

All curls assume `-sS`; SSE adds `-N`. Every JSON body needs `-H 'Content-Type: application/json'` (plain `curl -d` sends a form content type, which the API refuses with `415`). API calls need `-H "Authorization: Bearer $TOKEN"` (double quotes, so the shell expands `$TOKEN`); kit URLs (T/F/D/S/W) don't; gate kit URLs with proxy permissions. The commands below spell both headers out.

Default for a person: they sign up at `https://api.hoody.com/auth/signup` in their own browser, and you sign them in through the browser (§2). Existing account: always browser sign-in first; if it fails, stalls or is refused, ask for a token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password (use one only if offered). Never repeat or store a secret. The signup and password calls below are for an offered password or the user's own scripts.

### 1. Sign up + verify email — 200 on success / 422 on request-schema validation (missing field, bad email, short password) / 400 on other invalid input (e.g. unknown region) / 403 `SIGNUP_DISABLED` or `SIGNUP_DAILY_LIMIT_REACHED` (no `data`) when sign-ups are off or the daily limit is reached / 403 `CHALLENGE_REQUIRED`: show the person `data.challenge.verification_url` and `match_code`, keep `token` and `secret` private, and once they finish repeat the same request with `"challenge":{"token":…,"secret":…}` (`CHALLENGE_PENDING`: not finished, retry every `interval` s; a new `CHALLENGE_REQUIRED`: show its new link and code, use its token and secret; `CHALLENGE_INVALID`: expired or wrong, start again without `challenge`) / 503 `CHALLENGE_BUSY`: wait `Retry-After` s / 503 `SIGNUP_STATE_UNAVAILABLE`: retry shortly (no `Retry-After`); user=`<generated name>` (usually the email local part plus `-<4hex>`, sometimes an opaque random name: log in with the email, do not predict the username)
```bash
# password: 12-128 chars, at most 72 UTF-8 bytes, at least 3 of 4 classes (upper/lower/digit/symbol).
# Using all four is safest: the interactive `hoody signup` prompt demands all four.
# Signup + verify-email live under /auth (NOT /users/auth); login + 2FA live under /users/auth.
curl -X POST "$API/auth/signup" -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"<your-password>"}'
VERIFY_TOKEN="<the 64-character token from the email link>"
curl -X POST "$API/auth/verify-email" -H 'Content-Type: application/json' -d "$(jq -n --arg token "$VERIFY_TOKEN" '{token:$token}')"
```

### 2. Login — browser sign-in first; returns `{data:{token,refreshToken,expires_in}}`
```bash
# Browser sign-in (default; every state and a polling loop: § Login). No bearer token on either call.
DEV=$(curl -X POST "$API/auth/device/code" -H 'Content-Type: application/json' -d '{"client_name":"<your name>","client":"agent"}')
DEVICE_CODE=$(jq -r '.data.device_code' <<<"$DEV")
# → give the user data.verification_uri_complete + data.user_code; then every data.interval seconds:
curl -X POST "$API/auth/device/token" -H 'Content-Type: application/json' -d "$(jq -n --arg device_code "$DEVICE_CODE" '{device_code:$device_code}')"
# → 400 {data:{error}}: authorization_pending = keep polling; slow_down = poll every 5 s from now on; access_denied or expired_token = stop (ask before starting a new sign-in). Approved = 200 with data.token
# Password login (last resort, see the order above; 2FA branch returns {data:{requires_2fa:true,temp_token}}):
# Body takes EITHER {email,password} OR {username,password}: password AND one identifier are required.
# `username` must match ^[a-zA-Z0-9_-]+$ — an email sent as `username` returns 422.
RESP=$(curl -X POST "$API/users/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"<your-password>"}')
# username form: -d '{"username":"alex","password":"<your-password>"}'
if [ "$(jq -r '.data.requires_2fa // false' <<<"$RESP")" = true ]; then
  # 2FA branch: that login answer has no token. Verify with its temp_token and the code; that answer carries the pair.
  TEMP_TOKEN=$(jq -r '.data.temp_token' <<<"$RESP")
  RESP=$(curl -X POST "$API/users/auth/2fa/verify" -H 'Content-Type: application/json' \
    -d "{\"temp_token\":\"$TEMP_TOKEN\",\"code\":\"123456\"}")
fi
TOKEN=$(jq -r '.data.token' <<<"$RESP"); REFRESH_TOKEN=$(jq -r '.data.refreshToken' <<<"$RESP")
```

### 3. Refresh — server requires the refresh token in BOTH the body AND a MATCHING `Authorization: Bearer` header; over raw HTTP you send both yourself
```bash
RESP=$(curl -X POST "$API/users/auth/refresh" \
  -H "Authorization: Bearer ${REFRESH_TOKEN}" -H 'Content-Type: application/json' \
  -d "{\"refreshToken\":\"${REFRESH_TOKEN}\"}")
# The refresh token you sent is now spent and the answer carries a new pair: keep BOTH, never send the old one again.
TOKEN=$(jq -r '.data.token' <<<"$RESP"); REFRESH_TOKEN=$(jq -r '.data.refreshToken' <<<"$RESP")
```

### 4. Long-lived token (unattended automation the user asked for)
```bash
curl -X POST "$API/auth/tokens" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"alias":"ci"}'
```

### 5. List + create projects — trailing `/`; paginate `?page=2`
```bash
curl "$API/projects/" -H "Authorization: Bearer $TOKEN" | jq '.data.projects[]|{id,alias}'
curl -X POST "$API/projects/" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"alias":"x"}'
```

### 6. List + create computers — `server_id` from `$API/rentals`; `hoody_kit`/`dev_kit` default true with a login token; with an auth token, an omitted `hoody_kit` follows the token's `computers.features.hoody_kit` permission and an omitted `dev_kit` follows `hoody_kit`, so send both explicitly
```bash
curl "$API/projects/${P}/computers" -H "Authorization: Bearer $TOKEN" | jq '.data.computers[]|{id,name,status,server_name}'
SERVER_ID="<server id from $API/rentals>"
curl -X POST "$API/projects/${P}/computers" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg server_id "$SERVER_ID" '{server_id:$server_id,hoody_kit:true,dev_kit:true}')"
```
Once the computer is `running`, give the user the clickable URLs of its main kits (each opens its web UI at `/`), built from the response's `project_id` (P), `id` (C) and `server_name` (N): `https://{P}-{C}-terminal-1.{N}.computers.hoody.com/`, then the same host with `n-1` for notifications (the slug is `n`; the proxy parser also recognizes `notifications`, but with 24-character project and computer ids that longer host label exceeds the 63-character DNS label limit, so use `n`), `desktop-1`, `browser-1`, `files-1` and `agent-1`.

### 7. Lifecycle — start/stop/force-stop/restart/pause/resume; poll `GET $API/computers/${C}` until `status` is `running` (after start, restart or resume), `stopped` (after stop or force-stop) or `paused` (after pause)
```bash
curl -X POST "$API/computers/${C}/start" -H "Authorization: Bearer $TOKEN"
```

### 8. Computer details — `{N}`=`server_name`; never `subserver_name`
```bash
curl "$API/computers/${C}" -H "Authorization: Bearer $TOKEN" | jq '.data | {id,status,server_name}'
```

### 9. One-off shell — `?ephemeral=true` on the `terminal-0` host (the host index is authoritative: the proxy overwrites `?terminal_id=` from it, so on `terminal-1` an "ephemeral" call names session 1; turning it ephemeral can be refused with 409, including `PERSISTENT_SESSION` for a running persistent session with a display. Use `terminal-0` for a fresh ephemeral session)
```bash
T0="https://${P}-${C}-terminal-0.${N}.computers.hoody.com/api/v1/terminal"
curl -X POST "$T0/execute?ephemeral=true" -H 'Content-Type: application/json' -d '{"command":"ls","wait":true}'
```

### 10. Terminal session — later calls for session N go to the host `terminal-N` (`T` is session 1; new sessions take ids 1-9999, except the agent band, which a `terminal-N` host refuses; with the default bands 1601-5000 back desktops and agents, so pin your own in 1-1600; a session an older kit created above 9999 cannot be reached through a kit URL: with 24-character ids a five-digit `terminal-N` label exceeds the 63-character DNS label limit, and the proxy refuses `t-N` above 9999 with `404 SERVICE_INDEX_OUT_OF_RANGE`). `/create` takes the `terminal_id` the host supplies (N), so the JSON body may omit it; a body `terminal_id` that differs from N answers `400 TERMINAL_ID_MISMATCH`. The `terminal-0` host creates only ephemeral sessions: send `"ephemeral":true` to allocate an id in 5001-7999 (8001-9999 is used by Hoody Run and the Hub)
```bash
curl -X POST "$T/create" -H 'Content-Type: application/json' -d '{"terminal_id":"1","shell":"/bin/bash"}'   # T is the terminal-1 host → id "1"
```

### 11. File up/down/append — `FP`=absolute path in the computer
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
Input reaches only a viewable window: take a fresh screenshot and pick a point on a window (screenshot pixels are screen coordinates). When the point is on the bare desktop, or the window there is hidden (for example minimized in a viewer), `click-at` and `type-at` answer `409 WINDOW_NOT_VIEWABLE` and send nothing (unless an open menu takes the click); restore the window with `window/restore` if it is hidden, re-shoot and retry.
```bash
curl -X POST "$D/input/click-at" -H 'Content-Type: application/json' -d '{"x":640,"y":480,"button":1}'
```

### 14. SQLite db — a bare name (resolved under `/hoody/databases`) or an absolute path under `/hoody/databases`; `init_kv=true` adds KV
```bash
curl -X POST "$S/db/create?path=/hoody/databases/app.db&init_kv=true"
```

### 15. SQLite KV — `/` hierarchy; GET `?path=.foo.bar`. KV stores accepted bytes verbatim and returns them as-is on GET (no `{data:...}` envelope), except that a `?path=` read returns the extracted JSON value re-serialized, a nested `?path=` write rewrites the stored JSON, and a read with a non-zero `at_timestamp` answers a JSON envelope (`at_timestamp=0` is the current-value read). With `Content-Type: application/json`, the body must be valid JSON; invalid JSON returns `400 INVALID_JSON_VALUE`. Send arbitrary text or bytes as `text/plain` or `application/octet-stream`.
```bash
KV="$S/kv/u:42?db=/hoody/databases/app.db"
curl -X PUT "$KV" -H 'Content-Type: application/json' --data-raw '{"name":"A"}'
curl "$KV"   # → {"name":"A"}
```

### 16. Watch+SSE — req `paths`; replay via `?since_id=` or `?since_timestamp=` (the watch SSE endpoint does NOT honour `Last-Event-ID`; resume rules differ per SSE endpoint, so read each one's own)
```bash
WID=$(curl -X POST "$W" -H 'Content-Type: application/json' -d '{"paths":["/home/user/src"]}' | jq -r '.id')   # watch answers bare JSON, no {data:...} envelope
curl -N -H 'Accept: text/event-stream' "$W/$WID/events/sse"
```

### 17. List tunnels
```bash
TUN="https://${P}-${C}-tunnel-1.${N}.computers.hoody.com/api/v1/tunnel"   # K(tunnel)
curl "$TUN/tunnels" | jq .   # bare JSON {sessions,totalBindings,...}, no envelope
```

### 18. Snapshot/restore — restore rewinds FS, kills procs
```bash
SS="$API/computers/${C}/snapshots"
SNAP=$(curl -X POST "$SS" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{}' | jq -r '.data.snapshot.name')   # body required; optional {alias,expiry}
curl -X PUT "$SS/$SNAP" -H "Authorization: Bearer $TOKEN"
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
Both are refused for a token limited to realms (403 `REALM_TOKEN_ACCOUNT_MONEY`), like every wallet balance, transaction, invoice and payment-method route.

### 21. Proxy alias — public URL is `{alias}.{server_name}.computers.hoody.com` (the alias is a subdomain LABEL, not an external host you choose); `program`=kit; `exec` safe for `hoody_kit`
```bash
curl -X POST "$API/proxy/aliases" -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -n --arg computer_id "$C" '{computer_id:$computer_id,alias:"demo-api",program:"exec"}')"   # alias: 3-61 chars, a-z 0-9 -
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

### 23. Cron entries — routes under `/api/v1/cron`; `{user}` is the system user (`user` is the computer's login user)
```bash
CR="https://${P}-${C}-cron-1.${N}.computers.hoody.com/api/v1/cron"
curl "$CR/users/user/entries"                                       # → {user, entries:[{type:"managed",id,schedule,command,enabled,…} | {type:"raw",line}], total, page, limit}
ID=$(curl -X POST "$CR/users/user/entries" -H 'Content-Type: application/json' -d '{"schedule":"*/5 * * * *","command":"/home/user/bin/sync.sh"}' | jq -r '.id')   # → 201 {id,…} (bare JSON, no {data:...} envelope)
curl -X PATCH "$CR/users/user/entries/$ID" -H 'Content-Type: application/json' -d '{"enabled":false}'
curl -X DELETE "$CR/users/user/entries/$ID"
curl "$CR/users/user/crontab"                                       # → {user, crontab} (the raw text)
```

---

# HTTP — Reference appendix

## Status codes

| Code | Meaning |
|---|---|
| 200/201 | OK/Created. Usually `{statusCode,message,data}`; some omit `message` (e.g. `POST /api/v1/auth/device/token`) |
| 400/401 | Other bad requests / missing-or-bad JWT (`Bearer `) |
| 403/404 | Forbidden / missing-or-no-perm |
| 409/412/415 | Conflict / cond-failed / wrong CT |
| 422/428/429 | Request-schema validation or unparseable JSON body / If-Match required / rate-limited |
| 500/503 | Sanitised internal / retriable |

Kit URLs (`*.computers.hoody.com`) use per-kit shapes.

## Error envelope

```json
{"statusCode":422,"error":"Validation Error","message":"Validation failed: /email ...","data":[{"instancePath":"/email","message":"..."}]}
```

Request-schema failures return `422` with `error: "Validation Error"` and the failing fields in `data`; a few routes (Bot URLs, support) answer `400` with their own code instead, so follow the endpoint's documented errors. Other refusals use the same shape with their own status, and `error` may carry a machine-readable code instead of the status name.

Another exception: browser sign-in polling (`POST /api/v1/auth/device/token`) answers its waiting states with HTTP 400 `{"statusCode":400,"data":{"error":"authorization_pending"}}`, the state under `data` and no top-level `error` or `message`. Read `data.error` for `authorization_pending`, `slow_down`, `access_denied` or `expired_token`; the steps are in § Login.

200-on-missing (don't infer existence): `POST /api/v1/auth/{forgot-password,resend-verification,signup}`.

## Pagination

Control-plane list routes: `?page=N&limit=M`. Shared fallback: `page=1`, `limit=20`. **Use `limit ≤ 100` unless a route documents more.** Each route's own schema caps `limit` and is validated *before* any handler runs, and the common list routes (projects, computers) declare `maximum: 100` — so `limit=200` returns `422 Validation failed: /limit must be <= 100`. Routes also set their own defaults (10/50/100). Ordering is per-route, selected by the `sort_by` / `sort_order` query params — there is no global stable-sort guarantee. **The `sort_order` query param is an enum of exactly `asc` | `desc` (default `desc`) on all 11 routes that expose it — spelling it `descending` returns `422 Validation failed: /sort_order must be equal to one of the allowed values`.** `sort_by` is route-specific (most routes enumerate their fields; `GET /api/v1/wallet/invoices/` takes a free string, default `created_at`), so read the route's own parameter list. These page-based routes have no cursor: iterate until `page > totalPages`. Kit APIs differ — e.g. the notes comment and comment-anchor lists take `?cursor=` and return `nextCursor`/`hasMore`, the notes node list takes `limit`/`offset` and returns `total`, and some routes use `offset`/`has_more`; follow each route's own schema.

```json
{"data":{"projects":[],"pagination":{"total":451,"page":1,"limit":100,"totalPages":5}}}   /* `projects` / `computers` / route-specific resource key (NOT a literal `<r>`) */
```

## SSE

WHATWG `field: value` + blank line. `id:` is per-endpoint: watch and proxy-logs send monotonic ids for resuming (proxy-logs also sends some id-less frames), pipe progress sends none. `:keepalive` interval is per-kit — observed: watch SSE 10s, pipe 15s, proxy-logs 5s — ignore the heartbeat lines. Reconnect mechanism is per-endpoint: `Last-Event-ID` header (proxy-logs — a server restart drops the stream; reconnecting with the saved id answers `event: gap` (`{after, resumedFrom}`) when the retained history no longer reaches it, so treat a `gap` as lost events. An `event: reset` you do receive means discard the saved id and reconnect fresh. It also sends `event: scope-destroyed` when the computer is destroyed, after which the stream closes); `?since_id=` / `?since_timestamp=` (watch — event ids are not contiguous, so a jump in `id` is normal; it sends `event: lag` and ends the stream only when a slow reader's missed events can no longer be replayed). Curl: `--no-buffer -N`.

**WebSocket** — `GET /api/v1/notifications/stream` (`GET /api/v1/notifications/stream`, e.g. `wss://...-n-1.{N}.computers.hoody.com/api/v1/notifications/stream`; kit slug is `n`, so the host segment is `n-{serviceIndex}` (the proxy parser also recognizes `notifications-` and `notification-`, but with 24-character project and computer ids those longer host labels exceed the 63-character DNS label limit, so use `n`)) is a WebSocket when the request carries `Upgrade`, otherwise SSE (which requires `displays`); a heartbeat every 15 s on SSE, and every 30 s by default on a WebSocket.

## Rate limits

Among the route limiters, only `/users/auth/login` and `/auth/device/login` count failures alone — a successful sign-in does not consume budget; every other limiter (including `/users/auth/refresh`) counts every request; on `/auth/signup` only a request without `challenge` counts (repeating the request with `challenge` while a check is pending spends none of the 5/h). Separately, confirming your password for an account change (2FA setup or disable, backup codes, password or email change) has its own budget of 10 wrong passwords per hour per account; a correct password does not use a slot. The route limiters set `Retry-After` on their 429 responses; some other 429s (a wrong-password budget, a per-hour creation cap) do not, so use it when present. The numbers below are **defaults a deployment may raise or lower per route**, so read `Retry-After` when present rather than assuming them.

| Endpoint | Cap/Win |
|---|---|
| `/users/auth/login` | 1000f/30m |
| `/users/auth/refresh` | 30/30m |
| `/auth/signup` | 5/1h |
| `/auth/verify-email` | 10/1h |
| `/auth/reset-password` | 10/1h |
| `/auth/resend-verification`, `/auth/forgot-password` | 3/1h |
| `/users/me/retry-setup` | 1/1m |

## Curl idioms

```bash
curl -sS --max-time 600 -X POST -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"k":"v"}' "$URL"  # std
curl -sS --no-buffer -N "$URL"             # SSE
curl -sS -o out.bin "$URL"                 # binary
curl -sS -H 'Content-Type: application/json' --data-binary @body.json "$URL"   # file body
```

## Bot URLs

A Bot URL is `https://<label>.hoody.bot`. `GET /`, `GET /SKILL.md` and a browser's CORS preflight (`OPTIONS` on one of the paths below, when the Bot URL allows CORS) need no key; every other request needs `Authorization: Bearer <key>` (or `x-api-key`; `?key=` is accepted but keeps the key in URLs). Keyed paths: `GET /v1` (help), `GET /v1/models` (one model, id = the label), `GET /v1/models/<m>` (the same model for any `<m>` of 1 to 128 characters from `A-Z`, `a-z`, `0-9`, `.`, `_`, `:` and `-`, other than `.` and `..`), `GET /v1/key` (the calling key's own record and holder note, answered by the edge), `POST /v1/chat/completions`, `POST /v1/responses`, `POST /v1/messages`, and `GET /events` (the live event stream), `POST /mcp` (stateless MCP: tools `ask`, `updates`, `answer`, `status`, `speak`, `ask_audio`; a keyed plain `GET /mcp` returns the help page, and a `GET` asking for `text/event-stream`, like `DELETE /mcp`, is `405 method_not_allowed`). The three chat doors (`/v1/chat/completions`, `/v1/responses`, `/v1/messages`) read only the final message: it is the last message that is not an instruction message (system messages are skipped on all three doors, developer messages also on chat completions and Responses) and must be a user message with text only (at most 64 KiB); a final assistant message, or an image, audio or file part, is refused 400; earlier messages are not replayed and system prompts do not configure the Bot, which keeps its own conversation history. One exception: a request with no tools whose output budget (`max_tokens`, `max_completion_tokens` or `max_output_tokens`) is 64 or less, or that carries a known chat-app task prompt (a chat title, tags, follow-up questions), is a side request. It gets one separate completion from the Bot's model, using your system prompt and messages, and the Bot never receives it. Do not set a small output budget on a message meant for the Bot. A Bot URL's `/mcp` takes one JSON-RPC message per request; a batch (a JSON array) is refused with `400 invalid_request`. Once the Bot URL is found and serving, any other path is `404 path_not_allowed` and a listed path with another method is `405 method_not_allowed`.
- Errors carry a lower-case code in the door's envelope (OpenAI and Anthropic `error.code`, MCP JSON-RPC `error.data.code`, or a tool result `isError: true` with text `error <code>: <message>`). An error answered before a stream opens carries the upper-case `X-Hoody-Error-Code` header, and the OpenAI and Anthropic forms then use an error HTTP status. Once an SSE stream (`stream: true`) has opened, the status is already `200` and a later failure arrives inside the stream with no `X-Hoody-Error-Code` header: read `error.code` in the OpenAI chat-completions error chunk, the top-level `code` of the OpenAI Responses `event: error`, or `error.code` in the Anthropic `event: error` (present when the agent supplied a code); the status is `200` because the stream had already started; a JSON-RPC error may still arrive with HTTP 200 (for a `Mcp-Protocol-Version` before `2026-07-28` or none), so always read the JSON-RPC `error`. An MCP tool-result error is HTTP 200 and carries `X-Hoody-Error-Code` like the other forms; the code is also in the text. Every answer has an `X-Request-Id`.
- `Retry-After` appears only on 429 (`rate_limited`, `concurrency_limit`, `ip_blocked`). `503 bot_starting` (cold start) has none: retry after 1 s, 2 s, 4 s … up to 30 s apart, for about two minutes.
- Long answers: `stream: true` on chat sends `: keepalive` comments while the Bot works; MCP `ask` returns `status: "working"` with a `ref` after about 50 s, and `ask` with `{"ref": …}` waits for the same reply without sending anything new. A ref works only with the key that received it; another key gets an MCP tool result with `isError: true` and code `request_not_found`, with HTTP status 200 on the wire (`BotUrlClient` reports it as a 404 `BotUrlError`).
- Gates of the Bot's delegates are named by handles (`g_` + 22 characters); `answer` takes the handle as `gate_id`, plus `decision` and any required `text`. A gate on the Bot's own session shows in `status` as `pending_gate` marked owner-only; `ask` then comes back waiting on that gate, and only the owner can resolve it in the Hoody app.
- The owner manages Bot URLs under `/api/v1/bot-urls` (Hoody login); writes return `{data, propagation}`, and `GET /api/v1/bot-urls/{id}` shows when a change is `applied` on the hosts. The owner-side rules (who may manage one, the limits, labels, key handling, lifecycle and errors) are in the `api` namespace page, and the `agent` namespace page, Example 4, runs the whole flow: create, mint a key, call it, rotate, panic.

---

## Subskill index

- [`agent`](https://hoody.com/SKILLS/SKILL-HTTP/agent.md) — In-computer AI coding agent over HTTP
- [`api`](https://hoody.com/SKILLS/SKILL-HTTP/api.md) — Platform control plane: identity, projects, computers, billing, vault
- [`browser`](https://hoody.com/SKILLS/SKILL-HTTP/browser.md) — Per-computer Chromium or Firefox instances, one per slot
- [`code`](https://hoody.com/SKILLS/SKILL-HTTP/code.md) — VS Code in the browser, per computer
- [`cron`](https://hoody.com/SKILLS/SKILL-HTTP/cron.md) — managed crontab entries per system user
- [`curl`](https://hoody.com/SKILLS/SKILL-HTTP/curl.md) — full HTTP client gateway + REST-as-GET-URL bridge
- [`daemon`](https://hoody.com/SKILLS/SKILL-HTTP/daemon.md) — supervisord program lifecycle (start any program; logs kept)
- [`display`](https://hoody.com/SKILLS/SKILL-HTTP/display.md) — programmatic GUI desktops with screenshots, input, and windows
- [`egress`](https://hoody.com/SKILLS/SKILL-HTTP/egress.md) — the computer's outbound HTTP proxy
- [`exec`](https://hoody.com/SKILLS/SKILL-HTTP/exec.md) — micro-services: any script or API as an instant HTTP endpoint
- [`files`](https://hoody.com/SKILLS/SKILL-HTTP/files.md) — computer filesystem over HTTP, with automatic Git-like change history
- [`notes`](https://hoody.com/SKILLS/SKILL-HTTP/notes.md) — Collaborative notebooks, hierarchical nodes, documents, databases
- [`notifications`](https://hoody.com/SKILLS/SKILL-HTTP/notifications.md) — Trigger and consume desktop notifications inside a computer
- [`pipe`](https://hoody.com/SKILLS/SKILL-HTTP/pipe.md) — Zero-storage streaming HTTP transfers
- [`proxyLogs`](https://hoody.com/SKILLS/SKILL-HTTP/proxyLogs.md) — Per-computer request/response/event log query, stats, and SSE tail
- [`run`](https://hoody.com/SKILLS/SKILL-HTTP/run.md) — resolve apps to shell commands
- [`sqlite`](https://hoody.com/SKILLS/SKILL-HTTP/sqlite.md) — SQLite HTTP API
- [`terminal`](https://hoody.com/SKILLS/SKILL-HTTP/terminal.md) — Persistent multiplayer PTY sessions over HTTP and WebSocket
- [`tunnel`](https://hoody.com/SKILLS/SKILL-HTTP/tunnel.md) — reverse tunnels for HTTP/WS/TCP via computer relay
- [`vm`](https://hoody.com/SKILLS/SKILL-HTTP/vm.md) — virtual machines inside a computer: lifecycle, media, snapshots
- [`watch`](https://hoody.com/SKILLS/SKILL-HTTP/watch.md) — Linux inotify file-change streams with replay history
