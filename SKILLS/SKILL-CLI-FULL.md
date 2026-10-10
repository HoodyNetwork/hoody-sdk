> _**CLI skill (FULL: basic + all 21 namespaces)** · ~214,206 tokens · hoody-sdk v1.0.0-beta.17_

# CLI mode — `hoody` command

**Online? Use HTTP, not this CLI** (`SKILL-HTTP.md`): in a web chat (ChatGPT, claude.ai, …) or a throwaway sandbox that is not a Hoody container or the user's own computer, `hoody` is not installed, a login made there does not last, and it is not the user's machine. Check `command -v hoody`; if it is missing, use HTTP rather than installing it.

Covers a mapped subset of the SDK / HTTP surface (somewhat fewer CLI operations than SDK methods) — not a 1:1 mirror. Command names sometimes differ from SDK accessors (e.g. `hoody files get` for the SDK's `files.get`), a few kits carry commands of their own shape (`pipe`, `tunnel`), and SDK-only helpers (`listAll` / `listIterator`) have no CLI form. For the exact command for a given operation, consult the `SKILL-CLI/<ns>.md` per-namespace pages.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud containers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A container is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...containers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + container plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.containers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit URL is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service, kept warm by the kit; **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST/PUT?** Use `curl` — `hoody curl run --url <target> --method POST [...]` drives the curl kit; over HTTP the kit can turn any REST call into a single GET-able link for browser-only callers, restricted webhooks, agents with web-fetch-only access (the CLI and SDK send the POST form). See `curl` namespace.

**Stuck, or unsure how to do something?** Ask Hoody's public docs assistant — an unauthenticated MCP endpoint at `https://chatbot.hoody.com/mcp` (one tool, `search_hoody_docs`; or the `POST /api/chat` SSE fallback) answers any "how do I…" with cited doc URLs. Use it for discovery when you're not sure which namespace fits.

## When to choose CLI

Agents that need a single-binary surface: `-o table|json` dense; pipe `jq`; streams via `-o ndjson`.

## Getting a `hoody` CLI

### Already installed?

```bash
hoody --version       # if this works, skip to "Login"
```

### Zero-install — public SSH bridge

`ssh hoody.com` opens an in-memory shell with the CLI already on `$PATH` — nothing to install, runs anywhere `ssh` works (CI, locked-down boxes, etc.). Two modes:

```bash
ssh hoody.com                  # interactive — prompts for username + password
ssh <YOUR_AUTH_TOKEN>@hoody.com  # scripted — token-as-username, no prompt
```

Inside the SSH session: `hoody --help`, `hoody login`, `hoody projects list`, etc. — exactly the same binary as a local install. Sessions are RAM-only (no disk record); short-lived connection metadata is kept solely for anti-DDoS.

### One-shot run via npx (no install)

```bash
npx hoody-sdk                           # also: bunx, pnpm dlx, yarn dlx
```

### Install — Linux / macOS

```bash
curl -fsSL https://install.hoody.com | sh
```

### Install — Windows (PowerShell)

```powershell
iwr https://install.hoody.com/install.ps1 -UseB | iex
```

### Other install paths

- `https://cli.hoody.com/` — landing with all install variants + source build.
- `https://install.hoody.com/` — pre-signed binaries (Linux/macOS/Windows, x64/arm64).
- `https://sdk.hoody.com/` — TypeScript/JS SDK, when you'd rather script than CLI.

After install: `hoody update` reports whether a newer release exists. With a configured update domain the manifest is minisign-verified; with none (the npm and install-script default) the version comes from npm/GitHub and no signature is checked.

## Login

```bash
hoody login --web --no-browser   # browser sign-in: prints a link + code for the user, polls, saves the session
```

Browser sign-in is the default when a person is present: give the user the printed link and code; they sign in and approve on Hoody's page, and the CLI saves the session. If your shell tool shows output only after a command exits, run it in the background and read the link from its output. Never ask for the user's password in chat. The password flags below are for a user who signs in from their own terminal:

```bash
hoody login --username alex --password "$HOODY_PASSWORD"
```

- `--username` (`-u`) is the primary login flag; the CLI accepts `--email` as an alternative for email-based login. The server enforces the alphanumeric/underscore/hyphen pattern, so a malformed value fails at the request.
- `--password` takes an optional value: a bare `-p` prompts for it securely. In a terminal, `hoody login` with no flags opens a menu (password, browser, or token). Without a terminal (a script, `-o json`, `--non-interactive`) it needs an identifier AND a password, supplied through flags, `--password-stdin` or environment variables: a missing identifier comes from `HOODY_USERNAME`/`HOODY_USER` (a value containing `@` is sent as `email`), a missing password from `HOODY_PASSWORD`/`HOODY_PASS`. Without both it stops with `Missing credentials.`. Token cached at `~/.hoody/config.json`.
- Base URL: the CLI targets `https://api.hoody.com` by default. Override it with `--base-url <url>` (CLI flag is kebab-case), the `HOODY_BASE_URL` environment variable, or `hoody config set baseUrl <url>` (config key is camelCase); `hoody config get --resolved` prints the effective settings.

## Config and profiles

`hoody config set|get <key>` writes `~/.hoody/config.json`. `--profile <name>` switches account; each has own token, base-url, default container.

## Auth modes

Priority: `--token`/`-t` > `HOODY_TOKEN` > stored session. Kit-service routing uses the per-container capability URL.

## Container scope — `--container`/`-c` (REQUIRED for kit commands)

Every command that targets a container kit (`hoody browser|code|cron|curl|daemon|display|exec|files|notes|notifications|pipe|db|kv|terminal|tunnel|watch …`; `db` (short form `sql`) is the sqlite kit's SQL group, and `kv` is its key-value group; `logs` is a kit URL slug only and has no CLI command group; tail logs via `proxy logs` / `exec logs` / `daemon programs logs`) needs a container id. (`hoody agent` IS a kit command group whose *bare* form opens the in-container Agent TUI; `hoody agent prompt …` and the generated `agent sessions|models|…` subcommands live under it.) Resolution order:

1. `--container <id>` / `-c <id>` (global flag, before the subcommand)
2. `HOODY_CONTAINER` env var
3. Per-profile sticky default via `hoody local defaults set container <id>` (recommended; `local defaults` covers the curated user-facing keys `container`/`realm`/`output`/`noColor`/`quiet`). `hoody config set container <id>` writes the same setting.

A container id is the 24-hex id from `hoody containers list` (the CLI rejects anything else).

```bash
CONTAINER_ID=$(hoody containers list -o json | jq -r '.containers[0].id')
hoody --container "$CONTAINER_ID" files get /home/user       # inline
HOODY_CONTAINER="$CONTAINER_ID" hoody files get /home/user   # env
hoody local defaults set container "$CONTAINER_ID"           # sticky; then plain `hoody files get /home/user`
```

Account-level commands (`hoody login`, `hoody projects`, `hoody wallet`, `hoody auth`, `hoody vault`, `hoody containers list`, etc.) hit the control-plane API and ignore `--container`. Control-plane commands that act on ONE container read it from `--container` and require it, e.g. `hoody containers env …`, `hoody snapshots …`, `hoody firewall …`, `hoody network …`, `hoody storage …`. Check `--help` for a `Requires: --container` line.

## Output formats

`--output`/`-o`. Default `table` (requests), `ndjson` (streams).

| Fmt | For |
|---|---|
|`table`|default|
|`json`|`jq`|
|`yaml`|structured|
|`wide`|extra cols|
|`raw`|unwrapped body|
|`ndjson`|streams (auto SSE)|
|`pretty`|stream variant|

## Convenience aliases

- `chat`, `login`, `signup`, `logout`, `config`, `local`, `update`
- `shell` (the one-shot command is positional: `hoody shell <cid> -- uname -a`; there is no `--command` flag)
- `open` (kit UI); `screenshot` (kit capture); `desktop open`; `kits list`

## Index of common ops

§ Core operations covers: login/2FA, projects, containers, exec, files, screenshots, sqlite, watch, snapshots, vault, wallet. Per-namespace deep dives: `SKILL-CLI/<ns>.md`. URL routing → § Proxy URLs. Auth → § Auth model.

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
| `kit_slug` | Kit id (see Kit slug table); some namespaces differ from their slug (e.g. `notifications` → `n`, `proxyLogs` → `logs`). |
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

The point: **don't make people leave their chat.** When someone hits a bug, drop a `code-N` URL with `?extension=<publisher>.<name>` (focuses Cline / Continue) or a `terminal-N` URL into the thread — others can read, type, kibitz, take over, all without context-switching to a new tab. The container's filesystem is shared across every embed (same kit URL = same shell), so collaborators land on the *same* state.

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
> - Watch **`proxyLogs`** for unexpected callers; if a URL leaks, disable its alias with `hoody proxy aliases disable <aliasId>` (not instant: it usually stops serving within about 30 seconds and can take longer).
> - For untrusted reviewers (customers, support tickets, public demos): do not hand out a `display` kit URL as a "read-only" view — its readonly setting is client-side only, and anyone holding the URL can still call the display's input API (clicks, typing). Build a constrained `exec` script that exposes only the operation they need, such as serving a captured screenshot.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP via `hoody containers proxy *` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `hoody proxy aliases create --container-id <container_id> --program '<kit>'` to ship a brandable hostname (`https://repo-acme.{N}.containers.hoody.com`) into the iframe instead of leaking the `{containerId}`.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace.
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- Several API kits also serve a browser UI on their kit URL: `cron` (crontab manager) and `watch` at `/`, the `sqlite` studio at `/`, and the `pipe` send / receive / share pages — check a kit's own UI (and its embed views) before building a custom dashboard. `curl` renders no UI, and `http-<port>` shows whatever your app serves.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## Source IP Guard — every call goes through the kit URL

Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. A request that does not come through the program's URL gets 403. Call kits through the edge proxy on HTTPS, so the proxy's permissions, logging and hooks apply to every call.

Why uniform proxy routing:

- **Security uniformity** — requests from inside containers go through the same `hoody containers proxy *` checks and `hoody proxy logs *` capture as external requests, whether they came from across the internet or from a script in the next process. `hoody containers proxy *` MITM rules apply the same way, but only to services that accept hooks: `logs`, `egress` and `cdp` reject hook operations with `404`.
- **One mental model** — same URL works from your laptop, from another container, from inside the container itself. You write the same code; the proxy is transparent.
- **Cost is negligible** — the proxy hop adds microseconds, not a network round-trip.

Practical consequence: from inside a container, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.containers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this.

### Container ↔ container — anyone reaches anyone (with permissions)

Because routing is uniform, **a process in container X can call any kit on container Y just by hitting Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in container X reads / writes files in container Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.containers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three containers, three kit URLs, one transparent network.
- A monitoring container scrapes `/metrics` from every container in a project's fleet by listing them via `GET /api/v1/projects/{id}/containers` (HTTP only; no CLI command) and hitting each one's kit URL.

Cross-container access still goes through the gate stack — Y's `hoody containers proxy *` rules apply to whoever's calling, no matter where they're calling from. So:

- **By default** (no gates set), Y's URL is a capability — anyone with the URL has access. Within your account that's usually fine; for production / shared / multi-tenant fleets you SHOULD gate.
- **With a gate set** (§ How to gate — an auth group alone is not a gate), X must satisfy it. A Token gate (`hoody containers proxy groups token set`) is a static shared secret: you choose where it is read (one header, cookie or query parameter) and the exact value it must equal, and X sends that value on every call to Y. It does not check Hoody auth tokens or realms — an `hdy_…` token passes only if it is literally the configured value. A JWT gate (`hoody containers proxy groups jwt set`) verifies a signed JWT instead; by default a valid token in any of its configured sources counts. For a cookie, use a `__Host-` name set by the address it protects.

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

A group on its own restricts nothing. It grants only the programs you give it access to, and a document the API creates for you starts at `default: 'allow'`, so everyone who matches no group still gets in. A working gate takes three calls: define the group (`hoody containers proxy groups password set`, `hoody containers proxy groups token set`, `hoody containers proxy groups jwt set` or `hoody containers proxy groups ip set`), give it access to each program it should reach (`hoody containers proxy groups permissions set` with `{ program, access: true }`), and set `hoody containers proxy default set` to `{ default: 'deny' }`. Every one of these writes is versioned: send the document's current `file_version` as `If-Match: file:v<N>` (`file:v0` while the document has none), which the CLI takes as the required `--if-match file:v<N>`. A missing header is refused with `428` and a stale one with `412`. Each call returns the updated document, so take the next call's version from it. The one partial exception: a password group with an access rule for a program answers a caller without credentials with a `401` challenge for that program even under `default: 'allow'`.

| Gate | Accessor | Caller behavior |
|---|---|---|
| Password | `hoody containers proxy groups password set` | Browser / `curl -u user:pass` — HTTP Basic. |
| Token | `hoody containers proxy groups token set` | The header, cookie or query parameter you configured must carry exactly the value you configured (a static shared secret). Name a cookie with the `__Host-` prefix. |
| JWT | `hoody containers proxy groups jwt set` | Verifies issuer / audience signed JWT. |
| IP | `hoody containers proxy groups ip set` | Source IP must match a CIDR. |

`disable` sets `enable_proxy` to `false` (`enable` sets it back to `true`), which is a kill-switch for the whole proxy, not a gate toggle: while it is `false` every request that reaches the permission layer is refused with `403` before groups or `default` are evaluated, and the configured groups are kept. It never opens access. (A project-level `false` does not apply to a container whose own document sets `enable_proxy: true` — use the container-level call to cut one container reliably.)

Defense in depth: gate the kit URL AND scope any auth-token bearer (realms, IP allowlist) AND keep a short TTL on JWTs. A leaked auth-token is recoverable; a leaked-and-public kit URL is not.

## Kit slug table — every namespace's public URL

Throughout: `{P}` = `projectId` (24-hex), `{C}` = `containerId` (24-hex), `{N}` = `server_name` (e.g. `node-example-1`). All URLs route through `*.containers.hoody.com`.

The middle column includes the instance index. For `{kit_slug}` in the URL formula, use the bare slug, such as `n`, `logs` or `watch`.

| Namespace | Host service segment (kit slug plus instance index) | Public URL (single-instance form) |
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
| Watch (file-events) | `https://65f1...c8a-65f2...41e-watch-1.node-example-1.containers.hoody.com/api/v1/watch/watchers/...` |
| Coding agent HTTP API | `https://65f1...c8a-65f2...41e-agent-1.node-example-1.containers.hoody.com/api/v1/agent/...` |
| Hoody Agent GUI (for humans) | `https://65f1...c8a-65f2...41e-agent-1.node-example-1.containers.hoody.com/` |
| User HTTP server on `:8080` | `https://65f1...c8a-65f2...41e-http-8080.node-example-1.containers.hoody.com/` |

### Conventions

- `code` and `display` are multi-instance — append a numeric instance: `-code-1`, `-code-2`, `-display-1`, `-display-7`.
- `terminal` packs the terminal **session** id into the instance index (`terminal-3` = session 3). The proxy sets `?terminal_id=` from that hostname index and overwrites any value you send, so the hostname is authoritative: to act on session N (`/execute`, `/paste`, `/press`, `/raw`), call the `terminal-N` host. `terminal-0` is the "no session" host — use it with `?ephemeral=true` so the kit allocates a fresh session instead of reusing session 1.
- `display`/`terminal` pairing depends on how the session is created. A session started through a `terminal-N` URL gets `DISPLAY=:N` automatically (the proxy injects `display=N` with `terminal_id=N`; an ephemeral session drops it). A session created with a JSON `/create` body gets `DISPLAY=:N` only when the body sends `display: ':N'`. Use the same number for both by convention — `terminal_id` N, `display` `:N`, then the `display-N` kit URL shows what that session draws.
- `exec` serves each script at a **path** on the exec host: a file `hello.js` is reachable at `https://{P}-{C}-exec-1.{N}.containers.hoody.com/hello` (the `.js`/`.ts` extension is stripped; the path keeps the file name's case, so `MyTool.ts` is served at `/MyTool`, not `/mytool`). A script placed under a subdirectory `scripts/{sub}/` is ALSO reachable at the `{sub}.` **subdomain** (`{sub}.{P}-{C}-exec-1.{N}…`) — the subdomain maps to that directory, NOT to a flat top-level filename.
- `notifications` ↔ `display-{n}`: the notification kit pairs with display N at host segment `n-N`.
- `hoody proxy aliases create` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. Full valid program set is enumerated in the §Proxy aliases table below — note `logs` for the proxy-logs kit (not `proxy` or `proxyLogs`) and `run` (not `app`).

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

To compose a kit URL by hand, read `project_id`, `id` and `server_name` from `hoody containers get` and fill in the patterns above.

## SSH access — shell through the host-side SSH proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `sftp`, `git push` over SSH), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{containerId}-ssh.{node}.containers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). The connection ends at a host-side SSH proxy, not at a server inside the container: the proxy looks up your public key, finds the one container that key is registered to, and runs the shell, SFTP or SCP session in that container through the host. No `sshd` runs in the container. Port forwarding (`ssh -L`, `ssh -R`) is disabled.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `hoody containers create` / `hoody containers update` / `hoody containers copy`. The key is registered with the host-side SSH proxy, not written to an `authorized_keys` file in the container. Password auth is disabled.

**The public key MUST be unique across containers — one container per key**, because the key alone selects the container. Reusing a key that another container already holds returns `409` with a message saying the key is already in use. Generate a fresh keypair per container; you can rotate via `hoody containers update` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; the same shell the kit's `terminal` namespace would give you. Anything inside the container is yours.

### IP filtering

The SSH endpoint is reachable from any IP; the registered key is the access control. SSH sessions reach the container through the host-side proxy and the host, not through the container's network interface, so container firewall rules (`hoody firewall *` ingress rules) and in-container `iptables` / `nftables` rules do not filter them. To cut off a key, replace it with `hoody containers update` (new `ssh_public_key`). For kit URLs, restrict source IPs with `hoody containers proxy groups ip set`.

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

Defaults when port omitted: `http` ⇒ port 80, `https` ⇒ port 443. Port range `1..65535`. Capability-token rules still apply — gate the URL via `hoody containers proxy *` if you don't want it open.

## Friendly aliases — `<alias>.{N}.containers.hoody.com`

A **proxy alias** is a custom hostname that points at one specific program inside a container, without revealing the `projectId` / `containerId`. Same capability-token semantics — alias URL on its own is the credential — but the URL is shareable, brandable, and hides the container plumbing.

### Why use them

- **Hide `containerId`**: shipping `https://my-api.{N}.containers.hoody.com` is fine; shipping `https://65f1...c8a-65f2...41e-http-8080.{node}.containers.hoody.com` leaks the container identifier (which IS the credential of last resort).
- **Brandable**: short, memorable, copy-pasteable.
- **Retargetable within its container**: an update can change the alias's program, port, instance index or landing path while the public URL stays the same. It cannot move the alias to another container (the update takes no `container_id`); for a new container, delete the alias and create it there.
- **Same gate stack**: layer Password / Token / JWT / IP via `proxy.containerPermissions` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`hoody proxy aliases create --container-id <container_id> --program <program> [--alias <alias>] [--index <index>] [--target-path <target_path>] [--allow-path-override] [--expires-at <expires_at>] [--enabled]`

| Field | Notes |
|---|---|
| `container_id` | 24-char hex id of the target container — required. |
| `alias` | 3-61 chars, lowercase alphanumeric **plus hyphens** (`a-z0-9-`, no leading/trailing hyphen). Becomes `<alias>.{N}.containers.hoody.com`. Two independent uniqueness rules, either of which answers `409 ALIAS_IN_USE`: the name must be free on the container's physical server (across every tenant there), AND your own account may hold a given name only once across all servers. |
| `program` | Which kit/protocol to route to. Valid names, protocols first and then programs, with accepted aliases in parentheses: `http`, `https`, `ssh`, `terminal` (`tty`, `ttyd`, `t`), `display` (`d`), `desktop`, `cron`, `watch` (`w`), `notifications` (`notification`, `n`), `files` (`f`), `daemon`, `code`, `agent`, `exec` (`e`), `browser` (`b`), `cdp`, `curl`, `run`, `sqlite`, `logs` (`log`, `l`), `egress`, `pipe`, `notes` (`note`), `tunnel`, `bot`. Use only these names; `cli`, `proxy` and `proxyLogs`, for example, are refused with `400 Unknown program name`. The proxy-logs kit is `logs` (NOT `proxy` or `proxyLogs`), and `run` is NOT `app`. **`'web'` is rejected — for `hoody_kit` runners use `program: 'exec'`**. |
| `index` | For a built-in program, the instance to route to (`terminal_id` for `terminal`, display number for `display`); defaults to `1`. For `http`/`https` it is the target port and has **no default**: give the port in `port` (preferred; it wins over `index` and over a port in the program name), as `http-<port>` (e.g. `http-8080`), or in `index`; with none of the three the create is refused with `400 PORT_REQUIRED`. |
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

- `hoody proxy aliases disable <aliasId>` disables the alias without releasing the slot — useful to revoke a leaked URL while you investigate. Disable, enable, update and delete are not instant: they usually reach the alias URL within about 30 seconds and can take longer, and until then the alias keeps its previous behavior.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409 ALIAS_IN_USE` under either rule: the name is already taken on that physical server (by any tenant), or your account already holds the same name on any server.
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface. Show it in UI as `subserver_name ?? server_name`, but never substitute it into a kit URL.
- **After `hoody containers create`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `containerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full container access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — browser sign-in (§ Login) or `hoody login`. Access token lives `1d`, refresh token `7d`, by default; a deployment may shorten either, so treat both as values to read from the response rather than constants. The interactive, short-lived credential.
2. **Auth token** — `hoody auth tokens create`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, rotatable. Long-lived headless credential.
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

**Sign the user in through their own browser.** This is the default whenever a person is present. They type their password, use GitHub or Google, and pass two-factor on Hoody's page; you never see a password, and nobody pastes a token into chat. No account yet? Send them to `https://api.hoody.com/auth/signup` to sign up and verify their email in the browser, then start here.

1. **Start.** `POST https://api.hoody.com/api/v1/auth/device/code` with JSON `{"client_name":"<your name>","client":"agent"}`. No bearer token. `data` holds `device_code` (keep it private), `user_code`, `verification_uri`, `verification_uri_complete`, `interval` (seconds, 5) and `expires_in` (seconds, 900); use the returned values.
2. **Hand over the link.** Give the user `data.verification_uri_complete` and the `data.user_code`: "Open this link, check that the page shows code `<user_code>`, sign in and approve. If you did not ask me to sign you in, choose *Don't authorize this device*." The page shows your `client_name` and marks it as unverified, so name yourself plainly.
3. **Poll.** `POST https://api.hoody.com/api/v1/auth/device/token` with `{"device_code":"…"}`, one request every `interval` seconds, until `expires_in` runs out. The waiting states are answers, not failures: HTTP 400 with the state in **`data.error`**, not a top-level `error`:
   - `authorization_pending`: keep polling.
   - `slow_down`: polled too soon; add 5 seconds to the interval.
   - `access_denied`: stop. The user refused (or a PKCE verifier was missing or wrong).
   - `expired_token`: stop; the code expired or was already redeemed. Offer a fresh link.
   - HTTP `429`: wait `Retry-After`, then continue. HTTP `404`: browser sign-in is not enabled on this deployment.
4. **Signed in.** HTTP 200 returns the same session as a password login: `data.token` (send as `Authorization: Bearer`), `data.refreshToken`, `data.expires_in`. Keep both tokens for this session only: never repeat them in chat, log them or write them to a file yourself (the `hoody` CLI keeps its own session in `~/.hoody/config.json`, and `hoody logout` clears it). The code redeems once; if that response is lost, start a new sign-in.

Optional PKCE: make a random `code_verifier` of 43–128 characters from `A-Z a-z 0-9 _ -`, send `code_challenge` = unpadded base64url of its SHA-256 when you start, and the `code_verifier` with every poll.

`hoody login --web --no-browser` runs these steps for you: it prints the page and the code, polls until the user approves (up to 15 minutes), and saves the session to `~/.hoody/config.json`. Give the user the printed link and code. If your shell tool shows output only once a command exits, run it in the background, `(hoody login --web --no-browser; echo "exit=$?") > hoody-login.log 2>&1 &`, read the link and code from that file, and check it again later: sign-in is done when its last line is `exit=0`.

Use a long-lived auth token (§ Storing auth tokens) only when the user asks for unattended automation; never mint one just to finish sign-in.

### Password login (fallback)

Only when the user chooses it, or browser sign-in answers `404`. The user runs it themselves; do not ask for their password in chat.

- `username` OR `email` + `password`.
- Response: `data.token` (not `accessToken`), `data.refreshToken`, `data.expires_in`.
- 2FA: returns `requires_2fa`, `temp_token` (5-min); exchange at `POST /api/v1/users/auth/2fa/verify`.
- Email signup → username `<localpart>-<4hex>`. Characters outside `a-z`, `A-Z`, `0-9`, `_` and `-` are removed from the local part, and a reserved local part is replaced by a neutral name.

## Kit URLs as credentials

Bearer by default. Add password, token, JWT or IP auth groups in the container's or project's proxy permissions. Groups are alternatives (a request satisfying any one gets that group's permissions; unmatched requests fall to the `default` policy), not stacked layers. A group alone restricts nothing: give it access to the intended programs and set the default policy to `deny`, because a new permission document starts at `default: 'allow'`. Disabling the proxy (`enable_proxy`) is a kill-switch that cuts it entirely. See § Proxy URLs for the operations and the required version headers.

### Container claim — optional portable credential

Every built-in kit — **including `agent`** — accepts the bare per-container kit URL (the URL is the bearer). The `bot` kit's management routes ask for no account token either: they admit any request that reaches them, so on a container without proxy permissions anyone holding its bot URL can register, start, stop and delete bots. There is **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` handshake and no `401 CLAIM_REQUIRED` on the built-in kits; the `agent` kit behaves exactly like the others here.

Separately, `hoody containers claims create -c <id>` mints a signed, portable **container claim** — `data: { container_claim: { kid, payload_b64, signature_hex }, expires_in, container_id, project_id }`. It is an *optional* credential for a program **you** run inside a container to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

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

Pass `realm_ids: ['<24-hex>']` when creating the container — and an array of multiple realm IDs is fine if a container needs to be visible in several. Container realm membership is **independent of project realm membership** (a project in realm A can hold a container in realms A+B). Read it back from the `realm_ids` field returned by `hoody containers get`.

### Auth tokens × realms

Mint a realm-scoped token via `hoody auth tokens create --realm-ids <realm_ids>`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL"). Add / drop realms post-mint with `hoody auth tokens realms add` / `hoody auth tokens realms remove`. Globally-scoped tokens (no `realm_ids`) can still target a specific realm by using the realm subdomain, or the `realm_id` query parameter on the routes that take one.

### Best practice — one realm + one token per project

This is for unattended automation the user asked for, or for handing a scoped credential to another program. For interactive work with the user present, keep the browser sign-in session and select the realm with its realm URL.

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `hoody realms list`.
2. `hoody auth tokens create` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `hoody projects create` with `realm_ids: [realm_id]` — pin the project to the realm.
4. `hoody containers create` with `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the container too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Set the token in `HOODY_TOKEN` and the realm in `HOODY_REALM` (or use the `--realm` flag) so every call goes to the right scope.

Result: that token can only see projects, containers, tokens, and vault entries in the realm. An agent given just this token cannot touch your other realms through the API — even if it's the same Hoody account. Kit URLs it already knows stay reachable; they answer to their own gates, not to the token.

## Storing auth tokens

Mint an `hdy_…` token only when the user asks for unattended automation; the session from browser sign-in is not one, so don't save it yourself. The token from `hoody auth tokens create` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the container. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `hoody vault set <key> --value 'hdy_…'`. Stored server-side as sent — Hoody does not encrypt the value for you — and readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `hoody vault set`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND the `resources.vault` permission granted to it. JWT-as-owner bypasses both. See `hoody vault set` / `hoody vault get` / `hoody vault list` / `hoody vault delete` / `hoody vault clear`.

## Token revocation

- `hoody logout --all` — for a JWT this is a **logout-everywhere**: every access and refresh token minted before the call stops working, on every device, not just the one that called it. Auth tokens are unaffected.
- `hoody auth refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. The CLI handles both places for you: `hoody auth refresh` takes `--refresh-token`, or falls back to the refresh token saved by the last `hoody login` / `hoody auth refresh`, sends it in the body and as the bearer, and saves the new tokens (`--no-save` skips that). With no saved refresh token, pass `--refresh-token` or run `hoody login` again. For unattended automation the user asked for, a long-lived `hoody auth tokens create` token avoids refresh handling.
- `hoody auth tokens delete` / disable / IP-restrict — effective next request.

## 2FA

`hoody auth 2fa setup start` returns `data: { qr_code, manual_entry_key, backup_codes }` inside the usual `{ statusCode, message, data }` envelope; `hoody auth 2fa setup confirm` enables. Backup codes rotatable, one-time, hashed. `hoody auth 2fa gate enable` on → sensitive auth-token mutations need TOTP+JWT.

---

# Pre-installed tools — what every container ships with

Every Hoody container starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Containers run real systemd as PID 1 with root inside the container** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides and socket activation work as on a normal distro. Containers share the host kernel, so container root cannot load kernel modules. Two tiers of pre-installed software:

1. **Default tier** — installed when the container's resolved `hoody_kit` setting is true. Left out of `hoody containers create`, it is true for a login (JWT) caller; for an auth-token caller it follows the token's `containers.features.hoody_kit` permission, so it is false when the token lacks it. A container with `hoody_kit` false is not guaranteed to have these packages.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 26, Bun, Rust, Go, Nix, Docker, …). Pass it on `hoody containers create`, or the `--dev-kit` flag; when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `pip install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours.

## `kvm: true` — run full VMs inside the container

Containers on **rented / dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the container. Pass `kvm: true` on `hoody containers create`, or the `--kvm` flag, or toggle it later on a **stopped** container (`hoody containers kvm enable -c <container-id>` / `hoody containers kvm disable -c <container-id>`). Defaults to off. **Never available on free-tier servers** — the API refuses with `403`. `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every container response carries the current `kvm` boolean.

```bash
hoody containers create --project <project-id> --server-id <server-id> --name vm-host --kvm   # enable at creation
hoody containers kvm enable -c <container-id>    # enable on a stopped container
hoody containers kvm disable -c <container-id>   # disable
```

## `hoody` CLI is pre-installed inside every container

The `hoody` binary is on every container's `$PATH` (`/usr/bin/hoody`) for root, the default `user` account and any account that holds `user`'s group — from a shell session, an `exec` script, a `daemon` program, a cron entry or an SSH session running as one of them. Other uids cannot run it: the binary lives under `/hoody`, which only root and that group can enter; give such a uid its own install of the CLI.

```bash
hoody --version
hoody projects list
hoody --container "${HOODY_CONTAINER:-$HOODY_CONTAINER_ID}" files get /home/user
```

Inside the container, `$HOODY_CONTAINER_ID` is pre-populated by the kit (the CLI also accepts `$HOODY_CONTAINER` as a compatibility alias) so commands targeting "this container" can skip the `--container` flag. `$HOODY_TOKEN` is NOT auto-injected — set it via vault/secrets if container code needs to call the API. Login state is per-user under `~/.hoody/config.json`.

This is the same binary as `hoody` outside the container — every example in the CLI skill works inside a container's shell exactly as it would on a developer laptop.

## Default user — `user` (uid 1000) with passwordless sudo

Containers ship with a **non-root account named `user`** (uid 1000, gid 1000, member of `sudo`). Home is `/home/user`. **`/etc/sudoers.d/user` grants `user ALL=(ALL) NOPASSWD: ALL`** — passwordless `sudo` lets agents (and humans) escalate to root for any operation without prompting.

The Hoody Agent runs as `user` and its shell follows this setting: with the drop-in in place the agent can sudo; once the drop-in is removed (or narrowed to some commands) the agent's shell gets exactly what `user` gets without a password.

**Use `user` for everyday work, sudo when you actually need root.** Reasons:

- Files created under `user` are owned by uid 1000 — friendlier when you copy/sync them out of the container or back-stop with rsync.
- Many apps (npm, pip in venvs, Bun, Cargo, Go, Nix single-user, Docker rootless, browsers) write into `$HOME` and behave better when `$HOME` is a real user home, not `/root`.
- `journalctl --user`, `systemctl --user`, dbus user buses all hang off a regular user.

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `hoody daemon programs create --name my-app --command '…' --user user`, `hoody terminal sessions create --terminal-id 100 --user user --shell bash --cwd /home/user` (`terminal_id` may be omitted when the `terminal-N` host supplies it, or when `ephemeral: true` generates it. If you send a body id on a container-scoped client, set `serviceIndex` to that same id: a mismatch is refused with `400 TERMINAL_ID_MISMATCH`. The `terminal-0` host creates only ephemeral sessions). The generated `GET /{path}` (HTTP only; no CLI command) does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For containers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo rm /etc/sudoers.d/user                        # remove the drop-in
sudo passwd user                                   # set a real password
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `hoody containers proxy *` gates and ideally a non-root default user.

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

Set the flag on `hoody containers create` to additionally provision:

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

State is per-container: `hoody containers copy` clones the disk including everything you installed; `hoody snapshots create` saves a point-in-time you can later `hoody snapshots restore` to roll back to. There is no global "shared layer" leak — each container's filesystem is its own.

---

# CLI — Core operations

Use the `hoody` CLI only where it is already installed: a Hoody container, or the user's own computer. In a web chat (ChatGPT, claude.ai, …) or a throwaway code sandbox, use HTTP instead: the CLI isn't installed there, a login made there does not last, and it isn't the user's machine. Do not install it with npx or the install script; check with `command -v hoody`.

`hoody` recipes. Base URL: `https://api.hoody.com` by default; override with `--base-url <url>`, `HOODY_BASE_URL` or `hoody config set baseUrl <url>`. Scope: `-c <cid>` | `HOODY_CONTAINER` | `hoody local defaults set container <id>`.

---

### 1. Sign up
Default for a person: they sign up at `https://api.hoody.com/auth/signup` in their own browser, then sign in with `hoody login --web --no-browser` (§2). Never collect their password in chat. `hoody signup --email you@example.com --password "$HOODY_PASSWORD"` — signup, email verification and login in one command. On a TTY it waits for you to click the verification link and ends logged in; without a TTY it exits 0 after sending the verification email and you must run `hoody login` yourself once the link is clicked. Signup CLI flags are `--email --password [--region]` (no `--username`); username is auto-generated from the email local part. Password 12–128 chars and at most 72 UTF-8 bytes. The server needs **3 of 4** character classes (upper/lower/digit/symbol); the interactive prompt demands all four, so use all four. Resend: `hoody auth email verification send`.

### 2. Log in (+2FA)
`hoody login --web --no-browser` is browser sign-in: it prints a link and a code for the user, polls until they approve on Hoody's page, and saves the session (2FA happens in their browser). If your shell tool shows output only after a command exits, run it in the background and read the link from its output. Password path, for a user signing in from their own terminal: `hoody login --username alex --password "$HOODY_PASSWORD"` (or `--email you@example.com`). On a TTY a 2FA account is prompted for its code in the same run. Without a TTY the command saves nothing, prints the challenge and exits 2; finish with `hoody auth 2fa verify --temp-token <temp_token> --code 123456` using the printed temp token (`--code` also accepts a 10-character backup code). Login password ≥8 chars (signup is ≥12).

### 3. Base URL / profiles
Global flags: `--base-url <URL>`, `--profile <P>`. Persist with `hoody config set baseUrl <URL>` (camelCase key).

### 4. List projects
`hoody projects list [-o json]`

### 5. Create project
`hoody projects create --alias my-project --color '#10B981'`

### 6. List containers
`hoody c list [--realm-id <rid>] [-o wide]` (`c` is the registered alias for `containers`). There is no `--project` filter. One call fetches every page, up to 10,000 items or 1,000 requests (`--limit N` caps the total; past the bound the CLI says so on stderr, and `--limit 100 --page 101` continues), so filter the result with `hoody c list -o json | jq '.containers[] | select(.project_id=="<pid>")'` (the CLI's `-o json` unwraps the API envelope, so the top level is the `data` body — `.containers`, not `.data.items`). `--name <text>` keeps the containers whose name contains the text (case-insensitive). `hoody containers get <name>` also accepts an exact, case-sensitive name that matches exactly one container; a 24-hex value is always read as an id, and an ambiguous name, or a lookup that hit the bound, is refused, so pass the id then.

### 7. Create container
`hoody containers create --project <pid> --server-id <sid> --name box-1 --hoody-kit`. Flags `--project` and `--server-id` are required.
Servers: `hoody servers list`; `hoody servers marketplace list`. Rent with `hoody servers rent <id> --rental-days <days> --max-charge-cents <total-cents>`: pick a duration the server offers and read its first payment from `pricing.price_tiers[days].total_first_payment` (the ceiling covers any setup fee); only a zero-total rental may omit `--max-charge-cents`, otherwise the call answers `409 CHARGE_CONFIRMATION_REQUIRED`.
After the container is `running`, give the user the clickable URLs of its main kits (each opens its web UI): `hoody open terminal --url -c <cid>`, then the same with `notifications` (slug `n` in the URL), `desktop`, `browser`, `files` and `agent`. `--url` only prints; without it the command opens the page. See § 24.

### 8. Lifecycle — get/wait, start/stop/restart
```bash
hoody containers get <cid>
until [[ "$(hoody containers get <cid> -o json|jq -r .status)" == running ]];do sleep 2;done   # CLI -o json unwraps the envelope → .status (not .data.status)
hoody containers <op> <cid>   # op ∈ {start|stop|restart|pause|resume}; stop --force kills without a clean shutdown
```

### 9. One-off command
```bash
hoody shell <cid> -- ls -la /home/user   # the command is POSITIONAL — there is no --command flag
hoody shell <cid> -- tmux ls
hoody terminal commands run --command 'ls' --ephemeral   # --command exists only here
```

### 10. Long-lived terminal
```bash
hoody terminal sessions create --terminal-id 100 --shell bash
hoody terminal commands run --terminal-id 100 --command 'pwd' --wait
hoody terminal sessions read [--terminal-id 100]   # --terminal-id optional, defaults to "1"
hoody terminal sessions snapshot get --terminal-id 100       # required
hoody terminal sessions delete 100 -y                     # positional, not --terminal-id
```
Pin 1–39999; 40000+=ephemeral.

### 11. SSH
`hoody shell <cid>` is not an SSH client by default; pass `--ssh-host`/`--ssh-user` to bridge to a real SSH server.

### 12. Files — list, read, write
```bash
hoody files {get|stat} /home/user[/x]
hoody files get /home/user
hoody files stat /home/user/x
hoody files get /home/user/x --out-file /tmp/x   # byte for byte, text or binary
hoody files copy /home/user/x --copy-to /home/user/y
hoody files move /home/user/y --move-to /home/user/z
hoody files delete /home/user/z -y
hoody files upload /home/user/x --input /tmp/local.bin   # or pipe: cat f | hoody files upload /home/user/x
hoody files chunks write /home/user/x --input /tmp/more.bin   # appends raw bytes to an EXISTING file; `files upload --append` creates a missing one
```

### 13. Browser screenshot
`hoody browser screenshots capture --browser-id 1 --url https://example.com --format png --out-file /tmp/p.png`. The CLI uses `--browser-id` to pick the instance's `browser-N` host (the server itself does not read it); without it the CLI targets instance 1. Without `--out-file` the image bytes go to stdout as received (a terminal refuses them; redirect or pipe).

### 14. Display capture
```bash
hoody display screenshots capture --out-file /tmp/d.png      # take one now; or > /tmp/d.png: PNG bytes on stdout
hoody display screenshots latest get --out-file /tmp/d.png   # the most recent one already taken
# `hoody display thumbnails capture` / `thumbnails latest get` are the small versions, same flags
```

### 15. SQLite KV
Key is positional; `--db <path>` is required; the JSON-encoded value goes in `--body`. The batch pair is typed instead: `--items` takes the array, `--keys` takes the key list.
```bash
hoody kv set <key> --db /hoody/databases/app.db --body '"hello"' --create-db-if-missing       # value is a JSON-encoded string
hoody kv get <key> --db /hoody/databases/app.db
hoody kv increment <key> --db /hoody/databases/app.db --delta 1
hoody kv decrement <key> --db /hoody/databases/app.db
hoody kv batch set --db /hoody/databases/app.db --items '[{"key":"a","value":"\"v1\""}]'
hoody kv batch get --db /hoody/databases/app.db --keys a,b
```

### 16. Watch — create + stream
`hoody watch create --paths /data --recursive` (`--paths` is repeatable; there is no `--name`). Then `hoody watch {list|events stream --id <id> -o ndjson}`.

### 17. Tunnels
`hoody tunnel {list|sessions list|bindings list|expose ...}`.

### 18. Snapshots
`hoody snapshots create --container <cid> --alias pre-deploy [--expiry 30]`. Then `hoody snapshots {list | restore --name <name> | delete --name <name> | alias set --name <name> --alias <new>}` — each takes `--container <cid>` (or `-c`), not a positional id. `<name>` is the name `snapshots list` returns: the sanitized alias, or `snap-YYYYMMDD-HHMMSS` when none was given. On `alias set`, the new alias goes in `--alias`.

### 19. Vault
```bash
hoody vault {set <key> --value V|list|delete <key>|clear [--yes]}
TOKEN=$(hoody vault get <key> -o json | jq -r .value)   # -o raw prints the whole JSON record, not the value
```

### 20. Wallet balance
`hoody wallet balance get` (general balance), `hoody wallet credits get` (AI credits), `hoody wallet balances get` (both)

### 21. Cron entries
```bash
hoody cron entries create <user> --schedule '0 */6 * * *' --command '/x.sh' --name b6
hoody cron entries {list <user> | delete <user> <id> | update <user> <id> ...}
hoody cron crontabs set <user> ...  # bulk; <user> is positional and required
```

### 22. Daemon — supervised programs
```bash
hoody daemon programs create --name app --command 'node /app/s.js' \
  --user user --boot --autorestart unexpected     # --boot (not --autostart) toggles auto-start at container boot
hoody daemon programs {list | stop <id> | logs get <id> --lines 200}    # stop/logs get take positional <id>, not --name
```

### 23. Exec — serverless script
```bash
hoody exec scripts write --path api/users.ts --create-dirs --validate \
  --content '// @mode serverless
return { users: [{ id: 1, name: "Alice" }] };'
```
`// @mode {serverless|worker}`; return value or `module.exports = async(req,res,meta,shared)=>…`.

### 24. Open kit in browser
```bash
hoody open <service>   # service ∈ agent|bot|browser|code|cron|db|desktop|display|exec|files|kv|notes|notifications|pipe|run|terminal|watch|sqlite|curl|logs|ssh|egress|http|https|http-<port>|https-<port>. Top-level `open` takes a service name, NOT a container id.
hoody {display|code|files|exec|db|kv|notifications} open [...]
```

### 25. Local AI chatbot REPL
`hoody chat ['prompt']`

### 26. Discover kits
`hoody kits list [--named-only]` — kit slug catalog; see § Proxy URLs above.

### 27. Debug flags
```bash
hoody projects list --verbose         # show HTTP req/resp
hoody <cmd> --quiet                   # drops helper chatter; -o json/yaml/raw output still printed
hoody exec namespaces list --refresh-scripts
hoody files get /x -o raw | bash      # -o raw drops envelope
```

---

URLs → § Proxy URLs; auth → § Auth model; per-namespace flags → `SKILL-CLI/<ns>.md`.

---

# CLI — Reference appendix

## Global flags

|Flag|Notes|
|---|---|
|`-o`|`table`(d)/`json`/`yaml`/`wide`/`raw`/`ndjson`/`pretty`|
|`-q`,`-v`,`--no-color`|suppress helper chatter (status/side messages — JSON/YAML/raw output still emitted); HTTP req/resp; no color|
|`--config`,`--profile`|`~/.hoody/config.json`|
|`--base-url`|API base URL for this run (default `https://api.hoody.com`; also `HOODY_BASE_URL` or `hoody config set baseUrl <url>`).|
|`-t`,`-u`,`-p`,`-y`|bearer; login identifier (username, or an email: a value containing `@` is sent as `email`); pw; auto-yes|
|`-c`,`--realm`,`--proxy`,`--non-interactive`|container(→env); realm; proxy; CI|
|`--domain`|update-verify; **precede subcommand**|
|`--kit-*`|kit auth; capability URL is credential|
|`--local-password*`,`--local-lock-timeout`,`--allow-ephemeral-token`,`--refresh-scripts`|lock+cache|

Status: green=running, yellow=stopped, cyan=starting, red=error.

## Output formats

`table`/`wide` default; `json`/`yaml` print just the unwrapped `data` payload (the CLI strips the `{statusCode,message,data}` envelope via `isApiEnvelope`); `raw`=payload/SSE; `ndjson` default for streams/events; `pretty`=human stream. `-q` keeps `json`/`yaml`.

## Exit codes

`0`=success; `1`=general command/HTTP failure (4xx and 5xx both); `2`=2FA challenge pending (login saved nothing; finish with `hoody auth 2fa verify --temp-token …`), update failure, or exec-dynamic parse failure; `3`=authenticated but saving credentials failed (or logout could not clear them); `6`=TTY absent (interactive prompt requested but no TTY available); `7`=user abort, or multiple lock-password sources; `8`=lock contention; `9`=lock validation error; `10`=profile not found; `11`=crypto/lock error; `12`=migration error; `14`=ephemeral-token policy; `130`=SIGINT; `143`=SIGTERM; `149`=SIGBREAK (Windows).

## Login flow

`hoody login --web` is browser sign-in (add `--no-browser` to print the link and code instead of opening a browser); it polls until the user approves and saves the session. The rest of this section is the password path: `POST /api/v1/users/auth/login`. Auto-login from the global `-u`/`--username` (or `HOODY_USERNAME`/config) sends a value containing `@` as `email` and anything else as `username`. The explicit `hoody login` sends exactly the flag you pass: `--username <name>` or `--email <addr>`. If the response carries a `temp_token` without a `token`, the auto-login flow throws `Auto-login cannot complete the 2FA challenge`; finish the flow explicitly with `hoody auth 2fa verify --temp-token <tt> --code <6-digit OTP or 10-char backup code>` (or call `POST /api/v1/users/auth/2fa/verify`). Token persisted; `hoody logout` clears.

## Local-only operations

`hoody local` — `~/.hoody/`, no server calls. `defaults set <key> <value>` pins `container`/`realm`/`output`/`noColor`/`quiet`, `defaults get` shows them and `defaults clear <key>` removes one. `lock {enable|status|password set|reveal|disable|ephemeral enable|ephemeral disable|recover|doctor|purge}` (no `unlock` subcommand) uses `flock()`. `--non-interactive` accepts exactly one password source: `--local-password <pw>`, `HOODY_LOCAL_PASSWORD` env var, file/fd, or stdin. Combining sources (an env var plus a flag included) is refused with exit code 7.

## Update

Two channels. With an update domain (`--domain`/`HOODY_DOMAIN`/`~/.config/hoody/domain`) the CLI fetches that domain's manifest and **minisign-verifies** it against the build-embedded key (bad sig aborts; an explicit but untrusted domain is refused, never downgraded). With no domain configured (the npm and install-script default) it asks npm, then GitHub, for the latest version: no signature check. `update` checks for newer releases and prints install instructions; it does not atomically replace `$0`. The update banner runs only on bare `hoody`, `--help`, and explicit `hoody update` (no per-command implicit check). `HOODY_NO_UPDATE_CHECK=1` suppresses the banner.

## Environment variables

`HOODY_TOKEN`/`HOODY_API_TOKEN`, `HOODY_CONTAINER`/`_ID`, `HOODY_REALM`/`_ID`, `HOODY_USERNAME`/`_USER`, `HOODY_PASSWORD`/`_PASS`, `HOODY_BASE_URL`/`_API_URL`, `HOODY_PIPE_URL`, `HOODY_PROFILE`, `HOODY_DOMAIN`, `HOODY_KIT_AUTH`/`_TYPE`, `HOODY_KIT_USER`, `HOODY_KIT_TOKEN`, `HOODY_KIT_TOKEN_HEADER`, `HOODY_KIT_PASSWORD`/`_PASS`, `HOODY_NO_UPDATE_CHECK`, `NO_COLOR`, proxy (`ALL_PROXY`/`HTTPS_PROXY`/`HTTP_PROXY`). The config file path is set via the global `--config` flag (no `HOODY_CONFIG` env var).

---

## Subskill index

Every namespace page is included below, in this order.

- `agent` — In-container AI coding agent over HTTP
- `api` — Platform control plane: identity, projects, containers, billing, vault
- `bot` — chat-app control of a container, Telegram first
- `browser` — Per-container Chromium or Firefox instances, one per slot
- `code` — VS Code in the browser, per container
- `cron` — managed crontab entries per system user
- `curl` — full HTTP client gateway + REST-as-GET-URL bridge
- `daemon` — supervisord program lifecycle (start any program; logs kept)
- `display` — programmatic GUI desktops with screenshots, input, and windows
- `egress` — the container's outbound HTTP proxy
- `exec` — micro-services: any script or API as an instant HTTP endpoint
- `files` — container filesystem over HTTP, with automatic Git-like change history
- `notes` — Collaborative notebooks, hierarchical nodes, documents, databases
- `notifications` — Trigger and consume desktop notifications inside a container
- `pipe` — Zero-storage streaming HTTP transfers
- `proxyLogs` — Per-container request/response/event log query, stats, and SSE tail
- `run` — resolve apps to shell commands
- `sqlite` — SQLite HTTP API
- `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket
- `tunnel` — reverse tunnels for HTTP/WS/TCP via container relay
- `watch` — Linux inotify file-change streams with replay history


---

<!-- ===== namespace: agent ===== -->

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `agent` kit exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. services — `sessions` (with `sessions.turns`), `bots`, `definitions`, `models`, `providers`, `skills` (with `skills.hub`), `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `loops`, `logs`, `tasks`, `stats`, `jobs`, `gates`, `changes`, `headless`, `todos`, `usage`, plus `platform` (token bootstrap) and `hoody agent logs export`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `hoody agent sessions create` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `hoody agent sessions turns run` for one blocking call → resolve gates with `hoody agent gates approve` / `hoody agent gates deny` / `hoody agent gates answer` → `hoody agent sessions turns cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`hoody agent models list` / `hoody agent models get`; the Jev decision-model catalogue is the separate `hoody agent jev models list`) and `hoody agent providers list` (configure providers via `hoody agent providers auth default set` / `hoody agent providers keys set` / `hoody agent providers oauth start`); switch a session's active model with `hoody agent sessions model set`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `definitions` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`hoody agent tools list` / `hoody agent tools readonly list` / `hoody agent tools get`, and `hoody agent tools run` (blocks, returns the result; the unlisted `hoody agent tools stream` returns the one-shot result over SSE frames instead, not a per-token stream) / `hoody agent tools start` (returns `{ job_id }`, poll `jobs`) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`hoody agent sessions tools list` for a session's *effective* tool set, `hoody agent sessions mcp tools list`, and `hoody agent sessions tools run`). Unlike the sessionless `hoody agent tools run`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; whether a mutating tool may run is decided by the live session's own tool mode and confirmation settings (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — a headless run (`POST /api/v1/agent/headless/runs`) runs the full agent loop once over a throwaway session (see workflow 7 for the per-surface form: an async job or an SSE stream).
- **GitHub from inside the agent** — first establish an account with `hoody agent github auth login` (omit the body for a GitHub device flow → poll `hoody agent github auth poll`; or pass a `token` PAT to persist it directly), then `hoody agent github auth status` to confirm; once an account is active, `hoody agent github repos clone` / `hoody agent github commits create` (and `hoody agent github status` / `hoody agent github branches list` / `hoody agent github repos list` / `hoody agent github prs create` / `hoody agent github sync`) for repo operations the agent performs in-container.

## When NOT to use

- Want the interactive TUI, not the API? Run the bare `hoody agent` launcher — it opens the in-container Agent TUI over the terminal-kit WebSocket; this namespace is the HTTP control surface beside it.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (containers, billing, realms) → `api`.

## Prerequisites

- Container with the `agent` kit running; capability URL.
- At least one usable model provider before prompting: one with a stored API key, a stored OAuth login, or passwordless access (the shipped default agent is pinned to a passwordless model). `hoody agent providers list` and `hoody agent models list` list the CATALOGUE, which is populated whether or not anything is configured; `hoody agent providers auth status` reports whether a provider is actually usable (`ready`, with `api_key_stored`, `oauth_stored` and `no_auth_ready` behind it).
- A session id from `hoody agent sessions create` for every prompt/gate/cancel call.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Prompt a session and stream the turn

`hoody agent sessions create` (returns a session id) → stream the turn with `{ text }` to receive live events (tool calls, gates, output deltas) — see the streaming note under Quirks for the supported per-surface method (SDK helper / HTTP SSE route / CLI command) → resolve any gate as it arrives → turn ends.

### 2. One-shot synchronous prompt

`hoody agent sessions create` → `hoody agent sessions turns run` with `{ text }` — waits for the turn to end, a gate that needs a person, or the server deadline (290 seconds by default). A clean turn returns `{status:"done", session_id, turn_id}` with no reply text; check `status`, because a failed, cancelled or quit turn answers `error` (with the error `event`), `canceled` or `quit`. A turn that parks on a gate returns `{pending_gate, turn_id}`. When the deadline passes first the answer is `503 service_unavailable` with `details.turn_id` and `details.turn_running: true`: the turn is NOT cancelled, so follow it with `hoody agent sessions turns get` (or the stream) instead of prompting again. Read the reply with `hoody agent sessions transcript get`. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `hoody agent gates approve` / `hoody agent gates deny`; an open question → `hoody agent gates answer` (to get a helper model to DRAFT an answer for a parked question call `hoody agent gates suggest` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `hoody agent jobs result get` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `hoody agent gates answer`; for unattended runs arm `hoody agent sessions autoreply set` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `hoody agent sessions autoreply writes set`)). The gate identity to echo is the ENVELOPE-level `gate {id, generation, type}` that the stream frame parking the gate carries beside `seq` / `incarnation` / `event`. The `event.confirm_request` payload also has a numeric `gate_id`, but that is the daemon's id space and is never the value to echo. The answer body for a question gate: the envelope's gate id as `gate_id` (optionally its `generation`), then **answer** (or **text**, used when **answer** is blank) for a single question; for a batch (`event.user_question` carrying `questions[]`), `answers` maps each `questions[].id` to its answer text, for example `{"gate_id":"<gate.id>","answers":{"<questions[].id>":"yes"}}`. A body with no `hoody agent gates answer`, no `text` and no `answers` is `400 bad_request` and the question stays parked. The `question_id` on `event.user_question` is a diagnostic number, not a body field. Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). On a session whose approval policy is `always` and whose approver lease was ever minted (`hoody agent sessions approver lease claim`, or the lease handed back by a create or attach that asserted `always`), EVERY decision — `hoody agent gates approve` / `hoody agent gates deny`, and the confirmed re-issue of a gated `hoody agent sessions tools run` — must carry the current lease capability in the `X-Hoody-Approver-Lease` request header. (CLI: `--x-hoody-approver-lease`.) Without it the decision is refused `409 approver_lease_required`, a capability that does not verify is `409 approver_lease_invalid`, and an expired one is `approver_lease_expired` until a holder acquires again. Interrupt a running turn with `hoody agent sessions turns cancel`. Tear the session down: `hoody agent sessions close` removes it from the live map; `hoody agent sessions delete --id <id>` always erases the persisted record too (the CLI has no keep-the-record form; re-attach with `hoody agent sessions create --attach <id>` works only after `sessions close`). To roll a session back without tearing it down, `hoody agent sessions trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`hoody agent providers list` to list the catalogued providers (and `hoody agent providers auth status` to check that one is `ready`: a stored credential or passwordless access), `hoody agent models list` to list the catalogued models, then `hoody agent sessions model set` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec). A successful switch is live for the session at once and then TRIES to persist into the chat agent's frontmatter (a global repin for future sessions of that agent); that save is best-effort, so only `persisted: true` confirms the repin — `persisted: false` means the session switched but future sessions keep the old pin. PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit model on create (`hoody agent sessions create --model <spec>`), or this live `hoody agent sessions model set`, OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (an explicit model together with `attach` or `backend: "acp"` is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `hoody agent sessions effort set` (`{ effort }` — `low|medium|high|xhigh|max`, or `""` for the model default), `hoody agent sessions verbosity set` (`{ level }` — `normal|concise|terse|minimal`), `hoody agent sessions env set` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `hoody agent sessions agent set` (`{ agent }` — bind a named profile from `agents`).

To use a model from an endpoint that is not in the catalogue (anything that speaks the OpenAI Chat Completions, OpenAI Responses or Anthropic Messages API from a public HTTPS address, such as a model server you run yourself or a company gateway), add it as a **custom provider** first. `hoody agent providers create` takes `--id`, `--endpoint` (the base URL) and one `--models model=<name>` per model, then `hoody agent providers keys set --id <id> --api-key <key>` stores its key (a key never goes in the create command), and its models are `<model_prefix>/<model>` wherever a model is chosen: `hoody agent sessions create --model <spec>`. `hoody agent providers update` changes it and `hoody agent providers delete` removes it with its stored key. The change applies at once, with no restart: new sessions, model switches and Jev see it, and an open session on one of its models picks it up before its next turn. `id` is 1-40 lowercase letters, digits or inner hyphens and cannot change later; `model_prefix` is the `id` unless given, and must equal it; `wire_format` is `chat_completions` (default), `responses` or `messages`, and `auth_scheme` follows it (`bearer`, or `x-api-key` for `messages`). Built-in providers refuse update and delete (`409 provider_builtin`), as does a provider defined in a project's providers file (`409 provider_not_managed`). See Examples for the full run.

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `hoody agent skills list` (each carries an enabled + trust state), `hoody agent skills hub install` / `hoody agent skills hub search` / `hoody agent skills hub preview` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `hoody agent skills trust` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `hoody agent skills enable` / `hoody agent skills disable` only enable or disable by `name` (set the `disabled` flag). Both `hoody agent skills trust` (which grants arbitrary code-execution trust) and `hoody agent skills hub install` (which writes arbitrary skill code to disk) take effect immediately over this namespace: there is no confirmation step, and no privilege beyond ordinary access to the kit is required, so an autonomous caller can silently trust and install skill code. Add your own confirmation before exposing these to one.
- **Memory** — `hoody agent memory search` for hybrid recall (BM25 + vector + graph) and `hoody agent memory items list` to enumerate by `project`; `hoody agent memory items create` / `hoody agent memory items update` / `hoody agent memory items delete` to write; `hoody agent memory graph get` for the relation graph (or `hoody agent memory items get` to read one record by `id`). `hoody agent memory enable` / `hoody agent memory disable` are the memory capture/privacy switch — they persist `features.memory` and flip the live store — and `hoody agent memory flush` forces the store's durability barrier; none of the three is admin-gated. Memory is project-scoped (pass `project`). Memory reads and item writes accept `X-Hoody-Realm` or `?realm=` to select `global` or a realm id (in the SDK, pass `realm` in the method's options); omitted, the agent's current realm is used. A realm this login does not serve returns `404 not_found`; an agent pinned to one realm refuses another with `400 realm_scope_unsupported`. If the selected realm's memory is not connected, the request returns `503 service_unavailable` with `Retry-After` and does not connect it. `hoody agent memory consolidate` remains human-only; see Common errors. `hoody agent memory search` / `hoody agent memory graph get` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `hoody agent todos list` / `hoody agent todos create` to file; then `hoody agent todos triage` (LLM inbox pass), `hoody agent todos claim` / `hoody agent todos release`, `hoody agent todos start` (dispatch a background orchestrator — returns `{job_id, session_id}`), `hoody agent todos cancel` to abort an in-flight run, and `hoody agent todos proposals approve` / `hoody agent todos proposals deny` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `hoody agent todos start` (a J-class autonomous run that spends model budget), while `hoody agent todos proposals deny` spawns nothing — plus `hoody agent todos snooze` / `hoody agent todos archive`. To move a todo between states (`inbox`, `ready`, `blocked`, `review`, `done`, `dropped`) or edit its fields, `hoody agent todos update` applies a CAS-guarded patch / `state` transition (`in_progress` is entered only by `hoody agent todos claim` / `hoody agent todos start`; `hoody agent todos update` refuses it, and an unknown state is rejected) — read the todo's OWN `revision` with `hoody agent todos get` and pass it back (`hoody agent todos revision get` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `hoody agent todos archive` is not terminal — `hoody agent todos archived purge` permanently and irreversibly deletes archived todos of the selected realm that were archived more than 90 days ago (and those with a missing or invalid archive time); no confirmation gate, treat as destructive. Mind the comment split: `hoody agent todos comments create` (`/messages`, plural) only appends a comment, whereas `hoody agent todos messages send` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. The `job_id` returned by `hoody agent todos start`, `hoody agent todos messages send` and `hoody agent todos triage` completes as `succeeded` the moment the dispatch is accepted; it records the dispatch only, not the worker's outcome. Follow the todo itself (`hoody agent todos get`, its state and timeline) rather than polling that job. Note `hoody agent todos start` / `hoody agent todos triage` / `hoody agent todos proposals approve` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `hoody agent workflows list` / `hoody agent workflows get` / `hoody agent workflows set` / `hoody agent workflows delete` / `hoody agent workflows hidden set` manage saved definitions; `hoody agent sessions workflows start` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `hoody agent jobs get` until its `run_id` populates (null during the brief dispatch window), then track via `hoody agent workflows runs list` / `hoody agent workflows runs get` and stop with `hoody agent workflows runs cancel`; feed a running workflow with `hoody agent workflows messages send` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Bots** — `hoody agent bots create` opens a long-lived assistant that delegates work to sessions on containers; post to it with `hoody agent bots messages send` (HTTP 202; a busy Bot queues the message) rather than prompting its session, and see Examples for the full create, message, follow, forget, delete run. Replace its limits with `hoody agent bots guardrails set --guardrails <guardrails>` (empty clears them): the Bot reads them before its next message and delegates opened afterwards receive them in their first prompt, while delegates already open keep theirs. `allowed_containers` and `allowed_agents` restrict the delegates it opens next (empty means any) and `yolo: true` (default false) asks delegates to approve tool calls automatically. Check `yolo_unapplied` in `hoody agent bots get`: `pending` means a delegate has not confirmed the change yet and it is sent again; `refused` means that delegate's approval policy does not allow YOLO, so it keeps asking for approvals and the change is not sent again until `yolo` changes. `hoody agent bots stream` and `hoody agent bots log get` carry finished rows only; for live reply text, thinking and tool calls follow the Bot's `session_id` (from `hoody agent bots get`, it changes after `hoody agent bots reset`) with `hoody agent sessions stream`, and do not answer questions on that session whose `frame_request.kind` starts with `bot.`, because the Bot runtime answers them. To stop only the Bot's running turn use `hoody agent sessions turns cancel` on its `session_id`.
- **Agent profiles** — `hoody agent definitions list` to enumerate named profiles; `hoody agent definitions create` / `hoody agent definitions copy` / `hoody agent definitions rename` / `hoody agent definitions delete`; `hoody agent definitions source get` → edit → `hoody agent definitions source set` (pass the `revision` from `hoody agent definitions source get` as `hoody agent definitions source set --expected-revision <rev>`: a stale one is refused `409 revision_conflict` and nothing is written; without it the save is unconditional); `hoody agent definitions model set` / `hoody agent definitions tools set` / `hoody agent definitions tools toggle` / `hoody agent definitions turns limit set` / `hoody agent definitions reset`. The product-owned `bot` profile (the one a Bot runs) allows only a model pin through `hoody agent definitions model set` (an empty model clears it); `hoody agent definitions source set`, `hoody agent definitions tools set`, `hoody agent definitions tools toggle` and `hoody agent definitions turns limit set` are refused for it with `400 bad_request`, as are creating over it and renaming it, and a Bot's own `model` overrides the pin. To make a session use a profile, `hoody agent sessions agent set` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `hoody agent definitions delete` refuses the configured default chat agent, and a shipped-default profile that has no removable override of its own (`is_error:true` — use `hoody agent definitions reset` or `hoody agent definitions source set` instead); in a realm that holds its own saved override of a shipped profile, deleting it removes the override and the shipped version shows through again, and `hoody agent definitions reset` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `hoody agent sessions turns start` with `{ text }` dispatches a turn and returns `{ job_id, session_id, turn_id }` immediately (HTTP 202) without streaming or blocking; watch completion via the `agent_done` on the session event stream (a connected `hoody agent sessions stream` socket, or `hoody agent sessions stream`) whose `turn_id` matches (another client's turn on the same session ends with its own `agent_done`). A cancel scoped with that `turn_id` stops only this turn. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `hoody agent sessions stream` attaches to a live session's full `event.*` stream over WebSocket, and `hoody agent sessions stream` is the SSE form of the same route; neither falls back to the other on its own. Either way, pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). Each frame is `{seq, incarnation, event}`, and a session re-attached under the same id starts a new incarnation whose `seq` restarts at 1, so send `incarnation` (the one you last saw) together with `since`: a mismatch answers `replay_gap` plus the full retained ring instead of silently resuming into a different history. Over SSE the `event:` line drops the `event.` prefix (`event.agent_done` arrives as `event: agent_done`) while the JSON `data:` keeps the full name, so match ordinary event frames on the parsed payload's `event.type` (for example `event.agent_done`); control frames (`lagged`, `end`, `replay_boundary`) have no `event` key. WebSocket frames are delivered unchanged. `hoody agent sessions replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring). `hoody agent sessions stream` does not revive a session either: on a persisted but non-live session it answers `404 not_found`, so re-attach it first (`hoody agent sessions create --attach <id>`), then open the stream.
- **Recurring prompts (loops)** — `hoody agent loops create` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `hoody agent sessions loops list` / `hoody agent loops update` (pause via `{ paused: true }`) / `hoody agent loops delete` to manage, `hoody agent loops runs start` to fire one immediately. Loops are entirely session-scoped. Three rules refuse a request rather than adjusting it: `interval` has a floor of 60 seconds; at most 8 loops can be active (not paused, not ended) per daemon, so the 9th create is rejected; and each `hoody agent loops update` carries at most ONE intent (`paused`, or `expires_in`, or the budget fields `max_cost_usd` / `max_wall_ms`), so a request mixing two is rejected 400 (a body with none of them is treated as a budget update).

### 7. Headless one-shot run

The run's shape is chosen by the request BODY, not by a header: the default (`format` `text` or `json`) is an async job — HTTP 202 `{ job_id }`, then poll `hoody agent jobs get` and fetch the output with `hoody agent jobs result get` — while `format: "stream-json"` (or `stream: true`) streams the run over SSE (`start` → `result` or `error` → `end`). A failure after the acknowledgement (a timeout, `admin_unauthorized`) arrives later, in the job result or as the `error` frame, never as the HTTP status. Every confirm, plan and question auto-approves in a headless run, so treat it as arbitrary code execution. `hoody agent headless start --prompt "<task>"` prints the 202 `{ job_id }` (`--format` is `text` or `json`); poll `hoody agent jobs get --id <job_id>` and fetch the output with `hoody agent jobs result get --id <job_id>`. Use `hoody agent headless stream --prompt "<task>"` to print the SSE frames as they arrive instead. For a one-shot turn that needs no job, `hoody agent prompt "<task>" --wait` creates a session and blocks until the turn completes (add `-y` to auto-approve confirm gates; questions still park the turn).

### 8. Configure MCP servers for a session

Reads first: `hoody agent mcp list` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `hoody agent mcp intents create` (`{ session_id, op, scope }`, op ∈ the strings "upsert", "delete", "set_enabled" and "import", scope ∈ `user`|`project`|`local`; an omitted scope means `user`, or `project` when the session has no user layer, which is the usual case for a container session — read the returned target path to confirm where the write lands) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `hoody agent mcp upsert` / `hoody agent mcp delete` / `hoody agent mcp enable` / `hoody agent mcp disable` / `hoody agent mcp import`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `hoody agent mcp preview` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `hoody agent mcp import` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `hoody agent mcp enable`. After editing a settings file by hand, or to recover a server that died, `hoody agent mcp reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `hoody agent mcp test` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **TUI launcher**, separate from this HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface. In that TUI, Ctrl+V pastes from the clipboard of the machine the CLI runs on, and Shift+click opens a link (the TUI tracks the mouse).
- On the realm-scoped agent commands (Bots, sessions, gates, loops, todos, workflow runs, changes and stop calls), an explicit `--realm global` or `--realm <24-hex-id>` also scopes the agent request, through `X-Hoody-Realm`; `--realm all` lists every served realm on the Bots, sessions, gates, loops, todos and workflow-runs list commands. A `--realm` that disagrees with the command's own `--x-hoody-realm` is refused before anything is sent, and a saved or environment realm default is not forwarded this way. Everywhere else the global `--realm` only picks the platform API host that resolves `-c` to the container (`--realm global` is the base host), and a route that serves only the active realm refuses a per-request realm with 400 `realm_scope_unsupported`.
- Source of truth is the agent kit's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit checks no credential of its own and asks for no bearer header; access is decided by the container's proxy permission policy. Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. A request that does not come through the kit URL gets 403 `forbidden`, so call the kit URL.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`). The CLI resolves it from `--container` / `-c`; you do not build it by hand.
- `hoody agent sessions turns run` waits for the turn to end (or returns `{pending_gate}` the moment a turn parks on a confirm/question), but at most until the server deadline (290 seconds by default): a turn still running then answers `503 service_unavailable` with `details.turn_running: true` and keeps running; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (Stream the turn with `hoody agent prompt "<task>" --session <id>` (`-c` picks the container, not the session); it reads the daemon's SSE for you. `hoody agent sessions turns start --id <id> --text "<task>"` is the raw fire-and-observe form: it dispatches the turn and prints the 202 `{job_id, session_id, turn_id}`. Add `--stream` to follow the session event stream instead; that stream does not end with the turn, so stop at the `agent_done` carrying your `turn_id`. `hoody agent sessions turns run` is the blocking form.) For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy to answer confirm gates (off by default). On the blocking form (`hoody agent sessions turns run`, route `prompt:sync`) it stays on for the dispatched turn even after the request ends. On the streamed form (route `prompt:stream`) it is tied to the connection, not the turn: disconnecting before the turn ends stops it, and while the stream stays open it also answers confirm gates of LATER turns on the same session, so close the stream at your turn's `agent_done`. With either form, an ordinary confirm gate is approved, a gate raised by a tool-call rule is DENIED, and a session whose approval policy is `always` refuses the policy with `409 approval_policy_active` before the turn starts. CLI: `hoody agent prompt -y` (`--yes`), or `hoody agent sessions turns run --policy auto_approve` for the blocking form; the bare TUI launcher has no such flag. This only answers **confirm** gates, never questions.
- **The agent's shell has the container user's own sudo.** The agent runs as the container's `user`, and its bash tool can use sudo exactly as that user can without a password: with the default passwordless sudo it can `sudo apt-get install`, `sudo systemctl enable --now` a unit and so on. When `user` has no passwordless sudo (the drop-in removed, a password required), the agent's shell has none either, because there is no terminal to type a password into; a policy that allows only some commands without a password allows the same commands to the agent (with sudo's default `listpw`). While the agent's shell can sudo, a session's `dir_scope` (`home`) no longer confines its bash commands: the file tools still keep to the scope, but the shell can reach the whole container, like the terminal kit. To take sudo away from the agent, take passwordless sudo away from `user` (see container-tools); the agent keeps everything else `user` has, such as Docker through the `docker` group.
- Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `hoody agent sessions create` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `hoody agent hooks upsert` / `hoody agent hooks delete` / `hoody agent hooks enable` / `hoody agent hooks disable` / `hoody agent hooks enable` / `hoody agent hooks disable` — plus `hoody agent hooks intents create`, and the side-effecting `hoody agent hooks run` / `hoody agent hooks trust`, all require a live `session_id` — `hoody agent hooks trust` clears the per-session hook-trust prompt (the execution-trust probe `hoody agent hooks list` reports), the gate that must be acknowledged before a saved hook command is allowed to fire, mirroring `hoody agent skills trust` for skills; `hoody agent hooks reload` accepts one only to also return the reloaded summary) AND nonce-guarded: call `hoody agent hooks intents create` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled|rules_set; `rules_set` is for `hoody agent hooks rules set` and needs its own matching nonce) to mint a single-use nonce, then pass that `nonce` on the matching `hoody agent hooks upsert` / `hoody agent hooks delete` / `hoody agent hooks enable` / `hoody agent hooks disable` / `hoody agent hooks enable` / `hoody agent hooks disable` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `hoody agent hooks upsert` persists a command that fires on lifecycle events, and `hoody agent hooks run` on a command hook runs a command at once: running saved hooks goes through the session's hook-trust gate, while a run that supplies an unsaved inline `command` runs it without that saved-hook trust check. Every command-hook run is refused (`approval_policy_unsatisfiable`) while the session's approval policy is `always`, and `hoody agent hooks test` of a shipped hook only evaluates its trigger without running anything. These calls carry no confirmation step of their own — the same access that authorizes any agent-kit call authorizes these too, with nothing extra — so add your own confirmation before exposing this surface to an autonomous caller.
- **`env` and `headers` VALUES are never returned by the MCP surface; every other field comes back verbatim.** `hoody agent mcp list` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. Other fields, including `url`, `command` and `args`, are echoed verbatim, so a credential embedded in one of them (a token in a URL, a key on a command line) is NOT redacted: keep secrets in `env` / `headers`, and treat the rest of a listing as sensitive. To change a secret you must supply its real value; to leave one alone, omit the field — `hoody agent mcp upsert` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `env` / `headers` merge per key (a key set to `null` is deleted, `{}` clears the map). A genuine re-point (a changed `type`, `command`, `args` or `url`) clears `env` and `headers` unless the same request re-supplies them, so send the credentials the new target needs in that write; restating the identity you read back is not a re-point. `hoody agent mcp enable` / `hoody agent mcp disable` flip only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.
- `POST /api/v1/agent/hoody/auth/bootstrap` (HTTP only; no CLI command) (token bootstrap) is enabled by default; a deployment can turn it off, and then every call answers 404. Browser clients may call it; the body must be exactly `application/json`. Where the deployment requires a capability, the body must carry the matching `capability` (a mismatch is also 404). The token must belong to this box's owner and carry the full login grant (otherwise 403). On a box with no credential it installs (201 `installed`) and adopts any local sessions or todos that have no owner; on a box logged in to the SAME account it replaces the stored token whether or not it expired (200 `renewed`). A token for a different account is refused `409 agent_login_conflict`, and a credential supplied through the environment is never replaced (`409 credential_present`).

## Common errors

- A model rate limit can end the turn: `event.error.code` is `quota_wait_too_long` or `rate_limit`, and `agent_done.error_code` carries the same code. For `quota_wait_too_long`, read `retry_after_secs` from the error payload, wait that many seconds, then send the message again: the turn ended instead of waiting. `retry_after_secs` is omitted on other errors, so do not assume it exists for `rate_limit`.
- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `hoody agent gates approve` / `hoody agent gates deny` for a confirm, `hoody agent gates answer` for a question. For unattended runs, arm `hoody agent sessions autoreply set` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only answers **confirm** gates (approving ordinary ones, denying rule-raised ones; refused with `409 approval_policy_active` on an `always` session), never questions; a parked question still stalls until `hoody agent gates answer` (or the auto-reply loop) answers it.
- `hoody agent tasks list` and `hoody agent tasks transcript get` return their data INLINE and need no live session and no attached stream. `hoody agent tasks list` is the UNION of the live task registry and the session's PERSISTED task store (keyed by task id, live winning) — the live registry evicts completed tasks when a new one spawns, so a finished task can leave memory while its transcript is still durable, and a live-only list would hide it. `hoody agent tasks transcript get` reads a task that reached a terminal state even for a closed session and after a daemon restart; a task still RUNNING when the daemon died is NOT recoverable and reads 404. Its `source` field is `"live"` or `"store"`, and `complete` reports whether the response reflects a terminal projection DURABLY COMMITTED to that store. `after_seq` is EXCLUSIVE (entries strictly after it, plus any still-open entry); OMITTING it returns the whole transcript, which is distinct from `after_seq=0`. `hoody agent tasks cancel` / `hoody agent sessions tasks cancel` still act on a LIVE session and stop background tasks mid-turn (server-layer; tasks survive `hoody agent sessions turns cancel` but are not restartable).
- `hoody agent memory consolidate` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — it has no successful HTTP/SDK/CLI path: a call that passes the admin check returns `403 human_only`, and the admin check can refuse it first with `403 admin_unauthorized`. It can only be triggered from an interactive human session. Do not call it programmatically.
- `hoody agent mcp test` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `hoody agent mcp preview` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `hoody agent mcp upsert` / `hoody agent mcp delete` / `hoody agent mcp enable` / `hoody agent mcp disable` / `hoody agent mcp import` each require a fresh single-use `nonce` from `hoody agent mcp intents create` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `hoody agent mcp intents create` or `hoody agent mcp list`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `hoody agent workflows delete` removes **user** workflows and saved customizations. A built-in/**system** workflow that you never customized is refused (`is_error:true`) and re-seeds on every boot; `hoody agent workflows hidden set` is the only way to remove it from view. Deleting your saved customization of a system workflow succeeds and brings the shipped version back: at once in a scoped realm, at the next daemon restart otherwise.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `hoody agent definitions model set` with `model: ""` removes the model line (falls back to the default model), and `hoody agent definitions tools set` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn. `hoody agent providers list` lists every catalogued provider whether or not it is set up, so check the one you intend to use with `hoody agent providers auth status` before you prompt (blocking or streamed): `ready` is true for a stored API key, a stored OAuth login, or a passwordless provider (`no_auth_ready`).
- A custom provider's `base_url` must be an `https` URL with no user name, password, query or fragment, at a public address; one that is not (an internal address, a name that only resolves inside a network, or a name that resolves to an internal address when a request is made) is refused `422 provider_invalid` with `details.field` `base_url`. Create is not idempotent by itself: repeating a create that went through answers `409 provider_exists`, so send an `Idempotency-Key` to retry safely (the same key with another body is `422 idempotency_key_reused`). Deleting a provider leaves an open session on one of its models unconfigured: its next prompt fails with `session_unconfigured` until you switch it to another model, and agents and Jev settings that name one of its models fail the same way until changed.
- Calling prompt/gate/cancel against a session whose live connection was torn down (`hoody agent sessions close`) returns not-found. If the record survives, re-attach with `hoody agent sessions create --attach <id>`; otherwise start a fresh session (the same create call without `attach`). After a *hard* delete (`hoody agent sessions delete`, which always erases the record) the record is gone and only a fresh session works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Examples

A **Bot** here is the agent's long-lived assistant (`hoody agent bots`). It opens delegate sessions on containers, follows them and reports back. It is not the chat-app `bot` namespace. Set `P`, `C`, `N` from `hoody containers get` first. The Bot's id below is `release-bot`; omit `id` on create to have one generated, and take it from the response.

### 1. Create a Bot, message it, follow its replies, forget, delete

**Goal:** run a Bot end to end. `guardrails` are limits on the work (they apply to the Bot and every delegate it opens), not instructions. A Bot lives in one realm: pass `realm` (`X-Hoody-Realm`) to pick one, otherwise the agent's current realm is used. The Bot's own session opens when the first message is posted, so `session_id` is empty until then.

**Step 1 — create.** Send `id` to make a retry safe: a second create with the same id answers `409 bot_exists`.

```bash
hoody agent bots create --id release-bot --name 'Release bot' \
  --role 'Ships the weekly release.' --guardrails 'Never push to main.'
```

**Step 2 — message it.** The answer is `202` with `{message_id, state}`: `posted` (with `turn_id`) when the Bot is free, `queued` while it is busy, and the message goes out when its turn ends. Add an `Idempotency-Key` to retry safely.

```bash
hoody agent bots messages send --id release-bot --text 'Check the staging build and tell me if it is green.'
```

**Step 3 — follow the replies.** The stream carries finished log rows only: first a `state` frame (the Bot), then `row` frames, plus `lagged`, `archived` and `end`. The reply is one `bot` row written when its turn ends, and a turn with no reply text writes none. Resume with `since` (or `Last-Event-ID`). For live text, thinking and tool calls, follow the Bot's own `session_id` with `hoody agent sessions stream` instead. To read without streaming, page the log: pass `next_since` back as `since` while `has_more` is true.

```bash
hoody agent bots stream --id release-bot
hoody agent bots log get --id release-bot --since 0
```

**Step 4 — forget or reset.** `hoody agent bots forget` moves the log to the archive and clears the conversation; the Bot keeps its settings and delegates. `reset` also archives the log but starts a new session with the Bot's current model, which is how a changed `model` takes effect. The old session is not closed. Neither deletes the archive; `hoody agent bots archive purge` does.

```bash
hoody agent bots forget --id release-bot --yes
hoody agent bots reset --id release-bot --yes
```

**Step 5 — delete.** Removes the Bot with its log and archive, after a best-effort stop of its working delegates. Its session and delegates are not closed: they stay listed under the sessions and a person can continue them. There is no stop route for the Bot itself: to stop its running turn, cancel its `session_id` with `hoody agent sessions turns cancel`.

```bash
hoody agent bots delete --id release-bot --yes
```

### 2. Add a custom provider, store its key, use its model

**Goal:** connect an OpenAI-compatible endpoint and run a session on one of its models. The provider id below is `acme`; its model is selected as `acme/llama-3.3-70b`.

**Step 1 — create it.** `id`, `base_url` and `models` are required. Add an `Idempotency-Key` so a retry answers with the provider the first try created instead of `409 provider_exists`. The reply carries the provider, with each model's `spec`.

```bash
hoody agent providers create --id acme --endpoint https://api.acme.example/v1 \
  --models model=llama-3.3-70b,context_window=131072
```

**Step 2 — store its key.** The key has its own route and is never returned.

```bash
hoody agent providers keys set --id acme --api-key "$KEY"
```

**Step 3 — use its model.** Start a session on it; `hoody agent sessions model set` switches an open one and `hoody agent definitions model set` pins an agent profile.

```bash
hoody agent sessions create --model acme/llama-3.3-70b
```

**Step 4 — change or remove it.** Update names only what changes (`models` and `headers` replace the current list and map; `id` and `model_prefix` are fixed). Delete asks for confirmation on the CLI and removes the stored key too.

```bash
hoody agent providers update --id acme --endpoint https://eu.api.acme.example/v1
hoody agent providers delete --id acme --yes
```

## Reference

### `hoody agent` (273) — AI agent — sessions, prompting, models, skills, memory, todos, workflows

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody agent acp disable` |  | write | Disable a delegated ACP agent | `agent.acp.disable` | `hoody agent acp disable --agent my-agent` |
| `hoody agent acp enable` |  | write | Enable a delegated ACP agent | `agent.acp.enable` | `hoody agent acp enable --agent my-agent` |
| `hoody agent acp model set` |  | write | Set the delegated ACP agent's model | `agent.acp.setModel` | `hoody agent acp model set --agent my-agent --model openai/gpt-5.4-nano` |
| `hoody agent acp secrets set` |  | write | Store an ACP per-agent secret value | `agent.acp.setSecret` | `hoody agent acp secrets set --agent my-agent --key <key> --value hello` |
| `hoody agent acp status` |  | read | Get BYOA ACP backend status | `agent.acp.getStatus` | `hoody agent acp status` |
| `hoody agent bots archive get` |  | read | Read a Bot's archive | `agent.bots.getArchive` | `hoody agent bots archive get --id abc-123 --since 1750000000000 --limit 10` |
| `hoody agent bots archive purge` |  | destructive | Delete a Bot's archive | `agent.bots.purgeArchive` | `hoody agent bots archive purge --id abc-123 -y` |
| `hoody agent bots create` |  | write | Create a Bot | `agent.bots.create` | `hoody agent bots create --name my-resource --role admin` |
| `hoody agent bots delegates list` |  | read | List the sessions a Bot opened | `agent.bots.listDelegates` | `hoody agent bots delegates list --id abc-123 --state open --page 10` |
| `hoody agent bots delegates stop` |  | write | Stop one of a Bot's delegates now (--close also closes its session) | `agent.bots.stopDelegate` | `hoody agent bots delegates stop --id abc-123 --sid <sid> --close` |
| `hoody agent bots delete` |  | destructive | Delete a Bot with its log and archive | `agent.bots.delete` | `hoody agent bots delete --id abc-123 -y` |
| `hoody agent bots forget` |  | destructive | Make a Bot forget its conversation | `agent.bots.forget` | `hoody agent bots forget --id abc-123 -y` |
| `hoody agent bots get` |  | read | Get a Bot: settings, pending gate, open delegates | `agent.bots.get` | `hoody agent bots get --id abc-123` |
| `hoody agent bots guardrails set` |  | write | Replace a Bot's guardrails | `agent.bots.setGuardrails` | `hoody agent bots guardrails set --id abc-123 --guardrails <guardrails>` |
| `hoody agent bots list` |  | read | List the Bots | `agent.bots.list` | `hoody agent bots list --page 10 --limit 10` |
| `hoody agent bots log get` |  | read | Read a Bot's log | `agent.bots.getLog` | `hoody agent bots log get --id abc-123 --since 1750000000000 --limit 10` |
| `hoody agent bots messages send` |  | write | Post a message to a Bot | `agent.bots.sendMessage` | `hoody agent bots messages send --id abc-123 --text Hello` |
| `hoody agent bots reset` |  | destructive | Give a Bot a new session | `agent.bots.reset` | `hoody agent bots reset --id abc-123 -y` |
| `hoody agent bots stream` |  | read | Follow a Bot's log (SSE) | `agent.bots.stream` | `hoody agent bots stream --id abc-123 --since 1750000000000` |
| `hoody agent bots update` |  | write | Change a Bot's settings | `agent.bots.update` | `hoody agent bots update --id abc-123 --name my-resource --role admin` |
| `hoody agent changes get` |  | read | Change tokens for the Work lists | `agent.changes.get` | `hoody agent changes get` |
| `hoody agent changes stream` |  | read | Stream the change tokens (SSE) _(not listed in `--help`)_ | `agent.changes.stream` |  |
| `hoody agent completions create` |  | write | Run one tool-free model completion | `agent.completions.create` | `hoody agent completions create --stream --model xiaomi-token-plan-sgp/mimo-v2.5 --system linux --messages role=user,content=Hello` |
| `hoody agent completions create` |  | write | Stream the completion as it is produced | `agent.completions.create` | `hoody agent completions create --stream --model xiaomi-token-plan-sgp/mimo-v2.5 --system linux --messages role=user,content=Hello` |
| `hoody agent containers list` |  | read | List containers in a realm (for binding) | `agent.containers.list` | `hoody agent containers list --page 10 --limit 10` |
| `hoody agent definitions copy` |  | write | Copy a chat agent | `agent.definitions.copy` | `hoody agent definitions copy --name my-resource --new-name <new_name>` |
| `hoody agent definitions create` |  | write | Create a chat-agent definition | `agent.definitions.create` | `hoody agent definitions create --name my-resource --frontmatter-description 'My description' --frontmatter-model openai/gpt-5.4-nano` |
| `hoody agent definitions delete` |  | write | Delete a custom chat agent | `agent.definitions.delete` | `hoody agent definitions delete --name my-resource` |
| `hoody agent definitions list` |  | read | List chat-agent definitions | `agent.definitions.list` | `hoody agent definitions list --page 10 --limit 10` |
| `hoody agent definitions model set` |  | write | Set an agent's model | `agent.definitions.setModel` | `hoody agent definitions model set --name my-resource --model anthropic/claude-opus-4-8` |
| `hoody agent definitions rename` |  | write | Rename a chat agent | `agent.definitions.rename` | `hoody agent definitions rename --name my-resource --new-name <new_name>` |
| `hoody agent definitions reset` |  | write | Reset an agent to its shipped default | `agent.definitions.reset` | `hoody agent definitions reset --name my-resource` |
| `hoody agent definitions source get` |  | read | Read a chat agent's source | `agent.definitions.getSource` | `hoody agent definitions source get --name my-resource` |
| `hoody agent definitions source set` |  | write | Write a chat agent's source | `agent.definitions.setSource` | `hoody agent definitions source set --name my-resource --content Hello` |
| `hoody agent definitions tools set` |  | write | Set an agent's tool allow-list | `agent.definitions.setTools` | `hoody agent definitions tools set --name my-resource --tools <tools>` |
| `hoody agent definitions tools toggle` |  | write | Toggle a single tool for an agent | `agent.definitions.toggleTool` | `hoody agent definitions tools toggle --name my-resource --tool <tool>` |
| `hoody agent definitions turns limit set` |  | write | Set an agent's max-turns | `agent.definitions.setTurnLimit` | `hoody agent definitions turns limit set --name my-resource --turns 10` |
| `hoody agent files list` |  | read | List the files that shape the agents (paths to open in an editor) | `agent.files.list` | `hoody agent files list --page 10 --limit 10` |
| `hoody agent fusions delete` |  | write | Delete a fusion composite | `agent.fusions.delete` | `hoody agent fusions delete --slug <slug>` |
| `hoody agent fusions list` |  | read | List fusion composites | `agent.fusions.list` | `hoody agent fusions list --include-invalid --page 10` |
| `hoody agent fusions set` |  | write | Create or update a fusion composite | `agent.fusions.set` | `hoody agent fusions set --slug <slug> --spec '{}'` |
| `hoody agent gates answer` |  | write | Answer a parked question gate | `agent.gates.answer` | `hoody agent gates answer --id abc-123 --generation 10 --answers key=hello` |
| `hoody agent gates approve` |  | write | Approve a pending gate | `agent.gates.approve` | `hoody agent gates approve --id abc-123 --generation 10 --persist-dirs` |
| `hoody agent gates deny` |  | write | Deny a pending gate | `agent.gates.deny` | `hoody agent gates deny --id abc-123 --generation 10 --persist-dirs` |
| `hoody agent gates list` |  | read | List the gates waiting for a human | `agent.gates.list` | `hoody agent gates list --include-system --page 10` |
| `hoody agent gates suggest` |  | write | Propose answers for a parked question (helper model) | `agent.gates.suggest` | `hoody agent gates suggest --id abc-123 --mode suggest --model openai/gpt-5.4-nano` |
| `hoody agent github accounts use` |  | write | Select the active GitHub account | `agent.github.useAccount` | `hoody agent github accounts use --key github.com/octocat` |
| `hoody agent github auth login` |  | write | Start a GitHub device-flow login (or add a PAT) | `agent.github.login` | `hoody agent github auth login --host github.com --activate` |
| `hoody agent github auth logout` |  | write | Log out of GitHub | `agent.github.logout` | `hoody agent github auth logout --key github.com/octocat` |
| `hoody agent github auth poll` |  | write | Poll a GitHub device-flow login to completion | `agent.github.pollLogin` | `hoody agent github auth poll --host github.com --device-code <device_code> --interval 10` |
| `hoody agent github auth status` |  | read | GitHub auth status | `agent.github.getAuth` | `hoody agent github auth status` |
| `hoody agent github branches create` |  | write | Create a branch at HEAD and switch to it | `agent.github.createBranch` | `hoody agent github branches create --branch <branch>` |
| `hoody agent github branches delete` |  | destructive | Force-delete a local branch | `agent.github.deleteBranch` | `hoody agent github branches delete --branch <branch> -y` |
| `hoody agent github branches list` |  | read | List GitHub branches | `agent.github.listBranches` | `hoody agent github branches list` |
| `hoody agent github branches use` |  | write | Switch to an existing branch | `agent.github.useBranch` | `hoody agent github branches use --branch <branch>` |
| `hoody agent github commits create` |  | write | Stage all and commit | `agent.github.createCommit` | `hoody agent github commits create --push --message Hello --set-upstream` |
| `hoody agent github commits create` |  | write | Stage all, commit, and push (on a clean tree it pushes without a new commit) | `agent.github.createCommit` | `hoody agent github commits create --push --message Hello --set-upstream` |
| `hoody agent github commits list` |  | read | Read the 100 most recent commits | `agent.github.listCommits` | `hoody agent github commits list` |
| `hoody agent github commits message suggest` |  | write | Draft a commit message with a model | `agent.github.suggestCommitMessage` | `hoody agent github commits message suggest --model anthropic/claude-sonnet-4-6` |
| `hoody agent github diff` |  | read | Read the working-tree or staged diff | `agent.github.diff` | `hoody agent github diff --staged` |
| `hoody agent github issues create` |  | write | Open an issue on the bound repository | `agent.github.createIssue` | `hoody agent github issues create --title 'My Title' --body 'Details go here'` |
| `hoody agent github issues list` |  | read | List issues of a repository | `agent.github.listIssues` | `hoody agent github issues list --owner <owner> --repo my-repo --state open` |
| `hoody agent github prs checkout` |  | write | Check out a pull request's head (detached) | `agent.github.checkoutPr` | `hoody agent github prs checkout --number <number>` |
| `hoody agent github prs create` |  | write | Open a pull request | `agent.github.createPr` | `hoody agent github prs create --title 'My Title' --body 'Details go here'` |
| `hoody agent github prs list` |  | read | List pull requests of a repository | `agent.github.listPrs` | `hoody agent github prs list --owner octocat --repo Hello-World --state open` |
| `hoody agent github prs merge` |  | destructive | Merge a pull request on GitHub | `agent.github.mergePr` | `hoody agent github prs merge --number <number> --method merge -y` |
| `hoody agent github repos clone` |  | write | Clone a GitHub repository | `agent.github.clone` | `hoody agent github repos clone --repo octocat/Hello-World --shallow` |
| `hoody agent github repos credentials set` |  | write | Re-write a checkout's GitHub credential | `agent.github.setRepoCredentials` | `hoody agent github repos credentials set` |
| `hoody agent github repos list` |  | read | List GitHub repos | `agent.github.listRepos` | `hoody agent github repos list` |
| `hoody agent github repos resolve` |  | read | Resolve the checkout's GitHub owner and repository | `agent.github.resolveRepo` | `hoody agent github repos resolve` |
| `hoody agent github stash pop` |  | write | Apply and drop the most recent stash entry | `agent.github.popStash` | `hoody agent github stash pop` |
| `hoody agent github stash push` |  | write | Stash the working tree, untracked files included | `agent.github.pushStash` | `hoody agent github stash push` |
| `hoody agent github status` |  | read | GitHub working-tree status | `agent.github.getStatus` | `hoody agent github status` |
| `hoody agent github sync` |  | write | Sync (fetch → pull → push) | `agent.github.sync` | `hoody agent github sync --set-upstream --force` |
| `hoody agent github worktrees create` |  | write | Add a linked worktree | `agent.github.createWorktree` | `hoody agent github worktrees create --path /home/user/file.txt` |
| `hoody agent github worktrees delete` |  | destructive | Remove a linked worktree | `agent.github.deleteWorktree` | `hoody agent github worktrees delete --path /home/user/file.txt --force -y` |
| `hoody agent github worktrees list` |  | read | List linked worktrees | `agent.github.listWorktrees` | `hoody agent github worktrees list` |
| `hoody agent headless start` |  | write | Start a headless run and return its job id _(not listed in `--help`)_ | `agent.headless.start` | `hoody agent headless start --prompt "summarize the repo" -o json` |
| `hoody agent headless stream` |  | write | Start a headless run and follow its result as a stream _(not listed in `--help`)_ | `agent.headless.stream` | `hoody agent headless stream --prompt "summarize the repo" -c <containerId>` |
| `hoody agent health` |  | read | Standardized health check | `agent.kit.getHealth` | `hoody agent health` |
| `hoody agent hooks delete` |  | write | Delete a hook | `agent.hooks.delete` | `hoody agent hooks delete --session-id abc-123 --nonce <nonce> --scope project --event Notification --command 'ls -la'` |
| `hoody agent hooks disable` |  | write | Suspend every hook of the session | `agent.hooks.disableAll` | `hoody agent hooks disable --all --session-id abc-123 --nonce <nonce> --scope project` |
| `hoody agent hooks disable` |  | write | Disable a hook (a shipped hook by --shipped-id, an ordinary hook by event, matcher and command) | `agent.hooks.disable` | `hoody agent hooks disable --all --session-id abc-123 --nonce <nonce> --scope project` |
| `hoody agent hooks enable` |  | write | Resume every hook (clears the suspension of all hooks) | `agent.hooks.enableAll` | `hoody agent hooks enable --all --session-id abc-123 --nonce <nonce> --scope project` |
| `hoody agent hooks enable` |  | write | Enable a hook (a shipped hook by --shipped-id, an ordinary hook by event, matcher and command) | `agent.hooks.enable` | `hoody agent hooks enable --all --session-id abc-123 --nonce <nonce> --scope project` |
| `hoody agent hooks intents create` |  | write | Begin a hook write (nonce) | `agent.hooks.createWriteIntent` | `hoody agent hooks intents create --session-id abc-123 --op upsert --scope project` |
| `hoody agent hooks list` |  | read | List hooks | `agent.hooks.list` | `hoody agent hooks list` |
| `hoody agent hooks reload` |  | write | Reload hooks from disk | `agent.hooks.reload` | `hoody agent hooks reload` |
| `hoody agent hooks rules get` |  | read | Get the tool-call rules of the settings scopes | `agent.hooks.getRules` | `hoody agent hooks rules get` |
| `hoody agent hooks rules set` |  | write | Set the tool-call rules of a settings scope | `agent.hooks.setRules` | `hoody agent hooks rules set --session-id abc-123 --nonce <nonce> --scope project --rules @path.json` |
| `hoody agent hooks run` |  | write | Run a hook command now (this EXECUTES the command; use `agent hooks test` for the shipped-hook dry run) | `agent.hooks.run` | `hoody agent hooks run --session-id abc-123 --event Notification --command 'ls -la'` |
| `hoody agent hooks test` |  | write | Dry-run a shipped hook against a sample command (nothing is executed) | `agent.hooks.test` | `hoody agent hooks test --session-id abc-123 --shipped-id abc-123 --event Notification --command 'ls -la'` |
| `hoody agent hooks trust` |  | write | Acknowledge hook trust | `agent.hooks.trust` | `hoody agent hooks trust --session-id abc-123 --hash <hash> --high-risk` |
| `hoody agent hooks upsert` |  | write | Upsert a hook | `agent.hooks.upsert` | `hoody agent hooks upsert --session-id abc-123 --nonce <nonce> --scope project --event Notification --command 'ls -la' --name my-resource` |
| `hoody agent jev models list` |  | read | List the models Jev can use | `agent.jev.listModels` | `hoody agent jev models list` |
| `hoody agent jev settings get` |  | read | Read the Jev settings and usage | `agent.jev.getSettings` | `hoody agent jev settings get` |
| `hoody agent jev settings update` |  | write | Change the Jev settings | `agent.jev.updateSettings` | `hoody agent jev settings update --enabled --model typesafe/jev-latest` |
| `hoody agent jev test` |  | write | Test Jev with one tiny decision | `agent.jev.test` | `hoody agent jev test --model openai/gpt-5.4-nano` |
| `hoody agent jobs delete` |  | write | Cancel a pending/running job, or delete a finished record | `agent.jobs.delete` | `hoody agent jobs delete --id abc-123` |
| `hoody agent jobs get` |  | read | Get an async job's status | `agent.jobs.get` | `hoody agent jobs get --id abc-123` |
| `hoody agent jobs result get` |  | read | Get an async job's result | `agent.jobs.getResult` | `hoody agent jobs result get --id abc-123` |
| `hoody agent login` |  | write | Sign the container's agent in to Hoody with an API token read from stdin | `agent.signIn` | `hoody agent login -c CONTAINER_ID < token.txt` |
| `hoody agent logs export` |  | read | Export logs to a file | `agent.logs.export` | `hoody agent logs export --min-level debug --text Hello` |
| `hoody agent logs get` |  | read | Read a log entry | `agent.logs.get` | `hoody agent logs get --ref <ref>` |
| `hoody agent logs list` |  | read | Query logs | `agent.logs.list` | `hoody agent logs list --source activity --host example.com` |
| `hoody agent logs sources list` |  | read | Log sources | `agent.logs.listSources` | `hoody agent logs sources list` |
| `hoody agent logs stats` |  | read | Log statistics | `agent.logs.getStats` | `hoody agent logs stats` |
| `hoody agent logs stream` |  | read | Stream the log tail (SSE) _(not listed in `--help`)_ | `agent.logs.stream` | `hoody agent logs stream --source <source> --level <level> --host <host> -o json` |
| `hoody agent loops create` |  | write | Create a loop | `agent.loops.create` | `hoody agent loops create --id abc-123 --prompt <prompt> --interval <interval> --max-runs 10 --stop-when-kind expression` |
| `hoody agent loops delete` |  | write | Delete a loop | `agent.loops.delete` | `hoody agent loops delete --id abc-123 --loop-id abc-123` |
| `hoody agent loops list` |  | read | List loops across all sessions | `agent.loops.list` | `hoody agent loops list --page 10 --limit 10` |
| `hoody agent loops runs start` |  | write | Run a loop immediately | `agent.loops.startRun` | `hoody agent loops runs start --id abc-123 --loop-id abc-123` |
| `hoody agent loops update` |  | write | Update a loop | `agent.loops.update` | `hoody agent loops update --id abc-123 --loop-id abc-123 --paused --expires-in 2h` |
| `hoody agent mcp delete` |  | write | Delete an MCP server (needs a begin-write nonce + expect-hash) | `agent.mcp.deleteServer` | `hoody agent mcp delete --session-id abc-123 --nonce <nonce> --scope user --name my-resource --expect-hash <expect_hash>` |
| `hoody agent mcp disable` |  | write | Disable an MCP server | `agent.mcp.disableServer` | `hoody agent mcp disable --session-id abc-123 --nonce <nonce> --scope user --name my-resource --expect-hash <expect_hash>` |
| `hoody agent mcp enable` |  | write | Enable an MCP server | `agent.mcp.enableServer` | `hoody agent mcp enable --session-id abc-123 --nonce <nonce> --scope user --name my-resource --expect-hash <expect_hash>` |
| `hoody agent mcp import` |  | write | Import MCP servers from a Claude/Cursor/VS Code config (needs a begin-write nonce + expect-hash) | `agent.mcp.importServers` | `hoody agent mcp import --session-id abc-123 --nonce <nonce> --scope user --servers @path.json --expect-hash <expect_hash>` |
| `hoody agent mcp intents create` |  | write | Mint the single-use nonce every MCP write requires | `agent.mcp.createWriteIntent` | `hoody agent mcp intents create --session-id abc-123 --op upsert --scope user` |
| `hoody agent mcp list` |  | read | List configured MCP servers with live connection state | `agent.mcp.listServers` | `hoody agent mcp list --session-id abc-123` |
| `hoody agent mcp preview` |  | read | Preview what a config document would import (writes nothing) | `agent.mcp.previewImport` | `hoody agent mcp preview --session-id abc-123 --document <document>` |
| `hoody agent mcp reconnect` |  | write | Reload MCP config from disk and reconnect live sessions | `agent.mcp.reconnect` | `hoody agent mcp reconnect --session-id abc-123` |
| `hoody agent mcp test` |  | write | Try a candidate MCP server config without saving it (human-only) | `agent.mcp.testServer` | `hoody agent mcp test --session-id abc-123 --server-name my-resource --server-command 'ls -la'` |
| `hoody agent mcp upsert` |  | write | Create or update an MCP server (needs a begin-write nonce + expect-hash) | `agent.mcp.upsertServer` | `hoody agent mcp upsert --session-id abc-123 --nonce <nonce> --scope user --expect-hash <expect_hash> --server-name my-resource` |
| `hoody agent memory consolidate` |  | write | Trigger a memory consolidation pass (human-only) | `agent.memory.consolidate` | `hoody agent memory consolidate --project proj-abc --min-observations 10` |
| `hoody agent memory datahost claim` |  | write | Assign this computer as the memory data host | `agent.memory.claimDataHost` | `hoody agent memory datahost claim --use-self` |
| `hoody agent memory datahost get` |  | read | Read the realm's memory data host | `agent.memory.getDataHost` | `hoody agent memory datahost get` |
| `hoody agent memory disable` |  | write | Disable agent memory | `agent.memory.disable` | `hoody agent memory disable` |
| `hoody agent memory enable` |  | write | Enable agent memory | `agent.memory.enable` | `hoody agent memory enable` |
| `hoody agent memory flush` |  | write | Flush the memory store | `agent.memory.flush` | `hoody agent memory flush` |
| `hoody agent memory graph get` |  | read | Read a project's memory relation graph | `agent.memory.getGraph` | `hoody agent memory graph get --limit 10 --offset 10` |
| `hoody agent memory intents create` |  | write | Mint the single-use intent a guarded memory write requires | `agent.memory.createWriteIntent` | `hoody agent memory intents create --op wipe_project --project proj-abc` |
| `hoody agent memory items create` |  | write | Save a memory item | `agent.memory.createItem` | `hoody agent memory items create --project proj-abc --content Hello --type workflow --ttl-days 10` |
| `hoody agent memory items delete` |  | write | Delete a memory item | `agent.memory.deleteItem` | `hoody agent memory items delete --name my-resource` |
| `hoody agent memory items get` |  | read | Read a memory item | `agent.memory.getItem` | `hoody agent memory items get --id abc-123 --kind create` |
| `hoody agent memory items list` |  | read | List memory items | `agent.memory.listItems` | `hoody agent memory items list --kind create --page 10` |
| `hoody agent memory items update` |  | write | Edit a memory item | `agent.memory.updateItem` | `hoody agent memory items update --id abc-123 --kind memory --content Hello` |
| `hoody agent memory projects delete` |  | destructive | Erase a memory project and everything it owns | `agent.memory.deleteProject` | `hoody agent memory projects delete --project proj-abc --nonce <nonce> -y` |
| `hoody agent memory projects list` |  | read | List memory projects | `agent.memory.listProjects` | `hoody agent memory projects list --page 10 --limit 10` |
| `hoody agent memory search` |  | write | Search memory (hybrid recall) | `agent.memory.search` | `hoody agent memory search --query 'my search' --limit 10` |
| `hoody agent memory status` |  | read | Read memory subsystem status | `agent.memory.getStatus` | `hoody agent memory status` |
| `hoody agent metrics` |  | read | Prometheus metrics | `agent.kit.getMetrics` | `hoody agent metrics` |
| `hoody agent models get` |  | read | Get a model by spec | `agent.models.get` | `hoody agent models get --spec <spec>` |
| `hoody agent models list` |  | read | List models | `agent.models.list` | `hoody agent models list --page 10 --limit 10` |
| `hoody agent open` |  | action | Open the Hoody Agent kit in your browser |  | `hoody agent open` |
| `hoody agent providers accounts add` |  | write | Add an OAuth account to a provider's pool | `agent.providers.addAccount` | `hoody agent providers accounts add --id abc-123` |
| `hoody agent providers accounts list` |  | read | List a provider's OAuth account pool | `agent.providers.listAccounts` | `hoody agent providers accounts list --id abc-123 --page 10 --limit 10` |
| `hoody agent providers accounts remove` |  | write | Remove a pooled OAuth account | `agent.providers.removeAccount` | `hoody agent providers accounts remove --id abc-123 --key <key>` |
| `hoody agent providers accounts use` |  | write | Make a pooled OAuth account active | `agent.providers.useAccount` | `hoody agent providers accounts use --id abc-123 --key <key>` |
| `hoody agent providers auth default set` |  | write | Set a provider's default credential method | `agent.providers.setDefaultAuth` | `hoody agent providers auth default set --id abc-123 --default <default>` |
| `hoody agent providers auth status` |  | read | Get a provider's auth status | `agent.providers.getAuth` | `hoody agent providers auth status --id abc-123` |
| `hoody agent providers create` |  | write | Add a custom AI provider | `agent.providers.create` | `hoody agent providers create --id abc-123 --wire-format chat_completions --endpoint https://api.acme.example/v1 --auth-scheme bearer --models model=llama-3.3-70b` |
| `hoody agent providers delete` |  | destructive | Remove a custom AI provider and its stored key | `agent.providers.delete` | `hoody agent providers delete --id abc-123 -y` |
| `hoody agent providers get` |  | read | Get a provider | `agent.providers.get` | `hoody agent providers get --id abc-123` |
| `hoody agent providers keys delete` |  | write | Delete a provider API key | `agent.providers.deleteApiKey` | `hoody agent providers keys delete --id abc-123` |
| `hoody agent providers keys set` |  | write | Store a provider API key | `agent.providers.setApiKey` | `hoody agent providers keys set --id abc-123 --api-key <api_key>` |
| `hoody agent providers list` |  | read | List LLM providers | `agent.providers.list` | `hoody agent providers list --page 10 --limit 10` |
| `hoody agent providers oauth logout` |  | write | Remove a provider's OAuth login | `agent.providers.logoutOauth` | `hoody agent providers oauth logout --id abc-123` |
| `hoody agent providers oauth poll` |  | read | Poll a provider OAuth login | `agent.providers.pollOauth` | `hoody agent providers oauth poll --id abc-123 --job <job>` |
| `hoody agent providers oauth start` |  | write | Start a provider OAuth login | `agent.providers.startOauth` | `hoody agent providers oauth start --id abc-123 --add-account` |
| `hoody agent providers oauth submit` |  | write | Submit a provider OAuth authorization code | `agent.providers.submitOauthCode` | `hoody agent providers oauth submit --id abc-123 --job <job> --code <code>` |
| `hoody agent providers update` |  | write | Change a custom AI provider | `agent.providers.update` | `hoody agent providers update --id abc-123 --wire-format chat_completions --endpoint https://api.acme.example/v1` |
| `hoody agent realms list` |  | read | List realms (for binding) | `agent.realms.list` | `hoody agent realms list --page 10 --limit 10` |
| `hoody agent realms use` |  | write | Switch the agent's active realm | `agent.realms.use` | `hoody agent realms use --active-realm-id abc-123` |
| `hoody agent sessions aftercompaction set` |  | write | Set the message a session re-adds after every compaction | `agent.sessions.setAfterCompaction` | `hoody agent sessions aftercompaction set --id abc-123 --text Hello` |
| `hoody agent sessions agent set` |  | write | Switch the chat agent | `agent.sessions.setAgent` | `hoody agent sessions agent set --id abc-123 --agent my-agent` |
| `hoody agent sessions approval get` |  | read | Read a session's approval policy | `agent.sessions.getApproval` | `hoody agent sessions approval get --id abc-123` |
| `hoody agent sessions approval rules delete` |  | write | Remove one session permission rule | `agent.sessions.deleteApprovalRule` | `hoody agent sessions approval rules delete --id abc-123 --tool <tool>` |
| `hoody agent sessions approval rules set` |  | write | Set one session permission rule | `agent.sessions.setApprovalRule` | `hoody agent sessions approval rules set --id abc-123 --tool <tool> --decision allow` |
| `hoody agent sessions approval update` |  | write | Set a session's approval mode and lock | `agent.sessions.updateApproval` | `hoody agent sessions approval update --id abc-123 --mode default --locked` |
| `hoody agent sessions approver lease claim` |  | write | Acquire the right to answer this session's gates | `agent.sessions.claimApproverLease` | `hoody agent sessions approver lease claim --id abc-123 --holder <holder> --ttl-ms 100 --replace` |
| `hoody agent sessions approver lease release` |  | write | Release the approver lease | `agent.sessions.releaseApproverLease` | `hoody agent sessions approver lease release --id abc-123` |
| `hoody agent sessions approver lease renew` |  | write | Renew the approver lease | `agent.sessions.renewApproverLease` | `hoody agent sessions approver lease renew --id abc-123 --ttl-ms 100` |
| `hoody agent sessions attachments claim` |  | write | Hold a live session and its parked gate alive | `agent.sessions.claimAttachment` | `hoody agent sessions attachments claim --id abc-123 --ttl-ms 100` |
| `hoody agent sessions attachments release` |  | write | Release an attachment lease | `agent.sessions.releaseAttachment` | `hoody agent sessions attachments release --id abc-123 --lease-id abc-123` |
| `hoody agent sessions attachments renew` |  | write | Renew an attachment lease | `agent.sessions.renewAttachment` | `hoody agent sessions attachments renew --id abc-123 --lease-id abc-123 --ttl-ms 100` |
| `hoody agent sessions autoreply set` |  | write | Arm/disarm the auto-reply loop | `agent.sessions.setAutoReply` | `hoody agent sessions autoreply set --id abc-123 --armed --rounds 10` |
| `hoody agent sessions autoreply writes set` |  | write | Flip the auto-reply write opt-in | `agent.sessions.setAutoReplyWrites` | `hoody agent sessions autoreply writes set --id abc-123 --allow-writes` |
| `hoody agent sessions close` |  | write | Close the session (teardown) | `agent.sessions.close` | `hoody agent sessions close --id abc-123` |
| `hoody agent sessions commands get` |  | read | Get a command's receipt | `agent.sessions.commands.get` | `hoody agent sessions commands get --id abc-123 --command-id abc-123` |
| `hoody agent sessions commands send` |  | write | Send a message, an interrupt or a stop to a session | `agent.sessions.commands.send` | `hoody agent sessions commands send --id abc-123 --idempotency-key <idempotency_key> --kind message --text Hello --close` |
| `hoody agent sessions create` |  | write | Create, fork, or attach a session | `agent.sessions.create` | `hoody agent sessions create --model openai/gpt-5.4-nano --tool-mode standard` |
| `hoody agent sessions delete` |  | write | Delete a session and its stored record (`agent sessions close` only tears the live session down) | `agent.sessions.delete` | `hoody agent sessions delete --id abc-123` |
| `hoody agent sessions directories list` |  | read | List distinct session working directories | `agent.sessions.listDirectories` | `hoody agent sessions directories list` |
| `hoody agent sessions effort set` |  | write | Set reasoning effort | `agent.sessions.setEffort` | `hoody agent sessions effort set --id abc-123 --effort low` |
| `hoody agent sessions env set` |  | write | Toggle Hoody shell-env injection | `agent.sessions.setHoodyEnv` | `hoody agent sessions env set --id abc-123 --enabled` |
| `hoody agent sessions get` |  | read | Get a session summary | `agent.sessions.get` | `hoody agent sessions get --id abc-123` |
| `hoody agent sessions list` |  | read | List sessions | `agent.sessions.list` | `hoody agent sessions list --include-system --page 10` |
| `hoody agent sessions loops list` |  | read | List a session's loops | `agent.sessions.listLoops` | `hoody agent sessions loops list --id abc-123 --page 10 --limit 10` |
| `hoody agent sessions mcp tools list` |  | read | List a session's MCP tools | `agent.sessions.listMcpTools` | `hoody agent sessions mcp tools list --id abc-123 --page 10 --limit 10` |
| `hoody agent sessions model set` |  | write | Switch the session model | `agent.sessions.setModel` | `hoody agent sessions model set --id abc-123 --model anthropic/claude-opus-4-8` |
| `hoody agent sessions rename` |  | write | Rename a session | `agent.sessions.rename` | `hoody agent sessions rename --id abc-123 --name my-resource` |
| `hoody agent sessions replay` |  | read | Replay a live session's buffered events | `agent.sessions.replay` | `hoody agent sessions replay --id abc-123` |
| `hoody agent sessions rules list` |  | read | Show which tool-call rules apply to a session's calls | `agent.sessions.listApplicableRules` | `hoody agent sessions rules list --id abc-123 --agent my-agent` |
| `hoody agent sessions snapshot get` |  | read | Read a session's recoverable state | `agent.sessions.getSnapshot` | `hoody agent sessions snapshot get --id abc-123` |
| `hoody agent sessions stream` |  | read | Attach to a session's event stream (WebSocket / SSE) _(not listed in `--help`)_ | `agent.sessions.connect` | `hoody agent sessions stream --id <sessionId> -o json` |
| `hoody agent sessions tasks cancel` |  | write | Cancel all background tasks | `agent.sessions.cancelTasks` | `hoody agent sessions tasks cancel --id abc-123` |
| `hoody agent sessions tools list` |  | read | List a session's effective tool set | `agent.sessions.listTools` | `hoody agent sessions tools list --id abc-123 --page 10 --limit 10` |
| `hoody agent sessions tools run` |  | write | Run a tool inside a live session (gated) | `agent.sessions.runTool` | `hoody agent sessions tools run --id abc-123 --name my-resource --confirm --allow-mutations` |
| `hoody agent sessions transcript get` |  | read | Read a session's transcript without attaching | `agent.sessions.getTranscript` | `hoody agent sessions transcript get --id abc-123 --after-turn 10` |
| `hoody agent sessions trim` |  | write | Trim session history to a turn index | `agent.sessions.trim` | `hoody agent sessions trim --id abc-123 --turn-idx 10` |
| `hoody agent sessions turns cancel` |  | write | Cancel the active turn (Esc) | `agent.sessions.turns.cancel` | `hoody agent sessions turns cancel --id abc-123` |
| `hoody agent sessions turns create` |  | write | Dispatch a turn (retry-safe with an idempotency key) | `agent.sessions.turns.create` | `hoody agent sessions turns create --id abc-123 --text Hello --tool-mode standard --dir-scope home` |
| `hoody agent sessions turns get` |  | read | Get a turn's durable receipt | `agent.sessions.turns.get` | `hoody agent sessions turns get --id abc-123 --turn-id abc-123` |
| `hoody agent sessions turns list` |  | read | List a session's durable turn receipts | `agent.sessions.turns.list` | `hoody agent sessions turns list --id abc-123 --limit 10` |
| `hoody agent sessions turns run` |  | write | Dispatch a turn and block to completion | `agent.sessions.turns.run` | `hoody agent sessions turns run --id abc-123 --text Hello --tool-mode standard --dir-scope home` |
| `hoody agent sessions turns start` |  | write | Dispatch a turn (fire-and-observe) _(not listed in `--help`)_ | `agent.sessions.startTurn` | `hoody agent sessions turns start --id <sessionId> --text 'Summarize the open todos' -o json` |
| `hoody agent sessions turns start` |  | write | Dispatch the turn and follow the session stream from the dispatch cursor (it does not end with the turn) _(not listed in `--help`)_ | `agent.sessions.startTurnAndStream` | `hoody agent sessions turns start --id <sessionId> --text 'Summarize the open todos' -o json` |
| `hoody agent sessions usage get` |  | read | Read a session's per-call LLM usage and totals | `agent.sessions.getUsage` | `hoody agent sessions usage get --id abc-123 --after-id 10 --limit 10` |
| `hoody agent sessions verbosity set` |  | write | Set response verbosity | `agent.sessions.setVerbosity` | `hoody agent sessions verbosity set --id abc-123 --level normal` |
| `hoody agent sessions workflows start` |  | write | Run a workflow onto an existing session | `agent.sessions.startWorkflow` | `hoody agent sessions workflows start --id abc-123 --name my-resource` |
| `hoody agent sessions yolo set` |  | write | Arm or disarm YOLO auto-approve | `agent.sessions.setYolo` | `hoody agent sessions yolo set --id abc-123 --enabled` |
| `hoody agent settings get` |  | read | Get settings | `agent.settings.get` | `hoody agent settings get` |
| `hoody agent settings update` |  | write | Patch settings | `agent.settings.update` | `hoody agent settings update --patch '{}'` |
| `hoody agent skills create` |  | write | Create a skill | `agent.skills.create` | `hoody agent skills create --name my-resource` |
| `hoody agent skills delete` |  | write | Delete a skill | `agent.skills.delete` | `hoody agent skills delete --root-dir <root_dir> --rel-dir <rel_dir>` |
| `hoody agent skills disable` |  | write | Disable a skill | `agent.skills.disable` | `hoody agent skills disable --name my-resource` |
| `hoody agent skills enable` |  | write | Enable a skill | `agent.skills.enable` | `hoody agent skills enable --name my-resource` |
| `hoody agent skills hub cache clear` |  | write | Clear the skill hub cache | `agent.skills.hub.clearCache` | `hoody agent skills hub cache clear` |
| `hoody agent skills hub cache stats` |  | read | Skill hub cache stats | `agent.skills.hub.getCacheStats` | `hoody agent skills hub cache stats` |
| `hoody agent skills hub install` |  | write | Install a hub skill | `agent.skills.hub.install` | `hoody agent skills hub install --package-digest <package_digest> --overwrite` |
| `hoody agent skills hub preview` |  | read | Preview a hub skill | `agent.skills.hub.preview` | `hoody agent skills hub preview --provider <provider> --source <source> --skill-id abc-123` |
| `hoody agent skills hub search` |  | read | Search the skill hub | `agent.skills.hub.search` | `hoody agent skills hub search --query 'my search'` |
| `hoody agent skills import` |  | write | Apply a skill import | `agent.skills.import` | `hoody agent skills import --source claude --items 'source=<source>' --overwrite` |
| `hoody agent skills list` |  | read | List skills | `agent.skills.list` | `hoody agent skills list --page 10 --limit 10` |
| `hoody agent skills rename` |  | write | Rename a skill | `agent.skills.rename` | `hoody agent skills rename --root-dir <root_dir> --rel-dir <rel_dir> --new-name <new_name>` |
| `hoody agent skills scan` |  | read | Scan for importable skills | `agent.skills.scan` | `hoody agent skills scan --source claude` |
| `hoody agent skills source get` |  | read | Read a skill's source | `agent.skills.getSource` | `hoody agent skills source get` |
| `hoody agent skills source set` |  | write | Write a skill's source | `agent.skills.setSource` | `hoody agent skills source set --root-dir <root_dir> --rel-dir <rel_dir> --content Hello --base-gen 10` |
| `hoody agent skills trust` |  | write | Set a skill's trust state | `agent.skills.trust` | `hoody agent skills trust --root-dir <root_dir> --rel-dir <rel_dir> --trusted` |
| `hoody agent stats` |  | read | Cross-session statistics | `agent.stats.get` | `hoody agent stats --scope cwd` |
| `hoody agent tasks cancel` |  | write | Cancel a background task | `agent.tasks.cancel` | `hoody agent tasks cancel --id abc-123 --tid <tid>` |
| `hoody agent tasks list` |  | read | List a session's background tasks | `agent.tasks.list` | `hoody agent tasks list --id abc-123` |
| `hoody agent tasks transcript get` |  | read | Read a background task's transcript | `agent.tasks.getTranscript` | `hoody agent tasks transcript get --id abc-123 --tid <tid> --after-seq 10` |
| `hoody agent todos archive` |  | write | Archive a todo | `agent.todos.archive` | `hoody agent todos archive --id abc-123 --revision 10` |
| `hoody agent todos archived purge` |  | write | Purge archived todos | `agent.todos.purgeArchived` | `hoody agent todos archived purge` |
| `hoody agent todos cancel` |  | write | Cancel a todo's run | `agent.todos.cancel` | `hoody agent todos cancel --id abc-123` |
| `hoody agent todos claim` |  | write | Claim a todo | `agent.todos.claim` | `hoody agent todos claim --id abc-123 --session-id abc-123 --revision 10` |
| `hoody agent todos comments create` |  | write | Comment on a todo | `agent.todos.createComment` | `hoody agent todos comments create --id abc-123 --text Hello` |
| `hoody agent todos create` |  | write | File a todo | `agent.todos.create` | `hoody agent todos create --title 'My Title' --body 'Details go here' --priority 2` |
| `hoody agent todos get` |  | read | Read a todo | `agent.todos.get` | `hoody agent todos get --id abc-123` |
| `hoody agent todos list` |  | read | List todos | `agent.todos.list` | `hoody agent todos list --states inbox --tags tag1,tag2` |
| `hoody agent todos messages send` |  | write | Comment + run an orchestrator turn | `agent.todos.sendMessage` | `hoody agent todos messages send --id abc-123 --text Hello` |
| `hoody agent todos proposals approve` |  | write | Approve a todo proposal | `agent.todos.approveProposal` | `hoody agent todos proposals approve --id abc-123 --pid 1234` |
| `hoody agent todos proposals deny` |  | write | Deny a todo proposal | `agent.todos.denyProposal` | `hoody agent todos proposals deny --id abc-123 --pid 1234` |
| `hoody agent todos release` |  | write | Release a todo | `agent.todos.release` | `hoody agent todos release --id abc-123 --session-id abc-123 --outcome done` |
| `hoody agent todos revision get` |  | read | Get the todos store revision | `agent.todos.getRevision` | `hoody agent todos revision get` |
| `hoody agent todos snooze` |  | write | Snooze a todo | `agent.todos.snooze` | `hoody agent todos snooze --id abc-123 --wake-at 2026-07-04T09:00:00Z --revision 10` |
| `hoody agent todos start` |  | write | Run a todo's orchestrator | `agent.todos.start` | `hoody agent todos start --id abc-123` |
| `hoody agent todos triage` |  | write | Run an LLM triage pass | `agent.todos.triage` | `hoody agent todos triage` |
| `hoody agent todos update` |  | write | Update a todo (CAS) | `agent.todos.update` | `hoody agent todos update --id abc-123 --revision 10 --title 'My Title' --body 'Details go here'` |
| `hoody agent tools get` |  | read | Get one tool schema | `agent.tools.get` | `hoody agent tools get --name my-resource` |
| `hoody agent tools list` |  | read | List the tool catalogue | `agent.tools.list` | `hoody agent tools list --page 10 --limit 10` |
| `hoody agent tools readonly list` |  | read | List the read-only tool subset | `agent.tools.listReadOnly` | `hoody agent tools readonly list --page 10 --limit 10` |
| `hoody agent tools run` |  | write | Run a tool (sessionless, gated) | `agent.tools.run` | `hoody agent tools run --name my-resource --confirm --allow-mutations` |
| `hoody agent tools start` |  | write | Run a tool asynchronously (sessionless, gated) | `agent.tools.start` | `hoody agent tools start --name my-resource --confirm --allow-mutations` |
| `hoody agent tools stream` |  | write | Run the tool with a streamed result _(not listed in `--help`)_ | `agent.tools.run` | `hoody agent tools stream --name list_todos -c <containerId>` |
| `hoody agent usage accounts list` |  | read | Usage rollup by account | `agent.usage.listByAccount` | `hoody agent usage accounts list --since 1750000000` |
| `hoody agent usage models list` |  | read | Usage rollup by model | `agent.usage.listByModel` | `hoody agent usage models list --since 1750000000` |
| `hoody agent version` |  | read | Agent API version and capabilities | `agent.kit.getVersion` | `hoody agent version` |
| `hoody agent whoami` |  | read | Hoody platform identity and realm scope | `agent.whoami` | `hoody agent whoami` |
| `hoody agent work stop` |  | write | Stop everything running in the realm (loops are paused) | `agent.stopAllWork` | `hoody agent work stop` |
| `hoody agent workflows delete` |  | write | Delete a workflow definition | `agent.workflows.delete` | `hoody agent workflows delete --name my-resource` |
| `hoody agent workflows get` |  | read | Read one workflow definition | `agent.workflows.get` | `hoody agent workflows get --name my-resource --include-revision` |
| `hoody agent workflows hidden set` |  | write | Hide or un-hide a workflow | `agent.workflows.setHidden` | `hoody agent workflows hidden set --name my-resource --hidden` |
| `hoody agent workflows list` |  | read | List workflow definitions | `agent.workflows.list` | `hoody agent workflows list --page 10 --limit 10` |
| `hoody agent workflows messages send` |  | write | Send a message to a running workflow | `agent.workflows.sendMessage` | `hoody agent workflows messages send --id abc-123 --text Hello` |
| `hoody agent workflows runs cancel` |  | write | Cancel a workflow run | `agent.workflows.cancelRun` | `hoody agent workflows runs cancel --run-id abc-123` |
| `hoody agent workflows runs get` |  | read | Get one workflow run by id | `agent.workflows.getRun` | `hoody agent workflows runs get --run-id abc-123` |
| `hoody agent workflows runs list` |  | read | Snapshot in-flight and recent workflow runs | `agent.workflows.listRuns` | `hoody agent workflows runs list --page 10 --limit 10` |
| `hoody agent workflows runs resume` |  | write | Resume a paused workflow run | `agent.workflows.resumeRun` | `hoody agent workflows runs resume --run-id abc-123 --session-id abc-123` |
| `hoody agent workflows set` |  | write | Create or replace a workflow definition | `agent.workflows.set` | `hoody agent workflows set --name my-resource --definition '{}'` |
| `hoody agent workflows start` |  | write | Run a workflow in a new session | `agent.workflows.start` | `hoody agent workflows start --name my-resource --model openai/gpt-5.4-nano --agent my-agent` |
| `hoody agent workflows summary set` |  | write | Set or clear a workflow's summary | `agent.workflows.setSummary` | `hoody agent workflows summary set --name my-resource --summary <summary>` |


---

<!-- ===== namespace: api ===== -->

# `api` — Platform control plane: identity, projects, containers, billing, vault

## Purpose

Control plane outside container kits. Owns identity (signup, login, OAuth, 2FA, auth tokens), project/container hierarchy, proxy permissions, network/firewall/storage, billing, rentals, encrypted user vault, pools. Also exposes account-wide notifications/events/activity inbox. All other namespaces depend on IDs/tokens minted here.

## When to use

- Sign users in through their own browser; mint auth tokens only for unattended automation the user asked for.
- Create/list/mutate/destroy projects, containers, snapshots, proxy-aliases.
- Grant/revoke project/container access; set proxy auth (password/token/JWT/IP).
- Wallet, billing, rental ops.
- User-scoped encrypted vault.
- Account-wide notification/event/activity queries.

## When NOT to use

- File I/O, shell/program, SQLite, GUI/browser, background processes, agent runtime — use `files`, `terminal`/`exec`, `sqlite`, `display`/`browser`, `daemon`, `agent` respectively.

## Prerequisites

- Control plane at `https://api.hoody.com`.
- Bearer token in `Authorization`. Get it from browser sign-in (`hoody auth device start` + `hoody auth device poll`, see `SKILL-CLI.md` § Login; 1d JWT / 7d refresh), or from `POST /api/v1/users/auth/login` (HTTP only; no CLI command) when the user chooses a password login. `hoody auth tokens create` (long-lived, scopable) is for unattended automation only. Starting and polling a browser sign-in needs no bearer token.
- 2FA management (`hoody auth 2fa setup start`, `hoody auth 2fa setup confirm`, `hoody auth 2fa disable`, `hoody auth 2fa backup codes rotate` and the status read) takes a login session JWT, or account-password HTTP Basic auth (which is subject to its own password and 2FA checks); a long-lived `hoody auth tokens create` token is refused with 403 there. On top of that, the bodies differ: `hoody auth 2fa setup start` needs the password; `hoody auth 2fa setup confirm` needs the OTP code; `hoody auth 2fa verify` needs `temp_token` + code; `hoody auth 2fa disable` needs password + OTP **or** backup code; `hoody auth 2fa backup codes rotate` needs password + a **6-digit TOTP only** (`^\\d{6}$` — a backup code fails schema validation with 422). Login-time `hoody auth 2fa verify` needs no session.
- Project/container writes: project owner or matching permission row.
- Billing: prerequisites depend on the operation. A hosted crypto invoice (`hoody wallet payments crypto invoices create`) needs no saved payment method, only a login session (auth tokens are refused 403); server rentals and extensions debit the general wallet balance, so fund it first.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap through the user's browser

1. New user: they sign up and verify their email at `https://api.hoody.com/auth/signup` in their own browser.
2. `hoody auth device start` — give the user `verification_uri_complete` and `user_code`.
3. `hoody auth device poll` every `interval` seconds until it returns the session (`data.token`, `data.refreshToken`); the waiting states are 400 with `data.error`. Steps and states: `SKILL-CLI.md` § Login.
4. Use the session: the CLI saves it for you.
5. `hoody auth whoami`

`hoody login --web --no-browser` runs steps 2 and 3 for you and saves the session.
Never collect the user's password or ask for a pasted token. Fallback the user chooses and runs themselves: `POST /api/v1/auth/signup` (HTTP only; no CLI command) → `hoody auth email verify` → `POST /api/v1/users/auth/login` (HTTP only; no CLI command) (+ `hoody auth 2fa verify` with the `temp_token` when 2FA is on).

### 2. Mint a long-lived auth token (unattended automation only)

1. `hoody auth tokens create`
2. `hoody auth tokens list`
3. `hoody auth tokens realms add`
4. `hoody auth tokens realms remove`
5. `hoody auth tokens copy`
6. `hoody auth tokens delete`

### 3. Set up 2FA

1. `hoody auth 2fa setup start`
2. `hoody auth 2fa setup confirm`
3. `hoody auth 2fa status`
4. `hoody auth 2fa backup codes rotate`
5. `hoody auth 2fa gate enable` / `hoody auth 2fa gate disable`

### 4. Create first project + container

`hoody containers create` needs a `server_id` and a project id; see § Quirks & gotchas.
1. `hoody realms list`
2. `hoody servers list` (pick the `server_id`)
3. `hoody images list` (only when you want a non-default image)
4. `hoody projects create`
5. `hoody containers create` (with `server_id`)
6. `hoody containers start` (when the container is not already running)
7. `hoody containers get`

List the container's proxy aliases by getting it with `include_proxy_domains` set to `true`: `hoody containers get <id> --include-proxy-domains`. The `proxy_domains` array is only populated when `include_proxy_domains` is true, and it holds the aliases created with `hoody proxy aliases create` (each with its `url`), not the built-in kit URLs: a container with no aliases returns an empty array. Build kit URLs from the pattern in § Proxy URLs.

### 5. Grant another user access

Project-scope analogues live under `hoody projects proxy *`. Every proxy-permissions write (steps 6 to 9, and their project-scope analogues) is guarded by optimistic concurrency: it must carry `If-Match: file:v<N>`, where `N` is the document's current `file_version`. Read it with `hoody containers proxy permissions get` (the response carries `file_version` and an `ETag`); each successful write bumps the version and returns the new `ETag`, so pass that one to the next write. A missing header is refused 428, and a malformed or stale one 412. CLI: pass `--if-match file:v<N>`.
1. `hoody projects permissions list`
2. `hoody projects permissions create`
3. `hoody projects permissions update`
4. `hoody projects permissions delete`
5. `hoody containers proxy permissions get` (read `file_version`)
6. `hoody containers proxy groups password set` (If-Match)
7. `hoody containers proxy groups token set` (If-Match)
8. `hoody containers proxy groups jwt set` (If-Match)
9. `hoody containers proxy enable` / `hoody containers proxy disable` (If-Match)

### 6. Container exposure & shares

1. `hoody network update`
2. `hoody network start`
3. `hoody firewall egress create`
4. `hoody firewall ingress create`
5. `hoody proxy aliases create`
6. `hoody proxy aliases enable` / `hoody proxy aliases disable`
7. `hoody storage shares create`
8. `hoody storage containers incoming list` (container-scoped)
9. `hoody storage incoming mount` / `hoody storage incoming unmount`
10. `hoody storage shares delete`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `hoody snapshots create`
2. `hoody snapshots list`
3. `hoody snapshots restore`
4. `hoody containers copy`
5. `hoody snapshots delete`
6. `hoody containers env list`
7. `hoody containers env set`
8. `hoody containers env update`
9. `hoody containers env delete`
10. `hoody containers kvm enable` / `hoody containers kvm disable` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `hoody containers create`.

### 8. Billing: wallet → rent

1. `hoody wallet payments methods create`
2. `hoody wallet payments methods default set`
3. `hoody wallet payments stripe checkout create` (crypto: `hoody wallet payments crypto invoices create`)
4. `hoody wallet payments stripe intents get` (crypto: `hoody wallet payments crypto intents get`)
5. `hoody wallet balances get`
6. `hoody wallet transactions list`
7. `hoody servers marketplace list`
8. `hoody servers rent`
9. `hoody servers list`
10. `hoody servers extend`
11. `hoody servers commands run`

Rentals and extensions are charged to the general balance. Call `hoody wallet credits transfer` only to fund AI usage: it moves money out of that general balance into AI credits, minus a platform fee, so it leaves less for rentals.

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands. ONE exception worth reading before you call it: the notification inbox is NOT uniform CRUD. `hoody inbox list` needs `resources.read_account` on the token (403 without it — the external_customer, dev_team, finance_team and read_only templates all deny it, as do all tokens minted before 2026-06-30), and `hoody inbox mark read` / `hoody inbox mark read` refuse EVERY auth token regardless of permissions, because acknowledging is how the record of an account event is dismissed. `hoody inbox summary` (unread count and newest position, no bodies) is gated on `resources.read_account` the same way. `hoody inbox announcements list` needs no auth, but it returns only public system announcements, not the account inbox, so it is not a substitute for `hoody inbox list`.

## Quirks & gotchas

- Browser sign-in (`hoody auth device poll`) is not RFC 8628 on the wire: send only the JSON fields shown, with no OAuth client or grant fields; the waiting states are HTTP 400 `{"statusCode":400,"data":{"error":"authorization_pending"}}` with the state under `data`, and the success body is a login session (`data.token`, `data.refreshToken`), not `access_token`. `expired_token` also covers a code already redeemed; `access_denied` also covers a missing or wrong PKCE verifier.
- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `POST /api/v1/users/auth/logout` (HTTP only; no CLI command) is a logout-ALL for JWTs — every access and refresh JWT issued before that moment stops working (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `hoody auth tokens delete`). `hoody auth refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. Refresh tokens are single-use: each successful refresh replaces both tokens. Never reuse the old refresh token; reuse returns 401 and, after 30 seconds, signs the account out everywhere. `hoody auth refresh` uses the saved refresh token, or the value given with `--refresh-token`, and sends it in both the body and the `Authorization` header. For unattended automation the user asked for, a long-lived `hoody auth tokens create` token avoids refresh handling.
- `hoody servers regions list` returns `r.data.regions` (single-wrapped, like every other endpoint).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user the stored password is left unchanged (first writer wins) and a fresh verification email is sent; for a verified user it is a no-op. A second signup therefore cannot fix a mistyped password: logging in with the new one fails with 401. Change it through `hoody auth password recover` → `hoody auth password reset`. Do NOT probe with signup.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers: it accepts the bare per-container kit URL, and access is decided by the container's proxy permission policy. No built-in kit asks for more, `bot` included: its management routes ignore an `Authorization` header and check no container ownership, so the proxy permission policy is their only access control. The `hoody containers claims create` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- `hoody containers start`, `hoody containers stop`, `hoody containers restart`, `hoody containers pause` and `hoody containers resume` all call `POST /api/v1/containers/{id}/{operation}`: the operation is the last PATH segment, never a body field, and each method fixes it for you.  The optional body field `timeout` (seconds) caps how long the operation may run on the host; for `stop` and `hoody containers restart` it is also the time the container gets to shut down cleanly. CLI: `hoody containers stop <containerId> --timeout 60` (the id is positional; a plain stop sends `stop`, and `--force` sends `force-stop`).
- A command that acts on one container or project takes its id as a positional: `hoody containers get <containerId>`, `hoody containers stop <containerId>`, `hoody projects get <projectId>`. On `hoody containers get`, `update`, `copy`, `sync`, `stats`, `start`, `stop`, `restart`, `pause` and `resume` the id is optional: left out, it comes from the global `-c` / `--container`, else from `$HOODY_CONTAINER_ID`. `hoody containers delete <containerId> -y` always needs the id typed, and `-c` does not fill it. Commands whose help says `Requires: --container (-c)`, such as `hoody snapshots list`, take no positional container id: they use the global `-c` / `--container`, or `$HOODY_CONTAINER_ID`. Take ids from `hoody containers list` or `hoody projects list`.
- `hoody containers create` needs a `server_id` in its body, and nothing else in workflow 4 produces one: take it from `hoody servers list` (a server you rent). A `name` that another container in the project already uses is refused with 409. `container_image` is optional (omitted, the default image is used); name a public image from `hoody images list`, since `hoody images list` lists only images your account owns and is empty on a new account. A bare `debian` resolves to the canonical base image. CLI flags: `--project <projectId> --server-id <serverId> --container-image debian`.
- Snapshots are addressed by `name`, never by alias: `hoody snapshots restore`, `hoody snapshots delete` and `hoody snapshots alias set` take the `name` that `hoody snapshots list` returns. `hoody snapshots create` derives it from `alias`: it keeps only letters, digits, `_` and `-`, drops any leading or trailing `-` and `_`, and cuts the result to 64 characters. A derived name shorter than 2 characters is refused with 400. With no alias, or one with no usable characters, the name is `snap-YYYYMMDD-HHMMSS` (UTC). In the CLI the name goes in `--name`.
- `hoody snapshots create` needs the container `running` or `stopped` (another status is refused with 400). A container holds at most 1000 snapshots, 10 on a free-tier slice; one more is refused with 400 `CONTAINER_SNAPSHOT_LIMIT` until you delete one.
- `hoody projects create` names the project with `alias` (required, at most 100 characters); there is no `name` field. An alias that one of your projects already uses is refused with 409.
- Kit URL `<projectId>-<containerId>-<kit>-<n>.<server>.containers.hoody.com` (a terminal id of 10000 or more makes that label longer than DNS allows, so it is `t-<n>` instead of `terminal-<n>`; the SDK and CLI do this for you): with the default proxy permissions, holding the URL is enough to use the kit, `bot` management routes included. Treat it as a secret, since it also exposes the project and container ids; restrict it with `hoody containers proxy *` groups, or publish a `hoody proxy aliases create` alias instead.
- `hoody containers proxy services list` lists only the services named in the container's proxy permission rules or hooks, so a container with no custom rules returns `services: []`; it is not a list of running kits. `hoody proxy aliases create` takes the kit or protocol as `program` (e.g. `'exec'`, `'terminal'`, or `'http'` with `port`).
- `hoody wallet invoices list` returns HTTP 200 for never-billed accounts, with an empty `data.invoices` array and pagination metadata in `data.pagination`. `hoody ip get` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `hoody servers offers reserve` charges at once, and every reservation whose total is above zero needs `max_charge_cents`, although the body schema marks it optional. Without it the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED` (409 `SETUP_FEE_CONFIRMATION_REQUIRED` when the offer has a one-time setup fee), and a total above it is refused with 409 `CHARGE_EXCEEDS_MAX`; the error data carries `total_cents`, and nothing is charged. It also needs a caller-generated `idempotency_key`: a retry with the same key returns the first reservation instead of charging again. CLI: `hoody servers offers reserve <offer-id> --days <days> --max-charge-cents <cents> --idempotency-key <key> -y`.
- `hoody servers extend` needs `expected_rental_end`: the rental's current `rental_end`, as `hoody servers get` returns it. The extension is applied only while that still matches, so a retry after a lost response is refused with 409 `EXTENSION_ALREADY_APPLIED` instead of charging twice; read the rental again before retrying. `max_charge_cents` is optional only when the rental's frozen renewal tiers (`renewal_pricing_frozen`) price `additional_days`; otherwise the call is refused with 409 `CHARGE_CONFIRMATION_REQUIRED`, and the error data carries `total_cents`. CLI: read `rental_end` with `hoody servers get <rental-id> -o json`, then run `hoody servers extend <rental-id> --additional-days <days> --expected-rental-end <rental-end> --max-charge-cents <cents> -y`.
- `hoody storage containers incoming list` is container-scoped: its `id` is the receiving container's id. For every incoming share across the account use `hoody storage incoming list`.
- `hoody storage shares get`, `hoody storage shares update`, `hoody storage incoming mount` and `hoody storage incoming unmount` take the share as `--share-id <shareId>` (24 hex characters) plus the global `-c <containerId>`: the source container for get and update, the receiving container for mount and unmount. `hoody storage shares delete` takes the share id as its positional argument and no container. `--enabled` is a boolean: disable a share with `--no-enabled`; `--enabled false` is refused as an extra argument.
- `hoody auth email verify` body has `token` + optional `response_mode`, `code_challenge` (required when `response_mode: 'intent'`) and `client` (analytics source channel) — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `hoody auth 2fa verify`.
- KVM (`PUT /api/v1/containers/{id}/kvm`, field `kvm` on create/responses) is rented/dedicated (bare-metal) servers ONLY — free tier is hard-refused with 403, and the container must be STOPPED to toggle (409 otherwise). Canonical field is `kvm`; `dev_kvm` is an input-only alias (`kvm` wins; both present and disagreeing → 400). Default off.

## Common errors

- 400 — explicit bad-request checks: login "Username or email, and password are required", an unknown signup `region`, a malformed `filter` (below).
- 400 `filter must be valid JSON` / `filter must be a JSON object` — a list's `filter` query parameter must be a JSON object; malformed JSON, `null`, an array or a scalar is refused (it used to be ignored). On lists that allow only some columns, such as `hoody wallet transactions list` and `hoody wallet invoices list`, an unknown column or operator is also 400. An empty `filter=` means no filter.
- 401 — Bearer missing/malformed. JWTs require the literal `Bearer ` prefix; `hdy_…` auth tokens are also accepted bare (`Authorization: hdy_…`).
- 403 — missing permission row or `resources.*` flag.
- 404 — missing resource OR 403 masked.
- 409 — uniqueness (duplicate username, proxy-alias).
- 428 / 412 — on the public routes these come from the If-Match guard on proxy-permission, proxy-settings and proxy-hook writes: 428 means the `If-Match` header is missing, 412 means it is malformed or stale (the document changed since you read it). Re-read the document (`hoody containers proxy permissions get` / `hoody projects proxy permissions get`), send its current `file:v<N>`, and retry. They do not signal a missing payment method, email verification or 2FA.
- 422 — request-schema validation (e.g. a backup code sent where `hoody auth 2fa backup codes rotate` wants a 6-digit TOTP: the body is `{statusCode: 422, error: "Validation Error", message: "Validation failed: …"}`, with no `REQUEST_SCHEMA_INVALID` code on the wire) and semantic validation (password complexity, `rental_days` with no pricing).
- 429 — login 1000/30min (failures only), signup 5/hour, refresh 30/30min.
- 400 — the `events` socket accepts the WebSocket transport only (unless the deployment turns polling on); while polling is off, every long-polling request (with or without a `sid`) is refused with 400 `Polling transport is not supported; use the websocket transport`. Only on a deployment that turns polling on does a polling write with a missing or unknown `sid` get 400 `Unknown session`. Connect with `transports: ['websocket']`.
- Always-200 — `hoody auth password recover`, `hoody auth email verification send`, duplicate-`POST /api/v1/auth/signup` (HTTP only; no CLI command); do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

### `hoody activity` (2) — HTTP activity logs and access statistics

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody activity list` |  | read | Get activity logs | `api.activity.list` | `hoody activity list --page 1 --limit 50` |
| `hoody activity stats` |  | read | Get activity stats | `api.activity.getStats` | `hoody activity stats` |

### `hoody ai` (1) — Hoody AI catalog and models

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ai models list` |  | read | List available AI models (Hoody catalog) | `api.ai.listModels` | `hoody ai models list` |

### `hoody auth` (35) — Authentication, tokens, and 2FA

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody auth 2fa backup codes rotate` |  | action | Regenerate Backup Codes | `api.auth.twoFactor.rotateBackupCodes` | `hoody auth 2fa backup codes rotate --password <password> --code <code> -y` |
| `hoody auth 2fa disable` |  | destructive | Disable 2FA | `api.auth.twoFactor.disable` | `hoody auth 2fa disable --password <password> --code <code> -y` |
| `hoody auth 2fa gate disable` |  | write | Stop requiring two-factor verification to create auth tokens | `api.auth.twoFactor.disableTokenGate` | `hoody auth 2fa gate disable` |
| `hoody auth 2fa gate enable` |  | write | Require two-factor verification to create auth tokens | `api.auth.twoFactor.enableTokenGate` | `hoody auth 2fa gate enable` |
| `hoody auth 2fa setup confirm` |  | action | Complete 2FA Setup | `api.auth.twoFactor.confirmSetup` | `hoody auth 2fa setup confirm --code <code>` |
| `hoody auth 2fa setup start` |  | action | Initialize 2FA Setup | `api.auth.twoFactor.startSetup` | `hoody auth 2fa setup start --password <password>` |
| `hoody auth 2fa status` |  | read | Get 2FA Status | `api.auth.twoFactor.getStatus` | `hoody auth 2fa status` |
| `hoody auth 2fa verify` |  | action | Verify 2FA Code During Login | `api.auth.twoFactor.verify` | `hoody auth 2fa verify --code <code> --response-mode intent --print-token` |
| `hoody auth claims create` |  | action | Issue a signed identity claim bound to an audience | `api.auth.createIdentityClaim` | `hoody auth claims create --audience myapp.example.com --expires-in 3600` |
| `hoody auth config get` |  | read | Show the public sign-in configuration | `api.auth.getConfig` | `hoody auth config get` |
| `hoody auth device poll` |  | action | Poll for device sign-in tokens and save the session | `api.auth.device.poll` | `hoody auth device poll --device-code <device_code> --code-verifier dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk --print-token` |
| `hoody auth device start` |  | action | Start a device sign-in and print the code to enter in a browser | `api.auth.device.start` | `hoody auth device start --code-challenge E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM` |
| `hoody auth email verification send` |  | write | Resend verification email | `api.auth.sendVerificationEmail` | `hoody auth email verification send --email user@example.com` |
| `hoody auth email verify` |  | write | Verify email address | `api.auth.verifyEmail` | `hoody auth email verify --token <token> --response-mode intent --print-token` |
| `hoody auth oauth authorize` |  | action | Begin a PKCE authorization with a sign-in intent token | `api.auth.oauth.authorize` | `hoody auth oauth authorize --code-challenge <code_challenge> --redirect-uri <redirect_uri>` |
| `hoody auth oauth exchange` |  | action | Exchange a PKCE authorization code for a session | `api.auth.oauth.exchange` | `hoody auth oauth exchange --code <code> --code-verifier <code_verifier> --redirect-uri <redirect_uri> --print-token` |
| `hoody auth oauth intents cancel` |  | action | Cancel a pending sign-in intent or 2FA temporary token | `api.auth.oauth.cancelIntent` | `hoody auth oauth intents cancel` |
| `hoody auth password recover` |  | write | Request password reset | `api.auth.recoverPassword` | `hoody auth password recover --email user@example.com` |
| `hoody auth password reset` |  | write | Reset password | `api.auth.resetPassword` | `hoody auth password reset --token <token> --password <password>` |
| `hoody auth refresh` |  | action | Refresh access token | `api.auth.refresh` | `hoody auth refresh --refresh-token <refresh_token> --print-token` |
| `hoody auth tokens copy` |  | write | Copy auth token | `api.auth.tokens.copy` | `hoody auth tokens copy 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --expires-at today` |
| `hoody auth tokens create` |  | write | Create a new auth token | `api.auth.tokens.create` | `hoody auth tokens create --alias clever-dolphin --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens delete` |  | destructive | Delete auth token | `api.auth.tokens.delete` | `hoody auth tokens delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens get` |  | read | Get the calling auth token (no id) or an auth token by id | `api.auth.tokens.getCurrent` | `hoody auth tokens get` |
| `hoody auth tokens get` |  | read | Get auth token by id | `api.auth.tokens.get` | `hoody auth tokens get` |
| `hoody auth tokens list` |  | read | List auth tokens | `api.auth.tokens.list` | `hoody auth tokens list` |
| `hoody auth tokens profiles get` |  | read | Get auth token public profile by public key | `api.auth.tokens.getPublicProfile` | `hoody auth tokens profiles get 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens profiles update` |  | write | Update current auth token public profile | `api.auth.tokens.updatePublicProfile` | `hoody auth tokens profiles update --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth tokens realms add` |  | write | Add realm to auth token | `api.auth.tokens.addRealm` | `hoody auth tokens realms add 64f1a2b3c4d5e6f7a8b9c0d1 --realm-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody auth tokens realms remove` |  | destructive | Remove realm from auth token | `api.auth.tokens.removeRealm` | `hoody auth tokens realms remove 64f1a2b3c4d5e6f7a8b9c0d1 --realm-id 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody auth tokens templates list` |  | read | List auth token permission templates | `api.auth.tokens.listTemplates` | `hoody auth tokens templates list` |
| `hoody auth tokens update` |  | write | Update auth token | `api.auth.tokens.update` | `hoody auth tokens update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |
| `hoody auth waitlist join` |  | write | Join the Hoody waitlist |  | `hoody auth waitlist join --email user@example.com` |
| `hoody auth waitlist update` |  | write | Add interest and role answers to an existing waitlist signup |  | `hoody auth waitlist update --email user@example.com --interest dev --context individual` |
| `hoody auth whoami` |  | read | Get current user profile | `api.auth.whoami` | `hoody auth whoami` |

### `hoody containers` (51) — Container lifecycle, stats, and proxy permissions

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody containers claims create` |  | write | Authorize Container Access | `api.containers.createClaim` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers claims create` |
| `hoody containers copy` |  | write | Copy a container | `api.containers.copy` | `hoody containers copy 64f1a2b3c4d5e6f7a8b9c0d1 --target-project-id 64f1a2b3c4d5e6f7a8b9c0d1 --target-server-id 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource` |
| `hoody containers create` |  | write | Create a new container | `api.containers.create` | `hoody containers create --project abc-123 --server-id abc-123 --name my-resource --color '#ff0000'` |
| `hoody containers delete` |  | destructive | Delete a container | `api.containers.delete` | `hoody containers delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody containers env delete` |  | destructive | Delete a single environment variable | `api.containers.env.delete` | `hoody containers env delete --key <key> -y` |
| `hoody containers env list` |  | read | List container environment variables | `api.containers.env.list` | `hoody --container abc-123 containers env list` |
| `hoody containers env set` |  | write | Set a single environment variable | `api.containers.env.set` | `hoody containers env set --key <key> --value hello` |
| `hoody containers env update` |  | write | Bulk set container environment variables | `api.containers.env.update` | `hoody containers env update --body '{"APP_MODE":"hello"}'` |
| `hoody containers get` |  | read | Get a container by ID or name | `api.containers.get` | `hoody containers get 64f1a2b3c4d5e6f7a8b9c0d1 --include-proxy-domains` |
| `hoody containers kvm disable` |  | write | Disable /dev/kvm passthrough. Rented/dedicated servers only; the container must be stopped. | `api.containers.disableKvm` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers kvm disable` |
| `hoody containers kvm enable` |  | write | Enable /dev/kvm passthrough (run full VMs inside the container). Rented/dedicated servers only; the container must be stopped. | `api.containers.enableKvm` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers kvm enable` |
| `hoody containers list` |  | read | Get all containers | `api.containers.list` | `hoody containers list --page 1 --limit 50` |
| `hoody containers pause` |  | action | Pause a container | `api.containers.pause` | `hoody containers pause 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers proxy default set` |  | write | Update container default proxy permission policy | `api.proxy.containerPermissions.setDefault` | `hoody containers proxy default set --if-match file:v42 --default allow` |
| `hoody containers proxy disable` |  | write | Disable the proxy permissions of a container | `api.proxy.containerPermissions.disable` | `hoody containers proxy disable --if-match file:v42` |
| `hoody containers proxy enable` |  | write | Enable the proxy permissions of a container | `api.proxy.containerPermissions.enable` | `hoody containers proxy enable --if-match file:v42` |
| `hoody containers proxy groups delete` |  | destructive | Remove container authentication group | `api.proxy.containerPermissions.deleteAuthGroup` | `hoody containers proxy groups delete --group-name <group_name> --if-match file:v42 -y` |
| `hoody containers proxy groups ip set` |  | write | Set IP authentication group (container) | `api.proxy.containerPermissions.setIpGroup` | `hoody containers proxy groups ip set --group-name <group_name> --if-match file:v42 --range 192.0.2.0/24` |
| `hoody containers proxy groups jwt set` |  | write | Set JWT authentication group (container) | `api.proxy.containerPermissions.setJwtGroup` | `hoody containers proxy groups jwt set --group-name <group_name> --if-match file:v42 --secret <secret> --algorithm HS256 --sources header:Authorization --claims key=hello --header-authoritative` |
| `hoody containers proxy groups list` |  | read | List container proxy groups | `api.proxy.groups.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy groups list` |
| `hoody containers proxy groups password set` |  | write | Set password authentication group (container) | `api.proxy.containerPermissions.setPasswordGroup` | `hoody containers proxy groups password set --group-name <group_name> --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody containers proxy groups permissions clear` |  | destructive | Remove all program permissions for a container group | `api.proxy.containerPermissions.clearGroupPermissions` | `hoody containers proxy groups permissions clear --group-name <group_name> --if-match file:v42 -y` |
| `hoody containers proxy groups permissions delete` |  | destructive | Remove a single program permission for a container group | `api.proxy.containerPermissions.deleteGroupPermission` | `hoody containers proxy groups permissions delete --group-name <group_name> --program http --if-match file:v42 -y` |
| `hoody containers proxy groups permissions set` |  | write | Set container group program permission | `api.proxy.containerPermissions.setGroupPermission` | `hoody containers proxy groups permissions set --group-name <group_name> --if-match file:v42 --program http --access true` |
| `hoody containers proxy groups token set` |  | write | Set token authentication group (container) | `api.proxy.containerPermissions.setTokenGroup` | `hoody containers proxy groups token set --group-name <group_name> --if-match file:v42 --body '{"header":"X-Api-Key","value":"<token>"}'` |
| `hoody containers proxy hooks create` |  | write | Append or insert a new hook | `api.proxy.hooks.create` | `hoody containers proxy hooks create <service> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody containers proxy hooks delete` |  | destructive | Remove a hook | `api.proxy.hooks.delete` | `hoody containers proxy hooks delete <service> <hook_id> --if-match file:v42 -y` |
| `hoody containers proxy hooks get` |  | read | Get a single hook by id | `api.proxy.hooks.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy hooks get <service> <hook_id>` |
| `hoody containers proxy hooks list` |  | read | List all proxy hooks for a container | `api.proxy.hooks.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy hooks list` |
| `hoody containers proxy hooks move` |  | write | Move a hook to a new position | `api.proxy.hooks.move` | `hoody containers proxy hooks move <service> <hook_id> --if-match file:v42 --position 10` |
| `hoody containers proxy hooks set` |  | write | Replace a hook in place | `api.proxy.hooks.set` | `hoody containers proxy hooks set <service> <hook_id> --if-match file:v42 --match-path /home/user/file.txt --match-headers key=hello --script-path /home/user/file.txt` |
| `hoody containers proxy permissions delete` |  | destructive | Delete container proxy permissions | `api.proxy.containerPermissions.delete` | `hoody containers proxy permissions delete --if-match file:v42 -y` |
| `hoody containers proxy permissions get` |  | read | Get container proxy permissions | `api.proxy.containerPermissions.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy permissions get` |
| `hoody containers proxy permissions set` |  | write | Replace container proxy permissions JSON | `api.proxy.containerPermissions.set` | `hoody containers proxy permissions set --if-match file:v42 --project 64f1a2b3c4d5e6f7a8b9c0d1 --groups 'key={"type":"ip","range":"192.0.2.0/24"}' --permissions 'key={}' --default allow --enable-proxy` |
| `hoody containers proxy services get` |  | read | Get merged proxy view for a service | `api.proxy.services.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy services get <service>` |
| `hoody containers proxy services hooks clear` |  | destructive | Clear all hooks for a service | `api.proxy.hooks.clear` | `hoody containers proxy services hooks clear <service> --if-match file:v42 -y` |
| `hoody containers proxy services hooks list` |  | read | List hooks for a specific service | `api.proxy.hooks.listByService` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy services hooks list <service>` |
| `hoody containers proxy services list` |  | read | List services referenced in proxy config | `api.proxy.services.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy services list` |
| `hoody containers proxy settings get` |  | read | Get container proxy root settings | `api.proxy.settings.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 containers proxy settings get` |
| `hoody containers proxy settings update` |  | write | Update container proxy root settings | `api.proxy.settings.update` | `hoody containers proxy settings update --if-match file:v42 --enable-proxy --default allow` |
| `hoody containers proxy usage` |  | read | Get proxied-usage documents for a container | `api.containers.getProxyUsage` | `hoody containers proxy usage --from <from> --to <to>` |
| `hoody containers restart` |  | action | Restart a container | `api.containers.restart` | `hoody containers restart 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers resume` |  | action | Resume a container | `api.containers.resume` | `hoody containers resume 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers start` |  | action | Start a container | `api.containers.start` | `hoody containers start 64f1a2b3c4d5e6f7a8b9c0d1 --timeout 120` |
| `hoody containers stats` |  | read | Get container resource statistics | `api.containers.getStats` | `hoody containers stats 507f1f77bcf86cd799439011` |
| `hoody containers status history list` |  | read | Get status logs for a container | `api.containers.listStatusHistory` | `hoody containers status history list --page 1 --limit 10` |
| `hoody containers stop` |  | action | Stop a container | `api.containers.stop` | `hoody containers stop 64f1a2b3c4d5e6f7a8b9c0d1 --force --timeout 120` |
| `hoody containers stop` |  | action | Force-stop a container immediately, without waiting for a clean shutdown | `api.containers.stop` | `hoody containers stop 64f1a2b3c4d5e6f7a8b9c0d1 --force --timeout 120` |
| `hoody containers sync` |  | action | Sync a copied container with its source | `api.containers.sync` | `hoody containers sync 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody containers update` |  | write | Update a container | `api.containers.update` | `hoody containers update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --color '#ff0000'` |
| `hoody containers wait` |  | read | Wait until a container reaches a runtime state (running, stopped, paused, failed); prints the result as JSON |  | `hoody containers wait CONTAINER_ID --state running --timeout 120s` |

### `hoody events` (7) — Events and activity logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody events clear` |  | destructive | Bulk delete events | `api.events.clear` | `hoody events clear --event-type container.creating --resource-type container -y` |
| `hoody events delete` |  | destructive | Delete a single event | `api.events.delete` | `hoody events delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody events get` |  | read | Get event details by ID | `api.events.get` | `hoody events get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody events list` |  | read | List event history | `api.events.list` | `hoody events list --limit 100 --offset 0` |
| `hoody events purge` |  | destructive | Cleanup old events | `api.events.purge` | `hoody events purge --retention-days 30 -y` |
| `hoody events stats` |  | read | Get event statistics | `api.events.getStats` | `hoody events stats --start-date 2026-01-01T00:00:00Z --end-date 2026-01-01T00:00:00Z` |
| `hoody events stream` |  | read | Stream events as NDJSON, one event per line, until interrupted (--once exits after the first match) | `events.stream` | `hoody events stream --type 'container.*' --project-id 64f1a2b3c4d5e6f7a8b9c0d1` |

### `hoody firewall` (10) — Container firewall rules — ingress (inbound) and egress (outbound)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody firewall egress create` |  | write | Add Egress Rule | `api.firewall.createEgressRule` | `hoody firewall egress create --action allow --protocol tcp --description 'My description' --destination 192.0.2.0/24 --state enabled` |
| `hoody firewall egress delete` |  | destructive | Remove Egress Rule(s) | `api.firewall.deleteEgressRule` | `hoody firewall egress delete --all --action allow -y` |
| `hoody firewall egress disable` |  | action | Disable an egress firewall rule | `api.firewall.disableEgressRule` | `hoody firewall egress disable --action allow --protocol tcp` |
| `hoody firewall egress enable` |  | action | Enable an egress firewall rule | `api.firewall.enableEgressRule` | `hoody firewall egress enable --action allow --protocol tcp` |
| `hoody firewall ingress create` |  | write | Add Ingress Rule | `api.firewall.createIngressRule` | `hoody firewall ingress create --action allow --protocol tcp --description 'My description' --source 192.0.2.0/24 --state enabled` |
| `hoody firewall ingress delete` |  | destructive | Remove Ingress Rule(s) | `api.firewall.deleteIngressRule` | `hoody firewall ingress delete --all --action allow -y` |
| `hoody firewall ingress disable` |  | action | Disable an ingress firewall rule | `api.firewall.disableIngressRule` | `hoody firewall ingress disable --action allow --protocol tcp` |
| `hoody firewall ingress enable` |  | action | Enable an ingress firewall rule | `api.firewall.enableIngressRule` | `hoody firewall ingress enable --action allow --protocol tcp` |
| `hoody firewall reset` |  | destructive | Reset container firewall | `api.firewall.reset` | `hoody --container abc-123 firewall reset -y` |
| `hoody firewall rules list` |  | read | List container firewall rules | `api.firewall.listRules` | `hoody --container abc-123 firewall rules list` |

### `hoody images` (7) — Container image marketplace (browse, purchase, rate, import, icons)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody images buy` |  | write | Purchase image | `api.images.buy` | `hoody images buy 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody images get` |  | read | Get public image details | `api.images.getPublic` | `hoody images get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images icon get` |  | read | Get image icon | `api.images.getIcon` | `hoody images icon get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images import` |  | write | Import free image | `api.images.import` | `hoody images import 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody images list` |  | read | List public images | `api.images.listPublic` | `hoody images list --mine --os debian` |
| `hoody images list` |  | read | List your own images | `api.images.list` | `hoody images list --mine --os debian` |
| `hoody images rate` |  | write | Rate image | `api.images.rate` | `hoody images rate 64f1a2b3c4d5e6f7a8b9c0d1 --rating 5` |

### `hoody inbox` (5) — Platform account notification inbox

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody inbox announcements list` |  | read | Get all public notifications | `api.inbox.listAnnouncements` | `hoody inbox announcements list` |
| `hoody inbox list` |  | read | Get all notifications for the authenticated user | `api.inbox.list` | `hoody inbox list --limit 20 --unread-only` |
| `hoody inbox mark read` |  | write | Mark a notification as read | `api.inbox.markRead` | `hoody inbox mark read 64f1a2b3c4d5e6f7a8b9c0d1 --all` |
| `hoody inbox mark read` |  | write | Mark every notification as read | `api.inbox.markAllRead` | `hoody inbox mark read 64f1a2b3c4d5e6f7a8b9c0d1 --all` |
| `hoody inbox summary` |  | read | Show the unread notification count and newest position | `api.inbox.getSummary` | `hoody inbox summary` |

### `hoody ip` (1) — IP address management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ip get` |  | read | Get IP Information | `api.ip.get` | `hoody ip get` |

### `hoody meta` (4) — API metadata and signing keys

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody meta config get` |  | read | Get the Hoody public configuration map |  | `hoody meta config get` |
| `hoody meta config values get` |  | read | Get one public configuration value |  | `hoody meta config values get <key>` |
| `hoody meta key get` |  | read | Get Hoody API Signing Public Key | `api.meta.getPublicKey` | `hoody meta key get` |
| `hoody meta social stats` |  | read | Show public Hoody social channel counters |  | `hoody meta social stats` |

### `hoody network` (5) — Container network configuration

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody network delete` |  | destructive | Remove container network configuration | `api.network.delete` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network delete -y` |
| `hoody network get` |  | read | Get container network configuration | `api.network.get` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network get` |
| `hoody network start` |  | action | Start container network proxy/blocking | `api.network.start` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network start` |
| `hoody network stop` |  | action | Stop container network proxy/blocking | `api.network.stop` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 network stop -y` |
| `hoody network update` |  | write | Update container network configuration | `api.network.update` | `hoody network update --type socks5 --proxy socks5://proxy.example.com:1080 --region eu-west-1` |

### `hoody pools` (11) — Pool management and invitations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pools create` |  | write | Create pool | `api.pools.create` | `hoody pools create --name my-resource --description 'My description' --settings key=hello` |
| `hoody pools delete` |  | destructive | Delete pool | `api.pools.delete` | `hoody pools delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools get` |  | read | Get pool details | `api.pools.get` | `hoody pools get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations accept` |  | action | Accept invitation | `api.pools.invitations.accept` | `hoody pools invitations accept 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools invitations list` |  | read | List pending invitations | `api.pools.invitations.list` | `hoody pools invitations list` |
| `hoody pools invitations reject` |  | action | Reject invitation | `api.pools.invitations.reject` | `hoody pools invitations reject 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody pools list` |  | read | List user pools | `api.pools.list` | `hoody pools list` |
| `hoody pools members invite` |  | write | Invite member | `api.pools.members.invite` | `hoody pools members invite 64f1a2b3c4d5e6f7a8b9c0d1 --username alice --role admin` |
| `hoody pools members remove` |  | destructive | Remove member | `api.pools.members.remove` | `hoody pools members remove 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody pools members role set` |  | write | Update member role | `api.pools.members.setRole` | `hoody pools members role set 64f1a2b3c4d5e6f7a8b9c0d1 64f1a2b3c4d5e6f7a8b9c0d1 --role admin` |
| `hoody pools update` |  | write | Update pool | `api.pools.update` | `hoody pools update 64f1a2b3c4d5e6f7a8b9c0d1 --description 'My description'` |

### `hoody projects` (25) — Manage projects

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody projects create` |  | write | Create a new project | `api.projects.create` | `hoody projects create --alias Production --color '#ff0000' --max-containers 10` |
| `hoody projects delete` |  | destructive | Delete project | `api.projects.delete` | `hoody projects delete 64f1a2b3c4d5e6f7a8b9c0d1 --include-deleted-items -y` |
| `hoody projects get` |  | read | Get project by ID | `api.projects.get` | `hoody projects get 64f1a2b3c4d5e6f7a8b9c0d1 --include-permissions` |
| `hoody projects list` |  | read | List all projects | `api.projects.list` | `hoody projects list --page 1 --limit 10` |
| `hoody projects permissions create` |  | write | Grant project access | `api.projects.createPermission` | `hoody projects permissions create --project 64f1a2b3c4d5e6f7a8b9c0d1 --user-id 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects permissions delete` |  | destructive | Revoke project access | `api.projects.deletePermission` | `hoody projects permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --permission-id 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody projects permissions list` |  | read | List project permissions | `api.projects.listPermissions` | `hoody projects permissions list --page 10 --limit 10 --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects permissions update` |  | write | Update project permission | `api.projects.updatePermission` | `hoody projects permissions update --project 64f1a2b3c4d5e6f7a8b9c0d1 --permission-id 64f1a2b3c4d5e6f7a8b9c0d1 --permission-level read` |
| `hoody projects proxy default set` |  | write | Update project default proxy permission policy | `api.proxy.projectPermissions.setDefault` | `hoody projects proxy default set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --default allow` |
| `hoody projects proxy disable` |  | write | Disable the proxy permissions of a project | `api.proxy.projectPermissions.disable` | `hoody projects proxy disable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy enable` |  | write | Enable the proxy permissions of a project | `api.proxy.projectPermissions.enable` | `hoody projects proxy enable --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42` |
| `hoody projects proxy groups delete` |  | destructive | Remove project authentication group | `api.proxy.projectPermissions.deleteAuthGroup` | `hoody projects proxy groups delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 -y` |
| `hoody projects proxy groups ip set` |  | write | Set IP authentication group (project) | `api.proxy.projectPermissions.setIpGroup` | `hoody projects proxy groups ip set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --range 192.0.2.0/24` |
| `hoody projects proxy groups jwt set` |  | write | Set JWT authentication group (project) | `api.proxy.projectPermissions.setJwtGroup` | `hoody projects proxy groups jwt set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --secret <secret> --algorithm HS256 --sources header:Authorization --claims key=hello --header-authoritative` |
| `hoody projects proxy groups password set` |  | write | Set password authentication group (project) | `api.proxy.projectPermissions.setPasswordGroup` | `hoody projects proxy groups password set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody projects proxy groups permissions clear` |  | destructive | Remove all program permissions for a project group | `api.proxy.projectPermissions.clearGroupPermissions` | `hoody projects proxy groups permissions clear --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 -y` |
| `hoody projects proxy groups permissions delete` |  | destructive | Remove a single program permission for a project group | `api.proxy.projectPermissions.deleteGroupPermission` | `hoody projects proxy groups permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --program http --if-match file:v42 -y` |
| `hoody projects proxy groups permissions set` |  | write | Set project group program permission | `api.proxy.projectPermissions.setGroupPermission` | `hoody projects proxy groups permissions set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --program http --access true` |
| `hoody projects proxy groups token set` |  | write | Set token authentication group (project) | `api.proxy.projectPermissions.setTokenGroup` | `hoody projects proxy groups token set --project 64f1a2b3c4d5e6f7a8b9c0d1 --group-name <group_name> --if-match file:v42 --body '{"header":"X-Api-Key","value":"<token>"}'` |
| `hoody projects proxy permissions delete` |  | destructive | Delete project proxy permissions | `api.proxy.projectPermissions.delete` | `hoody projects proxy permissions delete --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 -y` |
| `hoody projects proxy permissions get` |  | read | Get project proxy permissions | `api.proxy.projectPermissions.get` | `hoody projects proxy permissions get --project 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody projects proxy permissions set` |  | write | Replace project proxy permissions JSON | `api.proxy.projectPermissions.set` | `hoody projects proxy permissions set --project 64f1a2b3c4d5e6f7a8b9c0d1 --if-match file:v42 --groups 'key={"type":"ip","range":"192.0.2.0/24"}' --permissions 'key={}' --default allow --enable-proxy` |
| `hoody projects proxy usage` |  | read | Get proxied-usage documents for every container in a project | `api.projects.getProxyUsage` | `hoody projects proxy usage 64f1a2b3c4d5e6f7a8b9c0d1 --from <from> --to <to>` |
| `hoody projects stats` |  | read | Get statistics for all containers in a project | `api.projects.getStats` | `hoody projects stats 507f1f77bcf86cd799439033` |
| `hoody projects update` |  | write | Update project | `api.projects.update` | `hoody projects update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --color '#ff0000' --max-containers 10` |

### `hoody proxy` (7) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy aliases create` |  | write | Create a new proxy alias | `api.proxy.aliases.create` | `hoody --container-id 64f1a2b3c4d5e6f7a8b9c0d1 proxy aliases create --program <program> --target-path /home/user/file.txt --expires-at 2026-01-01T00:00:00Z` |
| `hoody proxy aliases delete` |  | destructive | Delete proxy alias | `api.proxy.aliases.delete` | `hoody proxy aliases delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody proxy aliases disable` |  | write | Disable a proxy alias | `api.proxy.aliases.disable` | `hoody proxy aliases disable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases enable` |  | write | Enable a proxy alias | `api.proxy.aliases.enable` | `hoody proxy aliases enable 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases get` |  | read | Get proxy alias by ID | `api.proxy.aliases.get` | `hoody proxy aliases get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody proxy aliases list` |  | read | List proxy aliases | `api.proxy.aliases.list` | `hoody proxy aliases list --project-id 64f1a2b3c4d5e6f7a8b9c0d1 --enabled` |
| `hoody proxy aliases update` |  | write | Update proxy alias | `api.proxy.aliases.update` | `hoody proxy aliases update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --index 10` |

### `hoody realms` (1) — Platform realms

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody realms list` |  | read | List your realm IDs | `api.realms.list` | `hoody realms list --include-usage` |

### `hoody servers` (25) — Server rental marketplace, rentals, and remote commands

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody servers commands list` |  | read | Get available commands | `api.servers.commands.list` | `hoody servers commands list 64f1a2b3c4d5e6f7a8b9c0d1 --category general --risk-level low` |
| `hoody servers commands run` |  | action | Execute server command | `api.servers.commands.run` | `hoody servers commands run 64f1a2b3c4d5e6f7a8b9c0d1 --command-id 64f1a2b3c4d5e6f7a8b9c0d1 --wait --timeout 10` |
| `hoody servers extend` |  | write | Extend rental | `api.servers.extend` | `hoody servers extend 64f1a2b3c4d5e6f7a8b9c0d1 --expected-rental-end <expected_rental_end> --additional-days 10 -y` |
| `hoody servers get` |  | read | Get server details | `api.servers.get` | `hoody servers get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers jobs get` |  | read | Show the status of a paid subserver operation | `api.servers.jobs.get` | `hoody servers jobs get abc-123` |
| `hoody servers list` |  | read | List user servers | `api.servers.list` | `hoody servers list` |
| `hoody servers marketplace list` |  | read | Browse rental marketplace | `api.servers.listMarketplace` | `hoody servers marketplace list --country US --region us-east` |
| `hoody servers offers list` |  | read | List machines available to order | `api.servers.offers.list` | `hoody servers offers list` |
| `hoody servers offers reserve` |  | write | Reserve an offer and charge your wallet immediately | `api.servers.offers.reserve` | `hoody servers offers reserve abc-123 --days 10 --max-charge-cents 10 --idempotency-key <idempotency_key> -y` |
| `hoody servers plans list` |  | read | List the paid subserver plans you can buy | `api.servers.plans.list` | `hoody servers plans list` |
| `hoody servers plans quote` |  | read | Quote the price of a paid subserver plan | `api.servers.plans.quote` | `hoody servers plans quote --plan-id abc-123` |
| `hoody servers regions list` |  | read | Get available server regions | `api.servers.listRegions` | `hoody servers regions list` |
| `hoody servers rent` |  | write | Rent server | `api.servers.rent` | `hoody servers rent 64f1a2b3c4d5e6f7a8b9c0d1 --pool-id 64f1a2b3c4d5e6f7a8b9c0d1 --rental-days 10 -y` |
| `hoody servers reservations get` |  | read | Show one of your reservations | `api.servers.reservations.get` | `hoody servers reservations get abc-123` |
| `hoody servers reservations list` |  | read | List your reservations | `api.servers.reservations.list` | `hoody servers reservations list --limit 50 --offset 0` |
| `hoody servers stats` |  | read | Live CPU, memory and disk usage of a rental | `api.servers.getStats` | `hoody servers stats 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody servers subscriptions autorenew disable` |  | destructive | Turn off auto-renew for a server subscription | `api.servers.subscriptions.disableAutoRenew` | `hoody servers subscriptions autorenew disable abc-123 -y` |
| `hoody servers subscriptions autorenew enable` |  | destructive | Turn on auto-renew for a server subscription | `api.servers.subscriptions.enableAutoRenew` | `hoody servers subscriptions autorenew enable abc-123 -y` |
| `hoody servers subscriptions buy` |  | write | Buy a paid subserver and charge your wallet immediately | `api.servers.subscriptions.buy` | `hoody servers subscriptions buy --plan-id abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |
| `hoody servers subscriptions cancel` |  | destructive | Cancel a paid subserver subscription (no refund; held after the paid period) | `api.servers.subscriptions.cancel` | `hoody servers subscriptions cancel abc-123 -y` |
| `hoody servers subscriptions get` |  | read | Show one of your paid subserver subscriptions | `api.servers.subscriptions.get` | `hoody servers subscriptions get abc-123` |
| `hoody servers subscriptions list` |  | read | List your paid subserver subscriptions | `api.servers.subscriptions.list` | `hoody servers subscriptions list --limit 50 --offset 0` |
| `hoody servers subscriptions pay` |  | write | Pay a held subscription and resume it (charges one month) | `api.servers.subscriptions.pay` | `hoody servers subscriptions pay abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |
| `hoody servers subscriptions quote` |  | read | Quote an upgrade of, or a payment for, a subscription | `api.servers.subscriptions.quote` | `hoody servers subscriptions quote abc-123 --action upgrade` |
| `hoody servers subscriptions upgrade` |  | write | Upgrade a paid subserver and charge the difference | `api.servers.subscriptions.upgrade` | `hoody servers subscriptions upgrade abc-123 --plan-id abc-123 --idempotency-key <idempotency_key> --max-charge-cents 10 -y` |

### `hoody snapshots` (5) — Container snapshots

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody snapshots alias set` |  | write | Update snapshot alias | `api.snapshots.setAlias` | `hoody snapshots alias set --name my-resource --alias my-resource` |
| `hoody snapshots create` |  | write | Create container snapshot | `api.snapshots.create` | `hoody snapshots create --alias my-resource --expiry 10` |
| `hoody snapshots delete` |  | destructive | Delete container snapshot | `api.snapshots.delete` | `hoody snapshots delete --name my-resource -y` |
| `hoody snapshots list` |  | read | Get container snapshots | `api.snapshots.list` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 snapshots list` |
| `hoody snapshots restore` |  | action | Restore container from snapshot | `api.snapshots.restore` | `hoody snapshots restore --name my-resource -y` |

### `hoody storage` (10) — Storage shares

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody storage containers incoming list` |  | read | Get incoming shares | `api.storage.shares.listIncomingByContainer` | `hoody --container 64f1a2b3c4d5e6f7a8b9c0d1 storage containers incoming list` |
| `hoody storage containers shares list` |  | read | List storage shares | `api.storage.shares.listByContainer` | `hoody storage containers shares list --target-type container --label my-label` |
| `hoody storage incoming list` |  | read | Get all incoming shares | `api.storage.shares.listIncoming` | `hoody storage incoming list` |
| `hoody storage incoming mount` |  | action | Mount an incoming share into the container | `api.storage.shares.mountIncoming` | `hoody storage incoming mount --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage incoming unmount` |  | action | Unmount an incoming share from the container | `api.storage.shares.unmountIncoming` | `hoody storage incoming unmount --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares create` |  | write | Create storage share | `api.storage.shares.create` | `hoody storage shares create --source-path /home/user/file.txt --target-container-id 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |
| `hoody storage shares delete` |  | destructive | Delete storage share | `api.storage.shares.delete` | `hoody storage shares delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody storage shares get` |  | read | Get storage share | `api.storage.shares.get` | `hoody storage shares get --share-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody storage shares list` |  | read | List all storage shares you have created, across all your containers | `api.storage.shares.list` | `hoody storage shares list` |
| `hoody storage shares update` |  | write | Update storage share | `api.storage.shares.update` | `hoody storage shares update --share-id 64f1a2b3c4d5e6f7a8b9c0d1 --mode readonly --alias my-resource` |

### `hoody users` (7) — User management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody users free tier status` |  | read | Show whether this account can claim a free server | `api.users.getFreeTierStatus` | `hoody users free tier status` |
| `hoody users get` |  | read | Get user by ID | `api.users.get` | `hoody users get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody users invites redeem` |  | write | Redeem a free-tier invite code to claim your free server | `api.users.redeemInvite` | `hoody users invites redeem --code HOODY-7Q4K-9F2M-3B8T-XR5W-2HKD-1` |
| `hoody users onboarding milestones complete` |  | write | Mark an onboarding milestone as completed | `api.users.completeOnboardingMilestone` | `hoody users onboarding milestones complete --milestone hub_tour_v1` |
| `hoody users security history list` |  | read | List your account sign-ins and security events | `api.users.listSecurityHistory` | `hoody users security history list --page 1 --limit 50` |
| `hoody users setup retry` |  | write | Retry free-tier account setup | `api.users.retrySetup` | `hoody users setup retry --region eu-west-1` |
| `hoody users update` |  | write | Update user profile | `api.users.update` | `hoody users update 64f1a2b3c4d5e6f7a8b9c0d1 --alias my-resource --public-key 4a1f8c2d3e5b6079a1c2d3e4f50617283940a1b2c3d4e5f60718293a4b5c6d7e` |

### `hoody vault` (6) — Secure key-value vault

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vault clear` |  | destructive | Clear entire vault | `api.vault.clear` | `hoody vault clear -y` |
| `hoody vault delete` |  | destructive | Delete vault key | `api.vault.delete` | `hoody vault delete <key> -y` |
| `hoody vault get` |  | read | Get vault key | `api.vault.get` | `hoody vault get <key>` |
| `hoody vault list` |  | read | List vault keys | `api.vault.list` | `hoody vault list` |
| `hoody vault set` |  | write | Set vault key | `api.vault.set` | `hoody vault set <key> --value '{"api_key": "sk_test_123456", "encrypted": true}'` |
| `hoody vault stats` |  | read | Get vault statistics | `api.vault.getStats` | `hoody vault stats` |

### `hoody wallet` (26) — Balances, transactions, payments, and invoices

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody wallet balance get` |  | read | Get general balance only | `api.wallet.getBalance` | `hoody wallet balance get` |
| `hoody wallet balances get` |  | read | Get aggregate balances (general + AI) | `api.wallet.getBalances` | `hoody wallet balances get` |
| `hoody wallet credits fees list` |  | read | List AI credit fee history (platform fees charged on AI transfers) | `api.wallet.listCreditFees` | `hoody wallet credits fees list --page 1 --limit 20` |
| `hoody wallet credits get` |  | read | Get AI balance (limit, usage, remaining) | `api.wallet.getCredits` | `hoody wallet credits get` |
| `hoody wallet credits transfer` |  | write | Transfer from general balance to AI credits | `api.wallet.transferToCredits` | `hoody wallet credits transfer --amount 10.00 --expected-fee-bps 10 -y` |
| `hoody wallet github bonus claim` |  | action | Claim the one-time GitHub connection bonus | `api.wallet.claimGithubBonus` | `hoody wallet github bonus claim` |
| `hoody wallet github bonus status` |  | read | Show the status of the GitHub connection bonus | `api.wallet.getGithubBonus` | `hoody wallet github bonus status` |
| `hoody wallet invoices create` |  | action | Generate invoice for transaction | `api.wallet.createInvoice` | `hoody wallet invoices create 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices download` |  | read | Download invoice PDF | `api.wallet.downloadInvoice` | `hoody wallet invoices download 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices get` |  | read | Get invoice by ID | `api.wallet.getInvoice` | `hoody wallet invoices get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet invoices list` |  | read | Get all invoices | `api.wallet.listInvoices` | `hoody wallet invoices list --page 1 --limit 20` |
| `hoody wallet payments availability get` |  | read | Which payment rails are available to this account right now | `api.wallet.getPaymentAvailability` | `hoody wallet payments availability get` |
| `hoody wallet payments crypto intents get` |  | read | Get one crypto payment intent | `api.wallet.getCryptoPaymentIntent` | `hoody wallet payments crypto intents get 665f1f77bcf86cd799439012` |
| `hoody wallet payments crypto intents list` |  | read | List your crypto payment intents | `api.wallet.listCryptoPaymentIntents` | `hoody wallet payments crypto intents list --limit 20 --offset 0` |
| `hoody wallet payments crypto invoices create` |  | write | Create a crypto payment invoice to add funds | `api.wallet.createCryptoInvoice` | `hoody wallet payments crypto invoices create --amount 25.00 -y` |
| `hoody wallet payments methods create` |  | write | Add a new payment method | `api.wallet.createPaymentMethod` | `hoody wallet payments methods create --type credit_card --name my-resource --is-default` |
| `hoody wallet payments methods default set` |  | write | Set a payment method as default | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payments methods default set 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods delete` |  | destructive | Delete a payment method | `api.wallet.deletePaymentMethod` | `hoody wallet payments methods delete 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody wallet payments methods get` |  | read | Get payment method by ID | `api.wallet.getPaymentMethod` | `hoody wallet payments methods get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet payments methods list` |  | read | Get all payment methods | `api.wallet.listPaymentMethods` | `hoody wallet payments methods list --page 1 --limit 100` |
| `hoody wallet payments methods update` |  | write | Update a payment method | `api.wallet.updatePaymentMethod` | `hoody wallet payments methods update 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --status active` |
| `hoody wallet payments stripe checkout create` |  | write | Start a Stripe checkout to add funds (returns the checkout URL) | `api.wallet.createStripeCheckout` | `hoody wallet payments stripe checkout create --amount 25.00 -y` |
| `hoody wallet payments stripe intents get` |  | read | Get one Stripe payment intent | `api.wallet.getStripePaymentIntent` | `hoody wallet payments stripe intents get 665f1f77bcf86cd799439011` |
| `hoody wallet payments stripe intents list` |  | read | List your Stripe payment intents | `api.wallet.listStripePaymentIntents` | `hoody wallet payments stripe intents list --limit 20 --offset 0` |
| `hoody wallet transactions get` |  | read | Get transaction by ID | `api.wallet.getTransaction` | `hoody wallet transactions get 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody wallet transactions list` |  | read | List transactions | `api.wallet.listTransactions` | `hoody wallet transactions list --page 1 --limit 20` |


---

<!-- ===== namespace: bot ===== -->

# `bot` — chat-app control of a container, Telegram first

## Purpose

This namespace puts the command surface the SDK publishes under chat control. An operator registers a channel bot against one container, starts its long-poll loop, and from then on a chat user who logs in through that bot runs those commands from the chat app. The kit adds no identity of its own: a chat user logs in as themselves, and every command runs with that user's own credential (the token their login minted, or an existing token they pasted), inside a risk gate that decides per command whether it needs a tapped or a typed confirmation first.

Two surfaces share the name. The seventeen operations documented here are the operator's side, and every one of them answers on the container's own bot kit URL. The chat side is not an API: it is the published command list a chat user reaches by typing a slash command, tapping a menu entry, or opening a webview.

Telegram is the channel `hoody bot create` accepts today. The channel layer is written to take others, so treat the vocabulary as chat-app neutral and the current enum as the one implemented channel.

## When to use

- Register a channel bot against a container, then start or stop its poll loop.
- Bound who the bot answers: mode plus the user and chat allowlists, read and written as one policy document.
- Publish the command lists and the bot profile to the channel, and read back what the channel actually stored.
- Audit what chat users did, and cut one user off or revoke every lineage the registration minted.
- Operate the stored credentials: rotate the kit key, or read the chat manifest this build is pinned to.

## When NOT to use

- To ask a question about Hoody at a terminal → `hoody chat` is a documentation assistant with its own provider auth. It shares nothing with this namespace.
- To drive the AI agent from code → see `agent`. The bot hands a chat user the agent; it is not the agent's API.
- To push a one-way message at a person → see `notifications`.
- To run one command from a script or a cron job → call the namespace that owns it. Routing it through a chat app adds an audit row and, for any command whose risk calls for one, a confirmation step, and nothing else.

## Prerequisites

- A container running the bot kit. The binary refuses to start outside a Hoody container, so a local process is never the thing you are talking to.
- A channel bot token issued by the chat platform. It is sent once in the `hoody bot create` body over HTTPS, validated against the channel before anything is stored, encrypted at rest, and never returned by any later read.
- No credential for the management routes. The kit checks no bearer token and no container ownership: an `Authorization` header is ignored, not refused, and whoever the proxy lets reach the bot URL can register, start, stop and delete bots. The container's proxy permission rules are the access control, so set one before exposing the URL.
- Nothing for `hoody bot health` either. It answers nine fields.

## Capability URL

`https://{projectId}-{containerId}-bot-{n}.{node}.containers.hoody.com` → see `SKILL-CLI.md § Proxy URLs` for the full methodology. As with most kits, the kit itself authenticates no caller: what the proxy admits to this URL can use every management operation, and management operations address every registration stored on this kit.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register a bot and bring it up

Create the bot in the chat app first and keep its token. `hoody bot create` takes the channel name, that token, and an optional label; it verifies the token with the channel, stores it sealed, and answers with a registration id. `hoody bot start` records the intent to poll and starts the worker: 200 means a poller is running, while 202 means the intent was stored but this build wired no poller, so nothing is polling (the answer is marked `polling: "unavailable"` and health reports `polling.active: 0`). Check which one you got before relying on the bot. `hoody bot stop` ends polling. `hoody bot list` and `hoody bot get` report what exists and each registration's stored `state` (the running or stopped intent, not proof of a worker); health's `polling.active` is the count of pollers actually running.

### 2. Decide who the bot serves

`hoody bot policy update` writes the mode and the two allowlists; `hoody bot policy get` reads them back as the gate enforces them. Read the null cases carefully, because they are not symmetrical: a null user list admits every user, while a null chat list means direct messages only, so a group is served only once the chat list names it. An empty array is an allowlist that admits nobody. A non-empty chat list is exhaustive and covers direct messages too, whose chat id is the user's own id.

### 3. Publish the command list and the profile

`hoody bot commands sync` runs the one publication reconciliation and answers with what changed, not with the stored contents: the scope keys it wrote, left unchanged and deleted, the entries it trimmed or rejected, and whether the menu button and the stored profile were republished (`menu_button_changed`, `profile_changed`). It is idempotent, so a second run reports no change. `hoody bot profile update` sets the bot's name, its two descriptions, the language tag they belong to, and the default administrator rights, then publishes them the same way.

### 4. Audit, then cut someone off

`hoody bot logs list` pages the redacted per-actor log newest first; the cursor is the previous page's `next_before_id`, and the actor filter matches the stored `actor` value exactly, which carries the channel prefix: for Telegram `telegram:<user id>`, not the bare id. `hoody bot sessions revoke` logs one chat user out: it clears their stored login and sessions and tries to delete the working token minted for them. It does not remove everything that user holds, so read the answer: `leaf_deleted` says whether the working token went, and `manual_deletes` lists the token ids the kit cannot remove itself (the parent token of a minted login, a pasted token, and a working token whose deletion failed), which must be deleted through the account's token management (see `api`). It takes the channel's own user id WITHOUT the prefix, so strip `telegram:` from an actor value copied out of the audit log (and add it back to filter the log by a user id). `hoody bot tokens revoke` does the same for every chat user of the registration, listing the users whose teardown failed in `failed` and every leftover token id in `manual_deletes`. `hoody bot logs purge` deletes the entries at or below a cutoff: `older_than` is an absolute epoch-millisecond timestamp, not an age, and defaults to the 90-day retention boundary. With `all=true` and no `older_than` the cutoff is the current time, so the registration's whole audit log is deleted.

### 5. Rotate the kit key

`hoody bot keys rotate` re-encrypts every sealed column under a new key. The new key is published beside the old one, the re-encryption and the generation marker commit together, and only then is the new key promoted, so an interrupted rotation is finished or rolled back at the next start instead of losing every stored credential.

### 6. Confirm what the build is pinned to

`hoody bot manifest get` serves the chat manifest this build was packaged against, and `hoody bot health` reports its hash among the nine fields. The CLI's own verify flag recomputes the digest from the served bytes and compares it with both the pin baked into the CLI and the hash health reports.

## Quirks & gotchas

- The operation commands a chat user can send come from the published command manifest, which mirrors the CLI, so an operation that does not exist in the CLI cannot be typed in chat either. Chat adds its own built-ins on top: menu, search, recent, call, help, plain, and the subscription commands.
- Confirmation is a property of the command, not of the user. Each manifest command carries a risk class and its own confirmation requirement, and the gate takes the stronger of the two; anything that runs a script, a shell, SQL, or an outbound call is typed-confirmation at minimum regardless of class. A confirmation is bound to the arguments it was shown for.
- Voice turns refuse the destructive end of the table outright, because a typed confirmation cannot be collected from a voice note. A voice turn is refused when either the command's own flag or its risk class's rule says so.
- The kit holds no token of its own; every working token belongs to a chat user. A login typed into the chat form lives for at most two minutes, while a token a user pastes is kept, encrypted, and used for that user's later commands. The bot tries to delete each chat message that carried a credential, and when the channel refuses the delete it tells the user to delete it themselves. Deleting a registration therefore does not revoke what its users still hold; that is what the revoke operations are for.
- The channel token is write-only. Registration posts it once, the kit validates it with the channel before storing it, encrypts it, and no read ever returns it. A registration whose token was rotated in the chat app has to be deleted and registered again with the new token: registering the same bot while the old registration exists is refused `409 registration_duplicate` (and deleting a registration does not revoke the credentials its users hold).
- Health is unauthenticated by design and reports exactly nine fields. `open_by_default` stays null until the self-probe resolves and is never reported as safe by default, so treat null as unknown rather than as protected.
- Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. A request that does not come through the bot's kit URL gets 403 with the JSON body `{ "error": { "code": "forbidden", ... } }`.
- Bare `/health` is 404. The management API and health live under the versioned prefix; the only route outside it is the management UI page at the root.
- Errors do not use the account-plane envelope. Management refusals answer `{ error: { code, message } }` with an enumerated code, and the message never carries a credential or an upstream error string, though a validation message may name a query parameter or body field you sent. An unknown path (404) or method (405) answers a bare string instead, `{ error: "not_found" }` or `{ error: "method_not_allowed" }`.
- A repeated query parameter is refused rather than resolved on every management route. Sending the same control twice makes the request say two things at once, and no handler answers it. The manifest route (which parses no query string) and the unauthenticated health route are outside that rule.

## Common errors

- `channel_token_rejected` and `channel_unavailable` — the two register-time channel failures: the channel said no, or it could not be asked. Neither carries the token or the channel's own error text.
- `channel_sync_failed` — publishing to the channel failed, on either the command sync or the profile set: the channel refused it (nothing was published), the call threw an unclassified error, or the channel accepted it but the readback disagrees. It does NOT mean the change landed; read the response message to tell the cases apart.
- `keys_rotate_refused` — a poller is alive and force was not set (stop the registration or repeat with the flag), or an earlier rotation left a key generation that no key on disk opens, which must be restored first. `keys_rotate_failed` does not always mean nothing changed: read its message, because it is also answered after the re-encryption committed (the next start finishes the rotation) or after the new key was already promoted (the rotation stands). Do not retry a rotation without reading it.
- `logs_purge_refused` — the cutoff falls inside the 90-day retention window and the waiver was not passed. The request is refused rather than quietly clamped to the boundary.
- `session_not_found` — the registration exists, but that chat user is unknown to it. Take the user from the audit log's actor column rather than guessing it, and drop its channel prefix (`telegram:<user id>` becomes `<user id>`): a prefixed value is not accepted here.
- `invalid_policy`, `invalid_profile`, `invalid_query` — the mode was not one of the two, an allowlist was not an array of channel ids, a profile field was unknown, of the wrong type, or too long for the channel (a field you leave out keeps its stored value; a missing body is `invalid_body`), or a query value was not the number or flag it must be.
- `manifest_unavailable` — 503 from the manifest route: no manifest is baked into this build, the baked one was refused at boot, or redaction would alter the verified bytes. The kit serves the verified document or nothing.

## Related namespaces

- `agent` — what a chat user most often drives through the bot: streaming prompts, approvals as buttons, one-tap webviews into the agent UI.
- `api` — mints the account tokens a chat user's login creates, and owns the account token management where the token ids a revoke reports in `manual_deletes` are deleted.
- `notifications` — one-way delivery to a person, with no command surface and no confirmation step.
- `daemon` — whether the bot program is registered and running on the container at all.

## Reference

### `hoody bot` (18) — Channel bots — register a chat bot and run its long-poll loop

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody bot commands sync` |  | write | Push the registered command lists and menu button to the channel and read them back | `bot.registrations.syncCommands` | `hoody bot commands sync abc-123` |
| `hoody bot create` |  | write | Register a channel bot. The token is sent over HTTPS, verified with the channel, stored encrypted and never echoed back | `bot.registrations.create` | `hoody bot create --channel telegram --token <token> --label my-label` |
| `hoody bot delete` |  | destructive | Delete a bot registration and its stored channel token | `bot.registrations.delete` | `hoody bot delete abc-123 -y` |
| `hoody bot get` |  | read | Read one bot registration | `bot.registrations.get` | `hoody bot get abc-123` |
| `hoody bot health` |  | read | Health check for the bot kit (nine fields; unauthenticated by design) | `bot.kit.getHealth` | `hoody bot health` |
| `hoody bot keys rotate` |  | destructive | Rotate kit.key and re-encrypt every sealed column (refused while a poller is active unless --force) | `bot.kit.rotateKeys` | `hoody bot keys rotate --force true -y` |
| `hoody bot list` |  | read | List the bot registrations owned by the calling account | `bot.registrations.list` | `hoody bot list` |
| `hoody bot logs list` |  | read | Read the redacted per-actor audit log of a registration (paged) | `bot.registrations.listLogs` | `hoody bot logs list abc-123 --since 1750000000000 --limit 10` |
| `hoody bot logs purge` |  | destructive | Purge audit rows at or before an epoch-millisecond cutoff (--older-than). Without --all true the cutoff defaults to the 90-day retention boundary and a cutoff inside that window is refused; with --all true and no --older-than, every row up to now is deleted | `bot.registrations.purgeLogs` | `hoody bot logs purge abc-123 --older-than 1750000000000 --all true -y` |
| `hoody bot manifest get` |  | read | The chat manifest this build is pinned to, as it was baked (503 manifest_unavailable when none is in force) | `bot.kit.getManifest` | `hoody bot manifest get --verify` |
| `hoody bot open` |  | action | Open the Bot kit registrations page in your browser |  | `hoody bot open` |
| `hoody bot policy get` |  | read | Read a registration policy: mode (single\|multi) and allowlists | `bot.registrations.getPolicy` | `hoody bot policy get abc-123` |
| `hoody bot policy update` |  | write | Set a registration policy: mode (single\|multi) and allowlists | `bot.registrations.updatePolicy` | `hoody bot policy update abc-123 --mode single` |
| `hoody bot profile update` |  | write | Set the bot profile (name, descriptions, default admin rights) and sync it to the channel | `bot.registrations.updateProfile` | `hoody bot profile update abc-123 --name my-resource --description 'My description'` |
| `hoody bot sessions revoke` |  | write | Log one chat user out of a registration and revoke their token lineage | `bot.registrations.revokeSession` | `hoody bot sessions revoke abc-123 abc-123 -y` |
| `hoody bot start` |  | action | Start long-polling for a registration | `bot.registrations.start` | `hoody bot start abc-123` |
| `hoody bot stop` |  | action | Stop long-polling for a registration | `bot.registrations.stop` | `hoody bot stop abc-123` |
| `hoody bot tokens revoke` |  | destructive | Revoke every chat user lineage of a registration (parent ids whose deletion failed are listed) | `bot.registrations.revokeAllTokens` | `hoody bot tokens revoke abc-123 --all -y` |


---

<!-- ===== namespace: browser ===== -->

# `browser` — Per-container Chromium or Firefox instances, one per slot

## Purpose

- Long-lived browser instances per container, one per `browser-X` hostname slot (the proxy maps slot X to `browser_port` 30000+X and `display` 500+X).
- Chromium runs the stealth engine by default (`stealth` defaults to `true`; metadata reports `engine: patchright`). `stealth=false` selects the standard engine (`engine: playwright`). Firefox always runs the standard engine.
- Surfaces: nav, screenshot, JS eval, PDF, HTML/text, cookies, console+network logs, history, CDP, accessibility snapshot with element refs, element actions, waits, runtime viewport.

## When to use

- JS-heavy pages, screenshots, PDFs.
- Authenticated sessions across navs.
- Anti-fingerprint via `stealth=true`.
- Console/network capture.
- Dedicated recorded "project browser" the user can watch live and you can inspect anytime (workflow 6).
- Clicking, typing and waiting on page elements without writing JS (workflow 7).
- External CDP on Chromium through the URL that `hoody browser devtools urls get` returns (on by default; `useRemoteDebuggingPort=false` turns it off; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.
- `hoody browser pdf export` works only on a headless Chromium instance: start it with `showBrowser=false`. Firefox and headful instances return `501 NOT_SUPPORTED`. The CLI flag is `--no-show-browser`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

## Common workflows

### 1. Start + navigate
1. `hoody browser start` on the slot's hostname + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `hoody browser navigate` — `tabId`, `onlyIfNotExists=true`. Flags: `--tab-id`, `--only-if-not-exists`.
3. `hoody browser get`.

### 2. Extract content
After browse: `hoody browser html get`/`hoody browser text get`/`hoody browser screenshots capture`/`hoody browser pdf export` — params in Reference. `hoody browser pdf export` needs a headless Chromium instance (see Prerequisites).

### 3. Authenticated scraping
1. `hoody browser start` matching `userAgent`/`viewport`/`locale`.
2. `hoody browser cookies batch set` with a `cookies` list of `{name, value, url}` entries; each cookie needs `name`, `value` and either an absolute http(s) `url` or both `domain` and `path` (never `url` together with `domain` or `path`). Pass one `--cookies name=…,value=…,url=…` flag per cookie.
3. `hoody browser navigate` to protected URL.
4. `hoody browser html get`/`hoody browser text get`.
5. `hoody browser cookies clear`.

### 4. JS eval + logs
1. `hoody browser start` with `stealth=false` for full console capture (stop a slot that already runs with `stealth=true` first) → `hoody browser navigate`.
2. `hoody browser evaluate` (`{script}` JSON body). On the default stealth engine the script cannot see page JS globals (see Quirks).
3. `hoody browser logs console list` (`since`,`type`,`clear=true`).
4. `hoody browser logs network list`.

### 5. History
`hoody browser history list` (filters: `since`/`domain`/`browser_id`) and `hoody browser history clear` (`before` + `browser_id` AND). In history, `browser_id` is the slot number X the navigation ran on.

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on that slot: `hoody browser start` addressed to the `browser-X` hostname (`--browser-id X`) with `showBrowser=true`. The proxy derives `browser_port` 30000+X and `display` 500+X from the hostname and overrides any values you send. Add any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — the standard kit URL with the `browser-` slug and `?view=display`: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/?view=display`. That page embeds display 500+X live (the bare root URL shows an instance status page with a View Display link instead), so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `hoody browser devtools urls get` adds a live DevTools inspector as a second link; that link gives full control of the browser, so hand it only to someone you would give the browser to.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-slot history (`hoody browser history list` with `browser_id=X`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped once it has been idle past the deployment's max age (see Quirks) — history survives; re-run `hoody browser start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `hoody browser logs console list`/`hoody browser logs network list` with `clear=true` into `sqlite`/`files`/agent memory preserves the captured entries for later sessions. For full console capture start the slot with `stealth=false`: the default stealth engine omits the page's console calls and errors.

### 7. Drive a page: snapshot, act, wait
These three operations never start an instance (404 `NOT_FOUND` on an empty slot), so run `hoody browser start` and `hoody browser navigate` first.
1. `hoody browser get` and keep `instanceGeneration`. Passing it back on the calls below turns "the instance was replaced" into a 409 `INSTANCE_CHANGED` instead of acting on a fresh browser.
2. `hoody browser snapshot get` returns the tab's accessibility tree as YAML with `[ref=eN]` markers, plus a `snapshotId`. Entered form values read as `<value hidden>` unless `includeValues=true`.
3. `hoody browser act` with `action` (one of `click | fill | type | press | select | check | hover`) and a `target`: either `{ref, snapshotId}` from the latest snapshot, or exactly one of `selector`, `role` (+ `name`), `label`, `text`, `placeholder`, `testId`. A 200 means the browser operation completed, not that the site accepted it.
4. `hoody browser wait` with a condition (`kind`: `target`, `text`, `url` or `loadState`) to observe the result. A miss is 504 `TIMEOUT`, never `matched: false`.
5. Take a new snapshot before using refs again: a newer snapshot or a main-frame navigation invalidates the old refs (409 `STALE_SNAPSHOT`).
`hoody browser viewport get`/`hoody browser viewport set` read and change the viewport of a running instance without a restart.

## Quirks & gotchas

- The `browser-X` hostname selects the instance: the proxy derives `browser_port` 30000+X and `display` 500+X from it and overrides caller-supplied values. A `browser_id` (or another instance selector in the query or JSON body) that names a different instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`, `details.field` naming it, and nothing runs: leave it out or call that instance's own host. Choose the slot with `--browser-id X` as a number (the CLI puts it in the hostname; a value that is not a whole number such as 0, 1, 2 is refused with an error before any request is sent). On history, `browser_id` also filters, equal to X.
- Endpoints auto-create unless `start=false`. Where a deployment disables auto-start, only an explicit `start=true` creates an instance. `hoody browser snapshot get`, `hoody browser act` and `hoody browser wait` never create one.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `hoody browser stop` first.
- `stealth=true` is ignored on Firefox: the stealth engine is Chromium-only.
- Extensions need `showBrowser=true` and run on a persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`. On the default `stealth=true` engine, console capture leaves out the page's `console.*` calls, uncaught errors and unhandled rejections; the response reports `capture: "partial"` with a `reason`. Start with `stealth=false` for full console capture.
- **A sweep runs every 5 min and SIGTERMs any instance idle for 1 h (deployment defaults), healthy or not.** The idle clock is restarted by real use: every API request routed to the instance (counted from the END of the request), a top-level page navigation (including a person clicking around in the live view), attaching over CDP, and starting an instance that already exists. An instance with a request in flight or an open CDP connection is never reaped. The instance's own heartbeat is liveness only and does NOT keep it alive, so an instance you want to keep (logged-in cookies, session state) needs a request at least once per idle window. A reaped instance's next call starts a fresh one, with none of the cookies or session state the old one held; recorded history survives.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retained 30 d by default. Where a deployment turns history off, the history endpoints answer `404 HISTORY_DISABLED`.
- **`hoody browser history clear` is scoped by the host:** through a `browser-N` host it clears only instance N's history (add `before` to keep newer entries); a `browser_id` naming another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT`. To clear several instances, call it on each instance's host.
- `browser_id` history filter sanitised as path component.
- **On the default stealth engine (`stealth=true`, `engine: patchright`), `eval` runs the script in an isolated JavaScript world.** It sees the DOM, but not the globals the page's own scripts define (`window.__NEXT_DATA__`, SPA stores, config objects): those read as `undefined` and the call still returns 200. On `stealth=false` (`engine: playwright`) the script runs in the page's main world. To read page JS state, start the slot with `stealth=false`, or read what the page wrote into the DOM (for example the text of `<script id="__NEXT_DATA__">`).
- `eval` POST accepts JSON `{"script":"..."}` (what the SDK and CLI send) or a `Content-Type: text/plain` body holding the raw script. The response is `{ "result": ... }`.
- **A ref-addressed `hoody browser act` that navigates the page itself (a link click, a submit, a `pushState`) answers 200; the NEXT use of that snapshot's refs is stale.** A 200 means the browser operation completed, not that the site's transaction succeeded: observe the result with `hoody browser wait` and a new snapshot. A main-frame navigation that lands BEFORE the input is dispatched answers `409 STALE_SNAPSHOT` (`details.reason: "navigated"`, `details.outcome: "not-started"`: nothing was dispatched, safe to repeat). If the tab navigates after the input went out and the action then fails, the 409 carries `outcome: "unknown"` (dispatched, result not observed): check the page (`hoody browser wait`, a new snapshot, the URL) before repeating a click or submit. Selector, role, label, text, placeholder and testId targets are not affected.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; pass `useRemoteDebuggingPort=false` at start to turn it off. `hoody browser devtools urls get` answers 404 only when the instance is missing; with CDP off it returns 200 with null URLs. Use the URLs `hoody browser devtools urls get` returns rather than building one. By default the returned URLs are on the `cdp-X` relay host paired 1:1 with `browser-X` (`https://{P}-{C}-cdp-X.{N}.containers.hoody.com/`); a deployment that turns the relay URLs off returns the legacy `http-<port>` host instead, where `<port>` is the debugging port. Point a CDP client at the returned URL (for example `connectOverCDP("https://{P}-{C}-cdp-X.{N}.containers.hoody.com/")`). The rest of this bullet describes the `cdp-X` relay. A discovery request (`/`, `/json`, `/json/list`, `/json/version`) may cold-start Chromium instance X when it is not running: only when cold start is enabled (the default; a deployment can turn it off) and the request does not come from a web page, which gets `403 CDP_CSRF_COLD_START` instead. A DevTools WebSocket only attaches to a running instance. Only read-only endpoints (the discovery paths, `/json/protocol`, the `/devtools/` front end) and DevTools WebSocket sessions are relayed; `/json/new`, `/json/activate` and `/json/close` return 404. Treat the `cdp-X` URL like a credential: anyone who can reach it controls the browser (navigate, run script, read cookies and page content), so start with `useRemoteDebuggingPort=false` when the container is shared.
- Launch options: the `viewport` and `geolocation` query parameters are **JSON strings**, not free-form `"WxH"` / `"lat,lng"`; the kit `JSON.parse`s a string value and rejects one that does not parse. In a JSON request body the same fields may also be plain objects. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`. A launch `viewport` of `null` or `none` turns off fixed-viewport emulation. The runtime `hoody browser viewport set` is different: its body is an object, `{"viewport":{"width":1280,"height":800}}` or `{"viewport":null}` (integers 1–8192); a string there is a 400 `VALIDATION_ERROR`.
- `hoody browser viewport set` takes `{viewport:{width, height}}` (1-8192 px) or `{viewport:null}` for responsive. `hoody browser viewport set` sends only a fixed size. Responsive works only on Chromium (`501 NOT_SUPPORTED`) and only on an instance started responsive (`409 REQUIRES_RESTART`: stop it and start it again with `viewport=null`). `502 VIEWPORT_APPLY_INCOMPLETE` means the policy was kept but some tabs did not apply it (`details.failedTabs`). `hoody browser viewport get` never starts an instance.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `hoody browser stop`, `hoody browser shutdown`, `hoody browser devtools urls get`, `start=false` no instance; also `hoody browser snapshot get`/`hoody browser act`/`hoody browser wait` on an empty slot, since they never auto-start.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints where the deployment turned history off.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `hoody browser stop` then `hoody browser start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `hoody browser start` and no `$DISPLAY` env.
- `TIMEOUT` 408 / 504 — the request passed the kit's request deadline (600 s by default). While the request is launching or restarting the instance this is a 504 with `details.phase: "launch"` and `details.outcome: "unknown"`: the instance may still come up, so check `hoody browser get` with `start=false` before retrying. After the request was forwarded to a running instance it is a 504 with `details.phase: "proxy"` and `details.outcome: "unknown"`: the call may already have taken effect (a `hoody browser viewport set` included), so inspect the state before repeating a mutation. A request that times out before either is a 408.
- `TIMEOUT` 504 — an automation call (`hoody browser snapshot get`, `hoody browser act`, `hoody browser wait`) spent its `timeoutMs` budget (default 10000, max 30000). `details.phase` says where; `details.outcome` `not-started` means the action was never dispatched. For `hoody browser wait` this is how a condition that never held is reported.
- `STALE_SNAPSHOT` 409 — the ref's snapshot is no longer the tab's latest, or the main frame navigated; take a new snapshot. Read `details.outcome` before repeating an action (see Quirks).
- `INSTANCE_CHANGED` 409 — the `instanceGeneration` sent no longer matches the running instance (`details.expected` is null when no instance exists); re-read `hoody browser get`.
- `TAB_BUSY` 409 — another `hoody browser act`, `hoody browser snapshot get` or `hoody browser navigate` is in flight on that tab (`details.op` names it); wait for it.
- `AMBIGUOUS_TARGET` 409 — the target matched more than one element; narrow it or use a ref.
- `TAB_NOT_FOUND` 404 — no tab with that `tabId`; `details.openTabs` lists the open ones.
- `INSTANCE_QUARANTINED` 502 — the slot's previous browser process has not been confirmed exited, so no new instance can start there yet; retry later.
- `SHUTTING_DOWN` 503 — the kit is shutting down.
- `METHOD_NOT_ALLOWED` 405 — only GET/POST/DELETE/PUT/PATCH.

## Related namespaces

- `display` — headful renders into `display-{n}`; the `?view=display` page iframes it.
- `terminal` — helper CLIs.
- `curl` — JS-free HTTP.
- `files` — pull artefacts out.
- `sqlite` — persist scraped data.
- `exec` — server post-processing.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. ⚠ The `browser-X` hostname selects the instance; a `browser_id` or `browser_port` that names another instance is refused with 400 `INSTANCE_SELECTOR_CONFLICT` (see the Quirks gotcha). Examples 1–5 and 8–9 use slot 1 (`browser-1`, `--browser-id 1`); Examples 6 and 7 use slots 2 and 3 so their different launch options do not collide with slot 1's running instance.

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `hoody browser start` is idempotent — calling it again on the same slot returns the existing instance and ignores new options (a different `stealth` value is rejected with `409`).

```bash
hoody --container "$C" browser start --browser-id 1 \
  --no-show-browser --no-stealth -o json \
  | jq '{engine,headless,chromiumBuildId,browser_port}'
```

**Step 2 — navigate.** `hoody browser navigate` opens or reuses a tab and waits for load.

```bash
hoody --container "$C" browser navigate --browser-id 1 \
  --url https://httpbin.org/html
```

### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
hoody --container "$C" browser screenshots capture --browser-id 1 \
  --full-page --url https://httpbin.org/html --format base64 -o raw \
  | base64 -d > /tmp/page.png   # -o raw prints the `data` string itself
```

### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`hoody browser text get` returns the `innerText` of `body`).

```bash
hoody --container "$C" browser html get --browser-id 1 | head -c 200
hoody --container "$C" browser text get --browser-id 1 | head -c 200
```

### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. Over HTTP, `GET /api/v1/browser/eval?script=` puts the script in the query (size-bound by URL). `hoody browser evaluate` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns `{ result }`. The script reads the DOM on every engine; page JS globals (`window.__NEXT_DATA__`, app stores) are visible only on a `stealth=false` instance, and read as `undefined` on the default stealth engine (see Quirks).

```bash
hoody --container "$C" browser evaluate --browser-id 1 \
  --script 'document.title'
hoody --container "$C" browser evaluate --browser-id 1 \
  --script 'JSON.stringify({title: document.title, links: document.querySelectorAll("a").length})'
```

### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is a JSON object `{ cookies: [...] }` whose entries need `name`, `value`, and either an absolute http(s) `url` or both `domain` and `path`; do not combine `url` with `domain` or `path` (400 `VALIDATION_ERROR` naming the field). Optional: `httpOnly`, `secure`, `sameSite` (`Strict|Lax|None`), `expires` (Unix seconds, -1 = session).

```bash
# One --cookies per cookie: comma-separated key=value pairs; url, or domain + path.
hoody --container "$C" browser cookies batch set --browser-id 1 \
  --cookies name=session,value=abc123,url=https://httpbin.org \
  --cookies name=theme,value=dark,url=https://httpbin.org
hoody --container "$C" browser cookies list --browser-id 1 \
  --url https://httpbin.org
```

### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
hoody --container "$C" browser start --browser-id 2 \
  --no-show-browser --no-stealth
hoody --container "$C" browser cookies batch set --browser-id 2 \
  --cookies name=sessionid,value=REAL_TOKEN,url=https://app.example.com
hoody --container "$C" browser navigate --browser-id 2 \
  --url https://app.example.com/dashboard
hoody --container "$C" browser text get --browser-id 2 | head -c 400
hoody --container "$C" browser cookies clear --browser-id 2
```

### 7. `hoody browser navigate` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `hoody browser start`; `hoody browser navigate` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
hoody --container "$C" browser start --browser-id 3 \
  --no-show-browser --stealth \
  --viewport '{"width":390,"height":844}' --locale fr-FR --timezone-id Europe/Paris \
  --user-agent 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' \
  --geolocation '{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'
hoody --container "$C" browser navigate --browser-id 3 \
  --url https://httpbin.org/headers
hoody --container "$C" browser text get --browser-id 3 | head -c 500
```

### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```bash
hoody --container "$C" browser history list \
  --since "$(date -u -d '1 hour ago' +%FT%TZ)" --limit 50 -o json \
  | jq '{total, has_more}'
hoody --container "$C" browser history list --domain httpbin.org --limit 20 -o json \
  | jq '.entries | length'
# `history clear` asks for confirmation; pass -y/--yes to run it non-interactively.
hoody --container "$C" browser history clear --yes \
  --before "$(date -u -d '7 days ago' +%FT%TZ)" \
  --browser-id 1
```

### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
hoody --container "$C" browser get --browser-id 1 --no-start \
  | jq '{engine, headless, chromiumBuildId, browser_port}'
hoody --container "$C" browser tabs list --browser-id 1 --no-start
```

For an external CDP attachment, `hoody browser devtools urls get` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests until they are stopped or the kit process restarts (graceful kit restart SIGTERMs every child — see Quirks & gotchas). The idle sweep reaps an instance nobody has used for the max age (1 h by default), so a forgotten instance is eventually reclaimed, and one you still need must see a request at least once per idle window. Each slot has a fixed port, so a slot whose previous process has not been confirmed exited answers `502 INSTANCE_QUARANTINED` until it has; retry later rather than restarting the container.

`hoody browser stop` and `hoody browser shutdown` both terminate the child and delete its profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`). Every Chromium instance runs on a persistent profile of its own, with or without extensions (an extension profile under the kit's browser data dir, otherwise under the temp dir), and every exit removes it, so cookies and logins do not carry over to the next instance. One `hoody browser stop` per instance is a complete teardown — calling both is redundant.

```bash
for X in 1 2 3; do
  hoody --container "$C" browser stop --browser-id "$X" || true
done
hoody --container "$C" browser stats -o json | jq '.instances'
```

A `404 Instance not found` from `hoody browser stop` means it was already gone — safe to ignore. Neither `hoody browser stop` nor `hoody browser shutdown` creates an instance: on an empty slot both answer `404 Instance not found`. `hoody browser stop` terminates the child before it answers; `hoody browser shutdown` answers 200 as soon as shutdown starts and finishes in the background, so poll `hoody browser get` with `start=false` until it answers 404 to confirm the instance is gone.

## Reference

### `hoody browser` (29) — Browser automation and control

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody browser act` |  | action | Perform a native element action (click, fill, type, press, select, check, hover) | `browser.page.act` | `hoody browser act --browser-id 1 --tab-id 10 --action click --target-selector '#submit'` |
| `hoody browser cookies batch set` |  | write | Set cookies | `browser.cookies.setMany` | `hoody browser cookies batch set --browser-id 1 --start --cookies name=my-resource,value=hello` |
| `hoody browser cookies clear` |  | destructive | Clear all cookies | `browser.cookies.clear` | `hoody browser cookies clear --browser-id 1 --start` |
| `hoody browser cookies list` |  | read | Get cookies | `browser.cookies.list` | `hoody browser cookies list --browser-id 1 --start` |
| `hoody browser devtools urls get` |  | read | Get DevTools URLs | `browser.instances.getDevtoolsUrls` | `hoody browser devtools urls get --browser-id 1 --start` |
| `hoody browser evaluate` |  | action | Execute JavaScript (POST) | `browser.page.evaluate` | `hoody browser evaluate --browser-id 1 --start --script document.title` |
| `hoody browser get` |  | read | Get instance metadata | `browser.instances.get` | `hoody browser get --browser-id 1 --start` |
| `hoody browser health` |  | read | Health check | `browser.kit.getHealth` | `hoody browser health` |
| `hoody browser history clear` |  | destructive | Delete browsing history | `browser.history.clear` | `hoody browser history clear --before 2026-01-01T00:00:00Z --browser-id 1 -y` |
| `hoody browser history list` |  | read | Query browsing history | `browser.history.list` | `hoody browser history list --since 2026-01-01T00:00:00Z --domain example.com` |
| `hoody browser html get` |  | read | Get page HTML | `browser.page.getHtml` | `hoody browser html get --browser-id 1 --tab-id 10` |
| `hoody browser logs console list` |  | read | Get console logs (use `--clear` to also clear) | `browser.logs.listConsole` | `hoody browser logs console list --browser-id 1 --tab-id 10` |
| `hoody browser logs network list` |  | read | Get network logs (use `--clear` to also clear) | `browser.logs.listNetwork` | `hoody browser logs network list --browser-id 1 --tab-id 10` |
| `hoody browser navigate` |  | action | Navigate to URL (POST) | `browser.page.navigate` | `hoody browser navigate --browser-id 1 --start --url https://example.com` |
| `hoody browser open` |  | action | Open the Browser kit service (browser automation UI) in your browser |  | `hoody browser open` |
| `hoody browser pdf export` |  | read | Export page as PDF | `browser.page.exportPdf` | `hoody browser pdf export --browser-id 1 --tab-id 10` |
| `hoody browser restart` |  | action | Restart browser instance | `browser.instances.restart` | `hoody browser restart --browser-id 1 --start` |
| `hoody browser screenshots capture` |  | read | Capture browser screenshot | `browser.page.captureScreenshot` | `hoody browser screenshots capture --browser-id 1 --start` |
| `hoody browser shutdown` |  | destructive | Shutdown browser instance | `browser.instances.shutdown` | `hoody browser shutdown --browser-id 1` |
| `hoody browser snapshot get` |  | read | Accessibility snapshot of a tab with element refs | `browser.page.getSnapshot` | `hoody browser snapshot get --browser-id 1 --tab-id 10` |
| `hoody browser start` |  | action | Create or retrieve browser instance | `browser.instances.start` | `hoody browser start --browser-id 1 --fingerprint-id default` |
| `hoody browser stats` |  | read | Server metrics | `browser.kit.getStats` | `hoody browser stats` |
| `hoody browser stop` |  | action | Stop browser instance | `browser.instances.stop` | `hoody browser stop --browser-id 1` |
| `hoody browser tabs close` |  | write | Close a browser tab | `browser.tabs.close` | `hoody browser tabs close --browser-id 1 --start` |
| `hoody browser tabs list` |  | read | List browser tabs | `browser.tabs.list` | `hoody browser tabs list --browser-id 1 --start` |
| `hoody browser text get` |  | read | Get page text | `browser.page.getText` | `hoody browser text get --browser-id 1 --tab-id 10` |
| `hoody browser viewport get` |  | read | Show the instance's current viewport policy | `browser.viewport.get` | `hoody browser viewport get --browser-id 1` |
| `hoody browser viewport set` |  | write | Change the viewport of a running instance | `browser.viewport.set` | `hoody browser viewport set --viewport-width 10 --viewport-height 10 --browser-id 1` |
| `hoody browser wait` |  | action | Wait for a condition in a tab | `browser.page.wait` | `hoody browser wait --browser-id 1 --tab-id 10 --condition-kind target --condition-target-selector '#submit' --condition-state attached` |


---

<!-- ===== namespace: code ===== -->

# `code` — VS Code in the browser, per container

## Purpose

**This is the VS Code IDE running in a browser tab — not a programmatic API.** Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/` and you get the full editor: file tree, diff view, debugger, terminals, extensions marketplace, all backed by the container's filesystem. The `code-N` URL is served by an **orchestrator** that starts one isolated editor instance per index and returns a page that embeds it. The index is the hostname: `code-1` is instance 1, `code-2` is instance 2, each with its own settings, state and running process.

On a `code-N` host the platform's edge fills in the two parameters the entry page needs. It sets the instance selector `id` from the hostname, overwriting anything the caller sent, and it sets `folder` to the container's default workspace when the request names none. Add `?folder=<abs-path>` to open a different folder. Talking to a bare kit server with no edge in front of it, a client must send both `folder` and `id` itself: with neither the entry path returns the kit specification, with only one it returns `400`.

The methods in this namespace read the service's state (health, running instances, versions), stop editor instances, stage extensions and confirm what an instance has installed, and build embed URLs. Day-to-day use is "open the URL".

Like every Hoody kit URL, `code` is **iframable**: drop the `code-N` URL into an `<iframe>` and you've embedded VS Code in your own page. Same for every other kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of Hoody kit iframes with no native code, just URLs and standard CSP / cookie wiring.

**Headline mode: extension-only embed.** Add `?extension=<publisher>.<name>` and the editor hides its chrome and opens that extension's **sidebar view** filling the viewport. It works for an installed extension that contributes a sidebar view (an Activity Bar panel); when no sidebar view of that extension can be found, even after activating it, the editor falls back to the file explorer. Pair such an extension with the iframable kit URL and you have:

- A coding agent (e.g. **Cline** — `saoudrizwan.claude-dev`) accessible from any browser, including mobile phones with no IDE installed.
- The same agent embedded into your own dashboard, a docs site, a Notion page, a Slack canvas (URL preview), a CRM, or any other HTML surface.
- A focused tool surface from any other extension with its own sidebar view (Continue, Roo Cline, GitLens, …) without exposing the full editor. An extension that only adds editors, commands or previews has no sidebar view to open.
- A branded deployment: point a proxy alias at the `code` service and hand out the alias URL instead of one that carries the `containerId` (Example 7).

The container's filesystem still backs the extension (it can edit files, run terminals, hit the network, etc.) — same persistent state as the full IDE. To run two single-extension surfaces side by side, give each its own instance through its own hostname: Cline on `code-1`, Continue on `code-2`.

## When to use

- **Humans editing code**: hand the user the URL — that's the whole product.
- **Single-extension embed for an agent or tool** — `?extension=<publisher>.<name>` opens that extension's sidebar view full-screen; iframable, mobile-friendly, distributable behind a proxy alias.
- Pre-open a folder with `?folder=<abs-path>`, so the URL is bookmarkable.
- Stage a custom VSIX with `hoody code extensions install`, then confirm with `hoody code extensions list` that an instance actually installed it.
- Read which editor instances are running (`hoody code status`) and which orchestrator and editor builds are deployed (`hoody code version`).

## When NOT to use

Not for: non-interactive shell → `terminal`/`exec`, file I/O without a UI → `files`, long-lived processes → `daemon`, headless web → `browser`, exposing a dev server that runs in the container → a proxy alias with program `http` and its port (see the `api` namespace). Not a coding-agent control plane → `agent` (the typed in-container AI-agent HTTP namespace, slug `agent`; the Hoody Agent browser GUI on the same `-agent-1` host is the human surface).

## Prerequisites

- A running container. Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get`.
- Address the service through its `code-N` URL. That hostname selects the instance. `hoody code extensions list` and `hoody code extensions install` take `--id <N>` (default 1), which sends the request to the `code-N` host. 
- VSIX staging needs a downloadable `.vsix` URL that the service may fetch: `http` or `https`, no credentials in the URL, and not an address inside the container or on a private network.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

## Common workflows

### 1. Open the editor on a folder

1. Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/?folder=<abs-path>`. Leave `folder` out to open the container's default workspace.
2. To switch folders, open the same URL with another `folder`. A running instance is reused, and the page loads the editor on the folder the request names. `hoody code status` keeps reporting the folder the instance was started with. Add `restart=true` only when you mean to restart the instance's process.

### 2. Embed a single extension (single-tool browser surface)

1. Make sure the extension is installed in that instance: stage it (workflow 3) or install it in the editor.
2. Open or iframe `https://{P}-{C}-code-1.{N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<abs-path>`. `hoody code embed <publisher>.<name> 1 --folder <abs-path>` prints the same URL.
3. Brand it with `hoody proxy aliases create` (program `code`, the landing query in `target_path`) and gate it with `hoody containers proxy *` before sharing.

### 3. Stage a VSIX, apply it, confirm it installed

1. `hoody code extensions install` with the `.vsix` URL. A success means the file is staged, not installed: the response reports `requiresRestartToApply: true` and `appliesAt: "next-instance-start"`. Add `-o json` to get the full result body with those fields.
2. Start or restart the instance that should have it (open its URL with `restart=true`). Staging is shared across instances, so every instance installs it at its next start.
3. `hoody code extensions list` and read `observed`: `status: "running"` means the instance is running and the version it has installed is the staged one. It compares version numbers only; it does not show that the extension activated.

### 4. Inspect instances and versions

1. `hoody code status` lists the running instances (id, port, folder, uptime) and the orchestrator's `basePort`.
2. `hoody code version` reports the orchestrator build and the packaged editor tree separately.

### 5. Stop an editor instance and release capacity

Stop an instance you no longer need: it ends its editors, integrated terminals, tasks and extension host, and keeps its settings, installed extensions and workspace state for its next start.

Run `hoody --container "$C" code stop N`.

A `200` means the instance's process has exited; `404` with `unknown-instance` means it was not running.

## Quirks & gotchas

- On a `code-N` host the edge sets `id` from the hostname and overwrites a caller's value, so a query-string `id` cannot pick another instance. `code-0` is treated as `code-1`.
- The edge fills `folder` with the container's default workspace only when the request carries no `folder`; an explicit `folder` wins.
- A request with a different `folder` for a running instance reuses that instance and its page loads the editor on the requested folder; no restart is needed. The instance keeps the folder it was started with as its own, which is the one `hoody code status` reports. `restart=true` kills and respawns the instance.
- The entry path forwards only the query parameters it declares (`?folder`, `?id`, `?extension`, `?restart`, `?page-loader`, `?disable-walkthroughs`, `?hoody-code`, `?welcome-iframe-url`, `?page-loader-path`, `?proxy-domain`, `?locale`, `?app-name`) and drops any other name without reporting it.
- The query string on the entry path is capped at 8192 bytes; a longer one is answered `400` and starts nothing.
- The page embeds the instance from the container's `http-<port>` host, where the port is `basePort + id`. `basePort` is deployment configuration: read `orchestrator.basePort`, or the instance's own `port`, from `hoody code status` instead of assuming a number. That host is editor transport, not part of the kit API.
- Staging is not installation. The editor installs staged extensions only while an instance starts, and the stage directory is shared, so one stage reaches every instance at its next start.
- A stage that lands while an instance is starting can be installed with one version's details and another's contents. `hoody code extensions list` reads only the installed version number, so it may not reveal that pairing; restarting the instance installs whatever is staged then. Stage before starting an instance.
- `hoody code extensions list` keeps `desired` (what is staged) and `observed` (what this instance appears to have) apart. A section that could not be read reports `status: "unavailable"` and has no `extensions` key at all, and `partial` is then true.
- An observed entry's `status` is `running` (the instance is running and its installed version equals the staged version, or the extension is installed with nothing staged for it), `stale` (normal between a stage and the next start), `failed` (started after the stage and still lacks it), `stopped` or `unavailable`. `running` is a version comparison, not proof that the extension activated. Match entries on `logicalKey`, the lowercased `publisher.name`.
- `allowDowngrade` is off by default, so a restage cannot silently roll an extension back; a refused downgrade is `409`.
- `hoody code version` reports the orchestrator and the packaged editor as two figures because they are built and deployed separately. It never contacts the network and there is no update check.
- `hoody code health`, `hoody code status` and `hoody code version` take no query parameters; an `id` sent to them changes nothing.
- Building an extension-only URL does not open the editor or start an instance. `hoody code embed` prints it, and `--open` launches the browser instead; it may first query the Hoody API to resolve the container's routing. 
- `kit_slug` always `code`.

## Common errors

- `429` HTML page from the entry path — starting another instance would pass the instance limit this deployment is configured with (none by default). Nothing was started; stop an instance you do not need (workflow 5), then retry. An already running instance is still served at the limit.
- `403` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden`, not JSON. Use the `code-N` URL.
- `400` HTML page from the entry path: exactly one of `folder` and `id` carried a value, `id` is not an unsigned decimal integer or was sent twice, `id` exceeds `65535 - basePort`, or the query is over 8192 bytes. Only a bare kit server hits the first case; behind the edge both are filled.
- `409` from the entry path: the instance's port is held by a process the orchestrator did not start. Retrying does not help until it is released.
- `503` from the entry path: the instance did not finish starting in time. Worth retrying.
- `hoody code extensions install` errors carry a stable `error` code: `destination-refused` (`403`, the URL is outside the fetch policy), `downgrade-refused` (`409`), `not-a-vsix` (`422`), `upstream-error` (`502`, may be retried), `upstream-timeout` (`504`), `installs-at-capacity` (`503`, honour `Retry-After`), `insufficient-storage` (`507`), `extension-too-large` (`413`, the archive is over the size limit). Branch on `error`, not on the message.
- Either extensions operation can return `invalid-selector` (`400`, an `id` the service cannot parse) or `internal-error` (`500`). Only `hoody code extensions install` reads a request body, so only it returns `invalid-request` (`400`, malformed body or `url`), `unsupported-media-type` (`415`, body not sent as `application/json`) and `request-too-large` (`413`, body over the limit).
- `404` with `error: "unknown-instance"` from either extensions operation means the service has no extensions directory configured, despite the code's name; retrying with another instance id does not help. An instance that was never started lists as `stopped`, not 404.
- `503` from `hoody code extensions list` carries the normal result body with `desired.status: "unavailable"`: the staged set could not be read, and `observed` is still reported.

## Related namespaces

→ `terminal`, `files`, `exec`, `browser`, `daemon`, `api` (proxy aliases and permissions).

## Examples

`code` is a **URL-first** namespace — for most workflows the kit URL itself (with the right query string and / or iframe wrapper) IS the deliverable. The methods here read state, stage extensions and build URLs; they do not drive the editor. Each example below is a copy-pasteable recipe in the mode you're reading. URL-composition steps are pure string templates and need no kit call. Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

### 1. Open the editor with a folder pre-loaded — bookmarkable URL

**Goal:** ship a teammate a single URL that opens VS Code already pointing at the right repo.

```bash
# The index is in the HOSTNAME (code-1); the edge supplies the instance selector.
hoody --container "$C" code open 1 --folder /home/user/myrepo --url
# `--url` prints the URL instead of launching $BROWSER.
```

### 2. Extension-only embed — open one extension's sidebar view

**Goal:** open `code-1` as a single extension's panel — the editor chrome is hidden and the extension's sidebar view fills the viewport. Pair it with a folder so the extension opens with the right repo selected. The extension must be installed in that instance and contribute a sidebar view; otherwise the file explorer opens instead.

URL pattern (no kit call):

```
https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<absolute-path>
```

```bash
# Prints the extension-only URL for instance 1. `--open` launches $BROWSER instead.
hoody --container "$C" code embed saoudrizwan.claude-dev 1 --folder /home/user/myrepo
```

Name the extension as `publisher.name`, no version. `hoody code embed` refuses any value that does not match `^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$`. A second surface (say Continue, `continue.continue`) goes on its own instance: build the same URL on `code-2`.

### 3. Open another folder on a running instance

**Goal:** instance 1 is open on `/home/user/myrepo` and you want the editor on `/home/user/other`. Open the same instance URL with the new `folder`: the running instance is reused and the page loads the editor on that folder. `hoody code status` keeps reporting the folder the instance was started with.

```bash
hoody --container "$C" code open 1 --folder /home/user/other --url
```

Add `restart=true` only when the process itself must restart, for example to apply a staged extension (Example 4). Restarting ends that instance's running editor session, including its terminals. Other instances are untouched.

### 4. Stage a custom VSIX and confirm it installed

**Goal:** push an internal extension (`.vsix`) into the editor and confirm the instance has it installed.

**Step 1 — stage it.**

```bash
# This stages the file; it is not installed yet. -o json prints the full result body.
hoody --container "$C" code extensions install --url https://example.com/acme.internal-tools-1.2.3.vsix -o json \
  | jq '{outcome, appliesAt, stageScope, key: .extension.logicalKey}'
```

**Step 2 — apply it** by starting or restarting the instance: open its URL with `restart=true`. Every other instance picks it up at its own next start.

**Step 3 — confirm.** The observed entry reports `status: "running"` when the running instance has the staged version installed. This compares version numbers; it does not show that the extension activated.

```bash
hoody --container "$C" code extensions list -o json \
  | jq '[.observed.extensions[]? | select(.logicalKey == "acme.internal-tools") | {status, installedVersion}]'
```

`stale` right after a stage is normal; `failed` means the instance started after the stage, had time to install it, and still does not have it. If `observed.status` is `unavailable` there is no `extensions` array and nothing can be concluded from it.

To install without the API: drop the VSIX on the container filesystem through the `files` namespace and use the editor's Extensions view → `…` menu → "Install from VSIX…".

### 5. Which instances are running, and which builds

**Goal:** see what the service is doing before you restart anything.

```bash
hoody --container "$C" code status -o json
hoody --container "$C" code version -o json
```

An instance that has not been opened since the service started is simply absent from `instances`.

### 6. Health check + extension verify — post-deploy smoke test

**Goal:** after a container rebuild, confirm the `code` service is up AND instance 1 has the extension you ship installed at the staged version. This is a service-health and installed-version check; it does not prove the extension activated.

```bash
hoody --container "$C" code health -o json | jq -r .status   # → ok
hoody --container "$C" code extensions list -o json \
  | jq -e 'any(.observed.extensions[]?; .logicalKey == "saoudrizwan.claude-dev" and .status == "running")'
```

An instance that has not started since the rebuild reports every entry as `stopped`, including a staged version it has not installed yet; a running instance that has not installed the stage reports `stale` (`failed` if it started after the stage and its install grace has passed). Open the instance's URL once before the check.

### 7. Embed the editor in your own page, behind a branded URL

**Goal:** ship a dashboard / docs site / Notion-style canvas with VS Code (or a single extension) embedded as a panel.

```html
<!-- Full editor, with a folder pre-loaded -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=/home/user/myrepo"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write; cross-origin-isolated"
></iframe>

<!-- Single extension only (no IDE chrome) — Cline as a service -->
<iframe
  src="https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=saoudrizwan.claude-dev&folder=/home/user/myrepo"
  style="width:100%;height:100vh;border:0"
  allow="clipboard-read; clipboard-write"
></iframe>
```

To keep the `containerId` out of the iframe `src`, create a proxy alias on the `code` service with the landing query as its `target_path`, and use the URL the call returns. Leave `id` out of the target: the alias's `index` picks the instance, and a target query naming `id` is refused with `404 ALIAS_TARGET_QUERY_FORCED_KEY`. The `folder` (and `extension`) in the target is a landing preference only: the editor opens there, but it does not confine the session, and anyone using the editor can open any other folder the container user can read.

```bash
hoody proxy aliases create --container-id "$C" --program code --index 1 --alias agent \
  --target-path '/?extension=saoudrizwan.claude-dev&folder=/home/user/myrepo'
```

Gate the alias with `hoody containers proxy *` before sharing it (see the `api` namespace). The same iframe pattern works for **every** Hoody kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …).

## Reference

### `hoody code` (8) — VS Code server

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody code embed` |  | read | Build an iframeable URL for a VS Code extension (extension-only mode) | `embeds.code.extension` | `hoody code embed rooveterinaryinc.roo-cline --folder /home/user/project` |
| `hoody code extensions install` |  | write | Stage a VS Code extension (.vsix) from a URL; it is installed at the instance's next start | `code.extensions.install` | `hoody code extensions install --url https://example.com/publisher.name-1.2.3.vsix --allow-downgrade` |
| `hoody code extensions list` |  | read | List staged extensions and the extensions the instance reports as installed | `code.extensions.list` | `hoody code extensions list` |
| `hoody code health` |  | read | Service health check | `code.kit.getHealth` | `hoody code health` |
| `hoody code open` |  | action | Open the Code kit editor on a folder in your browser |  | `hoody code open --folder /home/user/project` |
| `hoody code status` |  | read | Orchestrator configuration and running editor instances | `code.kit.getStatus` | `hoody code status` |
| `hoody code stop` |  | action | Stop an editor instance; its settings, extensions and workspace state are kept | `code.stop` | `hoody code stop 1` |
| `hoody code version` |  | read | Versions of the running orchestrator and its packaged editor | `code.kit.getVersion` | `hoody code version` |


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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Schedule

`hoody cron entries create` takes a schedule + command (plus name/comment/expires_at/enabled) and returns the created entry with its `id`.

### 2. List

`hoody cron entries list` (`page`/`limit`, max 200).

### 3. Edit / disable / extend

`hoody cron entries update` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

For a normal bulk replace, read with `hoody cron crontabs get` (sweep), edit the returned text, then call `hoody cron crontabs set` with the body — it revalidates `# hoody-cron:` blocks, and the response has `removed_expired`. If a read or entry call fails with `409 STORED_CRONTAB_INVALID` (the stored crontab cannot be used), read `details` and repair it by calling `hoody cron crontabs set` directly with a complete, valid replacement: PUT does not read the stored crontab, and anything you leave out of the replacement is removed.

### 5. Audit all users

`hoody cron crontabs list` → paginated `{ items: [{ user, crontab }], total, page, limit }`.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject newline/null/VT/FF/NEL/LS/PS; caps 4096/120/500.
- Send a managed entry's command exactly as a shell would run it, and do not escape `%`: the kit writes it into the crontab as `\%` so cron runs the command unchanged and reads it back the same way. A `\%` you send is escaped again and runs as `\%`, backslash included. Raw lines in a `hoody cron crontabs set` body are written as given, so a `%` there follows crontab rules: a bare `%` ends the command, and `\%` is a literal `%`.
- A managed entry's command is read back from the spool exactly as written, runs of whitespace included, so a later write for that user stores it unchanged: `echo "a  b"` stays `echo "a  b"`.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB by default, which the deployment can change, AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`hoody cron crontabs set` replaces the whole crontab.** `hoody cron crontabs get` returns each managed entry as its `# hoody-cron:` metadata line followed by its rule line, and PUT parses those pairs back into the same managed entries with the same ids. So a read, edit, write cycle keeps every managed entry whose two lines are still in the body; a managed entry left out of the body is deleted. Edit the text from `hoody cron crontabs get` instead of writing a fresh body, and do not re-create managed entries after a PUT: they are still there. Re-creating an identical entry answers 200 with the existing one and writes nothing; the same schedule and command with a different name, comment, `expires_at` or `enabled` is `409 ENTRY_EXISTS` (details give its id), so change it with PATCH. Comment or blank lines placed between a metadata line and its rule line are dropped.
- A PUT body may contain `# hoody-cron:` metadata lines written by the caller. The kit revalidates every managed entry it parses from them (schedule, command, name, comment) and rejects duplicate ids, but it does not check where the metadata came from: a well-formed pair written by hand is accepted as a managed entry, and a metadata line it cannot parse or pair is kept as a raw line. Every other non-comment line gets the syntax check of `crontab(1)`: a line it would refuse is `400 INVALID_CRONTAB` naming that line, and nothing is written.
- `hoody cron entries list`/`hoody cron entries get` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `hoody cron entries list` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
- Sweep every 60s default; per-user lock.

## Common errors

Error bodies are `{ code, message, details }`, except where noted.

- `409 STORED_CRONTAB_INVALID` — the crontab already stored for the user cannot be used (a Unicode line break, a `# hoody-cron:` line with two id fields, or over the line or byte cap); nothing in your request is wrong. Repair it with `hoody cron crontabs set` (workflow 4).
- `400 INVALID_EXPIRES_AT` / `EXPIRES_IN_PAST`.
- `400 INVALID_SCHEDULE / Invalid schedule` — Vixie 5-field plus `@`-macros only; Quartz / 6-field rejected.
- `400 INVALID_USER` (bad user name), `INVALID_COMMAND`, `INVALID_NAME`, `INVALID_COMMENT`: a field failed validation (see Quirks for the rules).
- `400 INVALID_ID` `Entry id must be a UUID`: the `{id}` path segment is not a UUID.
- `400 INVALID_PAGINATION`: `page` must be 1 or more and `limit` 1 to 200 (default 50).
- `404 USER_NOT_FOUND`: the user is not in `/etc/passwd`. `404 ENTRY_NOT_FOUND`: no managed entry has that id (it may have expired and been swept).
- `413 PAYLOAD_TOO_LARGE`: a request body over the size cap (256 KiB by default), or a crontab over 10,000 lines or over its separate byte ceiling of about 40 MB, which only a deployment that raised the size cap can reach.
- `415 UNSUPPORTED_MEDIA_TYPE`: the Content-Type is neither `application/json` nor an `application/*+json` type. `400 INVALID_JSON`: the body is not valid JSON. `400 INVALID_BODY`: the JSON does not match the request fields (a missing or mistyped field).
- `500 BACKEND_ERROR` — `crontab(1)` fail / 30s timeout.
- `403 Forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden`, not JSON.

## Related namespaces

- `terminal`, `daemon`, `exec`, `watch`, `files`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the container's LOCAL timezone (the kit does no TZ conversion; only `expires_at` is UTC-anchored), set the entry to expire one year from now; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```bash
ID=$(hoody --container "$C" cron entries create root \
  --schedule '0 2 * * *' \
  --command 'pg_dump -U postgres mydb | gzip > /backups/db-$(date +%F).sql.gz' \
  --name nightly-db-backup \
  --expires-at "$(date -u -d '+1 year' +%FT%TZ)" \
  -o json | jq -r '.id')
```

**Step 2 — trial-run** by tightening to every minute. Wait ~70 s then `tail /var/log/syslog` (via the `terminal` kit) to confirm cron actually fired the job.

```bash
hoody --container "$C" cron entries update root "$ID" \
  --schedule '* * * * *' --comment 'TEST MODE — revert before merge'
```

**Step 3 — promote back to nightly** with a clean comment.

```bash
hoody --container "$C" cron entries update root "$ID" \
  --schedule '0 2 * * *' --comment 'production schedule'
```

### 2. Maintenance window — pause every managed job, do work, resume

**Goal:** disable every managed entry so nothing fires during a 30-min DB migration; re-enable once clean.

**Step 1 — capture every enabled managed id.** The listing is paginated (50 per page by default, at most 200), so over HTTP read every page before filtering: a job left on a later page stays enabled through the migration. The CLI fetches every page itself, up to 10,000 items or 1,000 requests, so check that it returned `total` rows. Run steps 1 and 2 as one script that exits on any listing or update failure, and start the migration only when it exits successfully; a partial list or a failed disable leaves jobs enabled.

```bash
# One call fetches every page.
body=$(hoody --container "$C" cron entries list root -o json) \
  || { echo "listing failed" >&2; exit 1; }
[ "$(jq '.entries | length' <<<"$body")" -eq "$(jq .total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
IDS=$(jq -r '.entries[] | select(.type=="managed" and .enabled) | .id' <<<"$body") \
  || { echo "unreadable listing" >&2; exit 1; }
```

**Step 2 — bulk disable.**

```bash
# --no-enabled sends {"enabled":false}; --enabled sends true.
for id in $IDS; do
  hoody --container "$C" cron entries update root "$id" --no-enabled >/dev/null \
    || { echo "disable failed for $id: do not start the migration" >&2; exit 1; }
done
```

**Step 3 — run your migration. Step 4 — bulk re-enable** the captured ids (same loop with `enabled: true`, that is `--enabled`). After a failed step 2, re-enable the same list: the entries disabled before the failure are still disabled. Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields, then remove the raw originals so nothing runs twice.

**Step 1 — collect the raw lines to migrate.** `hoody cron entries list` returns hand-written lines as `{ type: 'raw', line }` items; managed entries are `type: 'managed'` and are left alone.

```bash
# Raw items only; skip blanks, comments and environment lines (SHELL=, MAILTO = ..., "A B" = c).
body=$(hoody --container "$C" cron entries list root -o json) || exit 1   # every page
jq -r '.entries[] | select(.type=="raw") | .line' <<<"$body" \
  | grep -Ev "^[[:space:]]*(\$|#|([A-Za-z_][A-Za-z0-9_]*|\"[^\"]*\"|'[^']*')[[:space:]]*=)" > /tmp/cron-migrate.txt
cat /tmp/cron-migrate.txt
```

**Before step 2 — check every line for `%` and `\`.** A raw line is in crontab syntax and a managed command is not: in a raw line a bare `%` ends the command and sends the rest to its stdin, and `\%` and `\\` stand for `%` and `\`, while the kit escapes a managed command itself (see Quirks). The scripts below copy the command text as it is, so they keep a line's meaning only when it contains neither `%` nor `\`. Take any other line out of the step 1 list and migrate it by hand: write the command cron actually runs (`\%` becomes `%`, `\\` becomes `\`, and a `%`-delimited stdin becomes a pipe or a here-string) and create its entry from that. Step 3 drops only the lines still in the list, so remove the raw lines you migrated by hand the same way, or each of those jobs runs twice.

**Step 2 — create a managed entry per line.** An `@macro` line (`@daily`, `@reboot`, ...) has a one-field schedule; any other line has five fields. The rest of the line is the command.

```bash
i=0; FAILED=0
while IFS= read -r LINE; do
  i=$((i + 1))
  case "$(echo "$LINE" | sed -E 's/^[[:space:]]+//')" in @*) F=1 ;; *) F=5 ;; esac
  SCHED=$(echo "$LINE" | awk -v f="$F" '{s=$1; for (k = 2; k <= f; k++) s = s " " $k; print s}')
  CMD=$(echo "$LINE" | sed -E "s/^[[:space:]]*([^[:space:]]+[[:space:]]+){$F}//")
  hoody --container "$C" cron entries create root \
    --schedule "$SCHED" --command "$CMD" --name "migrated-$i" >/dev/null \
    || { echo "create failed for: $LINE" >&2; FAILED=1; break; }
done < /tmp/cron-migrate.txt
[ "$FAILED" = 0 ] || exit 1   # stop here: step 3 must not run after a failed create
```

**Step 3 — remove only the migrated raw lines.** Only after every create in step 2 succeeded: run steps 2 and 3 as one script, so the stop after a failed create also skips this step. After a partial failure, the managed entries created so far run alongside their raw lines (each of those jobs runs twice) until you delete them or finish the migration. Read the crontab text again (it now contains the new managed entries as `# hoody-cron:` metadata and rule line pairs), drop the raw lines from step 1 and write the rest back. A new managed entry's rule line is usually the same text as the raw line it replaces, so match a line only when the line before it is not a `# hoody-cron:` metadata line: dropping a rule line leaves its metadata unpaired, and the managed entry is lost. The PUT keeps every managed entry that is still in the text, with the same id. Do not PUT an empty crontab here: that would delete the entries step 2 just created.

```bash
[ -s /tmp/cron-migrate.txt ] || exit 0   # nothing to drop
BODY=$(hoody --container "$C" cron crontabs get root -o json) || exit 1
CUR=$(jq -er '.crontab | select(type == "string")' <<<"$BODY") || exit 1
# Drop a listed line only when it does not follow a "# hoody-cron:" metadata line.
NEW=$(printf '%s\n' "$CUR" | awk 'NR == FNR { drop[$0] = 1; next }
  { keep = !($0 in drop) || prev ~ /^[[:space:]]*# hoody-cron:/; prev = $0 } keep' /tmp/cron-migrate.txt -)
hoody --container "$C" cron crontabs set root --crontab "$NEW"
```

### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.** Names are not unique and the listing is paginated, so read every page and stop unless exactly one managed entry carries the name.

```bash
body=$(hoody --container "$C" cron entries list root -o json) || exit 1   # every page
[ "$(jq '.entries | length' <<<"$body")" -eq "$(jq .total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
ID=$(jq -r '.entries[] | select(.type=="managed" and .name=="health-poll") | .id' <<<"$body")
set -- $ID
[ $# -eq 1 ] || { echo "expected one entry named health-poll, found $#: $ID" >&2; exit 1; }
ID=$1
```

**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```bash
hoody --container "$C" cron entries update root "$ID" --schedule '*/5 * * * *'
```

**Step 3 — restore** to hourly once the investigation is over: the same call with `--schedule '0 * * * *'`.

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```bash
ID=$(hoody --container "$C" cron entries create root \
  --schedule @daily --command /opt/metrics/sample.sh \
  --name metrics-experiment --expires-at "$(date -u -d '+30 days' +%FT%TZ)" \
  -o json | jq -r .id)
```

After the timestamp passes, the kit's 60 s sweep **deletes** expired managed entries. `hoody cron entries list`/`hoody cron entries get` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `hoody cron crontabs set` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (to 60 days from now):

```bash
hoody --container "$C" cron entries update root "$ID" \
  --expires-at "$(date -u -d '+60 days' +%FT%TZ)"
```

**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```bash
hoody --container "$C" cron entries update root "$ID" --clear-expiration
```

### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.** Read every page and require exactly one match; if several entries share the name, pick the intended id explicitly.

```bash
body=$(hoody --container "$C" cron entries list root -o json) || exit 1   # every page
[ "$(jq '.entries | length' <<<"$body")" -eq "$(jq .total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
ENTRY_ID=$(jq -r '.entries[] | select(.type=="managed" and .name=="noisy-job") | .id' <<<"$body")
set -- $ENTRY_ID
[ $# -eq 1 ] || { echo "expected one entry named noisy-job, found $#: $ENTRY_ID" >&2; exit 1; }
ENTRY_ID=$1
```

**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```bash
hoody --container "$C" cron entries update root "$ENTRY_ID" \
  --no-enabled --comment "disabled $(date -u +%FT%TZ) — investigating"
```

**Step 3 — re-enable later** by calling the same update with `enabled: true`, that is `--enabled`.

### 7. Audit which users on the container have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". A container has 60+ system users, more than the default page of 50, so read every page.

`hoody cron crontabs list` returns one record per account in `/etc/passwd` (`{ user, crontab }`), 50 per page by default and at most 200. Filter client-side for non-empty `crontab`.

```bash
body=$(hoody --container "$C" cron crontabs list -o json) || exit 1   # every page
jq '.items[] | select(.crontab | test("\\S")) | {user, crontab}' <<<"$body"
```

For each non-empty user, drill in via `hoody cron entries list` for that user for the managed view, or read the `crontab` text directly from the listing above.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. ⚠ The canonical text becomes the whole crontab: raw lines not in it are removed, and so is every managed entry whose `# hoody-cron:` metadata and rule lines are not in it.

**Step 1 — snapshot current state** for forensics:

```bash
hoody --container "$C" cron crontabs get root -o json > /tmp/cron-snapshot.json
```

**Step 2 — push the canonical config.** Body MUST use `application/json` or an `application/*+json` Content-Type (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```bash
hoody --container "$C" cron crontabs set root \
  --crontab "$(cat /etc/iac/canonical-crontab.txt)"
```

### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without changing the schedule or the enabled state. PATCH is partial — fields you don't pass are not assigned.

```bash
hoody --container "$C" cron entries update root "$ID" \
  --comment 'owner: @team · runbook: https://wiki.example.com/cron-x'
```

`updated_at` advances; `schedule`, `enabled` and `command` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw). Match the whole line exactly, and skip a matching line that follows a `# hoody-cron:` metadata line: that one is a managed entry's rule, and dropping it orphans the entry.

**Step 1 — fetch** the multi-line string. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back.** Managed entries survive: the fetched text holds each one as a `# hoody-cron:` metadata line plus its rule line, and the PUT parses them back with the same ids. Leave those lines untouched; there is nothing to re-create afterwards (an identical create answers 200 with the existing entry, a changed one `409 ENTRY_EXISTS`).

```bash
# Check the read and the parse separately: a failed read must never become an empty PUT.
BODY=$(hoody --container "$C" cron crontabs get root -o json) || exit 1
CUR=$(jq -er '.crontab | select(type == "string")' <<<"$BODY") || exit 1
NEW=$(printf '%s\n' "$CUR" | awk -v target='*/30 * * * * /old.sh' \
  '{ keep = $0 != target || prev ~ /^[[:space:]]*# hoody-cron:/; prev = $0 } keep')
hoody --container "$C" cron crontabs set root --crontab "$NEW"
```

## Reference

### `hoody cron` (10) — Cron scheduling

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody cron crontabs get` |  | read | get crontab | `cron.crontabs.get` | `hoody cron crontabs get alice` |
| `hoody cron crontabs list` |  | read | list all crontabs | `cron.crontabs.list` | `hoody cron crontabs list --page 10 --limit 10` |
| `hoody cron crontabs set` |  | write | put crontab | `cron.crontabs.set` | `hoody cron crontabs set alice --crontab <crontab>` |
| `hoody cron entries create` |  | write | create entry | `cron.entries.create` | `hoody cron entries create alice --command 'ls -la' --comment Hello --enabled --schedule '0 * * * *'` |
| `hoody cron entries delete` |  | destructive | delete entry | `cron.entries.delete` | `hoody cron entries delete alice 3fa85f64-5717-4562-b3fc-2c963f66afa6 -y` |
| `hoody cron entries get` |  | read | get entry | `cron.entries.get` | `hoody cron entries get alice 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody cron entries list` |  | read | list entries | `cron.entries.list` | `hoody cron entries list alice --page 10 --limit 10` |
| `hoody cron entries update` |  | write | update entry | `cron.entries.update` | `hoody cron entries update alice 3fa85f64-5717-4562-b3fc-2c963f66afa6 --clear-expiration --command 'ls -la'` |
| `hoody cron health` |  | read | health check | `cron.kit.getHealth` | `hoody cron health` |
| `hoody cron open` |  | action | Open the Cron kit job manager in your browser |  | `hoody cron open` |


---

<!-- ===== namespace: curl ===== -->

# `curl` — full HTTP client gateway + REST-as-GET-URL bridge

## Purpose

Full HTTP client gateway. Sync/async jobs, cookie jars, bodies to storage, cron schedules. **Killer use case: turn any REST request — POST / PUT / PATCH / DELETE with bodies and headers — into a single GET-able URL** that works in a browser tab, a webhook field that only takes a URL, an LLM tool with web-search-only access, an `<img src>` / `<a href>`, or any environment that can't issue a non-GET request. The kit takes care of the actual HTTP call; the caller just hits a query-string URL.

## When to use

- **REST-as-GET bridge** — any environment that can only do GET (browsers, restricted webhooks, agents with only "fetch URL" capability, RSS-style schedulers, copy-pasteable links). See workflow #1 for the URL recipe.
- A server-side HTTP client (redirect following, TLS verification control, retries, cookie sessions) when you can't / don't want to use `fetch()`. Client certificates, custom CA files and outbound proxies are rejected over the API, and there is no HTTP-version option.
- Long downloads as background jobs.
- Multi-step auth with cookie jars (server-side session reused across hits).
- Recurring HTTP (pings, scrapes, webhooks) on a cron.

## When NOT to use

Not for: browser → `browser`, shell → `exec`/`terminal`, KV/SQL → `sqlite`, files → `files`, non-HTTP timers → `cron`.

## Prerequisites

- Instance `1`; no workspace ID.
- `hoody curl schedules *` 404s if disabled.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Convert any REST call into a single GET-able URL (HTTP only)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }`. Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; standard OR URL-safe base64, padding optional; takes precedence over `data`/`json`), the aliases `body` and `body_base64` (for `data` and `data_base64`; the canonical name wins when both are given), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Every other request field is POST-only: a headers map, `form` (URL-encoded fields), `cookie`, `auth_user` / `auth_password` / `auth_method`, `connect_timeout`, `max_redirects`, `max_filesize`, `tcp_nodelay`, `keepalive`, `keepalive_time`, `range`, `speed_limit`, `speed_time`, `retry_count` and `retry_delay`. The GET bridge ignores any of them in the query string without an error, so the request is sent without it. Neither form sends a multipart upload or reads a file from disk (`--data-binary @file`). To send arbitrary binary bytes, use `data_base64` on the GET bridge; the POST JSON form rejects a `data_base64` field with 400 (it refuses any unknown field).

Live examples (verified — replace the kit URL with your container's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `hoody proxy aliases create --program curl` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

`hoody curl run` **executes** the request and prints the response (a text body as-is, a JSON body pretty-printed; with `--response json` that is the `{status_code, headers, body}` envelope); it does NOT just compose a URL string. The CLI has no command for the GET route: `curl run` sends the POST form. When the deployment enables the kit's response cache (it is off by default), an eligible request can be answered from the cache instead. To compose a URL without firing it, build it client-side or create a proxy alias with `program: 'curl'`: a request to the alias host that carries its own path, such as `/api/v1/curl/request?...`, is forwarded as sent, and `target_path` only sets what the bare root URL serves.

For the imperative full-cURL surface (a headers map, `form` fields sent URL-encoded, cookies, auth, follow-redirects, `insecure`, etc.) use the POST form below — though note the kit refuses client-certificate files and an upstream proxy (an SSRF guard; the request schema no longer lists them), and accepts every other body, auth and connection field.

### 2. Sync request

`hoody curl run` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `hoody curl run` with `mode:"async"` → `job_id`.
2. Poll `hoody curl jobs get` or subscribe `hoody curl jobs stream` (SSE) filtered by `job_id` (`hoody curl jobs stream --job-id <id>`; the CLI has no WebSocket form).
3. `hoody curl jobs result get`; `hoody curl jobs cancel` aborts. `hoody curl jobs get` reports `retry_attempts`: 1 for a job that ran once, plus one per retry after a transfer error.

### 4. Cookie-jar session

1. `hoody curl run` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `hoody curl sessions cookies list` / `hoody curl sessions delete`.

### 5. Save download

1. `hoody curl run` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `hoody curl storage list`/`hoody curl storage get`/`hoody curl storage delete` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `hoody curl schedules create` with `{cron,request}` → `schedule_id`. Add `enabled: false` to create it paused: it never fires until `hoody curl schedules update` sets `enabled: true`.
2. `hoody curl schedules list`/`hoody curl schedules get`/`hoody curl schedules update` (`{"enabled":bool}` pauses or resumes)/`hoody curl schedules delete`.
3. Each admitted occurrence creates a job; inspect via `hoody curl jobs list`. An occurrence is skipped, with no job, while the previous run is still in flight or when the job queue rejects it.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **Save downloads with `--out-file`.** With `--out-file <path>`, `curl storage get`, `curl jobs result get` and `curl run` save the body byte for byte. Without it, `curl storage get` always streams the raw bytes to stdout, while `curl run` and `curl jobs result get` parse a JSON body and print it like any other output, and stream only a binary body. A terminal refuses streamed binary output (`--out-file -` prints it anyway). For a streamed body, `-o json` prints `{ saved_to, bytes, content_type }` with `--out-file` and is refused without it.
- **A saved download is stored under `by-job/{job_id}/<save_path>`, with best-effort index links** `by-date/<YYYY-MM-DD>/<job_id>` and `by-domain/<host>/<job_id>`. A URL whose host is an IP literal gets no `by-domain` link, and a symlink that cannot be created is skipped silently (failing to create an index directory fails the save), so expect one to three entries. `hoody curl storage list` returns one item per path; the bytes are the same file.
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `hoody curl schedules *` 404s if disabled.
- `hoody curl schedules update` changes any of `cron`, `request` and `enabled`; omitted fields keep their current value, so pause or resume by sending `enabled: false` or `enabled: true` alone.
- `hoody curl schedules create` takes `enabled` (default `true`). A schedule created with `enabled: false` has no `next_run` and does not fire; its `cron` must still parse but need not have a future occurrence yet. Any field other than `cron`, `request` and `enabled` is refused with 400 `INVALID_PARAMETER`.
- `bearer_token` sends `Authorization: Bearer <token>`, but an `Authorization` entry in `headers` wins: the token is then not sent, so the request carries one `Authorization` header.
- `hoody curl jobs result get` always answers `200` with the target's body and headers, whatever the target answered; the target's status code is in the `X-Curl-Status` header (and in `response.status_code` from `hoody curl jobs get`). A stored `429` or `503` is therefore not retried as a kit failure.
- **`schedules.create.cron` is 6-field (with seconds), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- Job events stream over a WebSocket at `/api/v1/curl/ws`; filter by `job_id`.

## Common errors

- `504` — the upstream request timed out (libcurl timeout); raise `timeout`. An async job does not wait on the caller's connection, but the same `timeout` still applies to the upstream request. The kit itself does not answer `408`; a transparent `run` response passes the upstream's own status through (`hoody curl jobs result get` does not: it answers 200 with `X-Curl-Status`), so an upstream `408` arrives as `408`.
- Cancelling a job answers `200`; no REST call answers `410`. Read `hoody curl jobs get` for `status: "cancelled"`, and stop waiting once a job is `failed` or `cancelled`. `hoody curl jobs result get` answers `404 JOB_RESULT_NOT_READY` when the job has no response body (still pending or running, or finished without an upstream response).
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

### 1. Webhook receiver bridge — outbound system can only fire GETs

**Goal:** your CRM can fire URLs but not POST. Translate a click → real upstream POST with JSON body + bearer.

**Step 1 — compose the bridge URL — body and headers go right in the query string.** The GET bridge takes `url`, `method`, the timing/session/response flags (`response`, `mode`, `session_id`, `timeout`, `bearer_token`, …), **plus the request body + headers**: `data` (raw body), `json` (JSON body; sets `Content-Type: application/json`), `data_base64` (binary-safe base64, standard or URL-safe, precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the method GET→POST.** So a real `POST … {json} + headers` becomes one GET-able link a CRM/webhook can fire:

```
# Full POST as ONE GET URL (json body + header; method auto-upgrades to POST):
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&json=%7B%22event%22%3A%22X%22%7D&header=Authorization:%20Bearer%20XYZ
# For payloads with &, quotes, newlines, or binary, prefer data_base64 (URL-safe base64) to dodge escaping:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<target>&data_base64=eyJldmVudCI6IlgifQ&header=Content-Type:%20application/json
```

(`form` fields, sent URL-encoded, cookies, Basic auth, retries, ranges and the connection limits are POST-only, and the GET bridge drops them without an error — use the POST form below for those. Neither form sends multipart uploads.)

```bash
# `hoody curl run` fires the request (it does not print a clickable URL). `--header NAME=VALUE`
# sets a request header and repeats once per header (the value may itself contain `=`);
# --json already sets Content-Type, and --bearer-token adds the Authorization header.
# --json takes an object or array only from a file (@path), never inline.
printf '%s' '{"event":"X"}' > event.json
hoody --container "$C" curl run \
  --url 'https://my-api/events' --method POST \
  --json @event.json \
  --header 'X-Request-Id=evt-1' \
  --bearer-token "$API_TOKEN"
```

**Step 2 — hide the `containerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```bash
hoody proxy aliases create --container-id "$C" --alias webhook-bridge \
  --program curl --target-path /api/v1/curl/request --allow-path-override
```

### 2. Multi-step OAuth login — cookie jar reuse across hits

**Goal:** authenticate against an API that uses a CSRF token + session cookie, then issue an authorized call. Pick a unique `session_id` per flow — once deleted, the same id returns `404 Session not found: <id> (tombstoned)` until the tombstone is garbage-collected (~24 h), after which the id is reusable again.

**Step 1 — fetch CSRF.** The Set-Cookie / response cookies are stored in the kit's jar.

```bash
SID="oauth-$(date +%s)"
TOKEN=$(hoody --container "$C" curl run \
  --url https://api.example.com/csrf --method GET --response json \
  --session-id "$SID" -o json | jq -r '.body | fromjson | .csrf_token')   # --response json is REQUIRED for a .body envelope
```

**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar. Encode the token: `data` is sent as written, so a token holding `+`, `&` or `=` would be altered. The `form` field encodes each value and sets the form content type.

```bash
# --form NAME=VALUE repeats once per field and sends the body's `form` map; --session-id keeps the cookie jar.
hoody --container "$C" curl run \
  --url 'https://api.example.com/login' --method POST \
  --form username=alex --form password=secret --form csrf="$TOKEN" \
  --session-id "$SID"
```

**Step 3 — authorized call.** Stored cookie is auto-attached.

```bash
hoody --container "$C" curl run --url https://api.example.com/me \
  --method GET --response json --session-id "$SID" -o json | jq -r .body
hoody --container "$C" curl sessions cookies list "$SID"
hoody --container "$C" curl sessions delete "$SID" -y
```

### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```bash
JOBS=()
for URL in https://httpbin.org/delay/1 https://httpbin.org/delay/2 https://httpbin.org/get; do
  JID=$(hoody --container "$C" curl run --url "$URL" --method GET --mode async -o json | jq -r .job_id)
  JOBS+=("$JID")
done
```

**Step 2 — poll until every job is terminal.** A job ends `completed`, `failed` or `cancelled`; stop on the last two, on a failed status request, and at a deadline. The deadline is checked between polls, so each status request is also capped (10 s here) to keep one stalled request from outliving it.

```bash
DEADLINE=$((SECONDS + 300))
while :; do
  pending=0
  for JID in "${JOBS[@]}"; do
    R=$(timeout 10 hoody --container "$C" curl jobs get "$JID" -o json) || { echo "status check failed: $JID" >&2; exit 1; }
    case "$(jq -r .status <<<"$R")" in
      completed) ;;
      failed|cancelled) echo "job $JID: $(jq -r '.status + " " + (.error // "")' <<<"$R")" >&2; exit 1 ;;
      *) pending=1 ;;
    esac
  done
  [ "$pending" = 0 ] && break
  [ "$SECONDS" -lt "$DEADLINE" ] || { echo "jobs still running after 300 s" >&2; exit 1; }
  sleep 1
done
```

**Step 3 — collect bodies.** `hoody curl jobs result get` returns just the upstream body, always with status 200; the upstream's status is in `X-Curl-Status`.

```bash
# --out-file saves each body as received: JSON, text or binary.
for JID in "${JOBS[@]}"; do
  hoody --container "$C" curl jobs result get "$JID" --out-file "/tmp/$JID.json"
done
```

### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Status flips from `running` to `cancelled`, and the cancelled job's `error` field is set to `Cancelled`.

```bash
JID=$(hoody --container "$C" curl run --url https://httpbin.org/delay/30 \
  --method GET --mode async --timeout 60 -o json | jq -r .job_id)
sleep 1
hoody --container "$C" curl jobs cancel "$JID"
sleep 1
hoody --container "$C" curl jobs get "$JID" -o json | jq '{status, error}'
```

### 5. Schedule + drift detection — fire every 15 min, audit history

**Goal:** ping a health endpoint every 15 min, fast-find failures. ⚠ Scheduler uses **6-field** cron syntax (with seconds) — `*/15 * * * *` (5-field) is rejected as `Invalid cron expression`.

**Step 1 — create.**

```bash
SID=$(hoody --container "$C" curl schedules create \
  --cron '0 */15 * * * *' \
  --request-url 'https://prod.example.com/health' \
  --request-method GET \
  --request-job-name prod-health \
  -o json | jq -r .schedule_id)
```

**Step 2 — audit failures.** A job is `failed` when the request could not be completed (DNS, connect, timeout) or when processing after the response failed, such as saving a download. An upstream HTTP error status alone does not fail the job: an upstream that answers `500` still yields a `completed` job, so also read the `response.status_code` of completed runs (from `hoody curl jobs get`; the listing does not carry it).

```bash
hoody --container "$C" curl jobs list --limit 200 -o json \
  | jq -r '.items[] | select(.name=="prod-health") | "\(.id) \(.status)"' \
  | while read -r JID ST; do
      if [ "$ST" = failed ]; then echo "$JID failed"; continue; fi
      [ "$ST" = completed ] || continue
      CODE=$(hoody --container "$C" curl jobs get "$JID" -o json | jq -r '.response.status_code // empty')
      [ -n "$CODE" ] && [ "$CODE" -lt 400 ] || echo "$JID HTTP ${CODE:-?}"
    done
```

**Step 3 — pause during deploy** (set `enabled: false` and back, or `delete` to drop entirely):

```bash
hoody --container "$C" curl schedules update "$SID" --no-enabled
# Resume: update "$SID" --enabled. Drop entirely:
hoody --container "$C" curl schedules delete "$SID" -y
```

### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```bash
JID=$(hoody --container "$C" curl run --url https://example.com/big.iso \
  --method GET --mode async --save --save-path iso/ubuntu.iso --timeout 600 \
  -o json | jq -r .job_id)
```

**Step 2 — wait + inspect storage.** Stop on `failed` or `cancelled` and at a deadline instead of waiting for `completed` forever; the deadline is checked between polls, and each status request is capped at 10 s. Up to three entries point at the SAME bytes: `by-job/`, plus the best-effort `by-date/` and `by-domain/` links (no `by-domain/` for an IP-literal host).

```bash
DEADLINE=$((SECONDS + 1800))
while :; do
  S=$(timeout 10 hoody --container "$C" curl jobs get "$JID" -o json | jq -r .status) && [ -n "$S" ] || { echo "status check failed" >&2; exit 1; }
  case "$S" in completed) break ;; failed|cancelled) echo "job $S" >&2; exit 1 ;; esac
  [ "$SECONDS" -lt "$DEADLINE" ] || { echo "still downloading after 30 min" >&2; exit 1; }
  sleep 2
done
hoody --container "$C" curl storage list --limit 10
```

**Step 3 — fetch & delete.** A delete through ANY of the paths removes the shared file, so every entry stops serving it (the others return `404` afterwards); the remaining index links may be left behind, dangling.

```bash
hoody --container "$C" curl storage get "by-job/$JID/iso/ubuntu.iso" --out-file /tmp/ubuntu.iso
hoody --container "$C" curl storage delete "by-job/$JID/iso/ubuntu.iso" -y
```

### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Against `httpbin.org/bearer` it returns `{"authenticated":true,"token":"…"}`.

```bash
hoody --container "$C" curl run --url https://api.github.com/user --method GET \
  --bearer-token ghp_xxxxxxxxxxxx --response json -o json \
  | jq '{status_code, headers, body}'
```

**HTTP Basic alternative** — swap the auth fields. Body `{ url, method, auth_user, auth_password, auth_method: 'basic' }`. Against `httpbin.org/basic-auth/alex/secret` it returns `{"authenticated":true,"user":"alex"}`.

### 8. REST→GET bridge for chat-channel embedding

**Goal:** drop a one-liner URL into Slack so a teammate can re-trigger a build by clicking. URL pattern + alias + IP gate.

**Step 1 — compose** (no kit call — URL pattern). The GET bridge carries the full request in the query string — `url`, `method`, body via `data`/`json`/`data_base64`, and repeatable `header=Name: Value` (a body auto-upgrades the method to POST). So a build-trigger that needs a JSON body + auth header is still one clickable link.

```
# GET-bridge URL — a real POST (json body + bearer header) as a single clickable link:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<url-encoded-build-trigger>&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ
```

**Step 2 — wrap with an alias** so the public URL hides `containerId`. The alias target must carry the whole request, body and auth included: the bridge reads the body and headers only from the query string, so an alias carrying just `url` and `method` sends an empty, unauthenticated POST. `target_path` refuses percent escapes (and spaces, quotes and braces), so the step 1 query cannot be pasted as is: write the target URL unescaped, send the JSON body (here `{"ref":"main"}`) as URL-safe base64 in `data_base64` (`<base64-body>` below) with a `Content-Type:application/json` header, and pass the token as `bearer_token`. The token then lives in the alias configuration, so gate the alias (step 3). Keep `allow_path_override: false`: the alias then serves only this `target_path`, at its root and at `/api/v1/curl/request` (both with the target's query), and any other path is refused with `404 ALIAS_PATH_PINNED`. A query key written in `target_path` wins over the visitor's, so a visitor cannot override the target `url`, `method`, body, headers or `bearer_token`. Keys the target does not set (for example `timeout` or `save`) still pass from the visitor, so write into `target_path` every key you want fixed. Step 3's gate is what limits who can fire it.

```bash
hoody proxy aliases create --container-id "$C" --alias rebuild-main --no-allow-path-override \
  --program curl --target-path '/api/v1/curl/request?url=https://ci.example.com/build&method=POST&data_base64=<base64-body>&header=Content-Type:application/json&bearer_token=XYZ'
```

**Step 3 — gate it** — only your office IPs can fire it (uses `hoody containers proxy groups ip set`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Finished job records, response bodies included, are deleted by an hourly sweep once they are older than the retention period (7 days by default; the deployment can change it). Saved downloads are kept.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`). The listing is ordered by creation time, newest first, and runs do not necessarily complete in that order; a schedule firing every 15 minutes also leaves many runs with the same name. So read every page and select by completion time: here, the completed run with the latest `completed_at` at or before 18 hours ago. `completed_at` carries fractional seconds, which jq's `fromdate` rejects; strip them first.

```bash
CUTOFF=$(( $(date +%s) - 18 * 3600 ))
body=$(hoody --container "$C" curl jobs list -o json) || exit 1   # every page
[ "$(jq '.items | length' <<<"$body")" -eq "$(jq .meta.total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
# One "<completed epoch> <id>" line per completed prod-health run.
jq -r '.items[] | select(.status=="completed" and .name=="prod-health" and .completed_at != null)
    | "\(.completed_at | sub("\\.[0-9]+Z$"; "Z") | fromdate) \(.id)"' <<<"$body" > /tmp/curl-runs.txt || exit 1
JID=$(awk -v c="$CUTOFF" '$1 <= c' /tmp/curl-runs.txt | sort -n | tail -1 | cut -d' ' -f2)
[ -n "$JID" ] || { echo "no completed prod-health run 18 h ago" >&2; exit 1; }
```

**Step 2 — fetch.** `hoody curl jobs result get` returns just the upstream body; `hoody curl jobs get` returns the full record (timing, headers, original request).

```bash
hoody --container "$C" curl jobs result get "$JID"
hoody --container "$C" curl jobs get "$JID"
```

### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path. The listing is newest first, so the old entries are on the last pages: collect every page before deleting anything, because each delete shifts the pages after it.

```bash
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%d)
body=$(hoody --container "$C" curl storage list -o json) || exit 1   # every page
[ "$(jq '.items | length' <<<"$body")" -eq "$(jq .meta.total <<<"$body")" ] || { echo "listing incomplete" >&2; exit 1; }
jq -r --arg c "$CUTOFF" '.items[] | select(.path | startswith("by-date/")) | select((.path | split("/")[1]) < $c) | .path' \
  <<<"$body" > /tmp/curl-purge.txt || exit 1
while IFS= read -r P; do
  hoody --container "$C" curl storage delete "$P" -y
done < /tmp/curl-purge.txt
```

## Reference

### `hoody curl` (21) — cURL jobs and schedules

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody curl health` |  | read | Service health check | `curl.kit.getHealth` | `hoody curl health` |
| `hoody curl jobs cancel` |  | destructive | Cancel a pending or running job; the record stays | `curl.jobs.cancel` | `hoody curl jobs cancel 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs delete` |  | destructive | Permanently delete a finished job's record and its saved downloads (a running job must be cancelled first) | `curl.jobs.delete` | `hoody curl jobs delete 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs get` |  | read | Get detailed job information | `curl.jobs.get` | `hoody curl jobs get 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs list` |  | read | List all async jobs | `curl.jobs.list` | `hoody curl jobs list --page 1 --limit 50` |
| `hoody curl jobs result get` |  | read | Get job response body | `curl.jobs.getResult` | `hoody curl jobs result get 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs stream` |  | read | Stream job lifecycle events live | `curl.jobs.stream` | `hoody curl jobs stream --job-id 550e8400-e29b-41d4-a716-446655440000 --since 0` |
| `hoody curl metrics` |  | read | Prometheus metrics | `curl.kit.getMetrics` | `hoody curl metrics` |
| `hoody curl run` |  | action | Execute HTTP request with full cURL capabilities | `curl.run` | `hoody curl run --compressed --connect-timeout 10 --url https://example.com` |
| `hoody curl schedules create` |  | write | Create a recurring scheduled job | `curl.schedules.create` | `hoody curl schedules create --cron '0 0 * * * *' --enabled --request-compressed --request-url https://example.com` |
| `hoody curl schedules delete` |  | destructive | Delete a schedule | `curl.schedules.delete` | `hoody curl schedules delete 770e8400-e29b-41d4-a716-446655440000 -y` |
| `hoody curl schedules get` |  | read | Get schedule details | `curl.schedules.get` | `hoody curl schedules get 770e8400-e29b-41d4-a716-446655440000` |
| `hoody curl schedules list` |  | read | List all scheduled jobs | `curl.schedules.list` | `hoody curl schedules list --page 1 --limit 50` |
| `hoody curl schedules update` |  | write | Change a schedule's cron expression, enabled state or request. Omitted fields keep their stored value; passing any request flag, such as --request-url, replaces the whole stored request | `curl.schedules.update` | `hoody curl schedules update 770e8400-e29b-41d4-a716-446655440000 --cron '0 */5 * * * *' --enabled` |
| `hoody curl sessions cookies list` |  | read | Get session cookies only | `curl.sessions.listCookies` | `hoody curl sessions cookies list user-session-123` |
| `hoody curl sessions delete` |  | destructive | Delete a session | `curl.sessions.delete` | `hoody curl sessions delete user-session-123 -y` |
| `hoody curl sessions get` |  | read | Get session details | `curl.sessions.get` | `hoody curl sessions get user-session-123` |
| `hoody curl sessions list` |  | read | List all cookie sessions | `curl.sessions.list` | `hoody curl sessions list --page 1 --limit 50` |
| `hoody curl storage delete` |  | destructive | Delete a saved file | `curl.storage.delete` | `hoody curl storage delete by-job/550e8400-e29b-41d4-a716-446655440000/report.pdf --recursive -y` |
| `hoody curl storage get` |  | read | Download a saved file | `curl.storage.get` | `hoody curl storage get by-job/550e8400-e29b-41d4-a716-446655440000/report.pdf` |
| `hoody curl storage list` |  | read | List all saved downloads | `curl.storage.list` | `hoody curl storage list --page 1 --limit 50` |


---

<!-- ===== namespace: daemon ===== -->

# `daemon` — supervisord program lifecycle (start any program; logs kept)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured by default (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Those are the default paths: a program can set its own log files or turn logging off. Log files rotate by size. When an apply changes a program's configuration, its old timestamped default log sessions older than the retention period (30 days by default) are deleted; the active session is kept, and custom log files are not covered by that cleanup. Log FILES outlive the process on disk, but the ephemeral tracking entry is dropped 10 minutes after the program finishes or is stopped — after that `hoody daemon ephemeral programs logs get` 404s (see Quirks); read the logs within those 10 minutes, or read the on-disk files directly (e.g. via the `files` namespace). `hoody daemon programs logs get` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, not added to the program list)** — `hoody daemon ephemeral programs start --command <command> --user <user> [--ttl <ttl>] [--wait] [--timeout <timeout>]`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). It adds no durable program entry, but it does write a temporary supervisord configuration and records the program in the kit's ephemeral tracking file so the cleanup pass can find it. The log files stay on disk, but `hoody daemon ephemeral programs logs get` works only while the tracking entry exists. The cleanup pass (every 30 s) finalizes a program that is `stopped` or `fatal`, or `exited` with autorestart turned off; under `autorestart: "unexpected"` an `exited` program is finalized when its exit code is known to be 0, and is kept while its exit code is unknown. A finalized program's result and logs stay readable for 10 minutes; then the pass drops the entry and the logs route 404s. Stopping a program that already finished does not extend that window. Optional `ttl` auto-stops after N seconds. A quick-start defaults to `autorestart: "false"` and runs once, even when the command fails; set `autorestart: "unexpected"` to restart it after a nonzero exit.
- **Registered program (durable, persists across kit restarts)** — `hoody daemon programs create --name <name> --command <command> --user <user> --enabled [--boot] --autorestart unexpected ...` → `hoody daemon programs start <id>`, then poll `hoody daemon programs status`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `hoody daemon ephemeral programs start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `hoody daemon programs create` + `hoody daemon programs start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → a one-off or hand-driven session is `terminal` with a **pinned non-ephemeral `terminal_id`**; a program that must be supervised (auto-restart, start at boot) is a `daemon` program with `terminal_id`, which runs on that terminal's PTY. Without `terminal_id` a daemon program has no TTY. A program with `terminal_id` cannot also have an effective sandbox.
- Watch or type into a daemon program's terminal → `hoody daemon programs attach <id|name>` (Ctrl-] detaches and leaves the program running; `--readonly` watches only). Snapshot, press, paste, write and wait drive it over REST without a WebSocket. Execute and session create on that id answer `409 DAEMON_TERMINAL`; a stopped program answers `409 DAEMON_PROGRAM_NOT_RUNNING` and closes a WebSocket with `4404`.
- After starting a program with `terminal_id`, attach to its terminal or use the terminal's REST automation at least once. Until something connects, its output waits in the terminal up to about 19 KB, and a program that writes more blocks and can stall. Once connected, hoody-terminal stays connected until the program ends or the terminal session is deleted.
- Need to pipe input mid-run / send keystrokes → `terminal` (`hoody terminal sessions press`, `hoody terminal sessions paste`).
- One-shot synchronous request/response → `exec` (HTTP handler, returns body).
- Schedule (cron syntax) → `cron`. Access logs → `proxyLogs`. File-system events → `watch`.

### When to prefer `daemon` over `systemd`

- Custom scripts and binaries you wrote that don't have a packaged unit.
- Quick experiments where you want REST-driven start/stop/log without writing a unit file.
- Port-range fan-out (`port_range` + `port_param` + `lazy_load`) — supervisord-side feature, not a systemd one.
- Programs you want to provision / mutate / remove via the Hoody API (CI scripts, multi-tenant container fleets) — `hoody daemon programs create` is one HTTP call.

### When to prefer `systemd` over `daemon`

- Any service whose Debian/Ubuntu package already drops a working unit in `/lib/systemd/system/` (most server software).
- You want `journalctl -u <service>`, `systemctl status`, drop-in overrides, socket-activated services, timers (cron-equivalent), or any other systemd feature.
- The program is part of the container's "default-on" baseline (boots with the container, never managed externally).

## Prerequisites

- `/dev/hoody`, `/hoody` and the log directory `/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `hoody daemon programs create` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `hoody daemon programs start <id>`, then poll `hoody daemon programs status` (`include_stats`) until `status.status` is `running` (`wait: true` blocks the request and easily exceeds 30 s on a cold kit; see Example 1); `hoody daemon programs logs get` on failure.

### 2. Ephemeral with TTL

- `hoody daemon ephemeral programs start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `hoody daemon ephemeral programs status`/`hoody daemon ephemeral programs logs get`; `hoody daemon ephemeral programs stop` to terminate.

### 3. Lazy port-range fleet

- `hoody daemon programs create` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `hoody daemon programs list --port 8042 --include-status`. `hoody daemon programs start <id> --port 8042`; `hoody daemon programs stop <id> --port <port>` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `hoody containers proxy *` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`hoody daemon programs update` (partial: an omitted field keeps its stored value, but `environment`, `sandbox`, `port_range` and `webhooks.enabled`+`webhooks.urls` are replaced whole when sent; see Quirks); `hoody daemon programs disable`/`hoody daemon programs enable`; `hoody daemon programs delete`; `hoody daemon programs reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`, in any letter case; `1`/`yes`/`0`/`""` -> 400. Send lowercase, which is what the SDK's typed values are.
- Webhook URLs are validated only in an enabled block: `webhooks.enabled: false` skips every URL, event, header, timeout and retry check (the block must still carry `enabled` and `urls`). In an enabled block, URLs are HTTPS-only. Userinfo is rejected; the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`), when the URL authority is an IP literal or `localhost`. A DNS name is not resolved when the block is saved; at delivery time, private and reserved addresses are dropped from its resolution and delivery fails when none remains. Delivery never follows redirects and ignores the environment's HTTP proxy settings.
- A `webhooks` edit must send `enabled` AND `urls` (a block without `urls` is a 400, `missing field urls`) and replaces both; `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. An enabled block with an empty `urls` is a 400. Callbacks are delivered only when the deployment enables event delivery for the kit; the block is validated and stored either way.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` must resolve under `/hoody/storage/hoody-daemon/logs/`.
- `hoody daemon programs start` on `port_range` REQUIRES `{ port }`; `hoody daemon programs stop <id> --port <port>` or `{ all: true }`.
- `hoody daemon ephemeral programs start` returns `temporary_id` = `quick_<unix-ms>_<seq>` (e.g. `quick_1700000000000_1`); pass it unchanged to `hoody daemon ephemeral programs status`, `hoody daemon ephemeral programs logs get` and `hoody daemon ephemeral programs stop` on every surface. TTL polled ~10 s.
- A program is addressed by its integer `id` from `hoody daemon programs list`, never by its name: a name in the `{id}` slot is refused with 404 before the daemon looks anything up. To find the id of a named program, filter the list by name (`hoody daemon programs list --name <name> -o json`).
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `hoody daemon ephemeral programs stop`, the program's result and logs stay readable for 10 minutes; then its tracking entry is dropped and `hoody daemon ephemeral programs logs get` returns `404`, while the on-disk log files persist. If withdrawing the program's supervisord group fails, the stop still reports success, with `cleaned_up: false`, and the next cleanup pass retries the withdrawal. Read `hoody daemon ephemeral programs logs get` within those 10 minutes, or fetch the on-disk file directly.
- `hoody daemon programs start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running and, for a standard program with a `ready_port`, that port accepts connections; otherwise, including a running program whose `ready_port` is not serving, it takes the start path, and polls for readiness only with `wait: true` (port-range responses include an `instance` block with the instance's status, but a newly dispatched start leaves out its pid — only the already-running shortcut returns an observed pid; standard programs omit the `instance` field entirely. Read the pid from `hoody daemon programs status <id>`). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `hoody daemon programs update` (not per-key merge). If the existing env is `{A:"1",B:"2"}` and you update with `{environment:{A:"9"}}`, the stored map becomes `{A:"9"}` (values are strings). To preserve secrets, GET the program first and re-send the merged map.
- **`sandbox` is three-state on `hoody daemon programs update`**: absent keeps the stored block, `null` clears it, and an object REPLACES the whole block (no field merge). Sending `{sandbox:{process:{max_pids:64}}}` to a program that also had `filesystem.read_only_root` and `network.mode: restricted` leaves only `max_pids`, and the program runs without the others. Read `hoody daemon programs sandbox get <id>` first (`configured` is the stored block) and resend every restriction you want kept. The CLI does this check for you: a `--sandbox-*` edit that would drop a stored restriction is refused, nothing is sent, and each restriction is listed with the flag that resends it; `--sandbox-replace` sends the edit anyway.
- Quick-start programs cannot be sandboxed: a non-null `sandbox` on `hoody daemon ephemeral programs start` is a 400 (`sandbox is not supported for quick-start programs`); `null` is accepted as absent.
- An effective sandbox is refused for a `user` that resolves to uid 0 (under any name) and together with `terminal_id`. A block that restricts nothing is stored as absent and does not appear on the program.
- **A sandboxed program fails CLOSED at launch.** If a mechanism its policy needs is missing the program does not start unconfined, it refuses to start at all: Landlock below the network ABI, a `bwrap` or `systemd-run` the container does not have, or an ingress policy with no `nft`. Expect the program to be down, not unprotected. A launch-stage refusal is printed as `sandbox: <reason>` on the PROGRAM's stderr, not in the daemon log, so read `hoody daemon programs logs get` with `type=stderr`; the daemon log carries the earlier failures instead (validation, rendering, firewall admission, the supervisord apply). A stored block is also re-validated every time the program is rendered, so a block that later breaks a rule refuses the render rather than running the program unconfined.
- A NON-EMPTY `network.ingress_allow_from`, or an `ingress_rate_limit`, needs a listening set: without `bind_ports`, `port_range` or `ready_port` the edit is a 400 (`sandbox.network.ingress_* requires a listening set`). An empty list owes no rules and so needs nothing. They filter IPv4 TCP arriving on `eth0` at those ports only, leave established connections alone, and an empty `ingress_allow_from` restricts nothing rather than denying everyone.
- **Do not test an ingress allowlist from inside the same container.** The chain only matches what arrives on `eth0`, so same-container traffic never reaches it at all; and `ingress_allow_platform` defaults to `true`, which returns traffic whose source is loopback or the container's gateway ahead of both the meter and the allowlist. Either way a local probe proves nothing. Test with a new connection from an outside source. Public traffic the proxy forwards keeps the client's own address and IS filtered. The rate meter runs before the allowlist and stops tracking new sources once its 65535-entry set is full, while the allowlist keeps applying.
- `hoody daemon programs sandbox get <id>` answers with more than the stored block, and none of it certifies a running program: `configured` is what was persisted; `rev` is the 12-hex revision recomputed from the currently valid stored policy, the one the daemon WOULD place on the wrapper command line rather than an observation of the running process, and null when no effective policy validates; `effective` is DIAGNOSTIC argv recomputed from the stored policy, carrying placeholders like `<program argv>` and `<pid>`, never the observed command, and it omits what the wrapper applies from inside itself (Landlock ports and the open-file limit); `live` reports the nft table, chain and rules read from the kernel at request time; `firewall` is `none`, `ok`, `draining` or `degraded`, with `problems` listing validation, state, integrity and unresolved-install failures. Read `problems` before concluding a restriction is in force.
- **`restricted` is a PORT policy, not a destination policy.** `full` restricts neither bind nor connect. `restricted` limits which TCP ports the program may bind and connect to, at every destination including loopback: it cannot allow one host and deny another, and it does not touch UDP, ICMP or raw sockets, because Landlock has no hook for them. It also governs the `bind` and `connect` CALLS, not a socket that starts listening without an explicit bind, and a listener obtained that way is outside the ingress rules too. `none` is different in kind: it unshares the network namespace, so it removes IP networking of every protocol. Network mode alone does not block filesystem Unix sockets: under every mode, `none` included, they are governed by filesystem restrictions and file permissions rather than by this field. Every effective sandbox also masks `/run/user` with an empty directory, so sockets beneath it (the user manager, the session bus, agent sockets) are unreachable.
- Ports are numbers or inclusive `"a-b"` strings. An omitted `bind_ports` defaults to the union of `port_range` and `ready_port`, and an explicit list has to cover both. `restricted` needs a non-empty resolved bind set, and an omitted or empty `connect_ports` denies outbound TCP entirely; a non-empty `connect_ports` requires `restricted`. `none` refuses declared listeners, a non-null explicit `bind_ports` (`[]` included), a non-empty connect or allow list, and a configured rate limit. Empty lists and either value of `ingress_allow_platform` are accepted and inert.
- **The filesystem side is confinement, not a private container.** An effective sandbox drops all capabilities and unshares the user, PID and IPC namespaces, but the program keeps its account's supplementary groups and still sees the container's filesystem subject to ordinary permissions. `read_only_root` stops writes, not reads, and `/dev` and `/proc` are mounted over it. Private `/tmp` and `/var/tmp` are added only with `process.private_tmp: true`, which defaults to false: otherwise the program shares the container's temporary directories. `hidden` is not a secrecy boundary against an actor who can rename a validated directory or one of its ancestors: writable sources are pinned by descriptor at launch, but mount destinations are still resolved by pathname.
- Process limits have fixed domains and are rejected outside them: `max_memory` from `16M` to `64G` (decimal bytes, or uppercase binary `K`/`M`/`G`, with scope swap disabled), `max_pids` from 4 to 65536 counting threads and two wrapper helpers, `max_open_files` from 8 to 1048576 applied as both the soft and the hard limit. `max_cpu` (`"<n>%"`, whole numbers from `1%` to `102400%`, `100%` = one CPU), `max_file_size` (a per-file size limit, `1K` to `1024G`) and `tmp_size` (the size of each private tmpfs, `1M` to `64G`, only with `private_tmp: true`) are accepted too; a daemon built before they were added refuses them as unknown fields. There is no aggregate disk quota.
- **A stored sandbox is not proof that one is installed.** An add or edit can persist the new block and still fail to apply it to supervisord; the response says so, and the earlier process may keep running unconfined when its stop cannot be confirmed. Treat a failed write as unresolved, read `problems`, fix the cause and reapply, rather than assuming either the old or the new policy is in force.
- The ingress table `ip hoody_daemon` is rebuilt from desired state, not continuously enforced. Flushing or weakening it out of band can leave running programs unprotected: status turns `degraded` and new ingress launches refuse, but there is no integrity-repair loop and nothing stops what is already running. The next firewall transaction or reconcile rebuilds the table; re-applying an identical policy does not. Restore it and check `live` plus `firewall` after any out-of-band change.
- Ingress rules are attached to a destination PORT on `eth0`, not to a process. Another listener on that same port at a different local address gets the same filtering, and the ownership check only knows about ports other programs have DECLARED, so an undeclared listener is neither protected from this nor protected against it.
- **A policy change restarts the program.** The revision is part of the supervisord command line, so changing the resolved policy replaces the definition and stops the running instance; whether another starts is decided by `boot` and `lazy_load`, not by the edit. The old revision's ingress rules and port reservations can linger as `draining` after the call returns, so for a short window traffic meets both policies and the port is not yet free to reuse.
- Webhook delivery needs per-program `webhooks.enabled: true` AND a deployment that enables event delivery for the kit. No request turns event delivery on, so a program whose `webhooks.enabled` is `true` can still receive no callbacks; a saved `webhooks` block is not proof that any will arrive.
- `port_range` is an object `{ start, end }`; the CLI flags `--port-range-start` and `--port-range-end` build it.

## Common errors

- 400 webhook (enabled blocks only): `must use HTTPS protocol`, `must not contain userinfo`, `cannot point to private, loopback, link-local, or cloud-metadata IP addresses`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required for port-range programs` -> resend with a `port` from the program's range, via `--port`. success=false `Program with ID {id} is disabled` -> `hoody daemon programs enable` first.
- `403 Forbidden` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The body is the plain text `Forbidden` with no reason; use the capability URL.
- 1 MB request body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `hoody daemon programs create` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-tick \
  --command 'sh -c '\''while :; do echo tick $(date -u +%%s); sleep 5; done'\''' \
  --user user --enabled --boot --autorestart unexpected \
  -o json | jq -r '.program.id')
```

**Step 2 — `hoody daemon programs start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (`wait:true,timeout:30` hits the client-side timeout). Pass `wait: false` and poll `hoody daemon programs status` instead.

```bash
hoody --container "$C" daemon programs start "$ID"
while [ "$(hoody --container "$C" daemon programs status "$ID" -o json | jq -r .status.status)" != "running" ]; do sleep 1; done
```

### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no durable program entry), let it run up to 10 minutes, retrieve its output. `hoody daemon ephemeral programs start` returns `temporary_id = "quick_<unix-ms>_<seq>"` (e.g. `quick_1700000000000_1`); every later call takes that id unchanged. Truncating it to `quick_<ms>` returns 404.

**Step 1 — launch.**

```bash
QID=$(hoody --container "$C" daemon ephemeral programs start \
  --name examples-daemon-qs --user user --ttl 600 \
  --command 'sh -c "for i in $(seq 1 30); do echo qs-$i; sleep 1; done"' \
  -o json | jq -r .temporary_id)
```

**Step 2 — check status.**

```bash
hoody --container "$C" daemon ephemeral programs status "$QID" -o json
```

**Step 3 — tail logs.**

```bash
hoody --container "$C" daemon ephemeral programs logs get "$QID" --type stdout --lines 10
```

**Step 4 — stop.** Read the logs within 10 minutes of the stop: after that the tracking entry is dropped and `hoody daemon ephemeral programs logs get` returns 404 (the on-disk log files stay).

```bash
hoody --container "$C" daemon ephemeral programs stop "$QID"
```

### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (the kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. At start-time the kit appends `<flag>=<port>` — **equals-joined**, one instance per port in the range — so the program must accept the `--flag=value` form. `python3 -m http.server` does NOT (its port is positional and `--port` is an unrecognised argument), so the example wraps it in a one-line `sh -c` that turns the appended flag back into the positional port.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-fanout --command 'sh -c "exec python3 -m http.server ${1##*=}" sh' \
  --user user --enabled \
  --port-range-start 18800 --port-range-end 18802 \
  --port-param=--port --lazy-load \
  -o json | jq -r .program.id)
```

**Step 2 — start one specific port and read fleet-wide status.** `hoody daemon programs list --port 18800 --include-status` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block.

```bash
hoody --container "$C" daemon programs start "$ID" --port 18800
hoody --container "$C" daemon programs list --port 18800 --include-status true -o json \
  | jq '.programs[].status'
```

The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`hoody daemon programs logs get` with type / lines)

**Goal:** investigate why a worker keeps restarting. `hoody daemon programs logs get` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log`.

```bash
hoody --container "$C" daemon programs logs get "$ID" --type stderr --lines 200
```

For a port-range program, select the instance when reading logs: add `--port 18800`.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```bash
# `programs update` needs only the id; every other flag is optional.
hoody --container "$C" daemon programs update "$ID" \
  --webhooks-enabled \
  --webhooks-urls https://hooks.example.com/daemon-events \
  --webhooks-events FATAL --webhooks-events BACKOFF \
  --webhooks-headers X-Source=hoody-daemon \
  --webhooks-timeout 10 --webhooks-retry 2
```

⚠ A `webhooks` edit replaces `enabled` and `urls` and must send both: `{ webhooks: { enabled: false } }` on its own is a 400 (`missing field urls`). To turn delivery off, resend the current `urls` with `enabled: false`; to rotate URLs, send the full new `urls` array. `events`, `headers`, `timeout` and `retry` keep their stored values when omitted. `hoody daemon programs update` needs only the id on every surface: the SDK edit type is `ProgramUpdate`, with nothing required.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call.

```bash
hoody --container "$C" daemon programs list -o json > /tmp/daemon-snapshot.json   # CLI list has no --limit
hoody --container "$C" daemon programs reset -y
```

### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `hoody daemon programs update` is partial on every surface: fields absent from the request body keep their stored values. `environment` itself is replaced whole (see the note below).

> The CLI sends only the flags you pass: `hoody daemon programs update "$ID" --environment LOG_LEVEL=debug` transmits `{"environment":{"LOG_LEVEL":"debug"}}` and nothing else, so no stored field is overwritten by a default.

```bash
# environment is replaced whole: pass every variable the program should keep.
hoody --container "$C" daemon programs update "$ID" \
  --environment LOG_LEVEL=debug --environment BUILD=examples
hoody --container "$C" daemon programs stop "$ID"
hoody --container "$C" daemon programs start "$ID"
```

⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:"1",B:"2"}` and update with `{environment:{A:"9"}}`, you end up with just `{A:"9"}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. For a standard program, `hoody daemon programs status <id>` returns `{ success, status: { id, status, pid?, uptime? }, stats? }`: the resource figures are in the separate `stats` object, present only when they could be collected for a running process. A program that is not running (`backoff`, `stopped`, `fatal`, …) has no `pid`, `uptime` or `stats`; supervisord's diagnostic text is never returned as `uptime`. A port-range program answers with `instances` instead, each instance carrying its own `stats`.

```bash
hoody --container "$C" daemon programs status "$ID" --include-stats true
```

⚠ `include_stats` is a **string** boolean (`"true"`/`"false"`) — `1`/`yes`/empty string return `400` (strict-bool query parse, see Quirks).

### 9. Stop one port instance OR every instance in a port-range fleet

**Goal:** kill just port 18800 vs. drain the whole fleet for a deploy.

**Single port** (other ports keep running):

```bash
hoody --container "$C" daemon programs stop "$ID" --port 18800
```

**Whole fleet** (`all: true`):

```bash
hoody --container "$C" daemon programs stop "$ID" --all
```

⚠ For a port-range program, `hoody daemon programs start` REQUIRES `{ port }` (single-port only); there is no "start them all" — boot each port individually or rely on `lazy_load: true` to materialise on first proxy hit.

### 10. Disable now, re-enable after the migration

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `hoody daemon programs disable` flips `enabled: false` (process stays in the listing for forensics); `hoody daemon programs enable` brings it back without touching `command`/`environment`. Enabling reapplies the program's configuration, so a program with `boot: true` (and not `lazy_load`) can start right away; follow it with an ensure-start (`if_not_running: true`), which returns early when the program is running and ready, and otherwise takes the start path (readiness polling only with `wait: true`).

```bash
hoody --container "$C" daemon programs disable "$ID"
hoody --container "$C" daemon programs enable "$ID"
hoody --container "$C" daemon programs start "$ID" --if-not-running
```

⚠ Trying `hoody daemon programs start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `hoody daemon programs enable` first.

## Reference

### `hoody daemon` (21) — Daemon and ephemeral programs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody daemon ephemeral programs list` |  | read | List all ephemeral programs | `daemon.ephemeralPrograms.list` | `hoody daemon ephemeral programs list` |
| `hoody daemon ephemeral programs logs get` |  | read | Get ephemeral program logs | `daemon.ephemeralPrograms.getLogs` | `hoody daemon ephemeral programs logs get <id> --type stdout --lines 100` |
| `hoody daemon ephemeral programs start` |  | write | Launch ephemeral CUSTOM program | `daemon.ephemeralPrograms.start` | `hoody daemon ephemeral programs start --command 'python my_batch_job.py' --user worker --directory /opt/app --inject-container-env` |
| `hoody daemon ephemeral programs status` |  | read | Get ephemeral program status | `daemon.ephemeralPrograms.getStatus` | `hoody daemon ephemeral programs status quick_1731605123456_0` |
| `hoody daemon ephemeral programs stop` |  | write | Stop ephemeral program | `daemon.ephemeralPrograms.stop` | `hoody daemon ephemeral programs stop quick_1731605123456_0` |
| `hoody daemon health` |  | read | Service health check | `daemon.kit.getHealth` | `hoody daemon health` |
| `hoody daemon programs create` |  | write | Add a new CUSTOM program | `daemon.programs.create` | `hoody daemon programs create --id 100 --name my-app --description 'My Node.js application' --command 'node app.js' --user nodejs` |
| `hoody daemon programs delete` |  | destructive | Remove a program | `daemon.programs.delete` | `hoody daemon programs delete 100 -y` |
| `hoody daemon programs disable` |  | write | Disable a program | `daemon.programs.disable` | `hoody daemon programs disable 100` |
| `hoody daemon programs enable` |  | write | Enable a program | `daemon.programs.enable` | `hoody daemon programs enable 100` |
| `hoody daemon programs get` |  | read | Get a specific program | `daemon.programs.get` | `hoody daemon programs get 100` |
| `hoody daemon programs list` |  | read | List all programs | `daemon.programs.list` | `hoody daemon programs list --hoody-kit true --lazy-load true` |
| `hoody daemon programs logs get` |  | read | Get program logs | `daemon.programs.getLogs` | `hoody daemon programs logs get 100 --type stdout --lines 100` |
| `hoody daemon programs logs stream` |  | read | Follow a program's log live: replays the last --lines lines, then prints every new line. A reconnect resumes after the last line received | `daemon.programs.streamLogs` | `hoody daemon programs logs stream --id 100 --type stdout --port 8080` |
| `hoody daemon programs reset` |  | destructive | Reset programs to default | `daemon.programs.reset` | `hoody daemon programs reset -y` |
| `hoody daemon programs sandbox get` |  | read | Show a program's sandbox: the stored block, the policy revision, what it resolves to, and what the firewall is holding | `daemon.programs.getSandbox` | `hoody daemon programs sandbox get 100` |
| `hoody daemon programs start` |  | write | Start a program or port instance | `daemon.programs.start` | `hoody daemon programs start 100 --port 8042 --wait` |
| `hoody daemon programs status` |  | read | Get the status of every program (no id) | `daemon.programs.listStatus` | `hoody daemon programs status --port 8080` |
| `hoody daemon programs status` |  | read | Get the status of one program | `daemon.programs.getStatus` | `hoody daemon programs status --port 8080` |
| `hoody daemon programs stop` |  | write | Stop a program or port instance | `daemon.programs.stop` | `hoody daemon programs stop 100 --port 8042` |
| `hoody daemon programs update` |  | write | Edit a program | `daemon.programs.update` | `hoody daemon programs update 100 --name my-app --description 'My Node.js application'` |


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

- Active X11 display (`DISPLAY=:N`). To render X apps from a terminal into display `:N`, create the terminal session with an explicit string `display: "N"`: the create call takes `display` from the request body only, and no `terminal_id` value ever implies a `DISPLAY`. (A session the terminal kit has to create on demand for a command is configured from the request URL instead, where a `terminal-N` host already supplies `display=N`.) On `hoody terminal sessions create` the flag is `--display N`.
- Display ID resolution: `*-display-N.*` host (e.g. `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` for display `1`) or query override `?displayId=N`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `hoody display screenshots capture` with `base64` on (for vision). One response carries the image (`image.data`) and its metadata (`info.timestamp`, `info.full.width`/`height`).
2. `hoody display input click` / `hoody display input type` at a point picked on that screenshot: a screenshot spans the whole screen, so its pixel (x, y) is the point (x, y) these act on.
3. `hoody display screenshots capture` again to see the result. There is no cheap change check: `hoody display screenshots capture` takes a full new capture as well, and `timestamp` is the capture time in whole seconds, not a "screen changed" marker.

### 2. Find and focus a window

1. `hoody display windows list` (`onlyVisible` on).
2. `hoody display windows search` — a `pattern` plus which fields to match (`name`, `class`, `classname`). Add `-o json` to the list and search commands to get the full response, window ids included.
3. `hoody display windows focus` with `sync` on. Read `details.inputFocus` in the response: proceed with keyboard input only when it is `true`. `false` means the window was activated but is not viewable, so keyboard input cannot reach it. `hoody display windows raise` is not a substitute for focusing.
4. `hoody display windows geometry get` — coords.
5. `hoody display windows active get` — confirms activation only, not keyboard focus.

`hoody display windows list`, `hoody display windows focus` and `hoody display windows active get` need a window manager on the display: `409 NO_WINDOW_MANAGER` means none is running, and retrying does not help. Start a window manager (for example a desktop session), or use `hoody display windows search`, window geometry and name queries, and mouse and keyboard actions, which work without one.

### 3. Drag / select

1. `hoody display mouse move` — optional pre-position.
2. `hoody display input drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `hoody display input select` — click + shift-click.
4. `hoody display input reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `hoody display clipboard set` — `text`, optional `selection`.
2. `hoody display keyboard press` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `hoody display clipboard get` — read back after GUI copy.

### 5. Batch input replay

1. `hoody display input batch act` — an ordered list of actions in one request. It stops at the first failure and still answers 200, so check `success` and `failed`. Add `-o json` to get the full result body. When the body says `success: false`, the command still prints it, then writes `✗ … reported success: false` to stderr and exits 1.
2. `hoody display input wait` — interleave waits.
3. `hoody display screenshots capture` — confirm.

### 6. Press a key or a key combination

1. `hoody display keyboard press` with `keys`, a list of up to 20 combinations pressed in turn: `["Return"]`, `["Escape"]`, `["ctrl+l"]`, `["ctrl+shift+t"]`, `["Tab", "Down", "Return"]`. Names are X keysym names (`Return`, `Escape`, `Tab`, `BackSpace`, `Delete`, `Up`/`Down`/`Left`/`Right`, `Home`, `End`, `Page_Up`, `F1`…) joined to modifiers (`ctrl`, `shift`, `alt`, `super`) with `+`. `hoody display keyboard press --display-id 1 --keys ctrl+l`.
2. To submit typed text, end it with a line break instead: in `hoody display keyboard type` and `hoody display input type`, `\n` presses Return.
3. `hoody display keyboard down` / `hoody display keyboard up` hold and release one key; `hoody display input reset` releases anything left held.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (must match `^\d+$`); an out-of-range or non-numeric value is silently ignored and the id is taken from the host instead.
- All endpoints except `hoody display health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; turn `base64` on for JSON.
- `hoody display screenshots get` needs numeric `timestamp`, not `timestamp_human`.
- **A screenshot pixel is a click coordinate.** A screenshot spans the whole screen at its current size, read from the windows as they are when it is taken, so pixel (x, y) is the point `hoody display input click` and the other pointer calls act on at (x, y). Where no window is, the image is transparent. A `region` crop starts at its `x1,y1`: add them to a point picked on the crop. Take a new screenshot after a viewer attaches: the screen then takes the viewer's size and the windows move.
- `hoody display input click` and `hoody display input type` refuse a point with no viewable window with `409 WINDOW_NOT_VIEWABLE` and click nothing. While no viewer is attached to the display that is every point; with one attached, it is the bare desktop between windows. Attach a viewer and pick a point on a window in a fresh screenshot.
- A line break in `text` (`\n`, `\r\n` or `\r`) presses Return in `hoody display keyboard type` and `hoody display input type`, so `"https://example.com\n"` types the address and submits it; `\t` presses Tab. Every other key or combination (Escape, ctrl+l, arrows) goes through `hoody display keyboard press`.
- `hoody display input click` refuses a point outside the display's current size with `400 VALIDATION_ERROR` instead of clicking the screen edge, and its `details.pointer` reports where the pointer was after the click and the window under it (`x`, `y`, `window`). A `200` means the click was delivered there, not that the program acted on it: take a new screenshot to see the effect.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Clipboard reads and writes can fail with `CLIPBOARD_FAILED`, carrying a shortened tool error; read the clipboard back after a write to confirm it landed.
- Window IDs are accepted as decimal or hex (`0x...`). `hoody display windows list`, `hoody display windows search` and `hoody display windows active get` return decimal numbers; the path-parameter routes (`hoody display windows get`, `hoody display windows geometry get`, `hoody display windows title get`) echo `windowId` exactly as sent, as a string. Compare ids as numbers, not strings.{1,8}$/"]
- `hoody display windows focus` activates the window and then tries to give it X input focus. The second step fails on a window that is not viewable, and the call still answers `success: true` with `details.inputFocus: false` and a `warning`; untargeted keyboard input then does not reach that window. `hoody display windows active get` confirms the activation only.
- `hoody display get` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the virtual screen dimensions (those live on `hoody display geometry get`). 
- `hoody display input reset` clears stuck modifiers/buttons.
- `hoody display windows wait` answers 200 even when it times out: the body is `success: false, timedOut: true`, so check `timedOut`, not the status. `timeoutMs` is 100-25000 (default 10000). Too many waits at once on one display give `429 QUEUE_FULL`.
- `hoody display windows restore` waits by default (`sync`, up to 2 s) until the window manager reports the window as no longer minimized, unlike the other window actions; a window still minimized after that is `500 INPUT_ACTION_FAILED`. With `sync: false` the answer's `details.state` is `null`, unless the window was already normal: that no-op answers `details.state: "normal"` with `details.synced: true`.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — the X server for that `displayId` is unreachable. Returned by the input, clipboard and window routes alike.
- `404 SCREENSHOT_NOT_FOUND` on `hoody display screenshots get` — no stored capture has that timestamp. Refresh by calling `hoody display screenshots capture`, which **takes a fresh screenshot** (with `base64` on, the response carries its `info.timestamp`), then retry `hoody display screenshots get` with the new timestamp. `hoody display screenshots latest get` returns the latest stored image by default; its metadata-only form (`--metadata`) returns only that image's metadata. Neither takes a fresh screenshot, so neither replaces a missed timestamp.

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The `N` in the `display-N` kit hostname is the display id, so `display-1` addresses display 1; `--display-id N` overrides it. The examples pass `displayId=1` explicitly, matching the host.

### 1. See-then-act loop — capture, click, re-capture

**Goal:** capture the screen, click a coordinate, capture again — the typical inner loop for vision-driven agents. Each capture with `base64` on returns the image and its metadata in one response, so no separate metadata call is needed. `info.timestamp` is the capture time in whole seconds; two captures in the same second share it, so it cannot tell you whether the screen changed.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json > /tmp/before.json
jq -r .info.timestamp /tmp/before.json
jq -r .image.data /tmp/before.json > /tmp/before.b64
```

**Step 2 — click at `(75, 50)`.** `hoody display input click` moves AND clicks in one call; default `button=1` (left).

```bash
hoody --container "$C" display input click --display-id 1 --x 75 --y 50 --button 1
```

**Step 3 — capture again and give the new image to the vision model.** With `base64` on, `hoody display screenshots capture` returns the fresh image and its metadata. There is no cheaper probe: the metadata-only form (`--metadata`) still takes a full screenshot and only leaves the image bytes out.

```bash
hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json | jq -r .image.data > /tmp/after.b64
```

### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `hoody display windows search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns an object whose `windows` field is an array of numeric window ids.

```bash
WID=$(hoody --container "$C" display windows search --display-id 1 \
  --pattern xeyes --name --class --classname -o json \
  | jq -er '.windows[0] // error("No window matched xeyes")') || exit 1
```

**Step 2 — focus + confirm.** Focus with `sync` on, then read `details.inputFocus` in the focus response. The call answers `success: true` even when it could only activate the window: `inputFocus: false` (with a `warning`) means the window is not viewable (no viewer attached, or unmapped), so keyboard input cannot reach it. `hoody display windows active get` reports the active window, which confirms the activation only.

```bash
hoody --container "$C" display windows focus --display-id 1 --window-id "$WID" --sync -o json \
  | jq -r .details.inputFocus        # true = keyboard input will reach the window
hoody --container "$C" display windows active get --display-id 1 -o json | jq -r .windowId
```

### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```bash
hoody --container "$C" display input click --display-id 1 --x 120 --y 80
hoody --container "$C" display keyboard type --display-id 1 --text "hello world" --delay 20
```

`hoody display input type` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`. End `text` with `\n` to press Return after it (to submit a form or an address bar).

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```bash
hoody --container "$C" display input drag --display-id 1 \
  --start-x 50 --start-y 50 --end-x 200 --end-y 150 --button 1 --steps 20
```

If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `hoody display input reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. Clipboard calls can fail with `CLIPBOARD_FAILED` (see Quirks), so read the clipboard back after the write.

**Step 1 — `hoody display clipboard set` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```bash
hoody --container "$C" display clipboard set --display-id 1 --text "pasted via hoody" --selection clipboard
hoody --container "$C" display clipboard get --display-id 1 --selection clipboard
```

**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

```bash
hoody --container "$C" display keyboard press --display-id 1 --keys ctrl+v
```

### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```bash
hoody --container "$C" display windows get "$WID" --display-id 1 -o json | jq '.properties'
hoody --container "$C" display windows geometry get "$WID" --display-id 1 -o json | jq '{x,y,width,height}'
```

`windowId` accepts decimal or hex (`0x...`). These two path-parameter calls echo `windowId` back exactly as sent, as a string; only the list, search and active-window calls return decimal numbers.

### 7. List visible windows with `onlyVisible` filter

**Goal:** list the window manager's windows minus the minimized ones, then pick the one named `xeyes`, no regex. `onlyVisible` only drops windows marked `_NET_WM_STATE_HIDDEN`; it does not test whether a window is actually mapped or viewable (the list is also capped at 200 windows).

```bash
hoody --container "$C" display windows list --display-id 1 --only-visible -o json \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```

Each item carries `windowId`, `name`, `class` (the WM_CLASS instance/class pair when it can be read, otherwise an empty array), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) in one request. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The actions run in order and the batch stops at the first failure; nothing is rolled back, so actions before it have already taken effect. A failed action is still HTTP 200: check `success`, then `completed` (the actions that ran), `failed` (`{index, action, error}`) and `skipped`.

```bash
# --actions takes a file holding the actions ARRAY (not the {"actions": ...} wrapper):
cat > /tmp/actions.json <<'JSON'
[
  {"action":"mouse/move",   "params":{"x":120,"y":80}},
  {"action":"input/wait",   "params":{"ms":150}},
  {"action":"mouse/click",  "params":{"button":1}},
  {"action":"keyboard/type","params":{"text":"replayed","delay":15}}
]
JSON
hoody --container "$C" display input batch act --display-id 1 --actions @/tmp/actions.json -o json \
  | jq '{success, failed, skipped}'
```

`hoody display input wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `hoody display input batch act`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `hoody display geometry get` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```bash
hoody --container "$C" display get --display-id 1 -o json
hoody --container "$C" display geometry get --display-id 1 -o json
```

Note: the geometry returned is the display's virtual screen (often `8192x4096`), not a physical monitor size. Pointer coordinates (`hoody display input click` and the rest) are in this screen space, and a screenshot covers the same space, pixel for pixel.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `hoody display keyboard down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `hoody display input reset` releases everything in one call.

```bash
hoody --container "$C" display input reset --display-id 1
```

Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

### `hoody display` (49) — Display control — screenshots, input, windows, clipboard

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody display clipboard get` |  | read | Read clipboard text | `display.clipboard.get` | `hoody display clipboard get --display-id 10 --selection clipboard` |
| `hoody display clipboard set` |  | write | Write clipboard text | `display.clipboard.set` | `hoody display clipboard set --display-id 10 --text Hello --selection clipboard` |
| `hoody display geometry get` |  | read | Get display dimensions | `display.getGeometry` | `hoody display geometry get --display-id 10` |
| `hoody display get` |  | read | Get display information and screenshots | `display.get` | `hoody display get --display-id 10` |
| `hoody display health` |  | read | Service health check | `display.kit.getHealth` | `hoody display health` |
| `hoody display input act` |  | write | Execute one action with optional screenshot | `display.input.act` | `hoody display input act --display-id 10 --action mouse/click --screenshot` |
| `hoody display input batch act` |  | write | Execute a sequence of actions | `display.input.actMany` | `hoody display input batch act --display-id 10 --actions @path.json` |
| `hoody display input click` |  | write | Move cursor and click | `display.input.click` | `hoody display input click --display-id 10 --x 10 --y 10 --button 1` |
| `hoody display input drag` |  | write | Drag from one position to another | `display.input.drag` | `hoody display input drag --display-id 10 --start-x 10 --start-y 10 --end-x 10 --end-y 10 --button 1` |
| `hoody display input reset` |  | write | Emergency release all inputs | `display.input.reset` | `hoody display input reset --display-id 10` |
| `hoody display input select` |  | write | Select a range via click + shift-click | `display.input.select` | `hoody display input select --display-id 10 --x 10 --y 10 --end-x 10 --end-y 10` |
| `hoody display input type` |  | write | Move, click, and type in one operation | `display.input.type` | `hoody display input type --display-id 10 --x 10 --y 10 --text Hello --delay 10` |
| `hoody display input wait` |  | write | Wait for a duration with optional screenshot | `display.input.wait` | `hoody display input wait --display-id 10 --ms 100 --screenshot` |
| `hoody display keyboard down` |  | write | Hold a key down | `display.keyboard.down` | `hoody display keyboard down --display-id 10 --key Shift_L --window 100` |
| `hoody display keyboard press` |  | write | Press key combinations | `display.keyboard.press` | `hoody display keyboard press --display-id 10 --keys <keys> --window 100` |
| `hoody display keyboard type` |  | write | Type a string of text | `display.keyboard.type` | `hoody display keyboard type --display-id 10 --text Hello --window 100` |
| `hoody display keyboard up` |  | write | Release a held key | `display.keyboard.up` | `hoody display keyboard up --display-id 10 --key <key> --window 100` |
| `hoody display mouse click` |  | write | Click a mouse button | `display.mouse.click` | `hoody display mouse click --double --display-id 10` |
| `hoody display mouse click` |  | write | Double-click a mouse button | `display.mouse.doubleClick` | `hoody display mouse click --double --display-id 10` |
| `hoody display mouse down` |  | write | Press and hold a mouse button | `display.mouse.down` | `hoody display mouse down --display-id 10 --button 1` |
| `hoody display mouse move` |  | write | Move the cursor to an absolute position | `display.mouse.move` | `hoody display mouse move --relative --display-id 10 --x 10 --y 10` |
| `hoody display mouse move` |  | write | Move the cursor by an offset from its current position | `display.mouse.moveBy` | `hoody display mouse move --relative --display-id 10 --x 10 --y 10` |
| `hoody display mouse position get` |  | read | Get cursor position | `display.mouse.getPosition` | `hoody display mouse position get --display-id 10` |
| `hoody display mouse scroll` |  | write | Scroll in a direction | `display.mouse.scroll` | `hoody display mouse scroll --display-id 10 --direction up --clicks 5` |
| `hoody display mouse up` |  | write | Release a mouse button | `display.mouse.up` | `hoody display mouse up --display-id 10 --button 1` |
| `hoody display open` |  | action | Open the Display kit service in your browser |  | `hoody display open` |
| `hoody display screenshots capture` |  | read | Capture a new screenshot | `display.screenshots.capture` | `hoody display screenshots capture --metadata --base64` |
| `hoody display screenshots capture` |  | read | Capture a screenshot and return only its metadata | `display.screenshots.capture` | `hoody display screenshots capture --metadata --base64` |
| `hoody display screenshots get` |  | read | Retrieve a specific screenshot by timestamp | `display.screenshots.get` | `hoody display screenshots get 1749541160 --base64 --display-id 10` |
| `hoody display screenshots latest get` |  | read | Retrieve the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest get --metadata --base64` |
| `hoody display screenshots latest get` |  | read | Get only the metadata of the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest get --metadata --base64` |
| `hoody display screenshots list` |  | read | List all available screenshots | `display.screenshots.list` | `hoody display screenshots list --display-id 10` |
| `hoody display thumbnails capture` |  | read | Capture a new screenshot thumbnail | `display.thumbnails.capture` | `hoody display thumbnails capture --base64 --display-id 10` |
| `hoody display thumbnails get` |  | read | Retrieve a specific thumbnail by timestamp | `display.thumbnails.get` | `hoody display thumbnails get 1749541160 --base64 --display-id 10` |
| `hoody display thumbnails latest get` |  | read | Retrieve the most recent thumbnail | `display.thumbnails.getLatest` | `hoody display thumbnails latest get --base64 --display-id 10` |
| `hoody display windows active get` |  | read | Get the active window ID | `display.windows.getActive` | `hoody display windows active get --display-id 10` |
| `hoody display windows close` |  | write | Close a window | `display.windows.close` | `hoody display windows close --display-id 10 --window-id 100` |
| `hoody display windows focus` |  | write | Focus/activate a window | `display.windows.focus` | `hoody display windows focus --display-id 10 --window-id 100 --sync` |
| `hoody display windows geometry get` |  | read | Get window position and size | `display.windows.getGeometry` | `hoody display windows geometry get 1 --display-id 10` |
| `hoody display windows get` |  | read | Get extended properties for a window | `display.windows.get` | `hoody display windows get 1 --display-id 10` |
| `hoody display windows list` |  | read | List windows on the current display | `display.windows.list` | `hoody display windows list --display-id 10 --only-visible` |
| `hoody display windows minimize` |  | write | Minimize a window | `display.windows.minimize` | `hoody display windows minimize --display-id 10 --window-id 100 --sync` |
| `hoody display windows move` |  | write | Move a window | `display.windows.move` | `hoody display windows move --display-id 10 --window-id 100 --x 10 --y 10 --sync` |
| `hoody display windows raise` |  | write | Raise a window to the top | `display.windows.raise` | `hoody display windows raise --display-id 10 --window-id 100` |
| `hoody display windows resize` |  | write | Resize a window | `display.windows.resize` | `hoody display windows resize --display-id 10 --window-id 100 --width 10 --height 10 --sync` |
| `hoody display windows restore` |  | write | Restore (un-minimize) a window | `display.windows.restore` | `hoody display windows restore --display-id 10 --window-id 100 --sync` |
| `hoody display windows search` |  | read | Search for windows by pattern | `display.windows.search` | `hoody display windows search --display-id 10 --pattern TODO --name` |
| `hoody display windows title get` |  | read | Get window title | `display.windows.getTitle` | `hoody display windows title get 1 --display-id 10` |
| `hoody display windows wait` |  | read | Wait for a window to appear or disappear | `display.windows.wait` | `hoody display windows wait --display-id 10 --condition window-present --pattern Firefox` |


---

<!-- ===== namespace: egress ===== -->

# `egress` — the container's outbound HTTP proxy

## Purpose

**Mental model: a proxy the standard container provision already runs, whose exit IP you choose at runtime.** Point any HTTP client at the container's egress URL and the request leaves through the container. Configure an *upstream* and the same URL routes through that instead, so the exit IP changes without touching the client.

It answers on the container's own host at the `egress` service slug, so on a normally-provisioned container there is nothing to install, start, or configure first — registration happens at provision time, not on demand, and Prerequisites has the one precondition and a one-call check. Indexed forms reach the same single process and share one upstream setting — the index is not a second proxy. What the index does change is proxy permissions, which are evaluated per service index, so `egress-1` and `egress-2` can carry different credentials while exiting through the same address. The canonical URL carries no index; an explicit `egress-<n>` is accepted and selects the permission scope described above.

It handles `CONNECT` tunnelling for HTTPS (never seeing inside the TLS session) and absolute-URI forwarding for plain HTTP.

## When to use

Use it when something inside a container needs to make outbound HTTP requests through a controllable exit: giving a scraper a specific egress IP, routing container traffic through a third-party SOCKS5 or HTTP proxy, or exposing a proxy endpoint to a client that only accepts a host and port. Use `hoody egress upstream set` to chain, `hoody egress upstream get` to inspect, and `hoody egress upstream disable` to go back to the container's own IP.

Use `hoody egress local start` when the exit should be your own machine rather than a rented proxy; see Quirks.

## When NOT to use

Do not use it as a general ingress path: any request whose target begins with `/` and is not one of the management routes returns 404 and is never forwarded, so it cannot be repurposed as a reverse proxy. (`OPTIONS` is the one exception, answered 204 before routing.) Do not reach for it to expose a local service to the internet — that is the `tunnel` namespace. Do not expect request hooks to apply; egress is on the hook-rejected list.

## Prerequisites

A running container whose provision registered egress — the overwhelmingly common case, not something to arrange. Provisioning registers egress on a new container by default, and containers created before egress existed are backfilled over time, so the gaps to expect are a container whose host has it turned off and one that has not been backfilled yet. No kit program needs enabling first — where registered, hoody-egress is eager (`boot: true`, `lazy_load: false`, unlike lazily-loaded siblings such as `pipe` or `run`), so the endpoint answers as soon as the container is up. To confirm before relying on it, probe the unauthenticated health route: `hoody --container <id> egress health` printing the standard health blob confirms egress is live; an error does not establish that it is absent. A failed probe cannot separate an unregistered kit from an overloaded or unreachable one: the server checks its connection cap before reading the request, so it can answer 503 while alive, and an edge or transport failure looks the same from outside. Registration can also be read from the always-present daemon kit: look for a `hoody-egress` entry in `hoody daemon programs list`. Setting an upstream needs nothing beyond the container URL and whatever proxy permissions guard it.

A local exit (`hoody egress local start`) needs more: the container's hoody-tunnel kit must be running, because the exit is wired as a tunnel PULL bind onto the container's loopback, and the CLI must be logged in (`hoody login`), because the tunnel WebSocket authenticates with your account token. Every `hoody --container` command, the plain upstream commands included, also needs that login the first time it meets a container: the CLI looks up the container's routing with your account token and then caches it. If the tunnel kit is down, startup fails before the container is touched.

## Capability URL

The endpoint is `https://{projectId}-{containerId}-egress-{serviceIndex}.{server}.containers.hoody.com` — see `SKILL-CLI.md § Proxy URLs` for the routing rules — and it is a capability URL: the project and container identifiers in the hostname *are* the credential, and hoody-egress performs no authentication of its own. An open egress endpoint is therefore an open proxy — anyone holding the URL can send traffic through it, consuming the server's bandwidth and attributed to its exit IP. Set proxy permissions on the `egress` service before sharing it or configuring an upstream.

## Common workflows

**Inspect the current setting.** `hoody egress upstream get` reports `enabled`, `state`, the scheme, host and port, the config path, and an `auth` boolean. The two flags answer different questions. `enabled` says an upstream is CONFIGURED. `state` says which configuration is in force: `active` (an address has been checked and approved and requests are sent through it), `unavailable` (configured but no approved address, so proxied requests get 502 and are never sent directly instead) or `direct` (nothing configured). Neither flag reports reachability. `active` means approved pins exist, not that anything answers on them, so a permitted address with nothing listening stays `active` while every request fails. `unavailable` is the one that operators most often read backwards: it means proxied traffic is REFUSED with `502 configured upstream proxy is unavailable`, never quietly sent direct. `enabled` is therefore `true` in both `active` and `unavailable`; only `direct` reads `false`. Scheme, host, port and `auth` are present whenever there is a parsed upstream configuration to report, and absent when there is not: nothing is configured (`direct`), the configured text did not parse, or the persisted setting could not be read. Credentials are never returned, by design, so a read cannot be used to recover a secret someone else configured. One compatibility rule for anything that branches on `state`: it is newer than the other fields, so a container running an older egress build answers without it. Treat its ABSENCE as "this kit predates the field" and fall back to `enabled`, rather than comparing a missing value against `'active'` and concluding the upstream is broken.

**Point traffic somewhere else.** `hoody egress upstream set <url>` takes the proxy URL as its one required argument — e.g. `hoody egress upstream set socks5h://user:pass@host:1080` — and sends it as the request body; it does not read stdin. Four schemes are accepted: `socks5h` sends the destination hostname upstream for resolution there, `socks5` resolves locally and sends an address, and `http` / `https` chain through an HTTP proxy using `CONNECT`, the latter with TLS to the upstream. Prefer `socks5h` when the point of the exercise is to avoid leaking destination lookups.

**Go back to the container's own IP.** `hoody egress upstream disable`. There is no empty-body form here: `set` requires its argument and refuses an empty value, so use `disable`. Check with `hoody egress upstream get`.

**Lease an upstream that should end with its client.** `hoody egress upstream set <url> --lease 60` installs the upstream for that many whole seconds, from 5 to 3600. The answer, and every later read while that upstream is configured, carries `lease: { id, ttl, expires_at, expires_in }` (`expires_at` in Unix seconds). Renew it before the deadline with `hoody egress upstream renew --lease-id <id>`: the deadline moves to `ttl` seconds from now, never earlier than it already was and never more than 3600 seconds ahead, and the answer is the same body a read returns. If no renewal arrives in time, the kit disables the upstream the way an explicit disable does and records the disable in its config file, so the container goes back to its own IP and stays there across a restart. A lease that ran out while the kit was down is disabled at startup. A set without `lease` installs a permanent upstream and ends any earlier lease. A replacement or a disable also ends it, and renewing the old id then answers 409.

**Confirm where traffic exits.** Request `https://ip.hoody.com` through the proxy; it reports the address it saw, which is the container's or the upstream's once one is set.

## Quirks & gotchas

- **Teardown deletes, it does not restore.** Clearing removes the upstream, and the kit never returns credentials — a read reports scheme, host, port and an `auth` flag only — so an authenticated upstream that some other tool configured cannot be put back unless whoever configured it still holds the full URL. An unauthenticated one can be rebuilt from a read taken before the clear.
- **The setting is applied without a restart.** It lands in the file reported as `config_path` in the response and is picked up within about a second. A clear does not remove that file — it records an explicit `disabled` state, which is what makes the disable survive a restart of a process that was started with an upstream. A URL line the destination guard refuses, or one that does not parse, is NOT a fall back to direct, and which of two things it does depends on whether an upstream is already working: with one in force that upstream keeps carrying traffic, and with none in force the kit reports `state: "unavailable"` and answers proxied requests with 502 until the line is fixed or removed.
- **Direct destinations are filtered, unconditionally, and IPv4 only.** With no upstream in force, the kit resolves the destination, refuses private, loopback, link-local, CGNAT, benchmarking, documentation, TEST-NET, multicast and reserved addresses with `403 destination not permitted`, and dials the address it checked, so a short-TTL record cannot pass the check and then point elsewhere. An IPv6 literal destination is refused on every path, upstream or not, mapped (`::ffff:a.b.c.d`), compatible and NAT64 spellings included; a name the kit resolves itself that has no IPv4 address is refused too. There is no flag, environment variable, file or API field that admits one. The same address rule applies to the upstream itself, with one exception for chaining: a `socks5`/`socks5h` upstream on IPv4 loopback is accepted on any port, credentials optional, because that is the shape a local exit installs. Past an upstream, the destination is that exit's business for all four schemes: `socks5` resolves the name here and sends the first IPv4 address without the private-address check, and `socks5h`, `http` and `https` hand the name to the exit, which also decides its address family.
- **A configured upstream that cannot be used refuses traffic; it does not fall back to direct.** With no upstream in force, a configured one that is refused, unresolvable or unparsable reads as `enabled: true, state: "unavailable"`, and proxied requests get `502 configured upstream proxy is unavailable`. That is deliberate: a request must not leave from the container's own address after someone asked for an exit. The kit keeps retrying, so a transient DNS failure recovers on its own. For an upstream set without a lease, direct egress returns only on an explicit disable (`DELETE`, an empty or `disabled` body, or emptying a config file that has governed); an upstream set with a `lease` (in seconds) is also disabled automatically when the lease runs out without a renewal. A replacement refused by the management API (the `400` answers below) changes nothing at all. A replacement written into the config file behaves differently: an unparsable line is ignored while an upstream is working, but a line that parses and is refused only for now becomes the pending setting. The working upstream keeps carrying traffic meanwhile, the kit keeps re-checking the new line, and it takes over as soon as a later check approves it.
- **The body is small and strictly framed.** A missing `Content-Length` is 411, and a *declared* `Content-Length` over 4096 is 413 — the check is on the header, before the body is read. This is not a channel for anything but a URL.
- **Health answers almost any method.** The health route matches on path alone, so every method except `OPTIONS` reaches it; `OPTIONS` is answered 204 with CORS headers before routing, which is what makes browser preflight work against the management API.
- **A local exit makes your own machine the exit** (`hoody egress local start`). It binds a loopback port inside the container over hoody-tunnel, points the upstream at it, and terminates SOCKS5 on your side, so requests leave from the machine the CLI is running on. Nothing listens on that machine; every socket it opens is outbound. Destinations are gated to public IPv4 by default, every resolved A record is authorised, and the pinned address is what gets dialled, so DNS rebinding cannot redirect a connection after approval. **Only destination ports 80 and 443 are allowed by default**, so SSH, database or `:8080` traffic through the exit is refused; widen it with `--allow-ports 22,443,5432` (or `"*"` for any). `--allow-private` admits private and loopback destinations, and `--dns` picks the resolvers.
- **A local exit refuses to clobber an existing upstream.** If the container already has one configured, which includes one currently reported as `state: "unavailable"`, `hoody egress local start` fails with `local exit: this container already has an upstream (<scheme>://<host>:<port>)` instead of replacing it (when the kit reports no address for the upstream, the message says so in place of the address), because teardown clears the upstream and the kit never returns credentials, so an authenticated upstream it replaced could not be put back automatically. Clear a stale one first with `hoody egress upstream disable`, or pass `--replace-upstream` to take the container over knowingly; when that exit stops, the container goes back to its own IP, not to the proxy it displaced.
- **A dead loopback port breaks every request.** If a local exit dies without clearing the upstream, the container keeps pointing at a port that no longer answers and every request through its egress fails until the upstream is cleared. Recover with `hoody --container <id> egress upstream disable`.
- **The URL — credentials included — is a command-line argument.** `hoody egress upstream set` has no stdin, file, or environment form; `--input` is rejected for this command. The full URL therefore lands in shell history and is visible in `ps` while the command runs. On a shared machine, set the upstream through the SDK (its upstream.set method) or with a raw HTTP `PUT /api/v1/egress/upstream` whose body is read from a mode-`0600` file instead.
- **Browsers need a PAC file, not the manual proxy fields.** The connection to the proxy is itself TLS, so the manual host-and-port fields open a plaintext connection that the edge refuses with 400. A PAC file returning `HTTPS host:443` works in both Chrome and Firefox.

## Common errors

Errors come from two surfaces that answer differently. The management surface always sends a body: `text/plain` for every error except the 404, which is JSON, and every body ends with a trailing newline, so match on prefix or substring rather than equality. Most framing and forwarding errors send no response body and no `Content-Type`; the exceptions are a destination-policy refusal (403) and an unavailable configured upstream (502), which both carry a `text/plain` body. The status line still arrives with headers, always including `Vary: Origin` and `Connection: close`.

**Management surface** (path-form requests: `/api/v1/egress/upstream`, `/api/v1/egress/upstream/renew` and the route catch-all):

- 400 — the following causes, each with its own `text/plain` body: `Invalid upstream URL` when the value does not parse or its scheme is not one of the four, `Upstream destination not permitted` when it parses but every address it resolves to is refused by the destination guard, `Upstream unresolvable` when the host did not resolve inside the connect timeout (transient, worth a retry, and distinct from the previous one), `Failed to read body` when the read fails or times out, and `Body must be UTF-8`. A set request can also return `Invalid lease: give whole seconds from 5 to 3600`, or `A lease needs an upstream URL` when a lease accompanies an empty or `disabled` body. The OpenAPI 400 description names the same bodies; it is documentation, not additional wire text. A refused or unresolvable replacement leaves a working upstream in force, so a 400 here does not mean the container lost its exit.
- 404 — a path-form target that is not a management route, and the one JSON error: `{"error":"not found"}` with `Content-Type: application/json`. It is never forwarded, so it means the request was addressed to the proxy rather than through it.
- 400 — `Missing or invalid lease_id` on a renewal whose `lease_id` is absent or is not 1 to 64 ASCII letters and digits.
- 405 — `Method Not Allowed` for any verb on the upstream route other than `GET`, `PUT`, `POST`, or `DELETE`, and for any verb but `POST` on the renew route. `OPTIONS` never reaches it; it is answered 204 before routing.
- 411 — `Missing Content-Length` on a set request.
- 413 — `Body too large` when the declared `Content-Length` exceeds 4096 bytes.
- 409 — `No upstream lease with this id is in force` on a renewal: the lease already expired, the upstream was replaced or disabled, or the config file no longer holds that lease. Nothing is rewritten, so the old upstream is not revived. Set the upstream again, with a new lease, if it is still wanted.
- 500 — `Failed to write config` when persisting the upstream file fails, on set, clear and renewal alike, and `Failed to read config` when a renewal cannot read it. The in-memory upstream is swapped only after a successful write, so after a 500 the previous setting still applies.

**Proxy data path and request framing.** Most of these send no response body; the two policy answers below (403, and the 502 whose body names an unavailable upstream) are the exceptions, and both carry `Content-Type: text/plain` plus CORS headers.

- 400 — an oversized or truncated header block, a bad request line, an invalid `CONNECT` authority, or a non-`CONNECT` target that is neither absolute-form `http://` nor asterisk-form `*`. An `https://` URL sent without `CONNECT` lands here. Asterisk-form is the one non-absolute target that forwards: `*` with a `Host` header is sent to the authority the header names; without one it is a 400. Header lines themselves never trigger it: a line with no colon is silently skipped, not rejected. IPv6 spellings split across 400 and 403: a bracketed authority must hold a plain IPv6 address, so `[fe80::1%eth0]`, `[example.com]` and `[]` are malformed authorities (400) rejected before any lookup, while a well-formed `[2606:4700::1111]` is a policy refusal (403). An unbracketed literal such as `CONNECT ::1:443` is also a 400.
- 403 — `destination not permitted`, the destination guard's refusal, on `CONNECT` and absolute-URI forwarding alike. With no upstream in force it covers private, loopback, link-local, CGNAT, benchmarking, documentation, TEST-NET, multicast and reserved IPv4. On every path it covers an IPv6 literal destination and a name this kit resolves that has no IPv4 address (the kit is IPv4-only); a name handed to a `socks5h`, `http` or `https` upstream is resolved by that exit instead. Nothing turns it off, so retrying or changing client is pointless: use a public IPv4 destination. The body is identical whether or not anything is listening there, so it is not a port scanner. One stated limitation: for a body-bearing forward the request body is written before the response is read, so an early refusal during a large upload can reach the client as a connection close rather than a 403.
- 408 — request headers not completed within the read timeout.
- 502 — `configured upstream proxy is unavailable` when an upstream is configured but has no approved address (refused, unresolvable, or unparsable text). The destination is not even resolved, and the request is never sent directly instead, so this status is the kit refusing to leak a request out of the container's own IP after you asked for an exit. Read `state` on `GET /api/v1/egress/upstream` to confirm, and either fix the address or clear the upstream. Every other 502 has no body: the outbound connection failed, the destination was unreachable, the chained upstream refused or timed out, or no valid response came back. It is also the answer when the client's own request body breaks mid-forward: a malformed chunk size or chunk ending fails inside the forwarding path, and the outer handler reports every forwarding failure as 502, so a bad client body reads the same as a dead upstream. A 502 is not always a standalone response either: after the `CONNECT` 200 has been sent, or after a forwarded response has started, a relay failure appends the 502 to the bytes already written. With an upstream set and `state: "active"`, a bodyless 502 on every request usually means the upstream itself is dead; see the dead-loopback quirk.
- 503 — the concurrent-connection cap is reached.

## Related namespaces

`tunnel` for the opposite direction (exposing a local service through the container). `proxy.containerPermissions` for gating the endpoint, which matters more here than almost anywhere else because the URL is the only credential. `proxy.aliases` to hand out a hostname that does not carry the container id. `api` for container firewall rules, whose `firewall/egress` routes govern packet filtering and are unrelated to this service despite the shared word.

## Examples

Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The endpoint is `https://{P}-{C}-egress-1.{N}.containers.hoody.com`. Every `egress-<n>` index reaches the same single process and shares one upstream, but proxy permissions are evaluated per index, so use the index you granted access on (see § Purpose). The SDK's `getKitUrl` and the URL `startLocalExit` hands back omit the suffix; the edge normalizes a missing index to 1, so `…-egress.…` and `…-egress-1.…` are the same endpoint and the same permission scope.

### 1. Send a request through the proxy — confirm the container is the exit

**Goal:** prove the endpoint routes traffic and see the IP the destination sees. The connection to the proxy is itself TLS, so the proxy address carries an `https://` scheme. `CONNECT` tunnels HTTPS; plain HTTP rides absolute-form forwarding.

```bash
hoody --container "$C" egress health               # kit alive?
# There is no CLI verb that proxies a request — none is needed. The endpoint
# speaks the standard proxy protocol, so curl/git/pip/npm take the URL directly:
EGRESS="https://${P}-${C}-egress-1.${N}.containers.hoody.com"
curl -x "$EGRESS:443" https://ip.hoody.com | jq -r '.data.ip'
```

`ip.hoody.com` reports the address it saw the request come from, so it doubles as the before/after check for every recipe below. Browsers cannot use their manual proxy fields — plaintext to a TLS port is refused with 400; use a PAC file returning `HTTPS host:443` (see Quirks).

### 2. Set an upstream, read it back, clear it

**Goal:** change the exit IP without touching the client. Four schemes are accepted (`socks5h`, `socks5`, `http`, `https`); prefer `socks5h` when the upstream should also resolve DNS. Set and clear both answer `200` with the current status blob, so the response doubles as the read-back.

```bash
hoody --container "$C" egress upstream set 'socks5h://user:pass@proxy.example.com:1080'
hoody --container "$C" egress upstream get -o json
# {"enabled":true,"state":"active","scheme":"socks5h","host":"proxy.example.com","port":1080,"auth":true,...}
hoody --container "$C" egress upstream disable       # alias: disable; `set` refuses
                                                   # an empty URL, so clear is the way back
```

The setting lands in the config file atomically and is picked up within about a second (see Quirks). Re-run the exit check from #1: the reported address flips to the upstream's, and back after the clear. `auth: true` is the only trace of the credentials — they are never returned.

### 3. Make your own machine the exit — a local exit

**Goal:** turn the container's egress URL into a proxy whose traffic leaves from the machine you are sitting at. Needs the container's tunnel kit running; nothing listens on your machine (see Quirks).

```bash
hoody login --web --no-browser           # browser sign-in; the tunnel WebSocket authenticates with your account token
hoody --container "$C" egress local start
#   Proxy URL:     https://P-C-egress.N.containers.hoody.com
#   Exit IP:       203.0.113.42 (SG)  confirmed
# Ctrl+C tears it down and then the CLI exits, which closes the tunnel. On a clean
# teardown the upstream is cleared and the container is back on its own IP. If the
# clear failed, the container is left pointing at a dead port and the CLI prints
# the fix: hoody --container "$C" egress upstream disable
# If only the read-back could not confirm the clear, check with `egress upstream get`.
```

While the exit runs, treat the proxy URL like a password: anyone holding it relays through your connection.

### 4. The takeover guard, and the deliberate override

**Goal:** understand why a local exit refuses to start, and take a container over knowingly. Teardown deletes the upstream and credentials can never be read back, so silently replacing a third-party proxy would destroy it (see Quirks).

```bash
hoody --container "$C" egress local start
# Failed to start local exit: local exit: this container already has an upstream
# (socks5h://proxy.example.com:1080). Stopping this exit would clear it, and its
# credentials cannot be read back to restore it. Clear it first, or pass
# replaceExistingUpstream/--replace-upstream to take it over.

hoody --container "$C" egress local start --replace-upstream    # take it over knowingly
```

The check-then-set is not atomic — the guard protects against accidents, not races. The helper's teardown re-reads the upstream and compares scheme, host, port and `auth` before clearing, so it leaves an upstream that is visibly someone else's alone and prints `Left the upstream alone: another exit has taken this container over.`; a replacement that matches on all four is indistinguishable from this exit's own, because the kit reports only `auth: true` and never credential identity. That needs a stale handle to reach: two live exits cannot share the container's loopback port, so it takes an exit whose listener is already gone, its port reused by a newer exit, and a late teardown on the old handle. When an exit started with the override stops cleanly, the container returns to its own IP, not to the proxy it displaced.

## Reference

### `hoody egress` (6) — Container egress proxy — outbound HTTP/CONNECT with an optional upstream

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody egress health` |  | read | Egress service health | `egress.kit.getHealth` | `hoody egress health` |
| `hoody egress local start` |  | action | Publish this machine's IP as the container's HTTPS proxy exit (long-running, Ctrl+C to stop) |  | `hoody egress local start` |
| `hoody egress upstream disable` |  | destructive | Stop chaining through an upstream; egress goes direct | `egress.upstream.disable` | `hoody egress upstream disable` |
| `hoody egress upstream get` |  | read | Show the upstream proxy the container chains through | `egress.upstream.get` | `hoody egress upstream get` |
| `hoody egress upstream renew` |  | action | Renew the upstream lease, pushing its deadline out by its ttl from now | `egress.upstream.renewLease` | `hoody egress upstream renew --lease-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody egress upstream set` |  | action | Route the container's egress through an upstream proxy | `egress.upstream.set` | `hoody egress upstream set socks5h://user:pass@host:1080 --lease 10` |


---

<!-- ===== namespace: exec ===== -->

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To give a script a **public** address: create an alias with `hoody proxy aliases create` (`program: 'exec'`, and `target_path: '/<your-script>'` as the landing page) and you get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` in the URL. With the default `allow_path_override: true` the alias points at the WHOLE exec kit, not at one script: `target_path` only answers a request with no path, and every other path is forwarded as sent. That includes the kit's own management API under `/api/v1/exec/` (`hoody exec scripts write`, `hoody exec scripts delete`, …), so anyone holding the link may be able to write and run code in the container. Set `allow_path_override: false` to serve only the script: it is served at the alias root AND at `/<your-script>`, while any other path (sub-paths, assets and the management API under `/api/v1/exec/` included) is refused with `404 ALIAS_PATH_PINNED`, and the visitor's method, body and query keys the target does not set still reach the script. Either way, before sharing the alias, gate it with `hoody containers proxy *` (a password, token, JWT or IP group, plus a `default` policy that denies what the group does not allow), exactly as for any kit URL.

**Trust model — read carefully.** Scripts run inside the container with full container privileges. They are NOT a sandbox for untrusted user code. Anyone who can invoke a script can do everything the script can do (read files, hit other kits, spawn processes). Use them for *your* APIs / cron logic / webhooks / ETL — don't expose them as an arbitrary code-execution surface to anonymous internet users without thinking through the gate stack first.

## When to use

- "Write me an API endpoint that does X" — default to a `hoody-exec` script before reaching for a Node app + framework.
- **"Build a workflow"** — multi-step pipelines (call agent A → validate with agent B → trigger action C, fan-out / fan-in, retry logic, conditional branches). One script = one orchestrator; each step is a function call inside the same Bun process, so no inter-service plumbing. State between requests via `bun:sqlite` (`Database`), the `sqlite` kit or the `files` kit for durable state, or the injected `shared` object for in-memory state (one per deployment, lost when the kit restarts or evicts an idle deployment from its cache). Variables declared in the script body do not carry over: the body runs again on every request.
- Webhooks (GitHub / Stripe / your CI), ETL pipelines, batch transformers, AI agent tools.
- Wrap a bash one-liner or Python helper as an HTTP API with zero scaffolding.
- Describe inputs / outputs in a companion `.openapi.json` file per script, auto-publish OpenAPI.
- Install and pin npm deps in the kit's one shared scripts-root `package.json` (every script uses the same versions), stream logs/metrics.

## When NOT to use

- **Untrusted-input code execution** — it's not sandboxed. Use a fresh container (or a stricter runtime) per untrusted caller.
- Long-lived processes / supervisors → `daemon` (exec is request/response).
- Schedules outliving the kit → `cron` (`exec.schedules.*` is in-process and dies with the kit).
- File I/O outside the scripts dir → `files`. Interactive shells → `terminal`. Container lifecycle → `api`. Headless web → `browser`.

## Prerequisites

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `hoody exec scripts write`.
- **`require('hoody-sdk')` works with no install step** — it loads the installed npm package from the scripts root's `node_modules`. Exec installs a missing SDK automatically (at startup, or on a script's first `require`), honors a version you declare in the scripts-root `package.json` (an exact version or a tag stops updates, a range keeps them inside it), and stages a newer registry release that the next kit startup swaps in; a running kit never replaces its live copy. (Other `require()`d npm packages are auto-installed on first execution.) Import from `'hoody-sdk'`. The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the edge proxy, so all the usual capability gates / request hooks / proxy logs apply (see § Source IP Guard in `SKILL-CLI.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out, but exec sets no account token and the CLI needs one (for a kit command too: it looks the container up). Put `HOODY_TOKEN=<token>` in the script's `.env` companion and pass the script's env on: `Bun.$\`hoody projects list\`.env({ ...process.env })`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Write, validate, invoke

1. `hoody exec scripts write` — `path`, `content`, `createDirs:true`, `validate:true` (default); 400 + `validation` on fail.
2. `hoody exec scripts read` — confirm bytes.
3. `POST {EXEC_BASE_URL}/<path-without-extension>` — body parsed, return auto-serialised, output streamed.
4. `hoody exec scripts list` — verify.

### 2. Pin deps, iterate

1. `hoody exec modules test` → `hoody exec modules install` → `hoody exec packages pin`.
2. `hoody exec scripts validate` + `hoody exec magic comments validate` (`// @description`, `// @cors`, `// @timeout`).
3. `hoody exec scripts write` (auto-validates unless `validate:false`).
4. `hoody exec cache clear` — drop cached worker VMs, selected by `hostname` (optionally with `execId`) or `clearAll:true`; a call with neither is a 400. The `shared` state survives unless you also pass `clearState:true`.

### 3. Debug + OpenAPI

1. `hoody exec logs list` / `hoody exec logs search` / `hoody exec logs get` (one JSON response; `lines` and `tail` pick the slice). For a live tail use `hoody exec logs stream` (SSE).
2. `hoody exec requests list` / `hoody exec stats`; per script, `hoody exec scripts stats list` first, then `hoody exec scripts stats get` with one `scriptPath` from that listing (an empty body returns an empty `metrics` stub).
3. `hoody exec openapi scripts list`, then `hoody exec openapi generate` / `hoody exec openapi get` (a document built from the current scripts) or `hoody exec openapi merge`. Merge scans scripts only for the `directories` you name (`['scripts']` for the calling deployment's scripts directory — the `<subdomain|default>/<execId>` the kit URL names, unless you pass `subdomain` / `execId`) and otherwise merges just the `specs` you pass; it answers `{success, data}` with the document in `data`. None of the three writes anything to disk, so store a merge result yourself if you need to keep it. `hoody exec openapi schema validate` checks one script's `.openapi.json` sidecar.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. A script may instead export one function per HTTP method (`export async function GET(request)`, `POST`, …; the first argument is a Web `Request`): `HEAD` falls back to `GET`, `OPTIONS` is answered automatically, and any other method without an export answers 405 with `Allow`. The pattern-normaliser never rewrites the stored file; it rewrites the code at load time on every request, independent of `validate`.
- **Reads redact secrets.** `hoody exec scripts read` replaces the values of `// @token` and `// @ai-key` lines with `[REDACTED]`. Writing that content back keeps the stored secret for each placeholder; a placeholder with no stored secret to restore is refused.
- **`req.rawBody` holds the request bytes as received** (a Buffer), next to the parsed `req.body`, whenever the kit parses the body for you. Verify webhook signatures against `req.rawBody`; re-serialising `req.body` does not reproduce the sender's bytes. A script that declares `// @rawBody` gets neither field: `req` stays the raw request stream, so read and hash that stream yourself. The line must be exactly `// @rawBody` (or `// @rawBody true` / `false`): with any other text after it the line is ignored and the body is parsed. `GET` and `HEAD` bodies are never read.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `hoody exec scripts delete` needs literal `confirm=true`.
- `hoody exec scripts write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `hoody containers proxy services list` returning `[]` is normal (it lists only services named in proxy permission rules or hooks).
- `hoody exec schedules run` and `hoody exec schedules history list` scope a relative `scriptPath` by the kit URL you call, like `hoody exec scripts write`: through the `exec-1` kit URL, `tick.js` means `default/1/tick.js` (the `scriptRel` of `hoody exec schedules list`), and a path that already starts with `default/1/` is kept as is. An absolute `scriptPath` is used as given (history converts it to the root-relative form); a script at the scripts root, outside any deployment folder, is reachable from a deployment URL only by its absolute path.
- `hoody exec scripts write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- `hoody exec magic comments update` and `hoody exec magic comments get` resolve `path` like `hoody exec scripts write`: through the `exec-1` kit URL, `tick.js` is looked up as `default/1/tick.js` first (the `execId` / `subdomain` parameters pick another deployment), then as given relative to the scripts root, so the root-relative `default/1/tick.js` (the write's `resolvedPath`, or its `path` in `hoody exec scripts list`) also works; the first that exists is used, and none answers 404 `Script not found`.
- `hoody exec magic comments batch update` with neither `directory` nor `execId` edits the calling deployment's own tree (`default/1` through `exec-1`); a `directory` resolves like a script path (under the calling deployment's tree first, then relative to the scripts root).
- `hoody exec magic comments update` sets `// @schedule` (`comments.schedule`; an empty string removes it). The value is a 5-field cron expression (`minute hour day month weekday`) or a nickname (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`), always in UTC, one per file. `// @schedule-timeout <ms>` is the time limit of one scheduled run (the run is released, not stopped), as `@timeout` is for HTTP, where an unstarted response gets 504 and the script keeps running; HTTP requests keep `@timeout` (a scheduled run without it uses `@timeout`, else 30 s). It is registered at once, as by a write whose header has the line (no `hoody exec schedules reload`); `hoody exec schedules list` shows its `nextFire`.
- A `@schedule` fire bypasses the script's `@token`, and a script that also declares `@websocket` is not registered (`hoody exec schedules history list` records it as `incompatible`). The `curl` kit's schedules take 6 fields (seconds first); the `cron` namespace takes 5, in the container's own crontab.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every endpoint gets these script-scoped bindings, enabled by default (off with `// @ai false`; not on `globalThis`; `pre.js` / `post.js` get none): `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1` unless the kit runs with another `--ai-url`; default model **`hoody-ai/hoody-free`** unless `--ai-default-model` changes it). **No `require()`, no base URL, and no API key**: the key defaults to `container-<hash>`, and `// @ai-key` replaces it. Exec does not price, meter or refuse models; what a model costs and what happens without wallet credit is decided by the AI service. Override per-script with magic comments (`// @ai-model <provider/model>`, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a default system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).
- **How the built-in AI is called.** `ai` is a name in the script's own scope, not a global: `globalThis.ai` is undefined, a module the script imports does not see it (pass `ai` in), and `pre.js` / `post.js` get no AI helpers. Every helper returns the SDK result object, never a bare string: `(await ai.generate(prompt)).text`, `return (await ai.stream(prompt)).textStream` (streamed as `text/plain`), `(await ai.object({ schema, prompt })).object`. `ai.generate` also takes `{ prompt, system, messages, model, temperature, maxTokens }`. `<script>.system.md` beside the script, else `_system.md` in the same directory, is the default `system` of `ai.generate` / `ai.stream` / `ai.object` (never read it yourself); an explicit `system` option replaces it, and the raw `generateText` / `streamText` / `generateObject` get none, so pass `system` to them yourself. `@ai-model`, `@ai-temperature` and `@ai-max-tokens` set the defaults of the `ai` helpers; `@ai-model` also picks the injected `model` that `generateText({ model, prompt })` takes.
- **State between requests.** The script body runs again on every request, so its top-level `let` / `const` / `Map` start empty each time. `shared` is one object per deployment (`<hostname>/<execId>`), the same object for every script of that deployment, kept between requests in both modes. `// @mode worker` additionally keeps `globalThis` values between requests (one VM per deployment, shared by its worker scripts); the default serverless mode builds a fresh VM per request. Both are memory only: lost on restart, and dropped together when the kit evicts an idle deployment from its bounded cache (`--vm-cache-cap`, default 1000 deployments). Keep anything that must last in `bun:sqlite` (`Database` is predefined), the `sqlite` kit or the `files` kit.
- **Request body.** `req.body` is parsed JSON, a urlencoded form as an object (a repeated key keeps its last value), or for `multipart/form-data` the text fields only; any other content type is a Buffer. Uploaded files are in `req.files`, one entry per file (empty files and repeated field names included): `{ fieldName, filename, type, size, data }` with `data` a Buffer and `type` the MIME type the runtime reports, which may differ from the part's declared Content-Type and can come from the filename (observed on Bun 1.4.2: `a.pdf` sent as `text/plain` gave `application/pdf`, `a.txt` gave `text/plain;charset=utf-8`, an unknown extension gave `""`), so check the bytes when the type matters.
- **`pre.js` / `post.js` are per directory.** They run around each HTTP request to a script in their own directory (its `index` included) and never for subdirectories or parent directories, so `admin/pre.js` does not guard `admin/deep/x.js`. `.ts` works too. A non-null return from `pre.js` (or a response it already ended) skips the script; to pass data on, set it on `req`. `post.js` receives the script's return value as `mainResult`, and a non-null return replaces the response. `post.js` still runs after a script that answered with `res.json()` / `res.send()`, but that answer stays as sent and `res.setHeader` then throws: check `res.headersSent` before touching the response. `post.js` also runs after a `pre.js` stop, with the `pre.js` value as `mainResult` (return nothing to keep it). A WebSocket connection runs `pre.js` once, before the handshake (never per message, never `post.js`): a non-null return or a started or ended `res` refuses the upgrade with that error status (else 403) and no socket opens (`req.body` is `null` on an upgrade, so body-reading checks must allow for it); what it sets on `req` reaches `ws.open(socket, req)`; `// @websocket-pre false` in the socket script skips it.
- **WebSocket scripts register handlers; they do not handle upgrades.** Both `// @websocket` and `// @mode worker` are required, or the socket is closed with `4400`. Assign `ws.open = (socket, req) => …`, `ws.message = (socket, data) => …`, `ws.close = (socket, code, reason) => …` (or `ws.on('message', …)`); never start a `ws` server or call `handleUpgrade`. The script body runs when the first socket connects, with `metadata.method === 'WEBSOCKET_INIT'`: once per script, or for a dynamic route once per route value while it has sockets (after that room's last socket closes, the next connection runs the body again with fresh variables; a changed script file serves new sockets from a fresh run, while sockets already open keep the old handlers and connection pool, so a broadcast from one run does not reach the other). Its top-level variables are shared by all sockets of that run, and its `req` / `metadata` are the first socket's request (`metadata.query` its query string alone, `metadata.parameters` its route params), so read each socket's own query from `socket.data.query` (or the `req` that `ws.open(socket, req)` receives) and keep per-connection state on `socket.data` (which also holds `headers`, `ip`). `data` is a string for text frames and a Buffer for binary ones; `socket.send` / `ws.broadcast(data, exceptSocket?)` send a plain object or array as JSON text and a string, Buffer or other binary value as given. An HTTP request to the same script re-runs the body and sees the same `ws.connections` / `ws.broadcast`.
- **Helper files and other directives.** Load a file of your own with `await import('./lib/x.js')` (resolved from the script's file). The helper exports with `export function x` or `module.exports = { x }`, then `const { x } = await import(…)`; a bare `module.exports = fn` arrives as `.default`. The helper can `require('./sibling.js')`: a helper's relative paths count from the helper's own directory (a `./round.js` inside the helper `./lib/price.js` is the `round.js` next to that helper, not next to the script); `require('./lib/x.js')` from the script body works too (resolved from the script's file). A helper file runs in its deployment's context (the one `// @mode worker` scripts of that exec ID share): it sees the script's `fetch` and `process.env` (the script's `.env` values included), and its module-level state (`const items = []`, `globalThis.store ??= {}` in the helper) is kept between requests in both modes, separate per exec ID, in memory like `shared`. A relative helper path counted from the wrong directory (`require('../../lib/store.js')` one level too high) is looked up from each parent directory up to the deployment's own directory and loads the one file it matches, with a warning naming the path to write; several matches or none fail with the paths tried. The script's `process.env` is the kit's environment plus every `_default.env` from the scripts root down to the script's directory, then the script's own `<name>.env`, merged per variable (the nearest file wins). `__dirname` and `__filename` are not defined in the script itself (using one throws), and a relative path is not resolved from the script's directory: in the script and its helpers, `new Database('app.sqlite')`, `fs.writeFileSync('x.json', …)`, `Bun.write` and `process.cwd()` use the deployment's own data directory (persistent, separate per exec ID). Read a file that sits beside the script with `fs.readFileSync(require.resolve('./data.json'), 'utf8')`, or build its path from `import.meta.dirname`. `// @description …`, `// @tags a,b` and `// @label x` only describe the script for `hoody exec scripts list` (which filters on `label` / `tags`) and change nothing at runtime. `// @enabled false` answers 404 without running the script; repeat `// @token` to accept several tokens; a caller sends the token as `Authorization: Bearer`, as the password of `Authorization: Basic`, as `X-Token` or as `?token=`, and only the first token found in that order is compared (a wrong Bearer token fails even beside a good `X-Token`; an `Authorization` header with another scheme, or a Basic value without a password, is skipped); `@token` takes one word (the rest of the line is ignored, with a warning). A returned object is always the JSON body: `return { status: 301, body }` answers 200 with that object, so set a status with `res.status()`.
- **`cookie` is v2.** `const { parseCookie, stringifySetCookie } = require('cookie')`: `parseCookie(req.headers.cookie ?? '')` reads cookies, `stringifySetCookie({ name: 'sid', value: 'abc', httpOnly: true, path: '/' })` writes one (`stringifySetCookie(name, value, options)` works too). The v1 `cookie.parse(header)` and `cookie.serialize(name, value, options)` also work in scripts (`require`, `hoody exec sdks import`, the preloaded `cookie`).
- **URL, query and CORS.** `req.url` is the path and query (`/x?a=1`), not a full URL. `metadata.query` is decoded like a form (`+` is a space) and keeps only the last value of a repeated key. On HTTP requests route params are merged into `metadata.query` and `metadata.parameters` (and a socket's `socket.data.query`) over query keys of the same name, so for the query string alone use `new URL(req.url, 'http://x').searchParams` (`.getAll('key')` for every value). By default each response reflects the caller's `Origin` and sends `Access-Control-Allow-Credentials: true`; `// @cors-credentials false` keeps the reflection without it. With any `@cors` line (`*` reflects any origin, `https://app.example` one origin, `none` blocks), credentials are sent only with `// @cors-credentials true`. For a literal `Access-Control-Allow-Origin: *`, call `res.setHeader('Access-Control-Allow-Origin', '*')` and add `// @cors-credentials false`: the policy is applied before the script runs, so the script's header is sent as set, but without that line `Access-Control-Allow-Credentials: true` goes out beside it and browsers refuse the pair on a credentialed request. These directives shape the script's own responses: an ordinary `OPTIONS` preflight is answered by the kit's global policy (reflected origin, credentials) and never reaches the script (platform hook dispatch is the exception).
- **`.md` URLs serve Markdown files, never scripts.** `/guide.md` serves the file `guide.md` as `text/markdown`, behind the `@token` of `guide.ts` / `guide.js` beside it; a script named `guide.md.ts` is never reached. (A proxy hook names its target script, so it can still run one for a `.md` URL.)

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — some segment of the path is a reserved directory name: `node_modules`, `.git`, `.hoody-cache`, `_sdk` or `_hoody`. The check is per segment and applies at any depth, so `api/node_modules/x.ts` is refused as surely as `node_modules/x.ts`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`hoody exec restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST https://{P}-{C}-exec-1.{N}.containers.hoody.com/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when the syntax and TS-transpile checks pass. A missing dependency is only a warning (the runtime installs it on first execution), and magic comments are parsed but never fail the write.

```bash
hoody --container "$C" exec scripts write \
  --path echo.js \
  --content 'module.exports = (req, res) => res.json({ ok: true, body: req.body });'
```

**Step 2 — invoke `POST /echo`** (bare path, NOT `/api/v1/exec/echo`). Body is auto-parsed; the return value of `res.json(...)` is the wire body.

```bash
# Use any HTTP client of your choice — exec scripts are bare HTTP endpoints.
curl -sX POST "https://${P}-${C}-exec-1.${N}.containers.hoody.com/echo" \
  -H 'Content-Type: application/json' -d '{"hello":"world"}'
```

**Step 3 — read it back.** `hoody exec scripts read` returns the stored content (with `@token` / `@ai-key` values shown as `[REDACTED]`, see Quirks) + parsed `magicComments` + metadata.

```bash
hoody --container "$C" exec scripts read --path echo.js -o json | jq .content
```

### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `hoody curl run` / SDK calls.

```bash
hoody --container "$C" exec scripts write --path workflow.js --content "$(cat <<'JS'
module.exports = async (req, res) => {
  const callA = async () => ({ score: 0.91, label: 'spam' });
  const checkB = async (a) => ({ verdict: a.score > 0.8 ? 'block' : 'allow' });
  const actC  = async (v) => ({ executed: v === 'block' ? 'quarantined' : 'delivered' });
  const a = await callA();
  const b = await checkB(a);
  res.json({ a, b, c: await actC(b.verdict) });
};
JS
)"
```

### 3. Webhook receiver with HMAC signature verification

**Goal:** GitHub-style `X-Hub-Signature-256` verification using `crypto.timingSafeEqual`. Reject 401 on bad sig.

**Step 1 — write the verifier.** No `npm install` needed — `crypto` is a runtime built-in.

```bash
WEBHOOK=$(cat <<'JS'
const crypto = require('crypto');
const SECRET = process.env.WEBHOOK_SECRET || 'shhh-test';
module.exports = async (req, res) => {
  const sig = req.headers['x-hub-signature-256'] || '';
  const body = req.rawBody || Buffer.alloc(0);  // the bytes as received
  const expect = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  let ok = false;
  try { ok = sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch {}
  if (!ok) return res.status(401).json({ error: 'bad sig' });
  res.json({ accepted: true, payload: req.body });
};
JS
)
hoody --container "$C" exec scripts write --path webhook.js --content "$WEBHOOK"
```

### 4. Pin npm deps — `hoody exec modules test` → `hoody exec modules install` → `hoody exec packages pin`

**Goal:** add `left-pad` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```bash
hoody --container "$C" exec modules test --code 'const leftPad = require("left-pad");' -o json
```

**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"left-pad@1.3.0"`).

```bash
hoody --container "$C" exec modules install --modules left-pad
```

**Step 3 — pin to exact versions.** Each declared range is replaced by the version actually installed, provided it satisfies the range. For a range, a package that is not installed, or whose installed version falls outside the range, is listed under `unpinnable` with the reason instead. A declaration that is already an exact version is left as it is, without checking that it is installed.

```bash
hoody --container "$C" exec packages pin --packages left-pad -o json   # repeat --packages, or comma-separate, for several packages
```

### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```bash
CODE='// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });'
hoody --container "$C" exec scripts validate --code "$CODE" -o json   # without -o json only a success line prints
hoody --container "$C" exec magic comments validate --code "$CODE" -o json
```

If `valid:true`, ship it via `hoody exec scripts write` (default `validate:true` re-runs the checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies}` slots tell you which checker rejected it. Magic comments never make a script invalid: a directive whose value cannot be used falls back to its default and is reported in `results.magicCommentWarnings` (or `warnings` from `hoody exec magic comments validate`) while `valid` stays `true`, so read those warnings separately. The two paths differ on one point: `hoody exec scripts validate` counts a `require()`d module that is not installed yet as a failure, while `hoody exec scripts write` only warns about it and the runtime installs it on first execution. A `valid:false` whose only failing slot is `dependencies` can be written for the runtime to install when `results.dependencies.invalidModules` is empty, so the failure is only missing packages. A versioned import specifier such as `require('lodash@4')` is listed in `invalidModules` and refused at runtime: pin the version in the scripts-root `package.json` (`hoody exec packages pin`) and import the bare package name.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry in a single OpenAPI 3.0 document the proxy can serve. Request/response shapes come only from a script's companion `.openapi.json` file; a script without one gets a generic `GET` entry, and a companion that cannot be read or parsed leaves that script out and is listed under `x-schema-errors` in the document.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```bash
hoody --container "$C" exec openapi scripts list
```

**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```bash
hoody --container "$C" exec openapi get --format json > /tmp/user-scripts.openapi.json
```

**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `hoody exec openapi merge`. Merge generates from the scripts only for the `directories` you name (`scripts` means the calling deployment's scripts directory, not every deployment's); without them it merges just the `specs` you pass. It answers `{success, data}` with the merged document in `data`.

```bash
# --specs takes a file holding an ARRAY of document objects. Without -o json the
# command prints only a success line, so ask for the body and keep its .data.
jq -s . /tmp/layer.json > /tmp/specs.json
hoody --container "$C" exec openapi merge --directories scripts --specs @/tmp/specs.json -o json \
  | jq .data > /tmp/merged.openapi.json
```

`hoody exec openapi merge` and `hoody exec openapi generate` only RETURN a document; neither writes anything, and `hoody exec openapi get` (step 2) regenerates from the scripts on every call, so it never shows a merge. Store the merged document yourself if you need to keep or publish it. `hoody exec openapi schema validate` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `hoody exec logs list` returns kit-wide log files; `hoody exec logs get` slices a specific one.

```bash
hoody --container "$C" exec logs list
hoody --container "$C" exec logs get --file "$LOGNAME" --lines 200 --tail -o json   # $LOGNAME from `exec logs list` → .logs[].name
# Live tail: prints each event as it arrives until you stop it (Ctrl-C).
hoody --container "$C" exec logs stream --file "$LOGNAME"
# One-shot dump of the whole file; the command exits when the server closes the stream.
hoody --container "$C" exec logs stream --file "$LOGNAME" --no-follow
```

Per-request execution logging is ON by default (`@log-level` defaults to `standard`); `// @log-level none` turns that logging off for the script. The kit's separate access log still records every request to it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `hoody exec stats` is a single snapshot; `hoody exec requests list` lists in-flight script HTTP requests (for WebSocket counts use `hoody exec stats` `websocket.active`, or each script's `activeWs` from `hoody exec scripts stats list`); `hoody exec scripts stats list` lists every script with traffic, with its request and error counters (sort by `requests`, `errors`, `p95`, `ws_active` or the default `lastActivity`); `hoody exec scripts stats get` then reports on ONE script, named by the `scriptPath` from that listing. An empty body returns the stub `{"metrics":{}}`, which means "no script asked for", not "no traffic".

```bash
hoody --container "$C" exec stats
hoody --container "$C" exec requests list
hoody --container "$C" exec scripts stats list --sort requests --limit 10
hoody --container "$C" exec scripts stats get --script-path default/1/echo.js -o json
```

For Prometheus scraping, `GET /api/v1/exec/monitor/metrics` returns text/plain in standard exposition format.

### 9. Wrap a bash one-liner as an HTTP API with `Bun.$`

**Goal:** turn `df -h /` into a JSON HTTP endpoint with no scaffolding. `Bun.$` is in scope inside any script.

```bash
DU=$(cat <<'JS'
module.exports = async (req, res) => {
  const out = await Bun.$`df -h --output=source,size,used,avail,target /`.text();
  res.json({ disk: out.trim().split('\n').slice(1).map(l => l.split(/\s+/)) });
};
JS
)
hoody --container "$C" exec scripts write --path disk-usage.js --content "$DU"
```

Same pattern works for `python3 -c "..."`, `ffmpeg`, native binaries, anything on `$PATH`. The script handler runs inside the container as a normal process.

### 10. In-process schedule via `@schedule` directive

**Goal:** fire a script every 5 minutes WITHOUT the `cron` namespace. The schedule lives inside the kit; if the kit restarts, the schedule re-registers from disk on boot. (For schedules that must survive a kit-down — use the `cron` namespace instead.)

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log. A scheduled fire has no HTTP caller, so the script's `res.json` body goes nowhere; `hoody exec schedules run` (step 3) reports the fire outcome instead, not that body.

```bash
TICK=$(cat <<'JS'
// @schedule */5 * * * *
// @description Heartbeat — fires every 5 minutes
module.exports = async (req, res) => {
  console.log('[tick] fired at', new Date().toISOString());
  res.json({ ok: true, ts: Date.now() });
};
JS
)
hoody --container "$C" exec scripts write --path tick.js --content "$TICK"
```

**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, the absolute on-disk `scriptPath`, and `scriptRel`, the same path relative to the scripts root (e.g. `default/1/tick.js`). Either one is what step 3 needs.

```bash
hoody --container "$C" exec schedules list
```

**Step 3 — fire it on demand.** `scriptPath` accepts the absolute `scriptPath` from step 2 or its root-relative `scriptRel` (`default/1/tick.js`). A relative path is scoped by the kit URL like `hoody exec scripts write`, so through the `exec-1` kit URL plain `tick.js` also names `default/1/tick.js`. `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only. The response is the fire outcome, `{triggered, scriptPath, runId, status, durationMs, error?}`.

```bash
hoody --container "$C" exec schedules run \
  --script-path /hoody/storage/hoody-exec/scripts/default/1/tick.js --force -o json
hoody --container "$C" exec schedules history list --limit 5
```

**Stop the schedule** by deleting the script (`hoody exec scripts delete --path tick.js --confirm true`) or by rewriting it through `hoody exec scripts write` without the `// @schedule` directive; every `hoody exec scripts write` re-registers that file's schedule, so no separate `hoody exec schedules reload` call is needed. Use `hoody exec schedules reload` only after changing files some other way.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. Every endpoint has, as script-scoped bindings enabled by default (`// @ai false` turns them off; not on `globalThis`), `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key defaults to `container-<hash>`. Default model is **`hoody-ai/hoody-free`** (the kit's `--ai-default-model`). Override per-script with `// @ai-model <provider/model>`; what a model costs is up to the AI service, not exec. Set a default system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```bash
SUM=$(cat <<'JS'
// @description One-line summary via built-in Hoody AI (no key or setup)
module.exports = async (req, res) => {
  const text = metadata.query.q || 'Say hello in one sentence.';
  const result = await ai.generate('Summarize in one line: ' + text);
  res.json({ summary: result.text });
};
JS
)
hoody --container "$C" exec scripts write --path summarize.js --content "$SUM"
```

**Step 2 — invoke it** (bare path on the exec kit URL). No key anywhere in the call:

```
https://{P}-{C}-exec-1.{N}.containers.hoody.com/summarize?q=Hoody+is+a+remote-first+computing+platform
# → {"summary":"..."}
```

For structured output use `(await ai.object({ schema, prompt })).object` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`. The system prompt in `summarize.system.md` is the default for `ai.generate` / `ai.stream` / `ai.object` with no code; do not read the file yourself (the raw `generateText` and friends need an explicit `system`).

### 12. WebSocket endpoint — rooms with broadcast, plus HTTP on the same path

**Goal:** a chat room per URL (`/rooms/red`, `/rooms/blue`): every text message goes to everyone in that room, sender included, and a plain HTTP request to the same path posts into the room. A WebSocket script never handles the upgrade itself: it declares `// @websocket` and `// @mode worker` (without both the socket is closed with `4400`) and assigns handlers on the injected `ws`.

**Step 1 — write `rooms/[room].js`** with `hoody exec scripts write` as in example 1, path `rooms/[room].js`:

```javascript
// file: rooms/[room].js
// @mode worker
// @websocket
const room = metadata.parameters.room;   // runs ONCE per room in use (again after the room empties)
ws.open = (socket, req) => { socket.data.count = 0; };   // per-connection state lives on socket.data
ws.message = (socket, data) => {         // data: a string (a Buffer for binary frames)
  socket.data.count++;
  ws.broadcast(JSON.stringify({ room, text: data, n: socket.data.count }));   // this room only, sender included
};
ws.close = (socket, code, reason) => {};
if (metadata.method === 'WEBSOCKET_INIT') return;
// Plain HTTP on the same path: the body runs again per request and sees this room's sockets.
if (req.method === 'POST') ws.broadcast(JSON.stringify({ room, text: req.body.text, n: 0 }));
return { room, sockets: ws.connections.size };
```

**Step 2 — connect.** Top-level variables of the script are shared by every socket of the room; anything an HTTP request must share with the socket handlers goes in `shared`. Send objects as JSON text: `socket.send` and `ws.broadcast(text, exceptSocket)` take a string or a Buffer.

```javascript
const sock = new WebSocket(`wss://${P}-${C}-exec-1.${N}.containers.hoody.com/rooms/red`);
sock.onopen = () => sock.send('hi');
sock.onmessage = (e) => console.log(JSON.parse(e.data));   // → {"room":"red","text":"hi","n":1}
// From any HTTP client: POST /rooms/red {"text":"from http"} → {"room":"red","sockets":1}
```

### 13. Middleware — guard a directory with `pre.js`, wrap answers with `post.js`

**Goal:** every script in `admin/` requires `X-Admin-Key`, and every answer is wrapped in an envelope. `pre.js` / `post.js` act on HTTP requests to the scripts of their OWN directory only: `admin/reports/x.js` is not guarded until `admin/reports/` gets its own `pre.js`, and `admin/pre.js` also guards the `@websocket` scripts in `admin/` (once per connection, before the handshake).

**Step 1 — write the three files and the key** with `hoody exec scripts write` (example 1): `admin/pre.js`, `admin/post.js`, `admin/users.js`, and `admin/_default.env` (its values show up in `process.env` of every script in `admin/`).

```
# file: admin/_default.env
ADMIN_KEY=change-me
```

```javascript
// file: admin/pre.js
const key = process.env.ADMIN_KEY;
if (!key || req.headers['x-admin-key'] !== key) {   // no key configured: refuse as well
  res.status(401);
  return { error: 'unauthorized' };   // a non-null return stops here: admin/users.js does not run
}
req.user = 'admin';                   // returning nothing continues; req carries data to the script
```

```javascript
// file: admin/post.js
if (res.statusCode >= 400 || res.headersSent) return;   // post.js also runs after a pre.js stop or a res.json() answer; returning nothing keeps it
res.setHeader('X-Envelope', 'v1');
return { ok: true, data: mainResult };   // mainResult = what the script returned
```

```javascript
// file: admin/users.js
return { users: [], by: req.user };   // return the value so post.js can wrap it; a res.json() answer is already sent
```

**Step 2 — call it.**

```
GET https://{P}-{C}-exec-1.{N}.containers.hoody.com/admin/users  with  X-Admin-Key: change-me → 200 {"ok":true,"data":{"users":[],"by":"admin"}}, X-Envelope: v1
GET https://{P}-{C}-exec-1.{N}.containers.hoody.com/admin/users  without the header           → 401 {"error":"unauthorized"}
```

### 14. File upload — `multipart/form-data` and `req.files`

**Goal:** accept a form with a `title` field and a `document` file. Text fields are in `req.body`; files are only in `req.files`, one `{ fieldName, filename, type, size, data }` entry per file (`data` is a Buffer; `type` is the MIME type the runtime reports, which may differ from the part's declared Content-Type and can come from the filename; empty files and repeated field names each get an entry).

**Step 1 — write `upload.js`** with `hoody exec scripts write` (example 1):

```javascript
// file: upload.js
const doc = (req.files ?? []).find((f) => f.fieldName === 'document');
if (!doc) { res.status(400); return { error: 'document missing' }; }
return { title: req.body.title, filename: doc.filename, type: doc.type, size: doc.size, text: doc.data.toString('utf8') };
```

**Step 2 — post a form.** Submit a `multipart/form-data` request to the script's `/upload` URL (`https://{P}-{C}-exec-1.{N}.containers.hoody.com/upload`) with the text field `title=notes` and a file field named `document`. Uploading `a.txt` containing the five bytes `hello` returns `title: "notes"`, `filename: "a.txt"`, `size: 5` and `text: "hello"`; `type` is the MIME type reported by the runtime (`text/plain;charset=utf-8` on Bun 1.4.2).

## Reference

### `hoody exec` (68) — Script execution and templates

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody exec cache clear` |  | destructive | Clear Cache | `exec.cache.clear` | `hoody exec cache clear --hostname example.com --clear-vm` |
| `hoody exec health` |  | read | Health Check | `exec.kit.getHealth` | `hoody exec health` |
| `hoody exec logs clear` |  | destructive | Clear Logs | `exec.logs.clear` | `hoody exec logs clear --file /home/user/file.txt --type all --confirm true` |
| `hoody exec logs get` |  | read | Read Log | `exec.logs.get` | `hoody exec logs get --file execution.log --lines 100 --tail` |
| `hoody exec logs list` |  | read | List Logs | `exec.logs.list` | `hoody exec logs list --type all --limit 10` |
| `hoody exec logs search` |  | read | Search Logs | `exec.logs.search` | `hoody exec logs search --query 'my search' --regex '.*'` |
| `hoody exec logs stream` |  | read | Stream Logs | `exec.logs.stream` | `hoody exec logs stream --file /home/user/file.txt --follow` |
| `hoody exec magic comments batch update` |  | write | Bulk Update Magic Comments | `exec.magicComments.updateMany` | `hoody exec magic comments batch update --directory /home/user/src --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec magic comments get` |  | read | Read Magic Comments | `exec.magicComments.get` | `hoody exec magic comments get --path reports/report.pdf --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec magic comments schema get` |  | read | Get Magic Comments Schema | `exec.magicComments.getSchema` | `hoody exec magic comments schema get` |
| `hoody exec magic comments update` |  | write | Update Magic Comments Handler | `exec.magicComments.update` | `hoody exec magic comments update --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --path reports/report.pdf --comments-enabled` |
| `hoody exec magic comments validate` |  | read | Validate Magic Comments | `exec.magicComments.validate` | `hoody exec magic comments validate --code <code>` |
| `hoody exec metrics` |  | read | Prometheus Export | `exec.kit.getMetrics` | `hoody exec metrics` |
| `hoody exec modules install` |  | write | Install Dependencies | `exec.modules.install` | `hoody exec modules install --modules <modules>` |
| `hoody exec modules list` |  | read | List Bundled Dependencies | `exec.modules.listBundled` | `hoody exec modules list` |
| `hoody exec modules test` |  | read | Check Dependencies | `exec.modules.test` | `hoody exec modules test --code <code>` |
| `hoody exec namespaces list` |  | read | List All Exec Ids | `exec.namespaces.list` | `hoody exec namespaces list` |
| `hoody exec open` |  | action | Open the page a script serves (runs the script) in your browser |  | `hoody exec open --path /my-script` |
| `hoody exec openapi generate` |  | action | Generate User Open A P I | `exec.openapi.generate` | `hoody exec openapi generate --directory scripts --subdomain my-app` |
| `hoody exec openapi get` |  | read | Serve Generated Spec | `exec.openapi.get` | `hoody exec openapi get --dir scripts --format json` |
| `hoody exec openapi merge` |  | write | Merge Open A P I Specs | `exec.openapi.merge` | `hoody exec openapi merge --directories /home/user/src --specs @path.json` |
| `hoody exec openapi schema get` |  | read | Serve Schema File | `exec.openapi.getSchema` | `hoody exec openapi schema get --file reports/report.pdf --subdomain my-app` |
| `hoody exec openapi schema validate` |  | read | Validate User Schema | `exec.openapi.validateSchema` | `hoody exec openapi schema validate --file reports/report.pdf --subdomain my-app --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec openapi scripts list` |  | read | List User Scripts | `exec.openapi.listScripts` | `hoody exec openapi scripts list --directory scripts --subdomain my-app` |
| `hoody exec packages compare` |  | read | Compare Packages | `exec.packages.compare` | `hoody exec packages compare` |
| `hoody exec packages install` |  | write | Install Packages | `exec.packages.install` | `hoody exec packages install --packages axios --dev` |
| `hoody exec packages manifest create` |  | write | Init Package Json | `exec.packages.createManifest` | `hoody exec packages manifest create --name hoody-exec-project --version 1.0.0` |
| `hoody exec packages manifest get` |  | read | Read Package Json | `exec.packages.getManifest` | `hoody exec packages manifest get` |
| `hoody exec packages manifest update` |  | write | Update Package Json | `exec.packages.updateManifest` | `hoody exec packages manifest update --dependencies 'lodash=^4.17.21' --scripts 'my-task=node scripts/my-task.js'` |
| `hoody exec packages pin` |  | write | Pin Versions | `exec.packages.pin` | `hoody exec packages pin --packages axios` |
| `hoody exec requests list` |  | read | Get Active Requests | `exec.kit.listRequests` | `hoody exec requests list` |
| `hoody exec restart` |  | destructive | Restart Server | `exec.kit.restart` | `hoody exec restart --graceful --drain-timeout-ms 5000 -y` |
| `hoody exec routes list` |  | read | Discover Routes | `exec.routes.list` | `hoody exec routes list --include-metadata --hostname example.com` |
| `hoody exec routes resolve` |  | read | Resolve Route | `exec.routes.resolve` | `hoody exec routes resolve --path /home/user/file.txt --hostname default` |
| `hoody exec routes test` |  | read | Test Route | `exec.routes.test` | `hoody exec routes test --paths /home/user/src --hostname default` |
| `hoody exec schedules history list` |  | read | Schedule History | `exec.schedules.listHistory` | `hoody exec schedules history list --script-path reports/report.pdf --since 2026-01-01T00:00:00Z` |
| `hoody exec schedules list` |  | read | List Schedules | `exec.schedules.list` | `hoody exec schedules list` |
| `hoody exec schedules reload` |  | action | Reload Schedules | `exec.schedules.reload` | `hoody exec schedules reload --dry-run` |
| `hoody exec schedules run` |  | action | Trigger Schedule | `exec.schedules.run` | `hoody exec schedules run --script-path reports/report.pdf --force` |
| `hoody exec scripts delete` |  | destructive | Delete Script | `exec.scripts.delete` | `hoody exec scripts delete --path /home/user/file.txt --confirm true --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody exec scripts dependencies validate` |  | read | Validate Dependencies | `exec.scripts.validateDependencies` | `hoody exec scripts dependencies validate --code <code>` |
| `hoody exec scripts list` |  | read | List scripts in the caller's scripts directory (one level; --recursive true descends) | `exec.scripts.list` | `hoody exec scripts list --metadata '{}' --label my-label` |
| `hoody exec scripts move` |  | write | Move Script | `exec.scripts.move` | `hoody exec scripts move --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --from <from> --to <to> --overwrite` |
| `hoody exec scripts read` |  | read | Read Script | `exec.scripts.read` | `hoody exec scripts read --path /home/user/file.txt --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec scripts returns validate` |  | read | Validate Return Type | `exec.scripts.validateReturnType` | `hoody exec scripts returns validate --type-definition <type_definition> --value @path.json` |
| `hoody exec scripts stats get` |  | read | Get Script Performance | `exec.scripts.getStats` | `hoody exec scripts stats get --script-path reports/report.pdf` |
| `hoody exec scripts stats list` |  | read | List tracked scripts with their request, error and latency counters | `exec.scripts.listStats` | `hoody exec scripts stats list --limit 100 --sort lastActivity` |
| `hoody exec scripts syntax validate` |  | read | Validate Syntax | `exec.scripts.validateSyntax` | `hoody exec scripts syntax validate --code <code>` |
| `hoody exec scripts tree get` |  | read | Get Script Tree | `exec.scripts.getTree` | `hoody exec scripts tree get --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --max-depth 10` |
| `hoody exec scripts types validate` |  | read | Validate Type Script | `exec.scripts.validateTypes` | `hoody exec scripts types validate --code <code>` |
| `hoody exec scripts validate` |  | read | Validate Script | `exec.scripts.validate` | `hoody exec scripts validate --code <code>` |
| `hoody exec scripts write` |  | write | Write Script | `exec.scripts.write` | `hoody exec scripts write --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --path /home/user/file.txt --content Hello --create-dirs` |
| `hoody exec sdk types list` |  | read | List SDK methods | `exec.sdkTypes.list` | `hoody exec sdk types list --limit 20 --raw true` |
| `hoody exec sdks delete` |  | destructive | Delete S D K | `exec.sdks.delete` | `hoody exec sdks delete --id abc-123 -y` |
| `hoody exec sdks get` |  | read | Get S D K | `exec.sdks.get` | `hoody exec sdks get --id abc-123` |
| `hoody exec sdks import` |  | write | Import S D K | `exec.sdks.import` | `hoody exec sdks import --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --source-url https://example.com/openapi.json --source-auth-type bearer --source-auth-token <source_auth.token>` |
| `hoody exec sdks list` |  | read | List S D Ks | `exec.sdks.list` | `hoody exec sdks list` |
| `hoody exec stats` |  | read | Get Stats | `exec.kit.getStats` | `hoody exec stats` |
| `hoody exec status` |  | read | Get Restart Status | `exec.kit.getStatus` | `hoody exec status` |
| `hoody exec store clear` |  | destructive | Clear Shared State | `exec.store.clear` | `hoody exec store clear --hostname example.com --path /home/user/file.txt -y` |
| `hoody exec store get` |  | read | Get Shared State | `exec.store.get` | `hoody exec store get --hostname example.com --path /home/user/file.txt` |
| `hoody exec store set` |  | write | Set Shared State | `exec.store.set` | `hoody exec store set --hostname example.com --path /home/user/file.txt --value @path.json --merge` |
| `hoody exec templates create` |  | write | Create Custom Template | `exec.templates.create` | `hoody exec templates create --name my-resource --code <code> --metadata-category custom --metadata-tags tag1,tag2` |
| `hoody exec templates delete` |  | destructive | Delete Custom Template | `exec.templates.delete` | `hoody exec templates delete --name my-resource -y` |
| `hoody exec templates generate` |  | action | Generate From Template | `exec.templates.generate` | `hoody exec templates generate --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --save-file` |
| `hoody exec templates list` |  | read | List Templates | `exec.templates.list` | `hoody exec templates list --category api --include-builtin` |
| `hoody exec templates preview` |  | read | Preview Template | `exec.templates.preview` | `hoody exec templates preview --name my-resource` |
| `hoody exec templates update` |  | write | Update Custom Template | `exec.templates.update` | `hoody exec templates update --name my-resource` |


---

<!-- ===== namespace: files ===== -->

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with automatic mutation journaling when the deployment enabled it.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/home/user/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **History is kept for journaled paths, within limits:** retention prunes old entries (90 days or 2 GiB of journal storage by default), bodies over 2 MiB keep only their hash and size, and excluded paths (dev dirs such as `node_modules`, and `.git`) are never recorded. The journal lets you:

- **Time-travel a single file** — `hoody files get` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `hoody files get` `?history=1` returns one page of the path's revisions (renames followed), oldest first by global journal entry id: 100 entries by default, `limit` up to 1000. While the response has `has_more: true`, request again with `after_id` set to its `next_after_id`.
- **Diff between revisions** — `hoody files get` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `hoody files journal list` `?path=<p>&after_id=<id>` streams every operation after global journal entry `id` (while the response has `has_more: true`, resume from its `next_after_id`; on the last page `next_after_id` is `null`, so keep the last entry's `id` as your cursor; an entry's `seq` is its per-path revision number, not a cursor). Run `hoody files journal flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When the deployment turned journaling on, no per-write setup is needed — every covered write is recorded. Exposing the journal query endpoints — history, revision, diff, stats, flush — over the API is a second deployment-side switch; where it is off those endpoints return `403`. Where API access is on but recording itself is off, they return `404 Journal is not enabled`. It is not a complete undo: retention pruning, the 2 MiB body cap, the exclude lists and write paths with no journal hook (URL downloads, archive extraction) all leave gaps, so check `?history` before relying on a restore. Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments that did not turn it on will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` to operate against a backend you've connected, of any of the 49 allowed rclone backend types (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, …), instead of the local FS. A `?type=` parameter does not select a connected backend: on `/api/v1/files/{path}` it is ignored and the request runs on the local FS. = &["] Only where the deployment enabled remote backends; otherwise `403`. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `hoody files mounts create` to surface a remote backend AS a path in the local FS. Same deployment-side requirement.
- **chmod / chown** — Unix-only, and only where the deployment enabled them; otherwise `403`.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Available where journaling and journal API access are on (`403` when API access is off, `404` when recording is off), for writes the journal recorded and still retains (see Quirks for what is excluded).
- **Audit / replay every change to the filesystem** — `hoody files journal list` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3** — append `?backend=<id>` to read (`hoody files get`), upload (`hoody files upload`, not with `append`), delete (`hoody files delete`) or create a directory (`hoody files mkdir`). Only `get`, `upload`, `delete` and `mkdir` take `--backend`; `update`, `append`, `copy`, `move`, `archives extract` and `downloads create` have no such flag and refuse it as an unknown option, and `upload --append` with `--backend` is refused with `400`.
- **FUSE-mount a remote into the local FS** — when downstream code needs to read the remote as a regular path (under the mount directory, `/hoody/mounts/permanent/…` by default).

## When NOT to use

Run binaries -> `terminal`/`exec`, live events -> `watch`, TS/JS gen -> `exec`, indexed queries -> `sqlite`, traffic logs -> `proxyLogs`.

## Prerequisites

- **For plain read/stat/list**: no deployment switch, but any authentication and per-path access rules configured on the kit still apply (`401` without credentials, `403` for a path outside your rules). **Writes are enabled by the deployment, not per request**: upload/write/append and copy need write enabled, delete needs delete enabled, move needs both (403 otherwise; all enabled in the standard hoody_kit container image, off on a raw kit deployment that did not turn them on). Paths are absolute container paths; the namespace is not workspace-scoped, so use `/home/user/...`, `/etc/...`, etc.
- **For glob / grep**: gated separately — glob needs search enabled, grep needs grep enabled (403 "not allowed" otherwise; both enabled in the standard hoody_kit container image).
- **For remote backends** (`?backend=` / `?type=` / FUSE mounts): the deployment must have enabled remote backends; otherwise `403`.
- **For chmod / chown**: the deployment must have enabled them, and the container is Unix.
- **Which container, which path.** Every `hoody files` command acts on the container named by the global `-c <containerId>` (or `HOODY_CONTAINER`): its id from `hoody containers list -o json`, never its name. Without one the CLI refuses before sending anything. The positional `<path>` is an absolute path inside that container, not a file id.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `hoody files get <path> --stat` or `--lines 10-50`.
2. `hoody files glob <dir> --pattern '**/*.ts'`; `hoody files grep <dir> --pattern TODO --context 2` (local only).
3. `hoody files upload <path> --append`; `hoody files delete <path>`.

### 2. Download, extract, FUSE-mount

1. `hoody files downloads create <dir> --download <url>`; `hoody files downloads list <dir>` to poll.
2. `hoody files archives preview <archive>`; `hoody files archives extract <archive> --extract src/ --dest work-src` (`--extract` is an exact entry name, or a directory prefix ending in `/`; no globs. `--dest` MUST be relative).
3. `hoody files backends s3 create` (49 backend types) -> `hoody files get <path> --backend <id>` for one-shot reads OR `hoody files mounts create` -> `hoody files get /hoody/mounts/permanent/...` for a regular FS view -> `hoody files mounts delete`, then `hoody files backends delete`. (A mounted path needs no `--backend`; `hoody files get`/`upload`/`delete` take it for a backend read.)

### 3. Journal time-travel + TUS-like upload

1. `hoody files get <path> --history`, `--revision N` or `--at <unix-ms>`, `--diff --from-seq N`.
2. `hoody files journal list --path <p> --after-id <id>` (global entry id, not `seq`; see Purpose for the last-page cursor rule); `hoody files journal flush` first.
3. Resumable: `hoody files upload` for the first chunk, then `hoody files append <path> --input <chunk>` per chunk (Example 3).

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. `/api/v1/files/health` is a route of its own and never reaches the dispatcher.
- `hoody files glob`/`hoody files grep`/`hoody files realpath`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need remote backends enabled deployment-side.
- `?backend=` on `/api/v1/files/{path}` is served only for GET, DELETE, PUT without `append`, and POST that creates a directory; on any other method or operation it returns `400` ("only supported for reading, uploading and deleting files and for creating directories"). `hoody files mkdir --backend <id>` creates the directory on the remote backend; `update`, `append`, `archives extract`, `downloads create`, `copy` and `move` have no `--backend` flag and reject it as an unknown option before any request is sent.
- `hoody files chmod`/`hoody files chown` Unix-only, and only where the deployment enabled them.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- `hoody files realpath` resolves symlinks whether or not symlink following is enabled, but still returns `403` when the resolved target is outside the serve root or outside your access rules.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit range's start must fall INSIDE the current file, but only that start is used: the whole body is written from it, the range end does not bound the write, and a body longer than the rest of the file extends it. A start at or past EOF is refused, so use `append` to continue at the end..0)),"]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir.
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`.
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `hoody files archives extract` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **The journal retains body bytes only for files up to 2 MiB by default; a larger file still produces a journal entry with its hash and size, but its contents are not kept**.
- **Exclusions decide which paths are journalled.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless the deployment turned the dev-dir exclusions off. `.git` is always excluded regardless of that setting (separate hardcoded check, not part of the toggleable list). The deployment can add further excludes of its own. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `hoody files chmod`, `hoody files chown`, `hoody files touch`, `?append=true` and copy/move ARE recorded. Always call `hoody files journal flush` then `hoody files journal list` (or `?history=1`) to inspect what was actually recorded — don't assume coverage.
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Only the deployment can turn these off, at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even then.
- **`HEAD` returns no body** on both routes. `HEAD /api/v1/files/{path}` ignores `Range`, so its status and headers need not match a ranged `GET`. It carries no metadata body; for a JSON metadata envelope use `hoody files stat`.
- **`hoody files chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even where the deployment enabled chown. Use a non-root user (`nobody`, `user`, …).
- **FUSE mount paths live under a configured mount directory** (`/hoody/mounts/permanent` by default, fixed by the deployment at kit start). An absolute `mount_path` must be under it (`400 Mount path must be under the configured mount directory` otherwise); a relative `mount_path` is resolved under it; an omitted one becomes `<mount dir>/mount_<id>`. If the path already exists and is not a symlink, the create fails with `409 Mount path already exists and is not a symlink`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed).
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the OS's built-in WebDAV client can mount the container's files as a drive/folder: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL. For a cross-platform, scriptable mount use `hoody mount <containerId> <localDir>` (`--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags); it runs rclone over WebDAV, so rclone must be installed on the local machine. A changed file is uploaded whole once it has been closed and idle for about 1 s. When the file on the kit is a version this mount never received (another machine or the container changed it meanwhile), the files kit keeps that version as a conflict copy beside it (`<name> (conflict <host> <time>).<ext>`) and the mount's upload lands at the name, with no error on either side (safe save); conflict copies stay until someone deletes them, so look for them after concurrent edits. A program on the local machine that saves an older buffer after the mount re-read the newer version is not covered. A change made elsewhere shows at the next lookup once it has landed and the mount's 5 s directory cache has expired, while a program that already has the file open may keep its old view (`hoody mount --help`). This is the inverse of the server-side FUSE mounts (which mount remote backends INTO the container); those have no safe save: the upload that reaches the backend last wins, so keep one writer per file there.
- **Known defect (CLI):** `hoody files exists` sends `HEAD`, and the CLI prints no body for a `HEAD` answer, so it shows no metadata, history or diff. For metadata use `files stat <path>` or `files get <path> --stat`; for history and diffs use `files get <path> --history` or `--diff --from-seq <N>`.
- **`hoody files chunks write <path> --input <file>` only appends, and only to a file that already exists.** It sends the bytes raw (a piped stdin works too), the append position is fixed, so there is no position flag to set, and it replies `204` with no body. It creates nothing: `hoody files upload <path> --append` creates a missing file and answers JSON.
- **Replace, refuse, create parents.** `hoody files upload` replaces an existing file (`--append` adds to its end instead) and creates missing parent directories. `hoody files copy` refuses an existing destination unless you pass `--overwrite true`. `hoody files move` never replaces a destination and has no overwrite option: delete the destination first. Both create the destination's missing parent directories.
- **`hoody files delete` on a directory deletes it with everything under it**, with no non-recursive mode for directories.
- **`hoody files mkdir` succeeds when the directory is already there**, and creates missing parent directories.
- **Pending uploads need remote mounts enabled.** `hoody files uploads list` lists them; `hoody files uploads files list`, `hoody files uploads download`, `hoody files uploads deliver`, `hoody files uploads stop` and `hoody files uploads delete` work on a file service started with remote mounts allowed; on one without, every pending-uploads request answers `403 REMOTE_DISABLED`.

## Common errors

- 400 not supported with remote backends -- drop `?backend=`.
- 400 Cannot combine realpath with other ops.
- 400 Cannot preview a directory as archive.
- 400 Unknown operation -- POST needs one query op.
- 400 Missing query parameter or request body -- PATCH needs op or body.
- Refusals on the WebDAV path route (`/{path}`) answer JSON `{success: false, error, code}`: `ACCESS_FORBIDDEN` 403, `RESOURCE_NOT_FOUND` 404, `INVALID_PATH` 400, `PATH_CONFLICT` 409, `OVERWRITE_REFUSED` 412 (a WebDAV `COPY`/`MOVE` with `Overwrite: F` onto an existing target), `DIRECTORY_EXISTS` 405 (creating a directory that exists), `PAYLOAD_TOO_LARGE` 413, `UPLOAD_INCOMPLETE` 400 and `REMOTE_UPLOAD_FAILED` 502 (an upload to a remote backend), and `MOUNT_PATH_RESERVED` 409 for a change to a path a mount holds. `INVALID_PARAMETER` means the request itself is wrong; a failure that a changed request would not fix (an OS error, a backend failure, the concurrent-download limit's 429) carries no `code`, so branch on the status. On `/api/v1/files/{path}` many refusals carry no `code` — a REST copy or move onto an existing target without overwrite is 409 `{success: false, error}`. REST codes include `INVALID_PATH` 400 (`{success: false, error: "Invalid path", code: "INVALID_PATH"}`), `ACCESS_FORBIDDEN` 403 (a path rule), `CONTAINS_SERVICE_STORAGE` 409, `FILE_MOVE_CROSSES_DEVICES` 409, `INVALID_PARAMETER` 400 on some parameter checks, and `FILE_PATH_BUSY`, `FILE_PATH_CHANGED` and `MOUNT_PATH_RESERVED` 409 for a change to a path that is in use or held for a mount. `PERMISSIONS_NOT_APPLIED` and `OWNER_NOT_APPLIED` 409 mean the filesystem does not retain the requested permission bits or owner, as on a mount of remote storage: use storage that retains them when you need them. A chmod, or an upload whose requested permissions are narrower than the file's fixed ones, changes nothing; an upload requesting broader permissions writes its whole body under the fixed ones and still answers `PERMISSIONS_NOT_APPLIED`, so read the message before deciding whether to resend the body. When `code` is absent, branch on the HTTP status.
- A URL download streams into a hidden part file, `.hoody-download-<id>.part`, in the destination folder, and the file gets its final name only once it is complete. Cancelling the download (or a failure or timeout) removes that part file on a local filesystem (ext4, xfs, btrfs, tmpfs) only if its inode is still the one the download created. On FUSE mounts and network filesystems the partial file is kept, so check the destination for leftovers.

## Related namespaces

- `terminal` -- run binaries.
- `exec` -- TS/JS gen.
- `watch` -- live events.
- `sqlite` -- indexed queries.
- `browser`/`curl` -- scripted HTTP.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. Examples that need history use `/home/user/...`. The kit has no fixed rule for `/tmp` or `/home/user`: coverage depends on the exclude lists, so check `?history` rather than assuming it. An idle kit may be asleep: the first request can return `502` from the proxy with an HTML error body, so retry 2-3 times with a few seconds of backoff.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `hoody files stat` returns size, owner/group, octal permissions, mtime, and, when the journal has recorded the path, `revisions`: the path's latest per-path revision number. The field is absent for a path the journal has not recorded, and it is not a count of the entries still retained after pruning. Use this BEFORE downloading a file you don't know the size of.

```bash
hoody --container "$C" files stat /etc/hostname
```

**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```bash
hoody --container "$C" files get /var/log/syslog --lines 2-3
```

**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```bash
hoody --container "$C" files get /etc/hostname --out-file /tmp/hostname.txt   # byte for byte, text or binary
hoody --container "$C" -o raw files get /etc/hostname                          # a text file to stdout; without -o raw it prints as a JSON string
```

### 2. Find files then grep them — TODO scan across a tree

**Goal:** find every `.md` file under a directory, then grep them for `TODO` with surrounding context. Both ops are local-FS only.

**Step 1 — glob.** `pattern` matches relative to `path`; obeys `.gitignore` unless `no_ignore=true`.

```bash
hoody --container "$C" files glob /home/user --pattern '**/*.md' --max-results 200 \
  -o json | jq '.entries[].name'
```

**Step 2 — grep with context.** `?glob=` filters which files grep looks at; `?context=2` mirrors `grep -C 2`.

```bash
hoody --container "$C" files grep /home/user --pattern TODO \
  --glob '**/*.md' --context 2 --ignore-case -o json \
  | jq '.matches[] | {path, line_number, line}'
```

### 3. Resumable upload — split a payload into PUT-then-PATCH-append chunks

**Goal:** push a 16 MiB payload as 8 MiB chunks. Many CDN/proxy combos cap a single body at 10 MiB; chunked upload sidesteps that.

**Step 1 — first chunk via PUT.** Creates the file with the first slab.

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk1.bin
hoody --container "$C" files upload /home/user/upload-test.bin < /tmp/chunk1.bin
```

**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```bash
head -c $((8*1024*1024)) /dev/urandom > /tmp/chunk2.bin
hoody --container "$C" files append /home/user/upload-test.bin --input /tmp/chunk2.bin
hoody --container "$C" files stat /home/user/upload-test.bin
```

**Step 3 — resume after a network drop.** A WebDAV append (`PATCH /{path}` with `X-Update-Range: append`) writes bytes as they arrive, so a request that broke off may already have added part of its chunk. A REST append (`PUT /api/v1/files/append/{path}`, or an upload with `append`) stages the whole body first, so a body that broke off leaves the file unchanged, although a failure during the write that follows can still leave part of the chunk appended. Either way, do not resend the whole chunk blindly: stat the remote file, compare its size with how many bytes of the payload you have sent, and append only the bytes after that size. An explicit `bytes=<start>-<end>` range (no `/<total>` suffix — that is rejected) must start inside the existing file and writes the whole body from that start, so it can rewrite a tail you know is wrong, but a start at EOF is refused; appending is the way to continue. The CLI sends only appends (`hoody files append`); explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Use a path the journal covers: not under an excluded directory (`.git`, dev dirs such as `node_modules`, or excludes the deployment added — see Quirks), and confirm with `?history`.

**Step 1 — write two revisions.**

```bash
FILE_PATH=/home/user/config.toml
echo 'verbose = false' | hoody --container "$C" files upload "$FILE_PATH"
sleep 1
echo 'verbose = true'  | hoody --container "$C" files upload "$FILE_PATH"
hoody --container "$C" files journal flush
```

**Step 2 — list history.** `?history=1` returns one page of the per-revision log (100 entries by default, `limit` up to 1000; while `has_more` is `true`, repeat with `after_id` set to the response's `next_after_id`): each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
hoody --container "$C" files get "$FILE_PATH" --history -o json \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```

**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```bash
hoody --container "$C" files get "$FILE_PATH" --revision 1
hoody --container "$C" files get "$FILE_PATH" --diff --from-seq 1
```

**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.

### 5. Audit — stream every mutation since a cursor via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `hoody files journal flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
hoody --container "$C" files journal flush
```

**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

The response carries `has_more`. `next_after_id` is set only while `has_more` is true; on the last page it is `null`. Advance the cursor to `next_after_id` when it is set, otherwise to the last entry's `id`, and keep the old cursor when the page is empty. Storing `null` would restart the next poll from the beginning of the journal.

```bash
LAST=${LAST:-0}   # cursor; persist client-side
R=$(hoody --container "$C" files journal list --after-id "$LAST" --limit 200 -o json)
echo "$R" | jq '{count, has_more, entries}'
LAST=$(echo "$R" | jq --argjson last "$LAST" '.next_after_id // (.entries | last | .id) // $last')
```

**Step 3 — health check.** Watch `hoody files journal stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
hoody --container "$C" files journal stats
```

### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — download.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). The directory must already exist (a missing one is `404`), so create it first. The request waits until the download has finished, then answers `201` with a `download_id`; to watch progress, list active downloads from a separate request while this one is still running.

```bash
hoody --container "$C" files mkdir /home/user/inbox   # the target directory must exist
hoody --container "$C" files downloads create /home/user/inbox \
  --download 'https://httpbin.org/robots.txt' --filename robots.txt --timeout 15
```

**Step 2 — list active** (from a second request while a download runs; a finished one moves to the history). `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing.

```bash
hoody --container "$C" files downloads list /home/user/inbox
hoody --container "$C" files downloads history list
```

### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s.

```bash
hoody --container "$C" files archives preview /home/user/inbox/hello.zip --preview ''
```

**Step 2 — extract a subset.** `?extract=<entry>` selects entries: an exact archive entry name extracts that one file, a directory prefix ending in `/` (`src/`) extracts that subtree, and an empty value extracts everything. There is no glob matching (`src/**` matches nothing). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
hoody --container "$C" files archives extract /home/user/inbox/hello.zip \
  --extract 'Hello-World-master/' --dest extracted
```

**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<entry>` and `?extract_file=<entry>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=`; without `dest` it creates a directory named after the archive beside it (`hello.zip` → `hello/`, `x.tar.gz` → `x/`) and extracts there.

```bash
# extract-file writes the entry to disk and prints an extraction response, not the file
hoody --container "$C" files archives members extract /home/user/inbox/hello.zip \
  --extract Hello-World-master/README --dest extracted
# the entry keeps its archive path under dest; download it separately
hoody --container "$C" files get /home/user/inbox/extracted/Hello-World-master/README --out-file /tmp/readme.txt
```

### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```bash
hoody --container "$C" files copy /home/user/staging/app.toml \
  --copy-to /etc/myapp/app.toml --overwrite true
```

**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires chmod enabled by the deployment; Unix-only.

```bash
hoody --container "$C" files chmod /etc/myapp/app.toml --chmod 600
```

**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```bash
hoody --container "$C" files move /home/user/staging/app.toml \
  --move-to /home/user/archive/app.toml
```

### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here `sftp`, with a placeholder host, user and password; `s3`, `drive` and the other types take the same steps with their own config) and surface it as a regular FS path via FUSE. Requires remote backends enabled by the deployment.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `201` with `{success, message, data: {id, type, vfs_backend_type, config, mount_paths}}`; the backend id is `data.id` (`config` has credentials stripped).

```bash
BID=$(hoody --container "$C" files backends sftp create \
  --host sftp.example.com --user deploy --pass "$SFTP_PASS" \
  --description sftp-example -o json | jq -r '.data.id')   # the kit's own {success,message,data} body is printed as-is → .data.id
hoody --container "$C" files backends test "$BID"
```

**Step 2 — mount.** `mount_path` is resolved against the kit's configured mount directory (default `/hoody/mounts/permanent`): an absolute path must be under it (`400 Mount path must be under the configured mount directory` otherwise), a relative path is joined under it, and an existing non-symlink path returns `409 Mount path already exists and is not a symlink`.

```bash
MID=$(hoody --container "$C" files mounts create \
  --backend-id "$BID" --label sftp-mount \
  --mount-path /hoody/mounts/permanent/sftp-test -o json | jq -r '.data.id')   # same kit body shape → .data.id
```

**Step 3 — read through the mount as a regular path.**

```bash
hoody --container "$C" files get /hoody/mounts/permanent/sftp-test
```

**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
hoody --container "$C" files mounts delete "$MID"
hoody --container "$C" files backends delete "$BID"
```

### 10. Bulk delete a tree — and verify nothing is left

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains. The recursive delete is not atomic: if it fails partway, the entries already removed stay removed and the rest remain, so always verify.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```bash
hoody --container "$C" files delete /home/user/files-examples-cleanup -y
```

**Step 2 — verify.** A `404` from `hoody files stat` is what you want.

```bash
# only a 404 proves absence; 401/403/5xx or a connection error is a failed check
if out=$(hoody --container "$C" files stat /home/user/files-examples-cleanup 2>&1); then
  echo "still present"
elif printf '%s' "$out" | grep -q 'Error \[404'; then
  echo "gone"
else
  printf '%s\n' "$out" >&2; exit 1
fi
```

**Step 3 — confirm via journal.** A journaled directory delete records one `op: "dir_deleted"` entry for the directory itself (no per-path `seq`), not an entry per child; deleting a single file records `op: "delete"`. Flush first.

```bash
hoody --container "$C" files journal flush
hoody --container "$C" files journal list --path /home/user/files-examples-cleanup --limit 10
```

## Reference

### `hoody files` (113) — File operations and remote backends

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody files append` |  | write | Append data to file | `files.append` | `hoody files append /home/user/file.txt --input ./local-file` |
| `hoody files archives extract` |  | write | Extract an archive (--owner sets the owner of the extracted files; the reply is then shorter) | `files.archives.extract` | `hoody files archives extract /home/user/archive.zip --extract src/main.rs --owner <owner>` |
| `hoody files archives extract` |  | write | Extract an archive with an owner for the new files (answers success and message only) | `files.mkdir` | `hoody files archives extract /home/user/archive.zip --extract src/main.rs --owner <owner>` |
| `hoody files archives members extract` |  | write | Extract file from archive | `files.archives.extractMember` | `hoody files archives members extract /home/user/archive.zip --extract src/main.rs` |
| `hoody files archives members read` |  | read | View file from archive | `files.archives.readMember` | `hoody files archives members read /home/user/archive.zip --preview src/main.rs` |
| `hoody files archives preview` |  | read | Preview archive contents or read file | `files.archives.preview` | `hoody files archives preview /home/user/archive.zip` |
| `hoody files backends azureblob create` |  | write | Connect to azureblob backend | `files.backends.createAzureblob` | `hoody files backends azureblob create --archive-tier-delete --chunk-size 4194304` |
| `hoody files backends azurefiles create` |  | write | Connect to azurefiles backend | `files.backends.createAzurefiles` | `hoody files backends azurefiles create --chunk-size 4194304 --client-send-certificate-chain` |
| `hoody files backends b2 create` |  | write | Connect to b2 backend | `files.backends.createB2` | `hoody files backends b2 create --account acc-abc --chunk-size 100663296 --copy-cutoff 4294967296 --key <key>` |
| `hoody files backends box create` |  | write | Connect to box backend | `files.backends.createBox` | `hoody files backends box create --auth-url https://example.com/auth --box-sub-type user` |
| `hoody files backends cloudinary create` |  | write | Connect to cloudinary backend | `files.backends.createCloudinary` | `hoody files backends cloudinary create --adjust-media-files-extensions --api-key <api_key> --api-secret <api_secret> --cloud-name <cloud_name> --description 'My description'` |
| `hoody files backends delete` |  | destructive | Disconnect backend | `files.backends.delete` | `hoody files backends delete abc-123 --uploads keep` |
| `hoody files backends drive create` |  | write | Connect to drive backend | `files.backends.createDrive` | `hoody files backends drive create --acknowledge-abuse --allow-import-name-change` |
| `hoody files backends dropbox create` |  | write | Connect to dropbox backend | `files.backends.createDropbox` | `hoody files backends dropbox create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends fichier create` |  | write | Connect to fichier backend | `files.backends.createFichier` | `hoody files backends fichier create --cdn --description 'My description'` |
| `hoody files backends filefabric create` |  | write | Connect to filefabric backend | `files.backends.createFilefabric` | `hoody files backends filefabric create --description 'My description' --encoding 50429954 --url https://storagemadeeasy.com` |
| `hoody files backends filescom create` |  | write | Connect to filescom backend | `files.backends.createFilescom` | `hoody files backends filescom create --description 'My description' --encoding 60923906` |
| `hoody files backends ftp create` |  | write | Connect to ftp backend | `files.backends.createFtp` | `hoody files backends ftp create --allow-insecure-tls-ciphers --ask-password --host ftp.example.com` |
| `hoody files backends get` |  | read | Get backend details | `files.backends.get` | `hoody files backends get abc-123` |
| `hoody files backends gofile create` |  | write | Connect to gofile backend | `files.backends.createGofile` | `hoody files backends gofile create --description 'My description' --encoding 323331982` |
| `hoody files backends googlecloudstorage create` |  | write | Connect to google cloud storage backend | `files.backends.createGoogleCloudStorage` | `hoody files backends googlecloudstorage create --anonymous --auth-url https://example.com/auth` |
| `hoody files backends googlephotos create` |  | write | Connect to google photos backend | `files.backends.createGooglePhotos` | `hoody files backends googlephotos create --auth-url https://example.com/auth --batch-commit-timeout 600` |
| `hoody files backends hdfs create` |  | write | Connect to hdfs backend | `files.backends.createHdfs` | `hoody files backends hdfs create --description 'My description' --encoding 50430082 --namenode namenode-1:8020,namenode-2:8020` |
| `hoody files backends hidrive create` |  | write | Connect to hidrive backend | `files.backends.createHidrive` | `hoody files backends hidrive create --auth-url https://example.com/auth --chunk-size 50331648` |
| `hoody files backends http create` |  | write | Connect to http backend | `files.backends.createHttp` | `hoody files backends http create --description 'My description' --headers '{}' --url https://example.com` |
| `hoody files backends iclouddrive create` |  | write | Connect to iclouddrive backend | `files.backends.createIclouddrive` | `hoody files backends iclouddrive create --apple-id abc-123 --client-id d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d --description 'My description' --password <password>` |
| `hoody files backends imagekit create` |  | write | Connect to imagekit backend | `files.backends.createImagekit` | `hoody files backends imagekit create --description 'My description' --encoding 117553486 --endpoint https://example.com --private-key <private_key> --public-key pk_abc123` |
| `hoody files backends internetarchive create` |  | write | Connect to internetarchive backend | `files.backends.createInternetarchive` | `hoody files backends internetarchive create --description 'My description' --disable-checksum` |
| `hoody files backends jottacloud create` |  | write | Connect to jottacloud backend | `files.backends.createJottacloud` | `hoody files backends jottacloud create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends koofr create` |  | write | Connect to koofr backend | `files.backends.createKoofr` | `hoody files backends koofr create --description 'My description' --encoding 50438146 --endpoint https://example.com --password <password> --user alice` |
| `hoody files backends linkbox create` |  | write | Connect to linkbox backend | `files.backends.createLinkbox` | `hoody files backends linkbox create --description 'My description' --email user@example.com --password <password> --token <token>` |
| `hoody files backends list` |  | read | List all backends | `files.backends.list` | `hoody files backends list` |
| `hoody files backends mailru create` |  | write | Connect to mailru backend | `files.backends.createMailru` | `hoody files backends mailru create --auth-url https://example.com/auth --check-hash --pass <pass> --user alice` |
| `hoody files backends mega create` |  | write | Connect to mega backend | `files.backends.createMega` | `hoody files backends mega create --debug --description 'My description' --pass <pass> --user alice` |
| `hoody files backends netstorage create` |  | write | Connect to netstorage backend | `files.backends.createNetstorage` | `hoody files backends netstorage create --account acc-abc --description 'My description' --host example.com --protocol http --secret <secret>` |
| `hoody files backends onedrive create` |  | write | Connect to onedrive backend | `files.backends.createOnedrive` | `hoody files backends onedrive create --access-scopes 'Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access' --auth-url https://example.com/auth` |
| `hoody files backends opendrive create` |  | write | Connect to opendrive backend | `files.backends.createOpendrive` | `hoody files backends opendrive create --access private --chunk-size 10485760 --password <password> --username alice` |
| `hoody files backends oracleobjectstorage create` |  | write | Connect to oracleobjectstorage backend | `files.backends.createOracleobjectstorage` | `hoody files backends oracleobjectstorage create --attempt-resume-upload --chunk-size 5242880 --namespace <namespace> --provider no_auth --region eu-west-1` |
| `hoody files backends pcloud create` |  | write | Connect to pcloud backend | `files.backends.createPcloud` | `hoody files backends pcloud create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends pikpak create` |  | write | Connect to pikpak backend | `files.backends.createPikpak` | `hoody files backends pikpak create --chunk-size 5242880 --description 'My description'` |
| `hoody files backends pixeldrain create` |  | write | Connect to pixeldrain backend | `files.backends.createPixeldrain` | `hoody files backends pixeldrain create --api-url https://pixeldrain.com/api --description 'My description'` |
| `hoody files backends premiumizeme create` |  | write | Connect to premiumizeme backend | `files.backends.createPremiumizeme` | `hoody files backends premiumizeme create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends protondrive create` |  | write | Connect to protondrive backend | `files.backends.createProtondrive` | `hoody files backends protondrive create --description 'My description' --enable-caching` |
| `hoody files backends putio create` |  | write | Connect to putio backend | `files.backends.createPutio` | `hoody files backends putio create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends qingstor create` |  | write | Connect to qingstor backend | `files.backends.createQingstor` | `hoody files backends qingstor create --chunk-size 4194304 --connection-retries 3` |
| `hoody files backends quatrix create` |  | write | Connect to quatrix backend | `files.backends.createQuatrix` | `hoody files backends quatrix create --api-key <api_key> --description 'My description' --effective-upload-time 4s --host example.com` |
| `hoody files backends s3 create` |  | write | Connect to s3 backend | `files.backends.createS3` | `hoody files backends s3 create --bucket-object-lock-enabled --bypass-governance-retention` |
| `hoody files backends seafile create` |  | write | Connect to seafile backend | `files.backends.createSeafile` | `hoody files backends seafile create --2fa --create-library --url https://cloud.seafile.com/` |
| `hoody files backends sftp create` |  | write | Connect to sftp backend | `files.backends.createSftp` | `hoody files backends sftp create --ask-password --chunk-size 32768 --host example.com --user user` |
| `hoody files backends sharefile create` |  | write | Connect to sharefile backend | `files.backends.createSharefile` | `hoody files backends sharefile create --auth-url https://example.com/auth --chunk-size 67108864` |
| `hoody files backends sia create` |  | write | Connect to sia backend | `files.backends.createSia` | `hoody files backends sia create --api-url https://example.com --description 'My description' --encoding 50436354` |
| `hoody files backends smb create` |  | write | Connect to smb backend | `files.backends.createSmb` | `hoody files backends smb create --case-insensitive --description 'My description' --host example.com` |
| `hoody files backends sugarsync create` |  | write | Connect to sugarsync backend | `files.backends.createSugarsync` | `hoody files backends sugarsync create --description 'My description' --encoding 50397186` |
| `hoody files backends swift create` |  | write | Connect to swift backend | `files.backends.createSwift` | `hoody files backends swift create --auth https://auth.api.rackspacecloud.com/v1.0 --auth-version 0` |
| `hoody files backends test` |  | read | Test backend connection | `files.backends.test` | `hoody files backends test abc-123` |
| `hoody files backends ulozto create` |  | write | Connect to ulozto backend | `files.backends.createUlozto` | `hoody files backends ulozto create --description 'My description' --encoding 50438146` |
| `hoody files backends update` |  | write | Update backend credentials | `files.backends.update` | `hoody files backends update abc-123 --body '{}'` |
| `hoody files backends webdav create` |  | write | Connect to webdav backend | `files.backends.createWebdav` | `hoody files backends webdav create --auth-redirect --description 'My description' --url https://example.com` |
| `hoody files backends yandex create` |  | write | Connect to yandex backend | `files.backends.createYandex` | `hoody files backends yandex create --auth-url https://example.com/auth --client-credentials` |
| `hoody files backends zoho create` |  | write | Connect to zoho backend | `files.backends.createZoho` | `hoody files backends zoho create --auth-url https://example.com/auth --client-credentials` |
| `hoody files chmod` |  | write | Change file permissions | `files.chmod` | `hoody files chmod /home/user/file.txt --chmod 755` |
| `hoody files chown` |  | write | Change file ownership | `files.chown` | `hoody files chown /home/user/file.txt --chown user:group` |
| `hoody files chunks write` |  | write | Append bytes to an existing file (no creation, no offsets); `files upload --append` creates a missing file | `files.writeChunk` | `hoody files chunks write /home/user/file.txt --input ./local-file` |
| `hoody files copy` |  | write | Copy file or directory | `files.copy` | `hoody files copy /home/user/file.txt --copy-to <copy_to> --overwrite true` |
| `hoody files delete` |  | destructive | Delete file or directory | `files.delete` | `hoody files delete /home/user/file.txt -y` |
| `hoody files downloads cancel` |  | action | Cancel a running download | `files.downloads.cancel` | `hoody files downloads cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files downloads create` |  | write | Download a file from a URL into a directory (--owner sets the owner of the new file; the reply is then shorter) | `files.downloads.create` | `hoody files downloads create /home/user/src --download <download_from> --timeout 10 --owner <owner>` |
| `hoody files downloads create` |  | write | Download a file from a URL with an owner for the new file (answers success and message only) | `files.mkdir` | `hoody files downloads create /home/user/src --download <download_from> --timeout 10 --owner <owner>` |
| `hoody files downloads history list` |  | read | Download history | `files.downloads.listHistory` | `hoody files downloads history list` |
| `hoody files downloads list` |  | read | List all active downloads | `files.downloads.list` | `hoody files downloads list` |
| `hoody files downloads list` |  | read | List active downloads of a directory | `files.downloads.listByDirectory` | `hoody files downloads list` |
| `hoody files exists` |  | read | Get file metadata | `files.exists` | `hoody files exists /home/user/file.txt --history` |
| `hoody files extractions cancel` |  | action | Cancel a running extraction | `files.extractions.cancel` | `hoody files extractions cancel 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody files extractions history list` |  | read | Extraction history | `files.extractions.listHistory` | `hoody files extractions history list` |
| `hoody files extractions list` |  | read | List active extractions | `files.extractions.list` | `hoody files extractions list` |
| `hoody files ftp get` |  | read | Access file via FTP | `files.ftp.get` | `hoody files ftp get /home/user/file.txt --type ftp --server ftp.example.com:21 --user anonymous --ftp-secure` |
| `hoody files get` |  | read | List directory or download file | `files.get` | `hoody files get /home/user/file.txt --hash --size 800x600` |
| `hoody files glob` |  | read | Find files by glob pattern | `files.glob` | `hoody files glob /home/user/src --pattern '*.ts' --max-results 1000 --max-depth 50` |
| `hoody files grep` |  | read | Search file contents (grep) | `files.grep` | `hoody files grep /home/user/file.txt --pattern TODO --ignore-case --fixed-string` |
| `hoody files health` |  | read | Service health check | `files.kit.getHealth` | `hoody files health` |
| `hoody files images convert` |  | read | Process and convert images | `files.images.convert` | `hoody files images convert img-abc --format jpeg --size 800x600` |
| `hoody files journal flush` |  | write | Flush journal to disk | `files.journal.flush` | `hoody files journal flush` |
| `hoody files journal list` |  | read | Query journal entries | `files.journal.list` | `hoody files journal list --path /home/user/file.txt --op write,delete` |
| `hoody files journal stats` |  | read | Get journal statistics | `files.journal.getStats` | `hoody files journal stats` |
| `hoody files mkdir` |  | write | Create a directory (--backend creates it on a remote backend, --owner sets its owner) | `files.mkdir` | `hoody files mkdir /home/user/file.txt` |
| `hoody files mounts create` |  | write | Create persistent FUSE mount | `files.mounts.create` | `hoody files mounts create --auto-deliver --backend-id abc-123 --label my-label` |
| `hoody files mounts delete` |  | destructive | Unmount filesystem | `files.mounts.delete` | `hoody files mounts delete abc-123 --uploads keep --wait-seconds 120` |
| `hoody files mounts get` |  | read | Get mount details | `files.mounts.get` | `hoody files mounts get abc-123` |
| `hoody files mounts list` |  | read | List all mounts | `files.mounts.list` | `hoody files mounts list --label my-label` |
| `hoody files mounts update` |  | write | Change a mount's VFS settings or its saved auto-deliver flag (currently has no effect) | `files.mounts.update` | `hoody files mounts update abc-123 --switch wait --auto-deliver` |
| `hoody files move` |  | write | Move file or directory | `files.move` | `hoody files move /home/user/file.txt --move-to <move_to>` |
| `hoody files open` |  | action | Open the Files kit file explorer at a folder in your browser |  | `hoody files open --path /home/user` |
| `hoody files realpath` |  | read | Resolve canonical path (realpath) | `files.realpath` | `hoody files realpath /home/user/file.txt` |
| `hoody files s3 get` |  | read | Access file from S3 | `files.s3.get` | `hoody files s3 get /home/user/file.txt --type s3 --server s3.amazonaws.com --s3-bucket <s3_bucket> --s3-region us-east-1 --user alice` |
| `hoody files search` |  | read | Search directory | `files.search` | `hoody files search /home/user/src --q <q> --theme oc-1 --color-scheme light` |
| `hoody files ssh get` |  | read | Access file via SSH/SFTP | `files.ssh.get` | `hoody files ssh get /home/user/file.txt --type ssh --server nas.local:22 --user alice` |
| `hoody files ssh upload` |  | write | Upload file via SSH/SFTP | `files.ssh.upload` | `hoody files ssh upload /home/user/file.txt --server nas.local:22 --user alice --input ./local-file` |
| `hoody files stat` |  | read | Get file metadata (stat) | `files.stat` | `hoody files stat /home/user/file.txt` |
| `hoody files touch` |  | write | Touch file (create or update mtime) | `files.touch` | `hoody files touch /home/user/file.txt` |
| `hoody files update` |  | write | Modify file properties or move/rename | `files.update` | `hoody files update /home/user/file.txt --body '{"move_to":"/new/dir/file.txt"}'` |
| `hoody files upload` |  | write | Upload or append file | `files.upload` | `hoody files upload /home/user/file.txt --append --x-expected-length 16777216 --input ./local-file` |
| `hoody files uploads delete` |  | destructive | Delete every held file of a pending upload. They are the only copy of those changes; the backend is not touched | `files.uploads.delete` | `hoody files uploads delete abc-123 -y` |
| `hoody files uploads deliver` |  | write | Upload held files of a pending upload to a backend, overwriting newer versions there. Without --paths or --paths-b64, every complete file is delivered | `files.uploads.deliver` | `hoody files uploads deliver abc-123 --paths /home/user/src -y` |
| `hoody files uploads download` |  | read | Write the held copy of one file of a pending upload, byte for byte; save it with --out-file <path>. Name it with exactly one of --path or --path-b64, as listed | `files.uploads.download` | `hoody files uploads download abc-123 --path /home/user/file.txt` |
| `hoody files uploads files list` |  | read | List the files of a pending upload, one page at a time. When more follow, -o json shows next_cursor; pass it to --cursor | `files.uploads.listFiles` | `hoody files uploads files list abc-123 --limit 1000` |
| `hoody files uploads list` |  | read | List pending uploads: unsent upload data held after a crash or stop, or still uploading | `files.uploads.list` | `hoody files uploads list` |
| `hoody files uploads stop` |  | action | Stop the uploads or the delivery of a pending upload and keep its unsent files. Nothing is lost | `files.uploads.stop` | `hoody files uploads stop abc-123` |
| `hoody files uploads unreadable delete` |  | destructive | Delete an unreadable pending-upload record and every file it kept on the server. What it held cannot be known; the backend is not touched | `files.uploads.deleteUnreadable` | `hoody files uploads unreadable delete abc-123 -y` |
| `hoody files uploads unreadable list` |  | read | List the stored records of unsent files that cannot be read. While one exists, a mount or backend delete cannot confirm that nothing was left unsent | `files.uploads.listUnreadable` | `hoody files uploads unreadable list` |
| `hoody files version` |  | read | Get API version | `files.kit.getVersion` | `hoody files version` |
| `hoody files webdav get` |  | read | Access file via WebDAV | `files.webdav.get` | `hoody files webdav get /home/user/file.txt --type webdav --server cloud.nextcloud.com --user alice --webdav-path /` |
| `hoody files whoami` |  | read | Show the user your credentials authenticate as | `files.whoami` | `hoody files whoami /home/user/file.txt` |
| `hoody files zip` |  | read | Download directory as ZIP | `files.zip` | `hoody files zip /home/user/src` |


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

- **To add a note, create a page in a notebook you already have; do not create a notebook for it.** Your default notebook (the `notebookId` from `hoody notes whoami`) and every new notebook come with a `Home` section. A page is `hoody notes nodes create` with `type:"page"`, `parentId:<Home section id>` (from `hoody notes nodes list` with `type:"section"`) and `attributes:{name}`; then write its text with `hoody notes document append`.
- `notebookId` on every notebook-scoped call (identity and notebook list/create take none). Notebook-scoped commands fall back to your default notebook when `--notebook-id` is omitted. Without a Bearer token or export ticket, identity comes from the `?username=` / `?role=` query parameters on each request (default username `user`, default role `owner`). The first request for a username adds that user to the container's single shared default notebook (`Hoody Notes`); every query-identity user joins that same notebook, so it is not private. Use `hoody notes notebooks create` for a separate notebook.
- `hoody notes document append` and `hoody notes nodes create` take `--x-idempotency-key <key>`, so the recommended document-writing path and node creation are retry-safe from the CLI. Most other commands have no idempotency flag; use raw HTTP with an `X-Idempotency-Key` header when you need a retry-safe record create. Notebook create, comment create and version create ignore that header, so retrying those can create duplicates. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `hoody notes document set`/`hoody notes document update`/`hoody notes document append` reject viewers and read-only collaborators with `403`. Documents attach only to `page` and `record` nodes; `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `hoody notes nodes list` `type:"section"` → pick `Home` → `hoody notes nodes create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `hoody notes document append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `hoody notes document set`. Creates the document if absent; pass an idempotency key (`--x-idempotency-key`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `hoody notes whoami` → `{userId,username,role,notebookId}`. The `notebookId` is the container's shared default notebook (`Hoody Notes`, with a `Home` section and starter pages), which every query-identity username joins; create your own with `hoody notes notebooks create` when the content must not be shared. `hoody notes notebooks list`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `hoody notes document set`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `hoody notes document set` OVERWRITES the whole document; `hoody notes document update` merges: top-level keys replace the stored ones, and `content.blocks` merges by block id (each sent block replaces the stored block with that id wholesale, omitted blocks are kept; removing a block takes `hoody notes document set`). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real block `type` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 2.
4. **Database CRUD** — `hoody notes nodes create` `type:"database"`; then `hoody notes records create`/`hoody notes records list`/`hoody notes records search`/`hoody notes records update` (merges `fields`)/`hoody notes records delete`. Page with `page`/`count` on `hoody notes records list` (count max 100).
5. **Collaborators, comments + versions** — before sharing a node with someone new to the notebook, call `hoody notes members invite --users <users>`, check the returned `errors`, and use the created user's `id` as the `collaboratorId` for `hoody notes collaborators add` (`admin`/`editor`/`collaborator`/`viewer`; managing node collaborators needs admin permission): a collaborator who is not yet a member of that notebook is refused with `404 user_not_found`. `hoody notes comments create` (top-level, anchored, or reply); `hoody notes comments update` / `hoody notes comments delete` / `hoody notes comments resolve` accept optional `expectedVersion` for optimistic concurrency. `hoody notes versions create`/`list`/`get`/`hoody notes versions restore`.
6. **TUS upload + download** — the `fileId` is an input, not something the upload returns. First create the file node yourself: `hoody notes nodes create` with `type: 'file'` (without an `id`, the kit gives the node a file id, which ends in `18`, the only shape the upload routes accept; an `id` you pass yourself must be 22 lowercase hex chars + `'18'`), `parentId` (a node where you have editor rights), and `attributes: { subtype: 'image'|'video'|'audio'|'pdf'|'other', name, originalName, mimeType, extension: '' or '.ext', size, version: <22 lowercase hex chars> + '03', status: 0 }`. Only that node's creator can upload to it. Then run the TUS calls on that id. Send `Tus-Resumable: 1.0.0` on every one of them (POST, PATCH, HEAD and DELETE); any other value is refused with `412`. On `…/files/{fileId}/tus`: create the upload with `POST` and `Upload-Length`, send chunks with `PATCH` plus `Upload-Offset` and `Content-Type: application/offset+octet-stream`, check the resume offset with `HEAD`, or cancel with `DELETE`. Download with `hoody notes files download`. The CLI has no TUS commands (`hoody notes files` only lists and downloads), so upload over HTTP.{22}18$/.test(fileId)"]

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — a value the kit cannot repair stores silently but renders blank.** The valid block types are: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. `hoody notes document set` and `hoody notes document update` repair the unambiguous mistakes before validating: known type aliases (`code`, `quote`, `bullet_list_item`, `numbered_list_item`, `h1`, …) become the real type, with flat list items wrapped in a list, and `props` becomes `attrs` when the block has no `attrs`. Other write paths skip this repair, and it leaves anything ambiguous alone (an unknown type, a bare `list_item`). The block schema is loose (`type:z.string()`, `attrs:z.record`), so an unrepaired bad `type`/`props` is accepted with `200` and stored — the block is validated on the way in, but the ORIGINAL object is what gets written, so the junk key persists — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id. `hoody notes document set`/`hoody notes document update` move text found directly on a container with no children into a new child paragraph, but text on a container that already has children is left there and renders empty. See §Examples 0 and 2 for the exact nesting.
- **Prefer `hoody notes document append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types that do not support documents (only `page`/`record` do) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`hoody notes document set` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **A page needs a parent and a `name`: `hoody notes nodes create` with `type:"page"`, `parentId` and `attributes.name`.** The parent is the `Home` section (its id from `hoody notes nodes list` with `type:"section"`) or another page you can edit; in flags: `--type page --parent-id <sectionId> --attributes name=<name>`. With no `parentId` the kit answers `400 parent_required`: add the parent rather than creating a notebook. A `403 forbidden` is a real permission refusal (your role on the parent does not allow the create). The label is `name`; there is no `title` attribute, and a page without `name` fails with `500 unknown`.
- **`hoody notes nodes create` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — attribute validation throws before the create transaction's error handling can map it to a status (an unknown type or a `parentId` that does not exist gives `400`; no `parentId` for a node that needs one gives `400 parent_required`; a parent you cannot edit gives `403`). A section is root-only (a `parentId` gives `400 section_must_be_root`). If `attributes.collaborators` is omitted, the server adds the creator as `admin`; a map you send yourself must name you as `admin`, or the create is a `403` !== 'admin') {"]. For a note, reuse the auto-provisioned `Home` section.
- **`hoody notes notebooks create` always makes a new, separate notebook; it is not how you add a note.** It takes only `name` (plus optional `description`/`avatar`) and no parent: a notebook is top-level. It ignores `X-Idempotency-Key`, and names are not unique, so a retry or a second call with the same name makes a duplicate. Run `hoody notes notebooks list` first and reuse a notebook that has the name; to add a note, create a page in an existing notebook with `hoody notes nodes create`.
- **`hoody notes document set` and `hoody notes document update` take a rich-text document only from a file: `--content @/tmp/content.json`.** The file holds the content object itself, such as `{"type":"rich_text","blocks":{…}}`, without an outer `content` key; its values are sent as written, nested blocks included. `--content KEY=VALUE` sends each value as a plain string, which no document accepts (`set` is refused with `400`, `update` stores an extra key the page never shows). For plain text, `hoody notes document append --body '{"text":"…","type":"paragraph"}'` is simpler.
- **`hoody notes records create` and `hoody notes records update` take typed field values.** Each `--fields` VALUE is JSON, the `{type, value}` object keyed by the field id: `--fields 'f_done={"type":"boolean","value":true}'` (repeat the flag per field), or `--fields @/tmp/fields.json` for the whole fields map. A bare value such as `f_done=true` is not a field value and is refused.
- **Upload an avatar with `hoody --container "$C" notes avatars upload --input /tmp/avatar.jpg`** (or pipe the bytes on stdin). The body is the raw JPEG, PNG or WebP image, and the CLI sets `Content-Type` from the file's bytes; the response carries the avatar id for `--avatar`.
- Authentication re-anchors identity to the `notebookId` in the URL, so one bearer token reaches any notebook the username has joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` (HTTP only; no CLI command) route + WS feed: each mutation type (`hoody notes document update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `hoody notes document set` is a last-writer-wins overwrite of the same store. `hoody notes document update` re-applies its merge to the current document when a concurrent write lands first, so two PATCHes that send different blocks both survive; two that send the same block id are last-writer-wins for that block, and a `hoody notes document set` racing a PATCH still overwrites whatever it omits.
- `hoody notes whoami` with `?username=&role=` does NOT create a per-user notebook: the first request for a username adds that user to the container's single shared default notebook (`Hoody Notes`, seeded with starting content) with the role from that request (default `owner`), and notebook routes then use that stored role. Every query-identity username shares that notebook, so use `hoody notes notebooks create` for private content. The `username`/`role`/`ticket` query parameters are read on every route, although the generated Reference does not list them. Priority Bearer → `ticket` → `?username=&role=`. Only a notes Bearer token (base64url JSON with `userId`, `notebookId`, `username`, `role`) is read: one that decodes to a JSON object but is malformed returns `401` with no fallback, while a JWT, an opaque token or another scheme is ignored and resolution continues with `ticket` or the query identity. An export `ticket` is accepted only on the HTML document export (`GET …/document?output=html`); on any other route it is a `400`. **Without a notes Bearer token, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=<name>` on every unauthenticated call, or attach a valid notes Bearer identity. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes** — content reads still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`. The TUS upload route refuses every method on a readonly notebook, the `HEAD` offset check included.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409. Only routes that implement it honour the header (see Prerequisites); notebook create does not.
- `hoody notes records update` merges `fields`. Database access uses the shared node-access check: it starts from your collaboration on the notebook **root** node (or your notebook role when there is none), returns `403` if an ancestor is a private `section` or a `channel` whose `collaborators` map omits you, and then applies the deepest explicit collaboration on the database's ancestor chain, so a role granted lower in the tree overrides the root one. Notebook owners/admins skip the privacy checks and keep their root-level role. A root collaboration alone is therefore NOT sufficient under such an ancestor, and a write refusal can come from a deeper collaboration. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.{22}18$/.test(fileId)"]
- `hoody notes document get` with `output=html` needs a short-lived export `ticket` (3 uses, 2 minutes) on `GET .../document`. `hoody notes document set` overwrites; `hoody notes document update` merges: top-level keys replace the stored ones, and `content.blocks` (a map by block id, or a list of blocks with distinct ids) merges by block id — a sent block replaces the stored block with that id, every other block is kept, and removing blocks takes a `hoody notes document set`. Any other `blocks` shape is a `400`. `hoody notes comments update` / `hoody notes comments delete` / `hoody notes comments resolve` accept optional `expectedVersion`.
- `hoody notes records search` matches against record names AND field values (not just names).
- Text filter operators in `hoody notes records list --filters <filters>`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). The file node must already exist with a `…18` id (workflow 6). 

## Common errors

- `400 validation_error` for request-schema failures (the only 400 that carries `details[]`); `400 bad_request` for checks inside a handler (no `details`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.{22}18$/.test(fileId)"]
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (a database write needs a collaboration granting you create rights).
- `404 not_found` — node/comment/version missing, or it does not belong to the `notebookId` given in the path. File routes use their own codes: `hoody notes files download` answers `400 file_not_found` for a missing file node or one outside the notebook, `400 file_not_ready` / `400 file_upload_not_found` for an upload that has not finished, and `404 file_not_found` when the stored bytes are missing; the TUS route answers `404 file_not_found` for a missing file node. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK); nested documents and whole attribute maps go through a JSON file passed as `@file.json`. Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The examples send no `?username=`, Bearer token or ticket, so every call runs as the default username `user`; to act as another user, add the same `?username=<name>` to every request (a username that appears on only some calls splits ownership between two users).

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `hoody notes document set` body.** A document is
`{ "content": { "type": "rich_text", "blocks": { "<blockId>": <block> } } }`. Each
block is `{ id, type, parentId, index, content?, attrs? }`:

- `type` is one of the block types listed above. There is **no** `code`,
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
  (`attrs:{highlight}`). Do not write `comment` marks: the editor treats them as legacy
  and strips them from an editable document; anchor a comment with `hoody notes comments create`
  instead. `mention` is an inline NODE
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

**Step 1 — check identity & create notebook.** `hoody notes whoami` returns the caller (`user` here) and the shared default notebook that the first request joined it to. Then `hoody notes notebooks create` for a separate, named notebook owned by that user. To write into the default notebook instead, skip `hoody notes notebooks create` and use the `notebookId` that `hoody notes whoami` returns.

```bash
hoody --container "$C" notes whoami
NBID=$(hoody --container "$C" notes notebooks create \
  --name team-wiki --description 'engineering docs' -o json | jq -r .id)
```

**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `hoody notes nodes create` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(hoody --container "$C" notes nodes list --notebook-id "$NBID" -o json \
  | jq -r '.nodes[] | select(.type=="section") | .id' | head -1)
PAGE=$(hoody --container "$C" notes nodes create --notebook-id "$NBID" \
  --type page --parent-id "$SEC" --attributes name=Runbook -o json | jq -r .id)
```

**Step 3 — append the first content (recommended).** `hoody notes document append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only; containers (lists/tables) need `hoody notes document set` (Example 2).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```bash
# --body takes the raw JSON request body (one block or {"blocks":[...]})
hoody --container "$C" notes document append --notebook-id "$NBID" --node-id "$PAGE" \
  --x-idempotency-key runbook-h1 --body '{"type":"heading1","text":"Runbook"}'
```

### 2. Build a structured document with `hoody notes document set` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`). PUT
repairs the well-known aliases, but a wrong type it cannot map is stored silently and
renders blank (see Quirks). (2) `hoody notes document update` merges
by block id: each sent block replaces the stored block with that id wholesale and
omitted blocks are kept, so it can add or rewrite blocks but never remove one. To
remove blocks, `GET` the current blocks, mutate locally, `PUT` the result back (to
add plain blocks, `hoody notes document append` is simpler).

```bash
PAGE=...
B1=$(openssl rand -hex 12); B2=$(openssl rand -hex 12); B3=$(openssl rand -hex 12)
BL=$(openssl rand -hex 12); LI1=$(openssl rand -hex 12); LI1P=$(openssl rand -hex 12)
LI2=$(openssl rand -hex 12); LI2P=$(openssl rand -hex 12)
# The file holds the content object itself (no outer "content" key).
cat > /tmp/content.json <<EOF
{"type":"rich_text","blocks":{
  "$B1":{"id":"$B1","parentId":"$PAGE","index":"a0","type":"heading1","content":[{"type":"text","text":"Deploy Steps"}]},
  "$B2":{"id":"$B2","parentId":"$PAGE","index":"a1","type":"paragraph","content":[{"type":"text","text":"Run the script below, then verify."}]},
  "$B3":{"id":"$B3","parentId":"$PAGE","index":"a2","type":"codeBlock","attrs":{"language":"bash"},"content":[{"type":"text","text":"./deploy.sh prod"}]},
  "$BL":{"id":"$BL","parentId":"$PAGE","index":"a3","type":"bulletList"},
  "$LI1":{"id":"$LI1","parentId":"$BL","index":"a0","type":"listItem"},
  "$LI1P":{"id":"$LI1P","parentId":"$LI1","index":"a0","type":"paragraph","content":[{"type":"text","text":"Smoke-test /healthz"}]},
  "$LI2":{"id":"$LI2","parentId":"$BL","index":"a1","type":"listItem"},
  "$LI2P":{"id":"$LI2P","parentId":"$LI2","index":"a0","type":"paragraph","content":[{"type":"text","text":"Tag the release"}]}
}}
EOF
hoody --container "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
```

### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

```bash
DOC=$(hoody --container "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json)
echo "$DOC" | jq '.content.blocks | to_entries | map({k:.key,t:.value.type,i:.value.index})'
```

**Step 2 — mutate locally + PUT back.** Select the target block by its id (`B2` / `b2` from example 2) and leave every other block as it is; matching on `type` would also rewrite the paragraphs inside the list items. `index` orders a block among the children of the same parent only, by plain code-unit string comparison. The editor treats it as a fractional index, so give the block a key that sorts before its first sibling and is still a valid key: before `a0` that is `Zz`. An invalid key such as `_a0` is not stored as sent: a full-document PUT re-keys every sibling group that holds one (fresh `a0`, `a1`, … in the current order, so every sibling's `index` changes), and a PATCH that sends a new invalid index is refused with `400`.

```bash
# --content @file takes the content object itself (no outer "content" key)
echo "$DOC" | jq --arg id "$B2" --arg t "Updated intro paragraph (now first)." '
  .content.blocks
  | .[$id].index = "Zz"
  | .[$id].content = [{type:"text",text:$t}]
  | {type:"rich_text",blocks:.}' > /tmp/content.json
hoody --container "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
```

### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

```bash
hoody --container "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json \
  | jq '{type:"rich_text",blocks:(.content.blocks | del(.["'"$B3"'"]))}' > /tmp/content.json
hoody --container "$C" notes document set --notebook-id "$NBID" --node-id "$PAGE" \
  --content @/tmp/content.json
hoody --container "$C" notes document get --notebook-id "$NBID" --node-id "$PAGE" -o json \
  | jq --arg p "$PAGE" '[.content.blocks[] | select(.parentId==$p)] | sort_by(.index) | map(.type)'
```

### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `hoody notes nodes create` for `type:"database"` requires an `attributes.fields` map (`{}` is valid while the database has no columns yet) — without the map the kit returns `500`, because attribute validation throws before the create transaction's error handling can map it to a status — a permission failure would be a `403`. Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
# The database's attributes (name + field definitions) come from a file.
cat > /tmp/db-attrs.json <<'EOF'
{"name":"Tasks","fields":{
  "f_status":{"id":"f_status","type":"text","name":"Status","index":"a0"},
  "f_priority":{"id":"f_priority","type":"number","name":"Priority","index":"a1"},
  "f_done":{"id":"f_done","type":"boolean","name":"Done","index":"a2"}
}}
EOF
DBID=$(hoody --container "$C" notes nodes create --notebook-id "$NBID" \
  --type database --parent-id "$SEC" --attributes @/tmp/db-attrs.json -o json | jq -r .id)

# Each --fields VALUE is the typed {type, value} JSON for that field id.
for i in 1 2 3; do
  hoody --container "$C" notes records create --notebook-id "$NBID" --database-id "$DBID" \
    --name "Task $i" \
    --fields 'f_status={"type":"text","value":"todo"}' \
    --fields "f_priority={\"type\":\"number\",\"value\":$i}" \
    --fields 'f_done={"type":"boolean","value":false}' >/dev/null
done
```

### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. ⚠ `filters` MUST be a **JSON array** (not an object) of `{ id, type:"field", fieldId, operator, value }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array).

```bash
hoody --container "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" \
  --filters '[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]' \
  --sorts '[{"id":"s1","fieldId":"f_priority","direction":"desc"}]' \
  --count 50 -o json | jq '.records[] | {n:.name,p:.fields.f_priority.value}'
```

A simpler full-text alternative is `hoody notes records search --q ...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `hoody notes records update` PATCH MERGES `fields` (sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

```bash
RID=$(hoody --container "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" --count 50 -o json \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
hoody --container "$C" notes records update --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID" \
  --fields 'f_status={"type":"text","value":"done"}' \
  --fields 'f_done={"type":"boolean","value":true}' -o json | jq '.fields'
```

### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `hoody notes records create` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). 

```bash
cat > /tmp/tasks.csv <<EOF
name,priority,status
Migrate DB,2,todo
Update docs,3,todo
Wire CI,1,in-progress
EOF
# `records create` has no idempotency flag, so a rerun adds every row again;
# for a retry-safe import, send X-Idempotency-Key over HTTP instead.
tail -n +2 /tmp/tasks.csv | while IFS=, read -r name pri stat; do
  hoody --container "$C" notes records create --notebook-id "$NBID" --database-id "$DBID" \
    --name "$name" \
    --fields "f_priority=$(jq -nc --argjson p "$pri" '{type:"number",value:$p}')" \
    --fields "f_status=$(jq -nc --arg s "$stat" '{type:"text",value:$s}')" \
    --fields 'f_done={"type":"boolean","value":false}' >/dev/null
done
```

### 9. Export a page to HTML — short-lived ticket flow

**Goal:** publish a static HTML snapshot of a page. `hoody notes document get` with `output=html` requires a short-lived export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Each ticket allows 3 uses and expires after 2 minutes. Anyone with the kit URL + ticket can download until it expires.

**Step 1 — create a ticket.**

```bash
TICKET=$(hoody --container "$C" notes document tickets create --notebook-id "$NBID" --node-id "$PAGE" \
  --theme-mode light --include-comments appendix -o json | jq -r .ticket)   # output defaults to html
```

**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
# global -o raw writes the body as-is; the command's own --output picks the export format
hoody --container "$C" -o raw notes document get --notebook-id "$NBID" --node-id "$PAGE" \
  --output html --ticket "$TICKET" > /tmp/page.html
```

### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (one DELETE on the section empties the notebook). Then `hoody notes notebooks delete` removes the notebook itself.

`hoody notes notebooks delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `hoody notes notebooks list` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
hoody --container "$C" notes records list --notebook-id "$NBID" --database-id "$DBID" -o json \
  | jq -r '.records[].id' | while read RID; do
      hoody --container "$C" notes records delete --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID"
    done
hoody --container "$C" notes nodes delete --notebook-id "$NBID" --node-id "$DBID"
hoody --container "$C" notes nodes delete --notebook-id "$NBID" --node-id "$SEC"
# rename only if the delete failed (a deleted notebook is Inactive and rejects updates)
hoody --container "$C" notes notebooks delete --notebook-id "$NBID" \
  || hoody --container "$C" notes notebooks update --notebook-id "$NBID" --name team-wiki-DELETED
```

## Reference

### `hoody notes` (54) — Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notes avatars download` |  | read | Download an avatar image by id | `notes.avatars.download` | `hoody notes avatars download --avatar-id abc-123` |
| `hoody notes avatars upload` |  | write | Upload an avatar image and get its id (JPEG, PNG or WebP; resized to 500x500) | `notes.avatars.upload` | `hoody notes avatars upload --input ./local-file` |
| `hoody notes collaborators add` |  | write | Add a collaborator to a node | `notes.collaborators.add` | `hoody notes collaborators add --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes collaborators list` |  | read | List collaborators on a node | `notes.collaborators.list` | `hoody notes collaborators list --notebook-id abc-123 --node-id 1` |
| `hoody notes collaborators remove` |  | destructive | Remove a collaborator from a node | `notes.collaborators.remove` | `hoody notes collaborators remove --notebook-id abc-123 --node-id 1 --collaborator-id abc-123` |
| `hoody notes collaborators role set` |  | write | Update a collaborator's role on a node | `notes.collaborators.setRole` | `hoody notes collaborators role set --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes comments anchor set` |  | write | Move a comment thread to a new anchor in the document | `notes.comments.setAnchor` | `hoody notes comments anchor set --notebook-id abc-123 --node-id 1 --comment-id abc-123 --anchor-type document --expected-version 10` |
| `hoody notes comments anchors list` |  | read | List comment anchors (the inline document positions threads are pinned to) | `notes.comments.listAnchors` | `hoody notes comments anchors list --limit 500 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments create` |  | write | Create a new comment (optionally anchored to a document location) | `notes.comments.create` | `hoody notes comments create --notebook-id abc-123 --node-id 1 --content Hello` |
| `hoody notes comments delete` |  | destructive | Delete a comment | `notes.comments.delete` | `hoody notes comments delete --expected-version 10 --notebook-id abc-123 --node-id 1 --comment-id abc-123` |
| `hoody notes comments list` |  | read | List comments on a node | `notes.comments.list` | `hoody notes comments list --limit 100 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes comments resolve` |  | action | Mark a comment thread resolved | `notes.comments.resolve` | `hoody notes comments resolve --notebook-id abc-123 --node-id 1 --comment-id abc-123 --expected-version 10` |
| `hoody notes comments update` |  | write | Edit a comment's body | `notes.comments.update` | `hoody notes comments update --notebook-id abc-123 --node-id 1 --comment-id abc-123 --content Hello --expected-version 10` |
| `hoody notes document append` |  | write | Append blocks to the end of a node's document (creates the document if absent) | `notes.document.append` | `hoody notes document append --notebook-id abc-123 --node-id 1 --body '{"text":"Hello"}'` |
| `hoody notes document blocks export` |  | read | Render a drawing block from a node's document as SVG | `notes.document.exportBlock` | `hoody notes document blocks export --scale 10 --notebook-id abc-123 --node-id 1 --block-id abc-123` |
| `hoody notes document get` |  | read | Get document content for a node (rich-text body) | `notes.document.get` | `hoody notes document get --lines 100 --output json --notebook-id abc-123 --node-id 1` |
| `hoody notes document set` |  | write | Create or replace a node's document content (full overwrite) | `notes.document.set` | `hoody notes document set --notebook-id abc-123 --node-id 1 --content key=hello` |
| `hoody notes document tickets create` |  | action | Mint a single-use ticket for an HTML export of a node's document | `notes.document.createExportTicket` | `hoody notes document tickets create --notebook-id abc-123 --node-id 1 --include-comments none --include-background` |
| `hoody notes document update` |  | write | Merge changes into a node's document content | `notes.document.update` | `hoody notes document update --notebook-id abc-123 --node-id 1 --content key=hello` |
| `hoody notes files download` |  | read | Download a file attachment by id | `notes.files.download` | `hoody notes files download --notebook-id abc-123 --file-id abc-123` |
| `hoody notes files list` |  | read | List file attachments in a notebook | `notes.files.list` | `hoody notes files list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes health` |  | read | Show Notes service health and runtime info | `notes.kit.getHealth` | `hoody notes health` |
| `hoody notes members invite` |  | write | Invite users to a notebook by username and assign their role | `notes.members.invite` | `hoody notes members invite --notebook-id abc-123 --users username=alice,role=owner` |
| `hoody notes members role set` |  | write | Update a user's role on a notebook (owner/admin/collaborator/guest/none) | `notes.members.setRole` | `hoody notes members role set --notebook-id abc-123 --user-id abc-123 --role owner` |
| `hoody notes nodes children list` |  | read | List immediate child nodes of a node | `notes.nodes.listChildren` | `hoody notes nodes children list --limit 50 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes create` |  | write | Create a node inside a notebook (type: page/folder/database/etc.) | `notes.nodes.create` | `hoody notes nodes create --notebook-id abc-123 --type <type> --attributes key=hello` |
| `hoody notes nodes delete` |  | destructive | Delete a node and its descendants | `notes.nodes.delete` | `hoody notes nodes delete --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes get` |  | read | Get a node by id | `notes.nodes.get` | `hoody notes nodes get --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes list` |  | read | List nodes in a notebook (pages, folders, databases) | `notes.nodes.list` | `hoody notes nodes list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes nodes mark opened` |  | action | Record that the current user has opened a node | `notes.nodes.markOpened` | `hoody notes nodes mark opened --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes mark seen` |  | action | Record that the current user has seen a node | `notes.nodes.markSeen` | `hoody notes nodes mark seen --notebook-id abc-123 --node-id 1` |
| `hoody notes nodes resolve` |  | read | Resolve a page-style node by its URL alias (slug) | `notes.nodes.resolve` | `hoody notes nodes resolve --notebook-id abc-123 --alias my-resource` |
| `hoody notes nodes update` |  | write | Update a node (rename, move, change attributes) | `notes.nodes.update` | `hoody notes nodes update --notebook-id abc-123 --node-id 1 --attributes key=hello` |
| `hoody notes notebooks create` |  | write | Create a new notebook (top-level workspace) | `notes.notebooks.create` | `hoody notes notebooks create --name my-resource --description 'My description' --avatar https://example.com/avatar.png` |
| `hoody notes notebooks delete` |  | destructive | Delete a notebook (irreversible — deletes all nodes/documents/comments inside) | `notes.notebooks.delete` | `hoody notes notebooks delete --notebook-id abc-123` |
| `hoody notes notebooks get` |  | read | Get notebook details | `notes.notebooks.get` | `hoody notes notebooks get --notebook-id abc-123` |
| `hoody notes notebooks list` |  | read | List notebooks the current user has access to | `notes.notebooks.list` | `hoody notes notebooks list` |
| `hoody notes notebooks update` |  | write | Update notebook settings (name, description, avatar) | `notes.notebooks.update` | `hoody notes notebooks update --notebook-id abc-123 --name my-resource --description 'My description' --avatar https://example.com/avatar.png` |
| `hoody notes open` |  | action | Open the Notes kit in your browser |  | `hoody notes open` |
| `hoody notes reactions add` |  | write | Add an emoji reaction to a node | `notes.reactions.add` | `hoody notes reactions add --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes reactions list` |  | read | List reactions on a node | `notes.reactions.list` | `hoody notes reactions list --notebook-id abc-123 --node-id 1` |
| `hoody notes reactions remove` |  | destructive | Remove an emoji reaction from a node | `notes.reactions.remove` | `hoody notes reactions remove --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes records create` |  | write | Create a new record in a database node | `notes.records.create` | `hoody notes records create --notebook-id abc-123 --database-id abc-123 --name Untitled --avatar https://example.com/avatar.png` |
| `hoody notes records delete` |  | destructive | Delete a database record | `notes.records.delete` | `hoody notes records delete --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records get` |  | read | Get a database record by id | `notes.records.get` | `hoody notes records get --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes records list` |  | read | List records in a database node | `notes.records.list` | `hoody notes records list --page 1 --count 50 --notebook-id abc-123 --database-id abc-123` |
| `hoody notes records search` |  | read | Search records in a database node | `notes.records.search` | `hoody notes records search --exclude '*.ts' --notebook-id abc-123 --database-id abc-123` |
| `hoody notes records update` |  | write | Update a database record's fields | `notes.records.update` | `hoody notes records update --notebook-id abc-123 --database-id abc-123 --record-id abc-123 --name my-resource --avatar https://example.com/avatar.png` |
| `hoody notes versions create` |  | write | Create a new document version snapshot (point-in-time backup) | `notes.versions.create` | `hoody notes versions create --notebook-id abc-123 --node-id 1` |
| `hoody notes versions delete` |  | destructive | Delete a document version snapshot | `notes.versions.delete` | `hoody notes versions delete --notebook-id abc-123 --node-id 1 --version-id abc-123 -y` |
| `hoody notes versions get` |  | read | Get a specific document version's content | `notes.versions.get` | `hoody notes versions get --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes versions list` |  | read | List document version snapshots for a node | `notes.versions.list` | `hoody notes versions list --limit 20 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes versions restore` |  | action | Restore a document to a previous version (replaces current content) | `notes.versions.restore` | `hoody notes versions restore --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes whoami` |  | read | Get current Notes identity (user id, username, role, default notebook id) | `notes.whoami` | `hoody notes whoami` |


---

<!-- ===== namespace: notifications ===== -->

# `notifications` — Trigger and consume desktop notifications inside a container

## Purpose

Two jobs in one namespace. First and most useful: **remotely inform the human operator** — an agent fires a notification from inside a container and it pops on the user's phone, desktop, or smartwatch even when they're away from the session. Second: drive and read the container's own desktop (`notify-send`) toasts on an X display. The user opens the kit's web page once (see § Capability URL), grants browser-notification permission, and leaves it backgrounded; from then on the page shows the notifications it receives over its live connection as real OS notifications. Delivery to the page is best-effort (bursts, connection gaps and browser limits can drop an alert), while recorded entries can also be read back over the HTTP API, subject to the configured retention (TTL), dismissals, and the history files still being there.

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

- A valid target display number. With display-ensure enabled (the default) the kit brings the display up itself before sending; dispatch still needs a usable D-Bus session on it.
- Required: `display`+`summary` on `hoody notifications send`; `display` on `hoody notifications list`; `displays` on the SSE stream (optional over WebSocket, where you can `subscribe` after connecting).

## Capability URL

Kit slug is `n` (the proxy also accepts `notifications` and `notification` as hostname aliases): `https://{P}-{C}-n-1.{N}.containers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all` in any browser and it requests notification permission, then turns each entry it receives over its SSE stream into a real OS notification (works backgrounded; the stream reconnects on its own; there is no polling fallback, so an alert that arrives during a gap is not shown). The hostname itself is the credential, so no token or header goes in the URL — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `hoody containers get`. → See `SKILL-CLI.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`hoody notifications send` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. CLI: `hoody notifications send --display 2 --summary "Build done"`. `display` is a number from 1 through 40000, optionally `:`-prefixed: display 0 returns `400 Validation Error` with `details: "Display 0 does not exist; display IDs start at 1."`, and a number above 40000 is a `400` too. With display-ensure enabled (the default) the kit tries to start a valid target display.

### 2. Read recent notifications

`hoody notifications list` — `display`: `":0"`, `"0"`, `"0,:1,2"`, or `"all"`. Optional `--limit N` (caps the total items returned, at most 10,000; each request carries up to 1000, and without `--limit` the CLI walks all pages), `since` (ms, inclusive), `after_id` (exclusive id), `cursor`, `username`, `session`. Without `since`/`after_id`/`cursor` one call returns the newest `limit` entries, listed newest-first. With `since` the page holds the OLDEST `limit` entries at or after that timestamp, with `after_id` the OLDEST `limit` ids above it, and with `cursor` the OLDEST `limit` entries after it; these forward pages are listed oldest-first, in the order they were selected, so consecutive pages join into one ascending list. Each response carries an opaque `next_cursor` and `has_more`: pass `next_cursor` back as `cursor` while `has_more` is `true` to page forward (`has_more` is always `false` on a plain newest page). `cursor` cannot be combined with `since` or `after_id` (`400`). `count` is the size of that page, not a total. There is no reverse cursor; to walk the whole retained history, start at `since=0` and page forward. The CLI takes it as `--cursor <next_cursor>` (omit `--since` and `--after-id` beside it); one cursor continues a listing of one display or of several; see Example 8.

### 3. Subscribe to events

`hoody notifications stream` — `displays`: `"all"`, `"*"`, or a comma list of 1–5-digit IDs (each may carry a leading `:`). WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`, and `resync` when the subscriber fell behind; WS sends `resync` too). `displays` is required for SSE; a WS connection without it receives nothing until it subscribes. Over WS the kit sends, once per heartbeat interval (default 30 s), a protocol Ping plus the same JSON `heartbeat` message (`{"type":"heartbeat","timestamp":…}`). WS clients send `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`hoody notifications list` → int `id`s → `hoody notifications dismiss` POST `{"notificationIds":[<int>,…],"displayId":":0"}`. `hoody notifications restore` DELETE with a `displayId` restores that display's dismissals only; without `displayId` it clears every dismissal, global and display-scoped alike. CLI: `hoody notifications dismiss --display-id 1 --notification-ids 12,13`.

### 5. Fetch an icon

`hoody notifications list` → pick an entry with `has_icon: true` → take the last path segment of its `icon_url` as `iconId` → `hoody notifications icons get`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL), grant browser-notification permission, and leave the tab backgrounded. Agent side: `hoody notifications send` with a `display` (1 through 40000, not 0 — the kit auto-ensures a valid display, so you do NOT have to set up X first), a `summary`, and optional `body`/`urgency`. The kit records the entry and broadcasts it on its stream; the operator's page renders it as an OS notification. Full copy-paste recipe in Example 11.

## Quirks & gotchas

- Kit slug is `n`; the proxy also accepts `notifications` and `notification` as hostname aliases, but use `n`.
- `dismiss.notificationIds` must be a non-empty array; non-integer elements are silently dropped, and only when no integer remains does it return `400 "notificationIds must contain valid integer IDs"` (so `[12,"13"]` dismisses only `12`). `displayId` strips leading `:`.
- `hoody notifications send` limits: `summary` ≤200 and `body` ≤1000 by default (a deployment can change them with `NOTIFY_SEND_MAX_SUMMARY_LENGTH` / `NOTIFY_SEND_MAX_BODY_LENGTH`), `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`; `display` 1–40000 (display 0 and higher numbers are a `400`).
- `list.display` numeric or `"all"`; `connect.displays` accepts `all`, `*`, or a comma list of 1–5-digit IDs, each optionally `:`-prefixed (`1000` and `20001` are valid; 6+ digits rejected).
- `--limit N` caps the total items returned (CLI ceiling 10,000; requests carry at most 1000 items); forward start points `since`/`after_id`, continuation `cursor` (a `next_cursor` value; not combinable with `since`/`after_id`); `username`/`session` 1–100 ASCII alnum.
- `username`/`session` are owner filters, with specific displays and with `all`: only history files named for that owner are read (`<username>-<session>-notifications.json`, `<username>-display-<N>-notifications.json`), so the generic `display-<N>`/`user-<N>` history is excluded. A `session` filter also excludes the `<username>-display-<N>` files, which carry no session. The display selection still filters the rows read.
- Dismissal scope on `hoody notifications list`: every returned row is checked against the global dismissals and against its own display's scoped dismissals, for one display, a multi-display list (`2,3`) and `all` alike. A dismissal scoped to `:2` hides that id on `:2` everywhere it is listed; the same id on `:3` stays visible. `hoody notifications restore` without `displayId` clears every scope (global and all displays); with one it clears only that display.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s JSON heartbeat. WS: per-IP caps, origin allow-list, every 30 s by default a protocol Ping plus the same JSON `heartbeat` message, drops after 2 missed pongs.
- `hoody notifications restore`=DELETE, `hoody notifications dismiss`=POST, same path.
- The live stream is best-effort, not a delivery log: on each history-file change the kit compares the file with its previous snapshot and broadcasts every new or changed row (oldest first), but a subscriber that lags behind the broadcast skips the missed entries without replay. The kit says when that happens: both SSE and WebSocket send `{"type":"resync","skipped":<n>,"timestamp":<ms>}` in place of the skipped entries. To catch up, page `hoody notifications list` forward from your last position and keep going while `has_more` is `true` (Example 8): with `cursor`, `since` or `after_id` each page holds the OLDEST matching rows past that point, so nothing is skipped between pages.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-container kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `hoody inbox *` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated — and its credential rules are NOT the kit's: reading requires the auth token to hold `resources.read_account` (403 without it), and BOTH acknowledge routes refuse every auth token outright, needing a first-party account login.
- The CLI maps the `notifications` namespace to the kit slug `n`, so `hoody --container <C> notifications {list|dismiss|restore|send|icons get|stream}` reaches `https://{P}-{C}-n-1.{N}.containers.hoody.com/api/v1/notifications/...`.
- `hoody --container "$C" notifications stream --displays all` prints SSE events as they arrive. It reads one connection and does not reconnect when it ends, so rerun it (and page `list` forward from your last position) after a drop.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias): it subscribes to every display over SSE (EventSource, which reconnects on its own) and raises a browser `Notification` per entry it receives. It has no polling fallback: recent history is reloaded on every stream open (reconnects included) and on a `resync` event, but history rows only update the activity list and never raise a native alert, so an alert that arrives while the stream is down is not shown. The `?displays=all` suffix in the handed-out URL is harmless; the page always subscribes to all displays. This is the supported path for delivering an agent's notifications to a human's device; no token goes in the URL (the hostname is the capability).
- `hoody notifications send` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit brings the target display up itself before calling `notify-send` (waiting up to the display-ensure timeout, default 30 s; results are cached 60 s), so firing to e.g. `:1` works on demand. If no D-Bus session can be found for the display yet, it returns `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, a `Retry-After` header and `details: "The display's notification session is not available yet. Retry in a few seconds."`; when no display is running and none can be started it returns `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`.

## Common errors

- Invalid input on `hoody notifications send` (including text the dispatcher's sanitizer rejects) → `400` `error: "Validation Error"` with the reason in `details`. A failed dispatch carries a fixed `code` and one fixed `details` sentence: no display running and none can be started → `503` `error: "Display not available"`, `code: "DISPLAY_NOT_AVAILABLE"`; the display's notification session not up yet → `503` `error: "Display not ready"`, `code: "DISPLAY_NOT_READY"`, with `Retry-After` and `details: "The display's notification session is not available yet. Retry in a few seconds."`; a timeout ("Sending the notification timed out. Retry later.") or any other failure ("The notification service failed to send the notification.") → `500` `error: "Notification dispatch failed"`, `code: "DISPATCH_FAILED"`.
- WS origin-deny → `403` `Origin not allowed` before the upgrade; close `1008` on message rate limit; `1001` heartbeat timeout. `429` on `send` / `hoody notifications icons get`; both are enforced by the shared per-IP rate-limit middleware.
- `GET /api/v1/notifications/health` returning 200 does not establish that authorised endpoints are reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Use the canonical kit slug `n` in URLs; the proxy also accepts `notifications` and `notification` as hostname aliases. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, and tag your test traffic with a distinctive `category` like `sdk-doc-*` so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. ⚠ Use a display from 1 through 40000: display `:0` does not exist and returns `400 Validation Error` (`details: "Display 0 does not exist; display IDs start at 1."`). A valid display whose notification session is not up yet returns `503` `DISPLAY_NOT_READY` with `Retry-After`; resend after that wait.

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
hoody --container "$C" notifications send \
  --display 2 --summary 'Build done' --body 'v1.4.2 deployed' \
  --urgency normal --category sdk-doc-build
```

**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-build")'   # CLI -o json strips only the TRANSPORT wrapper; the kit envelope survives → .data.notifications
```

### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the container. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and ids are not guaranteed unique across displays (each display's history file numbers its own entries; `:2` and `:3` were each observed with `id=1`, `id=2`…).

```bash
for D in 2 3; do
  hoody --container "$C" notifications send \
    --display "$D" --summary 'Maintenance in 5m' \
    --urgency critical --category sdk-doc-fanout
done
hoody --container "$C" notifications list 2,3 --limit 20 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-fanout") | {id, display_id}'
```

### 3. Subscribe to the live SSE stream and react to new notifications

**Goal:** keep a long-lived consumer that reacts to new notifications as they arrive. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. SSE frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry), `resync` (when the subscriber fell behind). The stream is best-effort: a slow consumer skips what it lagged behind, with no replay, but both transports then send `{"type":"resync","skipped":<n>,"timestamp":<ms>}`. On a `resync`, page `hoody notifications list` forward from the last position you processed (Example 8) to recover the skipped entries. 

```bash
# Follow the stream in one shell: events print as they arrive. One connection,
# no automatic reconnect: rerun it after a drop.
hoody --container "$C" notifications stream --displays all

# In another shell, fire something:
hoody --container "$C" notifications send --display 2 \
  --summary 'hello-stream' --category 'sdk-doc-stream'
```

### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. ⚠ Send `notificationIds` as **integers** — non-integer elements are dropped, and an array with no integer left returns `400 "notificationIds must contain valid integer IDs"`. ⚠ Scoped dismiss (with `displayId`) hides those ids on display `:2` only: the rows disappear from `GET /2`, `GET /2,3` and `GET /all` alike, while entries on `:3` that share an id stay visible. To hide an id on every display, omit `displayId` (see example 5).

```bash
IDS=$(hoody --container "$C" notifications list 2 --limit 50 -o json \
  | jq -r '.data.notifications[].id' | paste -sd, -)
if [ -n "$IDS" ]; then   # an empty list is refused
  hoody --container "$C" notifications dismiss \
    --display-id 2 --notification-ids "$IDS"
fi
```

### 5. Restore everything you just dismissed

**Goal:** undo Example 4, bring dismissed items back into the listing. `hoody notifications restore` is `DELETE /dismiss` (same path as POST `hoody notifications dismiss`). With `displayId: "2"` it clears every dismissal scoped to display 2, including dismissals made before Example 4; global dismissals and other displays' scoped dismissals remain. Omitting `displayId` clears every dismissal, global and on every display.

```bash
hoody --container "$C" notifications restore --display-id 2   # display 2 scope
hoody --container "$C" notifications restore                  # every scope
```

### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); an unsupported extension or path traversal returns `400` with `error: "Validation Error"` and `details: "Icon ID is invalid or has an unsupported extension."`, an icon that cannot be opened returns `400 "Icon not found"`, and a read failure after opening it returns `500 "Internal server error while serving icon"`. The route has no 404 path at all — a missing icon is a `400`.

```bash
ICON=$(hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
hoody --container "$C" notifications icons get "$ICON" --out-file "/tmp/$ICON"
```

### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me what is new on display `:2` since a known point, with a position to continue from." `since` is **Unix milliseconds** (inclusive), `after_id` the exclusive integer id. With either, the page holds the OLDEST `limit` matches, listed oldest-first, and `data.has_more` says whether more follow `data.next_cursor`. `display_id` comes back as either a number or a string depending on the entry source, so compare it loosely; the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --container "$C" notifications list 2 \
  --limit 100 --since "$SINCE_MS" --after-id 10 -o json \
  | jq '.data | {count, has_more, last_id: ([.notifications[].id] | max)}'
```

### 8. Catch up page by page without gaps

**Goal:** poll for what arrived since your last read, without re-reading or skipping anything. A plain listing returns the newest `limit` entries (its `has_more` is always `false`), and its `data.next_cursor` marks the newest row. Pass that value back as `cursor` and the kit returns the OLDEST `limit` rows after it, with a fresh `next_cursor` and `has_more: true` while more rows wait. Loop until `has_more` is `false`, keep the last `next_cursor`, and start the next poll from it (an empty page echoes your cursor back). Rows are ordered by (timestamp, display, id), so one cursor covers `all` or `2,3`. `cursor` cannot be combined with `since` or `after_id` (`400`). To walk the whole retained history, start with `since=0` instead of a plain listing. There is no reverse cursor.

The CLI takes the cursor as `--cursor <next_cursor>`.

`hoody notifications list` walks every page itself and, when an unfiltered walk finishes at a page boundary, keeps the last page's `data.next_cursor` in its output: save it and pass it as `--cursor` on the next poll. The cursor is `null` when the result was cut within a page or filtered. The HTTP loop below is another way to keep the cursor yourself:

```bash
KIT="https://${P}-${C}-n-1.${N}.containers.hoody.com"
# First read: the newest page. Keep its next_cursor (null only when nothing is listed).
CUR=$(curl -sf "$KIT/api/v1/notifications/all?limit=50" | jq -r '.data.next_cursor // empty')
# Each poll: follow next_cursor while has_more; every page is the OLDEST rows past the cursor.
while :; do
  if [ -n "$CUR" ]; then
    PAGE=$(curl -sfG "$KIT/api/v1/notifications/all" --data-urlencode "cursor=$CUR" --data-urlencode "limit=1000")
  else
    PAGE=$(curl -sfG "$KIT/api/v1/notifications/all" --data-urlencode "since=0" --data-urlencode "limit=1000")
  fi
  echo "$PAGE" | jq -c '.data.notifications[]'   # handle the rows (oldest first)
  CUR=$(echo "$PAGE" | jq -r '.data.next_cursor // empty')
  [ "$(echo "$PAGE" | jq -r '.data.has_more')" = true ] || break
done
```

### 9. Read a user or session history file for one display

**Goal:** include the per-user history files the kit keeps next to the display files. `username` and `session` are owner filters: the kit reads only the history files named for that owner, for specific displays and for `display=all` alike, and leaves out the generic display history. For display `2`, `username=alex` reads `alex-display-2-notifications.json` and every `alex-<session>-notifications.json`; `username=alex&session=sessabc` reads only `alex-sessabc-notifications.json` (the `alex-display-<N>` files carry no session, so a session filter excludes them). The display selection still filters the rows, so only display `2` entries from those files come back. Both values must be ASCII alnum, 1–100 chars; hyphens and underscores are rejected with `400` (e.g. `sess-abc` fails validation). A file that does not exist is skipped without an error.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --container "$C" notifications list 2 \
  --limit 200 --since "$SINCE_MS" \
  --username alex --session sessabc -o json
```

### 10. Survive a 429 rate-limit burst on `hoody notifications send`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. The kit per-IP rate-limits both `hoody notifications send` and `hoody notifications icons get`. Strategy: cap concurrency client-side, exponential-backoff on `429`, and never retry on `400` (validation — fix the body instead). A `503` with `code: "DISPLAY_NOT_READY"` means the display's notification session is not up yet: wait for its `Retry-After` and resend. A `503` with `code: "DISPLAY_NOT_AVAILABLE"` means the target display is not running and the container has no display server to start it: use a container image with display support, because retrying the same call does not help. A `500` (`code: "DISPATCH_FAILED"`) is a failed or timed-out send; its `details` says which.

```bash
# By default the CLI retries a send only when it was never dispatched, never on a 429.
# Resend the SAME alert with bounded backoff,
# but only on 429; any other error, or a 429 on the last try, stops with a nonzero exit.
for i in $(seq 1 50); do
  delay=1; sent=0
  for try in 1 2 3 4 5; do
    if err=$(hoody --container "$C" notifications send \
      --display 2 --summary "burst-$i" --category sdk-doc-burst 2>&1 >/dev/null); then sent=1; break; fi
    case "$err" in *'Error [429'*) [ "$try" -lt 5 ] && { sleep "$delay"; delay=$((delay*2)); } ;; *) break ;; esac
  done
  [ "$sent" = 1 ] || { echo "alert burst-$i not delivered: $err" >&2; exit 1; }
done
```

### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to whatever device they left the page open on. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser, click "Allow" when prompted, and leave the tab in the background (phone, desktop, or a browser that mirrors notifications to a smartwatch). `{P}`/`{C}`/`{N}` come from `hoody containers get`; `?displays=all` catches notifications fired on any display:

```
https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all
```

The page asks for notification permission on first load (with an Enable button when the browser needs a click first) and its stream reconnects on its own. Delivery is best-effort: there is no polling fallback, so an alert fired while the connection is down is not shown. When an alert must not be missed, the agent should also check the `hoody notifications list` history. No token goes in the URL — the hostname is the credential.

**Agent side** — fire the alert. Any display from 1 through 40000 works (display 0 is a `400`); the kit auto-ensures it, so you don't need to set up X first.

```bash
hoody --container "$C" notifications send \
  --display 1 --summary 'Build finished' \
  --body 'v1.4.2 is deployed — review when you can' --urgency normal
```

## Reference

### `hoody notifications` (9) — Notifications

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notifications dismiss` |  | write | Dismiss notifications | `notifications.dismiss` | `hoody notifications dismiss --display-id 1 --notification-ids 10` |
| `hoody notifications health` |  | read | Service health check | `notifications.kit.getHealth` | `hoody notifications health` |
| `hoody notifications icons get` |  | read | Get notification icon | `notifications.icons.get` | `hoody notifications icons get 6_10_1749024932903.png --if-none-match 'W/"1a2b-5f3c"'` |
| `hoody notifications list` |  | read | Get notifications for specified display(s) | `notifications.list` | `hoody notifications list 1 --limit 100 --since 1672531200000` |
| `hoody notifications metrics` |  | read | Prometheus-compatible metrics endpoint | `notifications.kit.getMetrics` | `hoody notifications metrics` |
| `hoody notifications open` |  | action | Open the Notifications kit service in your browser |  | `hoody notifications open` |
| `hoody notifications restore` |  | destructive | Clear dismissed notifications | `notifications.restore` | `hoody notifications restore --display-id 1` |
| `hoody notifications send` |  | write | Trigger a new desktop notification | `notifications.send` | `hoody notifications send --body 'This is a test message from the API.' --category test-api --display 1 --summary 'Test Notification'` |
| `hoody notifications stream` |  | read | Follow new notifications as they arrive (Server-Sent Events) | `notifications.connect` | `hoody notifications stream --displays all` |


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
- Browser send page `/` (file, text or pasted image; receive link + QR), no-JS form `/noscript`.

## When NOT to use

Persist → `files`, HTTP client → `curl`, shell → `terminal`; no replay/queue (no storage).

## Prerequisites

- All peers share kit URL, `{path}`, `n`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

The `hoody pipe` CLI has its own subcommands beyond the Reference table: `send`, `receive`, `share`, `progress stream`, `status`, `metrics`, `url get`, `forward`, `connect`, `health`, `cheatsheet get`. Every one sends the configured kit credential (`--kit-auth password` with `--kit-user` and HOODY_KIT_PASSWORD, else `--kit-token`, under `--kit-token-header` when set), on HTTP requests and WebSocket upgrades alike.

`send` exits 0 only when the kit confirms the transfer with `[INFO] Transfer complete.` (with `--live`, `[INFO] Live stream ended (peak N viewers).`). The kit answers a sender 200 as soon as it takes the upload, so a later failure arrives only as a status line. An `[ERROR]` line (for example `Timed out waiting for receivers.`), every receiver leaving, or a response that ends without either line prints `Error: <the kit's text>` and exits 1. With `--json`, stderr gets `{"kind":"complete","status":200}` on success, or `{"kind":"failed","status":<HTTP status or null>,"message":"<the kit's text>"}` on failure and no `complete`. `--from-cmd <cmd>` sends the command's output and needs the command to exit 0 as well: when it exits non-zero, is stopped by a signal or cannot start, the upload is cut instead of ended (the kit never reports the transfer complete), and `send` prints the command's error and exits 1. Ctrl-C or SIGTERM to `send` or `receive` ends its `--from-cmd`/`--to-cmd` command too (the same signal, a kill after 2 s; exit 130/143), and a receive cut before its end exits 1. A command's output to the CLI's own stdout/stderr arrives whole, also when they are a slowly read pipe, named FIFO or socket; a reader of it that leaves first ends the command and the CLI exits 1. `receive` to a terminal and `progress` exit 130/143 on a signal even while the terminal has stopped reading. A `--from-unix` socket that sends and closes right after accepting can be lost by the standalone binary (connection reset; the error names the workaround): read it with `--from-cmd "socat - UNIX-CONNECT:<path>"` or `--from-cmd "nc -U <path>"`. `--no-progress` hides the status lines.

`connect <name>` opens a WebSocket relay connection (`?ws`): stdin goes out as messages and received messages go to stdout. By default each stdin chunk is one binary message; `--text` makes each line one text message. Stdin EOF closes the connection unless `--keep-open` is given. The peer runs `connect` on the same name or uses any WebSocket client. Exit codes: 0 on close 1000/1001, 1 otherwise, 130/143 on a signal, also while its terminal has stopped reading (stalled SSH, Ctrl-S). `forward <name> --ws --listen|--connect` tunnels one TCP connection over one relay pair: both sides use the same single name, there is no recv-path, and `-n`/`--keepalive-ms` are not taken. With `--ws`, `--connect` exits 1 when the connection was cut (a reset on either side, the relay lost), 0 when it ended normally, 130/143 on a signal. `hoody pipe url get <name> --ws [--wait S]` prints the `ws(s)://` URL.

`forward` keeps an idle tunnel open past the kit's 5-minute idle limit. After `--keepalive-ms` (default 240000) with nothing to send, each side ends its pipe cleanly and opens the next one on the same path; the peer reads the `X-Hoody-Pipe: kind=tcp-forward; segments=1` header and reconnects, and no bytes are added to the stream. Both sides need a CLI with this support. Once an older peer has sent its first pipe, nothing is re-opened toward it and the tunnel closes after about 5 idle minutes; before that, an older peer takes the first clean end (after `--keepalive-ms`) as a half-close. Keep `--keepalive-ms` below 300000; `0` turns re-opening off, and an idle tunnel then closes after 5 minutes. Both directions must pair within 5 minutes (the pairing timeout): the `--connect` side opens its pipes once its dial connects, the `--listen` side only once a local client connects to it, so that client must connect within 5 minutes of the `--connect` side starting. If a pipe ends any other way (peer gone, a timeout, an error), the local connection is closed.

### 1. One-to-one

`hoody pipe receive <path>` (blocks; with `-o <file>` it returns once the file holds every byte, and a write error such as a full disk exits 1; an output that fails while the kit waits for a sender (`-o` into a missing directory, a refused `--to-tcp` or `--to-unix`) exits 1 at once; `--to-cmd <cmd>` waits for the command to exit and exits 1 when it fails or cannot start, at once even while waiting for a sender; to stdout, a reader that goes away (`| head -c 1`) stops the download, and with `--sha256` that exits 1 as not checked; so does a `--to-cmd` command that stops reading early, which otherwise exits with the command's result); `hoody pipe send <path> <file>` (or `--text`, or stdin).

### 2. Fan-out (N ≤ 256)

All peers use the same `path` and the same receiver count (`-n N` / `--receivers N`). A mismatch → 400.

### 3. Download / inline per receiver

`hoody pipe receive <path> --download` and/or `--filename <name>` → attachment; `--inline` → inline.

### 4. Watch via `?progress`

`hoody pipe progress stream <path>` (`--json` for raw events). No receiver slot. The last line, `[done]`, says `complete` or `failed` (with the reason), and a failed transfer exits 1. On a live stream the `[state]` line ends in `(live)` and `[progress]` shows `viewers=N (live)` instead of `receivers=N`. `--until complete`, `--until failed` or `--until complete,failed` stops when the transfer ends that way and exits 0 only then. Ctrl-C exits 130 and SIGTERM 143.

### 5. Video via `?video`

`hoody pipe url get <path> --video` prints the player URL to open in a browser; stream the video with `hoody pipe send <path>`. Sender: WebM / fMP4 (MPEG-TS plays in VLC/mpv, not in the browser player).

### 6. Page links a person only confirms

Compose one URL with every control filled in; the person opens it and clicks (capture and file picks always need their click). Invalid values fall back to the page defaults. `<kit>` is the kit URL; `<name>` is encoded per `/` segment.

Send page `<kit>/api/v1/pipe/?name=<name>&…`:

| Param | Values | Effect |
|---|---|---|
| `name` | ≤1024 chars | pipe name (absent → random) |
| `n` | 1–256 | receiver count |
| `text` | ≤100000 chars | text to send; selects text mode |
| `mode` | `file` \| `text` | form mode |
| `filename` | ≤255 chars | name the receiver gets for a text or pasted image |
| `autostart` | `1` | text mode with non-empty text: send on open, no click (no `name` needed: an absent one is generated, and the page still sends) |

Receive page `<kit>/api/v1/pipe/<name>?receive&…`:

| Param | Values | Effect |
|---|---|---|
| `n` | 1–256 | receiver count, the sender's `n` |
| `filename` | ≤255 chars | download name |
| `autostart` | `1` | start the download on open, no click |

Share page `<kit>/api/v1/pipe/<name>?share&…` (viewers open the video page):

| Param | Values | Effect |
|---|---|---|
| `source` | `screen` \| `camera` \| `audio` | what to capture (default `screen`) |
| `audio` | `1` \| `0` | include the screen's audio |
| `surface` | `monitor` \| `window` \| `browser` | kind offered first in the screen picker |
| `quality` | `low` \| `medium` \| `high` | up to 480p / 720p / 1080p (default `medium`) |
| `fps` | 1–60 | frame rate (default 30) |
| `n` | 1–256 | viewer count |
| `live` | `1` | live broadcast: starts at once, viewers join and leave at any time through `?video&live=1`; `n` does not apply |

Video page `<kit>/api/v1/pipe/<name>?video&n=<n>&live=1&wait=<s>` (`n` only when >1, not with `live`; `live=1` plays a live broadcast; `wait` 1-3600 s is how long the player waits for the stream; opening it receives). Progress page `<kit>/api/v1/pipe/<name>?progress` (no params, no slot). No-JS form `<kit>/api/v1/pipe/noscript?path=<name>&mode=file|text&wait=<s>&sha256=1` (`wait` and `sha256` go on to its upload).

`hoody pipe url get <name> --send|--share|--receive|--noscript` prints the page link: `-n`, `--filename`, `--text`, `--mode`, `--autostart` (send, receive), `--wait`, `--sha256` (receive), `--source`, `--audio`/`--no-audio`, `--surface`, `--quality`, `--fps`, `--live` (share). `--noscript` builds the no-JavaScript form `noscript?path=<name>` and takes `--mode`, `--wait` and `--sha256`; `path` carries the name encoded as in the pipe URL, so the form posts to the same pipe (a name with `/` is refused: the form has one path field). Out-of-range values, and flags the page does not take, are refused.

To open the page in the person's browser instead, with the same flags: `hoody pipe share [name]` (share page; also prints the viewer link `<name>?video`, with `&n=` when `-n` is above 1, or `&live=1` with `--live` (a live share page; not with `-n` above 1), and a terminal QR code of it; no name → random `xxxx-xxxx-xxxx`; `--no-open` only prints; `--json` → `{"name","shareUrl","viewerUrl"}`, no QR), `hoody pipe receive <name> --browser` (receive page: `-n`, `--filename`, `--wait`, `--sha256`, `--autostart`), `hoody pipe send [name] --browser` (send page: `-n`, `--text`, `--mode`, `--filename`, `--autostart` with `--text` only; no name → the page picks one). With `--browser`, transfer flags such as `-o`, `--to-cmd`, `--from-cmd`, a `[source]` file, or on send `--wait`, `--sha256`, `--transfer-id` are refused. When no browser can be opened (SSH, headless), the link is printed with a line saying to open it by hand, and the command exits 0.

### 7. Status, waiting time and checksums

`?status` is one JSON snapshot of a name, with no receiver slot: `state` (`idle`, `waiting`, `streaming`, `complete`, `failed`), `kind` (`pipe`, `ws`, `live` or null), `peers`, `transferId`, `hasSender`, `activeReceivers`, `totalReceivers`, `bytesTransferred`, `totalBytes`, `speed`, `eta`, `elapsed`, `reason`, `sha256`. `?wait=<s>` (1-3600, default 300) sets how long one sender or receiver waits for the other side. `?sha256` (sender or any receiver) has the kit hash the stream; receivers of an ordinary (not `?live`) transfer get the transfer id in `X-Hoody-Pipe-Transfer-Id`, and `?status&transfer=<id>` returns that transfer, for a hashed one also for up to 10 min after it ends (the kit keeps at most 1,000 receipts in all and evicts the oldest first, so a busy kit can drop one sooner). Prometheus metrics: `GET /api/v1/pipe/metrics`.

`hoody pipe status <path>` (`--transfer <id>`, `--json`); `hoody pipe metrics`. `send --transfer-id <id>` sets the sender's own transfer id. `send` and `receive` take `--wait <s>` and `--sha256` (send prints `sha256: <hex>` on stderr; receive checks the data against the kit's digest, prints `sha256 OK <hex>` or exits 1). `hoody pipe url get <path>` takes `--wait`, `--sha256`, `--status`.

### 8. Live broadcast (`?live`)

A live sender streams at once, with nobody watching; any number of viewers (256 at once) join and leave while it runs and each gets the stream from then on (no `Content-Length`, header `X-Hoody-Pipe-Live: 1`; the headers come with the viewer's first bytes). WebM joins at the next keyframe Cluster after the stream header, so players decode it; anything else joins at the next chunk. Bytes sent while nobody watches are dropped. A viewer 8 MiB or 4096 pieces behind, taking nothing for 60 s, or furthest behind when the live memory budget (64 MiB per stream, 512 MiB in all) is full is cut: its body ends with an error. A clean sender end gives each viewer up to 60 s to finish; a sender that disconnects, fails or idles 5 min cuts every viewer. Sender status: `[INFO] Live: streaming. Viewers can join at any time.`, then `[INFO] Live stream ended (peak N viewers).` or an `[ERROR]` line. `?status` shows `kind: "live"`, viewers in `activeReceivers`, `totalReceivers: null`; `?progress` events carry `live: true`. Not with `n` above 1, `sha256`, `ws` or multipart (400); a live sender on a name with an ordinary transfer, an ordinary sender on a live name, or a plain GET while `?live` viewers wait → 409 (a plain GET on a running live stream joins it). Caps: 100 live streams, 4096 viewer responses in all (each counts until it disconnects or 35 s after its body ended) → 429.
`hoody pipe send <path> - --live` (e.g. `tail -f app.log | hoody pipe send logs - --live`), `hoody pipe receive <path> --live`, `hoody pipe url get <path> [--video] --live`, `hoody pipe share [name] --live` and `hoody pipe url get <name> --share --live` (a live share page). `--live` with `-n` above 1, `--sha256` or `--browser` exits 1 before any request.

## Quirks & gotchas

- Available over SDK, HTTP and the `hoody pipe` CLI.
- `/api/v1/pipe/{path}` ≡ bare `/{path}` for transfer paths, except a name equal to `api/v1/pipe` or starting with `api/v1/pipe/` (the prefix is stripped once, so those are reachable only under the prefix: `/api/v1/pipe/api/v1/pipe/x` is the pipe `api/v1/pipe/x`). Health is the other exception: `/api/v1/pipe/health` answers GET/HEAD/OPTIONS, and a bare `/health` returns 404; both are matched case-insensitively with one trailing `/` or `.` allowed (`/api/v1/pipe/health/` is health, `/Health` is 404). Percent-escapes in a name match regardless of hex case (`caf%c3%a9` = `caf%C3%A9`) but are not decoded (`%41` ≠ `A`).
- Reserved: `/`, `/noscript`, `/help`, `/favicon.ico`, `/robots.txt` (alias-hardened). `health` and `metrics` are not pipe names either: under the prefix they are the health and metrics endpoints, and at the root they answer 404. The SDK (`PipeStream`, `PipeBrowser`, `PipeMedia`, page URLs) and the CLI refuse all of these before any request, and every SDK URL builder (`getUrl`, `getWsUrl`, `getDownloadUrl`, `getPageUrl`) throws on them, matched as the kit matches them: case-insensitive, one trailing `/` then one trailing `.` ignored, so `Metrics.`, `help/` and an empty name are refused. Runs of `/` are merged first, so `/help`, `//metrics` and `metrics//` are refused too: the kit itself serves `/help` as the pipe `//help`, but an edge that merges slashes would send it to the help page.
- `n` ≤ 256; peers must agree. Caps 1000 pending + 1000 active.
- The kit limits the path name (the pathname after the `/api/v1/pipe` prefix is removed, leading `/` not counted) to 1024 characters, the same cap the SDK and CLI check. Percent-encoding counts against the kit's limit, so a name with characters the URL must encode can pass the SDK and CLI check and still get 414. That is the only length limit the kit applies: there is no total-URL cap in the kit, so an extremely long URL is refused (if at all) by the HTTP server in front of it, with a differently shaped error. Control characters, backslashes and encoded slashes → 400.
- A sender or receiver waits for the other side for its own `?wait` (default 5 min, at most 1 h); an active transfer idle for 5 min is ended.
- Dangerous sender MIME (HTML/SVG/JS) → `text/plain`; `nosniff` forced.
- Forwarded sender→receiver headers: `Content-Type` (sanitized — dangerous MIME → `text/plain`), `Content-Length` (only for a non-multipart body, and only when the value is 1–19 plain digits; multipart transfers are sent without it), `X-Piping`, `X-Hoody-Pipe` (each ≤8 KiB, CRLF-stripped). `Content-Disposition` is rebuilt per-receiver from sender metadata + receiver `?download`/`?filename` params.
- `?download` enum (SDK-validated): `"true"`/`"false"`/`"yes"`/`"no"`/`"1"`/`"0"` (attach / inline). The kit is more permissive — bare `?download` (no value) and any non-`false`/`no`/`0` string are treated as truthy. `?filename=<v>` implies attach, sanitised (255 chars, RFC 5987), unless the same receiver also sent an explicit `download=false`/`no`/`0`, which suppresses Content-Disposition entirely. The CLI refuses `--filename` together with `--inline`.
- `?video` HTML player only on `Accept: text/html`; no receiver slot. A valid `?wait` on the player URL is used by each of its receives; an invalid one is ignored. It plays each stream to its end, even a short file that arrives all at once, then waits on the same path: the next stream sent there replaces it. Audio-only WebM (Opus/Vorbis) plays as audio; with `?n=N` the players may be tabs of one browser. Without `live` it never skips content (a stream that fell behind stays behind; it reads at most 45 s ahead); with `live` (`?video&live=1`), a player that falls behind may jump to the newest buffered media. Playback stopped 1.5 s with media buffered ahead moves on to it.
- `?progress` no receiver slot. Caps: 50/path, 500 groups, 30 min TTL.
- `?receive` and `?share` serve pages only on `Accept: text/html` (a browser); any other client gets the data as a plain receiver, like `?video`. With several page params on one URL a browser gets `?progress`, then `?video`, then `?share`, then `?receive`; `=0`/`false`/`no` turns one off.
- `?receive` page: shows the name and whether a sender waits (from `?progress`, no slot). On the person's click — or by itself with `autostart=1` — the browser's download manager receives `?download` (plus `n`, `filename`, and the page's own `wait` and `sha256`), so any size goes to disk without passing through the page. Progress and the result are only in the browser's downloads list: the page cannot see the download, so after Receive it stays `Receiving in your browser` and never reports success. Its only outcome is `Failed` with the kit's error text when the download frame gets one (`Timed out waiting for sender.` after 5 min or the page's `wait`, an `n` mismatch, a taken slot); `?progress` state snapshots fill an info line labelled "Status for this name" (all its senders and receivers, not this download: no sender yet / sender waiting for receivers / transfer running; "Status unavailable, retrying…" while the stream is down) and never set an outcome. Cancel frees the slot while waiting (a started download goes on in the browser's downloads); Receive again after a failure retries. Pre-fill: `n` (invalid → 1, max 256), `filename` (sanitized like `?filename`), `autostart=1` (only `1`/`true`/`yes`/bare), `wait` (1-3600 s; invalid → dropped), `sha256` (forwarded only; the page shows no checksum).
- `?share` page: shares the screen (with its audio if ticked), the camera with the microphone, or the microphone only, live to the `?video` player.
  - Start sharing asks the browser for the capture (the person's click), then sends one WebM stream to the name and shows a viewer link (Copy + QR) to `<name>?video` (plus `&n=`).
  - Without Live, the stream starts when all `n` viewers have opened the link; until then the page shows `Waiting for viewers… x of n connected`. With Live (the Live box or `live=1`), it is a `?live` broadcast that starts at once and viewers join and leave at any time. The page shows viewers, elapsed time and bytes sent (from `?progress`, no slot).
  - Stop, or the browser's own stop-sharing control, ends the stream; Start sharing again shares on the same name and players still open on the link play it.
  - Without Live, it ends with a message when nobody (or not all `n`) opened the link within 5 min, or all viewers left. In either mode it ends with a message when the name is busy, the kit refused the share (its error text), or the connection cannot keep up.
  - It needs a browser that can stream an upload (Chromium-based) over HTTPS with HTTP/2 or HTTP/3; any other browser gets a message instead of a start. It stores nothing in the browser.
  - Pre-fill: `source=screen|camera|audio`, `audio=1` (screen audio), `surface=monitor|window|browser` (offered first in the picker), `quality=low|medium|high` (up to 480p/720p/1080p), `fps` (1–60, default 30), `n` (1–256), `live=1` (Live). Invalid values fall back to the defaults; capture still needs the click on Start sharing.
- `/` (also `/api/v1/pipe/`) is the send page.
  - It sends one file, a typed or pasted text, or a pasted image (sent as a file).
  - It fills in a random name that the person can edit, plus `n`. Send/Cancel uses one POST to `/api/v1/pipe/<name>`: each `/`-separated part of the name is encoded, so `?`, `#` and `%` stay in the name, and leading `/` are kept. A name with a `.` or `..` part (also `%2e`) is refused before sending, as in the SDK.
  - The file name, or `filename` for a text or pasted image, goes in `Content-Disposition`. A typed or URL-given file name is kept when a file is picked or pasted.
  - It reports Delivered only when the POST response ends with `[INFO] Transfer complete.`; any other ending is shown as Failed. Each `[INFO] A receiver disconnected.` after `[INFO] Streaming to …` is a receiver that did not get everything: `Delivered to 1 of 2 receivers (1 disconnected).`
  - It shows the connected receivers and the state from `?progress` (no slot). It shows a receive link (Copy + QR) to `<name>?receive` (plus `&n=`).
  - Cancel frees the name. The page stores nothing in the browser and sends a nonce CSP with `connect-src 'self'`.
  - Pre-fill: `name` (≤1024; absent → random), `n` (1–256, invalid → 1), `text` (≤100000, selects text mode), `mode=file|text`, `filename` (≤255), `autostart=1` (text mode with a text only; never for a file; a refused name shows the reason instead). Over-long values are cut without splitting a character.
- To hand a person a ready send link, build `<kit>/api/v1/pipe/?name=<name>&text=<text>` (add `&autostart=1` to send it on open, `&filename=<name.ext>`, `&n=N`). For a file, give `?name=<name>`: they pick the file and click Send.
- WebSocket relay: `GET /{name}?ws` with an upgrade pairs exactly two peers. Messages pass both ways with their type and boundaries kept, at most 1 MiB each. The first peer's messages are held (4096 / 2 MiB) until the second arrives (`?wait`, default 300 s, then close `4408`). A slow reader more than 2 MiB behind closes the pair with `1013`. Close codes 1000-1003, 1007-1014 and 3000-4999 are forwarded; a drop arrives as `1001`. The first peer's subprotocol binds the pair. A name holds either a transfer or a pair, never both (409 both ways); `?status` shows `kind: "ws"`, `peers`. 
- To hand a person a ready receive link, build `<kit>/api/v1/pipe/<name>?receive&autostart=1&filename=<name.ext>` (add `&n=N` for N receivers); they open it and the file lands in their downloads when the sender sends. A share link is `<kit>/api/v1/pipe/<name>?share&source=screen|camera|audio` (capture still needs their click on Start); viewers open `<kit>/api/v1/pipe/<name>?video`.
- `Service-Worker: script` → 400.
- `Content-Range` on POST/PUT → 400.
- Multipart: the **first file part** wins. Non-file parts before it are drained; the transfer ends when that part ends; anything after it is ignored, and the body stops being read once the transfer finishes. A body cut off or dropped before that part ends fails the transfer (sender `[ERROR] Transfer failed`, waiting receivers 500). With no file part, the first `input_text` field is delivered instead (as `text/plain; charset=utf-8`, no disposition); a text field over 1 MiB fails the transfer. The 30 s deadline covers only the wait for the first file or `input_text` part; after that the 5 min idle limit applies.

## Common errors

- 400 — active / sender attached / `n` mismatch / slots full / `n`>256 / reserved / forbidden chars / `Service-Worker` / `Content-Range`.
- 405 — method. HEAD works only on the reserved pages, `/api/v1/pipe/health`, `/api/v1/pipe/metrics` and `?status`; transfer paths accept GET, POST, PUT and OPTIONS. On a reserved page or health, the 405 carries `Allow: GET, HEAD, OPTIONS` (POST/PUT to a reserved page are 400, to health 405).
- 408 — a waiting receiver whose own `?wait` (default 5 min) passes before the pipe is established gets it; the others keep waiting. The body names the missing side: `[ERROR] Timed out waiting for sender.` when no sender is attached, `[ERROR] Timed out waiting for receivers.` when the sender is attached but some of the `n` receivers never came. The sender has already had its `200` response; it learns of the timeout only from `[ERROR] Timed out waiting for receivers.` in its streamed status body.
- 409 — `?ws` on a name with two peers already, with a transfer, or with a different subprotocol than the first peer's; a sender or receiver on a name that holds a WebSocket pair; a sender whose `?transfer=<id>` is still in use (`[ERROR] Transfer id already in use.`).
- 426 — `?ws` without a WebSocket upgrade.
- 414 — path name (leading `/` not counted) over 1024 characters.
- 429 — pending-transfer cap, spectator caps, and, for receivers, the active-transfer cap. A sender that hits the active-transfer cap has already had its `200`; it gets `[ERROR] Server at maximum active transfer capacity.` in its status body.

## Related namespaces

`files` persist · `curl` HTTP client · `tunnel` long-lived bidi · `terminal`/`exec` shell.

## Examples

Each example has HTTP, CLI and SDK forms. The CLI forms use the `hoody pipe` subcommands. They address the kit with the global `--container "$C"` before `pipe`; to address it directly instead, drop `--container` and put `--pipe-url "$KIT"` after the subcommand (`hoody pipe receive "$PATH_NAME" --pipe-url "$KIT"`). Set `P`, `C`, `N` (project id,
container id, server name) from `hoody containers get` first, then
`KIT="https://${P}-${C}-pipe-1.${N}.containers.hoody.com"`.

Pipe paths are reservations: receivers and senders rendezvous on the same path.
Pick a unique path (e.g. `transfer-$(openssl rand -hex 4)`) per transfer — once
it's claimed by a sender or receiver, the same path can't host another transfer
until the first one finishes or the 5-min idle TTL evicts it.

### 1. One-to-one transfer — receiver waits, sender pushes bytes

**Goal:** stream a payload from one endpoint to another with zero staging. Receiver opens the GET first; the connection blocks until the sender POSTs to the same path.

**Step 1 — start the receiver in the background.** It blocks until the sender connects.

```bash
PATH_NAME="transfer-$(openssl rand -hex 4)"
hoody --container "$C" pipe receive "$PATH_NAME" -o /tmp/received.bin &
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
hoody --container "$C" pipe send "$PATH_NAME" --text 'hello pipe!'
wait $RECVPID
cat /tmp/received.bin   # → hello pipe!
```

### 2. Fan-out 1-to-3 — one sender, three receivers

**Goal:** broadcast the same bytes to three endpoints in lockstep. All four parties (3 receivers + 1 sender) must agree on `n=3`; mismatch → 400.

**Step 1 — open three receivers.** Each must pass `?n=3`.

```bash
PATH_NAME="broadcast-$(openssl rand -hex 4)"
for i in 1 2 3; do
  hoody --container "$C" pipe receive "$PATH_NAME" -n 3 -o "/tmp/recv-$i.bin" &
  sleep 0.5
done
```

**Step 2 — send once; all three receivers get an identical copy.** Lockstep fan-out: the slowest receiver paces the transfer.

```bash
hoody --container "$C" pipe send "$PATH_NAME" -n 3 --text 'fan-out-payload'
wait
ls -la /tmp/recv-*.bin   # all three identical
```

### 3. Force a download with a custom filename

**Goal:** make the browser save the response to disk with a specific name, regardless of what (or whether) the sender provided a `Content-Disposition`. `?filename=<v>` implies `?download` and overrides any sender-supplied filename, unless the same receiver passes `?download=0` (which drops Content-Disposition entirely).

**Response header:** `content-disposition: attachment; filename="report.bin"`.

```bash
PATH_NAME="dl-$(openssl rand -hex 4)"
# Receiver: force download as report.bin; --headers prints the response headers to stderr
hoody --container "$C" pipe receive "$PATH_NAME" --filename report.bin --headers -o /tmp/report.bin &
sleep 1
# Sender: arbitrary bytes, no Content-Disposition needed
printf 'BINARYPAYLOAD' | hoody --container "$C" pipe send "$PATH_NAME" -
wait
```

### 4. Force inline display, overriding a sender's `attachment`

**Goal:** the sender (e.g. a legacy script) marks every payload as `Content-Disposition: attachment; filename="leaked.txt"`, but you want to render it inline in your app. `?download=0` strips Content-Disposition entirely on the receiver side — per receiver, not globally.

**Result:** sender sent `Content-Disposition: attachment; filename="leaked.txt"`; receiver got `content-type: text/plain` only — no Content-Disposition.

```bash
PATH_NAME="inline-$(openssl rand -hex 4)"
hoody --container "$C" pipe receive "$PATH_NAME" --inline --headers -o /tmp/inline.txt &
sleep 1
hoody --container "$C" pipe send "$PATH_NAME" --text 'inline body' \
  -H 'Content-Disposition: attachment; filename="leaked.txt"'
wait
```

### 5. Watch a transfer with `?progress` (SSE)

**Goal:** monitor live state + bytes/sec from a third process, without consuming a receiver slot. `?progress=1` with `Accept: text/event-stream` returns SSE events; the spectator never blocks the transfer.

**SSE stream** for a 50 KB payload:
```
event: state    data: {"state":"idle",...}
event: state    data: {"state":"waiting","hasSender":true,"activeReceivers":1,...}
event: state    data: {"state":"streaming",...}
event: progress data: {"bytesTransferred":50000,"totalBytes":50000,...}
event: done     data: {"state":"complete","bytesTransferred":50000,"avgSpeed":7142857}
```

Only `done` says how a transfer ended. A failed one sends `{"state":"failed",…,"reason":"Sender disconnected"}`; `state` events carry only `idle`, `waiting` and `streaming`. A spectator that connects within 30 s after a transfer ends gets `204` and no events.

```bash
PATH_NAME="watched-$(openssl rand -hex 4)"
# Spectator: live SSE events, exits when the transfer completes or fails
hoody --container "$C" pipe progress stream "$PATH_NAME" --json --until complete,failed &
sleep 1
# Real receiver
hoody --container "$C" pipe receive "$PATH_NAME" -o /tmp/payload.bin &
sleep 1
# Sender pushes 50 KB from stdin
yes abcd | head -c 50000 | hoody --container "$C" pipe send "$PATH_NAME" -
wait
```

### 6. Embed an HTML transfer dashboard

**Goal:** give a non-technical user a live dashboard view of an in-flight transfer. Same `?progress=1` endpoint, but `Accept: text/html` returns a self-contained HTML page (CSP nonces, EventSource client baked in). Pop it in an `<iframe>` or open it in a new tab.

**Result:** ~6 KB HTML page titled `"Hoody Pipe — Transfer Progress"` with `EventSource` wired to the same path. Dashboard never consumes a receiver slot.

```bash
PATH_NAME="watched-$(openssl rand -hex 4)"
# Print the dashboard URL (no request is made); open it in a browser
hoody --container "$C" pipe url get "$PATH_NAME" --progress
```

### 7. Stream a screen-recording to an MSE video player

**Goal:** stream live WebM or fragmented MP4 from `ffmpeg` and watch it in a browser without serving a separate frontend. MPEG-TS plays only in a media player (VLC, mpv): the page tells a browser viewer so. `?video=1` + `Accept: text/html` returns an HTML page that auto-detects the codec from the first bytes; non-browser clients (VLC, mpv, ffplay) fall through to the raw stream automatically.

**Result:** ~7.7 KB HTML page titled `"Hoody Pipe — Video"` with `MediaSource` + `data-path` baked in.

```bash
PATH_NAME="screencast-$(openssl rand -hex 4)"
# 1) Print the player URL and open it in a browser:
hoody --container "$C" pipe url get "$PATH_NAME" --video
# 2) Then on the source machine, push the live encode from stdin:
ffmpeg -f x11grab -i :0.0 -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -f webm - \
  | hoody --container "$C" pipe send "$PATH_NAME" --put -
# Non-browser viewers (VLC/mpv/ffplay) use the same URL — they get raw bytes:
mpv "$(hoody --container "$C" pipe url get "$PATH_NAME" --video)"
```

### 8. Multipart upload — only the first file part is forwarded

**Goal:** accept an HTML form upload. Pipe extracts the **first file part** of a `multipart/form-data` body, skips the rest, and forwards the file's `Content-Type` + `Content-Disposition` (auto-upgraded to `attachment`).

**Result:** sent `field1=ignored` + `file=@a.txt` + `extra=@b.txt`. Receiver got body `first-file-content` only, with headers `content-type: text/plain` and `content-disposition: attachment; filename="a.txt"` — second file silently dropped.

```bash
PATH_NAME="upload-$(openssl rand -hex 4)"
# Receiver
hoody --container "$C" pipe receive "$PATH_NAME" --headers -o /tmp/file.bin 2>/tmp/headers &
sleep 1
# Sender: `hoody pipe send` streams a raw body, not a form, so the multipart
# upload itself is plain HTTP against the URL the CLI prints
echo -n first-file-content  > /tmp/a.txt
echo -n second-file-content > /tmp/b.txt
curl -s -X POST \
  -F 'field1=ignored-form-field' \
  -F 'file=@/tmp/a.txt;type=text/plain' \
  -F 'extra=@/tmp/b.txt;type=text/plain' \
  "$(hoody --container "$C" pipe url get "$PATH_NAME")"
wait
grep -i 'content-disposition' /tmp/headers   # → attachment; filename="a.txt"
cat /tmp/file.bin                             # → first-file-content
```

### 9. Path / URL length limits — 1024-char path name is the cap

**Goal:** know what blows up at the validator. The kit counts the path name after the `/api/v1/pipe` prefix, leading `/` not counted: a path name over 1024 characters → `414 Path too long`. That path cap is the only length limit the kit itself enforces.

**Result:**
- 1100-char path POST: kit returned `414` with body `[ERROR] Path too long (max 1024 characters).`
- The kit accepts at most 1024 characters in the path name as it is sent (percent-encoded); 1025 gets `414`. The SDK and CLI check the unencoded name, so a name that passes can still exceed the limit once percent-encoded and receive `414`.

```bash
# The CLI refuses names over 1024 characters before any request:
LONG=$(printf 'x%.0s' {1..1100})
hoody --container "$C" pipe send "$LONG" --text data
# → Error: pipe path must be <= 1024 characters
# Percent-encoding can push a name past the kit's 1024-character limit even when the CLI accepts it; keep names short:
SHORT="t-$(openssl rand -hex 8)"  # ~18 chars total
```

### 10. Sidechannel metadata via `X-Hoody-Pipe`

**Goal:** attach commit / build / job metadata to the transfer without polluting the body. The kit forwards `X-Hoody-Pipe` and `X-Piping` (≤ 8 KiB each, CRLF-stripped) to receivers and exposes them via `Access-Control-Expose-Headers` so browsers can read them.

**Response headers** with `X-Hoody-Pipe: build-id=42; commit=abc1234` + `X-Piping: legacy-meta=true`:
```
access-control-expose-headers: X-Hoody-Pipe-Transfer-Id, X-Piping, X-Hoody-Pipe
x-hoody-pipe: build-id=42; commit=abc1234
x-piping: legacy-meta=true
```

```bash
PATH_NAME="meta-$(openssl rand -hex 4)"
hoody --container "$C" pipe receive "$PATH_NAME" --headers -o /tmp/body 2>/tmp/h &
sleep 1
hoody --container "$C" pipe send "$PATH_NAME" --text 'metadata payload' \
  --content-type application/octet-stream \
  -H 'X-Hoody-Pipe: build-id=42; commit=abc1234' \
  -H 'X-Piping: legacy-meta=true'
wait
grep -iE '^x-hoody-pipe|^x-piping' /tmp/h
```

## Reference

### `hoody pipe` (7) — Named pipes for streaming data between clients

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pipe cheatsheet get` |  | read | Print the server-rendered curl cheatsheet for sending and receiving | `pipe.kit.getHelp` | `hoody pipe cheatsheet get -c <containerId>` |
| `hoody pipe health` |  | read | Service health check | `pipe.kit.getHealth` | `hoody pipe health -c <containerId>` |
| `hoody pipe metrics` |  | read | Prometheus metrics for the pipe kit | `pipe.kit.getMetrics` | `hoody pipe metrics -c <containerId>` |
| `hoody pipe open` |  | action | Open the Pipe kit page in your browser |  | `hoody pipe open [index] [--view progress --path NAME] [--url]` |
| `hoody pipe receive` |  | read | Receive the data a sender is streaming to a pipe path | `pipe.receive` | `hoody pipe receive myfile -c <containerId>` |
| `hoody pipe send` |  | action | Stream data to a pipe path for the receiver(s) to pull | `pipe.send` | `hoody pipe send myfile report.pdf -c <containerId>` |
| `hoody pipe status` |  | read | One snapshot of a pipe name (?status, takes no receiver slot): state, sender, receivers, bytes | `pipe.getStatus` | `hoody pipe status myfile -c <containerId>` |


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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. List recent

- `hoody proxy logs list` with `last: N` or `limit`+`offset` (SNI-bound).

### 2. Drill into 5xx

- `hoody proxy logs list` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate from a cursor with `afterId`: it reads the log database (real row ids), oldest first, and `total` counts every entry after the cursor.

### 3. Live-tail with resume

- `hoody proxy logs stream` — SSE; live frames carry an `id:` line holding an opaque increasing integer cursor (a fresh connection first gets a data-only array of recent matching entries with no `id:` line, only when there are some; otherwise its first frame is a live one).
- Reconnect with `Last-Event-ID`; the server replays the buffered frames after it. `event: gap` (no `id:`) means it no longer reaches back that far: backfill the missing entries from `hoody proxy logs list`.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Stats snapshot

- `hoody proxy logs stats` — `total` plus counts `byLevel`, `byProject`, `byContainer` and `byService`, and the `timeRange`. There is no status-code breakdown: derive one client-side from `hoody proxy logs list`.

### 5. Bodies for a slice

- `hoody proxy logs list` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `hoody proxy logs list` ignored — SNI auto-scopes.
- On the stream the scope also comes from the kit URL, but `projectId`/`containerId` are checked rather than ignored: omit them or pass the URL's own values; any other value returns `400 {"error":"scope_mismatch"}`. They cannot retarget the stream.
- `traceId` is per log source: edge entries carry the edge's hex request ID, backend request/response pairs share their own UUID. Entries from the edge and the backend, or from different kits, never share one.
- `level` accepts ONE value at a time on the kit URL: `level=warn,error` returns `total: 0`, so query each level separately and union client-side.
- `serviceName` is not honoured on the kit URL for `GET /_logs` (the list handler ignores it); filter client-side. It IS honoured on `GET /_logs/stream`, so tail with `serviceName=` and list without it.
- `hoody proxy logs stream` forwards `--service-name`, `--source` and `--after-id` to the stream endpoint, so `--service-name` filters the stream on the server; no client-side post-filter is needed.
- Every `hoody proxy logs list` read returns `{entries,total,limit,offset}`. `last=N` returns the newest N entries, oldest first, in one response (`total` is the number returned, `offset` does not apply, and `last` wins over `afterId`); on the kit URL without bodies or time filters those entries come from the in-memory recent buffer, which holds the newest entries of every container on the server, so a busy neighbour can leave fewer than N there, and it starts empty after a server restart. Every entry carries its row `id`, so pass the last one as `afterId` to follow on. `afterId` always reads the log database: oldest first, `total` counts every entry after the cursor and `offset` pages through them.
- `includeRequestBody`/`includeResponseBody` default `false`.
- The resume buffer holds at most 2,000 frames and 8 MiB, shared by every stream on the server, so a busy neighbour shortens your window; past it you get `event: gap`.
- A server restart ends the stream with no event; ids then resume at least 10,000 past the last value the server saved, which can trail the last id you saw, and the buffer starts empty, so a pre-restart `Last-Event-ID` gets `event: gap`. On `event: reset` drop your saved id and reconnect without it.
- `logs` strict-boolean; `"*"` does NOT grant.
- `kind` = `request`/`response`/`event`.

## Common errors

- 403 — missing `logs: true` (permission / blocked-path gate).
- 429 — per-scope rate limit on SNI reads (list, getStats, stream), 30 per minute by default and lower or higher on some deployments → `{error:"rate_limited"}` with `Retry-After: 2`; back off.
- Anything under `/_logs/` other than the three reads above is not part of the kit surface (404).
- The kit-URL log paths accept `GET` and `HEAD` for reads. `OPTIONS` is answered separately as a CORS preflight (200, no log data); any other method gets `405` with `Allow: GET, HEAD`.
- Desync if `event:` lines unparsed; reset on `reset`.

## Related namespaces

- `exec`/`daemon` — app logs.
- `terminal` — reproduce.
- `watch` — fs events.
- `api` — lifecycle.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

> **CLI note.** `hoody proxy logs list|stats|stream` target the kit's `logs` service for the container selected with `--container` (`{project}-{container}-logs-1.…`), authorised by that container's proxy permissions — no account bearer is sent. The kit-URL behaviours documented below (`last=N` rows come from the recent buffer) therefore apply to the CLI form as well.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. The 7 recipes below cover every working filter, both paging modes, the stats endpoint, and SSE resume. The list endpoint does **not** filter by program, source IP (`clientIp`), alias hostname or `serviceName` server-side (none of them is honoured as a query parameter on `GET /_logs`); scope by those fields client-side after a paged scan, as §2 (status) and §5 (traceId) do.

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns the newest N entries in the usual `{entries,total,…}` envelope, ordered **oldest-first within the returned slice**. On the kit URL they come from the in-memory recent buffer. Each entry carries its row `id`: pass the last one as `afterId` (§3) to read what came after. It is the cheapest call you can make.

```bash
hoody --container "$C" proxy logs list --last 50 -o json \
  | jq -r '.entries[] | "\(.tsIso)  \(.kind)/\(.level)  \(.serviceName)  \(.method) \(.url) \(.status // "—")"'
```

### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```bash
hoody --container "$C" proxy logs list --level error --limit 200 -o json \
  | jq '[.entries[] | select(.status >= 500 and .status < 600)] | sort_by(.id) | reverse'
```

### 3. Walk the full window with an `afterId` cursor (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. Page by row id: `afterId` always reads the log database, returns entries **oldest first** with real row ids, and `total` counts every entry after the cursor. Start at `afterId=0`, then pass the last `id` of each page as the next `afterId`; new traffic lands after your cursor, so nothing shifts under you. Plain `limit`/`offset` without `afterId` counts from the **newest** entry, so arriving entries move every page during a walk. To start from the present instead of the oldest entry, take the cursor from the last entry of a `last=N` read. Walk until `entries` is empty.

**Rate limit:** kit-URL reads are limited per scope: by default a burst of 10, then 30 per minute (one every 2 s), and some deployments differ (see Common errors). A walk longer than about 10 pages therefore gets `429 {"error":"rate_limited"}`. That reply has no `entries`, so a loop that reads it as an empty page stops early and looks finished. The loops below treat any failed call, or any reply without an `entries` array, as a failure. After each failure they wait (2 s, then 4, 8, 16 and 32 s) and retry. The walk stops with an error and exit status 1 on the 6th failed call in a row, after 5 retries and about 62 s of waiting.

```bash
walk_logs() {
  local after=0 tries=0 page count
  while :; do
    if page=$(hoody --container "$C" proxy logs list --after-id "$after" --limit 500 -o json) \
       && count=$(printf '%s' "$page" | jq -e '.entries | arrays | length'); then
      tries=0
    else
      tries=$((tries + 1))
      if [ "$tries" -gt 5 ]; then echo "log walk stopped at afterId=${after}" >&2; return 1; fi
      sleep $((1 << tries)); continue   # 2, 4, 8, 16, 32 s
    fi
    [ "$count" -eq 0 ] && return 0
    printf '%s' "$page" | jq -c '.entries[] | {id,tsIso,serviceName,status}'
    after=$(printf '%s' "$page" | jq '.entries[-1].id')
  done
}
walk_logs
```

### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byContainer, byService }` — perfect for a dashboard tile.

```bash
hoody --container "$C" proxy logs stats -o json | jq '{
  total, byLevel,
  noisiest: (.byService | to_entries | sort_by(-.value) | .[:3])
}'
```

### 5. Group entries that share a `traceId`

**Goal:** find every entry recorded under one `traceId`. The ID is assigned per log source, not per end-to-end request: an edge entry carries the edge's own 32-character hex request ID, and a backend `request`/`response` pair shares a separately generated UUID. A `traceId` therefore does not link an edge entry to a backend entry, or a request to calls it makes to other kits; correlate those by `tsMs`, `serviceName` and `url` instead. The kit does not filter on `traceId` server-side, so scan a recent window and group client-side.

```bash
TID=354a5a0222e7107c46ae2851ded57fa6
hoody --container "$C" proxy logs list --limit 1000 \
    --include-request-body --include-response-body -o json \
  | jq --arg tid "$TID" '[.entries[] | select(.traceId == $tid)] | sort_by(.tsMs)'
```

### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and resume after a network blip. Live frames carry an `id:` line holding an increasing integer cursor; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. The resume is complete only while your cursor is still in the server's replay buffer: when it is not, the first frame is `event: gap` (no `id:`, data `{"after","resumedFrom"}`), and the entries in between are NOT replayed. Treat `gap` as a control event, not a log entry: backfill the missing window with `hoody proxy logs list` (`sinceMs` = the `tsMs` of the last entry you processed), skip entries you already handled, then carry on with the stream. `event: purged` carries an `id:` and `data: {}`: advance the cursor past it, but it is not an entry. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

A frame larger than 256 KiB is replaced by a stub that keeps the entry's row `id` and carries `truncated: true` and `originalFrameBytes`. To get the whole record, read that row with `hoody proxy logs list --after-id <afterId> --limit 1` and check that the returned entry's `id` matches; the SSE `id:` line is a different cursor from this row id. If the row cannot be read, report the missing entry instead of treating the stub as complete.

```bash
# The CLI seeds the first request's Last-Event-ID header from --last-event-id and
# auto-resumes across reconnects within the same process. Pass it only when you
# hold a real cursor from an earlier run: "0" is treated as a cursor and replays the buffer.
hoody --container "$C" proxy logs stream --level warn ${LAST:+--last-event-id "$LAST"}
# The CLI neither announces nor backfills a replay gap: it prints the gap event as an
# almost empty line, so its output does not show that entries were missed. When the
# record must be complete, read the window after a reconnect with
# `hoody --container "$C" proxy logs list --since-ms <tsMs of the last entry you saw>`.
```

### 7. Read request + response bodies for a debug slice

**Goal:** inspect what the upstream actually sent or received for a narrow slice of entries (e.g. recent warns). Request and response bodies are captured by default, but query results leave them out. Pass `includeRequestBody` and `includeResponseBody` to get the bodies already stored with the entries you query. These options change what a query returns, not what gets captured: a body that was never captured cannot be brought back. The live stream never carries bodies. Bodies are capped at 65 536 B by default, and bodies whose content type matches `image/`, `video/`, `audio/`, `application/octet-stream` or `font/` are not captured by default. The deployment's log configuration sets whether bodies are captured, the cap and the excluded types; this API cannot change any of them. A body the reader-side cap shortens ends in `...[TRUNCATED]`; one already cut upstream carries no marker, so do not test for that suffix to detect truncation. `bodyTruncated` can be `true`, `false` or absent, so test it for truthiness and never compare it to `false`.

```bash
hoody --container "$C" proxy logs list --level warn --limit 20 \
    --include-request-body --include-response-body -o json \
  | jq '.entries[] | {id, tsIso, status, url, reqBody: .requestBody, resBody: .responseBody}'
```

## Reference

### `hoody proxy` (3) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy logs list` |  | read | Query centralized logs | `proxyLogs.list` | `hoody proxy logs list --limit 200 --include-request-body` |
| `hoody proxy logs stats` |  | read | Get log statistics | `proxyLogs.getStats` | `hoody proxy logs stats` |
| `hoody proxy logs stream` |  | read | Live-tail logs over Server-Sent Events | `proxyLogs.stream` | `hoody proxy logs stream --service-name tunnel --kind request` |


---

<!-- ===== namespace: run ===== -->

# `run` — resolve apps to shell commands

## Purpose

Hoody Run — HTTP resolver across package sources (trusted-list, system-path, nixpkgs, pkgx, AppImage, OCI, manifests). Returns ranked candidates (each carrying a `kind`) or a resolved `shell_command`. Resolve produces a command plus a preview; it never launches the app itself.

## When to use

- Resolve `firefox`/`react`/`owner/repo` to a command.
- Cross-provider candidates with stable `set_id`.
- Preview the resolved command via `print_curl` / `preflight`.
- Batch via `POST /api/v1/run/batch` (HTTP only; no CLI command); persist profiles/recipes.

## When NOT to use

Not for: command known → `terminal`, long-lived process → `daemon`, one-shot remote exec → `exec`, arbitrary HTTP → `curl`.

## Prerequisites

- Kit slug `run`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Search then pick

1. `hoody run search --app <app> --page-size 25 -o json` (`page_size`, default 25, max 100, sets the page; `--cursor` for the next page) → `set_id`, `total_count`, `items`, `next_cursor`.
2. `hoody run resolve --app <app> --set-id <set_id> --pick index --pick-index <N> -o json` → `shell_command`.

### 2. Preflight

1. `hoody run test` → `recommended_mode`, `missing_requirements`, `effective_policy`.
2. `hoody run resolve` → resolved command + preview.

### 3. Cursor-paged search

`hoody run search` → `{ set_id, total_count, items, next_cursor }` (note `items`, not `candidates`). The cursor-paged endpoint returns one page per call; carry `next_cursor` forward until it's null/absent.

### 4. Batch

`POST /api/v1/run/batch` (HTTP only; no CLI command). `mode:"run"` resolves each item to a command. Each result item is `result: "search"`, `"run"` or `"error"` (the item's own `{ error, code, status }`), so one bad item does not fail the batch. The CLI has no batch command; POST the route with curl against the kit URL, or resolve the apps one by one with `hoody run resolve`.

### 5. Recipes

`hoody run recipes create` with `{ name, selector_template, allowed_overrides }`; invoke it with `hoody run recipes resolve`, passing only the allow-listed fields under `overrides`.

## Quirks & gotchas

- Kit slug/URL/HTTP prefix all `run`. The resolve endpoint answers both `GET /api/v1/run/resolve` (selector in the query string) and `POST /api/v1/run/resolve` (selector as a JSON body). CLI: `hoody run resolve` (POST form), or the bare `hoody run <app>`.
- Every candidate carries a `kind` — `gui` | `cli` | `any` (`any` means the source doesn't classify it). `kind` and `os` in the selector are applied by each source from its own metadata, not by a final filter: system-path results ignore them (and report `kind: any`), nix lets packages it cannot classify through, trusted-list and manifest entries are filtered only when they declare the field, and the nix, pkgx, OCI and AppImage sources return nothing at all for a non-Linux `os` such as `windows`. Inspect the selected candidate and its command before treating it as GUI, CLI or Windows-compatible.
- Omitted selector fields inherit the requested `profile`, or else the kit's selected profile (`os`, `kind`, `source`, `pick`, `terminal_id`, `display`, `limit`). With no profile default, `limit` defaults to 25, clamped 1..=100.
- Candidates are ordered by source priority first (the trusted list outranks system-path and the package sources), then score, then title and id, so the top hit is not always the highest score. Read the returned list and use the actual index or `candidate_id`.
- `candidate_id` is a content hash the kit computes over what the candidate runs, not a readable `<provider>:<path>` string. Copy it from a search response; never build one by hand.
- Query results are cached for about 30 s.
- `set_id` expires 300s.
- Selector requires `app`. Aliases `q`/`name` are accepted ONLY by the urlencoded query-string parser (GET / form-style); the JSON `Selector` model has only `app`, so JSON POST / SDK calls must use `app:`.
- Resolve is command-only; the kit never launches the app or executes anything. The response `status` is `"dry-run"` (one picked candidate), `"printed-curl"` (one picked candidate, plus a `curl` line because `print_curl` was set) or `"resolved"` (pick mode `ask`: the candidate set, nothing selected). Only a picked response carries `handoff` (`{ state: "preview", terminal_id, display, preview_display_url?, preview_terminal_url? }`); a `resolved` response has none. The two preview URLs are predicted for the target `terminal_id` (from an operator URL template when one is set, else from the container's own kit host form), not from the candidate; either is absent only when neither is available, and neither proves anything is running.
- `POST /api/v1/run/batch` (HTTP only; no CLI command) only knows `mode: "search" | "run"` (no `"preflight"`); `"run"` resolves to a command.
- `hoody run recipes resolve` / `hoody run recipes search` reject a recognized selector field outside `allowed_overrides` with `400 OVERRIDE_NOT_ALLOWED` (`recipe override not allowed: <field>`); it is not silently dropped. An unknown key under `overrides` is ignored, so spell the selector field names exactly.
- **Outbound requests the kit makes itself (webhook delivery, remote manifest index fetches, source fetches) go only to public IPv4 addresses.** Private, loopback, link-local, CGNAT, reserved and multicast destinations and every IPv6 form are refused, and a name that resolves to ANY prohibited IPv4 address is refused whole; no setting admits one, so a remote index URL on `localhost` or a sibling container's private address cannot work. Webhooks are configured in the kit's config file only (`GET /api/v1/run/config` is read-only), so this matters mainly when diagnosing a source sync or a webhook someone set up. A refusal carries the marker `refusing to connect to` and is not retried; `the name <host> resolved to no address` carries no marker and is a transient failure. Proxy environment variables are ignored; webhook and remote-index fetches follow no redirects, and source fetches follow at most ten. Helper binaries a provider shells out to (`nix search`) are outside this guarantee.
- `selected.run_plan` carries `command`/`env`/`cwd` and is always present. `selected.execution_plan` (`argv`/`env`/`cwd`) is optional: trusted-list, manifest and AppImage candidates omit it. Read it as optional and use `shell_command` for the command to run.
- `/go/...` are alias routes for bookmarkable resolve URLs — `GET /api/v1/run/go/{rest}` (selector parsed from path segments) and `GET /api/v1/run/t/{terminal_id}/go/{rest}` (terminal id baked into the path prefix, where it wins over any other `terminal_id`). Both are public HTTP routes, but neither has an SDK method: programmatic callers use the resolve endpoint from the first bullet. The CLI reaches only the first, as `hoody run resolve <path>`; `--terminal-id N` sends `terminal_id=N` as a query parameter on that same route.
- CLI: `hoody run <app>` resolves an app to a command (e.g. `hoody run firefox`). Bare `run` PRINTS the command on stdout (context — `title · provider · kind · score`, viewer URLs, warnings — on stderr) and launches nothing; the run kit stays a pure resolver.
- CLI `--open`: after resolving, the CLI executes the command in the container for you (via the terminal kit's `POST /api/v1/terminal/execute`, detached with `wait:false`) — the run kit still never executes. `--open` needs a single pick, so it can't combine with `--pick ask` (or an unpicked candidate set); use `--pick first|id|index`. In `--open` mode the PRIMARY viewer URL goes to stdout (display URL for a GUI app, terminal URL for a CLI app).
- CLI GUI apps: a `kind:'gui'` result is launched with `DISPLAY` pointed at the handoff's display and surfaces BOTH a display URL (where it renders) and a terminal URL; a `kind:'cli'` result surfaces the terminal URL. Without `--open`, the resolver's `handoff.preview_*_url` is used when set and the URL built from the container's kit routing (`display-{n}` / `terminal-{n}`) is the fallback. With `--open` the order is reversed: the built kit URL first, the preview URL as the fallback. A CLI app never gets a display URL, even when the resolver set `preview_display_url`.
- CLI `--browser`: with `--open`, also opens the primary viewer URL in the local browser (implies `--open`; falls back to printing the URL when headless).

## Common errors

Every error body is `{ "error": "<text>", "code": "<code>", "status": <HTTP status> }`. Match on the symbolic `code` and the HTTP `status`; a batch error item carries the same payload under `error`.

- `400 INVALID_PICK` (`pick_index required`, `pick_index out of range: <N>`, `candidate_id required`, `candidate_id not found`) or `400 NO_CANDIDATES` (`no candidates`): the pick does not match the candidate set.
- `400 INVALID_SELECTOR: invalid <field>: <value>`: a query-string selector value is not accepted, for example an unknown `source`.
- `400 INVALID_BODY` with a deserialization message: a JSON body carries a value that is not in the field's enum (for example `"kind":"create"`), misses a required field or has a wrongly typed one.
- `409 SET_EXPIRED`: an index pick (`pick_index`) names a `set_id` that is unknown or older than 300 s and is not the freshly resolved set; search again and pick against the new `set_id`. An id pick (`candidate_id`) does not get this error: it falls back to the fresh set, since `candidate_id` is content-addressed.
- `403 POLICY_DENIED: …`: the effective policy does not permit the selected candidate.
- `409 CURSOR_SET_EXPIRED` (`cursor set expired`): `search/paged` only; start again without a cursor.
- A single source such as `nix` or `pkgx` that fails or is missing does not fail the request: the search continues with the other sources and can return an empty list (a pick against it then gives `400 NO_CANDIDATES`). An error the source reports is recorded in its diagnostics (`GET /api/v1/run/sources/{source_id}/diagnostics`), but some sources, `pkgx` among them, turn a missing tool or a failed query into an empty successful result, so the diagnostics can show no error at all. `502 SOURCE_RESOLUTION_FAILED` is reserved for a resolution that fails as a whole.
- `404 JOB_NOT_FOUND` (`job not found`): the job id is unknown or its TTL ran out (see example 7).

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. When no profile sets a default, an omitted `pick` returns the candidates without selecting one; send `pick:"ask"` explicitly to be sure nothing is selected. The bare `hoody run <app>` CLI defaults to `--pick first` instead; pass `--pick ask` to keep the selection pending.

**Step 1 — resolve to a command.** `hoody run firefox` resolves with `--pick first`, which picks from a freshly resolved list. To pin a list you displayed, run `hoody run search --app firefox` and then `hoody run resolve --app firefox --set-id <set_id> --pick index --pick-index 0`.

```bash
# Print the command (resolver only — nothing runs):
hoody run firefox -c "$C"
# → nix run nixpkgs#firefox        (stdout; title/provider/kind/score + viewer URLs on stderr)

# Launch it in the container (detached) and print the viewer URLs.
# firefox is a GUI app, so you get BOTH a display URL and a terminal URL:
hoody run firefox -c "$C" --open
#   Firefox · registry · gui · score 337
#   command: nix run nixpkgs#firefox
#   launched (detached) in terminal 1 on display :1.
#   display:  https://<P>-<C>-display-1.<N>.containers.hoody.com/     (stderr)
#   terminal: https://<P>-<C>-terminal-1.<N>.containers.hoody.com/    (stderr)
# → https://<P>-<C>-display-1.<N>.containers.hoody.com/               (stdout: primary viewer)

# Launch AND open the display in your local browser:
hoody run firefox -c "$C" --browser
```

### 2. Resolve to a command and read the execution plan

**Goal:** get the exact command plus its structured plan. Lightweight CLI app (`echo`) used so we don't leak GUI state.

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the shell-form, always present) and, when the source provides one, `execution_plan.{argv,env,cwd}` (the argv-form; trusted-list, manifest and AppImage candidates have none). `shell_command` is the command to run either way. A picked response also carries `handoff`; its `preview_display_url` / `preview_terminal_url` come from an operator URL template when one is set, else from the container's own kit host form, and are absent only when neither is available; they are built for the target terminal, not from the candidate. Resolve itself never launches anything.

```bash
hoody --container "$C" run resolve --app echo --kind cli --pick first -o json \
  | jq '{status, shell_command, argv: .selected.execution_plan.argv, preview_terminal_url: .handoff.preview_terminal_url}'
```

### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` matches several candidates and you want one other than the first (say the `pkgx` one). Positions depend on source priority and on which sources are available, so list the candidates, find the index of the one you want, and bind the pick to the `set_id` so the list cannot shift under you. The examples below use index 2; use the index you actually found.

**Step 1 — list candidates with `set_id`.**

```bash
hoody --container "$C" run search --app git --selector-kind cli --page-size 5 -o json \
  | jq '{set_id, listing: (.items | to_entries | map({i: .key, id: .value.candidate_id, provider: .value.provider, score: .value.score}))}'
```

**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

```bash
SET="<paste set_id from step 1>"
hoody --container "$C" run resolve --app git --kind cli --set-id "$SET" --pick index --pick-index 2 -o json \
  | jq '{shell_command, picked: .selected.candidate_id, provider: .selected.provider}'
```

**Pick by id alternative** — use `pick: 'id'` + `candidate_id`, copying the exact `candidate_id` from the step 1 response. It is a content hash, so never build one from the provider or the executable path.

```bash
CID="<paste candidate_id from step 1>"
hoody --container "$C" run resolve --app git --kind cli --set-id "$SET" --pick id --candidate-id "$CID" -o json | jq .shell_command
```

### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → the profile's default sources if a profile sets them, otherwise no filter; `source:["any"]` always means no source filter. `kind`, `os` and `arch` are passed to each source, which applies them only as far as its metadata allows (see Quirks).

```bash
# --selector-source is repeatable (or comma-separated): --selector-source system --selector-source registry
hoody --container "$C" run search --app jq --selector-os linux --selector-arch amd64 --selector-kind cli --selector-source system --page-size 5 -o json \
  | jq '{count: (.items|length), providers: [.items[].provider]}'
```

**Tags** are accepted and passed to sources and recipe templates, but the kit does not use them to rank or filter candidates, so do not rely on them to narrow a search. Filtering by `kind: 'gui'` or `os: 'windows'` (Wine-runnable variants) is up to each source: system-path ignores both, trusted-list and manifest entries are filtered on the fields they declare, and nix, pkgx, OCI and AppImage return no candidates at all for a Windows `os`, even though their candidates carry no kind classification.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

```bash
hoody --container "$C" run test --app xeyes --kind gui --pick first -o json \
  | jq '{recommended_mode, missing_requirements, policy: .effective_policy}'
```

### 6. Pagination — walk a long candidate list with `search`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

```bash
RESP=$(hoody --container "$C" run search --app git --selector-kind cli --page-size 3 -o json)
echo "$RESP" | jq '{total_count, count: (.items|length), next_cursor}'
CURSOR=$(echo "$RESP" | jq -r .next_cursor)
```

**Step 2 — fetch all pages.** The `search/paged` endpoint returns one page per call; carry `next_cursor` between calls until it's null/absent.

```bash
while [ -n "$CURSOR" ] && [ "$CURSOR" != "null" ]; do
  RESP=$(hoody --container "$C" run search --app git --selector-kind cli --page-size 3 --cursor "$CURSOR" -o json)
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
JID=$(hoody --container "$C" run jobs search create --app firefox --kind any -o json | jq -r .job_id)
```

**Step 2 — wait for the result.** Status transitions `queued → running → done`, or ends in `error`, or in `cancelled` after a cancel request; all three are final, so stop polling on any of them. The job's TTL restarts only when its state changes, not when it is read, so polling does not keep a finished job alive; a caller that comes back too late gets `404 JOB_NOT_FOUND`. Long-poll with `wait=done` and `timeout_ms` (max 120000) so the call returns as soon as the job finishes, and read the result from that response.

```bash
# Keep --timeout-ms below the CLI's default 30 s request timeout.
hoody --container "$C" run jobs get "$JID" --wait done --timeout-ms 25000 -o json | jq '{status, result}'
# Repeat while status is still queued or running.
```

### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` (HTTP only; no CLI command) accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response), `result: 'run'` (with `selected` + `shell_command`) or `result: 'error'` (with `error: { error, code, status }` for that item only; the rest of the batch still runs).
The CLI has no batch command. POST `{ items: [...] }` to `/api/v1/run/batch` with curl against the kit URL, or run `hoody run resolve` once per app.

### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; a recognized selector field under `overrides` that is outside it is rejected with `400 "recipe override not allowed: <field>"` on `hoody run recipes resolve` — update the recipe to widen the allow-list. An unknown key is ignored, not rejected.

```bash
hoody --container "$C" run recipes create --name team-js-runtime \
  --description 'Resolve a JS runtime; team-default = node CLI' \
  --selector-template-app node --selector-template-kind cli \
  --selector-template-os linux --selector-template-arch amd64 --selector-template-pick first \
  --allowed-overrides app,version,tags
```

**Step 2 — list / get / update / delete.**

```bash
hoody --container "$C" run recipes list
hoody --container "$C" run recipes get team-js-runtime -o json
hoody --container "$C" run recipes update team-js-runtime --description 'Updated: now also resolves bun/deno via override'
# After example 10 (it uses this recipe):
# hoody --container "$C" run recipes delete team-js-runtime -y
```

### 10. Invoke a recipe with overrides — `hoody run recipes resolve <name>`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `resolve` (`{ status, shell_command, selected, ... }`).

```bash
hoody --container "$C" run recipes resolve team-js-runtime --overrides-app bun -o json \
  | jq '{status, shell_command, picked: .selected.candidate_id}'
```

**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `hoody run recipes search`:

```bash
hoody --container "$C" run recipes search team-js-runtime --overrides-app node -o json \
  | jq '{set_id, count: (.candidates|length), providers: [.candidates[].provider] | unique}'
```

⚠ A recognized selector field outside `allowed_overrides` is **rejected** with `400 "recipe override not allowed: <field>"`, not silently dropped; a key that is not a selector field at all is ignored, so spell field names exactly. Use `hoody run recipes update` to widen the allow-list.

## Reference

### `hoody run` (30) — Application resolution across multiple package sources (Hoody Run)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody run config get` |  | read | Show the stored configuration: sources, profiles and the active profile | `run.config.get` | `hoody run config get` |
| `hoody run health` |  | read | Check hoody-run service health |  | `hoody run health` |
| `hoody run jobs cancel` |  | action | Cancel a queued or running search job | `run.jobs.cancel` | `hoody run jobs cancel abc-123` |
| `hoody run jobs get` |  | read | Get the status of a job | `run.jobs.get` | `hoody run jobs get abc-123 --wait done --timeout-ms 0` |
| `hoody run jobs list` |  | read | List the background jobs the service still holds, newest first | `run.jobs.list` | `hoody run jobs list --kind search-resolve --status queued` |
| `hoody run jobs search create` |  | action | Start a background search job and return its handle | `run.jobs.createSearch` | `hoody run jobs search create --app firefox --os linux --kind gui` |
| `hoody run open` |  | action | Open the Run kit results page for an app in your browser |  | `hoody run open --app APP` |
| `hoody run profiles create` |  | write | Create a profile | `run.profiles.create` | `hoody run profiles create --name default --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles delete` |  | destructive | Delete a profile | `run.profiles.delete` | `hoody run profiles delete default -y` |
| `hoody run profiles list` |  | read | List profiles | `run.profiles.list` | `hoody run profiles list` |
| `hoody run profiles update` |  | write | Update a profile | `run.profiles.update` | `hoody run profiles update default --description 'Default profile (inherits global sources)' --defaults-os linux` |
| `hoody run profiles use` |  | write | Make a profile the active one | `run.profiles.use` | `hoody run profiles use default` |
| `hoody run recipes create` |  | write | Save a launch recipe | `run.recipes.create` | `hoody run recipes create --name my-resource --description 'My description' --selector-template-app firefox` |
| `hoody run recipes delete` |  | destructive | Delete a saved recipe | `run.recipes.delete` | `hoody run recipes delete my-resource -y` |
| `hoody run recipes get` |  | read | Show a saved recipe | `run.recipes.get` | `hoody run recipes get my-resource` |
| `hoody run recipes list` |  | read | List saved launch recipes | `run.recipes.list` | `hoody run recipes list` |
| `hoody run recipes resolve` |  | action | Resolve a saved recipe to a shell command | `run.recipes.resolve` | `hoody run recipes resolve my-resource --overrides-app firefox --overrides-os linux` |
| `hoody run recipes search` |  | read | Search candidates using a saved recipe | `run.recipes.search` | `hoody run recipes search my-resource --overrides-app firefox --overrides-os linux` |
| `hoody run recipes update` |  | write | Update a saved recipe | `run.recipes.update` | `hoody run recipes update my-resource --description 'My description' --selector-template-app firefox` |
| `hoody run resolve` |  | action | Resolve an app to an exact shell command | `run.resolve` | `hoody run resolve --app firefox --os linux --kind gui` |
| `hoody run resolve` |  | action | Resolve an app by path to an exact shell command |  | `hoody run resolve --app firefox --os linux --kind gui` |
| `hoody run search` |  | read | Search candidates page by page with a cursor | `run.search` | `hoody run search --app firefox --selector-os linux --selector-kind gui` |
| `hoody run sources create` |  | write | Add a package source | `run.sources.create` | `hoody run sources create --source-id nixpkgs --enabled --priority 100 --provider nix --source-type nix-pkgs --pin-url https://github.com/numtide/llm-agents.nix --source-config flake=nixpkgs` |
| `hoody run sources delete` |  | destructive | Remove a package source | `run.sources.delete` | `hoody run sources delete abc-123 -y` |
| `hoody run sources diagnostics get` |  | read | Show runtime health for a source: last error, last search latency, last sync job | `run.sources.getDiagnostics` | `hoody run sources diagnostics get abc-123` |
| `hoody run sources list` |  | read | List configured package sources | `run.sources.list` | `hoody run sources list` |
| `hoody run sources sync` |  | action | Sync one source and return the job | `run.sources.sync` | `hoody run sources sync abc-123` |
| `hoody run sources sync` |  | action | Sync every source and return the job | `run.sources.syncAll` | `hoody run sources sync abc-123` |
| `hoody run sources update` |  | write | Update a package source | `run.sources.update` | `hoody run sources update abc-123 --enabled --priority 100` |
| `hoody run test` |  | read | Plan a run and show the command, missing requirements and effective policy | `run.test` | `hoody run test --app firefox --os linux --kind gui` |


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

- Absolute paths outside `/hoody/databases` are refused unless the deployment allows any absolute database path.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`hoody db create --path <p> --init-kv` (`--path`: bare name, `./name`, or absolute under `/hoody/databases`; `--init-kv` creates the KV table) → `hoody db transactions run --db <p> --transaction '[{"statement":"..."}]'` (add `--create-db-if-missing` to make the create step optional) → `hoody db history list --db <p>`.

### KV CRUD + CAS + counters

- `hoody kv set` — `ttl`, `if_match` (CAS on the value, the `--if-value` flag; `--if-match` is the ETag header), `path`, `history`.
- `hoody kv get` — `path`, `at_timestamp`. `hoody kv exists` takes `db`, plus optional `table` and `timeout`; `hoody kv delete` takes `db`/`table`/`history` (`history`, default true, records the deleted value; `false` records only that a delete happened) plus `create_db_if_missing` (alias `auto_create`) and `timeout`.
- `hoody kv increment` / `hoody kv decrement` / `hoody kv arrays push` / `hoody kv arrays pop` / `hoody kv arrays remove` — atomic, `path`-aware (`path` is a JSON path inside the value, such as `.user.tags`). The push body is any JSON value, appended as one element; the remove body is `{"value": <any>}` (matches by value), or pass the `index` query parameter instead. 

### Time-travel (needs `history: true`)

- `hoody kv history list` (default 50, max 1000); `hoody kv snapshots get` at `op_number`.
- `hoody kv table snapshots get` / `hoody kv table snapshots compare` — Unix `timestamp` in seconds (milliseconds are rejected as "in the future") / diff.
- `hoody kv rollback` last N; `hoody kv table rollback`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). The body is optional: omit it for a full-table rollback, or send `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope it. Add `--keys` / `--exclude-keys` only when scoping.

### Bulk + shareable

- `hoody kv batch set`/`hoody kv batch delete` — one SQLite transaction each. `hoody kv batch get` — one HTTP request that reads every key in one read-only SQLite transaction, with one expiry check time, so the result is one consistent snapshot.
- `hoody db readonly query` — GET, URL-safe base64 `sql`, read-only. `hoody db health`/`hoody db cache stats`.

## Quirks & gotchas

- **Bare-URL auth.** The `sqlite` kit checks no credential of its own; access through the kit URL is governed by the container proxy's permission policy. Under the default policy (no rules configured) the bare kit URL works with no extra headers and is itself the bearer; where the owner has configured auth groups, send the credential the group expects, or the proxy answers 401 or 403. → See `SKILL-CLI.md § Kit URLs as credentials`.
- **Tx item keys: `"query"` and `statement`.** Each `transaction[i]` MUST carry exactly one of `"query"` or `statement`. A `statement` returns rows (`resultHeaders`/`resultSet`) when its SQL produces columns (a SELECT, or a write with `RETURNING`), and `rowsUpdated` otherwise. Use `"query"` for reads anyway; `valuesBatch` keeps its own restrictions. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). The `./name` shorthand is the same bare name (`./app` → `/hoody/databases/app.db`). Any other relative path containing `/` or `\` (e.g. `data/app.db`, `./dir/app.db`) is **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Absolute paths outside `/hoody/databases` are refused unless the deployment allows any absolute database path. A database filename must be a regular file: a symlink at the filename itself is rejected. Symlinked parent directories are resolved to their real path. `:memory:` databases are rejected.
- Directory mode takes an absolute directory path. Any other relative path (`sub/dir`) is refused with `directory-mode: invalid path input: path must be absolute`; a bare database name (`app`) is not treated as a directory and is opened as a database instead.
- Tx items: `statement` or alias `sql`. `hoody db transactions run` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), any PRAGMA, VACUUM, ATTACH/DETACH — only a single statement leading with SELECT, or a WITH that contains no write keyword, is accepted. Use `hoody db transactions run` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`hoody kv set` body is any JSON value** (object, array, string, number, boolean, null), stored verbatim. **`hoody kv batch set` differs:** each item's `value` is a string, so JSON-encode objects yourself.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to record only that the write happened, not what it wrote — but later `hoody kv history list` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `hoody kv list` w/ `at_timestamp` → time-travel handler (different envelope; `offset` and `limit` still apply, ordered by key as in the regular listing). The history `limit`: 0→50, >1000→1000.
- `hoody db readonly query` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — under the default proxy policy the kit URL alone is the credential, share carefully.
- A directory-mode KV store keeps a `.hoody_sqlite/cache.db` in each directory it uses and holds it open, so that file and its `-wal`, `-shm` and `-journal` companions can be neither created nor deleted as a database (`400 INVALID_DB_PATH`). Any other database inside a `.hoody_sqlite` directory is an ordinary database.
- CLI: `hoody db` (short form `sql`); KV under `hoody kv`.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute` (directory mode given a relative path).
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 invalid database name; allowed: letters, numbers, dot, dash, underscore` for `:memory:` (and any other bare name with characters outside that set). An absolute path containing `:memory:` gets `400 in-memory databases are not supported` instead.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `hoody kv batch set` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409` with `"error": "TIME_TRAVEL_CHAIN_GAP"` (message `time-travel: chain gap straddles target timestamp`) when the history needed for the answer has an unrecorded (`history: false`) or pruned gap. Timestamp reads, `hoody kv snapshots get` at an `op_number`, and the rollbacks (`hoody kv rollback`, `hoody kv table rollback`) all return it. Per-key rollback puts the detail in `error` after the code (`"TIME_TRAVEL_CHAIN_GAP: ..."`); table rollback returns `error: "TIME_TRAVEL_CHAIN_GAP"` and puts the detail in `message`.
- A failing transaction item aborts and rolls back the whole transaction by default: the response is that item's HTTP status (4xx or 5xx) with `{ "reqIdx": <index>, "error": "...", "code": "..." }`. A failure of your own SQL is classified: `400 SQL_ERROR` (syntax, unknown table or column) or `400 SQL_BIND_ERROR` (parameters that do not fit the statement), `409 SQL_CONSTRAINT` or `409 DATABASE_READONLY`, which carry SQLite's message, and `503 DATABASE_BUSY` or `503 REQUEST_TIMEOUT`, which carry the generic `internal database error` (no 5xx body carries SQLite's text). Anything else is `500 DATABASE_ERROR` with the same generic message, so do not retry it blindly. Set `"noFail": true` on an item to keep going after a failure that leaves the transaction active: the call returns `200`, and that item's result is `{ "success": false, "error": "...", "code": "..." }` (no `reqIdx`). A conflict that rolls back the transaction itself (`INSERT OR ROLLBACK`, or `RAISE(ROLLBACK)` in a trigger) still ends the request with `409 SQL_CONSTRAINT` even under `noFail`, and nothing is committed. A `valuesBatch` item under `noFail` can instead succeed in part: rows with bad parameters are skipped and listed in `rowErrors` while `success` is `true`, so inspect `rowErrors` too. = responseItem{"]

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree are refused unless the deployment allows any absolute database path.

**Two SQL field names:** in a transaction item, use the `"query":"..."` key for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key for DDL/DML (returns `rowsUpdated`, or rows when the SQL produces columns, such as a write with `RETURNING`). The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/hoody/databases/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```bash
DB="/hoody/databases/sqlite-examples-$RANDOM.db"
hoody --container "$C" db create --path "$DB" --init-kv
```

**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[
  {"statement":"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)"},
  {"statement":"CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"},
  {"statement":"INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)","values":["Ada","ada@example.com",1778191500]}
]'
```

**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (the read key; a `statement` that produces columns also returns them).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[{"query":"SELECT id, name, email FROM users"}]'
```

### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `hoody kv exists` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the value; the kit records the request's `Content-Type` as the key's `content_type` (default `application/octet-stream`), so send JSON with `Content-Type: application/json`. Query params carry `ttl` in seconds.

```bash
hoody --container "$C" kv set 'session:alex' --db "$DB" --ttl 60 \
  --body '{"user_id":"d6ec...","scopes":["read","write"]}'
```

**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses. A HEAD answer has no body, so the 404 names its reason in the `X-Hoody-Error-Code` header: `KEY_NOT_FOUND` or `KEY_EXPIRED`.

```bash
hoody --container "$C" kv exists 'session:alex' --db "$DB"
```

**Step 3 — explicit delete** (don't wait for TTL). `hoody kv delete` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `hoody kv get`.

```bash
hoody --container "$C" kv delete 'session:alex' --db "$DB" -y
```

### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```bash
hoody --container "$C" kv set config --db "$DB" --body '{"version":1,"feature_x":false}'
```

**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```bash
# CAS compares BYTE-EXACT. The CLI parses a JSON value and re-prints it (even with
# -o raw, an object comes back pretty-printed), so reuse the exact bytes you wrote:
CUR='{"version":1,"feature_x":false}'
# (to compare against the stored bytes instead, read them with a raw HTTP GET of the key)
hoody --container "$C" kv set config --db "$DB" --if-value "$CUR" \
  --body '{"version":2,"feature_x":true}'
```

**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```bash
hoody --container "$C" kv set config --db "$DB" --if-value 'stale' --body '{"version":99}' || echo 'CAS rejected as expected'
```

### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `hoody kv increment` / `hoody kv decrement` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `hoody kv decrement` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```bash
hoody --container "$C" kv increment 'rate:alex:hour' --db "$DB" --delta 1
```

**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `hoody kv decrement` to go the other way — a negative `delta` is rejected with `400`.

```bash
hoody --container "$C" kv increment 'rate:alex:hour' --db "$DB" --delta 10
```

**Step 3 — burn down by 3** (e.g. consume 3 quota units). The HTTP body of the final read is the plain integer. 

```bash
hoody --container "$C" kv decrement 'rate:alex:hour' --db "$DB" --delta 3
hoody --container "$C" kv get  'rate:alex:hour' --db "$DB"
```

### 5. JSON-path read & partial update on a nested doc

**Goal:** stash a user-prefs document, read **one** field with `path=`, then mutate **only** that field without rewriting the whole blob. The path applies to both reads and writes.

**Step 1 — seed full document.**

```bash
hoody --container "$C" kv set profile --db "$DB" --body '{"name":"Ada","prefs":{"theme":"dark","lang":"en"}}'
```

**Step 2 — read just `prefs.theme`**: returns the leaf value (`"dark"`), not the parent object.

```bash
hoody --container "$C" kv get profile --db "$DB" --path prefs.theme
```

**Step 3 — patch one leaf**. The PUT body is the **new leaf value** (here `"light"`), not the full document. `lang` and `name` are untouched.

```bash
hoody --container "$C" kv set profile --db "$DB" --path prefs.theme --body '"light"'
```

### 6. Time-travel — record three states of a feature flag, roll back two

**Goal:** undo the last two writes on a key without losing earlier history. Requires `history=true` on every write you want to be reversible.

**Step 1 — three sequential states** with history recording.

```bash
for v in '{"chat":false,"voice":false}' '{"chat":true,"voice":false}' '{"chat":true,"voice":true}'; do
  hoody --container "$C" kv set feature-flags --db "$DB" --history --body "$v"
done
```

**Step 2 — inspect history** (`hoody kv history list` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` carry the value bytes in base64 for every content type, JSON included).

```bash
hoody --container "$C" kv history list feature-flags --db "$DB" --limit 10
```

**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```bash
hoody --container "$C" kv rollback feature-flags --db "$DB" --steps 2
hoody --container "$C" kv get      feature-flags --db "$DB"
```

### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `hoody kv snapshots get` (per-key, by `op_number`) and `hoody kv table snapshots compare` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```bash
hoody --container "$C" kv snapshots get feature-flags --db "$DB" --op-number 1
```

**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```bash
FROM=$(date +%s); sleep 1
hoody --container "$C" kv set cmp-test --db "$DB" --history --body '{"v":1}'
sleep 1; TO=$(date +%s)
```

**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```bash
hoody --container "$C" kv table snapshots compare --db "$DB" --from "$FROM" --to "$TO"
```

### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. `hoody kv batch set` and `hoody kv batch delete` each run in one SQLite transaction; `hoody kv batch get` reads every key in one read transaction, so the result is one consistent snapshot. Cap is 100 items per batch.

**Important wire-format detail:** in `hoody kv batch set`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```bash
hoody --container "$C" kv batch set --db "$DB" --items '[
  {"key":"u:1","value":"{\"name\":\"alice\"}","content_type":"application/json"},
  {"key":"u:2","value":"{\"name\":\"bob\"}","content_type":"application/json"},
  {"key":"u:3","value":"{\"name\":\"carol\"}","content_type":"application/json","ttl":3600}
]'
```

**Step 2 — bulk get** (missing keys come back as `null`; present ones as `{content_type, value}` when `content_type` is JSON, otherwise as `{content_type, value_base64}`). A `hoody kv batch set` item written without `content_type` is stored as `application/octet-stream` and so comes back base64-encoded; set `content_type: application/json`, as step 1 does, to get parsed JSON back.

```bash
hoody --container "$C" kv batch get --db "$DB" --keys u:1,u:2,u:3,u:404
```

**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```bash
hoody --container "$C" kv batch delete --db "$DB" --keys u:1,u:2,u:3
```

### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** build a reusable GET URL that runs a SELECT. The `/query` route itself rejects writes, but the URL is not a restricted credential: it carries the kit URL, which also reaches every other route of this kit (including mutating `POST /db`) and has no expiry of its own. Share it only where you would share the kit URL itself. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted.

**Step 1 — encode** the query.

```bash
SQL='SELECT id, name, email FROM users LIMIT 10'
# `db readonly query` does NOT auto-encode the SQL; pre-encode to URL-safe
# base64 (padding optional) the same way the HTTP example does:
SQL_B64=$(printf '%s' "$SQL" | base64 -w0 | tr '+/' '-_')
hoody --container "$C" db readonly query --db "$DB" --sql "$SQL_B64"
```

**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```bash
# Step 1 already executed it
:
```

**Step 3 — paste-able URL** (e.g. dashboard link). Under the default proxy policy the kit URL itself is the auth grant — guard who you share it with. Where the owner has configured auth groups, the link also needs the credential the proxy expects, and the query URL grants nothing beyond that policy.

```bash
# `--url` is NOT a flag on `db readonly query` (it belongs to `db open`);
# compose a pasteable URL by hand if you want one:
echo "https://${P}-${C}-sqlite-1.${N}.containers.hoody.com/api/v1/sqlite/query?db=${DB}&sql=${SQL_B64}"
```

### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) with one transaction item that repeats a single SQL statement once per parameter row, instead of one tx item per row. Without `noFail: true` the rows of an item commit or fail together. With `noFail: true`, a row whose parameters do not parse or do not fit the placeholders is skipped and the valid rows still commit: the item answers `success: true` with a `rowErrors` list, so check it. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[{
  "statement":"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
  "valuesBatch":[["Bob","bob@example.com",1778000000],["Carol","carol@example.com",1778000100],["Dan","dan@example.com",1778000200]]
}]'
```

**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key).

```bash
hoody --container "$C" db transactions run --db "$DB" --transaction '[{"query":"SELECT COUNT(*) AS n FROM users"}]'
```

**Step 3 — clean up** (delete the throwaway database through the kit, which also removes its `-wal`, `-shm` and `-journal` files, or leave it in place).

```bash
hoody --container "$C" db delete --db "$DB" -y
```

## Reference

### `hoody db` (13) — SQLite database operations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody db cache stats` |  | read | Database connection cache snapshot | `sqlite.kit.getCacheStats` | `hoody db cache stats` |
| `hoody db create` |  | write | Create new SQLite database | `sqlite.databases.create` | `hoody db create --path /hoody/databases/app.db --init-kv --kv-table kv_store` |
| `hoody db delete` |  | destructive | Permanently delete a SQLite database and its -wal, -shm and -journal files | `sqlite.databases.delete` | `hoody db delete --db /hoody/databases/app.db --timeout 30 -y` |
| `hoody db health` |  | read | Service health check | `sqlite.kit.getHealth` | `hoody db health --verbose` |
| `hoody db history clear` |  | destructive | Clear query history | `sqlite.history.clear` | `hoody db history clear --db <db> --timeout 30` |
| `hoody db history delete` |  | destructive | Delete history entry | `sqlite.history.delete` | `hoody db history delete 10 --db <db> --timeout 30 -y` |
| `hoody db history list` |  | read | Get query history | `sqlite.history.list` | `hoody db history list --db <db> --limit 100 --offset 0` |
| `hoody db history stats` |  | read | Get history statistics | `sqlite.history.getStats` | `hoody db history stats --db <db> --timeout 30` |
| `hoody db list` |  | read | List the databases in a directory | `sqlite.databases.list` | `hoody db list --dir /hoody/databases --timeout 30` |
| `hoody db maintenance run` |  | write | Run a maintenance operation on a database | `sqlite.databases.runMaintenance` | `hoody db maintenance run --db /hoody/databases/app.db --timeout 30 --dest-path /hoody/databases/backup.db --op wal_checkpoint_truncate` |
| `hoody db open` |  | action | Open the SQLite kit studio in your browser |  | `hoody db open` |
| `hoody db readonly query` |  | action | Execute shareable SQL query | `sqlite.sql.queryReadOnly` | `hoody db readonly query --db <db> --sql 'SELECT 1' --timeout 30` |
| `hoody db transactions run` |  | action | Execute SQL transaction | `sqlite.sql.runTransaction` | `hoody db transactions run --db /hoody/databases/app.db --create-db-if-missing --timeout 30 --transaction '[{"statement":"CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY)"}]'` |

### `hoody kv` (25) — Key-value store

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody kv arrays pop` |  | write | Remove from array end | `sqlite.kv.pop` | `hoody kv arrays pop <key> --db <db> --table kv_store --path .items` |
| `hoody kv arrays push` |  | write | Append to array | `sqlite.kv.push` | `hoody kv arrays push tags --db /hoody/databases/app.db --table kv_store --path .user.achievements --body '{}'` |
| `hoody kv arrays remove` |  | destructive | Remove array element | `sqlite.kv.remove` | `hoody kv arrays remove <key> --db <db> --table kv_store --path .items -y` |
| `hoody kv batch delete` |  | write | Batch delete multiple keys | `sqlite.kv.deleteMany` | `hoody kv batch delete --db <db> --table kv_store --history --keys <keys>` |
| `hoody kv batch get` |  | read | Batch get multiple keys | `sqlite.kv.getMany` | `hoody kv batch get --db /hoody/databases/app.db --table kv_store --timeout 30 --keys <keys>` |
| `hoody kv batch set` |  | write | Batch set multiple keys | `sqlite.kv.setMany` | `hoody kv batch set --db <db> --table kv_store --history --items '[{"key":"<key>"}]'` |
| `hoody kv changes list` |  | read | List the changes made to a KV table | `sqlite.kv.listChanges` | `hoody kv changes list --db <db> --table kv_store --since <cursor>` |
| `hoody kv changes stream` |  | read | Stream the changes made to a KV table live | `sqlite.kv.streamChanges` | `hoody kv changes stream --db <db> --table kv_store --since <cursor>` |
| `hoody kv decrement` |  | write | Atomic decrement | `sqlite.kv.decrement` | `hoody kv decrement <key> --db <db> --table kv_store --delta 1` |
| `hoody kv delete` |  | destructive | Delete key | `sqlite.kv.delete` | `hoody kv delete <key> --db <db> --table kv_store --history -y` |
| `hoody kv entry get` |  | read | Show a key's value with its metadata (content type, ETag, timestamps, expiry) | `sqlite.kv.getEntry` | `hoody kv entry get user:123 --db /hoody/databases/app.db --table kv_store --timeout 30` |
| `hoody kv exists` |  | read | Check if key exists | `sqlite.kv.exists` | `hoody kv exists <key> --db <db> --table kv_store --timeout 30` |
| `hoody kv get` |  | read | Get value by key | `sqlite.kv.get` | `hoody kv get user:123 --db /hoody/databases/app.db --table kv_store --at-timestamp 1698765432` |
| `hoody kv history list` |  | read | Get key operation history | `sqlite.kv.listHistory` | `hoody kv history list <key> --db <db> --table kv_store --limit 50` |
| `hoody kv increment` |  | write | Atomic increment | `sqlite.kv.increment` | `hoody kv increment counter --db /hoody/databases/app.db --table kv_store --delta 1` |
| `hoody kv list` |  | read | List keys | `sqlite.kv.list` | `hoody kv list --db /hoody/databases/app.db --table kv_store --prefix user:` |
| `hoody kv open` |  | action | Open the SQLite kit studio in your browser (key-value store: --view kvStore) |  | `hoody kv open` |
| `hoody kv rollback` |  | write | Rollback key operations | `sqlite.kv.rollback` | `hoody kv rollback <key> --db <db> --table kv_store --steps 1` |
| `hoody kv set` |  | write | Set value for key | `sqlite.kv.set` | `hoody kv set user:123 --db /hoody/databases/app.db --table kv_store --path .profile.theme --body '{}'` |
| `hoody kv snapshots get` |  | read | Get key snapshot at operation | `sqlite.kv.getSnapshot` | `hoody kv snapshots get <key> --db <db> --table kv_store --op-number 10 --timeout 30` |
| `hoody kv table rollback` |  | write | Rollback entire table | `sqlite.kv.rollbackTable` | `hoody kv table rollback --db <db> --table kv_store --to-timestamp 1750000000 --dry-run` |
| `hoody kv table snapshots compare` |  | read | Compare table snapshots | `sqlite.kv.compareTableSnapshots` | `hoody kv table snapshots compare --db <db> --table kv_store --from 1749996400 --to 1750000000 --timeout 30` |
| `hoody kv table snapshots get` |  | read | Get table snapshot at timestamp | `sqlite.kv.getTableSnapshot` | `hoody kv table snapshots get --db <db> --table kv_store --timestamp 1750000000 --limit 100` |
| `hoody kv ttl clear` |  | write | Remove a key's time to live so it never expires | `sqlite.kv.clearTtl` | `hoody kv ttl clear session:abc --db /hoody/databases/app.db --table kv_store --history` |
| `hoody kv ttl set` |  | write | Set a key's time to live | `sqlite.kv.setTtl` | `hoody kv ttl set session:abc --db /hoody/databases/app.db --table kv_store --ttl 3600 --history` |


---

<!-- ===== namespace: terminal ===== -->

# `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket

## Purpose

Real PTY per container, numeric `terminal_id` (1–65535). REST + WebSocket. Multiplayer; sessions persist.

## When to use

- **Interactive TUIs** that paint the screen (Claude Code, Codex, vim, htop, less, fzf, ssh, etc.) — these need a real PTY; only `terminal` provides one.
- **Durable / long-lived programs that you may need to interact with later** (the agent you spawned, a coding assistant, a chat REPL) — pin a stable `terminal_id` (1–39999) and reattach over WS or REST. When it must be supervised (restarted on exit, started at boot), run it as a `daemon` program with `terminal_id` instead: its terminal is attached the same way (see "Daemon program terminals" below).
- Sequenced commands sharing shell state, keystroke automation, screen capture, regex-search the rendered buffer.
- SSH / SOCKS5 sessions (`ssh_*` / `socks5_*`).
- Host introspection (`hoody terminal system *`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process. A session made by `hoody terminal sessions create` renders on a display only when given `display: N` (the id never sets it); a session first created by `hoody terminal commands run` takes its display from the request URL instead (see Quirks). Keeping ids distinct keeps each terminal-to-display pairing one-to-one. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `40000–65535`, and once one sits inactive with no attached WebSocket client it is removed and its process force-killed: after 60 s when it holds no results, otherwise after `ephemeral-result-timeout` (300 s default). Your Claude Code / Codex session would die at that point.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- A script that should be callable over HTTP → `exec`. (A one-off shell command fits `terminal` itself: ephemeral, workflow 2. When its logs must outlive the response, use `hoody daemon ephemeral programs start`.)
- File I/O → `files`. GUI rendering → `display`. Schedule → `cron`.

## Prerequisites

- Container with `terminal` kit running; capability URL.
- SSH needs reachable `ssh_host:ssh_port`; automation needs existing `terminal_id`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Persistent interactive session

`hoody terminal sessions create` (pin `terminal_id` or `ephemeral=true`) → `hoody terminal commands run` (body `wait` defaults to `true` and asks for a synchronous result, but SSH sessions, `defer_pid` commands and a server at its concurrent-wait cap answer asynchronously — check `status` and poll `hoody terminal commands get` by `command_id`; send body `wait: false` for an async `command_id`; shares shell state) → `hoody terminal commands get` → `hoody terminal sessions read`/`hoody terminal sessions screenshots capture` → `hoody terminal sessions delete`. Use `hoody --container "$C" terminal commands run --terminal-id <id> --command '<command>' --no-wait -o json` to start asynchronously and keep the returned `command_id`.

### 2. Ephemeral one-off execute

`hoody terminal commands run` `ephemeral=true`, `wait=true` — auto ID 40000–65535, runs `command`, cleans up. Through the proxy, send it to the `terminal-0` hostname: any other `terminal-N` host pins the request to terminal N, so the command runs inside that terminal and every later execute on that host waits behind it for up to 600 s if it hangs. Later: `hoody terminal commands get` before the session goes: an ephemeral session holding results is removed after `ephemeral-result-timeout` (300 s default) of inactivity with no attached client.

### 3. Automate a TUI

`hoody terminal sessions create` (or `hoody terminal commands run` to launch) → `hoody terminal sessions press` (`Down`/`Enter`/`F2`; `hoody terminal keys list`) → `hoody terminal sessions paste` (`bracketed=true`) → `hoody terminal sessions wait` (`mode`: `stable`, `regex` with a `pattern`, or `either`) → `hoody terminal sessions snapshot get`/`hoody terminal sessions search`.

### 4. Live stream — WebSocket

`hoody terminal sessions connect` at `/api/v1/terminal/ws?terminal_id=…` on the session's `terminal-N` host. After the socket opens, the client must send the initial JSON dimensions message (`{"columns":…,"rows":…}`) before the server sends output. Multiple WS clients attach simultaneously; writes broadcast to PTY. The CLI has no streaming WebSocket reader: `hoody shell --terminal-id N` attaches an interactive PTY instead. Inject from REST via `hoody terminal sessions write` or `hoody terminal sessions press`. `hoody terminal commands cancel` interrupts by `command_id`.

### 5. Container introspection

`hoody terminal processes list`, `hoody terminal processes get`, `hoody terminal processes signal`, `hoody terminal system ports list`, `hoody terminal system stats`, `hoody terminal system displays list`, `hoody terminal system daemon programs list`, `hoody terminal system reboot`/`hoody terminal system shutdown`. `hoody terminal processes list` and `hoody terminal system ports list` answer in a single response with no pages (`hoody terminal processes list` takes `limit`, `sort` and `filter`). Add `-o json` to get the full response bodies.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–39999, **never** the ephemeral range 40000–65535, **never** re-use one another program is on).
2. `hoody terminal sessions create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/home/user'` (or wherever).
3. `hoody terminal commands run` with body `command: 'claude'` (or `codex`, `aider`, `gemini …`) and body `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request. In the CLI: `hoody --container "$C" terminal commands run --terminal-id <id> --command claude --no-wait -o json`.
4. Reattach any time: `hoody --container "$C" shell --terminal-id <id>` for an interactive attach (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or drive it with `hoody terminal sessions press` / `paste`.
5. Tear down only when really done: `hoody terminal sessions delete <terminal-id>`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a container reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `1`, Codex on `2`). If a session needs a display, pass `display: N` explicitly on `hoody terminal sessions create`; distinct ids keep that pairing one-to-one.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. **You must explicitly pair the IDs** — the kit injects `DISPLAY` from the JSON `display` field on `hoody terminal sessions create`; there is no automatic `terminal_id ⇒ DISPLAY=:N` mapping.

1. `hoody terminal sessions create` with a pinned `terminal_id` (e.g. `1`) AND a matching `display: "1"` field (string in the SDK type), so the kit exports `DISPLAY=:1` into the PTY.
2. From that session: `hoody terminal commands run` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-1`.
3. Open the matching display kit URL — `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` (read `projectId`, `containerId`, and `server_name` from `hoody containers get`).
4. Drive the GUI via the `display` namespace:
   - `hoody display screenshots capture` — see what's on screen (turn `base64` on for vision agents).
   - `hoody display input click --x <x> --y <y> --button <button>` — left/right click; `hoody display input type --x <x> --y <y> --text <text>` — click at a point, then type.
   - `hoody display windows search --pattern <pattern> [--name] [--class]` (a `pattern` plus booleans that pick the fields to match) → `hoody display windows focus` / `hoody display windows geometry get` / `hoody display windows active get` to focus + locate.
   - `hoody display input batch act` — bulk input replay; `hoody display input wait` between actions.
5. Tear down: kill the X process via `hoody terminal processes signal` from the terminal session, or `hoody terminal sessions delete` to drop the whole shell + its child GUIs.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=1`↔`display:":1"`, `terminal_id=2`↔`display:":2"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, swap step 3 for the `desktop-<N>` alias (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-CLI.md`). The desktop alias auto-spawns the DE for you; this recipe is for spawning **specific** apps under your own control.

### 8. Daemon program terminals

A daemon program configured with `terminal_id: N` runs on terminal N's PTY, and terminal N belongs to it while the program is configured. Nothing spawns there: shell, cwd, user, env, display, `cmd` and `pid` parameters on that id are ignored.

1. Attach: `hoody daemon programs attach <id|name>` (Ctrl-] detaches and leaves the program running; `--readonly` watches only; `hoody shell --terminal-id N` also reaches the program). Every client sees the same screen, writable clients type into it (Ctrl-C goes to the program), and the program gets the smallest size among the writable clients (read-only clients count only when none is writable).
2. Drive without a WebSocket: snapshot, find, press, mouse, paste, write, wait, raw and screenshot connect to the program on demand. Execute and session create on the id answer `409 DAEMON_TERMINAL`: there is no shell to run a command in.
3. Program not running: the WebSocket closes `4404` `daemon program not running`; REST answers `409 DAEMON_PROGRAM_NOT_RUNNING`. Start it with the daemon, then attach again.
4. Program ends while attached: clients close with `4404` `daemon program ended`, and a pending wait answers `exited`. The next attach reaches the restarted instance on a clean screen.
5. `hoody terminal sessions list` shows every program terminal, opened or not: `daemon_program: true`, `shell: null`, and a `daemon` object (`program_id`, `program_name`, `user`, `enabled`, `running`, `connected`, `ended`); `running` means its launcher is listening; `pid` is the terminal's session leader (the program runs under it) while connected, 0 otherwise, and `cols`/`rows` the terminal's current size (`null` until sized). A local shell already on the id stays listed as that shell (`daemon_program: false`, the program in `daemon`); delete it to reach the program.
6. `hoody terminal sessions delete <terminal-id>` drops the terminal's connection to the program, not the program. A program that starts before anything attaches sees a 0x0 terminal size until the first attach or REST call.

## Quirks & gotchas

- **Sharing a terminal URL = handing out root.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as root: read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `proxy.containerPermissions`. Share only with people you'd trust with `ssh root@…`. For wider audiences, gate (`setPasswordGroup` / `setTokenGroup` / `setIpGroup`), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script over a live PTY (a `display` URL is no read-only alternative: its readonly setting is client-side only, and its holder can still send input).
- `terminal_id` numeric **1–65535**. **40000–65535 reserved for ephemeral**; pin manual IDs in 1–39999.
- `terminal_id=0` (the `terminal-0` host) only starts a new ephemeral session. A WebSocket connection naming zero without `ephemeral=true`, or in agent mode, is refused rather than attached to terminal 1, and `hoody terminal sessions read` on terminal zero answers `400 TERMINAL_ID_ZERO`: use the terminal id returned for the session and its `terminal-N` host.
- **Display pairing.** `hoody terminal sessions create` builds the session's `DISPLAY` from its `display` field and ignores any `display` in the request URL, so there is no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). `hoody terminal commands run` differs: a session it has to create is configured from the request URL, where `display=N` (or the `display_id=N` alias) sets `DISPLAY=:N` — and on a `terminal-N` host that parameter is supplied for you, so a session first created that way already renders on `:N`. `ephemeral=true` still strips it, and an already-running session keeps the `DISPLAY` it spawned with. The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` returns `/execute` immediately even with `wait=true`; queues until named PID exits (TUI-safe), for at most `defer_timeout_ms` (60000 ms default) — on expiry the command never runs.
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is plain UTF-8, not base64; only the URL-form `?cmd=<base64>` is base64-decoded.** The kit wraps the command with shell bookkeeping (optional `cd`, environment prefix, exit-code capture, completion-marker echo) before it reaches the PTY; for direct interactive input use `hoody terminal sessions write`, `hoody terminal sessions paste` or `hoody terminal sessions press`.
- **`/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A `terminal_id` in the body is ignored; with no `?terminal_id` the request is `400 terminal_id parameter required`. With body `mode: "raw"` the command runs as a one-shot process with no terminal session, and `terminal_id` is ignored.
- Completion normally comes from the `COMMAND_COMPLETED_MARKER_{id}` tail, stripped before `/result/{id}`. A command is also marked completed when the session's process has died (exit code 1, `completion: "ended"`), or — on a non-ephemeral session with no explicit `timeout` — after 10 s without output once stdout was captured or the command's start marker was seen (`completion: "output_quiet"`, `exit_code: null`: the exit status is unknown and the program may still be running). A `completed` result therefore does not prove a long-running program exited; check `completion`; a program that swallows the marker and never falls silent keeps `wait=true` waiting.
- **`wait=false` returns `status:"queued"` or `"running"` immediately** (NOT `"completed"`) — the kit tracks the command through its marker and output, not the underlying PID. Re-check actual output via `hoody terminal sessions read` / `hoody terminal sessions snapshot get`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. (Note: the generated SDK type only allows `png | jpeg | gif`, so `jpg` works only via raw HTTP.)
- **`hoody terminal processes signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- `hoody terminal processes pause` / `hoody terminal processes resume` send SIGSTOP / SIGCONT to `{pid}` or `{name}`, never both. `name` matches the kernel `comm`, which Linux cuts to 15 characters, so a longer name matches nothing. PIDs 1 and 2 and the terminal server's own and parent PIDs are refused with 403. `include_descendants: true` also signals every child process (best-effort, not atomic). A frozen process keeps its memory until `hoody terminal processes resume`.
- `hoody terminal sessions mouse send` takes 0-based text cells (row, col), not pixels; a cell off the screen is a 400. The program sees the event only when it has turned on terminal mouse reporting (htop, vim with `mouse=a`, tmux with `mouse on`); otherwise the call still answers 200, with `bytes_written: 0`.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).
- `hoody shell` is an interactive PTY, or a one-shot via a POSITIONAL command (`hoody shell <cid> -- uname -a`). There is no `--command` flag and no `--ephemeral` flag on `shell`. For pinned ids on the automation surface use `terminal commands run --terminal-id <n>`.

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id.
- `400` config-error on `hoody terminal sessions create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `409 EPHEMERAL_SESSION` on `hoody terminal sessions create` — the `terminal_id` names a running ephemeral session, usually left by an `ephemeral=true` command sent to that id's own `terminal-N` host (the proxy pins it to N). That session has no `DISPLAY` and is reaped when idle, so it is not handed back as the session you asked for: `hoody terminal sessions delete` it and create it again, and send one-off ephemeral commands to the `terminal-0` host.
- `409 PERSISTENT_SESSION` on `hoody terminal commands run` with `ephemeral=true` — the `terminal_id` names a running session that has a display; turning it ephemeral would strip its display and reap it, so nothing runs. Drop `ephemeral`, or send the command to the `terminal-0` host.
- `404` on `hoody terminal commands get` once the result is gone: its session was removed (an ephemeral session holding results goes after `ephemeral-result-timeout` of inactivity with no attached client), or the session's result buffer filled and evicted it.
- `Unknown program name "<name>"` (400) on `hoody proxy aliases create` → the `program` is not in the platform's program catalog. For a terminal alias use `program=terminal` (not `hoody-terminal` or `terminal-N`); pick the instance with `index`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

⚠ Through the containers proxy, the **`terminal-N` hostname selects the terminal**: the proxy sets `terminal_id` from `N` and overwrites any value you send, so every example addresses the session's own host (`terminal-100` for session 100; `terminal-0` for ephemeral allocation). A DNS label holds at most 63 characters, so from id 10000 up the `<projectId>-<containerId>-terminal-<N>` label is too long: use the short alias `t-<N>` (`<projectId>-<containerId>-t-<N>.<server>.containers.hoody.com`), which selects the same terminal. The SDK and CLI switch to it automatically."] The CLI derives the host from `--terminal-id`. When calling the kit directly, the HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body carries `command`, `wait`, `mode` (`pty` by default, or `raw` for a one-shot process with no terminal session), `stdin_b64` and `user` (raw mode only), `id`, `timeout`, `cwd` and `env`); missing the query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`. Always pass `?terminal_id=N`. The `command` body field is **plain UTF-8**, not base64 (only the URL form `?cmd=<base64>` is base64-decoded); the kit wraps it with its own shell bookkeeping and completion-marker echo before PTY delivery. `wait=true` normally returns when the kit sees the completion marker; a non-ephemeral command with no `timeout` is also reported completed after 10 s without new output once stdout was captured or its start marker was seen (`completion: "output_quiet"`, `exit_code: null`; the program may still be running), and programs that swallow the marker or only background-fork can return `status:"completed"` with empty or partial stdout — re-check via `hoody terminal sessions read` if in doubt. Add `-o json` to `hoody terminal commands run` to get the full result body (`stdout`, `exit_code`, `command_id`) for scripting.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session.

**Step 1 — create the session.** Pin in `1–39999`. On the session's `terminal-N` host the proxy supplies the query `terminal_id=N`, so an HTTP body may omit `terminal_id`; if it names one, it must match N or creation answers `400 TERMINAL_ID_MISMATCH`. The examples below send matching ids.

```bash
hoody --container "$C" terminal sessions create --terminal-id 100 --shell /bin/bash --cols 120 --rows 30
```

**Step 2 — execute** with body `wait: true`. The body's `command` field is **plain UTF-8** (no base64).

```bash
RESP=$(hoody --container "$C" terminal commands run --terminal-id 100 \
  --command 'echo HELLO; uname -a' --wait -o json)
CID=$(echo "$RESP" | jq -r .command_id)
```

**Step 3 — re-fetch the result** via `hoody terminal commands get`, and save it promptly: a completed result can be evicted once the session's result buffer fills (100 results by default), and it is gone when the session is removed.

```bash
hoody --container "$C" terminal commands get "$CID"
```

**Step 4 — clean up.** Always delete the session you created — autostart may re-spawn id 1, so explicit delete keeps your pinned ids tidy.

```bash
hoody --container "$C" terminal sessions delete 100 -y
```

### 2. Ephemeral one-off — run a command without pinning anything

**Goal:** behave like a one-shot `exec()` — auto-allocated PTY, runs, evicts. No need to track a terminal_id.

```bash
hoody --container "$C" terminal commands run --ephemeral --wait \
  --command 'date -u +%FT%TZ; uname -m' -o json | jq '{terminal_id, exit_code, stdout}'
# Or use the shorthand; quote the command so `;` runs remotely, not locally:
hoody --container "$C" shell -- sh -c 'date -u +%FT%TZ; uname -m'
```

⚠ Ephemeral allocates from `40000–65535` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

### 3. Automate a TUI — paste, press, wait, snapshot, find

**Goal:** drive an interactive program (here a simple shell echo, but the same recipe works for `htop`, `vim`, `fzf`, …).

**Step 1 — create the session and paste a line** (raw, not base64; bracketed-paste optional).

```bash
hoody --container "$C" terminal sessions create --terminal-id 101
hoody --container "$C" terminal sessions paste --terminal-id 101 --text 'echo PASTED_TEXT'
```

**Step 2 — press Enter, wait for the screen to go stable, snapshot + regex-find.**

```bash
hoody --container "$C" terminal sessions press --terminal-id 101 --key enter
hoody --container "$C" terminal sessions wait --terminal-id 101 --mode stable --debounce-ms 500 --timeout-ms 3000 -o json | jq .status
hoody --container "$C" terminal sessions snapshot get --terminal-id 101
hoody --container "$C" terminal sessions search --terminal-id 101 --pattern PASTED
```

**Step 3 — discover what keys you can press** (named keys differ per kit build):

```bash
hoody --container "$C" terminal keys list -o json | jq '.keys | length, .[0:8]'
```

Cleanup: `hoody --container "$C" terminal sessions delete 101 -y`.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL on the session's `terminal-N` host, `terminal_id` in query, subprotocol `tty`. Right after the socket opens, send the initial JSON dimensions message; the server starts sending output after it. Server frames start with a type byte (`0` = PTY output). Inject input via REST `/write` or `/press`; the WS receives the rendered bytes.

```bash
hoody --container "$C" terminal sessions create --terminal-id 102
# The CLI has no streaming WebSocket reader. Attach interactively with:
#   hoody --container "$C" shell --terminal-id 102
# or drive and read the session over REST:
hoody --container "$C" terminal sessions write --terminal-id 102 --input 'echo VIA_WRITE' --enter
hoody --container "$C" terminal sessions snapshot get --terminal-id 102
```

`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `hoody terminal sessions delete <terminal-id>`.

### 5. Container introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness.

```bash
hoody --container "$C" terminal system stats
hoody --container "$C" terminal processes list --limit 5 -o json | jq '.processes[] | {pid, name, cpu_percent}'
hoody --container "$C" terminal system ports list -o json | jq '.[] | {port, program, user}'
hoody --container "$C" terminal system displays list
hoody --container "$C" terminal system daemon programs list
hoody --container "$C" terminal processes get 1 -o json | jq '{pid, name, cmdline}'
```

⚠ `hoody terminal system reboot` and `hoody terminal system shutdown` exist on the same surface — don't call them on a shared dev container, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. **You must pair the ids explicitly**: pass `display: 10` on `hoody terminal sessions create` so the kit exports `DISPLAY=:10` (the kit does NOT auto-derive DISPLAY from `terminal_id`).

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```bash
hoody --container "$C" terminal sessions create --terminal-id 10 --display 10
hoody --container "$C" terminal commands run --terminal-id 10 --command 'xeyes &' --wait -o json
```

**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```bash
hoody --container "$C" terminal system displays list | jq '.[] | select((.display | tostring) == "10")'
hoody --container "$C" display screenshots capture --display-id 10
```

Cleanup: kill `xeyes` via `hoody terminal processes signal --name xeyes --signal SIGTERM` or just `hoody terminal sessions delete <terminal-id>` (drops the shell + child GUIs).

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the container's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```bash
hoody --container "$C" terminal sessions create --terminal-id 11 \
  --shell ssh --ssh-host ssh.example.com --ssh-user deploy --ssh-port 22 --ssh-password "$SSH_PASSWORD"
hoody --container "$C" terminal commands run --terminal-id 11 --command 'hostname; whoami' --wait -o json
```

An SSH session always answers `hoody terminal commands run` asynchronously, even with `wait: true`: read `command_id` from the response and poll `hoody terminal commands get`.

To route the SSH connection through a SOCKS5 proxy, keep `ssh_host` and `ssh_user` and add `socks5_host` / `socks5_port` (plus `socks5_user` / `socks5_pass` if the proxy needs credentials); SOCKS5 fields without `ssh_host` and `ssh_user` are rejected. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with body `wait: false`** so the request returns instantly while the agent stays alive in the PTY. In the CLI, `commands run --no-wait` sends `wait: false`. The `cwd` must already exist: `hoody terminal sessions create` has no auto-create option and fails on a missing directory. To have the kit create it, skip `hoody terminal sessions create` and let `hoody terminal commands run` create the session, passing `cwd` and `cwd_auto_create=true` with the pinned `terminal_id`:

```bash
# No sessions create: this call creates session 50 and its missing working directory.
hoody --container "$C" terminal commands run --terminal-id 50 --shell bash \
  --cwd /home/user/agent --cwd-auto-create true \
  --command 'sleep 600; echo agent-stopped' --no-wait -o json   # placeholder for `claude`/`codex`
```

**Step 2 — reattach later** — same `terminal_id`, WS or REST, multiplayer:

```bash
hoody --container "$C" shell --terminal-id 50     # interactive attach
hoody --container "$C" terminal sessions snapshot get --terminal-id 50
```

⚠ Body `wait: false` returns `status:"queued"` or `"running"` immediately (NOT `"completed"`) because the kit tracks the command, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `hoody terminal sessions read` / `hoody terminal sessions snapshot get`. **Never** start a durable agent with `ephemeral=true`: once an ephemeral session sits inactive with no attached client (60 s, or `ephemeral-result-timeout` when it holds results) the kit force-kills its process.

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` finishes. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```bash
hoody --container "$C" terminal sessions create --terminal-id 60
hoody --container "$C" terminal commands run --terminal-id 60 --defer-pid 12345 \
  --command 'echo build-finished; ./run-tests.sh' --wait -o json
```

`defer_pid` returns `/execute` immediately even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits. The wait is bounded by `defer_timeout_ms` (60000 ms default): set it explicitly for longer builds, because on expiry the command is marked timed out (exit code 124) and never runs. A PID that is already gone, or a `defer_start_time_ticks` that does not match the running process, runs the command immediately; pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (body `wait: false`), capture `command_id`.** In the CLI, `commands run --no-wait` sends `wait: false`.

```bash
hoody --container "$C" terminal sessions create --terminal-id 70
CID=$(hoody --container "$C" terminal commands run --terminal-id 70 \
  --command 'sleep 120' --no-wait -o json | jq -r .command_id)
```

**Step 2 — abort** the command tracker. Add `force:true` to send SIGKILL; default sends SIGINT.

```bash
hoody --container "$C" terminal commands cancel "$CID" --force
```

**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `hoody terminal processes signal` by name. Targets every process matching the name.

```bash
hoody --container "$C" terminal processes signal --name sleep --signal SIGTERM
```

Cleanup: `hoody terminal sessions delete <terminal-id>`. ⚠ Never call `hoody terminal system shutdown` / `hoody terminal system reboot` to recover from a hung command — they wipe the entire container.

## Reference

### `hoody terminal` (34) — Terminal sessions and execution

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody terminal automation stats` |  | read | Get terminal automation metrics | `terminal.automation.getStats` | `hoody terminal automation stats` |
| `hoody terminal commands cancel` |  | write | Abort a running command | `terminal.commands.cancel` | `hoody terminal commands cancel abc-123 --force` |
| `hoody terminal commands get` |  | read | Get command result | `terminal.commands.get` | `hoody terminal commands get 45678` |
| `hoody terminal commands list` |  | read | Get terminal command history | `terminal.commands.list` | `hoody terminal commands list 1` |
| `hoody terminal commands run` |  | action | Execute command in terminal session | `terminal.commands.run` | `hoody terminal commands run --ephemeral --defer-pid 4242 --command 'ls -la'` |
| `hoody terminal health` |  | read | Service health check | `terminal.kit.getHealth` | `hoody terminal health` |
| `hoody terminal keys list` |  | read | List supported key names for /press endpoint | `terminal.keys.list` | `hoody terminal keys list` |
| `hoody terminal open` |  | action | Open the Terminal kit service (web terminal) in your browser |  | `hoody terminal open` |
| `hoody terminal processes get` |  | read | Get process details by PID | `terminal.processes.get` | `hoody terminal processes get 1234` |
| `hoody terminal processes list` |  | read | List all system processes | `terminal.processes.list` | `hoody terminal processes list --sort cpu --limit 10` |
| `hoody terminal processes pause` |  | write | Suspend a process or process tree (SIGSTOP) | `terminal.processes.pause` | `hoody terminal processes pause --pid 1234 --include-descendants` |
| `hoody terminal processes resume` |  | write | Resume a suspended process or process tree (SIGCONT) | `terminal.processes.resume` | `hoody terminal processes resume --pid 1234 --include-descendants` |
| `hoody terminal processes signal` |  | write | Send signal to process(es) | `terminal.processes.signal` | `hoody terminal processes signal --pid 1234 --force` |
| `hoody terminal sessions automation status` |  | read | Get per-session automation state | `terminal.sessions.getAutomationStatus` | `hoody terminal sessions automation status 1` |
| `hoody terminal sessions connect` |  | read | WebSocket terminal connection | `terminal.sessions.connect` | `hoody terminal sessions connect --terminal-id 1 --readonly` |
| `hoody terminal sessions create` |  | write | Create a terminal session | `terminal.sessions.create` | `hoody terminal sessions create --ephemeral --display 5` |
| `hoody terminal sessions delete` |  | destructive | Delete a terminal session | `terminal.sessions.delete` | `hoody terminal sessions delete 1 -y` |
| `hoody terminal sessions list` |  | read | List all terminal sessions | `terminal.sessions.list` | `hoody terminal sessions list --history-limit 50` |
| `hoody terminal sessions mouse send` |  | write | Send a cell-based mouse event to a terminal session | `terminal.sessions.sendMouseEvents` | `hoody terminal sessions mouse send --terminal-id 1 --event-type move --event-row 10 --event-col 10 --event-button 1` |
| `hoody terminal sessions paste` |  | write | Paste text into terminal | `terminal.sessions.paste` | `hoody terminal sessions paste --terminal-id 1 --text Hello --bracketed` |
| `hoody terminal sessions press` |  | write | Send named key presses to terminal | `terminal.sessions.pressKeys` | `hoody terminal sessions press --terminal-id 1 --keys ctrl+c` |
| `hoody terminal sessions read` |  | read | Get raw terminal output | `terminal.sessions.read` | `hoody terminal sessions read --terminal-id 1 --format download` |
| `hoody terminal sessions screenshots capture` |  | read | Capture terminal screenshot | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshots capture --terminal-id 1 --format png --foreground white` |
| `hoody terminal sessions search` |  | read | Search terminal screen with regex | `terminal.sessions.search` | `hoody terminal sessions search --terminal-id 1 --pattern TODO --scope screen --limit 100` |
| `hoody terminal sessions snapshot get` |  | read | Get rendered terminal snapshot | `terminal.sessions.getSnapshot` | `hoody terminal sessions snapshot get --terminal-id 1 --include-colors --include-highlights` |
| `hoody terminal sessions wait` |  | write | Wait for terminal condition | `terminal.sessions.wait` | `hoody terminal sessions wait --terminal-id 1 --mode stable --debounce-ms 100` |
| `hoody terminal sessions write` |  | write | Write input to terminal | `terminal.sessions.write` | `hoody terminal sessions write --terminal-id 1 --input <input> --enter` |
| `hoody terminal system daemon programs list` |  | read | Get daemon programs configuration | `terminal.system.listDaemonPrograms` | `hoody terminal system daemon programs list` |
| `hoody terminal system displays list` |  | read | Get display information | `terminal.system.listDisplays` | `hoody terminal system displays list` |
| `hoody terminal system displays stop` |  | destructive | Stop an X display and everything drawing on it, including a display a deleted terminal session left running | `terminal.system.stopDisplay` | `hoody terminal system displays stop 1 -y` |
| `hoody terminal system ports list` |  | read | List all listening network ports | `terminal.system.listPorts` | `hoody terminal system ports list --protocol tcp --user root` |
| `hoody terminal system reboot` |  | write | Reboot the system | `terminal.system.reboot` | `hoody terminal system reboot --delay 60 -y` |
| `hoody terminal system shutdown` |  | write | Shutdown the system | `terminal.system.shutdown` | `hoody terminal system shutdown --delay 60 -y` |
| `hoody terminal system stats` |  | read | Get system resources and statistics | `terminal.system.getStats` | `hoody terminal system stats` |


---

<!-- ===== namespace: tunnel ===== -->

# `tunnel` — reverse tunnels for HTTP/WS/TCP via container relay

## Purpose

**Mental model: ngrok, but built into every container, with the rest of the platform glued in for free.** Same job — reverse tunnel laptop ↔ container — but the public URL lives on the container's own `*.containers.hoody.com` host, so it inherits everything the proxy already does:

- **Capability gates** (`hoody containers proxy *`) — Password / Token / JWT / IP groups can gate the tunnel URLs like any other container URL, once a group is granted access and the container's default policy denies everyone else (see Workflow 3).
- **Request hooks (MITM)** — `hoody containers proxy *` rules apply to the kit's own admin/connect URL (service key `tunnel`). An exposed application is reached on its own port, which has no service name, so hooks do not run on that visitor traffic.
- **Proxy logs** — requests through the proxy, including tunnel traffic, can appear in `hoody proxy logs *` (status, latency, headers, source IP), subject to the container's logging configuration and exclusions.
- **Friendly aliases** — for an exposed application, create an alias with `program: 'http'` and `port` set to the container port the EXPOSE bind was given, so the public URL hides `containerId`. `program: 'tunnel'` targets the kit's admin/connect endpoints instead.

Two surfaces:
- **EXPOSE**: publish laptop HTTP/1.1 (+WS) on container's public domain. (ngrok `http`)
- **PULL**: project laptop TCP onto container loopback. (ngrok `tcp` reverse)

Each surface has:
- **Data plane** (open the tunnel) — long-running WebSocket process. Lives in a separate driver (see Quirks).
- **Control plane** (inspect / kill) — short request/response: `hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel health`, `hoody tunnel sessions close`.

## When to use

- Publish laptop HTTP/WS on `*.containers.hoody.com`.
- Project laptop TCP onto container `127.0.0.1:<port>`.
- Inspect, scrape metrics, kill sessions.

## When NOT to use

Container-hosted HTTP → `exec`, browser → `browser`, one-shot HTTP → `curl`, edge logs → `proxyLogs`, container↔container TCP not supported.

## Prerequisites

- `hoody-tunnel` kit running; base port reserved.
- A public EXPOSE URL is only issued where the deployment is configured to mint one; otherwise the bind succeeds with no public URL.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Inspect

`hoody tunnel list` → sessions, bindings, streams, orphans, FD budget. Drill via `hoody tunnel sessions list` / `hoody tunnel bindings list`. `hoody tunnel health`; `hoody tunnel metrics` → Prometheus.

### 2. Kill stuck session

1. `hoody tunnel sessions list` → `sessionId`.
2. `hoody tunnel sessions close` with `grace_ms` 0–5000 (default 50). Returns `202`. Live → GOAWAY then close; orphans drop now (parking skipped).
3. Re-list before re-binding.

### 3. MITM / log / gate the tunnel

Tunnel traffic flows through the same proxy as every other kit URL, so:

- **Logs** (subject to the container's logging configuration and exclusions; entries for the kit's admin/connect URL carry `serviceName` `tunnel`, while visitor traffic on an exposed port is reached through that port and does not carry the `tunnel` service name): `hoody proxy logs list` returns every request that hit the container (status, latency, source IP, headers) and `hoody proxy logs stream` gives a live tail. ⚠ `list` ignores `--service-name` (the kit URL already scopes the read to your container), so filter its entries on `serviceName == "tunnel"` yourself; `stream` honours it, so the live tail can be scoped server-side. (proxyLogs query params on `list` are `limit` / `offset` / `projectId` / `containerId` / `serviceName` / `level` / `includeRequestBody` / `includeResponseBody` / `last` / `afterId` / `kind` / `method` / `source` / `sinceMs` / `untilMs`; there is no `program` filter.) No agent on the laptop needed.
- **Hooks (MITM)**: proxy hook rules registered under the `tunnel` service key (hooks are keyed by service name, per container) inspect / rewrite / inject / block requests to the kit's admin and `/connect` URL. They do **not** run on visitor traffic to an exposed application: that traffic arrives on the exposed port, which carries no service name, and the proxy only hook-routes requests that have one. A rule is `{ match, script, timeout? }`, and `match` can test only `method`, `path` and `headers`: there is no `program` field and no alias-hostname match.
- **Gates**: defining an authentication group (`hoody containers proxy groups …`) does not gate anything by itself: the group starts with no access grants, and a container whose default policy is `allow` still lets every other caller through. Grant the group access and set the default policy to `deny`. An exposed port has no service name, so its route checks the matching protocol cell (`http`/`https`) first, where a grant or an explicit `false` decides, and only falls back to the `*` cell when there is no protocol cell; the laptop never has to handle the credential.

## Quirks & gotchas

- The data plane (expose / pull) is a long-running driver process, not a request/response call. Runtime: Bun 1.3+ or Node 20.3+ (22+ recommended: Node 20 is end-of-life; the listening-server form is Bun-only). On Node releases whose built-in WebSocket is affected by CVE-2026-12151 (before 22.23.0, all of 23 and 25, 24 before 24.17.0, 26 before 26.3.1) the tunnel socket is opened with the `ws` package instead. The generated `tunnel` namespace covers only the read/observability + admin surface (`hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel sessions close`) — the driver itself ships alongside it. Use `hoody tunnel expose <target>` or `hoody tunnel pull <target>`, registered on the same `tunnel` command group as the admin subcommands.
- `BIND_OK.publicUrl` is `null` on deployments that do not mint public tunnel URLs — the bind still works, you just reach it another way.
- `grace_ms` capped at 5000ms; over → `400`.
- `containerPort: 0` requests an automatically allocated port; ports 1–79 are rejected; `80..=1023` are refused unless the deployment allows privileged ports (gated separately for expose and for pull).
- PULL loopback-only. EXPOSE has atomic takeover (`takeover:true`); the displaced owner gets a `RESET` frame on each stream of the old binding carrying the **numeric** code `13`, then a takeover notice: frame type `0x40`, whose JSON body is `{bindId, reason}` — `reason` is free text, so branch on the frame type, never on its wording. The bundled tunnel driver does not surface that notice; only code that decodes frames itself sees it. PULL takeover → `BIND_ERR` with `code:"INVALID_KIND"`.
- Idle reaping needs zero streams AND zero bindings. Orphans with parked bindings wait out the configured takeover grace (default 60 s; zero disables parking).
- v1 vs v2 subprotocols share `/connect` (`hoody-tunnel.v1` for single-WS sessions, `hoody-tunnel.v2` for multi-WS shard pools); `isV2` on `hoody tunnel sessions list` reports the shape. Both subprotocols support graceful resume via `resume.sessionId` in HELLO; `isV2:false` does NOT mean "no resume".
- Multi-WS (v2) drop semantics: dropping the **primary** socket closes the whole session; dropping a **secondary** shard makes the driver close streams pinned to that shard while the kit detaches the shard and the session continues.
- Pre-auth connection cap defaults to 32; exceeding it closes the socket before HELLO (no explicit close code). HELLO timeout defaults to 5 s.
- **No UDP support.** EXPOSE is HTTP/1.1+WS only; PULL is TCP only.
- `GET /api/v1/tunnel/connect` (operation `tunnelConnect`) is the WS-upgrade endpoint of the data plane. Use `hoody tunnel expose <target>` or `hoody tunnel pull <target>`, which handle the WS subprotocol and HELLO frame. Each run opens a fresh session. While it runs, the CLI resumes a dropped connection automatically as long as the kit still holds its bindings; if recovery fails, it exits with code 1.

## Common errors

- `404` on kill — session gone; no retry.
- `403` — Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. The response is a bare 403.
- Upgrade `400` — missing/unsupported subprotocol; WS `1002` — HELLO rejected after upgrade; plain socket close — HELLO timeout or pre-auth cap reached.
- `BIND_ERR` codes: `ALREADY_BOUND` (EXPOSE: retry with `takeover:true`; PULL: pick another port or close the owning session), `PORT_IN_USE`, `RESERVED_PORT`, `INVALID_HOST`, `PRIVILEGED_PORT`, `BIND_CAP_EXCEEDED`, `INVALID_KIND` (unsupported `(kind, mode)` combo, or `takeover:true` on PULL), `INTERNAL` (server-side, e.g. random-port exhaustion).
- `GOAWAY` on an idle or unanswered-PING session: the body is a JSON object whose `code` is a **number**, `10`, and whose `message` reads `session idle timeout` or `pong timeout`; its two other fields are always `0`. The takeover RESET below carries `13` (`0x000d`). Treat `message` as human-readable only. Reconnect via `resume.sessionId`.
- `503`+`Retry-After:5` at visitor URL — orphan takeover-grace window. Only a primary socket that drops without a close frame (a killed driver, a lost network), or closes with a code other than 1000, parks its bindings; a client `GOAWAY`, a close frame with no code or code 1000 (what a clean driver close sends), or admin `hoody tunnel sessions close` ends the session without parking.

## Related namespaces

- `proxyLogs` — tunnel traffic through the proxy can appear here, subject to the logging configuration; the list route ignores the `serviceName` query (and there is no `program` filter), and only the kit's admin/connect traffic carries `serviceName` `tunnel`.
- `api` — `hoody containers proxy *` (MITM rules for the kit's admin/connect URL), `hoody containers proxy *` (capability gates), `hoody proxy aliases *` (friendly hostnames hiding `containerId`: `program: 'http'` plus `port` for an exposed application).
- `exec` — for one-off HTTP handlers hosted directly inside the container (no laptop). `curl` — outbound HTTP from the container. `browser` — full headless Chromium. `daemon` — supervise long-running processes.

## Examples

The `tunnel` namespace's REST operations cover the **observability + admin** surface — `hoody tunnel health`, `hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel sessions close`. The data plane (expose / pull) is a long-running WebSocket driver: it ships with this package (`hoody tunnel expose` / `hoody tunnel pull`) but is out of scope for these 7 examples, which assume *somebody else* (a teammate's tunnel session, your CI machine's session, a test rig) is currently holding the tunnel. You're the operator: inspecting it, scraping metrics, killing it. Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

The admin endpoints serve independently of any session.

### 1. Health probe — kit alive

**Goal:** before any other call, confirm the tunnel kit is reachable and read its process statistics. It always reports `status: "ok"` when it answers and does not check tunnel capacity: for that, read `fdPermitsAvailable` from `hoody tunnel list` (example #2) or the FD-permits metric (example #5). Response includes `pid`, `started`, `userAgent`, `fds` (Unix-only file-descriptor count when available), and `memory.rss`.

```bash
hoody --container "$C" tunnel health -o json \
  | jq '{status, service, started, pid, fds, rss: .memory.rss}'
```

If the response is HTML / `Error 502` instead of JSON, the kit base listener isn't reachable through the proxy (kit crashed / not installed / proxy mis-route) — the admin endpoints are designed to stay live independent of any active session. Lack of an active session shows up as `sessions: []`, not 502.

### 2. List every active tunnel — combined sessions + bindings + FD budget

**Goal:** "what's currently tunneling on this container?" One call returns `sessions[]` (each with `peerAddr`, `protocol`, `connectionsGranted`, `activeStreams`, `exposeBindings[]`, `pullBindings[]`), `orphanedSessions` count, `totalStreams`, `totalBindings`, and `fdPermitsAvailable`.

```bash
hoody --container "$C" tunnel list -o json | jq '{
  active:(.sessions|length), orphans:.orphanedSessions,
  streams:.totalStreams, binds:.totalBindings, fdBudget:.fdPermitsAvailable
}'
```

`hoody tunnel list` is the one-shot overview. For per-session detail (peer addr, max-stream cap, v2 flag) drill in via `hoody tunnel sessions list` (example #3). Note: `protocol` is per-session and reflects the negotiated control-plane protocol, NOT the upstream — for the "is this an EXPOSE or PULL" answer, look at which of `exposeBindings` / `pullBindings` is non-empty.

### 3. Drill into one session — peer addr, stream load, capacity

**Goal:** you got a `sessionId` from #2; now you want the session detail (who's connected, how loaded). Returns `peerAddr` (`<ip>:<port>` of the laptop holding the tunnel), `connectionsGranted` (the negotiated WebSocket pool size: 1 for v1, 1–16 for v2), `activeStreams` (right now), `maxStreams` (negotiated cap), `isV2` (control-plane protocol), and `bindings[]`.

```bash
: "${SID:?Set SID to a sessionId returned by example 2}"
hoody --container "$C" tunnel sessions list -o json \
  | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s) | {peer:.peerAddr, load:"\(.activeStreams)/\(.maxStreams)", binds:.bindings}'
```

`activeStreams / maxStreams` is the headroom number — a session sitting at `48/50` has two stream slots left. At the cap there is no error code to match on: an EXPOSE visitor request is answered `503` with `Retry-After: 1` and the plain-text body `max streams exceeded`, while a PULL connection is dropped with nothing sent at all. `isV2:false` means the session negotiated the single-WebSocket v1 control plane; resume is still supported via `resume.sessionId` while the orphan is in takeover grace.

### 4. List bindings — which ports are exposed across every session

**Goal:** answer "what container ports are tunnels eating right now?". `hoody tunnel bindings list` flattens across one row per active binding — `port`, `kind` (`http` / `tcp`), `mode` (`expose` / `pull`), plus the owning `sessionId`/`bindId` on every row. PULL rows also carry `bindAddr`: the same port can be bound on two loopback addresses at once, so a PULL listener is identified by `bindAddr` + `port`, not by the port alone. EXPOSE rows omit `bindAddr`.

```bash
hoody --container "$C" tunnel bindings list -o json \
  | jq '.bindings | group_by(.mode)
        | map({mode:.[0].mode, count:length,
               listeners: map(if .bindAddr then "\(.bindAddr):\(.port)" else "\(.port)" end)})'
```

Useful pre-flight check before someone tries to bind another port — `BIND_ERR(PORT_IN_USE)` is one of the most common BIND failures. Also: the wire field is `port` here but `containerPort` inside the per-session `bindings[]` array of #3: same value, different name.

### 5. Scrape Prometheus metrics — sessions, bindings, FD permits

**Goal:** wire the tunnel kit into your scrape job. Endpoint emits Prometheus text (one of the few endpoints that's not JSON). Three gauges: `hoody_tunnel_sessions_active`, `hoody_tunnel_bindings_active` (two labelled series, `{kind="http",mode="expose"}` and `{kind="tcp",mode="pull"}`; sum them for the total) and `hoody_tunnel_fd_permits_available`.

```bash
hoody --container "$C" tunnel metrics -o raw \
  | grep -E '^hoody_tunnel_(sessions_active|bindings_active|fd_permits_available)'
# -o raw is REQUIRED: without it the text/plain body prints as one JSON-quoted line.
```

For a dashboard, register the kit URL as a Prometheus scrape target through an alias so the scrape config doesn't carry `containerId`: `hoody proxy aliases create --container-id "$C" --program tunnel`. To restrict it to your monitoring network, define an IP group, grant it the `tunnel` service, and set the container's default policy to `deny` — the group alone restricts nothing (see Workflow 3).

### 6. Kill a stuck session (recipe — needs a real session)

**Goal:** a teammate's tunnel expose session is wedged; you want it gone without restarting the kit. `hoody tunnel sessions close` returns `202` with `{sessionId, status}`. `grace_ms` ∈ [0, 5000] (default 50, anything above 5000 → `400`); it bounds how long the kit spends sending a best-effort GOAWAY before teardown. It is not a drain period: in-flight streams can be cut off. Orphan sessions skip the parking grace window and drop immediately.

⚠ Closing a session cuts off whoever is connected to it, including its in-flight streams. Pick the intended session before running this recipe.

```bash
SID=$(hoody --container "$C" tunnel sessions list -o json \
  | jq -r '.sessions[] | select(.peerAddr | startswith("203.0.113.")) | .sessionId' | head -1)
hoody --container "$C" tunnel sessions close "$SID" --grace-ms 1000 -y
hoody --container "$C" tunnel sessions list -o json | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s)'
```

After an unclean driver disconnect (the socket drops without a close frame, or closes with a code other than 1000), visitors of an orphaned `expose` URL see `503 Retry-After:5` during takeover grace (default 60 s); a clean close (`GOAWAY`, or close code 1000) releases the bindings at once. PULL listeners also stay bound during that grace, but drop each new connection while no live session holds them. `hoody tunnel sessions close` (admin) skips orphan parking and starts teardown, so do **not** expect that 503 window from an admin kill; its `202` means teardown was initiated, not that it has finished, so re-list to confirm.

### 7. Auto-discover orphans + low-FD alert (monitoring recipe)

**Goal:** one cron-able script that watches both the orphan count (parked bindings whose laptop dropped) and the FD permits remaining; pages on either. `hoody tunnel list` carries both numbers.

```bash
J=$(hoody --container "$C" tunnel list -o json)
ORPH=$(echo "$J" | jq '.orphanedSessions'); FDS=$(echo "$J" | jq '.fdPermitsAvailable')
[ "$FDS" -lt 64 ] || [ "$ORPH" -gt 0 ] && echo "ALERT orphans=$ORPH fds=$FDS"
```

Only the process that owns a tunnel sees its `GOAWAY` and `RESET` frames: opening another connection to `/api/v1/tunnel/connect` starts a new session (or resumes an orphaned one) and does not observe a live session held by someone else.  As an operator, poll the admin endpoints as above.

## Reference

### `hoody tunnel` (8) — Reverse tunnels — expose HTTP/WS/TCP services online via container relay

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody tunnel bindings list` |  | read | List active bindings across all sessions | `tunnel.bindings.list` | `hoody tunnel bindings list` |
| `hoody tunnel expose` |  | action | Expose a local service to the internet through the container (long-running, Ctrl+C to stop) |  | `hoody tunnel expose 3000` |
| `hoody tunnel health` |  | read | Tunnel kit health | `tunnel.kit.getHealth` | `hoody tunnel health` |
| `hoody tunnel list` |  | read | List all active tunnels (combined sessions + bindings) | `tunnel.list` | `hoody tunnel list` |
| `hoody tunnel metrics` |  | read | Prometheus metrics for the tunnel kit | `tunnel.kit.getMetrics` | `hoody tunnel metrics` |
| `hoody tunnel pull` |  | action | Pull a TCP service from local machine into the container loopback (long-running, Ctrl+C to stop) |  | `hoody tunnel pull 5432 --port 5432` |
| `hoody tunnel sessions close` |  | destructive | Terminate an active tunnel session | `tunnel.sessions.close` | `hoody tunnel sessions close abc-123 --grace-ms 100 -y` |
| `hoody tunnel sessions list` |  | read | List active tunnel sessions | `tunnel.sessions.list` | `hoody tunnel sessions list` |


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

- Container with `hoody-watch` kit (Linux only); see `SKILL-CLI.md` for auth + URL routing.
- Every `hoody watch` command, `hoody watch health` included, acts on the container named by the global `-c <containerId>` (or `HOODY_CONTAINER`), its id and never its name; without one the CLI refuses before sending anything.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Provision and verify

1. `hoody watch create` — paths plus optional `recursive`, `include`, `exclude`, `kinds`, `ignore_dirs`, `skip_hidden`, `coalesce_ms`, `history_size`
2. `hoody watch get` — read back `id`, `WatcherConfigView`, `WatcherStats`

### 2. SSE live-tail with resume

1. Create the watcher as in workflow 1
2. `hoody watch events stream` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `hoody watch events list` with `since_id`, one page per call; persist the highest `id`.

### 4. WebSocket consumer

1. Create the watcher as in workflow 1
2. `GET /api/v1/watch/watchers/{id}/events/ws` (HTTP only; no CLI command) — the server pings every 20 s and closes the socket when the pong is missing; most WebSocket clients answer pings on their own
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory, reconfiguration and teardown

List with `hoody watch list`, inspect with `hoody watch get`, reconfigure in place with `hoody watch update`, remove with `hoody watch delete`.

## Quirks & gotchas

- Linux only; on non-Linux hosts the binary exits before opening the listener (no HTTP served) — typically with code 0 via the container-path check, or code 1 if those paths exist. A 501 `UNSUPPORTED_PLATFORM` response is defined but unreachable from a normal startup: the process exits before it can serve one.
- No kit-level auth header; do not add `Authorization` on direct kit calls
- `recursive` defaults `true`; `coalesce_ms` defaults `100`
- `ignore_dirs` default: `node_modules, .git, target, __pycache__, .hg, .svn, .cache, dist, .next, .nuxt, vendor, bower_components`. Pass `[]` to disable; `null` falls back to default
- Default limits, which the kit's command-line flags can change: 128 watchers/kit, 32 paths/watcher, 64 stream clients/watcher, replay buffer of 100 000 events or 16 MiB per watcher (whichever is hit first). `history_size` on create overrides the event count per watcher; values under 32 are raised to 32 and there is no upper cap, so the 16 MiB memory limit is the effective bound
- Watcher ids are UUIDs; a path segment that is not a UUID is rejected with `400` before the route runs
- `hoody watch get`, `hoody watch update`, `hoody watch delete`, `hoody watch events list` and `hoody watch events stream` name the watcher with `--id <watcherId>` (the UUID that `watch list -o json` shows), never with a positional argument.
- `since_id` and `since_timestamp` mutually exclusive — both = 400 `INVALID_CURSOR`
- 409 `HISTORY_GAP` means an event after your cursor is lost: it was evicted from the replay history, or it was too large to keep. The test is exact for every cursor (`since_id`, `since_timestamp`, `after_id`): a cursor older than the oldest retained event does not gap by itself, so "the last 5 minutes" of a watcher created 2 minutes ago returns everything it has. `since_id=0` means "everything retained" and never gaps.
- Walking history page by page: pass `after_id` (the previous response's `next_after_id`; the response also carries `has_more`). If an event you have not read yet was evicted between two requests, the next one fails with 409 `HISTORY_GAP` instead of skipping it. A `page` walk counts from the oldest retained event, so an eviction between pages skips events silently. `since_id`, `since_timestamp` and `page` are ignored when `after_id` is set.
- `since_timestamp` accepts RFC3339, unix seconds, or millis (switches to ms when `|n| >= 100_000_000_000`)
- WS message cap 64 KiB by default; the server sends JSON text frames only, ignores text and binary frames from the client, pings every 20 s and disconnects on a missed pong
- `kind` (wire field name): `created | modified | removed | renamed | metadata | overflow | other` (snake_case enum); `overflow` = events were lost, either because the kernel event queue overflowed or because the kit's own internal event channel was saturated; `overflow` events are delivered even when `kinds` does not list them

## Common errors

- `400 INVALID_PAGINATION` — `page=0`, `limit=0` or `limit` above 200; defaults `page=1, limit=50`. A negative or non-numeric `page`/`limit` also answers HTTP 400 `INVALID_PAGINATION`; the message names the parameter
- `400 INVALID_REQUEST` — empty `paths`, an invalid or missing path, a glob that does not compile, or an invalid `ignore_dirs` entry. All of these answer the same code, so read the message, not the code, to tell them apart
- `400 INVALID_CURSOR` — both cursor fields, or unparseable timestamp
- `404 WATCHER_NOT_FOUND` — UUID syntactically valid but no watcher; also raised pre-upgrade on stream endpoints
- `409 LIMIT_EXCEEDED` — more than 32 `paths` in one watcher, or 128 watchers already live on the container
- `409 HISTORY_GAP` — an event after the cursor was evicted or too large to keep; body `details` carries `oldest_available_id` / `newest_available_id`
- `429 MAX_CLIENTS_REACHED` — >64 concurrent SSE+WS on one watcher; capacity incremented after checks pass (no slot leak)
- `500 WATCHER_START_FAILED` — the kit could not start the inotify watch for a new watcher
- `503 SHUTTING_DOWN` — the kit is stopping: `hoody watch events stream`/`GET /api/v1/watch/watchers/{id}/events/ws` (HTTP only; no CLI command) and `hoody watch create` return it. Watchers are removed at shutdown, so reads of a watcher or its history return 404 `WATCHER_NOT_FOUND` instead
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. To change a watcher's config, update it in place (example 8); deleting and recreating it loses its history and disconnects its consumers.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history. Create `/tmp/wt` inside the container first (or use a path that already exists): creating a watcher does not create its paths, and a missing path is refused with `400 INVALID_REQUEST`.

**Step 1 — create the watcher.** Capture `id`. `recursive` defaults to `true`; tighten `coalesce_ms` from the default 100 ms to 50 ms for snappier debounce.

```bash
WID=$(hoody --container "$C" watch create \
  --paths /tmp/wt --recursive --coalesce-ms 50 \
  -o json | jq -r .id)
```

**Step 2 — read back stats** (response carries `config` + `stats`; `events_seen > 0` after the first FS touch confirms the inotify watch is live).

```bash
hoody --container "$C" watch get --id "$WID" -o json | jq '.stats'
```

### 2. SSE live-tail with `since_id` resume after disconnect

**Goal:** subscribe to live events; on disconnect, replay everything missed.

**Step 1 — open the SSE stream.** The command prints one NDJSON record per event, `{id, event, data}`, with `data` already parsed; a record whose `event` is `lag` means history was lost. It reconnects on its own from the last id it printed. The `id` is monotonic; persist it as your resume cursor.

```bash
hoody --container "$C" watch events stream --id "$WID"
```

**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if an event after your cursor was evicted you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```bash
hoody --container "$C" watch events stream --id "$WID" --since-id "$LAST_ID"
```

### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer prefers a WebSocket. The server sends each event as a JSON text frame carrying `"type":"file_event"` and ignores text and binary messages from the client. It sends a Ping every 20 s and closes the socket when the Pong does not arrive, so the client must answer Pings (most WebSocket libraries do this automatically); it also answers the client's own Pings.

```bash
# CLI streams via SSE (no WS subcommand); use `events stream` for live-tail.
hoody --container "$C" watch events stream --id "$WID" --since-id 37000
```

A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from the highest event id you actually persisted (not the response's `newest_available_id`, which describes the whole buffer). Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** Fetch the first page with your starting `since_id`, then follow `next_after_id` as `after_id` while `has_more` is true; a 409 `HISTORY_GAP` on an `after_id` page means events were evicted before you read them, so the replay is incomplete. Do not walk with `page`: with `since_id=0` an eviction between pages shifts the offsets and skips events without an error. `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```bash
CURSOR=${CURSOR:-0}   # highest id already stored; 0 = everything retained
# One call walks every page by after_id (up to 10,000 events); it fails on a 409 (replay incomplete).
R=$(hoody --container "$C" watch events list --id "$WID" --since-id "$CURSOR" -o json) || exit 1
jq -c '.items[]' <<< "$R" >> /tmp/events.ndjson || exit 1
# has_more true = the walk hit its bound: run again from the last id stored.
[ "$(jq -r .has_more <<< "$R")" = false ] || echo "more events: rerun from the last stored id" >&2
```

### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild on content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`. `overflow` events still arrive when `kinds` leaves them out, so a consumer should handle them anyway.

```bash
WID=$(hoody --container "$C" watch create \
  --paths /tmp/wt --kinds modified --coalesce-ms 50 -o json | jq -r .id)
hoody --container "$C" watch events list --id "$WID" -o json \
  | jq '[.items[].kind] | unique'
```

⚠ Creating and writing a file usually produces a `created` and a `modified`, but the number of events and the size recorded on the `created` event are not fixed: sizes are sampled when the kit processes the event, and events inside the `coalesce_ms` window are merged. `kinds: ["modified"]` drops the `created` events, but `modified` is also reported when a file opened for writing is closed unchanged, so it does not prove the content changed.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`.

```bash
WID=$(hoody --container "$C" watch create --paths /tmp/wt \
  --include '**/*.log' --exclude '**/secret-*.log' -o json | jq -r .id)
```

### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` counts raw inotify events before coalescing, so it can be larger than the number of events in the history; `active_clients` counts live SSE+WS connections. One call returns at most 200 watchers; with the default cap of 128 watchers per kit that is all of them, but when the cap has been raised, walk further pages with `page` until the items seen reach `total`.

```bash
hoody --container "$C" watch list --limit 200 -o json \
  | jq '.items[] | {id, paths: .config.paths, events_seen: .stats.events_seen}'
```

### 8. Change a watcher's config — update it in place

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. Update the watcher in place: omitted fields keep their current value, a list you send replaces that whole list, and at least one field must be given. Changing only `kinds`, as below, keeps the watcher's id, its retained history and its connected SSE/WebSocket clients. Shrinking `history_size` evicts the oldest events beyond the new cap and can turn an existing replay cursor into a `HISTORY_GAP`; ordinary eviction as new events arrive still applies. Deleting and recreating the watcher instead would lose the history and disconnect every consumer.

```bash
hoody --container "$C" watch update --id "$WID" --kinds modified --kinds removed
```

If the new configuration cannot be started, the request fails with 500 and the watcher keeps its old configuration.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /api/v1/watch/watchers/{id}` and `/api/v1/watch/watchers/{id}/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```bash
hoody --container "$C" watch delete --id "$WID"
hoody --container "$C" watch get    --id "$WID"   # exits non-zero
```

### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**. A watcher younger than 5 minutes is fine: the call returns every event it has. It answers **409 `HISTORY_GAP`** only when an event after the timestamp was lost (evicted, or too large to keep), so the result would be incomplete. One call returns at most 200 events; walk further pages with `after_id` set to the last id received, which answers 409 the same way when an event after it was lost while paging. Treat any 409 as a failure: the history for that window is incomplete.

```bash
# One call walks every page (up to 10,000 events) and fails on a 409: history incomplete.
hoody --container "$C" watch events list --id "$WID" \
  --since-timestamp "$(date -u -d '5 minutes ago' +%FT%TZ)"
```

When the filesystem reports a rename as a single event carrying both paths, the kit emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side without an `old_path` field (it is omitted, not null). Keep only events that have `old_path` to get the paired form.

## Reference

### `hoody watch` (9) — File system watchers — observe file changes and tail live events

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody watch create` |  | write | Create a new file system watcher. `--paths` is repeatable; `--include`/`--exclude`/`--ignore-dirs`/`--kinds` are optional repeatable filters. | `watch.watchers.create` | `hoody watch create --coalesce-ms 100 --exclude '*.ts' --paths /home/user/src` |
| `hoody watch delete` |  | write | Delete a watcher and tear down its inotify subscriptions | `watch.watchers.delete` | `hoody watch delete --id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch events list` |  | read | List historical events for a watcher (paged). Supports cursor resume via `--since-id` or `--since-timestamp`. | `watch.events.list` | `hoody watch events list --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10 --limit 10` |
| `hoody watch events stream` |  | read | Live-tail watcher events over Server-Sent Events. Resumes from `--since-id` on reconnect. | `watch.events.stream` | `hoody watch events stream --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10` |
| `hoody watch get` |  | read | Get a single watcher by id, including its config and stats | `watch.watchers.get` | `hoody watch get --id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch health` |  | read | Health check for the watch service (status, build, start time, memory, open file descriptors, pid) | `watch.kit.getHealth` | `hoody watch health` |
| `hoody watch list` |  | read | List all file system watchers (paged) | `watch.watchers.list` | `hoody watch list --page 10 --limit 10` |
| `hoody watch open` |  | action | Open the Watch kit info page in your browser |  | `hoody watch open` |
| `hoody watch update` |  | write | Reconfigure a watcher in place. Omitted fields keep their current value; a repeatable filter flag replaces that whole list. The watcher keeps its id, history and connected clients | `watch.watchers.update` | `hoody watch update --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --coalesce-ms 100 --exclude '*.ts'` |

