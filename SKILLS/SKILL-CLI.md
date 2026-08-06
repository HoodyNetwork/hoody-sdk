> _**CLI skill (basic)** · ~16,925 tokens · hoody-sdk v1.0.0-beta.12_

# CLI mode — `hoody` command

Covers a mapped subset of the SDK / HTTP surface (CLI ~940 operations vs SDK ~1075 methods) — not a 1:1 mirror. Command names sometimes differ from SDK accessors (e.g. `hoody files dir` for the SDK's `hoody files dir`), some kits add hand-written commands (`pipe`, `tunnel`), and SDK-only helpers (`listAll` / `listIterator`) have no CLI form. For the exact command for a given operation, consult the CLI mappings / `SKILL-CLI/<ns>.md` per-namespace pages.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud containers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A container is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...containers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + container plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.containers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit URL is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service, kept warm by the kit; **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST/PUT?** Use `curl` — `hoody curl get-url --url <target> --method POST [...]` (or `hoody curl exec`) drives the curl kit, which can turn any REST call into a single GET-able link for browser-only callers, restricted webhooks, agents with web-fetch-only access. See `curl` namespace.

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
npx https://cli.hoody.com               # also: bunx, pnpm dlx, yarn dlx
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

After install: `hoody check-update` / `hoody update` (minisign-verified).

## Login

```bash
hoody login --username alex --password 'secret'
```

- `--username` is the primary login flag; the CLI accepts `--email` as an alternative for email-based login. (The CLI itself does NOT pre-validate `--username` with a regex — server-side `loginSchema` enforces the alphanumeric/underscore/hyphen pattern.)
- `--password` is required by `auth login` (no interactive prompt fallback). For scripted use, supply via the global `-p/--password` flag or `HOODY_PASSWORD` env var. Token cached at `~/.hoody/config.json`.
- Default base URL `https://api.hoody.com` (help text and runtime fallback). Override: `--base-url <url>` (CLI flag is kebab-case) or `hoody config set baseUrl <url>` (config key is camelCase).

## Config and profiles

`hoody config set|get <key>` writes `~/.hoody/config.json`. `--profile <name>` switches account; each has own token, base-url, default container.

## Auth modes

Priority: `--token`/`-t` > `HOODY_TOKEN` > stored session. Kit-service routing uses the per-container capability URL.

## Container scope — `--container`/`-c` (REQUIRED for kit commands)

Every command that targets a container kit (`hoody browser|code|cron|curl|daemon|display|exec|files|notes|notifications|pipe|sqlite|terminal|tunnel|watch …`; `db` is the CLI primary with alias `sqlite`, and `kv` is a separate group — both backed by the sqlite kit; `logs` is a kit URL slug only — no `hoody logs` subcommand group, tail logs via `proxy logs` / `exec logs` / `daemon programs logs`) needs a container id. (`hoody agent` IS a kit command group whose *bare* form opens the in-container Agent TUI; `hoody agent prompt …` and the generated `agent sessions|models|…` subcommands live under it.) Resolution order:

1. `--container <id>` / `-c <id>` (global flag, before the subcommand)
2. `HOODY_CONTAINER` env var
3. Per-profile sticky default via `hoody local defaults set container <id>` (NOT `hoody config set`; `local defaults` covers the curated user-facing keys `container`/`realm`/`output`/`noColor`/`quiet`).

```bash
hoody --container ctr-abc files dir /workspace         # inline
HOODY_CONTAINER=ctr-abc hoody files dir /workspace     # env
hoody local defaults set container ctr-abc             # sticky; then plain `hoody files dir /workspace`
```

Account-level commands (`hoody login`, `hoody projects`, `hoody containers`, `hoody wallet`, `hoody auth` (alias `hoody token`), `hoody vault`, etc.) hit the control-plane API and do NOT take `--container`. The flag is silently ignored if passed there.

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

- `chat`, `login`, `hoody auth signup`, `logout`, `config`, `local`, `check-update`, `update`
- `ps` → `containers list`
- `ssh`, `pty` → both re-dispatch to `shell` (the one-shot command is positional: `hoody shell <cid> -- uname -a`; there is no `--command` flag)
- `open` (kit UI); `screenshot` (kit capture); `desktop open`; `kits list`

## Index of common ops

§ Core operations covers: login/2FA, projects, containers, exec, files, screenshots, sqlite, watch, snapshots, vault, wallet. Per-namespace deep dives: `SKILL-CLI/<ns>.md`. URL routing → § Proxy URLs. Auth → § Auth model.

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
> - Watch **`proxyLogs`** for unexpected callers; revoke via `hoody proxy set-state` instantly if leaked.
> - For untrusted reviewers (customers, support tickets, public demos): prefer a **read-only `display`** embed of a screenshot stream over a live terminal, or build a constrained `exec` script that exposes only the operation they need.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP via `hoody containers proxy *` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `hoody proxy create` to ship a brandable hostname (`https://repo-acme.{N}.containers.hoody.com`) into the iframe instead of leaking the `{containerId}`.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace.
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- API kits (`sqlite`, `cron`, `watch`, `curl`, `pipe`, `http-<port>`, …) don't render a UI but you can still iframe them for status-page widgets, long-poll dashboards, etc.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## No local bypass — every call goes through Hoody Proxy

There is **no raw localhost-port bypass** to a kit. Even from inside the same container, every call to a kit service goes through the Hoody Proxy on HTTPS — the kit binds to an internal interface that requires the proxy's authenticated, capability-checked, hook-instrumented path. An agent script trying to bypass via `http://127.0.0.1:<kit_port>` will not reach the kit. For in-container self-calls, use the supported proxy-local shorthand `https://localhost.containers.hoody.com/<service-segment>` (resolves to the local kit via the proxy with the same auth path) or the full `{projectId}-{containerId}-…` kit URL.

Why uniform proxy routing:

- **Security uniformity** — the same `hoody containers proxy *` gates, `hoody containers proxy hooks *` MITM rules, and `proxyLogs.*` capture apply to every request, whether it came from across the internet or from a script in the next process. No "trusted internal" loophole that leaks to attackers via SSRF.
- **One mental model** — same URL works from your laptop, from another container, from inside the container itself. You write the same code; the proxy is transparent.
- **Cost is negligible** — when source and kit are co-located on the same physical machine, the proxy hop adds microseconds (Unix socket / loopback under the hood), not a network round-trip.

Practical consequence: from inside a container, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.containers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this. Don't try to discover and target the kit's internal port — it is firewalled and won't accept the connection.

### Container ↔ container — anyone reaches anyone (with permissions)

Because routing is uniform, **a process in container X can call any kit on container Y just by hitting Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in container X reads / writes files in container Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.containers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three containers, three kit URLs, one transparent network.
- A monitoring container scrapes `/metrics` from every container in a project's fleet by listing them via `hoody containers list` and hitting each one's kit URL.

Cross-container access still goes through the gate stack — Y's `hoody containers proxy *` rules apply to whoever's calling, no matter where they're calling from. So:

- **By default** (no gates set), Y's URL is a capability — anyone with the URL has access. Within your account that's usually fine; for production / shared / multi-tenant fleets you SHOULD gate.
- **With gates set**, X must satisfy them — typically `setTokenGroup` with an auth-token whose `realm_ids` include Y's realm, or a JWT issued for Y's surface. Mint the token in X via `hoody auth create` (with realm-scope), inject it as `Authorization: Bearer …` on the call to Y.

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
- `hoody proxy create` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. Full valid program set is enumerated in the §Proxy aliases table below — note `proxy` (not `proxyLogs`) and `run` (not `app`).

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

The SDK ships builder methods so you don't compose URLs by hand: `client.getKitUrl(slug, container, idx?)` for one kit, `client.getKitUrls(container)` for the full `{terminal, browser, code, …, desktop, exec, files, …}` record. For desktop with a DE override, use the dedicated helper `client.getDesktopUrl(container, { desktopEnv: 'mate', serviceIndex: 1 })` (default DE is xfce; `getDesktopEnvironments()` lists known values). Or compose by hand with `client.getKitUrl('desktop', container, 1)` and append `?desktop_env=mate`. CLI / HTTP consumers compose the URLs from `hoody containers get` (`projectId`, `id`, `server_name`) using the patterns above.

## SSH access — direct shell, no proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `git push` over SSH, port-forward `-L`/`-R`), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{containerId}-ssh.{node}.containers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). This URL routes to TCP `22` on the container.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `hoody containers create` / `hoody containers update` / `hoody containers copy` — that becomes the container's `authorized_keys` (root). Password auth is disabled.

**The public key MUST be unique across containers — one container per key.** Reusing a key returns `409` ("This SSH public key is already in use. SSH public keys must be unique per container."). Generate a fresh keypair per container; you can rotate via `hoody containers update` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; the same shell the kit's `terminal` namespace would give you. Anything inside the container is yours.

### IP filtering

By default the SSH endpoint is reachable from any IP (URL is the credential, plus the keypair check). To restrict source IPs:

- **Control plane** — `hoody firewall ingress create` on TCP `22` with `source` CIDR list. Surface is per-container and reflects in `hoody firewall list`.
- **In-container** — `iptables` / `nftables` rules baked into the image, runtime-installed by your provisioning, or wired to a `daemon` program. Useful when you want a baseline allow-list independent of Hoody's firewall surface.

Either layer applies to SSH only; it does NOT gate kit URLs (those go through the proxy on a different IP path). For kit URLs, use `hoody containers proxy groups ip set` instead.

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

Defaults when port omitted: `http` ⇒ port 80, `https` ⇒ port 443. Port range `1..65535`. Capability-token rules still apply — gate the URL via `hoody containers proxy *` if you don't want it open.

## Friendly aliases — `<alias>.{N}.containers.hoody.com`

A **proxy alias** is a custom hostname that points at one specific program inside a container, without revealing the `projectId` / `containerId`. Same capability-token semantics — alias URL on its own is the credential — but the URL is shareable, brandable, and hides the container plumbing.

### Why use them

- **Hide `containerId`**: shipping `https://my-api.{N}.containers.hoody.com` is fine; shipping `https://65f1...c8a-65f2...41e-http-8080.{node}.containers.hoody.com` leaks the container identifier (which IS the credential of last resort).
- **Brandable**: short, memorable, copy-pasteable.
- **Stable**: alias survives container rebuilds — repoint at a new container, public URL stays the same.
- **Same gate stack**: layer Password / Token / JWT / IP via `proxyPermissionsContainer` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`hoody proxy create`

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

Aliases inherit the container's gate stack — set `hoody containers proxy groups password set` (etc.) on the underlying container and the alias URL becomes password-gated too. There is no per-alias-only gate; gating is at the container/project level.

### Operational notes

- `hoody proxy set-state` disables the alias instantly without releasing the slot — useful to revoke a leaked URL while you investigate.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409`: same alias name on the same physical server, uniqueness enforced across all users and slices (not per-user).
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface — show it in UI as `subserver_name ?? server_name` but never substitute it into a kit URL.
- **After `hoody containers create`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `containerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full container access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — `hoody auth login`. TTL `1d`/`7d` (defaults; configurable via `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN`). Sole credential for admin+impersonation.
2. **Auth token** — `hoody auth create`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, rotatable. Long-lived headless credential.
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
- Response: `data.token` (not `accessToken`), `hoody auth refresh`, `expires_in`.
- 2FA: returns `requires_2fa`, `temp_token` (5-min); exchange at `POST /api/v1/users/auth/2fa/verify`.
- Email signup → username `<localpart>-<4hex>`.

## Kit URLs as credentials

Bearer by default. Layer gates (AND) via `proxyPermissionsContainer`/`proxyPermissionsProject` `.set{Password,Token,Jwt,Ip}Group`, toggled by `updateState`. See § Proxy URLs.

### Container claim — optional portable credential

Every built-in kit — **including `agent`** — accepts the bare per-container kit URL (the URL is the bearer). There is **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` handshake and no `401 CLAIM_REQUIRED` on the built-in kits; the `agent` kit behaves exactly like the others here.

Separately, `POST /api/v1/containers/:id/authorize` (SDK: `hoody containers authorize`; CLI: `hoody containers authorize <cid>`) mints a signed, portable **container claim** — `data: { container_claim: { kid, payload_b64, signature_hex }, expires_in, container_id, project_id }`. It is an *optional* credential for a program **you** run inside a container to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

## Realms — workspace isolation

A **realm** is a 24-hex-id namespace inside your account that walls off projects, containers, tokens, and vault entries. Two realms can hold same-named projects without colliding; an auth token scoped to realm A literally cannot see realm B — `404` on every realm-B id. Treat each substantial project as its own realm: an agent (or human) operating with a realm-scoped token can never accidentally drop a container, wipe a vault key, or run a script in someone else's workspace.

### Why realms

- **Blast-radius cap** — leaked or buggy token erases at most one realm's worth of state.
- **Mistake-proof multi-project work** — the token can only see the realm whose subdomain it's invoked from; a `containers.delete <wrong-id>` becomes a `404` instead of a destructive op.
- **Clean separation** — billing, vault, snapshots, and proxy-aliases are all realm-scoped.
- **Cheap to spin up** — realms are free; create one per project rather than reusing.

### Realm-scoped URL

`https://{realmId}.api.hoody.com` — same control-plane API, but every operation that takes an id resolves only against that realm. Off-realm ids return `404` (or `403` for cross-realm-only operations like `hoody containers copy`/`sync`). Operations targeting a specific realm without the subdomain accept `?realm_id=<id>` instead.

### How to attach a container to a realm

Pass `realm_ids: ['<24-hex>']` when creating the container — and an array of multiple realm IDs is fine if a container needs to be visible in several. Container realm membership is **independent of project realm membership** (a project in realm A can hold a container in realms A+B). Read it back from `containers.get(...).realm_ids`.

### Auth tokens × realms

Mint a realm-scoped token via `hoody auth create`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL"). Add / drop realms post-mint with `hoody auth realms add` / `hoody auth realms remove`. Globally-scoped tokens (no `realm_ids`) can still target a specific realm by using the realm subdomain or `?realm_id=`.

### Best practice — one realm + one token per project

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `hoody realms list`.
2. `hoody auth create` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `hoody projects create` with `realm_ids: [realm_id]` — pin the project to the realm.
4. `hoody containers create` with `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the container too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Set the token in `HOODY_TOKEN` and the realm in `HOODY_REALM` (or use the `--realm` flag) so every call goes to the right scope.

Result: that token can only see projects, containers, tokens, and vault entries in the realm. An agent given just this token cannot accidentally touch your other realms — even if it's the same Hoody account.

## Storing auth tokens

The `hdy_…` token from `hoody auth create` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the container. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `hoody vault set`. Encrypted at rest server-side; readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `hoody vault set`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND `hasPermission(token, 'resources.vault')`. JWT-as-owner bypasses both. See `hoody vault set` / `hoody vault get` / `hoody vault list` / `hoody vault delete` / `hoody vault clear`.

## Token revocation

- `hoody auth logout` — for a JWT this is a **logout-everywhere**: it bumps `session_generation`, revoking every access and refresh token minted before the call. Auth tokens are unaffected.
- `hoody auth refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header, else `401 Invalid refresh token`. **No client injects it for you** — the generated SDK sends the body only, and the CLI sets `skipAuth` (stripping `Authorization` entirely), so SDK, CLI and raw `fetch`/`curl` callers must all set the header themselves. For headless flows prefer minting a long-lived `hoody auth create`.
- `hoody auth delete` / disable / IP-restrict — effective next request.

## 2FA

`hoody auth 2fa setup` returns `{ qr_code, manual_entry_key, backup_codes }`; `hoody auth 2fa verify-setup` enables. Backup codes rotatable, one-time, hashed. `hoody auth 2fa gate` on → sensitive auth-token mutations need TOTP+JWT.

---

# Pre-installed tools — what every container ships with

Every Hoody container starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Containers run real systemd as PID 1 with full root, just like a VM** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides, socket activation, kernel modules, and every other distro affordance Just Work. Two tiers of pre-installed software:

1. **Default tier** — installed on every container, no flag needed.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 24, Bun, Rust, Go, Nix, Docker, …). Pass on `hoody containers create` (or `--dev-kit` flag); when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `pip install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours.

## `kvm: true` — run full VMs inside the container

Containers on **rented / dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the container. Pass `kvm: true` on `hoody containers create` (`--kvm` flag), or toggle it later on a **stopped** container (`hoody containers kvm`). Defaults to off. **Never available on free-tier servers** — the API refuses with `403`. `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every container response carries the current `kvm` boolean.

```bash
hoody containers create --project <project-id> --server-id <server-id> --name vm-host --kvm   # enable at creation
hoody containers kvm <container-id> --kvm      # enable on a stopped container
hoody containers kvm <container-id> --no-kvm   # disable
```
## `hoody` CLI is pre-installed inside every container

The `hoody` binary is on every container's `$PATH` for every user (root, `user`, dynamic uids, even from a cron job's environment). You can call it from a shell session, an `exec` script, a `daemon` program, a cron entry, an SSH session — anywhere. No install step, no extra package.

```bash
hoody --version
hoody projects list
hoody --container "${HOODY_CONTAINER:-$HOODY_CONTAINER_ID}" files dir /workspace
```
Inside the container, `$HOODY_CONTAINER_ID` is pre-populated by the kit (the CLI also accepts `$HOODY_CONTAINER` as a compatibility alias) so commands targeting "this container" can skip the `--container` flag. `$HOODY_TOKEN` is NOT auto-injected — set it via vault/secrets if container code needs to call the API. Login state is per-user under `~/.hoody/config.json`.

This is the same binary as `hoody` outside the container — every example in the CLI skill works inside a container's shell exactly as it would on a developer laptop.

## Default user — `user` (uid 1000) with passwordless sudo

Containers ship with a **non-root account named `user`** (uid 1000, gid 1000, member of `sudo`). Home is `/home/user`. **`/etc/sudoers.d/user` grants `user ALL=(ALL) NOPASSWD: ALL`** — passwordless `sudo` lets agents (and humans) escalate to root for any operation without prompting. Live-verified.

**Use `user` for everyday work, sudo when you actually need root.** Reasons:

- Files created under `user` are owned by uid 1000 — friendlier when you copy/sync them out of the container or back-stop with rsync.
- Many apps (npm, pip in venvs, Bun, Cargo, Go, Nix single-user, Docker rootless, browsers) write into `$HOME` and behave better when `$HOME` is a real user home, not `/root`.
- `journalctl --user`, `systemctl --user`, dbus user buses all hang off a regular user.

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `hoody daemon programs create`, `hoody terminal sessions create`. The generated `GET /{path}` does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For containers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo rm /etc/sudoers.d/user                        # remove the drop-in
sudo passwd user                                   # set a real password
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `hoody containers proxy *` gates and ideally a non-root default user.

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

Set the flag on `hoody containers create` to additionally provision:

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

State is per-container: `hoody containers copy` clones the disk including everything you installed; `snapshots.create` saves a point-in-time you can later `snapshots.restore` to roll back to. There is no global "shared layer" leak — each container's filesystem is its own.

---

# CLI — Core operations

`hoody` recipes. Default base URL `https://api.hoody.com` — both the `--base-url` help text and the runtime fallback when no opts/env/config are set. Scope: `-c <cid>` | `HOODY_CONTAINER` | `hoody local defaults set container <id>`.

---

### 1. Sign up
`hoody signup --email you@example.com --password "$HOODY_PASSWORD"` — a distinct interactive command that ends logged in, NOT an alias for the non-interactive `hoody auth signup`. Signup CLI flags are `--email --password [--region]` (no `--username`); username is auto-generated from the email local part. Password 12–128 chars with at least **3 of 4** character classes (upper/lower/digit/symbol). Resend: `hoody auth email resend`.

### 2. Log in (+2FA)
`hoody login --username alex --password "$HOODY_PASSWORD"` (or `--email you@example.com`); then `hoody auth 2fa verify --code 123456` (also accepts a 10-character backup code via `--code`). Login password ≥8 chars (signup is ≥12).

### 3. Base URL / profiles
Global flags: `--base-url <URL>`, `--profile <P>`. Persist with `hoody config set baseUrl <URL>` (camelCase key).

### 4. List projects
`hoody projects list [-o json]`

### 5. Create project
`hoody projects create --alias my-project --color '#10B981'`

### 6. List containers
`hoody c list [--realm-id <rid>] [-o wide]` (`c` is the registered alias for `containers`; `hoody ps` is also a top-level alias that re-dispatches to `containers list`). There is no `--project` filter; filter post-hoc with `jq` if needed: `hoody c list -o json | jq '.containers[] | select(.project_id=="<pid>")'` (the CLI's `-o json` unwraps the API envelope, so the top level is the `data` body — `.containers`, not `.data.items`).

### 7. Create container
`hoody containers create --project <pid> --server-id <sid> --name ws --hoody-kit`. Flags `--project` and `--server-id` are required.
Servers: `hoody servers {list-rentals|marketplace|rent <id>}`.

### 8. Lifecycle — get/wait, start/stop/restart
```bash
hoody containers get <cid>
until [[ "$(hoody containers get <cid> -o json|jq -r .status)" == running ]];do sleep 2;done   # CLI -o json unwraps the envelope → .status (not .data.status)
hoody containers manage <cid> <op>   # op ∈ {start|stop|force-stop|restart|pause|resume}
```

### 9. One-off command
```bash
hoody shell <cid> -- ls -la /home/user   # `pty`/`ssh` are aliases of `hoody shell`;
hoody pty <cid> -- tmux ls               # the command is POSITIONAL — there is no --command flag
hoody terminal sessions exec --command 'ls' --ephemeral   # --command exists only here
```

### 10. Long-lived terminal
```bash
hoody terminal sessions create --terminal-id 100 --shell bash
hoody terminal sessions exec --terminal-id 100 --command 'pwd' --wait
hoody terminal sessions raw-output [--terminal-id 100]   # --terminal-id optional, defaults to "1"
hoody terminal sessions snapshot --terminal-id 100       # required
hoody terminal sessions delete 100                        # positional, not --terminal-id
```
Pin 1–39999; 40000+=ephemeral.

### 11. SSH
`hoody ssh -c <cid>` — alias for `hoody shell` (not an SSH client by default); pass `--ssh-host`/`--ssh-user` to bridge to a real SSH server.

### 12. Files — list, read, write
```bash
hoody files {dir|stat} /home/user[/x]
hoody files dir /home/user
hoody files stat /home/user/x
hoody files get /home/user/x -o raw > /tmp/x
hoody files copy /home/user/x --copy-to /home/user/y
hoody files move /home/user/y --move-to /home/user/z
hoody files delete /home/user/z
hoody files put /home/user/x --input /tmp/local.bin   # or pipe: cat f | hoody files put /home/user/x
# `files patch` has NO file-body flag (its --body is an inline string, no @file expansion)
# — use raw curl `--data-binary @file` (see HTTP skill) or the SDK Buffer form for that.
```

### 13. Browser screenshot
`hoody browser screenshot --browser-id 0 --url https://example.com --format png -o raw > /tmp/p.png`. The CLI streams to stdout — there is no `--out` flag; redirect or pipe.

### 14. Display capture
```bash
hoody display {screenshots|thumbnails} {latest|capture} -o raw > /tmp/d.png   # PNG bytes via stdout (no --out flag)
```

### 15. SQLite KV
Key is positional; `--db <path>` is required; the JSON-encoded value goes in `--body`.
```bash
hoody kv set <key> --db /data/app.db --body '"hello"'        # value is a JSON-encoded string
hoody kv get <key> --db /data/app.db
hoody kv incr <key> --db /data/app.db --delta 1
hoody kv decr <key> --db /data/app.db
hoody kv batch set --db /data/app.db --body '{"items":[{"key":"a","value":"\"v1\""}]}'
hoody kv batch get --db /data/app.db --body '{"keys":["a","b"]}'
```

### 16. Watch — create + stream
`hoody watch create --paths /data --recursive` (`--paths` is repeatable; there is no `--name`). Then `hoody watch {list|events stream --id <id> -o ndjson}`.

### 17. Tunnels
`hoody tunnel {list|sessions list|bindings list|expose ...}`.

### 18. Snapshots
`hoody snapshots create --container <cid> --alias pre-deploy [--expiry 30]`. Then `hoody snapshots {list --container <cid> | restore --container <cid> --name <alias> | delete --container <cid> --name <alias> | update-alias --container <cid> --name <alias> --alias <new>}` — every snapshot subcommand takes `--container <cid>` (not positional) and identifies snapshots by `--name <alias>`; on `update-alias`, the new value goes in `--alias`.

### 19. Vault
```bash
hoody vault {set <key> --value V|get <key> -o raw|list|delete <key>|clear [--yes]}
```

### 20. Wallet balance
`hoody wallet balance {get|general|ai}`

### 21. Cron entries
```bash
hoody cron entries create <user> --schedule '0 */6 * * *' --command '/x.sh' --name b6
hoody cron entries {list <user> | delete <user> <id> | update <user> <id> ...}
hoody cron crontabs replace <user> ...  # bulk; <user> is positional and required
```

### 22. Daemon — supervised programs
```bash
hoody daemon programs create --name app --command 'node /app/s.js' \
  --user user --boot --autorestart unexpected     # --boot (not --autostart) toggles auto-start at container boot
hoody daemon programs {list | stop <id> | logs <id> --lines 200}    # stop/logs take positional <id>, not --name
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
hoody open <service>   # service ∈ terminal|files|code|display|desktop|sqlite|notifications|browser|daemon|exec|cron|curl|watch|logs|ssh|http|https|http-<port>|https-<port>|proxy (db/kv are aliases for sqlite). NOT `agent` — that is rejected. Top-level `open` takes a service name, NOT a container id.
hoody {display|code|files|exec|db|kv|notifications} open [...]
```

### 25. Local AI chatbot REPL
`hoody chat ['prompt']`

### 26. Discover kits
`hoody kits list [--named-only]` — kit slug catalog; see § Proxy URLs above.

### 27. Debug flags
```bash
hoody projects list --verbose         # show HTTP req/resp
hoody <cmd> --quiet                   # errors only
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
|`--base-url`|Default `https://api.hoody.com` — both the help text and the runtime fallback when no opts/env/config are set.|
|`-t`,`-u`,`-p`,`-y`|bearer; user-NOT-email; pw; auto-yes|
|`-c`,`--realm`,`--proxy`,`--non-interactive`|container(→env); realm; proxy; CI|
|`--domain`|update-verify; **precede subcommand**|
|`--kit-*`|kit auth; capability URL is credential|
|`--local-password*`,`--local-lock-timeout`,`--allow-ephemeral-token`,`--refresh-scripts`|lock+cache|

Status: green=running, yellow=stopped, cyan=starting, red=error.

## Output formats

`table`/`wide` default; `json`/`yaml` print just the unwrapped `data` payload (the CLI strips the `{statusCode,message,data}` envelope via `isApiEnvelope`); `raw`=payload/SSE; `ndjson` default for streams/events; `pretty`=human stream. `-q` keeps `json`/`yaml`.

## Exit codes

`0`=success; `1`=general command/HTTP failure (4xx and 5xx both); `2`=update or exec-dynamic parse failure; `6`=TTY absent (interactive prompt requested but no TTY available); `7`=user abort; `8`=lock contention; `9`=lock validation error; `10`=profile not found; `11`=crypto/lock error; `12`=migration error; `14`=ephemeral-token policy; `130`=SIGINT; `143`=SIGTERM; `149`=SIGBREAK (Windows).

## Login flow

`POST /api/v1/users/auth/login` with `username` body field. Global `-u`/`--username` always sends `username`; for email login use `hoody auth login --email <addr>` (subcommand-level `--email` flag, `cli/commands/auth.ts:1731`). If the response carries a `temp_token` without a `token`, the auto-login flow throws `Auto-login cannot complete the 2FA challenge`; finish the flow explicitly with `hoody auth 2fa verify --temp-token <tt> --code <6-digit OTP or 10-char backup code>` (or call `POST /api/v1/users/auth/2fa/verify`). Token persisted; `hoody logout` clears.

## Local-only operations

`hoody local` — `~/.hoody/`, no server calls. `defaults {set|show|unset} <k> [<v>]` pins `container`/`realm`/`output`/`noColor`/`quiet`. `lock {setup|status|change|reveal|remove|enforce|recover|doctor|purge}` (no `unlock` subcommand) uses `flock()`. `--non-interactive` accepts a password via `--local-password <pw>`, `HOODY_LOCAL_PASSWORD` env var, file/fd, or stdin (any of these is sufficient).

## Update

Fetch manifest (`--domain`/`~/.config/hoody/domain`/`HOODY_DOMAIN`); **minisign-verify** vs build-embedded key (bad sig aborts). `update` and `check-update` share the same handler — both check for newer releases and print install instructions; neither atomically replaces `$0`. The update banner runs only on bare `hoody`, `--help`, and explicit `hoody update`/`check-update` (no per-command implicit check). `HOODY_NO_UPDATE_CHECK=1` (or `HOODY_INTERNAL_DAEMON=1`) suppresses the banner.

## Environment variables

`HOODY_TOKEN`/`HOODY_API_TOKEN`, `HOODY_CONTAINER`/`_ID`, `HOODY_REALM`/`_ID`, `HOODY_USERNAME`/`_USER`, `HOODY_PASSWORD`/`_PASS`, `HOODY_BASE_URL`/`_API_URL`, `HOODY_PIPE_URL`, `HOODY_PROFILE`, `HOODY_DOMAIN`, `HOODY_KIT_AUTH`/`_TYPE`, `HOODY_KIT_USER`, `HOODY_KIT_TOKEN`, `HOODY_KIT_TOKEN_HEADER`, `HOODY_KIT_PASSWORD`/`_PASS`, `HOODY_NO_UPDATE_CHECK`, `NO_COLOR`, proxy (`ALL_PROXY`/`HTTPS_PROXY`/`HTTP_PROXY`). The config file path is set via the global `--config` flag (no `HOODY_CONFIG` env var).

---

## Subskill index

- [`agent`](https://hoody.com/SKILLS/SKILL-CLI/agent.md) — In-container AI coding agent over HTTP
- [`api`](https://hoody.com/SKILLS/SKILL-CLI/api.md) — Platform control plane: identity, projects, containers, billing, vault
- [`browser`](https://hoody.com/SKILLS/SKILL-CLI/browser.md) — Per-container Chromium/Firefox via Playwright/Patchright
- [`code`](https://hoody.com/SKILLS/SKILL-CLI/code.md) — VS Code in the browser, per container
- [`cron`](https://hoody.com/SKILLS/SKILL-CLI/cron.md) — managed crontab entries per system user
- [`curl`](https://hoody.com/SKILLS/SKILL-CLI/curl.md) — full HTTP client gateway + REST-as-GET-URL bridge
- [`daemon`](https://hoody.com/SKILLS/SKILL-CLI/daemon.md) — supervisord program lifecycle (start any program; logs always retained)
- [`display`](https://hoody.com/SKILLS/SKILL-CLI/display.md) — programmatic GUI desktops with screenshots, input, and windows
- [`exec`](https://hoody.com/SKILLS/SKILL-CLI/exec.md) — micro-services: any script or API as an instant HTTP endpoint
- [`files`](https://hoody.com/SKILLS/SKILL-CLI/files.md) — container filesystem over HTTP, with automatic Git-like change history
- [`notes`](https://hoody.com/SKILLS/SKILL-CLI/notes.md) — Collaborative notebooks, hierarchical nodes, documents, databases
- [`notifications`](https://hoody.com/SKILLS/SKILL-CLI/notifications.md) — Trigger and consume desktop notifications inside a container
- [`pipe`](https://hoody.com/SKILLS/SKILL-CLI/pipe.md) — Zero-storage streaming HTTP transfers
- [`proxyLogs`](https://hoody.com/SKILLS/SKILL-CLI/proxyLogs.md) — Per-container request/response/event log query, stats, and SSE tail
- [`run`](https://hoody.com/SKILLS/SKILL-CLI/run.md) — resolve apps to shell commands
- [`sqlite`](https://hoody.com/SKILLS/SKILL-CLI/sqlite.md) — SQLite HTTP API
- [`terminal`](https://hoody.com/SKILLS/SKILL-CLI/terminal.md) — Persistent multiplayer PTY sessions over HTTP and WebSocket
- [`tunnel`](https://hoody.com/SKILLS/SKILL-CLI/tunnel.md) — reverse tunnels for HTTP/WS/TCP via container relay
- [`watch`](https://hoody.com/SKILLS/SKILL-CLI/watch.md) — Linux inotify file-change streams with replay history
