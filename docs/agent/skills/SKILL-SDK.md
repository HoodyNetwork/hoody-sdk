> _**SDK skill (basic)** · ~33,123 tokens · hoody-sdk v1.0.1_

# SDK mode — drive Hoody from TypeScript/JavaScript

Typed client, 1000+ methods, 21 namespaces (`api` plus 20 kits). Node, Bun, browser. Configurable automatic retries, error redaction, async iterators, automatic 401 re-auth, cross-origin auth strip. Tradeoff vs HTTP/CLI: needs JS runtime + `npm install`.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud computers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A computer is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...computers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + computer plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.computers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit UI is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …; an exec script's response keeps the framing policy it sends) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service (serverless: a fresh VM per request; `// @mode worker` keeps one VM per deployment); **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST/PUT?** Compose the GET-bridge URL via the kit URL helper. To execute a request directly from SDK code, use `box.curl.run(...)`. The `curl` kit can turn any REST call into a single GET-able link for browser-only callers, restricted webhooks, agents with web-fetch-only access. See `curl` namespace.

**Stuck, or unsure how to do something?** Ask Hoody's public docs assistant — an unauthenticated MCP endpoint at `https://chatbot.hoody.com/mcp` (one tool, `search_hoody_docs`; or the `POST /api/chat` SSE fallback) answers any "how do I…" with cited doc URLs. Use it for discovery when you're not sure which namespace fits.

## Install + import

```
npm install hoody-sdk
```

```typescript
import { HoodyClient } from 'hoody-sdk';
```

Browser script, an IIFE bundle (exposes `window.HoodySDK`): `https://cdn.jsdelivr.net/npm/hoody-sdk/dist/hoody-sdk.browser.min.js`.

## Init

With a person present, build the client without a token and sign them in through their browser: `hoody.api.auth.device.start`, give them the link and code, poll `hoody.api.auth.device.poll`, then `hoody.adoptSession(result)` (§ Login). Existing account: always browser sign-in first; if it fails, stalls or is refused, ask for a token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password (use one only if offered). Never repeat or store a secret. For code that already holds a token, or a password login, pick one of these:

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

Retries are on by default. When neither the client nor the call sets `retries`, eligible requests normally get up to two retries, with a 2-second backoff base and at most 10 seconds of total waiting: a GET, HEAD, OPTIONS, PUT or DELETE, or a request that sends the idempotency key its operation declares (for example `api.computers.create`, `watch.watchers.create`, `agent.sessions.create`, `notes.nodes.create`; the SDK sends a fresh key when you set none), on `408/425/429/500/502/503/504` or a lost connection; any other method only when the connection could not be opened (the request never reached a server). A kit that is still starting answers `502 BACKEND_GATEWAY_ERROR`; such a request is retried within the client's `kitStartingWaitMs` (default 20000 ms, `0` turns it off): up to five retries at the default, about one more per extra 5 seconds of a larger value, and when that wait runs out it throws `ApiError` with status 502 and code `KIT_NOT_READY`. Set `retries: 0` to disable ordinary retries (a replayable request sending its operation's declared idempotency key, unless marked `responseIsFinal`, can still wait and resend while the server answers `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`, until the call's timeout, or 7 minutes without one), or pass `retries` (and optionally `retryDelayMs` / `retryOnStatuses`) to the constructor or per call to set your own budget (250 ms backoff base, no total cap). Connection failures proven never dispatched can be retried for any method. With an explicit retry budget, POST/PATCH can also retry `429` and hoody-files' `409 FILE_PATH_BUSY` refusal (nothing was changed). A streamed body is never replayed; a request marked `responseIsFinal` is retried only when it never reached a server, and only under an explicit budget. Separately, unless `authRetry` is off, a `401` from the Hoody API (not a kit) replays the request once when a renewed token is available, even one marked `responseIsFinal`, outside the retry budget; a streamed body is still never replayed.

Recommended `baseURL`: `https://api.hoody.com` (when `baseURL` is omitted outside a browser page, `HoodyClient` uses `HOODY_BASE_URL`, then `HOODY_API_URL`, then `https://api.hoody.com`; a client with `target: 'kit'` still uses those two variables when one is set, but gets no built-in `https://api.hoody.com` default; in a browser page an omitted base stays relative to the page). Realm-scoped: `https://{realmId}.api.hoody.com`. Token scoping → § Auth model. Kit URLs → § Proxy URLs.

## Namespace structure

- **`hoody.api.*`** — account-level (auth, projects, computers, realms, vault, wallet, etc.). There is no `hoody.api.billing` namespace; billing endpoints live under `wallet`/`servers`.
- **`box.<ns>.*`** — kit services inside a computer (terminal, files, browser, display, exec, sqlite, …). `const box = await hoody.withComputer(computer)`. The namespace pages and the reference write `client.<ns>.<method>`: for a kit namespace that `client` is this computer client, never the account client, where a kit call throws `<ns> is a computer kit: call client.withComputer(computer) first`; `client.api.*` works on both. On a 401 the client tries one recovery and, if it succeeds, replays the request once: account calls get a new token from `onTokenExpired` or the client's refresh token / `credentials`; kit calls only recover when you supply `onKitAuthExpired`, and a kit call that cannot safely run twice (`responseIsFinal`, such as `exec.run` or `files.append`) is not replayed: `onKitAuthExpired` runs and the `401` is thrown, so you decide whether to send it again. A kit call with a streamed body never triggers `onKitAuthExpired` and is never replayed.

Pattern: `client.<ns>.<svc>.<method>`.

## Iterator + pagination

Most paginated endpoints, page-, offset- and cursor-style alike, ship three flavours (`notes.comments.list` has `listAll` / `listIterator` too):

- `list(...)` — one page; pagination shape varies per endpoint. Most computer/project list endpoints expose `data.pagination.{total,page,limit,totalPages}`; some kit endpoints expose top-level `meta.page`.
- `listAll(...)` — collect all pages.
- `listIterator(...)` — an async generator for `for await`, fetches on demand, supports early `break`. Its items are typed with the row type of the list response (a `computers.listIterator()` row has `id`, `name`, `status`, …), so no cast is needed. Default for non-trivial sets.

Other paginated methods follow the same `*` / `*All` / `*Iterator` triple (e.g. `computers.listByProject*`, `snapshots.list*`, `projects.permissions.list*`).

## Errors

SDK throws **`ApiError`** on every 4xx/5xx, except where the status is the answer: `files.exists` and `sqlite.kv.exists` resolve `false` on a 404 (a missing or expired key). Type guards: `isApiError`, `isRetryableApiError`. Also `ValidationError` (client-side input) and `VaultCryptoError`. Retryable codes: `408/425/429/500/502/503/504`, plus hoody-files' `409 FILE_PATH_BUSY` (see the retry policy under § Init). The request the error carries (`error.request`, and its URL) has secrets (`Authorization`, `Cookie`, `?token=…`, body `{password,token,apikey}`, URL userinfo) auto-redacted to `[REDACTED]` before `catch`; `error.response` and `message` hold what the server answered, unredacted, so do not log them blindly. See § Reference appendix.

## Streaming

- **SSE / live event endpoints** — some generated SSE methods stream: `box.proxyLogs.stream(...)` and `box.exec.logs.stream(...)` declare `Promise<IEventStream>`, an async iterator of `IStreamEvent` frames with `event` and `raw` (`for await (const ev of await box.exec.logs.stream({ file, follow: true })) { ev.event; ev.raw; }`). `box.watch.events.stream(id, { since_id })` returns a typed `IEventStream`: its frames also have `data`, parsed as JSON when possible, and `declared`, true for a declared event whose payload parsed.
- **WebSocket** — `box.notifications.connect`, `box.terminal.sessions.connect`, `box.curl.jobs.connect` and `box.watch.events.connect` return a wrapper: `await wrapper.connect()` to open, then per-wrapper typed callbacks — terminal exposes `onOutput` (Uint8Array); notifications exposes `onNotification` / `onHeartbeat`; curl exposes `onJobstarted` / `onJobprogress` / `onJobcompleted`; watch exposes `onFileEvent` / `onLag`; lifecycle close on every wrapper is `onDisconnect`. NOT Node-style `.on('message')`. See per-namespace SDK skill.
- **Reverse tunnels** — `box.tunnel.expose` / `pull` / `serve` on a computer-scoped client; the package-root `exposeTunnel` / `pullTunnel` / `serveTunnel` accept either an explicit WebSocket `url` or a `computer` hostname or HTTP(S)/WS(S) kit URL.

Runnable snippets in § Core operations cheat-sheet below.

## Index

Recipes: § Core operations cheat-sheet. Per-namespace deep dives: `SKILL-SDK/<ns>.md`.

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
> - Watch **`proxyLogs`** for unexpected callers; if a URL leaks, disable its alias with `proxy.aliases.disable(aliasId)` (not instant: it usually stops serving within about 30 seconds and can take longer).
> - For untrusted reviewers (customers, support tickets, public demos): do not hand out a `display` kit URL as a "read-only" view — its readonly setting is client-side only, and anyone holding the URL can still call the display's input API (clicks, typing). Build a constrained `exec` script that exposes only the operation they need, such as serving a captured screenshot.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP / Hoody identity via `computers.proxy.*` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `proxy.aliases.create({ computer_id, program: '<kit>', alias: 'repo-acme' })` to ship a brandable hostname (`https://repo-acme.{N}.computers.hoody.com`) into the iframe instead of the `{computerId}` URL. `agent` is the exception: an alias to it is accepted but never routes, so embed the agent by its kit URL.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace. They apply on a `display-<N>` URL only: a `desktop-<N>` URL redirects to its display without its query, so open the display URL (or add the params to the URL you are redirected to).
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- Several API kits also serve a browser UI on their kit URL: `cron` (crontab manager) and `watch` at `/`, the `sqlite` studio at `/`, and the `pipe` send / receive / share pages — check a kit's own UI (and its embed views) before building a custom dashboard. `curl` renders no UI, and `http-<port>` shows whatever your app serves.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## Source IP Guard

Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. (403 `forbidden`.)

## One URL form from everywhere

Call kits through their kit URLs on HTTPS, so the proxy's permissions, logging and hooks apply to every call.

What that gives you:

- **The same checks everywhere** — requests from inside computers go through the same `computers.proxy.*` checks and `proxyLogs.*` capture as external requests. The request hooks of `computers.proxy` (`createHook` and the like) apply the same way, but only to services that accept hooks: `logs`, `egress` and `cdp` reject hook operations with `404`.
- **One mental model** — the same URL works from your laptop, from another computer and from inside the computer itself. You write the same code everywhere.

Practical consequence: from inside a computer, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.computers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this.

### Computer ↔ computer — anyone reaches anyone (with permissions)

**A process in computer X can call any kit on computer Y just by calling Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in computer X reads / writes files in computer Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.computers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three computers, three kit URLs, one transparent network.
- A monitoring computer scrapes `/metrics` from every computer in a project's fleet by listing them via `computers.listByProject` and hitting each one's kit URL.

Cross-computer access still goes through the gate stack — Y's `computers.proxy.*` rules apply to whoever's calling, no matter where they're calling from. So:

- **By default** (no gates set), Y's URL is a capability — anyone with the URL has access. Within your account that's usually fine; for production / shared / multi-tenant fleets you SHOULD gate.
- **With a gate set** (§ How to gate — an auth group alone is not a gate), X must satisfy it. A Token gate (`client.api.computers.proxy.setTokenGroup`) is a static shared secret: you choose where it is read (one header, cookie or query parameter) and the exact value it must equal, and X sends that value on every call to Y. It does not check Hoody auth tokens or realms — an `hdy_…` token passes only if it is literally the configured value. A JWT gate (`client.api.computers.proxy.setJwtGroup`) verifies a signed JWT instead; by default a valid token in any of its configured sources counts. For a cookie, use a `__Host-` name set by the address it protects.

Every computer-to-computer call gets the same permission checks and logs as an external call.

## Capability-token semantics — open by default, permission for production

**Under the default allow policy, the URL itself is the credential.** A well-formed kit URL routes without any `Authorization` header — anyone who knows the full URL has the same access as the owner, on every kit (an `exec` script that requires its own token is the one exception: it answers `401` without it). `computerId` is the secret. Computer-internal IDs (session, tab, notebook, terminal_id, displayId) follow the same "knowing the ID = having access" model.

**This is intentional for development**: spawn a computer, share the URL, collaborator reaches it instantly. **It is NOT acceptable for production exposure** — leaked URL = leaked computer. Treat any production deployment as "must have a gate".

### When to gate

- Anything reachable from a public network or shared with a third party.
- Anything that handles secrets, customer data, payments, or user PII.
- Anything where a leaked URL would be hard to rotate (long-lived background jobs, public dashboards, customer-facing demos).

### How to gate

Configure under `computers.proxy` (per-computer) or `projects.proxy` (project defaults for every computer in the project; a computer's own document overrides them: its groups and permission cells of the same name, its `default` (unless it is `inherit`, which uses the project's) and its `enable_proxy` win, so check the computer's document before you count on a project-level gate) on the control plane. Groups are alternatives, not layers: each named group (password, token, JWT, IP or hoody-identity — or an OR-array of those) is one way in, a request that satisfies a group gets that group's per-program `permissions`, and a request that matches no group falls to the document's `default` (`allow` or `deny`; on a computer, `inherit` applies the project's).

A group on its own restricts nothing. It grants only the programs you give it access to. With no stored policy, a project reads as `default: 'allow'` and a computer as `default: 'inherit'` (its project's default), and a request that matches no group gets in whenever the effective default is `allow`. A full `set` that leaves `default` out stores `deny`. A working gate takes three calls: define the group (`client.api.computers.proxy.setPasswordGroup`, `client.api.computers.proxy.setTokenGroup`, `client.api.computers.proxy.setJwtGroup` or `client.api.computers.proxy.setIpGroup`; a `hoody-identity` group has no granular setter, so write it with the whole document through `client.api.computers.proxy.setPermissions`), give it access to each program it should reach (`client.api.computers.proxy.setGroupPermission` with `{ program, access: true }`; for `http` and `https` name the application ports instead, for example `{ program: 'http', access: [8080] }`, because a boolean or `"*"` is refused with `422`), and set `client.api.computers.proxy.setDefault` to `{ default: 'deny' }`. Every one of these writes is versioned: send the document's current `file_version` as `If-Match: file:v<N>` (`file:v0` while the document has none), which the SDK takes as the required options argument `{ ifMatch: 'file:v' + n }`. A missing header is refused with `428` and a stale one with `412`. A granular write answers with the written document: its `data.file_version` is the new version and `data.etag` is the same version as `file:v<N>` (also sent as the `ETag` response header). Use it for the next write, or read the document again. The one partial exception: a password group with an access rule for a program answers a caller without credentials with a `401` challenge for that program even under `default: 'allow'`.

| Gate | Accessor | Caller behavior |
|---|---|---|
| Password | `client.api.computers.proxy.setPasswordGroup` | Browser / `curl -u user:pass` — HTTP Basic. |
| Token | `client.api.computers.proxy.setTokenGroup` | The header, cookie or query parameter you configured must carry exactly the value you configured (a static shared secret). Name a cookie with the `__Host-` prefix. |
| JWT | `client.api.computers.proxy.setJwtGroup` | Verifies the JWT's signature and its `exp` / `nbf` when present; issuer, audience and any other claim are checked only when you list them in the group's `claims` (exact match). |
| IP | `client.api.computers.proxy.setIpGroup` | Source IP must match a CIDR. |
| Hoody identity | the whole document: `client.api.computers.proxy.setPermissions` (no granular setter) | The caller presents a Hoody identity claim whose audience equals the group's `audience`; optional `allow_types`, `users` (24-hex user ids) and `max_age_seconds` narrow who passes. |

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
- `proxy.aliases.create` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. The program names to use for an alias are listed in the `program` row of the Anatomy table under §Friendly aliases below — note `logs` for the proxy-logs kit (not `proxy` or `proxyLogs`) and `run` (not `app`).

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

`desktop_env` only picks the environment when the desktop starts. Opening a `desktop-<N>` that is already running with a different value does not switch it: use a free index, or stop that display first (`client.terminal.system.stopDisplay(display)`) and open the URL again.

Other DEs (GNOME, KDE) are not auto-spawned by the alias — install + run them yourself via `daemon` and reach via the matching `display-<N>` URL directly.

### Forced vs caller-overridable

The proxy locks `desktop=true`, `redirect=display`, `terminal_id`, and `display` to the offset values — passing them in the query string is ignored (defense-in-depth so a caller can't escape the offset isolation). **`desktop_env` is caller-overridable, and other query parameters pass through; only those four are forced.**

### When to use the desktop alias vs `display-<N>` directly

- **Desktop alias** — quick "give me a Linux desktop in a browser tab" surface; no setup needed.
- **`display-<N>` directly** — when a session is already running there (e.g. you launched apps from `terminal-N` so the GUI is on `display-N`), or when you want fine-grained control over the X session.

### Building kit URLs

The SDK ships builder methods so you don't compose URLs by hand: `client.getKitUrl(slug, computer, idx?)` for one kit, `client.listKitUrls(computer)` for the full `{terminal, browser, code, …, desktop, exec, files, …}` record. For desktop with a DE override, use the dedicated helper `client.getDesktopUrl(computer, { desktopEnv: 'mate', serviceIndex: 1 })` (default DE is xfce; `listDesktopEnvironments()` lists known values). Or compose by hand with `client.getKitUrl('desktop', computer, 1)` and append `?desktop_env=mate`.

To compose a kit URL by hand, read `project_id`, `id` and `server_name` from `computers.get(...)` and fill in the patterns above.

## SSH access — shell through the host-side SSH proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `sftp`, `git push` over SSH), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{computerId}-ssh.{node}.computers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). The connection ends at a host-side SSH proxy, not at a server inside the computer: the proxy looks up your public key, finds the one computer that key is registered to, and runs the shell, SFTP or SCP session in that computer through the host. No `sshd` runs in the computer. Port forwarding (`ssh -L`, `ssh -R`) is disabled.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `computers.create` / `computers.update` / `computers.copy`. The key is registered with the host-side SSH proxy, not written to an `authorized_keys` file in the computer. Password auth is disabled.

**The public key MUST be unique across computers — one computer per key**, because the key alone selects the computer. Reusing a key that another computer already holds returns `409` with a message saying the key is already in use (when two creates race for the same key, the losing one still creates its computer, without the key: `ssh_public_key` is `null` and `message` says so, so check it before you connect). Generate a fresh keypair per computer; you can rotate via `computers.update` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; terminal sessions can instead run as a requested user or the terminal server's configured default user. Anything inside the computer is yours.

### IP filtering

The SSH endpoint accepts IPv4 connections only and any IPv4 address may connect; the registered key is the access control. SSH sessions reach the computer through the host-side proxy and the host, not through the computer's network interface, so computer firewall rules (`firewall.*` ingress rules) and in-computer `iptables` / `nftables` rules do not filter them. To cut off a key, replace it with `computers.update` (new `ssh_public_key`). For kit URLs, restrict source IPs with `computers.proxy.setIpGroup`.

### When SSH vs kit URLs

| Need | Use |
|---|---|
| Anywhere-reachable HTTP, logged, gated | Kit URL (`terminal`, `files`, `exec`, `display`, `http-<port>` …) |
| `git clone <ssh url>` / `rsync` / `scp` | SSH |
| Reach an internal-only service from your laptop | Not SSH (port forwarding is disabled): use its `http-<port>` URL, gated with `computers.proxy.*` |
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

Defaults when port omitted: `http` ⇒ port 80, `https` ⇒ port 443. Port range `1..65535`. Capability-token rules still apply — gate the URL via `computers.proxy.*` if you don't want it open.

## Friendly aliases — `<alias>.{N}.computers.hoody.com`

A **proxy alias** is a custom hostname that points at one specific program inside a computer, without putting the `projectId` / `computerId` in the URL you share. Same capability-token semantics — alias URL on its own is the credential — but the URL is shareable, brandable, and hides the computer plumbing.

### Why use them

- **Hide `computerId`**: shipping `https://my-api.{N}.computers.hoody.com` is fine; shipping `https://65f1...c8a-65f2...41e-http-8080.{node}.computers.hoody.com` leaks the computer identifier (which IS the credential of last resort). Not every program keeps it hidden: a `desktop` alias redirects the browser to the canonical `display` URL, which carries both ids. An alias is not an access rule either, and disabling or expiring it does not close the canonical URL: restrict who may open the program with `computers.proxy.*`.
- **Brandable**: short, memorable, copy-pasteable.
- **Retargetable within its computer**: an update can change the alias's program, port, instance index or landing path while the public URL stays the same. It cannot move the alias to another computer (the update takes no `computer_id`); for a new computer, delete the alias and create it there.
- **Same gate stack**: layer Password / Token / JWT / IP / Hoody identity via `computers.proxy.*` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`proxy.aliases.create({ computer_id, program, alias?, index?, port?, target_path?, allow_path_override?, expires_at?, enabled? })`

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

- `proxy.aliases.disable(aliasId)` disables the alias without releasing the slot — useful to revoke a leaked URL while you investigate. Disable, enable, update and delete are not instant: they usually reach the alias URL within about 30 seconds and can take longer, and until then the alias keeps its previous behavior.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409 ALIAS_IN_USE` under any of the three rules: the name is taken on that physical server (by any tenant), your account already holds it on any server, or another account released it on that server within the last 90 days.
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface. Show it in UI as `subserver_name ?? server_name`, but never substitute it into a kit URL.
- **After `computers.create`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `computerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full computer access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — browser sign-in (§ Login) or `client.api.auth.login`. Access token lives `1d`, refresh token `7d`, by default; a deployment may shorten either, so treat both as values to read from the response rather than constants. The interactive, short-lived credential.
2. **Auth token** — `auth.tokens.create`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, replaceable (copy it for a new secret, then delete the old one). Long-lived headless credential.
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
    if (state === 'slow_down') { interval = 5; waitMs = 5000; continue; } // fixed 5 s after slow_down
    if (err.status === 429) { waitMs = (err as { retryAfterMs?: number }).retryAfterMs ?? 300_000; continue; }
    throw err; // access_denied, expired_token, 404: see step 3
  }
}
```

This suits a program whose output the user sees while it runs. If your tool shows a run's output only when it ends, split it: one run calls `start` and prints the values above; later runs call `poll` with that `device_code` (each for about a minute) until it returns the session, and later code builds its client with `new HoodyClient({ baseURL: 'https://api.hoody.com', token })`.

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

Separately, `client.api.computers.createClaim(id)` mints a signed, portable **computer claim** — `data: { computer_claim: { kid, payload_b64, signature_hex }, expires_in, computer_id, project_id }`. It is an *optional* credential for a program **you** run inside a computer to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

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

Pass `realm_ids: ['<24-hex>']` when creating the computer — and an array of multiple realm IDs is fine if a computer needs to be visible in several, except with a realm-restricted auth token: it must call the realm-scoped host, naming any other realm in `realm_ids` is refused with `403` ("This token cannot assign computers to other realms"), and an omitted or same-realm array is replaced with the realm of the host you call. Computer realm membership is **independent of project realm membership** (a project in realm A can hold a computer in realms A+B). Read it back from the `realm_ids` field returned by `client.api.computers.get`.

### Auth tokens × realms

Mint a realm-scoped token via `auth.tokens.create({ realm_ids: ['<id>'] })`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL", except GET/HEAD `/api/v1/auth/tokens/me`, which allows current-token introspection without a realm host). Add / drop realms post-mint with `client.api.auth.tokens.addRealm` / `client.api.auth.tokens.removeRealm`. Tokens with no `realm_ids` can still target a specific realm by using the realm subdomain; only when `allow_no_realm` is true can they also use the `realm_id` query parameter on the routes that take one (with `allow_no_realm: false` the bare host is refused).

### Best practice — one realm + one token per project

This is for unattended automation the user asked for, or for handing a scoped credential to another program. For interactive work with the user present, keep the browser sign-in session and select the realm with its realm URL.

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `client.api.realms.list`.
2. `auth.tokens.create` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `projects.create` with its required `alias` and `realm_ids: [realm_id]` — pin the project to the realm.
4. `computers.create` with its required `server_id` and `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the computer too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Create the client with `new HoodyClient({ baseURL: 'https://api.hoody.com', token, realmId })` (or that realm URL as `baseURL`) so every call goes to the right scope.
   The exception is project-wide access: adding, changing or removing a project member and every `projects.proxy.*` read or write need the base API host (`https://api.hoody.com`) and an unrestricted credential (browser sign-in, or a token with no realm restriction). A realm host or a realm-restricted token is refused with `403`, even for a project in that realm.

Result: that token can only see projects, computers, tokens, and vault entries in the realm. An agent given just this token cannot touch your other realms' resources through the API — even if it's the same Hoody account. Account-wide data is not divided by realm: the wallet's balances and history and the notification inbox refuse a realm-restricted token outright; restrict `financial.*` on the token to stop it spending. Kit URLs it already knows stay reachable; they answer to their own gates, not to the token.

## Storing auth tokens

Mint an `hdy_…` token only when the user asks for unattended automation; the session from browser sign-in is not one, so don't save it yourself. The token from `auth.tokens.create` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the computer. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `vault.set('<key>', { value: 'hdy_…' })`. Stored server-side as sent — Hoody does not encrypt the value for you — and readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `vault.set`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND the `resources.vault` permission granted to it. JWT-as-owner bypasses both. See `vault.set/get/list/delete/clear`.

## Token revocation

- `client.api.auth.logoutAll` — for a JWT this is a **logout-everywhere**: every access and refresh token minted before the call stops working, on every device, not just the one that called it. Auth tokens are unaffected.
- `client.api.auth.refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header; a missing or mismatched bearer answers `401 Invalid refresh token`, and a missing or empty body field is refused as `422` schema validation. The SDK sends both for you: `client.api.auth.refresh({ refreshToken })` presents that refresh token as the bearer for that one request, whatever token the client holds. The client's automatic 401 recovery uses the same call with its stored refresh token first, and falls back to `credentials` only when that fails. For unattended automation the user asked for, a long-lived `auth.tokens.create` token avoids refresh handling.
- `client.api.auth.tokens.delete` / disable / IP-restrict — effective next request.

## 2FA

`auth.twoFactor.startSetup` returns `data: { qr_code, manual_entry_key, backup_codes }` inside the usual `{ statusCode, message, data }` envelope; `auth.twoFactor.confirmSetup` enables. Backup codes rotatable, one-time, hashed. `auth.twoFactor.enableTokenGate` on → sensitive auth-token mutations made with a login-session JWT need an `otp_code` (a TOTP or a one-time backup code). Basic auth has already proved 2FA at authentication, and delegation by an auth token holding `resources.create_tokens` is exempt.

---

# Pre-installed tools — what every computer ships with

Every Hoody computer starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Computers run real systemd as PID 1 with root inside the computer** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides and socket activation work as on a normal distro. Computers share the host kernel, so computer root cannot load kernel modules. Two tiers of pre-installed software:

1. **Default tier** — installed when the computer's resolved `hoody_kit` setting is true. Left out of `computers.create`, it is true for a login (JWT) caller; for an auth-token caller it follows the token's `computers.features.hoody_kit` permission, so it is false when the token lacks it. A computer with `hoody_kit` false is not guaranteed to have these packages.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 26, Bun, Rust, Go, Nix, Docker, …). Pass it on `computers.create`; when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours. The system Python is externally managed (PEP 668), so a bare `pip install` is refused: use a virtual environment for libraries and `pipx install` for Python CLIs. The `dev_kit` installer attempts to install `python3-venv` and `pipx`; if either is missing, run `sudo apt install python3-venv pipx`

## `kvm: true` — run full VMs inside the computer

Computers on **dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the computer. Pass `kvm: true` on `computers.create`, or toggle it later on a **stopped** computer (`computers.enableKvm` / `computers.disableKvm`). Defaults to off. **Never available on free-tier servers or paid subservers (slices)**: the API refuses with `403`. An auth token also needs the `computers.features.kvm` permission (otherwise `403`). `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every computer response carries the current `kvm` boolean. A create with KVM requested can still come back `kvm: false` with a `kvm_note` (KVM was not enabled automatically, so the computer was created with KVM off): check both `kvm` and `kvm_note` in the answer, and if it is off, enable it with the toggle once the computer is stopped.

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

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `daemon.programs.create({ name: 'my-app', command: '…', user: 'user' })`, `terminal.sessions.create({ terminal_id: '100', user: 'user', shell: 'bash', cwd: '/home/user' }, { serviceIndex: 100 })` (`terminal_id` may be omitted when the `terminal-N` host supplies it, or when `ephemeral: true` generates it. On a computer-scoped client the SDK takes the host index from the body id; if you also pass `serviceIndex`, it must be the same id, or the SDK throws a `ValidationError` before sending. A request that reaches the kit with a mismatched id is refused with `400 TERMINAL_ID_MISMATCH`. The `terminal-0` host creates only ephemeral sessions). The generated `client.exec.run(path, ...)` does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For computers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo passwd user && sudo rm /etc/sudoers.d/user    # set a real password first (the account may have none), then remove the drop-in only if that worked
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `computers.proxy.*` gates and ideally a non-root default user.

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

Set the flag on `computers.create` to additionally provision:

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

Installed without credentials. Push your local credentials/config in afterwards
with the `agent.importLocalConfig()` helper (see core-ops § "Sync agent config")
— no manual login inside the computer needed.

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

State is per-computer: `computers.copy` clones the disk including everything you installed; `client.api.snapshots.create` saves a point-in-time you can later `client.api.snapshots.restore` to roll back to. There is no global "shared layer" leak — each computer's filesystem is its own.

---

# SDK — Core operations cheat-sheet

TS SDK recipes against `https://api.hoody.com`. `hoody` = account `HoodyClient`; `box = await hoody.withComputer(computer)` = computer-scoped. See § Auth model and § Proxy URLs above.

### Setup

```typescript
import { HoodyClient } from 'hoody-sdk';
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com', token: process.env.HOODY_TOKEN! });
// withComputer takes a computer id (looked up with the token) or a computer object: a row
// from computers.list()/get(), or one you build with id, project_id and the routing server
// name as `server_name` or a string `server`. A `server: { name }` object is display data, not
// a routing host: with no usable server_name, withComputer looks the computer up by id with
// the token.
const box = await hoody.withComputer(computerId);
```

A hoody-exec script has a global `hoody`: a client already scoped to the computer it runs on, so
`await hoody.files.readText(path)` needs no `require`, login or `withComputer()`, and no token under the
default allow policy. The global needs SDK methods that older SDK versions lack: with such a copy (for
example a 1.0.0-beta one, which exec never updates automatically) the first use of `hoody` fails with
`upgrade_required`, and the error names 1.0.1 as the version to install. Request it with
`exec.modules.install` (`hoody-sdk@<version>`), which stages it, then `exec.kit.restart`; a version your
scripts-root `package.json` declares must allow the one you request. A kit protected by proxy permissions takes the credential its authentication group
expects, passed explicitly as `kitAuth` (`hoody.withComputer(id, { kitAuth })`); none is read from the
environment. For `hoody.api.*` the global reads `HOODY_TOKEN` from the script's `.env` companion (see
below).
A script that declares its own `hoody` or builds `new HoodyClient(...)` keeps its own. To build the box
by hand, load the SDK with `require` or a top-level `import` and use the script's `metadata` and the
server named in `HOODY_COMPUTER_PROXY_DOMAIN` (no lookup, no account call):

```typescript
const { HoodyClient } = require('hoody-sdk');
const hoody = new HoodyClient({ baseURL: 'https://api.hoody.com' });
if (!process.env.HOODY_COMPUTER_PROXY_DOMAIN) throw new Error('HOODY_COMPUTER_PROXY_DOMAIN is not set');
const box = await hoody.withComputer({
  id: metadata.computerId,
  project_id: metadata.projectId,
  server_name: process.env.HOODY_COMPUTER_PROXY_DOMAIN.split('.')[0],
});
```

Exec sets no account token. For `hoody.api.*` calls (or `withComputer(id)`, which looks the
computer up), put `HOODY_TOKEN=<token>` in the script's `.env` companion (`<script>.env`, or a
`_default.env` in its directory); the global `hoody` reads it, and a hand-built client needs
`token: process.env.HOODY_TOKEN!`. The computer env
API refuses `HOODY_*` keys, so it cannot supply one.

### Results: what each call resolves to

- A generated HTTP call (`hoody.api.*`, `box.<kit>.*`) resolves to the envelope
  `{ statusCode, message, data }`: the result is `.data`, never the returned object itself.
  Exceptions: a generated SSE method (`box.exec.logs.stream`, `box.watch.events.stream`) resolves
  to the event stream itself (`for await` over it, no `.data`);
  a generated WebSocket method (`box.watch.events.connect`, `box.terminal.sessions.connect`)
  resolves to its socket wrapper itself (no `.data`), which you open with `await wrapper.connect()`.
- `rawResponse: true` in a call's options skips the SDK's envelope: the call resolves to the body
  the service sent (a kit's own JSON; a `hoody.api.*` body is itself `{ statusCode, message, data }`).
- `listAll()` resolves to a bare array of every row (no `.data`); `listIterator()` is an async
  iterator of rows (`for await`). Exception: `auth.tokens` lists in one response of at most 1000
  tokens, so `auth.tokens.listAll()` can be short: call `auth.tokens.list()` and check its
  top-level `truncated` flag.
- `box.terminal.run(command)` resolves to `{ stdout, stderr, exitCode, timedOut }` (no envelope).
- `box.files.readText` / `readJson` / `readBytes` resolve to the text, the parsed value and a
  `Uint8Array` (no envelope), § 16.
- `box.browser.page.captureScreenshot({ …, responseType: 'arrayBuffer' })` resolves to the
  envelope: the image bytes (`ArrayBuffer`) are `r.data`, § 17.
- `box.sqlite.sql.query(…)` resolves to `{ rows, columns, truncated }` and
  `box.sqlite.sql.run(…)` to `{ rowsUpdated }` (no envelope), § 25.
- A 4xx/5xx answer throws an `ApiError` (`err.status` holds the HTTP status).

| Call | Where the result is |
|---|---|
| `hoody.api.computers.list()`, `computers.listByProject(projectId)` | `r.data.computers` (one page; `r.data.pagination`) |
| `hoody.api.computers.get(id)` | `r.data` |
| `hoody.api.projects.list()` | `r.data.projects` |
| `hoody.api.auth.tokens.list()` | `r.data` (array) |
| `hoody.api.servers.list()` (your servers) | `r.data` (array; `server_id`, `server.name`) |
| `hoody.api.realms.list()` | `r.data.realm_ids` (ids only) |
| `computers.listAll()`, `projects.listAll()`, `auth.tokens.listAll()` | `r` itself (array, no `.data`) |
| `box.files.readText(file)`, `readJson(file)`, `readBytes(file)` | `r` itself (string, parsed value, bytes), § 16 |
| `box.files.get(file, { responseType: 'text' })` | `r.data` (string), § 16 |
| `box.files.get(directory)` | `r.data.entries` (`{ name, is_dir, size }`) |
| `box.sqlite.sql.query({ db, sql, params })` | `r.rows` (array of row objects), `r.columns`, § 25 |
| `box.sqlite.sql.run({ db, sql, params })` | `r.rowsUpdated`, § 25 |
| `box.sqlite.sql.runTransaction(…)` | `r.data.results[i].resultSet` (rows), § 25 |
| `box.sqlite.kv.get(key, { db })` | `r.data` (the stored value, unless that value is itself shaped like `{ statusCode, data }`), § 19 |
| `box.sqlite.kv.read(key, { db })` | `r` itself (the whole stored value, no envelope), § 19 |
| `box.cron.entries.list('user')` | `r.data.entries`, § 26 |
| `box.terminal.commands.run(…)` | `r.data.stdout`, `r.data.exit_code`, § 13 |
| `box.terminal.run(command)` | `r.stdout`, `r.exitCode` (no envelope), § 13 |

Row fields keep the API's snake_case names: `id`, `name`, `status`, `project_id`, `server_name`,
`created_at`, `is_default`, `alias`, `expires_at`.

```typescript
const page = await hoody.api.computers.list();
const running = (page.data.computers ?? []).filter((c) => c.status === 'running');
const all = await hoody.api.computers.listAll();          // array: all.map(c => c.name)
```

### 1. Sign up

Default for a person: they sign up at `https://api.hoody.com/auth/signup` in their own browser, and you sign them in through the browser (§3). Existing account: always browser sign-in first; if it fails, stalls or is refused, ask for a token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password (use one only if offered). Never repeat or store a secret. `signup`, `api.auth.email.verify` and `login` below are for an offered password or the user's own code.

```typescript
// Password 12-128 chars, at most 72 UTF-8 bytes, at least 3 of 4 classes (upper/lower/digit/symbol).
await hoody.api.auth.signup({
  email: 'you@example.com',
  password: process.env.HOODY_PASSWORD!,
});
```

### 2. Verify email

```typescript
await hoody.api.auth.email.verify({
  token: codeFromEmail, // 64-char token from the verification email link
});
```

### 3. Log in

Browser sign-in first (all states: § Login):

```typescript
import { isApiError } from 'hoody-sdk';
// `hoody` is the client from Setup. While the user signs in, poll throws ApiError 400 with
// err.response.data.error === 'authorization_pending'.
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
    if (state === 'slow_down') { interval = 5; waitMs = 5000; continue; } // fixed 5 s after slow_down
    if (err.status === 429) { waitMs = err.retryAfterMs ?? 300_000; continue; }
    throw err; // access_denied: stop and ask before retrying; expired_token: start again; 404: browser sign-in is off here, ask for a token (§ Login)
  }
}
```

Password login (last resort, see the order above): `username` is alphanumeric with underscores and hyphens (`^[a-zA-Z0-9_-]+$`); use the separate `email` field for email-based login. Login password min length is 8 (signup is 12).

```typescript
// `hoody` is the client from Setup.
const login = await hoody.api.auth.login({
  email: 'you@example.com',  // or `username: 'alex_3'`
  password: process.env.HOODY_PASSWORD!,
});
if (!login.data || !('token' in login.data)) throw new Error('Second factor required: see step 4');
hoody.adoptSession(login); // keeps the refresh token too, for automatic refresh
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
  alias: 'acme-project',
  realm_ids: ['507f1f77bcf86cd799439011'],
});
const projectId = project.data!.id;
```

### 8. List computers

```typescript
const r = await hoody.api.computers.listByProject(projectId);
const names = (r.data.computers ?? []).map((c) => c.name);
```

### 9. Create a computer

```typescript
const c = await hoody.api.computers.create(projectId, {
  server_id: process.env.HOODY_SERVER_ID!,
  name: 'box-1',
  hoody_kit: true,
  realm_ids: ['507f1f77bcf86cd799439011'],
});
const computerId = c.data.id;
```

Once the computer is running, give the user the clickable URLs of its main kits (each opens its web UI at `/`). `getKitUrl` maps `notifications` to its `n` slug itself:

```typescript
const computer = c.data;
for (const kit of ['terminal', 'notifications', 'desktop', 'browser', 'files', 'agent']) {
  console.log(`${kit}: ${hoody.getKitUrl(kit, computer)}/`);
}
```

### 10. Start / stop / restart

```typescript
await hoody.api.computers.start(computerId);
// also: stop (`stop(id, undefined, { force: true })` kills without a clean shutdown), restart, pause, resume
```

### 11. Get computer + build Kit URLs

```typescript
const got = await hoody.api.computers.get(computerId, { runtime: 'true' });
const computer = got.data;

// Single kit URL — pass slug + optional instance index.
const terminalUrl = hoody.getKitUrl('terminal', computer);    // → terminal-1
const display3    = hoody.getKitUrl('display', computer, 3);  // → display-3
const port8080    = hoody.getKitUrl('http', computer, 8080);  // → http-8080

// All standard kit URL patterns at once — Record<slug, url>. This is a convenience
// method; it returns the canonical URL for every standard kit and does NOT
// check whether the program is actually live on this computer.
const all = hoody.listKitUrls(computer);
// { terminal, browser, code, curl, cron, daemon, display, desktop, exec,
//   files, notifications, sqlite, watch, logs, notes, run, pipe, tunnel,
//   agent, vm, egress }   ← 21 keys

// Desktop helper — picks the DE via query string. Default xfce; pass `mate`
// for MATE. Returns the same URL the user opens in a browser tab.
const xfce = hoody.getDesktopUrl(computer);
const mate = hoody.getDesktopUrl(computer, { desktopEnv: 'mate', serviceIndex: 1 });
```

### 12. Snapshot + restore

```typescript
await hoody.api.snapshots.create(computerId, {
  alias: 'pre-deploy',
  expiry: 30, // days
});
await hoody.api.snapshots.restore(computerId, 'pre-deploy');
```

### 13. One-shot command

`box.terminal.run(command)` runs the command as a process of its own (`bash -c`, or `/bin/sh -c` when Bash is unavailable; no terminal),
waits for the end, and resolves to `{ stdout, stderr, exitCode, timedOut }` without an envelope.
The output is exact: stdout and stderr apart, line endings and whitespace as the command wrote
them, and the raw bytes in `stdoutBytes` / `stderrBytes` for binary output. A non-zero exit does
not throw: check `exitCode` (null when a signal ended the command; `signal` names it).
In the default run, output past the capture limit rejects with `code: 'OUTPUT_TRUNCATED'` (the cut result is `err.result`). A run in a terminal (`terminalId: N`) does not check for a cut and resolves with whatever the terminal returned. `stdout` usually ends with a newline;
`trimEnd()` it when parsing. With `terminalId: N` (N >= 1) the command runs in terminal N instead, reusing it if it
exists; its output is terminal text (stderr merged, CRLF, trimmed). `shell: 'tmux'` is refused: tmux
never reports when the command ends. Start a detached tmux session with a plain run instead
(`box.terminal.run("tmux new -d -s job 'make build'")`).

```typescript
const res = await box.terminal.run('df -h /');
if (res.exitCode !== 0) throw new Error(res.stderr);
const lines = res.stdout.trimEnd().split('\n');
```

The generated call underneath is `mode: 'raw'` on the `terminal-0` host (the SDK's default host is `terminal-1`). It answers when the command has ended, with the output in base64:

```typescript
const r = await box.terminal.commands.run(
  { command: 'uname -a', mode: 'raw' },
  {},
  { serviceIndex: 0 },  // terminal-0 host
);
const out = Buffer.from(r.data.stdout_b64 ?? '', 'base64');  // the bytes; envelope: also r.data.stderr_b64, r.data.exit_code, r.data.signal
```

Without `mode: 'raw'` the command runs in a terminal session (`{ ephemeral: true }` on `terminal-0` makes a fresh one) and `r.data.stdout` is terminal text: stderr merged, CRLF line endings, escapes removed, trimmed.

### 14. Persistent terminal session

```typescript
// Session N lives on the terminal-N host; pass it as serviceIndex on every call.
// The terminal-N host supplies N, so the body terminal_id is optional at the kit; if
// you send it, it must equal N: the SDK takes N from it, a different serviceIndex
// throws a ValidationError before the request, and a mismatch that reaches the kit
// answers 400 TERMINAL_ID_MISMATCH.
const N = 100;  // pick 1-1600 (new sessions take 1-9999 except the agent band, refused on a terminal-N host; with the default bands 1601-5000 back desktops and agents, 5001-7999 is ephemeral, 8001-9999 Hoody Run/Hub)
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

Scripts use the direct-execution pattern: no export and no function declaration; write the code and `return` the result (`req`, `res`, `metadata`, `shared`, `console`, `require` and `hoody`, a client scoped to this computer, are injected). `module.exports = async (req, res, metadata, shared) => …` also works. Keep script validation on (the default).

```typescript
const r = await box.exec.run('/api/build');
```

### 16. Read / write a file

The readers resolve to the content itself, no envelope. `readJson` fetches the text and parses
it; content that is not JSON throws a `SyntaxError` naming the path. They take a file path; for a
directory listing use `files.get(directory)` (below): the readers request text or bytes. A missing file throws `ApiError` with `err.status === 404`.
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
const shot = await box.browser.page.captureScreenshot({
  url: 'https://example.com',
  fullPage: true,
  format: 'png',
  responseType: 'arrayBuffer',
});
const png = shot.data as ArrayBuffer;   // envelope: the image bytes are .data
```

### 18. Click + type on a virtual display

Input reaches only a viewable window: take a fresh screenshot and pick a point on a window (screenshot pixels are screen coordinates). When the point is on the bare desktop, or the window there is hidden (for example minimized in a viewer), `click` and `type` answer `409 WINDOW_NOT_VIEWABLE` and send nothing (unless an open menu takes the click); restore the window with `windows.restore` if it is hidden, re-shoot and retry.

```typescript
// data first (x, y, button as 1=left/2=middle/3=right), displayId in options.
await box.display.input.click({ x: 640, y: 360, button: 1 }, { displayId: 1 });
await box.display.input.type({ x: 640, y: 360, text: 'hello world' }, { displayId: 1 });
```

### 19. SQLite KV set / get

```typescript
// kv.set takes the value itself: an object, array, number, boolean or string is stored as JSON.
// Do NOT JSON.stringify it first: the string would be stored as a JSON string, so get would
// return the text '{"name":"Ada",…}', not the object. Raw text: contentType: 'text/plain'.
// db / table / path / ttl / ifValue all live in options, not the body.
await box.sqlite.kv.set(
  'user:42',
  { name: 'Ada', tier: 'pro' },
  { db: '/hoody/databases/app.db', create_db_if_missing: true },  // or a bare name: 'app'
);
const user = await box.sqlite.kv.read('user:42', { db: '/hoody/databases/app.db' });
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

// events.stream yields events as they arrive; `ev.data` is the parsed payload (`ev.raw` the text).
for await (const ev of await box.watch.events.stream(watcherId)) {
  console.log(ev.event, ev.data);
}
// For catch-up and polling instead, use `box.watch.events.list` with a cursor:
let lastId: number | undefined;
for (;;) {
  const page = await box.watch.events.list(watcherId, {
    limit: 200,
    ...(lastId === undefined ? {} : { since_id: lastId }),
  });
  const items = (page.data as any)?.items ?? [];
  for (const ev of items) lastId = ev.id;
  if (items.length === 0) break;
}
```

### 21. Reverse tunnel (localhost → public URL)

```typescript
// box.tunnel.* builds the tunnel WebSocket URL and sends box's kitAuth (never the account token)
const handle = await box.tunnel.expose({
  computerPort: 3000,               // 0 = auto; 1-79 always refused; 80-1023 only if the kit allows privileged binds
  to: { host: '127.0.0.1', port: 3000 },   // TunnelLocalTarget = { host, port }, no `kind` field
});
console.log(hoody.getKitUrl('http', computer, { port: handle.bind.computerPort }));  // the public URL
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
Refused for a token limited to realms (403 `REALM_TOKEN_ACCOUNT_MONEY`); use a login session or an unrestricted token.

### 24. Sync agent config / credentials into a computer

Dev-kit computers ship the agent CLIs (`claude`, `codex`, `opencode`, `gemini`)
but no credentials. Push your local config in so they work immediately. Needs a
computer-scoped client (`withComputer`). Writes via the files kit (raw bytes),
hardens perms (files `0600`, dirs `0700`, chown to the computer user).

```typescript
const box = await hoody.withComputer(computer);

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
(off by default). Narrow with `only` / `categories` or `exclude` globs. `include` globs
add matching files regardless of category; `exclude` takes precedence.
Known tools: `codex`, `claude`, `opencode`, `gemini`. By default a symlink inside a directory
being synced is skipped and reported (`followSymlinks: true` follows it; a symlinked root you
name is followed), and a remote path containing a `..` segment is rejected. `importLocalConfig` returns `{ tool, dryRun, planned, written, skipped, errors, bytesWritten }`; `importLocalConfigs` returns an array of those, one per tool.

### 25. SQLite SQL (select / insert)

`box.sqlite.sql.query({ db, sql, params })` runs one statement that returns rows (a SELECT, or
a write with `RETURNING`) and resolves to `{ rows, columns, truncated }`.
`box.sqlite.sql.run({ db, sql, params })` runs one statement for its effect (CREATE, INSERT,
UPDATE, DELETE) and resolves to `{ rowsUpdated }`. A statement whose SQL produces columns (a write with
`RETURNING`) resolves to `{ rowsUpdated, rows }` instead, with `truncated: true` when the row cap cut it
(`rowsUpdated` is then the number of rows returned). `db` is required: a bare
name (`'app'` → `/hoody/databases/app.db`) or a path. The database must exist: pass
`create_db_if_missing: true` on the call that may be the first. `params` is an array for `?`
placeholders or an object for named placeholders (`:name`, `@name` or `$name`); each value is a string, a finite number,
a bigint within the signed 64-bit INTEGER range, a boolean or null (NaN, Infinity, undefined, a wider bigint, bytes and
nested values throw before sending).
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
const inserted = w.data.results?.[0]?.rowsUpdated;      // 1
const newId = w.data.results?.[1]?.resultSet?.[0]?.id;
```

Read-only alternative (GET, SELECT/WITH only): `sql.queryReadOnly` takes the SQL as URL-safe
base64 and answers `{ columns, resultSet, rowCount }` in `.data`.

```typescript
const sql = Buffer.from('SELECT count(*) AS n FROM items').toString('base64url');
const q = await box.sqlite.sql.queryReadOnly({ db: 'app', sql });
const n = q.data.resultSet?.[0]?.n;
```

Without the SDK, the same transaction is `POST /api/v1/sqlite/db?db=<name>` on the computer's
sqlite kit URL; the body is the kit's answer itself, with no envelope.

```typescript
const sqliteUrl = hoody.getKitUrl('sqlite', computer);  // https://{P}-{C}-sqlite-1.{N}.computers.hoody.com
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
computer's login user), never an object.

```typescript
const entries = await box.cron.entries.listAll('user');  // every page as one array; list('user') answers one page (50 by default, `{ page, limit }`, limit at most 200)
const commands = entries.map((e) => (e.type === 'managed' ? e.command : e.line));  // managed: { type, id, schedule, command, enabled, … }; raw: { type, line }

const created = await box.cron.entries.create('user', { schedule: '*/5 * * * *', command: '/home/user/bin/sync.sh' });
const id = created.data.id;
await box.cron.entries.update('user', id, { enabled: false });
await box.cron.entries.delete('user', id);
```

Without the SDK, the cron kit's routes sit under `/api/v1/cron` on its kit URL
(`https://{P}-{C}-cron-1.{N}.computers.hoody.com/api/v1/cron`):

| Route | Does |
|---|---|
| `GET /api/v1/cron/users/{user}/entries?page=&limit=` | list a page of the user's crontab lines in order (default 50 per page, max 200; follow `total` for the rest): `{ user, entries, total, page, limit }`; managed entries have `type:"managed"` with `id`, `schedule`, `command`; other lines come back as `type:"raw"` with `line` |
| `POST /api/v1/cron/users/{user}/entries` | create: JSON `{ schedule, command, name?, comment?, enabled?, expires_at? }` → 201 with the new entry and its `id`; 200 with the existing entry when an identical one already exists (a retried create makes one entry) |
| `GET /api/v1/cron/users/{user}/entries/{id}` | one entry |
| `PATCH /api/v1/cron/users/{user}/entries/{id}` | update the fields you send (`schedule`, `command`, `enabled`, …) |
| `DELETE /api/v1/cron/users/{user}/entries/{id}` | delete |
| `GET /api/v1/cron/users/{user}/crontab` | the user's whole crontab: `{ user, crontab }` (`crontab` is the text) |
| `PUT /api/v1/cron/users/{user}/crontab` | replace it: JSON `{ crontab: '<text>' }` |
| `GET /api/v1/cron/crontab?page=&limit=` | a page of users' crontabs (default 50 users per page, max 200) |

---

# SDK — Reference appendix

## `HoodyClientConfig` key options

- `baseURL` (recommended `https://api.hoody.com`; when omitted outside a browser page: `HOODY_BASE_URL`, then `HOODY_API_URL`, then `https://api.hoody.com`; for `target: 'kit'` the two variables still apply, but there is no built-in default); `realmId` -> `{realmId}.api.hoody.com`.
- Auth: `token` and/or `credentials` (`{username,password}` or `{email,password}`; both fields are independent on `HoodyClientConfig`; with a person present, sign in through the browser instead and `adoptSession` the result, see § Login); `autoRefresh`, `autoRetryAuth`; hooks `onTokenExpired`, `refreshToken`, `kitAuth`+`onKitAuthExpired`, `onError`.
- Retry: `timeout`, `retries` (when omitted, eligible requests normally get up to two retries, with a 2-second backoff base and at most 10 seconds of total waiting; a `502 BACKEND_GATEWAY_ERROR` from a kit still starting is retried within `kitStartingWaitMs` (default 20000 ms; up to five retries at the default, about one more per extra 5 seconds of a larger value), then throws status 502 with code `KIT_NOT_READY`; set `retries: 0` to disable ordinary retries (a replayable request sending its operation's declared idempotency key, unless marked `responseIsFinal`, can still wait and resend while the server answers `409 IDEMPOTENCY_REQUEST_IN_PROGRESS`, until the call's timeout, or 7 minutes without one); a value you set gets a 250 ms base and no total cap), `retryDelayMs`, `retryOnStatuses` (default 408/425/429/500/502/503/504); honours `Retry-After`, cap 30s per wait.
- Misc: `headers`, `cache{enabled,ttl}`, `transport.keepAlive`, `forceIpv4`, `forceIpv4Cache{enabled,ttlMs}`, `middlewares`, `clientId`/`clientName`, `urlTemplates`.
- Per-call: `responseType` (`json|text|arrayBuffer|blob|auto`), `timeoutMs`, `signal`, `rawResponse` (skip envelope; cast `as unknown as RawShape`).

## `ApiError`

`status, code?, url?, method?, request{method,url,body?,query?,headers?}, response{statusCode?,message?,code?,details?}`.

- `0` transport (`cause` set) · `422` control-plane request-schema validation (body `error: "Validation Error"` with the details; `err.code` is ordinarily `undefined`, so branch on the status) · `400` other bad requests, including many kit validation failures · `401` SDK tries one recovery (account: token refresh; kit: only when `onKitAuthExpired` is set) and replays the request once on success, else throws; a streamed body is never replayed (a kit call with one does not even trigger `onKitAuthExpired`), and a kit call marked `responseIsFinal` (`exec.run`, `files.append`) is not replayed after `onKitAuthExpired` runs: the `401` is thrown · `403` realm/permission · `404` missing in token's realm · `408/425/429/500/502/503/504` retryable.
- `code` is read from the JSON error body in this order: a non-empty top-level `code` string; else a non-empty top-level `errorCode` string (the computer edge's `BACKEND_GATEWAY_ERROR`); else an `error` string that is itself code-shaped (SCREAMING_SNAKE); else a non-empty nested `error.code` string. When the body yields none, the `X-Hoody-Error-Code` response header is read (a `HEAD` answer has no body, so that is the only place its code can be). Prose in `error` is never promoted to a code. What you get therefore depends on which service answered:
  - **Account / control-plane** — standard bodies are `{statusCode, error, message, data?}`. When `error` carries a machine code such as `SIGNING_NOT_CONFIGURED` it reaches `err.code`. A code-less 401 or 403 defaults to `INVALID_TOKEN` or `INSUFFICIENT_PERMISSIONS`; JWT refusals can instead use `MISSING_TOKEN` or `TOKEN_EXPIRED`. Status names such as `Bad Request` and `Validation Error` never become codes (`err.code` is `undefined`). Some responses use another shape: the IP-block refusal carries `error: 'Forbidden'` with a top-level `code: 'IP_BLOCKED'`, which reaches `err.code`.
  - **Top-level `code`** — the body is `{code, message, details?}`, SCREAMING_SNAKE (`EXPIRES_IN_PAST`, `INVALID_EXPIRES_AT`, `ENTRY_NOT_FOUND`). These reach `err.code`.
  - **Top-level `{code, message, details?}` (notes)** — the notes kit's routes carry their machine code at the top level, and it reaches `err.code`.
  - **Header only** — the sqlite kit's KV `HEAD` 404 names `KEY_NOT_FOUND` / `KEY_EXPIRED` in `X-Hoody-Error-Code`.
- A lower-case `error` value is not a code: the logs kit's `429 {error: "rate_limited"}` leaves `err.code` `undefined`; read the body.
- Some values of `code` come from the CLIENT, not from any body. With `status` `0`: **`ABORTED`** when the caller's `signal` aborted the request (message "Request aborted by the caller", never retried), **`ETIMEDOUT`** when the request timed out: no response headers within `timeoutMs` (never retried), a connection that could not be opened in time, or a body that stalled after the headers arrived, and **`PARSE_ERROR`** when the response body would not parse. Stream validation errors (`NOT_AN_EVENT_STREAM`, `STREAM_FRAME_TOO_LARGE`) keep the response status, and `REDIRECT_REFUSED` keeps the refused redirect's status. A timeout is the error a caller meets most often, so handle `ETIMEDOUT` explicitly.
- **So: branch on `status` first, always. Treat `code` as an optional, service-specific refinement, and never assume a documented value will appear there.**
- `retryAfterMs` is attached to the thrown error when an HTTP **error** response carried a **parseable** `Retry-After` header — any error status, not just 429. It is not attached on the client-side failures above: a `200` whose body will not parse throws `PARSE_ERROR` with `status` `0` and no `retryAfterMs`, even when the response carried the header. Delta-seconds and an HTTP-date both parse; anything else is ignored and the property stays absent, and a date already in the past gives `0` rather than a negative wait. It is declared on `ApiError` as an optional field (`err.retryAfterMs`), so no cast is needed.

## Pagination

`list()` page · `listAll()` memory-bound · `for await (... of listIterator())` streamed. Other paginated methods have the same `*All` / `*Iterator` pair, for example `computers.listByProjectIterator`, `snapshots.listIterator` and `projects.permissions.listIterator`. Iterators are async generators typed with the row type of the list response. The helpers follow the page, offset or cursor parameter the operation takes and start from the one you pass; a walk that cannot finish (the same page twice, a cursor that ends short of the total, more than 1000 pages) throws instead of returning a partial list. A one-response list is not walked: `auth.tokens.list()` returns at most 1000 tokens and sets a top-level `truncated: true` when there are more, which `auth.tokens.listAll()` does not check.

## Streaming

`proxyLogs.stream` and `exec.logs.stream` declare `Promise<IEventStream>`, an async iterator of `IStreamEvent` frames with `event` and `raw` — iterate them with `for await (const ev of await box.proxyLogs.stream({...}))` or `for await (const ev of await box.exec.logs.stream({ file, follow: true }))`. `watch.events.stream(id, { since_id })` returns a typed `IEventStream` (`for await (const ev of await box.watch.events.stream(id))`): its frames also have `data`, parsed as JSON when possible, and `declared`, true for a declared event whose payload parsed. WebSocket-wrapper methods (`notifications.connect`, `terminal.sessions.connect`, `curl.jobs.connect`, `watch.events.connect`) expose `await wrapper.connect()` plus per-wrapper typed callbacks: terminal has `onOutput` (Uint8Array); notifications has `onNotification`/`onHeartbeat`; curl has `onJobstarted`/`onJobprogress`/`onJobcompleted`; watch has `onFileEvent`/`onLag`; lifecycle close on every wrapper is `onDisconnect`. Tunnel `exposeTunnel({ url | computer, kitAuth?, computerPort, to: { host, port }, takeover? })` (the retired `token` option is refused; use `kitAuth`) from `hoody-sdk` (re-exported); `ExposeTunnelOptions` accepts either a fully-qualified `url` or a `computer`. When `url` is omitted, `computer` may be a hostname or an HTTP(S)/WS(S) kit URL. A bare kit hostname gets `wss://`. To choose the scheme yourself, pass a URL; a URL with a scheme keeps it: HTTPS becomes WSS, HTTP becomes WS, and `ws://` and `wss://` stay as given whatever the hostname. For `computer`, the helper appends `/api/v1/tunnel/connect` when the path lacks it; a `url` is used as given, so pass the full `wss://…/api/v1/tunnel/connect` URL.

## Type imports

`import type { HoodyClientConfig, ApiError, ApiComputersListResponse } from 'hoody-sdk'` — the root entry re-exports every generated request, response and schema type, type-only. Namespace subpaths (e.g. `hoody-sdk/api`) export the service classes only; import types from `hoody-sdk` or `hoody-sdk/types`. Deep-importing `hoody-sdk/generated/types` is blocked by the exports map; alternatively derive types via `Awaited<ReturnType<typeof client.api.computers.list>>`.

## Quirks

- **Login: raw API + `client.api.auth.login(...)` accept either `username` or `email`** + `password` on `POST /api/v1/users/auth/login`. The `HoodyClientConfig.credentials` shorthand and `HoodyClient.login(...)` accept the same choice: `{ username, password }` or `{ email, password }`. An email sent as `username` is rejected (422), so use the `email` field for email addresses.
- **`auth.refresh` sends the refresh token twice for you** — the server requires it in BOTH the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. `client.api.auth.refresh({ refreshToken })` presents that value as the bearer for that one request, whatever token the client holds. The client's automatic 401 recovery uses its stored refresh token first and falls back to `api.auth.login(credentials)` only when that fails, so a client with a refresh token recovers without `credentials` until the refresh token itself expires. For unattended automation the user asked for, a long-lived `auth.tokens.create` token avoids refresh handling.

## Bot URLs

A Bot URL gives one of your agent's Bots a public address, `https://<label>.hoody.bot`, and named keys (`hbk_…`) for the people you share it with. Manage it with `client.api.botUrls` (`list`, `create`, `get`, `update`, `repoint`, `panic`, `delete`, `suggestLabel`; keys under `client.api.botUrls.keys`: `create`, `update`, `rotate`, `revoke`, `revokeAll`); ids are `bu_…` and key ids `bk_…`. Writes return `{ data, propagation }`; poll `get` until `propagation.state` is `applied` (its counts already include deny targets, so do not add them). A delete is the exception: its reply is the only snapshot, and `get` answers 404 `BOT_URL_NOT_FOUND` at once, which does not mean the removal is applied. `url`, `test_curl` and a new key's `curl` are strings normally and `null` while the platform has no usable Bot zone: the URL is unavailable then, and creating, enabling or repointing a Bot URL and `suggestLabel` are refused (503 `BOTS_DISABLED`), while reads, settings, delete, keys and panic keep working. Check for `null` before using them. The owner-side rules (who may manage one, the limits, labels, key handling, lifecycle and errors) are in the `api` namespace page, and the `agent` namespace page, Example 4, runs the whole flow: create, mint a key, call it, rotate, panic.

Callers need no Hoody login: `new BotUrlClient({ url, key })` from `hoody-sdk`. The client accepts only a label under `hoody.bot`, under the Bot zone of the platform domain you pass as `platform` (by default the platform your SDK was installed from, which on production adds nothing), or under the zone you pass as `zone`, and refuses any other host, a lookalike included, before sending anything. Methods: `listModels()` (one model, id = the label; a cheap key check), `chat(text | messages, { stream, onText, idempotencyKey })` (OpenAI chat door, streamed by default; each call sends a fresh random `Idempotency-Key`, or your own, or none with `false`. Retries reuse the same key. Repeating a request with the same Idempotency-Key normally joins the running message or returns its saved reply. This is best effort, not a guarantee: the Bot keeps a key for about 24 hours after it accepted the message, and after that, or after a reset, the repeat can be a NEW message. A Bot holding very many recent keys refuses a new key (429) instead of forgetting an old one. MCP text carries no key: an `ask` whose text matches one still running shares its reply, but once that reply has been delivered the same text is a NEW message; rejoin an earlier ask with `ask({ ref })`. Do not replay it through `chat`: an Idempotency-Key you choose never matches the key the MCP ask was stored under, so `chat` starts separate work. Before repeating anything that changes things, check with status/updates or poll the ref you got back.), `ask(text | { ref })` (MCP `ask`; follows `working` refs until the Bot answers, a gate stops it, or `maxWaitMs` passes (default 10 min). Read the returned `status`: `answered` holds the reply, `working` means the wait limit was reached (rejoin with `ask({ ref })`), a status that says it is waiting on a gate needs the owner, `reset` means the Bot was reset before answering (ask again). A ref works only with the key that received it), `listUpdates(cursor?)` (rows with a field of the wrong JSON type are left out and counted in `omitted`), `answer({ gateId | title, decision, text? })` (`gateId` is a gate handle, `g_` + 22 characters; `isGateHandle()` checks one) and `getStatus()`. `answer` resolves a delegate's gate only; a `getStatus().pending_gate` marked as owner-only is the owner's to resolve. `chat` reads only the final message: it is the last message that is not an instruction message (system messages are skipped on all three doors, developer messages also on chat completions and Responses) and must be a user message with text only (at most 64 KiB); a final assistant message, or an image, audio or file part, is refused 400; earlier messages are not replayed and system prompts do not configure the Bot, which keeps its own conversation history. `streamEvents({ cursor?, signal?, fallback?, pollIntervalMs?, connectTimeoutMs? })` follows the Bot live over `GET /events`: an async iterable of `status`, `row`, `gap` and `archived` events that reconnects by itself, retrying until stopped (unlike the calls, it keeps retrying; it throws on a refusal that retrying cannot fix, such as a missing or invalid key, a paused key or a turned-off Bot, and on a rate limit whose `Retry-After` is longer than the retry delay cap, 30 s by default), and resumes from `stream.getCursor()` (pass it back as `cursor` to go on later; a gap or archive can move it back); where a Bot URL has no event stream yet it polls instead (`stream.getMode()` says which; `fallback: 'none'` throws): `getStatus()` every `pollIntervalMs` (default 15 s), and `listUpdates()` only on the first poll, after a status change, and while pages are left unread (rows that arrive without a status change wait for its next change); that is about 4 requests a minute while nothing happens, each `listUpdates()` page adds one, and polling never yields `gap` or `archived`. `break` ends it quietly; aborting `signal` ends it with an `AbortError`. Everyone with a key shares one conversation with the Bot.
- The key is sent only as `Authorization: Bearer`; a URL with a query, a fragment or a non-root path is refused, and the client's string and JSON forms leave the key out. Errors and diagnostics the SDK makes contain no authentication material, and abort reasons are not propagated (a cancelled call throws a fresh `AbortError`); content the Bot returns on success passes through unchanged. An exception your `onText` callback throws comes back to you unchanged, as does an SDK error you changed yourself: both are your own objects. A fixed public word in an error (a cause name such as `TypeError`) can happen to match a piece of a key; that is public vocabulary, not the key.
- Failures throw `BotUrlError` with `code` (the lower-case public code, read from the error envelope or from the text of an MCP tool-result error, which arrives as HTTP 200 (its `X-Hoody-Error-Code` header holds the same code, but the client reads the text); or a code the client makes itself without such an answer: `network_error`, `stream_idle`, `stream_interrupted`, `outcome_unknown`, `protocol_error`), `status`, `retryable`, `retryAfterMs` (429 only) and `requestId` (the `X-Request-Id` the owner finds in the access log, kept only in its 32-hex form). `message` is the fixed public text for the code plus the HTTP status, never the server's own words. `BOT_URL_ERRORS` lists the codes; a code outside it is never passed on (an MCP refusal without one is `tool_error`, an HTTP one `http_<status>`). Automatic retries cover a retryable failure while a request opens or its JSON or MCP tool answer is read, in HTTP answers and MCP tool refusals alike, within the client's `retry` limits (by default 8 tries, waits of at most 30 s, and no retry starting more than 120 s after the call began). A 429 waits its `Retry-After`; one longer than the wait limit is not waited but thrown with `retryAfterMs` set. `bot_starting` (503, no `Retry-After`), the other retryable codes and a 429 without `Retry-After` back off about 1 s, 2 s, 4 s … (doubling, with jitter). Once a streamed `chat` has opened it is never retried: a stream failure or error frame goes to you, even one marked `retryable` before any text. A text `ask`, an `answer` and a `chat` with `idempotencyKey: false` carry no replay key, so they are sent again only after a refusal that comes before the Bot acts (a 429, `bot_starting`, `bot_unavailable`); when their answer is lost after the request may have reached the Bot (a broken connection, an unreadable or unusable answer, a timeout or upstream failure, and for an unkeyed streamed `chat` any stream failure or error frame other than those refusals before the first text) they throw `outcome_unknown` (not retryable): read `getStatus()` or `listUpdates()` before sending again. Reads and `ask({ ref })` are retried as above. A stream that already gave text is never retried: a broken connection or unreadable stream after text is `stream_interrupted`, and an explicit error frame after text keeps its registry code with `retryable: false`.
- `isValidBotLabel(label)` checks the label rule (8 to 48 bytes of `a-z`, `0-9` and single hyphens, starting with a letter and ending with a letter or digit) on the input as given; `botLabelOfUrl(url, { zone })` returns the label of a Bot URL or `undefined`, and `botUrlZones(platform)` lists the zones accepted without `zone`.

---

## Subskill index

- [`agent`](https://hoody.com/SKILLS/SKILL-SDK/agent.md) — In-computer AI coding agent over HTTP
- [`api`](https://hoody.com/SKILLS/SKILL-SDK/api.md) — Platform control plane: identity, projects, computers, billing, vault
- [`browser`](https://hoody.com/SKILLS/SKILL-SDK/browser.md) — Per-computer Chromium or Firefox instances, one per slot
- [`code`](https://hoody.com/SKILLS/SKILL-SDK/code.md) — VS Code in the browser, per computer
- [`cron`](https://hoody.com/SKILLS/SKILL-SDK/cron.md) — managed crontab entries per system user
- [`curl`](https://hoody.com/SKILLS/SKILL-SDK/curl.md) — full HTTP client gateway + REST-as-GET-URL bridge
- [`daemon`](https://hoody.com/SKILLS/SKILL-SDK/daemon.md) — supervisord program lifecycle (start any program; logs kept)
- [`display`](https://hoody.com/SKILLS/SKILL-SDK/display.md) — programmatic GUI desktops with screenshots, input, and windows
- [`egress`](https://hoody.com/SKILLS/SKILL-SDK/egress.md) — the computer's outbound HTTP proxy
- [`exec`](https://hoody.com/SKILLS/SKILL-SDK/exec.md) — micro-services: any script or API as an instant HTTP endpoint
- [`files`](https://hoody.com/SKILLS/SKILL-SDK/files.md) — computer filesystem over HTTP, with automatic Git-like change history
- [`notes`](https://hoody.com/SKILLS/SKILL-SDK/notes.md) — Collaborative notebooks, hierarchical nodes, documents, databases
- [`notifications`](https://hoody.com/SKILLS/SKILL-SDK/notifications.md) — Trigger and consume desktop notifications inside a computer
- [`pipe`](https://hoody.com/SKILLS/SKILL-SDK/pipe.md) — Zero-storage streaming HTTP transfers
- [`proxyLogs`](https://hoody.com/SKILLS/SKILL-SDK/proxyLogs.md) — Per-computer request/response/event log query, stats, and SSE tail
- [`run`](https://hoody.com/SKILLS/SKILL-SDK/run.md) — resolve apps to shell commands
- [`sqlite`](https://hoody.com/SKILLS/SKILL-SDK/sqlite.md) — SQLite HTTP API
- [`terminal`](https://hoody.com/SKILLS/SKILL-SDK/terminal.md) — Persistent multiplayer PTY sessions over HTTP and WebSocket
- [`tunnel`](https://hoody.com/SKILLS/SKILL-SDK/tunnel.md) — reverse tunnels for HTTP/WS/TCP via computer relay
- [`vm`](https://hoody.com/SKILLS/SKILL-SDK/vm.md) — virtual machines inside a computer: lifecycle, media, snapshots
- [`watch`](https://hoody.com/SKILLS/SKILL-SDK/watch.md) — Linux inotify file-change streams with replay history
