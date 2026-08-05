> _**CLI skill (FULL — basic + all 19 namespaces)** · ~153,080 tokens · hoody-sdk v1.0.0-beta.11_

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
https://65f1...c8a-65f2...41e-http-8080.code-sg-sin-1.containers.hoody.com

# Service that already terminates TLS on :8443
https://65f1...c8a-65f2...41e-https-8443.code-sg-sin-1.containers.hoody.com

# WebSockets just work (use `wss://`)
wss://65f1...c8a-65f2...41e-http-3000.code-sg-sin-1.containers.hoody.com/ws
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
`hoody signup --email you@example.com --password 'Hoody-Pass-12!'` — a distinct interactive command that ends logged in, NOT an alias for the non-interactive `hoody auth signup`. Signup CLI flags are `--email --password [--region]` (no `--username`); username is auto-generated from the email local part. Password 12–128 chars with at least **3 of 4** character classes (upper/lower/digit/symbol). Resend: `hoody auth email resend`.

### 2. Log in (+2FA)
`hoody login --username alex --password 'hunter2-Yz'` (or `--email you@example.com`); then `hoody auth 2fa verify --code 123456` (also accepts a 10-character backup code via `--code`). Login password ≥8 chars (signup is ≥12).

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


---

<!-- ===== namespace: agent ===== -->

# `agent` — In-container AI coding agent over HTTP

## Purpose

The `hoody-agent-d` HTTP gateway exposes the in-container AI agent as a typed namespace: create a chat session, send a prompt, stream the turn (tool calls, gates, output), then confirm/answer/cancel as the agent works. 22 services — `sessions`, `agents`, `models`, `skills`, `memory`, `github`, `workflows`, `tools`, `hooks`, `mcp`, `settings`, `system`, `loops`, `logs`, `tasks`, `statistics`, `jobs`, `discovery`, `headless`, `todos`, plus `hoody` (token bootstrap) and a namespace-root `GET /api/v1/agent/logs/export`.

## When to use

- **Drive the agent programmatically** — create a session, prompt it, and consume the turn: `hoody agent sessions create` → stream the turn for live tool/gate/output events (per surface — see the streaming note under Quirks), or `hoody agent sessions prompt-sync` for one blocking call → resolve gates with `hoody agent sessions confirm-gate` / `hoody agent sessions answer-question` → `hoody agent sessions cancel` to interrupt.
- **Inspect or configure the agent** — list `models` (`hoody agent models list` / `hoody agent models get`) and `hoody agent models list-providers` (configure providers via `hoody agent models set-provider-default` / `hoody agent models set-provider-api-key` / `hoody agent models start-provider-o-auth`); switch a session's active model with `hoody agent sessions set-model`, browse/install `skills`, read/edit `memory`, manage `workflows`, `hooks`, `agents` (named agent profiles), and `tools` — both the sessionless catalogue/registry (`hoody agent tools list` / `hoody agent tools list-read-only` / `hoody agent tools get`, and `hoody agent tools run` (blocks, returns the result) / `hoody agent tools run-async` (returns `{ job_id }`, poll `jobs`) / `hoody agent tools stream` (one-shot result over SSE frames — not a per-token stream) to invoke a tool with no session — read-only by default, a mutating tool needs `allow_mutations: true` or a confirmed re-issue) and the per-session surface (`hoody agent tools list-session` for a session's *effective* tool set, `hoody agent tools list-session-mcp`, and `hoody agent tools run-session`). Unlike the sessionless `hoody agent tools run`, a per-session run executes against the session's *frozen* realm/container/cwd/tool-mode and claims the session's single serial turn slot — so it returns 409 `turn_in_flight` while a turn is running, 409 `gate_parked` while a gate is open, and 404 `tool_not_found` if the tool is not in that session's effective list; its mutating-tool posture comes from the live session's gate chain (the `allow_mutations` escape hatch is sessionless-only).
- **One-shot non-interactive runs** — `hoody agent headless create-run` for a fire-and-forget agent invocation that returns a job; poll `hoody agent jobs get` / `hoody agent jobs get-result`.
- **GitHub from inside the agent** — first establish an account with `hoody agent github login` (omit the body for a GitHub device flow → poll `hoody agent github login-poll`; or pass a `token` PAT to persist it directly), then `hoody agent github auth-status` to confirm; once an account is active, `hoody agent github clone` / `hoody agent github commit` (and `hoody agent github status` / `hoody agent github branches` / `hoody agent github repos` / `hoody agent github pull-request` / `hoody agent github sync`) for repo operations the agent performs in-container.

## When NOT to use

- Want the interactive TUI, not the API? Run the bare `hoody agent` launcher (`cli/agent-command.ts`) — it opens the in-container Agent TUI over the terminal-kit WebSocket; this namespace is the HTTP control surface beside it.
- Raw shell / command exec → `terminal` (PTY) or `exec` (one-shot). File I/O → `files`. The agent runs these as tools internally; call them directly when you don't need the LLM.
- Account-level resources (containers, billing, realms) → `api`.

## Prerequisites

- Container with the `agent` kit running (`hoody-agent-d` gateway); capability URL.
- At least one model provider configured (`hoody agent models list-providers` / `hoody agent models list` to confirm one is usable) before prompting.
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

`hoody agent sessions create` → `hoody agent sessions prompt-sync` with `{ text }` — blocks until the turn finishes and returns the result in one call. Best for short, non-interactive prompts where you don't need streamed events.

### 3. Resolve gates mid-turn

While a prompt streams, the agent may pause for human input: a confirmation gate → `hoody agent sessions confirm-gate`; an open question → `hoody agent sessions answer-question` (to get a helper model to DRAFT an answer for a parked question call `hoody agent sessions answer-assist` — it does NOT answer the gate: it dispatches an async job (HTTP 202) whose suggestion arrives via `hoody agent jobs get-result` and an `event.question_suggestion` on the session stream — only one assist may be in flight per session — and the real answer still goes through `hoody agent sessions answer-question`; for unattended runs arm `hoody agent sessions set-auto-reply` (a self-driving auto-user loop that withholds write-class actions unless you opt in with `allow_writes: true`, either on the arm call or later via `hoody agent sessions set-auto-reply-writes`)). Echoing a wrong/stale `gate_id`/`generation`, or answering when nothing is parked, returns 409 (`no_pending_gate` / `stale_gate` / `gate_already_answered` / `gate_type_mismatch`). Interrupt a running turn with `hoody agent sessions cancel`. Tear the session down: `hoody agent sessions close` removes it from the live map; `hoody agent sessions delete` drops the live connection but keeps the persisted record (re-attach via `hoody agent sessions create`), while a *hard* delete (set the `hard` flag — SDK `hoody agent sessions delete`, HTTP `?hard=true`, CLI `--hard`) also erases the persisted record. To roll a session back without tearing it down, `hoody agent sessions trim` with `{ turn_idx }` truncates conversation history to (and including) that turn index.

### 4. Pick a model / provider

`hoody agent models list-providers` to see configured providers, `hoody agent models list` to list available models, then `hoody agent sessions set-model` to bind a model to a session before prompting — SYNCHRONOUS: the response reports the actual outcome ({status:'ok', model, persisted} on success; structured 409/422 errors while busy or for an unconstructable spec) and a successful switch PERSISTS into the chat agent's frontmatter (a global repin for future sessions of that agent). PRECEDENCE: the agent's frontmatter `model` is the DEFAULT for a session that does not request one; an explicit `hoody agent sessions create` (or this live `hoody agent sessions set-model`) OVERRIDES that pin for the session — create is session-scoped and does not rewrite the agent, this live switch repins globally. The shipped default agent ships pinned, so its pin is the out-of-the-box default until an explicit model is chosen (`hoody agent sessions create` with attach or backend:"acp" is rejected 400 — a resumed/delegated session cannot take an explicit model). Each session has further per-session knobs (all session-scoped PATCHes that apply live): `hoody agent sessions set-effort` (`{ effort }` — `low|medium|high|xhigh`, or `""` for the model default), `hoody agent sessions set-verbosity` (`{ level }` — `normal|concise|terse|minimal`), `hoody agent sessions set-hoody-env` (`{ enabled }` — toggle whether the `HOODY_*` shell-env contract is injected for the bash tool), and `hoody agent sessions set-chat-agent` (`{ agent }` — bind a named profile from `agents`).

### 5. Skills, memory, todos, workflows, agents

- **Skills** — `hoody agent skills list` (each carries an enabled + trust state), `hoody agent skills install-hub` / `hoody agent skills search-hub` / `hoody agent skills preview-hub` to find and install from the hub. A newly installed/imported skill must be trusted before its code runs — `hoody agent skills trust` is the gate (identify the skill by `root_dir`+`rel_dir`, set the `trusted` flag); `hoody agent skills toggle` only enables/disables by `name` (set the `disabled` flag). Like the J-class todo ops, both `hoody agent skills trust` (which grants arbitrary code-execution trust) and `hoody agent skills install-hub` (which writes arbitrary skill code to disk) have NO human-confirmation gate over this namespace — that denial lives only on the model-facing skill-edit tool path, and the HTTP edge has no app-level admin gate, so an autonomous API caller can silently trust and install skill code; gate these in your own caller.
- **Memory** — `hoody agent memory search` for hybrid recall (BM25 + vector + graph) and `hoody agent memory list-items` to enumerate by `project`; `hoody agent memory save-item` / `hoody agent memory edit-item` / `hoody agent memory delete-item` to write; `hoody agent memory get-graph` for the relation graph (or `hoody agent memory get-item` to read one record by `id`). `hoody agent memory set-enabled` (`{ enabled }`) is the memory capture/privacy switch — it persists `features.memory` and flips the live store — and `hoody agent memory flush` forces the store's durability barrier; both are not admin-gated. Memory is project-scoped (pass `project`); the reads (`hoody agent memory search` / `hoody agent memory list-items` / `hoody agent memory get-graph` / `hoody agent memory list-projects`) and `hoody agent memory consolidate` are active-realm-only (a realm header is rejected), while the writes (`hoody agent memory save-item` / `hoody agent memory edit-item` / `hoody agent memory delete-item`) carry no such restriction. `hoody agent memory search` / `hoody agent memory get-graph` also return `503 store_unavailable` while the store is still warming — retry rather than treating it as an empty result.
- **Todos** — `hoody agent todos list` / `hoody agent todos create` to file; then `hoody agent todos triage` (LLM inbox pass), `hoody agent todos claim` / `hoody agent todos release`, `hoody agent todos run` (dispatch a background orchestrator — returns `{job_id, session_id}`), `hoody agent todos cancel-run` to abort an in-flight run, and `hoody agent todos approve-proposal` / `hoody agent todos deny-proposal` to resolve a proposed run — approve is NOT inert: it spawns a background worker session equivalent to `hoody agent todos run` (a J-class autonomous run that spends model budget), while `hoody agent todos deny-proposal` spawns nothing — plus `hoody agent todos snooze` / `hoody agent todos archive`. To advance a todo through its lifecycle (inbox→active→done) or edit its fields, `hoody agent todos update` applies a CAS-guarded patch / `state` transition — read the todo's OWN `revision` with `hoody agent todos get` and pass it back (`hoody agent todos get-revision` is a store-wide change cursor, NOT the CAS token; a stale value → `409 todo_conflict`); a stale revision is rejected (409). `hoody agent todos archive` is not terminal — `hoody agent todos purge` permanently and irreversibly destroys all archived todos (no confirmation gate; treat as destructive). Mind the comment split: `hoody agent todos post-comment` (`/messages`, plural) only appends a comment, whereas `hoody agent todos message` (`/message`, singular) ALSO kicks an orchestrator turn — a budget-spending LLM run that returns `{job_id}` — so use the plural form for a plain note. Note `hoody agent todos run` / `hoody agent todos triage` / `hoody agent todos approve-proposal` are J-class autonomous runs with NO confirmation gate on the RPC (reaching the RPC is itself treated as the human approval; that denial lives only on the model-facing `run_todo` *tool*), so calling them from automation silently dispatches a real LLM run — gate them in your own caller.
- **Workflows** — `hoody agent workflows list` / `hoody agent workflows get` / `hoody agent workflows put` / `hoody agent workflows delete` / `hoody agent workflows hide` manage saved definitions; `hoody agent workflows run-session` dispatches one onto a live session and returns a JOB, not a run (optionally seed the run with a `{ prompt }` body — input text fed to the workflow) — poll `hoody agent jobs get` until its `run_id` populates (null during the brief dispatch window), then track via `hoody agent workflows list-runs` / `hoody agent workflows get-run` and stop with `hoody agent workflows cancel-run`; feed a running workflow with `hoody agent sessions post-workflow-message` (`{ text }`). Run events flow on the owning session's stream, not a per-run bus.
- **Agent profiles** — `hoody agent agents list` to enumerate named profiles; `hoody agent agents create` / `hoody agent agents copy` / `hoody agent agents rename` / `hoody agent agents delete`; `hoody agent agents get-source` → edit → `hoody agent agents put-source` (pass `base_gen` from the read for conflict detection); `hoody agent agents set-model` / `hoody agent agents set-tools` / `hoody agent agents toggle-tool` / `hoody agent agents set-turns` / `hoody agent agents reset-to-shipped`. To make a session use a profile, `hoody agent sessions set-chat-agent` (`{ agent }`) — that selects, it does NOT edit the profile. Two daemon guard rails: `hoody agent agents delete` refuses a shipped-default profile or the configured default chat agent (`is_error:true` — use `hoody agent agents reset-to-shipped` or `hoody agent agents put-source` instead), and `hoody agent agents reset-to-shipped` refuses a profile that has no shipped default (`is_error:true`).

### 6. Fire-and-observe, recurring prompts, and re-attach

- **Fire-and-observe** — `hoody agent sessions post-message` with `{ text }` dispatches a turn and returns `{ job_id }` immediately (HTTP 202) without streaming or blocking; watch completion via `agent_done` on `hoody agent sessions stream`. Refuses with 409 `turn_in_flight` if a turn is running, or 409 `gate_parked` if a gate is open.
- **Observe / re-attach** — `hoody agent sessions stream` attaches (WebSocket primary, SSE fallback) to a live session's full `event.*` stream; pass `since` (gateway int64 seq, or the `Last-Event-ID` header) to resume from the 1024-event replay ring after a disconnect (a gap past eviction yields `event: lagged {code:replay_gap}`). `hoody agent sessions replay` returns the buffered event tail of a *live* session (with `min_seq`/`max_seq`) for a one-shot catch-up (only a *live* session has this ring; for a non-live session there is nothing to replay — attach via `hoody agent sessions stream` to receive the daemon's `event.replay` instead).
- **Recurring prompts (loops)** — `hoody agent loops create` with `{ prompt, interval }` (plus optional `max_runs` / `stop_when` / `max_cost_usd` / `max_wall_ms` caps) schedules a prompt to re-fire on a live session; `hoody agent loops list` / `hoody agent loops update` (pause via `{ paused: true }`) / `hoody agent loops delete` to manage, `hoody agent loops run-now` to fire one immediately. Loops are entirely session-scoped.

### 7. Headless one-shot run

`hoody agent headless create-run` for a non-interactive invocation that returns a job handle; poll `hoody agent jobs get` and fetch the output with `hoody agent jobs get-result`.

### 8. Configure MCP servers for a session

Reads first: `hoody agent mcp list` (`{ session_id }`) returns the EFFECTIVE merged `mcp_servers` config, the per-layer settings files behind it, and each server's LIVE runtime state (connected, negotiated protocol revision, tool count, pid, revocation reason, recent stderr). Every write is TWO steps: `hoody agent mcp begin-write` (`{ session_id, op, scope }`, op ∈ `upsert`|`delete`|`set_enabled`|`import`, scope ∈ `user` (default)|`project`|`local`) mints a single-use nonce bound to {session, op, resolved settings path} and returns the target path plus the current `mcp_servers` hash — then present that `nonce` plus the hash as `expect_hash` on the matching `hoody agent mcp upsert` / `hoody agent mcp delete` / `hoody agent mcp set-enabled` / `hoody agent mcp import`. BOTH are required on every write: skipping step one fails closed, a nonce minted for a different op or scope fails closed, and `expect_hash` has no omit-it default — a first write into a settings file that does not exist yet states that expectation with the empty-array hash rather than leaving the field out. To adopt someone else's config, preview it with `hoody agent mcp parse` (`{ session_id, document }` — writes nothing, needs no nonce, strips credential values) and then `hoody agent mcp import` with a fresh `op: "import"` nonce; imported servers land DISABLED, so enable each one with `hoody agent mcp set-enabled`. After editing a settings file by hand, or to recover a server that died, `hoody agent mcp reconnect` (`{ session_id }`) re-reads the layers and reconciles every live session's pool — a healthy unchanged server is not restarted. `hoody agent mcp probe` trials a candidate config without saving it, but it is human-only (see Common errors).

## Quirks & gotchas

- The bare `hoody agent` verb is a **hand-written TUI launcher** (`cli/agent-command.ts`), distinct from this generated HTTP namespace; they coexist — the launcher opens the in-container Agent TUI, the namespace is the typed control surface.
- Source of truth is the `hoody-agent-d` gateway's own OpenAPI document, served at `GET /api/v1/agent/openapi.{json,yaml}`; every route lives under the single `/api/v1/agent` prefix. The kit URL is itself the credential; no HTTP bearer header is required.
- The proxy service slug is `agent` and the kit URL host carries the index segment (`-agent-{index}`); resolve it via `getKitUrl('agent', container)` rather than hand-building.
- `hoody agent sessions prompt-sync` blocks until the turn finishes (or returns `{pending_gate}` the moment a turn parks on a confirm/question) — long un-parked agent turns can still exceed default HTTP client timeouts; prefer streamed prompting for anything non-trivial so you can observe progress and resolve gates as they arrive. (Stream the turn with `hoody agent prompt "<task>" -c <id>` — the user-facing launcher reads the daemon's SSE for you; the generated `prompt-stream` subcommand is the raw, hidden form.)For non-interactive turns where you cannot resolve gates by hand, enable the `auto_approve` gate policy on `hoody agent sessions prompt-stream` / `hoody agent sessions prompt-sync` to auto-approve confirm gates for the life of the turn (off by default) — HTTP: `?policy=auto_approve` (or the `X-Hoody-Gate-Policy: auto_approve` header); SDK: `policy: 'auto_approve'` in the prompt options; the generated CLI: `--policy auto_approve`. Note this only answers **confirm** gates, never questions. (`hoody agent prompt` takes `-y/--yes` as the shorthand for `?policy=auto_approve`; the bare TUI launcher has no such flag.)- Every prompt/gate/cancel call is **session-scoped** — you must hold a session id from `hoody agent sessions create` first; there is no implicit default session. Hook writes are session-scoped too (the guarded writes — `hoody agent hooks upsert` / `hoody agent hooks delete` / `hoody agent hooks toggle` / `hoody agent hooks disable-all` — plus `hoody agent hooks begin-write`, and the side-effecting `hoody agent hooks test` / `hoody agent hooks ack-trust`, all require a live `session_id` — `hoody agent hooks ack-trust` clears the per-session hook-trust prompt (the execution-trust probe `hoody agent hooks list` reports), the gate that must be acknowledged before any hook command is allowed to fire, mirroring `hoody agent skills trust` for skills; `hoody agent hooks reload` accepts one only to also return the reloaded summary) AND nonce-guarded: call `hoody agent hooks begin-write` (`{ session_id, op, scope }`, op ∈ upsert|delete|toggle|set_disabled) to mint a single-use nonce, then pass that `nonce` on the matching `hoody agent hooks upsert` / `hoody agent hooks delete` / `hoody agent hooks toggle` / `hoody agent hooks disable-all` — the nonce binds to that session+op+scope tuple and the write fails closed without it. Note hooks are an arbitrary-command surface: `hoody agent hooks upsert` persists a command that fires on lifecycle events and `hoody agent hooks test` executes one immediately. The human-only confirmation gate lives only on the model-facing tool path, not on these RPCs, and the gateway HTTP edge has no app-level admin gate — the same access that authorizes any agent-kit call authorizes these too, with nothing extra, so gating this surface is the caller's/proxy's responsibility.
- **Credential VALUES are never returned by the MCP surface.** `hoody agent mcp list` reports `env_keys` / `header_keys` — key NAMES only — because a redacted value invites a client to write the placeholder back as the real secret; a write whose body carries the redaction placeholder for a credential is REFUSED rather than stored. To change a secret you must supply its real value; to leave one alone, omit the field — `hoody agent mcp upsert` merges FIELD BY FIELD over the existing entry of the same name, so omitted fields keep their stored value (including fields this build does not model), and `hoody agent mcp set-enabled` flips only the `enabled` flag so credentials and options survive a disable. Writes apply to live sessions before the response returns: a deleted, disabled, or re-pointed server is REVOKED in every live session first (a stdio child is reaped when its last holder releases), so a caller mid-turn cannot still reach it. Import is WHOLE-BATCH — one bad entry aborts everything — it understands the hoody (`mcp_servers` list), Claude/Cursor (`mcpServers` map) and VS Code (`servers` map) dialects, and REFUSES a document carrying more than one of them rather than guessing.

## Common errors

- A gate or question left unresolved stalls the turn — a streamed prompt that emitted an `event.confirm_request` (confirm gate) or `event.user_question` (question gate) will not complete until you answer it: `hoody agent sessions confirm-gate` for a confirm, `hoody agent sessions answer-question` for a question. For unattended runs, arm `hoody agent sessions set-auto-reply` (a self-driving auto-user loop), or pass `policy: "auto_approve"` on the prompt — but `auto_approve` only auto-approves **confirm** gates, never questions; a parked question still stalls until `hoody agent sessions answer-question` (or the auto-reply loop) answers it.
- `hoody agent tasks list` and `hoody agent tasks request-transcript` do NOT return data inline — they ask a *live* session to emit its background-subagent snapshot/transcript onto the session's WebSocket/SSE stream (`event.tasks_snapshot` for the snapshot, `event.task_transcript` for the transcript) and return only a JSON ack; you must already be attached via `hoody agent sessions stream` to receive the payload. `hoody agent tasks cancel` / `hoody agent tasks cancel-all` stop background tasks mid-turn (server-layer; tasks survive `hoody agent sessions cancel` but are not restartable).
- `hoody agent memory consolidate` (POST /memory/consolidate) is **human-only and ALWAYS fails over this namespace** — the gateway server-stamps a machine marker and the daemon's non-bypassable gate returns `403 human_only` for every HTTP/SDK/CLI call; it can only be triggered from an interactive human session. Do not call it programmatically.
- `hoody agent mcp probe` (POST /mcp/probe) is **human-only and ALWAYS fails over this namespace** — probing STARTS A PROCESS (stdio) or makes an outbound request to a caller-chosen URL (http/sse), so a machine caller may not self-approve it and receives `403 human_only` on every HTTP/SDK/CLI call. The surface still exposes it for completeness, it simply always refuses. The deny list is still enforced on the candidate config before anything is started. Use `hoody agent mcp parse` for a write-free preview instead; there is no programmatic substitute for the live trial.
- An MCP write needs BOTH a `nonce` and an `expect_hash` — neither is optional, and a stale hash is a CONFLICT rather than a silent overwrite. `hoody agent mcp upsert` / `hoody agent mcp delete` / `hoody agent mcp set-enabled` / `hoody agent mcp import` each require a fresh single-use `nonce` from `hoody agent mcp begin-write` minted for that exact op and scope (one minted for a different op or scope fails closed) AND the `mcp_servers` hash you last read, from either `hoody agent mcp begin-write` or `hoody agent mcp list`. A mismatch means someone else edited the layer since you read it — re-read, re-mint, retry; each nonce is good for exactly one write, so a retry always needs a new one. There is no "omit it for the first write" shortcut: writing into a settings file that does not exist yet means passing the empty-array hash.
- `hoody agent workflows delete` only removes **user** workflows — built-in/**system** workflows are refused (`is_error:true`) and re-seed on every boot; `hoody agent workflows hide` is the only way to remove a system workflow from view.
- Empty values on agent-profile edits mean *inherit / unrestrict*, not *clear to nothing*: `hoody agent agents set-model` with `model: ""` removes the model line (falls back to the default model), and `hoody agent agents set-tools` with `tools: []` removes the allow-list line, which means **all tools are allowed** (NOT zero). Pass a non-empty `tools` array to genuinely restrict.
- Prompting with no usable model/provider configured fails the turn — check `hoody agent models list-providers` returns a ready provider before you prompt (blocking or streamed).
- Calling prompt/gate/cancel against a session whose live connection was torn down (`hoody agent sessions close`, or `hoody agent sessions delete` without `hard`) returns not-found — re-attach with `hoody agent sessions create` if the record survives, or start fresh with `hoody agent sessions create`. After a *hard* `hoody agent sessions delete` (the `hard` flag set) the record is gone and only a fresh `hoody agent sessions create` works.

## Related namespaces

`terminal`, `exec`, `files`, `notes`, `api`.

## Reference

### `hoody agent` (171) — AI agent — sessions, prompting, models, skills, memory, todos, workflows

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody agent agents copy` |  | write | Copy a chat agent | `agent.agents.copyAgent` | `hoody agent agents copy --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --new-name <new_name>` |
| `hoody agent agents create` |  | write | Create a chat-agent definition | `agent.agents.createAgent` | `hoody agent agents create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --name my-resource --frontmatter <frontmatter> --system-prompt <system_prompt>` |
| `hoody agent agents delete` |  | write | Delete a custom chat agent | `agent.agents.deleteAgent` | `hoody agent agents delete --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents get-source` |  | read | Read a chat agent's source | `agent.agents.getAgentSource` | `hoody agent agents get-source --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents list` |  | read | List chat-agent definitions | `agent.agents.listAgentsIterator` | `hoody agent agents list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents put-source` |  | write | Write a chat agent's source | `agent.agents.putAgentSource` | `hoody agent agents put-source --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --content "Hello" --base-gen 10` |
| `hoody agent agents rename` |  | write | Rename a chat agent | `agent.agents.renameAgent` | `hoody agent agents rename --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --new-name <new_name>` |
| `hoody agent agents reset-to-shipped` |  | write | Reset an agent to its shipped default | `agent.agents.resetAgentToShipped` | `hoody agent agents reset-to-shipped --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent agents set-model` |  | write | Set an agent's model | `agent.agents.setAgentModel` | `hoody agent agents set-model --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --model openai/gpt-5.4-nano` |
| `hoody agent agents set-tools` |  | write | Set an agent's tool allow-list | `agent.agents.setAgentTools` | `hoody agent agents set-tools --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --tools <tools>` |
| `hoody agent agents set-turns` |  | write | Set an agent's max-turns | `agent.agents.setAgentTurns` | `hoody agent agents set-turns --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --turns 10` |
| `hoody agent agents toggle-tool` |  | write | Toggle a single tool for an agent | `agent.agents.toggleAgentTool` | `hoody agent agents toggle-tool --name my-resource --tool abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent discovery list-containers` |  | read | List containers in a realm (for binding) | `agent.discovery.listContainersIterator` | `hoody agent discovery list-containers --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent discovery list-realms` |  | read | List realms (for binding) | `agent.discovery.listRealmsIterator` | `hoody agent discovery list-realms --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github auth-status` |  | read | GitHub auth status | `agent.github.githubAuthStatus` | `hoody agent github auth-status --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github branches` |  | read | List GitHub branches | `agent.github.githubBranches` | `hoody agent github branches --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github clone` |  | write | Clone a GitHub repository | `agent.github.githubClone` | `hoody agent github clone --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --repo my-repo --dir <dir> --full-name <full_name> --clone-url https://example.com --shallow` |
| `hoody agent github commit` |  | write | Stage all and commit | `agent.github.githubCommit` | `hoody agent github commit --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --message "Hello"` |
| `hoody agent github login` |  | write | Start a GitHub device-flow login (or add a PAT) | `agent.github.githubLogin` | `hoody agent github login --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --token <token> --host example.com --activate` |
| `hoody agent github login-poll` |  | write | Poll a GitHub device-flow login to completion | `agent.github.githubLoginPoll` | `hoody agent github login-poll --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --host example.com --device-code <device_code> --interval 10 --expires-in 10` |
| `hoody agent github pull-request` |  | write | Open a pull request | `agent.github.githubPullRequest` | `hoody agent github pull-request --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --title "My Title" --body '{}' --base <base>` |
| `hoody agent github repos` |  | read | List GitHub repos | `agent.github.githubRepos` | `hoody agent github repos --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github status` |  | read | GitHub working-tree status | `agent.github.githubStatus` | `hoody agent github status --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent github sync` |  | write | Sync (fetch → pull → push) | `agent.github.githubSync` | `hoody agent github sync --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --direction <direction>` |
| `hoody agent hooks ack-trust` |  | write | Acknowledge hook trust | `agent.hooks.ackHookTrust` | `hoody agent hooks ack-trust --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent hooks begin-write` |  | write | Begin a hook write (nonce) | `agent.hooks.beginHookWrite` | `hoody agent hooks begin-write --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --op <op> --scope workspace` |
| `hoody agent hooks delete` |  | write | Delete a hook | `agent.hooks.deleteHook` | `hoody agent hooks delete --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace` |
| `hoody agent hooks disable-all` |  | write | Disable all hooks | `agent.hooks.disableAllHooks` | `hoody agent hooks disable-all --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace` |
| `hoody agent hooks list` |  | read | List hooks | `agent.hooks.listHooks` | `hoody agent hooks list --session-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent hooks reload` |  | write | Reload hooks from disk | `agent.hooks.reloadHooks` | `hoody agent hooks reload --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent hooks test` |  | write | Test-fire a hook | `agent.hooks.testHook` | `hoody agent hooks test --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent hooks toggle` |  | write | Toggle a hook | `agent.hooks.toggleHook` | `hoody agent hooks toggle --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace` |
| `hoody agent hooks upsert` |  | write | Upsert a hook | `agent.hooks.upsertHook` | `hoody agent hooks upsert --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope workspace --event <event> --matcher <matcher> --command "ls -la" --timeout 10 --name my-resource --description "My description"` |
| `hoody agent jobs delete` |  | write | Cancel a pending/running job, or delete a finished record | `agent.jobs.deleteJob` | `hoody agent jobs delete --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent jobs get` |  | read | Get an async job's status | `agent.jobs.getJob` | `hoody agent jobs get --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent jobs get-result` |  | read | Get an async job's result | `agent.jobs.getJobResult` | `hoody agent jobs get-result --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs logs-sources` |  | read | Log sources | `agent.logs.logsSources` | `hoody agent logs logs-sources --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs logs-stats` |  | read | Log statistics | `agent.logs.logsStats` | `hoody agent logs logs-stats --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs query-logs` |  | read | Query logs | `agent.logs.queryLogs` | `hoody agent logs query-logs --source nix --level <level> --host example.com --since 2026-01-01T00:00:00Z --until 2026-01-01T00:00:00Z --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent logs read-log-entry` |  | read | Read a log entry | `agent.logs.readLogEntry` | `hoody agent logs read-log-entry --ref abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent loops create` |  | write | Create a loop | `agent.loops.createLoop` | `hoody agent loops create --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --prompt <prompt> --interval <interval> --max-runs 10 --stop-when <stop_when> --max-cost-usd 10 --max-wall-ms 100` |
| `hoody agent loops delete` |  | write | Delete a loop | `agent.loops.deleteLoop` | `hoody agent loops delete --id abc-123 --loop-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent loops list` |  | read | List a session's loops | `agent.loops.listLoopsIterator` | `hoody agent loops list --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent loops run-now` |  | write | Run a loop immediately | `agent.loops.runLoopNow` | `hoody agent loops run-now --id abc-123 --loop-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent loops update` |  | write | Update a loop | `agent.loops.updateLoop` | `hoody agent loops update --id abc-123 --loop-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --paused --expires-in <expires_in> --max-cost-usd 10 --max-wall-ms 100` |
| `hoody agent mcp begin-write` |  | write | Mint the single-use nonce every MCP write requires | `agent.mcp.beginMCPWrite` | `hoody agent mcp begin-write --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --op upsert --scope user` |
| `hoody agent mcp delete` |  | write | Delete an MCP server (needs a begin-write nonce + expect-hash) | `agent.mcp.deleteMCPServer` | `hoody agent mcp delete --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope user --name my-resource --expect-hash <expect_hash>` |
| `hoody agent mcp import` |  | write | Import MCP servers from a Claude/Cursor/VS Code config (needs a begin-write nonce + expect-hash) | `agent.mcp.importMCPServers` | `hoody agent mcp import --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope user --document <document> --servers <servers> --replace --expect-hash <expect_hash>` |
| `hoody agent mcp list` |  | read | List configured MCP servers with live connection state | `agent.mcp.listMCPServers` | `hoody agent mcp list --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent mcp parse` |  | read | Preview what a config document would import (writes nothing) | `agent.mcp.parseMCPImport` | `hoody agent mcp parse --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --document <document>` |
| `hoody agent mcp probe` |  | write | Try a candidate MCP server config without saving it (human-only) | `agent.mcp.probeMCPServer` | `hoody agent mcp probe --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --server srv-abc` |
| `hoody agent mcp reconnect` |  | write | Reload MCP config from disk and reconnect live sessions | `agent.mcp.reconnectMCP` | `hoody agent mcp reconnect --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123` |
| `hoody agent mcp set-enabled` |  | write | Enable or disable an MCP server (needs a begin-write nonce + expect-hash) | `agent.mcp.setMCPServerEnabled` | `hoody agent mcp set-enabled --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope user --name my-resource --enabled --expect-hash <expect_hash>` |
| `hoody agent mcp upsert` |  | write | Create or update an MCP server (needs a begin-write nonce + expect-hash) | `agent.mcp.upsertMCPServer` | `hoody agent mcp upsert --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --session-id abc-123 --nonce <nonce> --scope user --expect-hash <expect_hash> --server srv-abc` |
| `hoody agent memory consolidate` |  | write | Trigger a memory consolidation pass (human-only) | `agent.memory.consolidateMemory` | `hoody agent memory consolidate --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --min-observations 10` |
| `hoody agent memory delete-item` |  | write | Delete a memory item | `agent.memory.deleteMemoryItem` | `hoody agent memory delete-item --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --id abc-123 --project proj-abc --kind create` |
| `hoody agent memory edit-item` |  | write | Edit a memory item | `agent.memory.editMemoryItem` | `hoody agent memory edit-item --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --kind create --content "Hello"` |
| `hoody agent memory flush` |  | write | Flush the memory store | `agent.memory.flushMemory` | `hoody agent memory flush --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent memory get-graph` |  | read | Read a project's memory relation graph | `agent.memory.getMemoryGraph` | `hoody agent memory get-graph --project proj-abc --node-type <node_type> --limit 10 --offset 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory get-item` |  | read | Read a memory item | `agent.memory.getMemoryItem` | `hoody agent memory get-item --id abc-123 --project proj-abc --kind create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory list-items` |  | read | List memory items | `agent.memory.listMemoryItemsIterator` | `hoody agent memory list-items --project proj-abc --kind create --type default --query "my search" --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory list-projects` |  | read | List memory projects | `agent.memory.listMemoryProjectsIterator` | `hoody agent memory list-projects --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent memory save-item` |  | write | Save a memory item | `agent.memory.saveMemoryItem` | `hoody agent memory save-item --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --content "Hello" --type default` |
| `hoody agent memory search` |  | write | Search memory (hybrid recall) | `agent.memory.searchMemory` | `hoody agent memory search --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --project proj-abc --query "my search" --limit 10 --kinds create --skip-graph` |
| `hoody agent memory set-enabled` |  | write | Toggle memory capture | `agent.memory.setMemoryEnabled` | `hoody agent memory set-enabled --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --enabled` |
| `hoody agent models add-provider-account` |  | write | Add an OAuth account to a provider's pool | `agent.models.addProviderAccount` | `hoody agent models add-provider-account --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent models delete-provider-api-key` |  | write | Delete a provider API key | `agent.models.deleteProviderAPIKey` | `hoody agent models delete-provider-api-key --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models get` |  | read | Get a model by spec | `agent.models.getModel` | `hoody agent models get --spec abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models get-provider` |  | read | Get a provider | `agent.models.getProvider` | `hoody agent models get-provider --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models get-provider-auth` |  | read | Get a provider's auth status | `agent.models.getProviderAuth` | `hoody agent models get-provider-auth --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models list` |  | read | List models | `agent.models.listModelsIterator` | `hoody agent models list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models list-provider-accounts` |  | read | List a provider's OAuth account pool | `agent.models.listProviderAccountsIterator` | `hoody agent models list-provider-accounts --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models list-providers` |  | read | List LLM providers | `agent.models.listProvidersIterator` | `hoody agent models list-providers --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models logout-provider-o-auth` |  | write | Remove a provider's OAuth login | `agent.models.logoutProviderOAuth` | `hoody agent models logout-provider-o-auth --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models poll-provider-o-auth` |  | read | Poll a provider OAuth login | `agent.models.pollProviderOAuth` | `hoody agent models poll-provider-o-auth --id abc-123 --job abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models remove-provider-account` |  | write | Remove a pooled OAuth account | `agent.models.removeProviderAccount` | `hoody agent models remove-provider-account --id abc-123 --key <key> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent models set-provider-account-active` |  | write | Make a pooled OAuth account active | `agent.models.setProviderAccountActive` | `hoody agent models set-provider-account-active --id abc-123 --key <key> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent models set-provider-api-key` |  | write | Store a provider API key | `agent.models.setProviderAPIKey` | `hoody agent models set-provider-api-key --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --api-key <api_key>` |
| `hoody agent models set-provider-default` |  | write | Set a provider's default credential method | `agent.models.setProviderDefault` | `hoody agent models set-provider-default --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --default <default>` |
| `hoody agent models start-provider-o-auth` |  | write | Start a provider OAuth login | `agent.models.startProviderOAuth` | `hoody agent models start-provider-o-auth --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --add-account` |
| `hoody agent models submit-provider-o-auth-code` |  | write | Submit a provider OAuth authorization code | `agent.models.submitProviderOAuthCode` | `hoody agent models submit-provider-o-auth-code --id abc-123 --job abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --code <code>` |
| `hoody agent open` |  | action | Open the Agent kit service in your browser |  | `hoody agent open [index] [--url]` |
| `hoody agent sessions answer-assist` |  | write | Propose answers for a parked question (helper model) | `agent.sessions.answerAssist` | `hoody agent sessions answer-assist --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --mode stable --model openai/gpt-5.4-nano --gen 10` |
| `hoody agent sessions answer-question` |  | write | Answer a parked question gate | `agent.sessions.answerQuestion` | `hoody agent sessions answer-question --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --gate-id abc-123 --generation 10 --answer <answer> --text "Hello" --answers <answers>` |
| `hoody agent sessions cancel` |  | write | Cancel the active turn (Esc) | `agent.sessions.cancelSession` | `hoody agent sessions cancel --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions close` |  | write | Close the session (teardown) | `agent.sessions.closeSession` | `hoody agent sessions close --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions confirm-gate` |  | write | Answer a parked confirm gate | `agent.sessions.confirmGate` | `hoody agent sessions confirm-gate --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --gate-id abc-123 --generation 10 --approved --persist-dirs` |
| `hoody agent sessions create` |  | write | Create, fork, or attach a session | `agent.sessions.createSession` | `hoody --container ctr-abc agent sessions create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --cwd <cwd> --config-dir <config_dir> --model openai/gpt-5.4-nano --agent my-agent --tool-mode <tool_mode> --dir-scope <dir_scope> --attach <attach> --fork <fork> --fork-turn-idx 10 --backend <backend> --delegated-agent <delegated_agent> --headless` |
| `hoody agent sessions delete` |  | write | Close (and optionally hard-delete) a session | `agent.sessions.deleteSession` | `hoody agent sessions delete --id abc-123 --hard --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions get` |  | read | Get a session summary | `agent.sessions.getSession` | `hoody agent sessions get --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions list` |  | read | List sessions | `agent.sessions.listSessionsIterator` | `hoody agent sessions list --include-system --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions list-cwds` |  | read | List distinct session working directories | `agent.sessions.listSessionCwds` | `hoody agent sessions list-cwds --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions post-workflow-message` |  | write | Send a message to a running workflow | `agent.sessions.postWorkflowMessage` | `hoody agent sessions post-workflow-message --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello"` |
| `hoody agent sessions prompt-sync` |  | write | Dispatch a turn and block to completion | `agent.sessions.promptSync` | `hoody agent sessions prompt-sync --id abc-123 --policy <policy> --x-hoody-gate-policy <x_hoody_gate_policy> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello" --tool-mode <tool_mode> --dir-scope <dir_scope>` |
| `hoody agent sessions replay` |  | read | Replay a live session's buffered events | `agent.sessions.replaySession` | `hoody agent sessions replay --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent sessions set-auto-reply` |  | write | Arm/disarm the auto-reply loop | `agent.sessions.setSessionAutoReply` | `hoody agent sessions set-auto-reply --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --armed --rounds 10 --model openai/gpt-5.4-nano --allow-writes` |
| `hoody agent sessions set-auto-reply-writes` |  | write | Flip the auto-reply write opt-in | `agent.sessions.setSessionAutoReplyWrites` | `hoody agent sessions set-auto-reply-writes --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --allow-writes` |
| `hoody agent sessions set-chat-agent` |  | write | Switch the chat agent | `agent.sessions.setSessionAgent` | `hoody agent sessions set-chat-agent --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --agent my-agent` |
| `hoody agent sessions set-effort` |  | write | Set reasoning effort | `agent.sessions.setSessionEffort` | `hoody agent sessions set-effort --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --effort <effort>` |
| `hoody agent sessions set-hoody-env` |  | write | Toggle Hoody shell-env injection | `agent.sessions.setSessionHoodyEnv` | `hoody agent sessions set-hoody-env --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --enabled` |
| `hoody agent sessions set-model` |  | write | Switch the session model | `agent.sessions.setSessionModel` | `hoody agent sessions set-model --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --model openai/gpt-5.4-nano` |
| `hoody agent sessions set-verbosity` |  | write | Set response verbosity | `agent.sessions.setSessionVerbosity` | `hoody agent sessions set-verbosity --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --level <level>` |
| `hoody agent sessions trim` |  | write | Trim session history to a turn index | `agent.sessions.trimSession` | `hoody agent sessions trim --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --turn-idx 10` |
| `hoody agent settings delete-fusion` |  | write | Delete a fusion composite | `agent.settings.deleteFusion` | `hoody agent settings delete-fusion --slug abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings get` |  | read | Get settings | `agent.settings.getSettings` | `hoody agent settings get --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings get-acp-status` |  | read | Get BYOA ACP backend status | `agent.settings.getACPStatus` | `hoody agent settings get-acp-status --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings list-fusion` |  | read | List fusion composites | `agent.settings.listFusionIterator` | `hoody agent settings list-fusion --include-invalid --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent settings patch` |  | write | Patch settings | `agent.settings.patchSettings` | `hoody agent settings patch --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --patch <patch>` |
| `hoody agent settings set-acp-secret` |  | write | Store an ACP per-agent secret value | `agent.settings.setACPSecret` | `hoody agent settings set-acp-secret --agent my-agent --key <key> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --value "hello"` |
| `hoody agent settings upsert-fusion` |  | write | Create or update a fusion composite | `agent.settings.upsertFusion` | `hoody agent settings upsert-fusion --slug abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --spec <spec>` |
| `hoody agent skills apply-import` |  | write | Apply a skill import | `agent.skills.applySkillImport` | `hoody agent skills apply-import --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent skills clear-hub-cache` |  | write | Clear the skill hub cache | `agent.skills.clearSkillHubCache` | `hoody agent skills clear-hub-cache --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills create` |  | write | Create a skill | `agent.skills.createSkill` | `hoody agent skills create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --name my-resource --description "My description" --content "Hello"` |
| `hoody agent skills delete` |  | write | Delete a skill | `agent.skills.deleteSkill` | `hoody agent skills delete --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir>` |
| `hoody agent skills get-hub-cache` |  | read | Skill hub cache stats | `agent.skills.getSkillHubCache` | `hoody agent skills get-hub-cache --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills get-source` |  | read | Read a skill's source | `agent.skills.getSkillSource` | `hoody agent skills get-source --root-dir <root_dir> --rel-dir <rel_dir> --root <root> --rel <rel> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills install-hub` |  | write | Install a hub skill | `agent.skills.installSkillHub` | `hoody agent skills install-hub --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --id abc-123` |
| `hoody agent skills list` |  | read | List skills | `agent.skills.listSkillsIterator` | `hoody agent skills list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills preview-hub` |  | read | Preview a hub skill | `agent.skills.previewSkillHub` | `hoody agent skills preview-hub --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills put-source` |  | write | Write a skill's source | `agent.skills.putSkillSource` | `hoody agent skills put-source --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir> --content "Hello" --base-gen 10` |
| `hoody agent skills rename` |  | write | Rename a skill | `agent.skills.renameSkill` | `hoody agent skills rename --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir> --new-name <new_name>` |
| `hoody agent skills scan-import` |  | read | Scan for importable skills | `agent.skills.scanSkillImport` | `hoody agent skills scan-import --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills search-hub` |  | read | Search the skill hub | `agent.skills.searchSkillHub` | `hoody agent skills search-hub --q <q> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent skills toggle` |  | write | Enable/disable a skill | `agent.skills.toggleSkill` | `hoody agent skills toggle --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --name my-resource --disabled` |
| `hoody agent skills trust` |  | write | Set a skill's trust state | `agent.skills.trustSkill` | `hoody agent skills trust --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --root-dir <root_dir> --rel-dir <rel_dir> --trusted` |
| `hoody agent statistics get` |  | read | Cross-session statistics | `agent.statistics.getStatistics` | `hoody agent statistics get --scope cwd --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent statistics usage-by-account` |  | read | Usage rollup by account | `agent.statistics.usageByAccount` | `hoody agent statistics usage-by-account --since 1750000000 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent statistics usage-by-model` |  | read | Usage rollup by model | `agent.statistics.usageByModel` | `hoody agent statistics usage-by-model --since 1750000000 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent system docs` |  | read | API documentation UI | `agent.system.docs` | `hoody agent system docs` |
| `hoody agent system health-check` |  | read | Standardized health check | `agent.system.healthCheck` | `hoody agent system health-check` |
| `hoody agent system metrics` |  | read | Prometheus metrics | `agent.system.metrics` | `hoody agent system metrics` |
| `hoody agent system openapi-json` |  | read | OpenAPI spec (JSON) | `agent.system.openapiJSON` | `hoody agent system openapi-json` |
| `hoody agent system openapi-yaml` |  | read | OpenAPI spec (YAML) | `agent.system.openapiYAML` | `hoody agent system openapi-yaml` |
| `hoody agent tasks cancel` |  | write | Cancel a background task | `agent.tasks.cancelTask` | `hoody agent tasks cancel --id abc-123 --tid abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tasks cancel-all` |  | write | Cancel all background tasks | `agent.tasks.cancelAllTasks` | `hoody agent tasks cancel-all --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tasks list` |  | read | Request the session's task snapshot | `agent.tasks.listTasks` | `hoody agent tasks list --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tasks request-transcript` |  | read | Request a task's transcript (upsert-poll) | `agent.tasks.requestTaskTranscript` | `hoody agent tasks request-transcript --id abc-123 --tid abc-123 --after-seq 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent todos approve-proposal` |  | write | Approve a todo proposal | `agent.todos.approveTodoProposal` | `hoody agent todos approve-proposal --id abc-123 --pid 1234 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos archive` |  | write | Archive a todo | `agent.todos.archiveTodo` | `hoody agent todos archive --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --revision 10` |
| `hoody agent todos cancel-run` |  | write | Cancel a todo's run | `agent.todos.cancelTodoRun` | `hoody agent todos cancel-run --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos claim` |  | write | Claim a todo | `agent.todos.claimTodo` | `hoody agent todos claim --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --revision 10` |
| `hoody agent todos create` |  | write | File a todo | `agent.todos.createTodo` | `hoody agent todos create --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --title "My Title" --body '{}' --priority 10 --tags "tag1,tag2" --cwd <cwd>` |
| `hoody agent todos deny-proposal` |  | write | Deny a todo proposal | `agent.todos.denyTodoProposal` | `hoody agent todos deny-proposal --id abc-123 --pid 1234 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos get` |  | read | Read a todo | `agent.todos.getTodo` | `hoody agent todos get --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent todos get-revision` |  | read | Get the todos store revision | `agent.todos.getTodosRevision` | `hoody agent todos get-revision --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent todos list` |  | read | List todos | `agent.todos.listTodosIterator` | `hoody agent todos list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --states <states> --tags "tag1,tag2" --query "my search" --open-only --all` |
| `hoody agent todos message` |  | write | Comment + run an orchestrator turn | `agent.todos.messageTodo` | `hoody agent todos message --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello"` |
| `hoody agent todos post-comment` |  | write | Comment on a todo | `agent.todos.postTodoComment` | `hoody agent todos post-comment --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --text "Hello"` |
| `hoody agent todos purge` |  | write | Purge archived todos | `agent.todos.purgeTodos` | `hoody agent todos purge --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos release` |  | write | Release a todo | `agent.todos.releaseTodo` | `hoody agent todos release --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos run` |  | write | Run a todo's orchestrator | `agent.todos.runTodo` | `hoody agent todos run --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos snooze` |  | write | Snooze a todo | `agent.todos.snoozeTodo` | `hoody agent todos snooze --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --wake-at <wake_at> --revision 10` |
| `hoody agent todos triage` |  | write | Run an LLM triage pass | `agent.todos.triageTodos` | `hoody agent todos triage --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --body '{}'` |
| `hoody agent todos update` |  | write | Update a todo (CAS) | `agent.todos.updateTodo` | `hoody agent todos update --id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --revision 10 --title "My Title" --body '{}' --state active --priority 10 --rank 10 --tags "tag1,tag2" --cwd <cwd>` |
| `hoody agent tools get` |  | read | Get one tool schema | `agent.tools.getTool` | `hoody agent tools get --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list` |  | read | List the tool catalogue | `agent.tools.listToolsIterator` | `hoody agent tools list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list-read-only` |  | read | List the read-only tool subset | `agent.tools.listReadOnlyToolsIterator` | `hoody agent tools list-read-only --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list-session` |  | read | List a session's effective tool set | `agent.tools.listSessionToolsIterator` | `hoody agent tools list-session --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools list-session-mcp` |  | read | List a session's MCP tools | `agent.tools.listSessionMCPToolsIterator` | `hoody agent tools list-session-mcp --id abc-123 --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent tools run` |  | write | Run a tool (sessionless, gated) | `agent.tools.runTool` | `hoody agent tools run --name my-resource --confirm --confirm-token <confirm_token> --x-hoody-tool-mode <x_hoody_tool_mode> --x-hoody-dir-scope <x_hoody_dir_scope> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --params <params> --allow-mutations` |
| `hoody agent tools run-async` |  | write | Run a tool asynchronously (sessionless, gated) | `agent.tools.runToolAsync` | `hoody agent tools run-async --name my-resource --confirm --confirm-token <confirm_token> --x-hoody-tool-mode <x_hoody_tool_mode> --x-hoody-dir-scope <x_hoody_dir_scope> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --params <params> --allow-mutations` |
| `hoody agent tools run-session` |  | write | Run a tool inside a live session (gated) | `agent.tools.runSessionTool` | `hoody agent tools run-session --id abc-123 --name my-resource --confirm --confirm-token <confirm_token> --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --params <params> --allow-mutations` |
| `hoody agent workflows cancel-run` |  | write | Cancel a workflow run | `agent.workflows.cancelWorkflowRun` | `hoody agent workflows cancel-run --run-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows delete` |  | write | Delete a workflow definition | `agent.workflows.deleteWorkflow` | `hoody agent workflows delete --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows get` |  | read | Read one workflow definition | `agent.workflows.getWorkflow` | `hoody agent workflows get --name my-resource --include-revision --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows get-run` |  | read | Get one workflow run by id | `agent.workflows.getWorkflowRun` | `hoody agent workflows get-run --run-id abc-123 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows hide` |  | write | Hide or un-hide a workflow | `agent.workflows.hideWorkflow` | `hoody agent workflows hide --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --hidden` |
| `hoody agent workflows list` |  | read | List workflow definitions | `agent.workflows.listWorkflowsIterator` | `hoody agent workflows list --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows list-runs` |  | read | Snapshot in-flight and recent workflow runs | `agent.workflows.listWorkflowRunsIterator` | `hoody agent workflows list-runs --page 10 --limit 10 --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm>` |
| `hoody agent workflows put` |  | write | Create or replace a workflow definition | `agent.workflows.putWorkflow` | `hoody agent workflows put --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --definition <definition> --expected-revision <expected_revision> --expected-absent` |
| `hoody agent workflows run-session` |  | write | Run a workflow onto an existing session | `agent.workflows.runSessionWorkflow` | `hoody agent workflows run-session --id abc-123 --name my-resource --x-hoody-cwd <x_hoody_cwd> --x-hoody-config-dir <x_hoody_config_dir> --x-hoody-container <x_hoody_container> --x-hoody-realm <x_hoody_realm> --prompt <prompt> --inputs <inputs>` |


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
- Bearer token in `Authorization`. Mint via `hoody auth login` (1d JWT / 7d refresh) or `hoody auth create` (long-lived, scopable).
- 2FA mutations have varying auth: `hoody auth 2fa setup` needs password only; `hoody auth 2fa verify-setup` needs OTP code only; `hoody auth 2fa verify` needs `temp_token` + code; `hoody auth 2fa disable` needs password + OTP **or** backup code; `hoody auth 2fa regenerate` needs password + a **6-digit TOTP only** (`^\\d{6}$` — backup codes are rejected with 400).
- Project/container writes: project owner or matching permission row.
- Billing writes: registered payment method.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Auth bootstrap (signup → verify → login [+2FA])

1. `hoody auth signup`
2. `hoody auth email verify`
3. `hoody auth login`
4. `hoody auth 2fa verify` (if 2FA enabled — uses `temp_token`)
5. `hoody auth profile current`

### 2. Mint a long-lived auth token

1. `hoody auth create`
2. `hoody auth list`
3. `hoody auth realms add`
4. `hoody auth realms remove`
5. `hoody auth copy`
6. `hoody auth delete`

### 3. Set up 2FA

1. `hoody auth 2fa setup`
2. `hoody auth 2fa verify-setup`
3. `hoody auth 2fa status`
4. `hoody auth 2fa regenerate`
5. `hoody auth 2fa gate`

### 4. Create first project + container

Read kit URLs by getting the container with `include_proxy_domains` set to `true` (`hoody containers get`) — the `proxy_domains` array is only populated when `include_proxy_domains` is passed.
1. `hoody realms list`
2. `hoody images mine`
3. `hoody projects create`
4. `hoody containers create`
5. `hoody containers manage`
6. `hoody containers get`

### 5. Grant another user access

Project-scope analogues live under `hoody projects proxy *`.
1. `hoody projects permissions list`
2. `hoody projects permissions create`
3. `hoody projects permissions update`
4. `hoody projects permissions delete`
5. `hoody containers proxy groups password set`
6. `hoody containers proxy groups token set`
7. `hoody containers proxy groups jwt set`
8. `hoody containers proxy state`

### 6. Container exposure & shares

1. `hoody network update`
2. `hoody network start`
3. `hoody firewall egress create`
4. `hoody firewall ingress create`
5. `hoody proxy create`
6. `hoody proxy set-state`
7. `hoody storage create`
8. `hoody storage incoming list` (container-scoped)
9. `hoody storage incoming toggle-mount`
10. `hoody storage delete`

### 7. Container lifecycle ops (snapshot/restore/copy + env + kvm)

1. `hoody snapshots create`
2. `hoody snapshots list`
3. `hoody snapshots restore`
4. `hoody containers copy`
5. `hoody snapshots delete`
6. `hoody containers env list`
7. `hoody containers env set`
8. `hoody containers env bulk-set`
9. `hoody containers env delete`
10. `hoody containers kvm` — enable/disable `/dev/kvm` passthrough (run full VMs inside the container) on a **stopped** container. Also settable at creation via the `kvm` field/flag on `hoody containers create`.

### 8. Billing: wallet → rent

1. `hoody wallet payment-methods create`
2. `hoody wallet payment-methods set-default`
3. `POST /api/v1/wallet/payments/stripe/checkout` (crypto: `POST /api/v1/wallet/payments/crypto/invoice`)
4. `GET /api/v1/wallet/payments/stripe/intents/{id}` (crypto: `GET /api/v1/wallet/payments/crypto/intents/{id}`)
5. `hoody wallet balance get`
6. `hoody wallet transfer`
7. `hoody wallet transactions list`
8. `hoody servers marketplace`
9. `hoody servers rent`
10. `hoody servers list-rentals`
11. `hoody servers extend`
12. `hoody servers exec`

Vault, pools (+ pool members + pool invitations), notifications/events/activity inbox are pure CRUD — see the auto-generated Reference for method signatures, services and the corresponding endpoints / commands.

## Quirks & gotchas

- Login accepts `username` OR `email` + `password` (`anyOf`); only the email lookup is lowercased, usernames are matched case-sensitive.
- JWT lifecycle: `hoody auth logout` is a logout-ALL for JWTs — it bumps `session_generation`, invalidating every access + refresh JWT issued before that moment (all sessions, not just the current one); long-lived auth tokens are unaffected (revoke those with `hoody auth delete`). `hoody auth refresh` requires the refresh token in **both** the request body AND a matching `Authorization: Bearer` header — the generated SDK / CLI auto-refresh only send the body, so the typed call typically 401s; for headless flows mint a long-lived `hoody auth create` instead, or call refresh manually with both the body and the header set to the same refresh token.
- `hoody auth regions` returns `r.data.regions` (single-wrapped, like every other endpoint — older docs incorrectly called it doubly-wrapped).
- Duplicate signup returns `200` (anti-enumeration). For an unverified user, the controller silently overwrites the password and re-sends the verification email; for a verified user it's a no-op. Do NOT probe with this.
- The `agent` kit needs **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — like every other kit it accepts the bare per-container kit URL directly, with no auth headers. The `hoody containers authorize` call mints an *optional* portable container claim for offline verification by your own container programs; no built-in kit requires it. See § Auth model.
- Vault via auth tokens requires `vault_access === true` AND `resources.vault` on the token; else 403. JWT sessions are not gated.
- Rate limits: login 1000/30min failures-only; signup 5/hour fail-closed.
- Auth tokens rejected on admin endpoints (JWT only); `x-impersonate-user` JWT only.
- `hoody containers manage` polymorphic: `POST /api/v1/containers/{id}/{operation}` from `ContainerOperation` enum (not body field).
- No admin concept on user-owned resources; permission row IS the authorization.
- Kit URL `<projectId>-<containerId>-<kit>-1.<server>.containers.hoody.com` IS the credential; watch containerId leakage.
- `hoody containers proxy discovery services list` returns `services: []` often; pass `program: 'exec'` to `hoody proxy create`.
- `hoody wallet invoices list` returns `200 {invoices:[],pagination:{...}}` for never-billed accounts (current). `hoody ip get` returns IP, user-agent, headers, referer, timestamp, auth flag, protocol, and `ip_info` — not just IP.
- `hoody storage incoming list` is container-scoped; pass `containerId`.
- `hoody auth email verify` body has `token` + optional `response_mode` + `code_challenge` only — there is no `email` field. With `response_mode: 'intent'` + PKCE, returns `auth_intent_token`; if 2FA is on, returns `requires_2fa: true` + `temp_token` for `hoody auth 2fa verify`.
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
- Always-200 — `hoody auth password forgot`, `hoody auth email resend`, duplicate-`hoody auth signup`; do NOT probe with these.

## Related namespaces

- `agent` — uses tokens/realms minted here.
- `files` / `terminal` / `exec` / `sqlite` / `daemon` — operate on containers created here.
- `tunnel` — relies on this namespace for proxy aliases and firewall rules.
- `notifications` (kit) — in-container desktop notifications; the account-inbox notifications/events/activity surfaces live here in the control plane.

## Reference

### `hoody activity` (2) — HTTP activity logs and access statistics

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody activity logs` |  | read | Get activity logs | `api.activity.listIterator` | `hoody activity logs --page 1 --limit 50 --start-date <start_date> --end-date <end_date> --min-status 10 --max-status 10 --method GET --realm-id abc-123` |
| `hoody activity stats` |  | read | Get activity stats | `api.activity.getStats` | `hoody activity stats` |

### `hoody ai` (1) — Hoody AI catalog and models

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ai list` |  | read | List available AI models (Hoody catalog) | `api.ai.listModels` | `hoody ai list` |

### `hoody auth` (32) — Authentication, tokens, and 2FA

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody auth 2fa disable` |  | destructive | Disable 2FA | `api.tfa.disable` | `hoody auth 2fa disable --password <password> --code <code>` |
| `hoody auth 2fa gate` |  | write | Set 2FA token gate preference | `api.tfa.setTokenGate` | `hoody auth 2fa gate --enabled --password <password> --otp-code <code>` |
| `hoody auth 2fa regenerate` |  | action | Regenerate Backup Codes | `api.tfa.regenerateBackupCodes` | `hoody auth 2fa regenerate --password <password> --code <code>` |
| `hoody auth 2fa setup` |  | action | Initialize 2FA Setup | `api.tfa.setup` | `hoody auth 2fa setup --password <password>` |
| `hoody auth 2fa status` |  | read | Get 2FA Status | `api.tfa.getStatus` | `hoody auth 2fa status` |
| `hoody auth 2fa verify` |  | action | Verify 2FA Code During Login | `api.tfa.verify` | `hoody auth 2fa verify --temp-token <temp_token> --code <code> --response-mode intent --client <client> --print-token` |
| `hoody auth 2fa verify-setup` |  | action | Complete 2FA Setup | `api.tfa.verifySetup` | `hoody auth 2fa verify-setup --code <code>` |
| `hoody auth copy` |  | write | Copy auth token | `api.authTokens.copy` | `hoody auth copy abc-123 --alias my-resource --expires-at today --otp-code <code>` |
| `hoody auth create` | new, add | write | Create a new auth token | `api.authTokens.create` | `hoody auth create --alias my-resource --public-key pk_abc123 --public-storage '{}' --ip-whitelist <ip_whitelist> --permission-template <permission_template> --permissions-containers-create --permissions-containers-read --permissions-containers-update --permissions-containers-delete --permissions-containers-actions-start --permissions-containers-actions-stop --permissions-containers-actions-restart --permissions-containers-actions-exec --permissions-containers-actions-logs --permissions-containers-features-ai --permissions-containers-features-hoody-kit --permissions-containers-features-snapshots --permissions-containers-features-networking --permissions-containers-features-kvm --permissions-projects-create --permissions-projects-read --permissions-projects-update --permissions-projects-delete --permissions-projects-members-invite --permissions-projects-members-remove --permissions-projects-members-change-roles --permissions-financial-wallet-read --permissions-financial-wallet-transfer --permissions-financial-wallet-withdraw --permissions-financial-billing-read --permissions-financial-billing-manage-payment-methods --permissions-financial-billing-download-invoices --permissions-financial-server-rental-view-marketplace --permissions-financial-server-rental-rent-servers --permissions-financial-server-rental-extend-rentals --permissions-financial-server-rental-terminate-rentals --permissions-resources-vault --permissions-resources-events --permissions-resources-ssh-keys --permissions-resources-storage-shares --permissions-resources-proxy-aliases --permissions-resources-firewalls --permissions-resources-realms --permissions-resources-auth-token-public-profile --permissions-resources-create-tokens --permissions-resources-read-account --permissions-admin-users --permissions-admin-servers --permissions-admin-system --permissions-admin-billing --permissions-admin-monitoring --realm-ids "realm-1" --allow-no-realm --vault-access --event-access --deny-reauthorization --expires-at today --otp-code <code>` |
| `hoody auth delete` | rm, remove | destructive | Delete auth token | `api.authTokens.delete` | `hoody auth delete abc-123` |
| `hoody auth email resend` |  | write | Resend verification email | `api.authentication.resendVerification` | `hoody auth email resend --email user@example.com` |
| `hoody auth email verify` |  | write | Verify email address | `api.authentication.verifyEmail` | `hoody auth email verify --client <client> --token <token> --response-mode intent --code-challenge <code> --print-token` |
| `hoody auth get` | show, describe | read | Get auth token by ID | `api.authTokens.get` | `hoody auth get abc-123` |
| `hoody auth get-current` |  | read | Get current auth token details | `api.authTokens.getCurrent` | `hoody auth get-current` |
| `hoody auth list` | ls | read | List auth tokens | `api.authTokens.listIterator` | `hoody auth list` |
| `hoody auth login` |  | action | Login with username and password | `api.authentication.login` | `hoody auth login --username alice --email user@example.com --password <password> --response-mode intent --client <client> --code-challenge <code> --print-token` |
| `hoody auth logout` |  | action | Logout | `api.authentication.logout` | `hoody auth logout` |
| `hoody auth oauth github callback` |  | read | GitHub OAuth callback | `api.authentication.githubOAuthCallback` | `hoody auth oauth github callback --code <code> --state active --error <error> --error-description <error_description> --error-uri <error_uri>` |
| `hoody auth oauth github redirect` |  | read | Redirect to GitHub OAuth | `api.authentication.githubOAuthRedirect` | `hoody auth oauth github redirect --client <client> --intent login --redirect-uri <redirect_uri> --code-challenge <code> --invite-code <invite_code>` |
| `hoody auth oauth google callback` |  | read | Google OAuth callback | `api.authentication.googleOAuthCallback` | `hoody auth oauth google callback --code <code> --state active --error <error> --error-description <error_description> --error-uri <error_uri>` |
| `hoody auth oauth google redirect` |  | read | Redirect to Google OAuth | `api.authentication.googleOAuthRedirect` | `hoody auth oauth google redirect --client <client> --redirect-uri <redirect_uri> --code-challenge <code> --invite-code <invite_code>` |
| `hoody auth password forgot` |  | write | Request password reset | `api.authentication.forgotPassword` | `hoody auth password forgot --email user@example.com` |
| `hoody auth password reset` |  | write | Reset password | `api.authentication.resetPassword` | `hoody auth password reset --token <token> --password <password>` |
| `hoody auth profile by-public-key` |  | read | Get auth token public profile by public key | `api.authTokens.getPublicProfile` | `hoody auth profile by-public-key pk_abc123` |
| `hoody auth profile current` |  | read | Get current user profile | `api.authentication.getCurrentUser` | `hoody auth profile current` |
| `hoody auth profile update` |  | write | Update current auth token public profile | `api.authTokens.updatePublicProfile` | `hoody auth profile update --public-key pk_abc123 --public-storage '{}'` |
| `hoody auth realms add` |  | write | Add realm to auth token | `api.authTokens.addRealm` | `hoody auth realms add abc-123 --realm-id abc-123 --otp-code <code>` |
| `hoody auth realms remove` |  | destructive | Remove realm from auth token | `api.authTokens.removeRealm` | `hoody auth realms remove abc-123 --realm-id abc-123 --otp-code <code>` |
| `hoody auth refresh` |  | action | Refresh access token | `api.authentication.refreshToken` | `hoody auth refresh --refresh-token <refresh_token> --print-token` |
| `hoody auth regions` |  | read | Get available server regions | `api.authentication.getAvailableRegions` | `hoody auth regions` |
| `hoody auth signup` |  | write | Sign up with email and password | `api.authentication.signup` | `hoody auth signup --email user@example.com --password <password> --region eu-west-1 --invite-code <invite_code> --client <client>` |
| `hoody auth update` | edit | write | Update auth token | `api.authTokens.update` | `hoody auth update abc-123 --alias my-resource --public-key pk_abc123 --public-storage '{}' --ip-whitelist <ip_whitelist> --permissions-containers-create --permissions-containers-read --permissions-containers-update --permissions-containers-delete --permissions-containers-actions-start --permissions-containers-actions-stop --permissions-containers-actions-restart --permissions-containers-actions-exec --permissions-containers-actions-logs --permissions-containers-features-ai --permissions-containers-features-hoody-kit --permissions-containers-features-snapshots --permissions-containers-features-networking --permissions-containers-features-kvm --permissions-projects-create --permissions-projects-read --permissions-projects-update --permissions-projects-delete --permissions-projects-members-invite --permissions-projects-members-remove --permissions-projects-members-change-roles --permissions-financial-wallet-read --permissions-financial-wallet-transfer --permissions-financial-wallet-withdraw --permissions-financial-billing-read --permissions-financial-billing-manage-payment-methods --permissions-financial-billing-download-invoices --permissions-financial-server-rental-view-marketplace --permissions-financial-server-rental-rent-servers --permissions-financial-server-rental-extend-rentals --permissions-financial-server-rental-terminate-rentals --permissions-resources-vault --permissions-resources-events --permissions-resources-ssh-keys --permissions-resources-storage-shares --permissions-resources-proxy-aliases --permissions-resources-firewalls --permissions-resources-realms --permissions-resources-auth-token-public-profile --permissions-resources-create-tokens --permissions-resources-read-account --permissions-admin-users --permissions-admin-servers --permissions-admin-system --permissions-admin-billing --permissions-admin-monitoring --realm-ids "realm-1" --allow-no-realm --vault-access --event-access --expires-at today --is-enabled --otp-code <code>` |

### `hoody containers` (42) — Container lifecycle, stats, and proxy permissions

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody containers authorize` |  | write | Authorize Container Access | `api.containers.authorize` | `hoody containers authorize abc-123` |
| `hoody containers copy` |  | write | Copy a container | `api.containers.copy` | `hoody containers copy abc-123 --target-project-id abc-123 --target-server-id abc-123 --name my-resource --ssh-public-key <ssh_public_key> --source-snapshot <source_snapshot> --copy-firewall-rules --copy-network-rules --kvm --dev-kvm` |
| `hoody containers create` |  | write | Create a new container | `api.containers.create` | `hoody containers create --project abc-123 --server-id abc-123 --name my-resource --color "#ff0000" --container-image <container_image> --ai --environment-vars <key=value> --ssh-public-key <ssh_public_key> --comment "Hello" --hoody-kit --dev-kit --kvm --dev-kvm --autostart --ramdisk --cache --cache-image --prespawn --bypass-prespawn --realm-ids "realm-1"` |
| `hoody containers delete` | rm, remove | destructive | Delete a container | `api.containers.delete` | `hoody containers delete abc-123` |
| `hoody containers env bulk-set` |  | write | Bulk set container environment variables | `api.env.bulkSet` | `hoody containers env bulk-set --body '{}'` |
| `hoody containers env delete` | rm, remove | destructive | Delete a single environment variable | `api.env.delete` | `hoody containers env delete --key <key>` |
| `hoody containers env list` | ls | read | List container environment variables | `api.env.list` | `hoody --container ctr-abc containers env list` |
| `hoody containers env set` |  | write | Set a single environment variable | `api.env.set` | `hoody containers env set --key <key> --value "hello"` |
| `hoody containers get` | show, describe | read | Get a container by ID | `api.containers.get` | `hoody containers get abc-123 --runtime <runtime> --include-proxy-domains true --include-proxy-permissions true` |
| `hoody containers kvm` |  | write | Enable or disable /dev/kvm passthrough (run full VMs inside the container). Rented/dedicated servers only; the container must be stopped. | `api.containers.setContainerKvm` | `hoody containers kvm abc-123 --kvm` |
| `hoody containers list` | ls | read | Get all containers | `api.containers.listIterator` | `hoody containers list --page 1 --limit 50 --sort-by id --sort-order asc --realm-id abc-123 --runtime <runtime>` |
| `hoody containers manage` |  | action | Manage container | `api.containers.manage` | `hoody containers manage abc-123 <operation>` |
| `hoody containers proxy default` |  | write | Update container default proxy permission policy | `api.proxyPermissionsContainer.updateDefault` | `hoody containers proxy default --if-match <if_match> --default allow` |
| `hoody containers proxy discovery groups list` | ls | read | List container proxy groups | `api.proxyDiscovery.listContainerProxyGroups` | `hoody containers proxy discovery groups list abc-123` |
| `hoody containers proxy discovery services get` |  | read | Get merged proxy view for a service | `api.proxyDiscovery.getContainerProxyService` | `hoody containers proxy discovery services get abc-123 <service>` |
| `hoody containers proxy discovery services list` | ls | read | List services referenced in proxy config | `api.proxyDiscovery.listContainerProxyServices` | `hoody containers proxy discovery services list abc-123` |
| `hoody containers proxy groups delete` |  | destructive | Remove container authentication group | `api.proxyPermissionsContainer.removeAuthGroup` | `hoody containers proxy groups delete --group-name <group_name> --if-match <if_match>` |
| `hoody containers proxy groups ip set` |  | write | Set IP authentication group (container) | `api.proxyPermissionsContainer.setIpGroup` | `hoody containers proxy groups ip set --group-name <group_name> --if-match <if_match> --range <range>` |
| `hoody containers proxy groups jwt set` |  | write | Set JWT authentication group (container) | `api.proxyPermissionsContainer.setJwtGroup` | `hoody containers proxy groups jwt set --group-name <group_name> --if-match <if_match> --secret <secret> --algorithm HS256 --sources nix --claims <key=value>` |
| `hoody containers proxy groups password set` |  | write | Set password authentication group (container) | `api.proxyPermissionsContainer.setPasswordGroup` | `hoody containers proxy groups password set --group-name <group_name> --if-match <if_match> --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody containers proxy groups permissions clear` | rm | destructive | Remove all program permissions for a container group | `api.proxyPermissionsContainer.removeGroup` | `hoody containers proxy groups permissions clear --group-name <group_name> --if-match <if_match>` |
| `hoody containers proxy groups permissions delete` |  | destructive | Remove a single program permission for a container group | `api.proxyPermissionsContainer.removeProgram` | `hoody containers proxy groups permissions delete --group-name <group_name> --program <program> --if-match <if_match>` |
| `hoody containers proxy groups permissions set` |  | write | Set container group program permission | `api.proxyPermissionsContainer.setGroup` | `hoody containers proxy groups permissions set --group-name <group_name> --if-match <if_match> --program <program> --access *` |
| `hoody containers proxy groups token set` |  | write | Set token authentication group (container) | `api.proxyPermissionsContainer.setTokenGroup` | `hoody containers proxy groups token set --group-name <group_name> --if-match <if_match> --body '{}'` |
| `hoody containers proxy hooks clear-service` |  | destructive | Clear all hooks for a service | `api.proxyHooks.clearContainerProxyServiceHooks` | `hoody containers proxy hooks clear-service abc-123 <service> --if-match <if_match>` |
| `hoody containers proxy hooks create` | new, add | write | Append or insert a new hook | `api.proxyHooks.addContainerProxyHook` | `hoody containers proxy hooks create abc-123 <service> --if-match <if_match> --match-method <match.method> --match-path <match.path> --match-headers <key=value> --script-subdomain <script.subdomain> --script-exec-id abc-123 --script-path <script.path> --timeout 10 --applies-to-groups <applies_to.groups> --position 10` |
| `hoody containers proxy hooks delete` | rm, remove | destructive | Remove a hook | `api.proxyHooks.removeContainerProxyHook` | `hoody containers proxy hooks delete abc-123 <service> abc-123 --if-match <if_match>` |
| `hoody containers proxy hooks get` |  | read | Get a single hook by id | `api.proxyHooks.getContainerProxyHook` | `hoody containers proxy hooks get abc-123 <service> abc-123` |
| `hoody containers proxy hooks list` | ls | read | List all proxy hooks for a container | `api.proxyHooks.listContainerProxyHooks` | `hoody containers proxy hooks list abc-123` |
| `hoody containers proxy hooks list-service` |  | read | List hooks for a specific service | `api.proxyHooks.listContainerProxyServiceHooks` | `hoody containers proxy hooks list-service abc-123 <service>` |
| `hoody containers proxy hooks move` |  | write | Move a hook to a new position | `api.proxyHooks.moveContainerProxyHook` | `hoody containers proxy hooks move abc-123 <service> abc-123 --if-match <if_match> --position 10` |
| `hoody containers proxy hooks update` | edit | write | Replace a hook in place | `api.proxyHooks.updateContainerProxyHook` | `hoody containers proxy hooks update abc-123 <service> abc-123 --if-match <if_match> --match-method <match.method> --match-path <match.path> --match-headers <key=value> --script-subdomain <script.subdomain> --script-exec-id abc-123 --script-path <script.path> --timeout 10 --applies-to-groups <applies_to.groups> --position 10` |
| `hoody containers proxy permissions delete` | rm | destructive | Delete container proxy permissions | `api.proxyPermissionsContainer.delete` | `hoody containers proxy permissions delete --if-match <if_match>` |
| `hoody containers proxy permissions get` |  | read | Get container proxy permissions | `api.proxyPermissionsContainer.get` | `hoody --container ctr-abc containers proxy permissions get` |
| `hoody containers proxy permissions replace` |  | write | Replace container proxy permissions JSON | `api.proxyPermissionsContainer.replace` | `hoody containers proxy permissions replace --if-match <if_match> --project proj-abc --groups <key=value> --permissions <key=value> --default allow --enable-proxy --hooks <key=value>` |
| `hoody containers proxy settings get` |  | read | Get container proxy root settings | `api.proxyDiscovery.getContainerProxySettings` | `hoody containers proxy settings get abc-123` |
| `hoody containers proxy settings update` | edit | write | Update container proxy root settings | `api.proxyDiscovery.updateContainerProxySettings` | `hoody containers proxy settings update abc-123 --if-match <if_match> --enable-proxy --default allow` |
| `hoody containers proxy state` |  | write | Update container proxy enable state | `api.proxyPermissionsContainer.updateState` | `hoody containers proxy state --if-match <if_match> --enable-proxy` |
| `hoody containers stats` |  | read | Get container resource statistics | `api.containers.getStats` | `hoody containers stats abc-123` |
| `hoody containers status-logs` |  | read | Get status logs for a container | `api.containers.getStatusLogs` | `hoody containers status-logs abc-123 --page 1 --limit 10 --sort-by transition_time --sort-order asc` |
| `hoody containers sync` |  | action | Sync a copied container with its source | `api.containers.sync` | `hoody containers sync abc-123` |
| `hoody containers update` | edit | write | Update a container | `api.containers.update` | `hoody containers update abc-123 --name my-resource --color "#ff0000" --ai --autostart --ramdisk-scope container --ramdisk --environment-vars <key=value> --ssh-public-key <ssh_public_key> --comment "Hello" --realm-ids "realm-1"` |

### `hoody events` (6) — Events and activity logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody events bulk-delete` |  | destructive | Bulk delete events | `api.events.bulkDelete` | `hoody events bulk-delete --event-type container.creating --resource-type container --resource-id abc-123 --before-date <before_date> --realm-id abc-123` |
| `hoody events cleanup` | prune | destructive | Cleanup old events | `api.events.cleanup` | `hoody events cleanup --retention-days 10` |
| `hoody events delete` | rm, remove | destructive | Delete a single event | `api.events.delete` | `hoody events delete abc-123` |
| `hoody events get` | show, describe | read | Get event details by ID | `api.events.get` | `hoody events get abc-123` |
| `hoody events list` | ls | read | List event history | `api.events.listIterator` | `hoody events list --limit 100 --offset 0 --sort-by created_at --sort-order asc --event-type container.creating --resource-type container --resource-id abc-123 --project-id abc-123 --container-id abc-123 --start-date <start_date> --end-date <end_date> --realm-id abc-123` |
| `hoody events stats` |  | read | Get event statistics | `api.events.getStats` | `hoody events stats --start-date <start_date> --end-date <end_date> --realm-id abc-123` |

### `hoody firewall` (8) — Container firewall rules — ingress (inbound) and egress (outbound)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody firewall egress create` |  | write | Add Egress Rule | `api.firewall.addEgressRule` | `hoody firewall egress create --action allow --protocol tcp --description "My description" --destination-port <destination_port> --destination <destination> --source-port <source_port> --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall egress delete` |  | destructive | Remove Egress Rule(s) | `api.firewall.removeEgressRule` | `hoody firewall egress delete --all --action allow --protocol tcp --destination-port <destination_port> --destination <destination> --source-port <source_port> --description "My description" --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall egress toggle` |  | action | Toggle Egress Rule State | `api.firewall.toggleEgressRule` | `hoody firewall egress toggle --state enabled --action allow --protocol tcp --destination-port <destination_port> --source-port <source_port> --destination <destination> --description "My description" --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress create` |  | write | Add Ingress Rule | `api.firewall.addIngressRule` | `hoody firewall ingress create --action allow --protocol tcp --description "My description" --destination-port <destination_port> --source nix --source-port <source_port> --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress delete` |  | destructive | Remove Ingress Rule(s) | `api.firewall.removeIngressRule` | `hoody firewall ingress delete --all --action allow --protocol tcp --destination-port <destination_port> --source nix --source-port <source_port> --description "My description" --state enabled --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall ingress toggle` |  | action | Toggle Ingress Rule State | `api.firewall.toggleIngressRule` | `hoody firewall ingress toggle --state enabled --action allow --protocol tcp --destination-port <destination_port> --source-port <source_port> --source nix --description "My description" --icmp-type <icmp_type> --icmp-code <icmp_code>` |
| `hoody firewall list` | ls | read | List container firewall rules | `api.firewall.listIterator` | `hoody --container ctr-abc firewall list` |
| `hoody firewall reset` |  | destructive | Reset container firewall | `api.firewall.reset` | `hoody --container ctr-abc firewall reset` |

### `hoody images` (7) — Container image marketplace (browse, purchase, rate, import, icons)

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody images get` | show, describe | read | Get public image details | `api.images.getDetails` | `hoody images get abc-123` |
| `hoody images icon` |  | read | Get image icon | `api.images.getIcon` | `hoody images icon abc-123` |
| `hoody images import-free` |  | write | Import free image | `api.images.importFree` | `hoody images import-free abc-123` |
| `hoody images list` |  | read | List public images | `api.images.listPublicIterator` | `hoody images list --os linux --architecture <architecture> --min-price 10 --max-price 10 --min-rating 10 --max-rating 10 --search "my search" --page 1 --limit 20 --sort-by alias --sort-order asc` |
| `hoody images mine` |  | read | List images you own | `api.images.listIterator` | `hoody images mine --page 1 --limit 20 --sort-by created_at --sort-order asc` |
| `hoody images purchase` | buy | write | Purchase image | `api.images.purchase` | `hoody images purchase abc-123` |
| `hoody images rate` |  | write | Rate image | `api.images.rate` | `hoody images rate abc-123 --rating 10` |

### `hoody inbox` (4) — Platform account notification inbox

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody inbox list` |  | read | Get all notifications for the authenticated user | `api.notifications.listIterator` | `hoody inbox list` |
| `hoody inbox list-public` |  | read | Get all public notifications | `api.notifications.listPublicIterator` | `hoody inbox list-public` |
| `hoody inbox mark` |  | write | Mark a notification as read | `api.notifications.markRead` | `hoody inbox mark abc-123` |
| `hoody inbox mark-all` |  | write | Mark all notifications as read | `api.notifications.markAllRead` | `hoody inbox mark-all` |

### `hoody ip` (1) — IP address management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody ip get` |  | read | Get IP Information | `api.utilities.getIpInfo` | `hoody ip get` |

### `hoody meta` (1) — API metadata and signing keys

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody meta get` |  | read | Get Hoody API Signing Public Key | `api.meta.getPublicKey` | `hoody meta get` |

### `hoody network` (5) — Container network configuration

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody network delete` | rm, remove | destructive | Remove container network configuration | `api.containers.removeNetworkConfig` | `hoody --container ctr-abc network delete` |
| `hoody network get` |  | read | Get container network configuration | `api.containers.getNetworkConfig` | `hoody --container ctr-abc network get` |
| `hoody network start` |  | action | Start container network proxy/blocking | `api.containers.startNetwork` | `hoody --container ctr-abc network start` |
| `hoody network stop` |  | action | Stop container network proxy/blocking | `api.containers.stopNetwork` | `hoody --container ctr-abc network stop` |
| `hoody network update` | edit | write | Update container network configuration | `api.containers.updateNetworkConfig` | `hoody --proxy <proxy> network update --type socks5 --country <country> --city <city> --region eu-west-1 --comment "Hello" --dns-servers <dns_servers>` |

### `hoody pools` (11) — Pool management and invitations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody pools create` | new, add | write | Create pool | `api.pools.create` | `hoody pools create --name my-resource --description "My description" --settings <key=value>` |
| `hoody pools delete` | rm, remove | destructive | Delete pool | `api.pools.delete` | `hoody pools delete abc-123` |
| `hoody pools get` | show, describe | read | Get pool details | `api.pools.get` | `hoody pools get abc-123` |
| `hoody pools invitations accept` |  | action | Accept invitation | `api.poolInvitations.accept` | `hoody pools invitations accept abc-123` |
| `hoody pools invitations list` |  | read | List pending invitations | `api.poolInvitations.list` | `hoody pools invitations list` |
| `hoody pools invitations reject` |  | action | Reject invitation | `api.poolInvitations.reject` | `hoody pools invitations reject abc-123` |
| `hoody pools list` |  | read | List user pools | `api.pools.listIterator` | `hoody pools list` |
| `hoody pools members delete` |  | destructive | Remove member | `api.poolMembers.remove` | `hoody pools members delete abc-123 abc-123` |
| `hoody pools members invite` |  | write | Invite member | `api.poolMembers.invite` | `hoody pools members invite abc-123 --username alice --role admin` |
| `hoody pools members update-role` |  | write | Update member role | `api.poolMembers.updateRole` | `hoody pools members update-role abc-123 abc-123 --role admin` |
| `hoody pools update` | edit | write | Update pool | `api.pools.update` | `hoody pools update abc-123 --description "My description"` |

### `hoody projects` (23) — Manage projects

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody projects create` | new, add | write | Create a new project | `api.projects.create` | `hoody projects create --alias my-resource --color "#ff0000" --max-containers 10 --realm-ids "realm-1"` |
| `hoody projects delete` | rm, remove | destructive | Delete project | `api.projects.delete` | `hoody projects delete abc-123 --include-deleted-items` |
| `hoody projects get` | show, describe | read | Get project by ID | `api.projects.get` | `hoody projects get abc-123 --include-permissions` |
| `hoody projects list` | ls | read | List all projects | `api.projects.listIterator` | `hoody projects list --page 1 --limit 10 --sort-by id --sort-order asc --realm-id abc-123` |
| `hoody projects permissions create` |  | write | Grant project access | `api.projects.addPermission` | `hoody projects permissions create --project abc-123 --user-id abc-123 --permission-level read` |
| `hoody projects permissions delete` |  | destructive | Revoke project access | `api.projects.removePermission` | `hoody projects permissions delete --project abc-123 --permission-id abc-123` |
| `hoody projects permissions list` |  | read | List project permissions | `api.projects.listPermissionsIterator` | `hoody projects permissions list --page 10 --limit 10 --sort-by id --sort-order asc --project abc-123` |
| `hoody projects permissions update` |  | write | Update project permission | `api.projects.updatePermission` | `hoody projects permissions update --project abc-123 --permission-id abc-123 --permission-level read` |
| `hoody projects proxy default` |  | write | Update project default proxy permission policy | `api.proxyPermissionsProject.updateDefault` | `hoody projects proxy default --project abc-123 --if-match <if_match> --default allow` |
| `hoody projects proxy groups delete` |  | destructive | Remove project authentication group | `api.proxyPermissionsProject.removeAuthGroup` | `hoody projects proxy groups delete --project abc-123 --group-name <group_name> --if-match <if_match>` |
| `hoody projects proxy groups ip set` |  | write | Set IP authentication group (project) | `api.proxyPermissionsProject.setIpGroup` | `hoody projects proxy groups ip set --project abc-123 --group-name <group_name> --if-match <if_match> --range <range>` |
| `hoody projects proxy groups jwt set` |  | write | Set JWT authentication group (project) | `api.proxyPermissionsProject.setJwtGroup` | `hoody projects proxy groups jwt set --project abc-123 --group-name <group_name> --if-match <if_match> --secret <secret> --algorithm HS256 --sources nix --claims <key=value>` |
| `hoody projects proxy groups password set` |  | write | Set password authentication group (project) | `api.proxyPermissionsProject.setPasswordGroup` | `hoody projects proxy groups password set --project abc-123 --group-name <group_name> --if-match <if_match> --auth-username alice --auth-password <password> --algorithm sha256 --salt <salt>` |
| `hoody projects proxy groups permissions clear` | rm | destructive | Remove all program permissions for a project group | `api.proxyPermissionsProject.removeGroup` | `hoody projects proxy groups permissions clear --project abc-123 --group-name <group_name> --if-match <if_match>` |
| `hoody projects proxy groups permissions delete` |  | destructive | Remove a single program permission for a project group | `api.proxyPermissionsProject.removeProgram` | `hoody projects proxy groups permissions delete --project abc-123 --group-name <group_name> --program <program> --if-match <if_match>` |
| `hoody projects proxy groups permissions set` |  | write | Set project group program permission | `api.proxyPermissionsProject.setGroup` | `hoody projects proxy groups permissions set --project abc-123 --group-name <group_name> --if-match <if_match> --program <program> --access *` |
| `hoody projects proxy groups token set` |  | write | Set token authentication group (project) | `api.proxyPermissionsProject.setTokenGroup` | `hoody projects proxy groups token set --project abc-123 --group-name <group_name> --if-match <if_match> --body '{}'` |
| `hoody projects proxy permissions delete` | rm | destructive | Delete project proxy permissions | `api.proxyPermissionsProject.delete` | `hoody projects proxy permissions delete --project abc-123 --if-match <if_match>` |
| `hoody projects proxy permissions get` |  | read | Get project proxy permissions | `api.proxyPermissionsProject.get` | `hoody projects proxy permissions get --project abc-123` |
| `hoody projects proxy permissions replace` |  | write | Replace project proxy permissions JSON | `api.proxyPermissionsProject.replace` | `hoody projects proxy permissions replace --project abc-123 --if-match <if_match> --groups <key=value> --permissions <key=value> --default allow --enable-proxy` |
| `hoody projects proxy state` |  | write | Update project proxy enable state | `api.proxyPermissionsProject.updateState` | `hoody projects proxy state --project abc-123 --if-match <if_match> --enable-proxy` |
| `hoody projects stats` |  | read | Get statistics for all containers in a project | `api.projects.getStats` | `hoody projects stats abc-123` |
| `hoody projects update` | edit | write | Update project | `api.projects.update` | `hoody projects update abc-123 --alias my-resource --color "#ff0000" --max-containers 10 --realm-ids "realm-1"` |

### `hoody proxy` (16) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy create` | new, add | write | Create a new proxy alias | `api.proxyAliases.create` | `hoody proxy create --container-id abc-123 --alias my-resource --program <program> --port 8080 --index 10 --target-path /home/user/file.txt --allow-path-override --expires-at 2026-12-31T23:59:59Z --enabled` |
| `hoody proxy delete` | rm, remove | destructive | Delete proxy alias | `api.proxyAliases.delete` | `hoody proxy delete abc-123` |
| `hoody proxy get` | show, describe | read | Get proxy alias by ID | `api.proxyAliases.get` | `hoody proxy get abc-123` |
| `hoody proxy list` | ls | read | List proxy aliases | `api.proxyAliases.listIterator` | `hoody proxy list --project-id abc-123 --container-id abc-123 --realm-id abc-123` |
| `hoody proxy logs clear` |  | destructive | Clear all logs |  |  |
| `hoody proxy logs config get` |  | read | Get logging configuration |  |  |
| `hoody proxy logs config resolved` |  | read | Get the effective (resolved) log config for a scope |  |  |
| `hoody proxy logs config update` | edit | write | Update logging configuration |  |  |
| `hoody proxy logs db health` |  | read | Check database health |  |  |
| `hoody proxy logs db repair` |  | write | Repair the logs DB (online integrity check + reindex) |  |  |
| `hoody proxy logs db reset` |  | write | Reset the logs DB (destroys the main logs; audit is preserved) |  |  |
| `hoody proxy logs db vacuum` |  | write | VACUUM the logs DB (reclaim disk) |  |  |
| `hoody proxy logs export` |  | read | Export logs as NDJSON |  |  |
| `hoody proxy logs rotate-audit` |  | write | Rotate the audit DB (archives and starts fresh) |  |  |
| `hoody proxy set-state` |  | write | Enable or disable proxy alias | `api.proxyAliases.setState` | `hoody proxy set-state abc-123 --enabled` |
| `hoody proxy update` | edit | write | Update proxy alias | `api.proxyAliases.update` | `hoody proxy update abc-123 --alias my-resource --program <program> --port 8080 --index 10 --target-path /home/user/file.txt --allow-path-override --expires-at 2026-12-31T23:59:59Z --enabled` |

### `hoody realms` (1) — Platform realms

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody realms list` | ls | read | List your realm IDs | `api.realms.list` | `hoody realms list --include-usage` |

### `hoody servers` (7) — Server rental marketplace, rentals, and remote commands

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody servers commands` |  | read | Get available commands | `api.serverCommands.listIterator` | `hoody servers commands abc-123 --category general --risk-level low` |
| `hoody servers exec` |  | action | Execute server command | `api.serverCommands.execute` | `hoody servers exec abc-123 --command-id abc-123 --command-slug <command_slug> --parameters <parameters> --wait --timeout 10 --confirmation-token <confirmation_token>` |
| `hoody servers extend` |  | write | Extend rental | `api.rentals.extend` | `hoody servers extend abc-123 --expected-rental-end <expected_rental_end> --additional-days 10 --max-charge-cents 10` |
| `hoody servers get` | show, describe | read | Get server details (alias for /rentals/:id) | `api.serverRental.get` | `hoody servers get abc-123` |
| `hoody servers list` | ls | read | List user servers (alias for /rentals) | `api.serverRental.listIterator` | `hoody servers list` |
| `hoody servers marketplace` | browse | read | Browse rental marketplace | `api.serverRental.browseIterator` | `hoody servers marketplace --country <country> --region eu-west-1 --max-price-per-day 10 --available-durations <available_durations> --min-cpu-cores 10 --min-cpu-score 10 --cpu-score-type passmark --min-ram-gb 10 --ram-types DDR3 --min-total-storage-gb 10 --disk-types HDD --min-bandwidth-mbps 10 --min-traffic-tb 10 --unlimited-traffic-only --category compute --featured-only` |
| `hoody servers rent` |  | write | Rent server | `api.serverRental.rent` | `hoody servers rent abc-123 --pool-id abc-123 --rental-days 10 --max-charge-cents 10` |

### `hoody snapshots` (5) — Container snapshots

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody snapshots create` |  | write | Create container snapshot | `api.containers.createSnapshot` | `hoody snapshots create --alias my-resource --expiry 10` |
| `hoody snapshots delete` | rm, remove | destructive | Delete container snapshot | `api.containers.deleteSnapshot` | `hoody snapshots delete --name my-resource` |
| `hoody snapshots list` | ls | read | Get container snapshots | `api.containers.listSnapshotsIterator` | `hoody --container ctr-abc snapshots list` |
| `hoody snapshots restore` |  | action | Restore container from snapshot | `api.containers.restoreSnapshot` | `hoody snapshots restore --name my-resource` |
| `hoody snapshots update-alias` |  | write | Update snapshot alias | `api.containers.updateSnapshotAlias` | `hoody snapshots update-alias --name my-resource --alias my-resource` |

### `hoody storage` (9) — Storage shares

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody storage create` | new | write | Create storage share | `api.storageShares.create` | `hoody storage create --source-path /home/user/file.txt --target-container-id abc-123 --target-project-id abc-123 --mode readonly --alias my-resource --label my-label --description "My description" --enabled --expires-at 1750000000` |
| `hoody storage delete` | rm, remove | destructive | Delete storage share | `api.storageShares.delete` | `hoody storage delete abc-123` |
| `hoody storage get` | show, describe | read | Get storage share | `api.storageShares.get` | `hoody storage get --share-id abc-123` |
| `hoody storage incoming list` |  | read | Get incoming shares | `api.storageShares.listIncoming` | `hoody --container ctr-abc storage incoming list` |
| `hoody storage incoming list-all` |  | read | Get all incoming shares | `api.storageShares.listIncomingGlobalIterator` | `hoody storage incoming list-all --realm-id abc-123` |
| `hoody storage incoming toggle-mount` |  | action | Toggle incoming share mount | `api.storageShares.toggleIncomingMount` | `hoody storage incoming toggle-mount --share-id abc-123 --mount` |
| `hoody storage list` | ls | read | List storage shares | `api.storageShares.listIterator` | `hoody storage list --target-type container --label my-label --status active --realm-id abc-123` |
| `hoody storage list-all` |  | read | List storage shares across all realms (privileged scope) | `api.storageShares.listGlobalIterator` | `hoody storage list-all --realm-id abc-123` |
| `hoody storage update` | edit | write | Update storage share | `api.storageShares.update` | `hoody storage update --share-id abc-123 --mode readonly --alias my-resource --label my-label --description "My description" --enabled --expires-at 1750000000` |

### `hoody users` (4) — User management

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody users get` | show, describe | read | Get user by ID | `api.users.get` | `hoody users get abc-123` |
| `hoody users redeem-invite` |  | write | Redeem a free-tier invite code to claim your free server | `api.users.redeemInviteCode` | `hoody users redeem-invite --code <code>` |
| `hoody users retry-setup` |  | write | Retry free-tier account setup | `api.users.retrySetup` | `hoody users retry-setup --region eu-west-1` |
| `hoody users update` | edit | write | Update user profile | `api.users.update` | `hoody users update abc-123 --alias my-resource --public-key pk_abc123 --metadata <key=value> --password <password> --current-password <current_password> --is-admin --is-banned` |

### `hoody vault` (6) — Secure key-value vault

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody vault clear` |  | destructive | Clear entire vault | `api.vault.clear` | `hoody vault clear --realm-id abc-123` |
| `hoody vault delete` |  | destructive | Delete vault key | `api.vault.delete` | `hoody vault delete <key> --realm-id abc-123` |
| `hoody vault get` |  | read | Get vault key | `api.vault.get` | `hoody vault get <key> --realm-id abc-123` |
| `hoody vault list` |  | read | List vault keys | `api.vault.listIterator` | `hoody vault list --realm-id abc-123` |
| `hoody vault set` |  | write | Set vault key | `api.vault.set` | `hoody vault set <key> --realm-id abc-123 --value "hello"` |
| `hoody vault stats` |  | read | Get vault statistics | `api.vault.getStats` | `hoody vault stats --realm-id abc-123` |

### `hoody wallet` (19) — Balances, transactions, payments, and invoices

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody wallet balance ai` |  | read | Get AI balance (limit, usage, remaining) | `api.wallet.getAiBalance` | `hoody wallet balance ai` |
| `hoody wallet balance general` |  | read | Get general balance only | `api.wallet.getGeneralBalance` | `hoody wallet balance general` |
| `hoody wallet balance get` |  | read | Get aggregate balances (general + AI) | `api.wallet.getAggregateBalances` | `hoody wallet balance get` |
| `hoody wallet invoices download` |  | read | Download invoice PDF | `api.wallet.downloadInvoicePdf` | `hoody wallet invoices download abc-123` |
| `hoody wallet invoices generate` |  | action | Generate invoice for transaction | `api.wallet.generateInvoice` | `hoody wallet invoices generate abc-123` |
| `hoody wallet invoices get` |  | read | Get invoice by ID | `api.wallet.getInvoice` | `hoody wallet invoices get abc-123` |
| `hoody wallet invoices list` | ls | read | Get all invoices | `api.wallet.listInvoicesIterator` | `hoody wallet invoices list --page 1 --limit 20 --sort-by created_at --sort-order asc --filter <filter>` |
| `hoody wallet payment-methods create` |  | write | Add a new payment method | `api.wallet.addPaymentMethod` | `hoody wallet payment-methods create --name my-resource --details <details> --is-default` |
| `hoody wallet payment-methods delete` | rm | destructive | Delete a payment method | `api.wallet.deletePaymentMethod` | `hoody wallet payment-methods delete abc-123` |
| `hoody wallet payment-methods get` |  | read | Get payment method by ID | `api.wallet.getPaymentMethod` | `hoody wallet payment-methods get abc-123` |
| `hoody wallet payment-methods list` | ls | read | Get all payment methods | `api.wallet.listPaymentMethodsIterator` | `hoody wallet payment-methods list` |
| `hoody wallet payment-methods set-default` |  | write | Set a payment method as default | `api.wallet.setDefaultPaymentMethod` | `hoody wallet payment-methods set-default abc-123` |
| `hoody wallet payment-methods update` |  | write | Update a payment method | `api.wallet.updatePaymentMethod` | `hoody wallet payment-methods update abc-123 --details <details> --status active --is-default` |
| `hoody wallet payments create` |  | write | Process a payment |  |  |
| `hoody wallet payments status` |  | read | Get payment status |  |  |
| `hoody wallet transactions fees` |  | read | List AI credit fee history (platform fees charged on AI transfers) | `api.wallet.listAiFeeHistoryIterator` | `hoody wallet transactions fees --page 1 --limit 20 --sort-by created_at --sort-order asc` |
| `hoody wallet transactions get` | show | read | Get transaction by ID | `api.wallet.getTransaction` | `hoody wallet transactions get abc-123` |
| `hoody wallet transactions list` | ls | read | List transactions | `api.wallet.listTransactionsIterator` | `hoody wallet transactions list --limit 20 --sort-by id --sort-order asc` |
| `hoody wallet transfer` |  | write | Transfer from general balance to AI credits | `api.wallet.transferToAi` | `hoody wallet transfer --amount <amount> --idempotency-key <idempotency_key> --expected-fee-bps 10` |


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
- External CDP via `hoody browser devtools` (Chromium ships `webSocketDebuggerUrl` ON by default — pass `useRemoteDebuggingPort=false` to disable; Firefox never exposes it).

## When NOT to use

- Plain HTTP, persistence, server scripts, stream UI, shell → `curl`/`sqlite`/`exec`/`display`/`terminal`.

## Prerequisites

- Headful (default `showBrowser=true`) needs X display: `?display=` or `DISPLAY`. Extensions also require `showBrowser=true`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Start + navigate
1. `hoody browser start` — `browser_id` + overrides (proxy, stealth, fingerprintId, viewport, locale, timezoneId, userAgent, geolocation).
2. `hoody browser navigate`/`hoody browser navigate-post` — `tab_id`, `only_if_not_exists=true`.
3. `hoody browser info`.

### 2. Extract content
After browse: `hoody browser html`/`hoody browser text`/`hoody browser screenshot`/`hoody browser pdf` — params in Reference.

### 3. Authenticated scraping
1. `hoody browser start` matching `userAgent`/`viewport`/`locale`.
2. `hoody browser cookies set` — POST array (Playwright `addCookies` shape).
3. `hoody browser navigate` to protected URL.
4. `hoody browser html`/`hoody browser text`.
5. `hoody browser cookies clear`.

### 4. JS eval + logs
1. `hoody browser start` → `hoody browser navigate`.
2. `hoody browser eval` (`?script=`) or `hoody browser eval-post` (raw JS body).
3. `hoody browser console` (`since`,`type`,`clear=true`).
4. `hoody browser network`.

### 5. History
`hoody browser history query` (filters: `since`/`domain`/`browser_id`) and `hoody browser history delete` (`before` + `browser_id` AND).

### 6. Dedicated project browser — suggest it to the user
When the work is a website project or business research, **offer** the user a dedicated recorded browser. This is a suggestion to the user only — set it up when they ask, don't spin it up unprompted.
1. Pick a slot number X (e.g. 2) and start headful on the matching display: `hoody browser start` with a stable `browser_id` (the project slug), `browser_port` (e.g. 30000+X), `display` 500+X, `showBrowser=true` — plus any per-project identity: own egress proxy (`proxyServer`/`proxyUsername`/`proxyPassword`/`proxyBypass`), `stealth`, `userAgent`, `viewport`, `locale`, `geolocation`, extensions.
2. Give the user the direct live-view URL — it's the standard kit URL with the `browser-` slug: `https://{P}-{C}-browser-X.{N}.containers.hoody.com/`. The root page of `browser-X` embeds display 500+X live, so an instance started on display 500+X gets its own stable viewing URL — changing the X in the URL is how you address each browser's live window. `hoody browser devtools` adds a live DevTools inspector as a second link.
3. Everything browsed there — by the user clicking around in the live view or by the agent via the API — lands in persistent per-`browser_id` history (`hoody browser history query`): live debugging and business research accumulate into one durable project trail. The instance itself is reaped after ~1h idle (see Quirks) — history survives; re-run `hoody browser start` with the same options to revive the window.
4. Then offer log capture as a follow-up: console/network buffers hold only the last 500 entries and die with the instance, so a recurring `cron` job (or agent loop) draining `hoody browser console`/`hoody browser network` with `clear=true` into `sqlite`/`files`/agent memory preserves full context for later sessions.

## Quirks & gotchas

- `browser_id` is an opaque, 0-based string. The kit's request handler reads `browser_port || port` from query/body (NOT `browser_id`); the generated SDK sends `browser_id` as a query param; the URL serviceIndex slot (e.g. `-browser-1.`) is a separate proxy routing variable set via `_templateVars`, defaulting to 1. Drive via the SDK and prefer `browser_id`; raw `curl` against the kit must send `browser_port=<num>`.
- Endpoints auto-create unless `start=false` or `--disable-auto-start`.
- `stealth` defaults true; bare `?stealth`=true. Mid-flight change throws `Instance backend mismatch` — `hoody browser stop` first.
- `stealth=true` ignored on Firefox (Patchright is Chromium-only).
- Extensions need `showBrowser=true`; force persistent profile.
- `chromiumVersion`: full / major / channel (`stable|beta|dev|canary`); first new version blocks on download.
- Console/network logs: 500-entry ring buffers — drain or filter `since`.
- **Idle instances are killed after `HOODY_INSTANCE_MAX_AGE` ms (default 3 600 000 = 1 h).** Cleanup runs every `HOODY_CLEANUP_INTERVAL` ms (default 300000 = 5 min) and SIGTERMs anything past max-age. Heartbeat any active instance with a request to refresh `lastAccessed`. Long-running scrape loops or warm cookies WILL silently lose state across hours of idle.
- Instances do NOT survive kit-process restarts: graceful shutdown (SIGTERM/SIGINT) terminates every child.
- History records ALL navs (incl. headful clicks) at `/hoody/storage/hoody-browser/history`, retention 30 d (`HOODY_HISTORY_RETENTION_DAYS`). Disable: `--history-disable` / `HOODY_HISTORY_DISABLE=true`.
- **`hoody browser history delete` with no filters wipes all history** — pair `before` + `browser_id` (or both).
- `browser_id` history filter sanitised as path component.
- `eval` POST accepts BOTH `Content-Type: application/json` with `{"script":"..."}` (what the SDK and CLI send) and `Content-Type: text/plain` with the raw JS body — the kit tries JSON parse first, falls back to storing the body as `__raw`.
- Chromium CDP defaults to `useRemoteDebuggingPort=true`; `hoody browser devtools` only 404s when the instance itself is missing (NOT when CDP is "off"). To disable CDP exposure, pass `useRemoteDebuggingPort=false` at start. CDP listener binds to `0.0.0.0` by default — treat it as a security-relevant default and either keep CDP off in shared environments or front it with the kit URL's capability gate.
- `viewport` and `geolocation` query/body values are **JSON strings**, not free-form `"WxH"` / `"lat,lng"` — the kit `JSON.parse`s and rejects anything else. Examples: `viewport='{"width":1280,"height":800}'`, `geolocation='{"latitude":48.8,"longitude":2.3,"accuracy":50}'`.
- Screenshot `format` enum is `png | jpeg | base64` (NO `json`). Base64 mode returns `{ data: "<b64>" }` only — there is NO `mimeType` or `dataUrl` in the response (the kit's JSON body has `data` only).

## Common errors

- `VALIDATION_ERROR` 400 — bad `browser_id`, malformed `viewport`/`geolocation`, history `limit` not 1–500, `offset`<0.
- `NOT_FOUND` 404 `Instance not found` — `hoody browser stop`, `hoody browser devtools`, `start=false` no instance.
- `HISTORY_DISABLED` 404 `History is disabled` — history endpoints with `--history-disable`.
- `INSTANCE_BACKEND_MISMATCH` 409 (message starts `Instance backend mismatch`) — `stealth` differs from the running instance's backend; `hoody browser stop` then `hoody browser start`.
- `VALIDATION_ERROR` 400 `display is required when showBrowser=true (no DISPLAY detected)` — `showBrowser=true` with no `display` field on `hoody browser start` and no `$DISPLAY` env.
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

Every step in every example was live-tested against a real `browser-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. ⚠ The kit keys instances on **`browser_port`**, not `browser_id` — on instance endpoints `browser_id` is ignored (it only namespaces history), so calls that differ only in `browser_id` all resolve to the same default instance. The examples run sequentially against that single default instance; for genuinely concurrent flows add a unique `browser_port=$((30000+i))` to every call, as Example 2 does (see the Quirks gotcha).

### 1. Spin up a headless instance and navigate to a URL

**Goal:** boot a Chromium instance, point it at a page, confirm it's alive. Headless avoids the X-display dependency (`showBrowser=false`).

**Step 1 — start.** Returns the start-response payload (`engine`, `headless`, `chromiumBuildId`, `browser_host`, `browser_port`). `hoody browser start` is idempotent — calling again with the same `browser_id` returns the existing instance.

```bash
hoody --container "$C" browser start --browser-id 0 \
  --no-show-browser --no-stealth -o json \
  | jq '{browser_id,engine,headless,chromiumBuildId,browser_port}'
```
**Step 2 — navigate.** `hoody browser navigate` opens or reuses a tab and waits for load.

```bash
hoody --container "$C" browser navigate --browser-id 0 \
  --url https://httpbin.org/html
```
### 2. Full-page PNG screenshot

**Goal:** capture the entire scrolled height (not just the viewport). `format=base64` returns `{ data: "<b64>" }`; the default `format=png` returns raw `image/png` bytes.

```bash
hoody --container "$C" browser screenshot --browser-id 0 \
  --full-page --url https://httpbin.org/html --format base64 -o raw \
  | jq -r .data | base64 -d > /tmp/page.png
```
### 3. Get the page HTML and the rendered text

**Goal:** read the post-JS DOM (HTML) and the visible text the user would see (`hoody browser text` calls Playwright `innerText` on `body`).

```bash
hoody --container "$C" browser html --browser-id 0 | head -c 200
hoody --container "$C" browser text --browser-id 0 | head -c 200
```
### 4. Execute JavaScript in the page and capture the return value

**Goal:** run a script in the page context. `hoody browser eval` puts the script in `?script=` (size-bound by URL). `hoody browser eval-post` accepts `{ script }` JSON via the SDK / CLI / `Content-Type: application/json`; raw `Content-Type: text/plain` HTTP also works (body = script source). Either shape returns the result.

```bash
hoody --container "$C" browser eval --browser-id 0 \
  --script 'document.title'
hoody --container "$C" browser eval-post --browser-id 0 \
  --script 'JSON.stringify({title: document.title, links: document.querySelectorAll("a").length})'
```
### 5. Set cookies and read them back

**Goal:** prime the cookie jar, then verify. POST body is the Playwright `addCookies` shape: an array of `{ name, value, url }` (or `{ name, value, domain, path }`). Each cookie REQUIRES either `url` OR `domain+path`.

```bash
# _(no native `hoody browser` shape)_ — the generated CLI registers NO flag for the
# `cookies` JSON body param, so cookie WRITES are HTTP/SDK-only. Reads work:
hoody --container "$C" browser cookies get --browser-id 0 \
  --url https://httpbin.org
```
### 6. Authenticated scrape — set session cookie, browse, extract, clear

**Goal:** scrape a logged-in page without re-doing OAuth. Pre-load the session cookie a real login would have set, hit the protected URL, read text, then DELETE the jar.

```bash
hoody --container "$C" browser start --browser-id examples-auth-9c \
  --no-show-browser --no-stealth
# _(no native `hoody browser` shape for the cookie WRITE)_ — the generated CLI
# registers no flag for the `cookies` JSON body param; use the HTTP or SDK form
# for this step, then continue with the CLI below.
hoody --container "$C" browser navigate --browser-id examples-auth-9c \
  --url https://app.example.com/dashboard
hoody --container "$C" browser text --browser-id examples-auth-9c | head -c 400
hoody --container "$C" browser cookies clear --browser-id examples-auth-9c
```
### 7. `hoody browser navigate-post` with explicit viewport, locale, and User-Agent

**Goal:** mimic a French mobile Safari to test geo/UA-gated content. Browser-context settings (`viewport`, `locale`, `timezoneId`, `userAgent`) are set at `hoody browser start`; `hoody browser navigate-post` carries the navigation body.

`viewport` is a JSON string such as `'{"width":390,"height":844}'`. `geolocation` is a JSON string such as `'{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'`.

```bash
hoody --container "$C" browser start --browser-id examples-mobile-fr \
  --no-show-browser --stealth \
  --viewport '{"width":390,"height":844}' --locale fr-FR --timezone-id Europe/Paris \
  --user-agent 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1' \
  --geolocation '{"latitude":48.8566,"longitude":2.3522,"accuracy":20}'
hoody --container "$C" browser navigate-post --browser-id examples-mobile-fr \
  --url https://httpbin.org/headers
hoody --container "$C" browser text --browser-id examples-mobile-fr | head -c 500
```
### 8. Inspect browsing history (filter by domain, then drop one host)

**Goal:** the kit records every navigation under `/hoody/storage/hoody-browser/history` (30-day retention, 500-entry pagination cap). Query, then selectively delete.

```bash
hoody --container "$C" browser history query \
  --since "$(date -u -d '1 hour ago' +%FT%TZ)" --limit 50 -o json \
  | jq '{total, has_more}'
# NOTE: CLI `history query` does NOT expose --domain (only --since / --browser-id / --limit / --offset registered as Commander options); use SDK or HTTP for domain filter.
# `history delete` is interactive (requiresConfirmation: true); pass --yes or use SDK for non-interactive.
hoody --container "$C" browser history delete \
  --before "$(date -u -d '7 days ago' +%FT%TZ)" \
  --browser-id 0 --yes
```
### 9. Capture instance metadata (engine, viewport, debug URL)

**Goal:** introspect what the kit actually launched — engine (`playwright`/`patchright`), Chromium build, executable path, current display, debug socket. Use `start=false` to query *without* auto-starting (404 if no instance exists).

```bash
hoody --container "$C" browser info --browser-id 0 \
  | jq '{engine, headless, chromiumBuildId, browser_port}'
hoody --container "$C" browser tabs list --browser-id 0
```
For an external CDP attachment, `hoody browser devtools` returns the live `webSocketDebuggerUrl` (CDP is on by default; default `useRemoteDebuggingPort=true`). If you started with `useRemoteDebuggingPort=false`, the call still returns 200 but `webSocketDebuggerUrl` is null. A 404 `Instance not found` means no instance exists at all (e.g. queried with `start=false`).

### 10. Stop and shutdown — the ONLY safe ending

**Goal:** browser instances stay alive across requests within a kit-process lifetime (graceful kit restart SIGTERMs every child — see Quirks & gotchas); if you forget to shut down you'll exhaust the per-container port pool and the next `hoody browser start` will fail with `Failed to start server. Is port 30001 in use?` (live-verified — orphaned chromium on the starting port permanently jams the kit until the container is restarted).

`hoody browser stop` and `hoody browser shutdown` both terminate the child and delete any extension profile dir (the child's SIGTERM handler runs the same cleanup as `/shutdown`); persistent profile dirs only exist when extensions were loaded. One `hoody browser stop` per instance is a complete teardown — calling both is redundant.

```bash
for BID in 0 examples-auth-9c examples-mobile-fr; do
  hoody --container "$C" browser stop --browser-id "$BID" || true
done
hoody --container "$C" browser metrics -o json | jq '.instances'
```
A `404 Instance not found` from `hoody browser stop` means it was already gone — safe to ignore. `hoody browser shutdown` auto-creates a missing instance unless you pass `start=false`; always include `start=false` in teardown calls.

## Reference

### `hoody browser` (26) — Browser automation and control

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody browser console` |  | read | Get console logs (use `--clear` to also clear) | `browser.debugging.getConsoleLogs` | `hoody browser console --browser-id 1 --tab-id 10 --start --type default --since 2026-01-01T00:00:00Z --clear` |
| `hoody browser cookies clear` |  | destructive | Clear all cookies | `browser.cookies.clear` | `hoody browser cookies clear --browser-id 1 --start` |
| `hoody browser cookies get` |  | read | Get cookies | `browser.cookies.get` | `hoody browser cookies get --browser-id 1 --start --url https://example.com` |
| `hoody browser cookies set` |  | write | Set cookies | `browser.cookies.set` | `hoody browser cookies set --browser-id 1 --start` |
| `hoody browser devtools` |  | read | Get DevTools URLs | `browser.introspection.getDevtoolsUrl` | `hoody browser devtools --browser-id 1 --start` |
| `hoody browser eval` |  | action | Execute JavaScript | `browser.interaction.evalGet` | `hoody browser eval --browser-id 1 --start --script <script>` |
| `hoody browser eval-post` |  | action | Execute JavaScript (POST) | `browser.interaction.evalPost` | `hoody browser eval-post --browser-id 1 --start --script <script>` |
| `hoody browser health` |  | read | Health check | `browser.health.check` | `hoody browser health` |
| `hoody browser history delete` | rm, remove | destructive | Delete browsing history | `browser.history.clear` | `hoody browser history delete --before <before> --browser-id 1` |
| `hoody browser history query` |  | read | Query browsing history | `browser.history.list` | `hoody browser history query --since 2026-01-01T00:00:00Z --browser-id 1 --limit 50 --offset 0` |
| `hoody browser html` |  | read | Get page HTML | `browser.page.getHtml` | `hoody browser html --browser-id 1 --tab-id 10 --start` |
| `hoody browser info` | metadata | read | Get instance metadata | `browser.introspection.getMetadata` | `hoody browser info --browser-id 1 --start` |
| `hoody browser metrics` |  | read | Server metrics | `browser.health.getMetrics` | `hoody browser metrics` |
| `hoody browser navigate` |  | action | Navigate to URL | `browser.interaction.browse` | `hoody browser navigate --browser-id 1 --start --url https://example.com --tab-id 10 --active --only-if-not-exists --ignore-get-parameters` |
| `hoody browser navigate-post` |  | action | Navigate to URL (POST) | `browser.interaction.browsePost` | `hoody browser navigate-post --browser-id 1 --start --url https://example.com --tab-id 10 --active --only-if-not-exists --ignore-get-parameters` |
| `hoody browser network` |  | read | Get network logs (use `--clear` to also clear) | `browser.debugging.getNetworkLogs` | `hoody browser network --browser-id 1 --tab-id 10 --start --since 2026-01-01T00:00:00Z --clear` |
| `hoody browser open` |  | action | Open the Browser kit service (browser automation UI) in your browser |  | `hoody browser open [index] [--url]` |
| `hoody browser pdf` |  | read | Export page as PDF | `browser.page.exportPdf` | `hoody browser pdf --browser-id 1 --tab-id 10 --start --url https://example.com --format Letter --landscape --print-background --margin <margin>` |
| `hoody browser restart` |  | action | Restart browser instance | `browser.instances.restart` | `hoody browser restart --browser-id 1 --chromium-version <chromium_version> --fingerprint-id abc-123 --use-remote-debugging-port --remote-debugging-port 10 --remote-debugging-address <remote_debugging_address> --extensions <extensions> --extensions-dir <extensions_dir> --extensions-store-ids <extensions_store_ids> --proxy-server <proxy_server> --proxy-username <proxy_username> --proxy-password <proxy_password> --proxy-bypass <proxy_bypass> --enable-quic --enable-dns-over-https --dns-over-https-url https://cloudflare-dns.com/dns-query --display 10 --show-browser --session-name <session_name> --timezone-id abc-123 --locale <locale> --user-agent "Mozilla/5.0" --viewport <viewport> --geolocation <geolocation> --launch-arguments <launch_arguments> --browser chromium --firefox-version <firefox_version> --firefox-executable-path /home/user/file.txt --show-devtools --stealth --iframe --iframe-url https://example.com --maximize-new-windows` |
| `hoody browser screenshot` | shot | read | Capture browser screenshot | `browser.interaction.takeScreenshot` | `hoody browser screenshot --browser-id 1 --start --url https://example.com --tab-id 10 --only-if-not-exists --ignore-get-parameters --format png --quality 10 --full-page` |
| `hoody browser shutdown` |  | destructive | Shutdown browser instance | `browser.introspection.shutdown` | `hoody browser shutdown --browser-id 1` |
| `hoody browser start` | up | action | Create or retrieve browser instance | `browser.instances.start` | `hoody browser start --browser-id 1 --chromium-version <chromium_version> --fingerprint-id abc-123 --use-remote-debugging-port --remote-debugging-port 10 --remote-debugging-address <remote_debugging_address> --extensions <extensions> --extensions-dir <extensions_dir> --extensions-store-ids <extensions_store_ids> --proxy-server <proxy_server> --proxy-username <proxy_username> --proxy-password <proxy_password> --proxy-bypass <proxy_bypass> --enable-quic --enable-dns-over-https --dns-over-https-url https://cloudflare-dns.com/dns-query --display 10 --show-browser --session-name <session_name> --timezone-id abc-123 --locale <locale> --user-agent "Mozilla/5.0" --viewport <viewport> --geolocation <geolocation> --stealth --iframe --iframe-url https://example.com --maximize-new-windows` |
| `hoody browser stop` | kill, down | action | Stop browser instance | `browser.instances.stop` | `hoody browser stop --browser-id 1` |
| `hoody browser tabs close` |  | write | Close a browser tab | `browser.introspection.closeTab` | `hoody browser tabs close --browser-id 1 --start --tab-id 10` |
| `hoody browser tabs list` |  | read | List browser tabs | `browser.introspection.listTabs` | `hoody browser tabs list --browser-id 1 --start` |
| `hoody browser text` |  | read | Get page text | `browser.page.getText` | `hoody browser text --browser-id 1 --tab-id 10 --start` |


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
- A "Cline-as-a-service" deployment: brand it via `hoody proxy create` and ship a URL like `https://agent.{server_name}.containers.hoody.com` to your team, hiding the `containerId`.

The container's filesystem still backs the extension (it can edit files, run terminals, hit the network, etc.) — same persistent state as the full IDE. Multiple child instances let you run multiple single-extension surfaces side-by-side under one container — same `code-1` URL, different `id` values (e.g. Cline at `?extension=…&folder=…&id=1`, Continue at `…&id=2`).

## When to use

- **Humans editing code**: hand the user the URL — that's the whole product.
- **Single-extension embed for an agent or tool** — `?extension=<publisher>.<name>` boots straight into that extension's UI; iframable, mobile-friendly, distributable as a brand-able alias.
- Pre-open a workspace/folder for them via `?folder=` / `?workspace=` (so the URL is bookmarkable).
- Pre-install extensions (custom internal VSIX) via the kit's launch flags or in-editor — the `hoody code extensions *` HTTP endpoints are spec-only, not implemented (see Quirks).
- Tunnel an in-container port through the editor's path-proxy on the **child instance** subdomain: `/proxy/{port}` (rewrites `req.base`) or `/absproxy/{port}` (verbatim — use this for APIs/WS).

## When NOT to use

Not for: non-interactive shell → `terminal`/`exec`, file I/O without a UI → `files`, long-lived processes → `daemon`, headless web → `browser`. Not a coding-agent control plane → `agent` (the typed in-container AI-agent HTTP namespace, slug `agent`; the Hoody Agent browser GUI on the same `-agent-1` host is the human surface).

## Prerequisites

- Password mode: session cookie via the HTML form login at the **child instance** root (`POST /login`, form-encoded — see Example 7). The generated `hoody code auth *` accessors build `/api/v1/code/login|logout`, which no surface routes.
- VSIX install: the `hoody code extensions *` HTTP endpoints are spec-only (not implemented) — pre-install via the child launch flags or in-editor (see Example 3).

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

## Common workflows

### 1. Open a workspace folder

1. Open `https://{P}-{C}-code-1.{N}.containers.hoody.com/?folder=<abs-path>&id=1` — both `folder` and `id` are required at the public kit URL.
2. `hoody code vs` (`folder`/`workspace`/`locale`) is the child-instance surface behind it; `ew=true` clears the persisted folder.

### 2. Embed a single extension (single-tool browser surface)

Pin one extension as the entire UI of a `code-N` instance — no editor chrome around it.

1. Make sure the extension is installed in the container's VS Code: pre-install via the child launch flags (`--install-extension`, `--preload-builtin-extensions-dir`) or in-editor — the `hoody code extensions install`/`hoody code extensions list` HTTP endpoints are spec-only (see Quirks).
2. Open / iframe `https://{P}-{C}-code-1.{N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<abs-path>&id=1` (`folder` and `id` are required). Examples:
   - `?extension=saoudrizwan.claude-dev` — Cline (autonomous coding agent), works on a phone.
   - `?extension=continue.continue` — Continue chat.
   - `?extension=ms-toolsai.jupyter` — Jupyter notebooks UI only.
   - `?extension=eamodio.gitlens` — GitLens panel.
3. Point `folder` at the repo you want the extension to see (it is required either way).
4. Embed: `<iframe src="…/?extension=…&folder=…" allow="clipboard-read; clipboard-write"></iframe>` — works in any HTML page, mobile browser, Slack URL preview surface, etc.
5. Brand the URL: `hoody proxy create` → `https://agent.{server_name}.containers.hoody.com`. Hides the `containerId`; gate via `proxyPermissionsContainer.*` for production.

To run two distinct single-extension surfaces under the same container, use different `id` values at the same `code-1` URL (`id=1` for Cline, `id=2` for Continue, etc. — each `id` is its own child editor instance).

### 3. Install and verify a VSIX

`hoody code extensions install` / `hoody code extensions list` are spec-only — not implemented by the current kit (see Quirks). Pre-install via the child launch flags or in-editor, then verify on disk (Example 4).

### 4. Tunnel a container port

The **child instance** mounts `/proxy/:port` and `/absproxy/:port` at its root (`{P}-{C}-http-<60000+id>.{N}` subdomain); the public `code-1` root does NOT route them. The generated accessors `hoody code proxy-path` / `hoody code proxy` build URLs against `/api/v1/code/proxy/...` which no surface routes — drive path-proxy with raw URLs (`https://{P}-{C}-http-60001.{N}.containers.hoody.com/proxy/{port}/...`) or the hand-extended embed-URL builder under the `code.vscode` service (see Quirks for `embedUrl`).

### 5. Authenticate password mode

Form-POST the password to the **child instance** root `/login` (see Example 7) — the generated `hoody code auth *` accessors build `/api/v1/code/login|logout`, which no surface routes.

## Quirks & gotchas

- Login limit 2/min, 12/hr per process.
- `/api/v1/code/health` resets idle heartbeat; only `/healthz` excluded.
- 3 mount prefixes; use `/api/v1/code`.
- `hoody code vs` persists `folder`/`workspace` as the last-opened workspace in the instance's user-data dir; `ew=true` wipes.
- `hoody code auth mint-key` idempotent.
- `hoody code extensions install` / `hoody code extensions list` are declared in the kit OpenAPI (and surfaced by the generated SDK/CLI) but the current kit does NOT implement them — no extensions router is mounted anywhere; requests fall through (child: vscode catch-all SPA/302; `code-1`: orchestrator plain-text 404). Pre-install via the child launch flags (`--install-extension`, `--install-builtin-extension`, `--preload-builtin-extensions-dir`) or in-editor.
- `/proxy/:port` and `/absproxy/:port` are mounted at the **child instance root** (`{P}-{C}-http-<60000+id>.{N}` subdomain), NOT under `/api/v1/code` and NOT at the public `code-1` root — the orchestrator has no proxy routes. Use `https://{P}-{C}-http-60001.{N}.containers.hoody.com/proxy/{port}/...` (or `/absproxy/{port}/...`).
- `/proxy/:port/...` rewrites `req.base` so the upstream sees `/<rest>`; `/absproxy/:port/...` keeps the full `/absproxy/:port/...` prefix verbatim — use `absproxy` for APIs/WS where the upstream cares about its own base path.
- `hoody code check-update` (the generated accessor — the `update.*` service does not exist) queries GitHub releases. NOTE: the generated path is `/api/v1/code/update/check`, but `/update` is mounted on the **child instance** root only — the generated call and the public `code-1` root both miss it (orchestrator has no `/update` route). Call `https://{P}-{C}-http-<60000+id>.{N}…/update/check` directly. The route returns `{ checked, latest, current, isLatest }`, but the generated TS type `CodeHealthCheckUpdateResponse` (from the OpenAPI spec) mis-declares `{ current, latest, updateAvailable }` and drops `checked` — read `.isLatest`/`.checked` from the raw JSON, not `.updateAvailable`. `?force=true` bypasses the 24 h cache (kit-level only — not exposed via the generated SDK or CLI surfaces; reachable only by raw HTTP to `/update/check?force=true`).
- `hoody code health` at the public `code-1` URL hits the ORCHESTRATOR, which returns the standardized 9-field `{ status: "ok", service, built, started, memory, fds, pid, ip, userAgent }` envelope — matching the generated TS type. The flat `{ status: "alive" | "expired", lastHeartbeat }` shape only appears on the child instance's health route (`{P}-{C}-http-<60000+id>.{N}` subdomain).
- `kit_slug` always `code`.
- `embedUrl` is a hand-extended SDK builder hung off the `code.vscode` service; an equivalent embed builder also exists on the CLI surface. Composes the iframe URL without firing a request.

## Common errors

- `hoody code extensions install` / `hoody code extensions list`: not implemented — at `code-1` the orchestrator returns a plain-text 404; on the child the request falls through to the vscode catch-all (SPA / 302 / 401). The `MISSING_URL`/`INVALID_URL_FORMAT`/`DOWNLOAD_FAILED`/`INSTALLATION_FAILED` codes exist only in the OpenAPI spec, never at runtime.
- Path-proxy 400 `Invalid port`. The cited line only checks `isNaN(port)`; the 1024–65535 range is enforced by the OpenAPI client validator before the request lands.
- `/proxy/{port}/` unauth root returns 302 `/login`; deeper 401.
- `hoody code auth submit` rate-limit returns HTML, not JSON.
- Unauth `hoody code vs` returns 302 `/login`, not 401.
- On the **child instance** (`-http-<port>` subdomain) unmatched `/api/v1/code/*` paths fall through to the editor's catch-all route, which serves the SPA shell / 401 / 302 depending on auth — NOT a JSON 404. At the public `code-1` URL they return the orchestrator's plain-text 404 instead. Test against an explicit known-good path (e.g. `/api/v1/code/health`) for kit liveness.

## Related namespaces

→ `terminal`, `files`, `exec`, `browser`, `daemon`.

## Examples

`code` is a **URL-first** namespace — for most workflows the kit URL itself (with the right query string and / or iframe wrapper) IS the deliverable. The methods here exist to *configure* the editor (install an extension, mint a key, log in), not to drive it. Each example below is a copy-pasteable recipe in the mode you're reading. URL-composition steps are pure string templates and need no kit call. HTTP / SDK steps were verified against the kit source (orchestrator + child-instance routes). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

### 1. Open the editor with a folder pre-loaded — bookmarkable URL

**Goal:** ship a teammate a single URL that opens VS Code already pointing at the right repo. `?folder=<absolute-path>` is persisted as the last-opened workspace in the instance's user-data dir, so even subsequent un-querystringed visits land back on it (until you pass `?ew=true` to clear).

```bash
# `hoody code open` puts the index in the HOSTNAME (code-1) and never emits `?id=`,
# which the orchestrator requires alongside `folder` — compose the URL yourself:
echo "https://${P}-${C}-code-1.${N}.containers.hoody.com/?folder=/workspace/myrepo&id=1"
# `--url` prints the URL instead of launching $BROWSER.
```
To clear the persisted folder later (so the next visit opens the welcome page), append `?ew=true` (`hoody code vs` with `ew=true` wipes the persisted workspace).

### 2. Extension-only embed — boot straight into one extension's UI

**Goal:** open `code-1` as a single extension's panel — no file tree, no command palette, no marketplace. The whole viewport is that extension. Pair with a folder so the extension opens with the right repo selected.

URL pattern (no kit call):

```
https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=<publisher>.<name>&folder=<absolute-path>&id=1
```

```bash
# `hoody code embed` rewrites the path to /api/v1/code (a CHILD-instance path that is
# unrouted at the code-1 host) and sets no `id` — compose the extension URL yourself:
echo "https://${P}-${C}-code-1.${N}.containers.hoody.com/?extension=saoudrizwan.claude-dev&folder=/workspace/myrepo&id=1"
# emits the extension-only URL.
```
The `extension` query value MUST match `^[a-zA-Z0-9-]+\.[a-zA-Z0-9-]+$` — `publisher.name` only, no version.

### 3. Install a custom VSIX programmatically

**Goal:** push an internal extension (`.vsix`) into the container's VS Code. ⚠ **`hoody code extensions install` is spec-only** — the current kit mounts no extensions router, so the documented `POST /api/v1/code/extensions/install` never reaches a handler (`code-1`: orchestrator plain-text 404; child: vscode catch-all SPA/302). What actually works:

- **At child boot (launch flags):** `--install-extension <id-or-vsix-path>`, `--install-builtin-extension <vsix-path>`, or drop VSIXes in the preload dir consumed by `--preload-builtin-extensions-dir` (the platform passes `/hoody/storage/hoody-code/extensions` by default).
- **In-editor:** Extensions view → `…` menu → "Install from VSIX…" (the VSIX must already be on the container filesystem — push it via the `files` namespace).

### 4. List installed extensions + verify a specific one is present

**Goal:** sanity-check after a deploy that the extensions you expected are actually loaded. ⚠ **`hoody code extensions list` is spec-only** (same as `hoody code extensions install` — no extensions router is mounted). Verify on disk instead: each child instance keeps its extensions at `/hoody/storage/hoody-code/data/<id>/extensions`, with directory names like `<publisher>.<name>-<version>`. Run the check inside the container via the `terminal` / `exec` namespaces:

```bash
ls /hoody/storage/hoody-code/data/1/extensions
# → ms-python.python-2024.0.0  saoudrizwan.claude-dev-3.7.0  …
ls /hoody/storage/hoody-code/data/1/extensions | grep -q '^saoudrizwan\.claude-dev-' \
  || echo "MISSING: saoudrizwan.claude-dev"
```

(Generated `hoody code extensions list` accessors on any surface target the unimplemented endpoint and return no data.)

### 5. Path-proxy a container port through the editor — `/proxy/{port}` for browser previews

**Goal:** surface a dev server (Vite, Next.js, `python -m http.server`) running inside the container at `localhost:3000` to your laptop's browser. `/proxy/{port}` rewrites `req.base` so relative URLs in the upstream HTML still resolve under the proxy prefix — use this for **browser-rendered apps with relative asset paths**.

```
https://${P}-${C}-http-60001.${N}.containers.hoody.com/proxy/3000/
```

(`http-<60000+id>` is the **child instance** subdomain — `60001` for `id=1`. The public `code-1` root does NOT route `/proxy`.)

```bash
# Hidden CLI commands `hoody code proxy-path` / `hoody code proxy` exist but are
# .hideHelp()-gated; the recommended flow is to compose the URL and open it directly:
echo "https://${P}-${C}-http-60001.${N}.containers.hoody.com/proxy/3000/"
```
Port range is `1024–65535`; the kit only enforces `isNaN(port)` at `pathProxy.ts:18` (returns `400 Invalid port`); the 1024–65535 range is enforced by the SDK client validator (`proxy.service.generated.ts:157`) but NOT by the server — raw HTTP callers (curl/fetch) must self-enforce the range.

### 6. Absproxy a container port — `/absproxy/{port}` for raw API / WebSocket passthrough

**Goal:** call a JSON API or open a WebSocket running inside the container with the **path preserved verbatim**. Use this — not `/proxy/` — for any case where the upstream cares about the literal request path (REST APIs, gRPC-Web, WebSockets at fixed routes). The `/proxy` variant rewrites `req.base` and will break path-sensitive servers.

```
https://${P}-${C}-http-60001.${N}.containers.hoody.com/absproxy/8080/v1/items?q=cake
                                                                              ^^^^^^^^^^^^^^^^^ ← upstream sees exactly this path
```

```bash
echo "https://${P}-${C}-http-60001.${N}.containers.hoody.com/absproxy/8080/v1/items?q=cake"
```
`/proxy` and `/absproxy` share the same auth gate: unauth root returns `302 /login`, deeper paths `401`.

### 7. Authenticate password mode — `hoody code auth login` + `hoody code auth submit`

**Goal:** when the kit is launched with `--password <plaintext>` / `--hashed-password <argon2>`, every route is gated. The login flow is HTML-form-based (not a JSON API): fetch `/login` to bootstrap, then `POST /login` form-encoded to get a session cookie.

```bash
# CLI does not expose the raw login form; open `hoody code open 1` in your browser
# and complete the login interactively, then re-use the session cookie from the browser.
```
Rate limit: **2/min, 12/hr per process**. Hitting the limit returns HTML, not JSON — tail the body for the literal string `Login rate limited!` (i18n LOGIN_RATE_LIMIT, English locale value).

### 8. Health check + extension verify — post-deploy smoke test

**Goal:** after a container rebuild, confirm the `code` kit is up AND the extensions you ship pre-installed actually loaded. One-shot smoke.

```bash
hoody --container "$C" code health -o json | jq -r .status   # → ok (orchestrator envelope)
# Extensions: `hoody code extensions list` targets the unimplemented endpoint (see Example 4);
# verify on disk instead via the terminal namespace:
#   ls /hoody/storage/hoody-code/data/1/extensions
```
⚠ On the **child instance**, `/api/v1/code/health` resets the idle-shutdown heartbeat — only `/healthz` (kit-internal, not surfaced through the public path) is excluded; hitting it on a cron keeps the child hot. The orchestrator's `code-1` health endpoint does not touch child heartbeats.

### 9. Logout + verify the session cookie is revoked

**Goal:** end the password-mode session cleanly when a teammate steps away. `hoody code auth logout` clears the cookie server-side; subsequent requests with the old cookie redirect to `/login`.

```bash
# `hoody code auth logout` exists but targets the unrouted `/api/v1/code/logout` (404 at code-1);
# drop to a raw GET on the child root `/logout`, or just clear the cookie jar. The
# alternative is to open the browser session and click Sign Out,
# OR drop the cookie file:  rm -f /tmp/code-cookie.txt
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

To hide the `containerId` behind a brandable host, wrap the URL with a `hoody proxy create` — the iframe `src` becomes `https://agent.{server_name}.containers.hoody.com`, the `containerId` never leaves the server. Gate it via `proxyPermissionsContainer.*` for production (IP allow-list, basic-auth, etc. — see the `api` namespace).

The same iframe pattern works for **every** Hoody kit (`files`, `terminal`, `display`, `desktop`, `browser`, `notes`, `agent`, …) — compose a full HTML "operating system" out of kit iframes with no native code.

## Reference

### `hoody code` (7) — VS Code server

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody code auth mint-key` |  | write | Generate server web key | `code.vscode.mintKey` | `hoody code auth mint-key` |
| `hoody code check-update` |  | read | Check for updates | `code.health.checkUpdate` | `hoody code check-update` |
| `hoody code embed` |  | read | Build an iframeable URL for a VS Code extension (extension-only mode) | `code.vscode.embedUrl` | `hoody code embed rooveterinaryinc.roo-cline` |
| `hoody code extensions install` |  | write | Install VS Code extension from URL | `code.extensions.install` | `hoody code extensions install --url https://example.com --as-builtin` |
| `hoody code extensions list` | ls | read | List installed extensions | `code.extensions.listIterator` | `hoody code extensions list` |
| `hoody code health` |  | read | Service health check | `code.health.check` | `hoody code health` |
| `hoody code open` |  | action | Open the Code kit service in your browser |  | `hoody code open [index] [--url] [--folder PATH]` |


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

`hoody cron entries create` schedule + command (+ name/comment/expires_at/enabled) → `ManagedEntry` with `id`.

### 2. List

`hoody cron entries list` (`page`/`limit`, max 200); the SDK additionally offers auto-pagination helpers (`hoody cron entries list`, `hoody cron entries list`) over the same endpoint.

### 3. Edit / disable / extend

`hoody cron entries update` PATCH. `clear_expiration: true` overrides `expires_at`. `enabled: false` keeps rule prefixed `# hoody-cron-disabled:`.

### 4. Bulk replace

`hoody cron crontabs get` (sweep) then `hoody cron crontabs replace` body — revalidates `# hoody-cron:` blocks; response has `removed_expired`.

### 5. Audit all users

`hoody cron crontabs list` → paginated `{ items: [{ user, crontab }], total, page, limit }`; the SDK additionally offers auto-pagination helpers (`hoody cron crontabs list`, `hoody cron crontabs list`) over the same endpoint.

## Quirks & gotchas

- `user`: matches `^[A-Za-z0-9_.-]{1,32}$` for the character class, but the validator additionally rejects a **leading** `-` (trailing `-` is allowed).
- Vixie 5-field plus standard `@`-macros; Quartz rejected.
- `command`/`name`/`comment` reject newline/null/VT/FF/NEL/LS/PS; caps 4096/120/500.
- `expires_at` RFC 3339, strictly future.
- Body cap 256 KiB (configurable via `max_crontab_bytes`, default 256 KiB) AND 10,000 lines; duplicate entry id rejected, and a duplicate `id=` within one metadata line is rejected.
- **`hoody cron crontabs replace` is a full overwrite — destroys every managed entry on the target user, not just the raw lines.** Server persists only the parsed payload via `state.backend.set(&user, &cleaned)`; entries not in the request body are gone. If you mix `hoody cron entries create` and `hoody cron crontabs replace` on the same user, every PUT wipes prior managed state. Strategy: pick one (managed-only via the `entries` endpoints, OR raw-only via `hoody cron crontabs replace`); if you must mix, treat the PUT body as the canonical source of truth and re-create managed entries after each PUT.
- Forged `# hoody-cron:` lines in PUT body are revalidated and rejected.
- `hoody cron entries list`/`hoody cron entries get` clean expired entries before serializing under a per-user mutex — a GET can mutate the spool.
- `hoody cron entries list` items have `type: "managed"` or `"raw"`; only `managed` items carry `id`.
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

Every step in every example was live-tested against a real `cron-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

### 1. Set up a nightly DB backup with trial-run dry-fire

**Goal:** schedule `pg_dump` daily at 02:00 in the container's LOCAL timezone (the kit does no TZ conversion; only `expires_at` is UTC-anchored), set the entry to expire end of 2026; first verify it actually fires by running it every minute for one cycle.

**Step 1 — create the entry.** Capture the returned `id`; `schedule_human` should read `"At 02:00 every day"`.

```bash
ID=$(hoody --container "$C" cron entries create root \
  --schedule '0 2 * * *' \
  --command 'pg_dump -U postgres mydb | gzip > /backups/db-$(date +\%F).sql.gz' \
  --name nightly-db-backup \
  --expires-at 2026-12-31T23:59:59Z \
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

**Step 1 — capture every enabled managed id.**

```bash
IDS=$(hoody --container "$C" cron entries list root -o json \
  | jq -r '.entries[] | select(.type=="managed" and .enabled) | .id')
```
**Step 2 — bulk disable.**

```bash
# The generated CLI cannot express enabled:false — `--enabled` is a presence-only
# boolean (there is no --no-enabled), so it can only re-enable. PATCH over HTTP:
for id in $IDS; do
  curl -sX PATCH "$KIT/users/root/entries/$id" \
    -H 'Content-Type: application/json' \
    -d '{"enabled":false}' >/dev/null
done
```
**Step 3 — run your migration. Step 4 — bulk re-enable** (same loop, body `{ enabled: true }`). Entries pick up at their next regular tick; no missed-window catch-up.

### 3. Migrate a hand-written crontab into managed entries

**Goal:** convert legacy raw lines (no `id`, no metadata) into managed entries with names + lifecycle fields. ⚠ Read the warning at step 3 before running anything destructive.

**Step 1 — read the raw crontab.** `hoody cron entries list` shows the same lines as `{ type: 'raw', line: '...' }` items.

```bash
hoody --container "$C" cron crontabs get root -o json | jq -r .crontab
```
**Step 2 — re-create as managed.** Parse each raw line into `(schedule, command)` and POST it.

```bash
hoody --container "$C" cron entries create root \
  --schedule '5 6 * * *' --command '/opt/myapp/cleanup.sh' --name daily-cleanup
```
**Step 3 — ⚠ DESTRUCTIVE — wipe the raw lines.** `hoody cron crontabs replace` REPLACES the entire crontab including managed entries (live-verified — see Quirks). Do this ONLY after step 2 has succeeded, and re-create the managed entries AFTER the wipe if you want them back.

```bash
hoody --container "$C" cron crontabs replace root --crontab ''
```
### 4. Hourly poll → tighten to every 5 minutes after a failure

**Goal:** a health-poller is failing intermittently; you want denser data without redeploying anything. Find by name, change schedule, restore later.

**Step 1 — find the entry id by name.**

```bash
ID=$(hoody --container "$C" cron entries list root -o json \
  | jq -r '.entries[] | select(.name=="health-poll") | .id')
```
**Step 2 — tighten to `*/5 * * * *`.** `schedule_human` becomes `"Every 5 minutes"` immediately on the response.

```bash
hoody --container "$C" cron entries update root "$ID" --schedule '*/5 * * * *'
```
**Step 3 — restore** to hourly with body `{ schedule: '0 * * * *' }` once the investigation is over (same call, different schedule string).

### 5. Time-bounded experiment — auto-expire after 30 days

**Goal:** run a daily metrics sample for one month, then have it self-remove. Then learn how to extend or unbound the deadline.

**Step 1 — create with `expires_at`.** ISO 8601 RFC 3339; must be in the future.

```bash
ID=$(hoody --container "$C" cron entries create root \
  --schedule @daily --command /opt/metrics/sample.sh \
  --name metrics-experiment --expires-at 2026-07-08T00:00:00Z \
  -o json | jq -r .id)
```
After the timestamp passes, the kit's 60 s sweep **deletes** expired managed entries. `hoody cron entries list`/`hoody cron entries get` also clean expired entries before serializing, so once the sweep runs you can no longer read the expired entry — the entry simply disappears from listings. The `removed_expired` count on `hoody cron crontabs replace` tells you how many expired entries got dropped during a bulk replace.

**Step 2a — extend the deadline mid-experiment** (push out by 30 days):

```bash
hoody --container "$C" cron entries update root "$ID" \
  --expires-at 2026-08-07T00:00:00Z
```
**Step 2b — make it permanent** instead. Pass `clear_expiration: true`. If you also send `expires_at` in the same call, `clear_expiration` silently wins (server returns `200` with `expires_at: null` — no error).

```bash
hoody --container "$C" cron entries update root "$ID" --clear-expiration
```
### 6. Quick-disable a misbehaving entry by name

**Goal:** A teammate paged you about a runaway cron at 3am. You don't have the id, only the name they mentioned (`noisy-job`).

**Step 1 — find its id by name.**

```bash
ENTRY_ID=$(hoody --container "$C" cron entries list root -o json \
  | jq -r '.entries[] | select(.type=="managed" and .name=="noisy-job") | .id')
echo "$ENTRY_ID"
```
**Step 2 — disable it (entry stays in the listing for forensics; cron won't fire it).**

```bash
# The generated CLI cannot express enabled:false (`--enabled` is presence-only,
# no --no-enabled) — PATCH over HTTP:
curl -sX PATCH "$KIT/users/root/entries/$ENTRY_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"enabled\":false,\"comment\":\"disabled $(date -u +%FT%TZ) — investigating\"}"
```
**Step 3 — re-enable later** by calling the same update with `{ enabled: true }`.

### 7. Audit which users on the container have any cron entries

**Goal:** compliance question — "who has scheduled jobs?". Container has 60+ system users; you want one shot.

`hoody cron crontabs list` returns one record per account in `/etc/passwd` (`{ user, crontab }`). Filter client-side for non-empty `crontab`.

```bash
hoody --container "$C" cron crontabs list --limit 200 -o json \
  | jq '.items[] | select(.crontab | test("\\S")) | {user, crontab}'
```
For each non-empty user, drill in via `hoody cron entries list` for the managed view, or read the `crontab` text directly from step 1.

### 8. Atomic full-crontab replace from versioned config

**Goal:** your IaC layer keeps the canonical crontab as a string in Git; on deploy, push the whole thing. ⚠ Destructive — wipes managed AND raw entries.

**Step 1 — snapshot current state** for forensics:

```bash
hoody --container "$C" cron crontabs get root -o json > /tmp/cron-snapshot.json
```
**Step 2 — push the canonical config.** Body MUST be `application/json` (raw `text/plain` returns `415`). Response carries `removed_expired` (count of managed entries that were dropped because their `expires_at` had passed).

```bash
hoody --container "$C" cron crontabs replace root \
  --crontab "$(cat /etc/iac/canonical-crontab.txt)"
```
### 9. Update only the comment / metadata, leave the schedule untouched

**Goal:** add a runbook URL or owner tag without risking changing what the entry does. PATCH is partial — fields you don't pass stay put.

```bash
hoody --container "$C" cron entries update root "$ID" \
  --comment 'owner: @team · runbook: https://wiki.example.com/cron-x'
```
`updated_at` advances; `schedule` / `command` / `enabled` are unchanged.

### 10. Rotate-and-replace pattern — read, edit text, write back

**Goal:** a teammate wants ONE hand-written line gone without disturbing the rest. You don't have an id (it's raw).

**Step 1 — fetch** the multi-line string. **Step 2 — edit client-side** (split, drop, rejoin). **Step 3 — write back.** ⚠ This also wipes any managed entries — re-create them with `hoody cron entries create` afterwards if you had any.

```bash
CUR=$(hoody --container "$C" cron crontabs get root -o json | jq -r .crontab)
NEW=$(echo "$CUR" | grep -v '^\*/30 \* \* \* \* /old\.sh')
hoody --container "$C" cron crontabs replace root --crontab "$NEW"
```

## Reference

### `hoody cron` (9) — Cron scheduling

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody cron crontabs get` |  | read | get crontab | `cron.crontab.get` | `hoody cron crontabs get alice` |
| `hoody cron crontabs list` |  | read | list all crontabs | `cron.crontab.listGlobalIterator` | `hoody cron crontabs list --page 10 --limit 10` |
| `hoody cron crontabs replace` |  | write | put crontab | `cron.crontab.put` | `hoody cron crontabs replace alice --crontab <crontab>` |
| `hoody cron entries create` | new, add | write | create entry | `cron.entries.create` | `hoody cron entries create alice --command "ls -la" --comment "Hello" --enabled --expires-at 2026-12-31T23:59:59Z --name my-resource --schedule "0 * * * *"` |
| `hoody cron entries delete` | rm, remove | destructive | delete entry | `cron.entries.delete` | `hoody cron entries delete alice abc-123` |
| `hoody cron entries get` |  | read | get entry | `cron.entries.get` | `hoody cron entries get alice abc-123` |
| `hoody cron entries list` |  | read | list entries | `cron.entries.listIterator` | `hoody cron entries list alice --page 10 --limit 10` |
| `hoody cron entries update` | edit | write | update entry | `cron.entries.update` | `hoody cron entries update alice abc-123 --clear-expiration --command "ls -la" --comment "Hello" --enabled --expires-at 2026-12-31T23:59:59Z --name my-resource --schedule "0 * * * *"` |
| `hoody cron health` |  | read | health check | `cron.health.check` | `hoody cron health` |


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
- `hoody curl schedules *` 404s if disabled.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Convert any REST call into a single GET-able URL (`hoody curl get-url`)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }`. Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; standard OR URL-safe base64, padding optional; takes precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Only `form`/multipart and binary `--data-binary @file` uploads remain POST-only.

Live examples (verified — replace the kit URL with your container's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `hoody proxy create` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

The CLI command and the SDK accessor `hoody curl get-url` **execute** the request and return the envelope; they do NOT just compose a URL string. To compose a URL without firing it, build it client-side or use `hoody proxy create` to get a stable prefix.

For the imperative full-cURL surface (binary uploads, `--data-binary @file`, multipart, follow-redirects, custom TLS, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`hoody curl exec` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `hoody curl exec` with `mode:"async"` → `job_id`.
2. Poll `hoody curl jobs get` or subscribe `hoody curl jobs events` filtered by `job_id`.
3. `hoody curl jobs result`; `hoody curl jobs cancel` aborts.

### 4. Cookie-jar session

1. `hoody curl exec` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `hoody curl sessions cookies` / `hoody curl sessions delete`.

### 5. Save download

1. `hoody curl exec` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `hoody curl storage list`/`hoody curl storage get`/`hoody curl storage delete` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `hoody curl schedules create` with `{cron,request}` → `schedule_id`.
2. `hoody curl schedules list`/`hoody curl schedules get`/`hoody curl schedules toggle` (`{"enabled":bool}`)/`hoody curl schedules delete`.
3. Each firing creates a job; inspect via `hoody curl jobs list`.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **Each saved download is mirrored under three indexes** for navigation: `by-job/{job_id}/<save_path>`, `by-domain/<host>/<job_id>`, `by-date/<YYYY-MM-DD>/<job_id>`. `hoody curl storage list` returns one item per index path; the bytes are the same file (live-verified — `storage.list?limit=5` after one save returns 3 items pointing to the same content).
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `hoody curl schedules *` 404s if disabled.
- `hoody curl schedules toggle` needs explicit boolean `enabled`; else 400.
- **`schedules.create.cron` is 6-field (with seconds), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- `hoody curl jobs events` is WebSocket `/api/v1/curl/ws`; filter by `job_id`.

## Common errors

- `408 timeout` — raise timeout or use async (upstream libcurl timeouts surface as `504` instead).
- `410 cancelled`.
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Every step in every example was live-tested against a real `curl-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

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
# `hoody curl get-url` fires the request (it does not print a clickable URL) and is the
# only CLI form that can send headers: `curl exec` registers NO --headers/--form flag.
hoody --container "$C" curl get-url \
  --url 'https://my-api/events' --method POST \
  --json '{"event":"X"}' \
  --header 'Content-Type: application/json'   # --header is repeatable, `Name: Value`
```
**Step 2 — hide the `containerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```bash
hoody proxy create --container-id "$C" --alias webhook-bridge \
  --program curl --target-path /api/v1/curl/request --allow-path-override
```
### 2. Multi-step OAuth login — cookie jar reuse across hits

**Goal:** authenticate against an API that uses a CSRF token + session cookie, then issue an authorized call. Pick a unique `session_id` per flow — once deleted, the same id returns `404 Session not found: <id> (tombstoned)` until the tombstone is garbage-collected (~24 h), after which the id is reusable again.

**Step 1 — fetch CSRF.** The Set-Cookie / response cookies are stored in the kit's jar.

```bash
SID="oauth-$(date +%s)"
TOKEN=$(hoody --container "$C" curl exec \
  --url https://api.example.com/csrf --method GET --response json \
  --session-id "$SID" -o json | jq -r '.body | fromjson | .csrf_token')   # --response json is REQUIRED for a .body envelope
```
**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar.

```bash
hoody --container "$C" curl get-url \
  --url https://api.example.com/login --method POST \
  --data "username=alex&password=secret&csrf=$TOKEN" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --session-id "$SID"
```
**Step 3 — authorized call.** Stored cookie is auto-attached.

```bash
hoody --container "$C" curl exec --url https://api.example.com/me \
  --method GET --response json --session-id "$SID" -o json | jq -r .body
hoody --container "$C" curl sessions cookies "$SID"
hoody --container "$C" curl sessions delete "$SID"
```
### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```bash
JOBS=()
for URL in https://httpbin.org/delay/1 https://httpbin.org/delay/2 https://httpbin.org/get; do
  JID=$(hoody --container "$C" curl exec --url "$URL" --method GET --mode async -o json | jq -r .job_id)
  JOBS+=("$JID")
done
```
**Step 2 — poll until all complete.** Live-verified — 3 httpbin jobs reached `completed/200` within ~4 s.

```bash
while :; do
  done=true
  for JID in "${JOBS[@]}"; do
    S=$(hoody --container "$C" curl jobs get "$JID" -o json | jq -r .status)
    [ "$S" = "completed" ] || done=false
  done
  $done && break; sleep 1
done
```
**Step 3 — collect bodies.** `hoody curl jobs result` returns just the upstream body.

```bash
for JID in "${JOBS[@]}"; do
  hoody --container "$C" curl jobs result "$JID" > "/tmp/$JID.json"
done
```
### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Status flips from `running` to `cancelled`, and the cancelled job's `error` field is set to `Cancelled`.

```bash
JID=$(hoody --container "$C" curl exec --url https://httpbin.org/delay/30 \
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
**Step 2 — audit failures.**

```bash
hoody --container "$C" curl jobs list --limit 200 -o json \
  | jq '.items[] | select(.status=="failed") | select(.name=="prod-health")'
```
**Step 3 — pause during deploy** (toggle `enabled: false` and back, or `delete` to drop entirely):

```bash
hoody --container "$C" curl schedules toggle "$SID" --body '{"enabled":false}'
# Resume: --body '{"enabled":true}'. Drop entirely:
hoody --container "$C" curl schedules delete "$SID"
```
### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```bash
JID=$(hoody --container "$C" curl exec --url https://example.com/big.iso \
  --method GET --mode async --save --save-path iso/ubuntu.iso --timeout 600 \
  -o json | jq -r .job_id)
```
**Step 2 — wait + inspect storage.** Three index entries point at the SAME bytes (`by-job/`, `by-domain/`, `by-date/`).

```bash
while [ "$(hoody --container "$C" curl jobs get "$JID" -o json | jq -r .status)" != "completed" ]; do sleep 2; done
hoody --container "$C" curl storage list --limit 10
```
**Step 3 — fetch & delete.** Single delete on ANY of the three mirror paths removes all three (live-verified — others return `404` afterwards).

```bash
hoody --container "$C" curl storage get "by-job/$JID/iso/ubuntu.iso" > /tmp/ubuntu.iso
hoody --container "$C" curl storage delete "by-job/$JID/iso/ubuntu.iso"
```
### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Live-verified against `httpbin.org/bearer` (`{"authenticated":true,"token":"…"}`).

```bash
hoody --container "$C" curl exec --url https://api.github.com/user --method GET \
  --bearer-token ghp_xxxxxxxxxxxx --response json -o json \
  | jq '{status_code, headers, body}'
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
hoody proxy create --container-id "$C" --alias rebuild-main --no-allow-path-override \
  --program curl --target-path '/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST'
```
**Step 3 — gate it** — only your office IPs can fire it (uses `hoody containers proxy groups ip set`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Job records are NOT auto-expired by the kit — they persist until the container's storage is cleared.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`):

```bash
JID=$(hoody --container "$C" curl jobs list --limit 200 -o json \
  | jq -r '.items[] | select(.status=="completed" and .name=="prod-health") | .id' | head -1)
```
**Step 2 — fetch.** `hoody curl jobs result` returns just the upstream body; `hoody curl jobs get` returns the full record (timing, headers, original request).

```bash
hoody --container "$C" curl jobs result "$JID"
hoody --container "$C" curl jobs get "$JID"
```
### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path.

```bash
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%d)
hoody --container "$C" curl storage list --limit 200 -o json \
  | jq -r --arg c "$CUTOFF" '.items[] | select(.path | startswith("by-date/")) | select((.path | split("/")[1]) < $c) | .path' \
  | while IFS= read -r P; do
      hoody --container "$C" curl storage delete "$P"
    done
```

## Reference

### `hoody curl` (21) — cURL jobs and schedules

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody curl exec` |  | action | Execute HTTP request with full cURL capabilities | `curl.execute` | `hoody --proxy <proxy> curl exec --auth-method <auth_method> --auth-password <auth_password> --auth-user <auth_user> --bearer-token <bearer_token> --cacert <cacert> --cert <cert> --cert-type <cert_type> --compressed --connect-timeout 10 --cookie <cookie> --data <data> --follow-redirects --insecure --job-name <job_name> --json '{}' --keepalive --keepalive-time 10 --key <key> --max-filesize 100 --max-redirects 10 --method GET --mode sync --proxy-password <proxy_password> --proxy-user <proxy_user> --range <range> --referer <referer> --response transparent --retry-count 100 --retry-delay 10 --save --save-path /home/user/file.txt --schedule "0 * * * *" --session-id abc-123 --speed-limit 10 --speed-time 10 --tcp-nodelay --timeout 10 --url https://example.com --user-agent "Mozilla/5.0"` |
| `hoody curl get-url` |  | action | Execute simple HTTP request via query parameters | `curl.executeCurlRequestGet` | `hoody curl get-url --url https://example.com --method GET --response <response> --mode stable --session-id abc-123 --follow-redirects --timeout 10 --user-agent "Mozilla/5.0" --referer <referer> --bearer-token <bearer_token> --save --save-path /home/user/file.txt --insecure --compressed --job-name <job_name> --data <data> --json '{}' --header <header> --data-base64 <data_base64>` |
| `hoody curl health` |  | read | Service health check | `curl.health.check` | `hoody curl health` |
| `hoody curl jobs cancel` |  | destructive | Cancel a pending or running job | `curl.jobs.cancel` | `hoody curl jobs cancel abc-123` |
| `hoody curl jobs events` |  | read | Subscribe to job events over WebSocket | `curl.events.streamWs` | `hoody curl jobs events --job-id abc-123` |
| `hoody curl jobs get` |  | read | Get detailed job information | `curl.jobs.get` | `hoody curl jobs get abc-123` |
| `hoody curl jobs list` |  | read | List all async jobs | `curl.jobs.listIterator` | `hoody curl jobs list --page 10 --limit 10` |
| `hoody curl jobs result` |  | read | Get job response body | `curl.jobs.getResult` | `hoody curl jobs result abc-123` |
| `hoody curl metrics` |  | read | Prometheus metrics | `curl.ops.metrics` | `hoody curl metrics` |
| `hoody curl schedules create` | new, add | write | Create a recurring scheduled job | `curl.schedules.create` | `hoody curl schedules create --cron "0 * * * *" --request-auth-method <request.auth_method> --request-auth-password <request.auth_password> --request-auth-user <request.auth_user> --request-bearer-token <request.bearer_token> --request-cacert <request.cacert> --request-cert <request.cert> --request-cert-type <request.cert_type> --request-compressed --request-connect-timeout <request.connect_timeout> --request-cookie <request.cookie> --request-data <request.data> --request-follow-redirects --request-form <request.form> --request-headers <request.headers> --request-insecure --request-job-name <request.job_name> --request-json <request.json> --request-keepalive --request-keepalive-time <request.keepalive_time> --request-key <request.key> --request-max-filesize <request.max_filesize> --request-max-redirects <request.max_redirects> --request-method <request.method> --request-mode <request.mode> --request-proxy <request.proxy> --request-proxy-password <request.proxy_password> --request-proxy-user <request.proxy_user> --request-range <request.range> --request-referer <request.referer> --request-response <request.response> --request-retry-count 100 --request-retry-delay <request.retry_delay> --request-save --request-save-path /home/user/file.txt --request-schedule <request.schedule> --request-session-id abc-123 --request-speed-limit <request.speed_limit> --request-speed-time <request.speed_time> --request-tcp-nodelay --request-timeout <request.timeout> --request-url <request.url> --request-user-agent <request.user_agent>` |
| `hoody curl schedules delete` |  | destructive | Delete a schedule | `curl.schedules.delete` | `hoody curl schedules delete abc-123` |
| `hoody curl schedules get` |  | read | Get schedule details | `curl.schedules.get` | `hoody curl schedules get abc-123` |
| `hoody curl schedules list` |  | read | List all scheduled jobs | `curl.schedules.listIterator` | `hoody curl schedules list --page 10 --limit 10` |
| `hoody curl schedules toggle` |  | action | Enable or disable a schedule | `curl.schedules.toggle` | `hoody curl schedules toggle abc-123 --body '{}'` |
| `hoody curl sessions cookies` |  | read | Get session cookies only | `curl.sessions.getCookies` | `hoody curl sessions cookies abc-123` |
| `hoody curl sessions delete` |  | destructive | Delete a session | `curl.sessions.delete` | `hoody curl sessions delete abc-123` |
| `hoody curl sessions get` |  | read | Get session details | `curl.sessions.get` | `hoody curl sessions get abc-123` |
| `hoody curl sessions list` |  | read | List all cookie sessions | `curl.sessions.listIterator` | `hoody curl sessions list --page 10 --limit 10` |
| `hoody curl storage delete` |  | destructive | Delete a saved file | `curl.storage.deleteFile` | `hoody curl storage delete /home/user/file.txt` |
| `hoody curl storage get` |  | read | Download a saved file | `curl.storage.getFile` | `hoody curl storage get /home/user/file.txt` |
| `hoody curl storage list` |  | read | List all saved downloads | `curl.storage.listIterator` | `hoody curl storage list --page 10 --limit 10` |


---

<!-- ===== namespace: daemon ===== -->

# `daemon` — supervisord program lifecycle (start any program; logs always retained)

## Purpose

**Default for "start a program" / "spawn a process"** when you don't need an interactive shell or a TUI. REST over `supervisord` — every process is supervised, auto-restart-eligible, log-captured (stdout + stderr written under `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` — one directory per program, with rotated timestamped log files behind those symlinks), and inspectable after the fact. Log FILES outlive the process on disk, but the ephemeral tracking entry is reaped on stop/exit — after that `hoody daemon ephemeral logs` 404s (see Quirks); capture logs before stopping, or read the on-disk files directly (e.g. via the `files` namespace). `hoody daemon programs logs` covers configured (non-ephemeral) programs.

Two flavours:

- **Quick-start (ephemeral, no config write)** — `quickStart.launch { command, user, ttl?, wait?, timeout? }`. Returns `temporary_id = quick_<ts>_<seq>`. Best for one-offs and short-lived jobs (build steps, batch transforms, "run this once and tell me the output"). Logs survive the process; pull with `hoody daemon ephemeral logs`. Optional `ttl` auto-stops after N seconds.
- **Registered program (durable, persists across kit restarts)** — `programs.add { name, command, user, enabled: true, boot: true?, autorestart: 'unexpected', … }` → `control.start { wait: true }`. Use this when the process should come back after a container restart, when you want auto-restart on crash, or when you need port-range fan-out / lazy-load on first proxy hit.

## When to use

- "Run this command and keep the logs" → `hoody daemon ephemeral start`.
- "Run this server / agent / script as a long-running supervised process, restart on failure" → `hoody daemon programs create` + `hoody daemon programs start`.
- Background workers, port-range fan-out, lazy-loaded HTTP services, supervisord-event webhooks.

## When NOT to use

- **Traditional system services that ship native systemd units** (apache2, nginx, postgresql, mysql, redis, mosquitto, sshd, postfix, …) — leave them on `systemd`. Hoody containers are full Linux boxes with systemd + root (they behave like VMs, not Docker), so the standard `apt install nginx && systemctl enable --now nginx` flow Just Works and benefits from the upstream unit's hardening (drop-in directories, sd_notify, journal integration, etc.). Mixing systemd-managed and `daemon`-managed processes in the same container is fine — pick whichever fits the program.
- Need an interactive TTY (Claude Code, Codex, htop, vim, anything that paints the screen) → use `terminal` with a **pinned non-ephemeral `terminal_id`**, NOT `daemon`. Daemon programs have no TTY.
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

- `/dev/hoody`, `/hoody`, `LOG_BASE_DIR=/hoody/storage/hoody-daemon/logs/` exist.
- `user` = real system account.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Register and boot

- `hoody daemon programs create` (`name`/`command`/`user`; `enabled`, `boot`; opt `directory`/`environment`/`autorestart`/`priority`/`*_logfile`) -> `hoody daemon programs start` `{ wait: true, timeout: 30 }` -> `hoody daemon programs status` (`include_stats`); `hoody daemon programs logs` on failure.

### 2. Ephemeral with TTL

- `hoody daemon ephemeral start` (`command`/`user`, opt `ttl?`/`wait?`/`timeout?`) returns `temporary_id` = `quick_<ts>_<seq>`. Poll/tail with `hoody daemon ephemeral status`/`hoody daemon ephemeral logs`; `hoody daemon ephemeral stop` to terminate.

### 3. Lazy port-range fleet

- `hoody daemon programs create` + `port_range: { start, end }`, `port_param`, `lazy_load: true`, `enabled: true`. `programs.list?port=8042&include_status=true`. `hoody daemon programs start` `{ port: 8042 }`; `hoody daemon programs stop` `{ port }` or `{ all: true }`.

### 4. Reach a service you just started

Any container port is publicly addressable as soon as the listener is up — no proxy alias, firewall edit, or extra registration needed:

- HTTP service on `:8080` → `https://{projectId}-{containerId}-http-8080.{node}.containers.hoody.com`
- HTTPS service on `:8443` → `https://{projectId}-{containerId}-https-8443.{node}.containers.hoody.com`

Edge is always `https://`; the slug only describes the inner protocol. Gate access via `proxyPermissionsContainer.*` if it shouldn't be public. See § Proxy URLs.

### 5. Update / wipe

`hoody daemon programs edit` field-merge; `hoody daemon programs disable`/`hoody daemon programs enable`; `hoody daemon programs delete`; `hoody daemon programs reset` -> `programs.default.json`.

## Quirks & gotchas

- Boolean query params (`hoody_kit`, `lazy_load`, `enabled`, `boot`, `include_status`, `include_stats`) STRICT: only `true`/`false`; `1`/`yes`/`0`/`""` -> 400.
- Webhook URLs HTTPS-only unless `NODE_ENV=development` (which also skips every host check below). Userinfo is always rejected; in production the literal label `localhost` and private/CGNAT/link-local/v6-ULA addresses are too, including when written as NAT64, v4-mapped-v6, or non-standard v4 (`2130706433`, `0x7f000001`, `127.1`) — but only when the URL authority is already an IP literal or `localhost`. A DNS name is accepted whatever it resolves to, so treat this as input validation, not an egress control. Redirects are never followed.
- Webhook edits deep-merge (omitted fields NOT cleared); events need `notifications.enabled` + `event_listener_enabled` + supervisord `eventlistener`.
- Duplicate names + overlapping port ranges rejected on create AND update (adjacent OK); `port_param` requires `port_range`.
- `command` no newlines/CR/NUL; `user` `(?i)[a-z_][a-z0-9_-]*\$?` (case-insensitive) via `id`; `*_logfile` confined to `LOG_BASE_DIR`.
- `hoody daemon programs start` on `port_range` REQUIRES `{ port }`; `hoody daemon programs stop` `{ port }` or `{ all: true }`.
- `quick_<ms>_<seq>` IDs (e.g. `quick_1700000000000_1`) are produced by the kit (which accepts `^quick_[a-zA-Z0-9_]+$` via `sanitize_temp_id`) but the OpenAPI path-param schema is the stricter `^quick_\d+$`, and the generated **TypeScript SDK enforces it client-side** — the CLI and raw HTTP pass the full id straight to the kit and work fine. In SDK mode, drive `hoody daemon ephemeral status` / `hoody daemon ephemeral stop` via raw HTTP to avoid the local validator, OR call `hoody daemon ephemeral list` and select by `name`. TTL polled ~10 s.
- Default ephemeral log paths are `/hoody/storage/hoody-daemon/logs/<name>/stdout.log` and `/hoody/storage/hoody-daemon/logs/<name>/stderr.log` (one directory per program), NOT `<name>.out.log`/`<name>.err.log`.
- After `hoody daemon ephemeral stop`, the in-memory tracking entry is removed (the on-disk log files persist but are unreachable through `hoody daemon ephemeral logs`, which returns `404`). Capture logs (read `hoody daemon ephemeral logs` or fetch the on-disk file directly) BEFORE calling `stop`.
- `hoody daemon programs start` accepts `if_not_running: true` for an idempotent boot — early-returns with `already_running: true` if the program is already running (port-range responses include an `instance` block with per-instance status/pid; standard programs return `instance: null` — no pid). Use it for "ensure started" workflows.
- **`environment` REPLACES the whole map** on `hoody daemon programs edit` (not per-key merge). If the existing env is `{A:1,B:2}` and you PATCH `{environment:{A:9}}`, the result is `{A:9}`. To preserve secrets, GET the program first and re-send the merged map.
- Webhook delivery requires THREE flags ON: per-program `webhooks.enabled: true`, kit-level `notifications.enabled: true`, AND kit-level `event_listener_enabled: true`. Toggling only the per-program flag will not fire callbacks.
- Proxy `X-Bypass-Local-Restrictions` strips `command`/`environment`/`directory`/`user`/`webhooks`/`stdout_logfile`/`stderr_logfile`.
- CLI `--port-range-{start,end}` -> nested `port_range`.

## Common errors

- 400 webhook: `must use HTTPS`, `contains userinfo`, `reserved IP range`.
- 400 `name already in use` / `Port range overlaps` / `port_param requires port_range`.
- success=false `Port parameter required` / `Program with ID {id} is disabled` -> `hoody daemon programs enable`.
- Direct private-IP connections get a plain `403 Forbidden` (the kit logs `connection blocked reason=private_ip` server-side; that string is NOT in the response) -> use the capability URL.
- 1 MB JSON body limit.

## Related namespaces

`exec` sync. `cron` scheduled. `proxyLogs` access log. `terminal` TTY. `display` virtual display.

## Examples

Every step in every example was live-tested against a real `daemon-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. The kit returns numeric `program.id` (not a UUID) — capture it from the `hoody daemon programs create` response.

### 1. Register a long-running supervised program with auto-boot

**Goal:** add a tick-emitting worker that supervisord keeps alive across kit restarts, then start it without blocking the caller.

**Step 1 — add (`enabled: true`, `boot: true`).** Capture `program.id`. Use `user: "user"` (uid 1000); the daemon's `command` allows shell metachars but you must own the quoting — single-quote the outer payload to avoid double-escaping.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-tick \
  --command 'sh -c '\''while :; do echo tick $(date -u +%s); sleep 5; done'\''' \
  --user user --enabled --boot --autorestart unexpected \
  -o json | jq -r '.program.id')
```
**Step 2 — `hoody daemon programs start` with `wait: false`.** ⚠ `wait: true` blocks the HTTP request until the process is running and easily exceeds 30 s on a cold kit (live-verified — `wait:true,timeout:30` returned client-side timeout). Pass `wait: false` and poll `hoody daemon programs status` instead.

```bash
hoody --container "$C" daemon programs start "$ID"
while [ "$(hoody --container "$C" daemon programs status "$ID" -o json | jq -r .status.status)" != "running" ]; do sleep 1; done
```
### 2. Quick-start ephemeral with TTL — launch, check status, tail logs

**Goal:** fire a one-shot command (no config write), let it run up to 10 minutes, retrieve its output. ⚠ **Major quirk (TypeScript SDK only)** — `hoody daemon ephemeral start` returns `temporary_id = "quick_<ms>_<seq>"` (e.g. `quick_1700000000000_1`), but the generated SDK's client-side validator rejects that exact id on `hoody daemon ephemeral status` with `id must match pattern: ^quick_\d+$` (live-verified); the CLI and raw HTTP accept the full id and work fine. Truncating to `quick_<ms>` returns 404. **SDK workaround:** use `hoody daemon ephemeral list` to find the entry by `name`, or call `hoody daemon ephemeral logs` (which DOES accept the full id) to verify the run.

**Step 1 — launch.**

```bash
QID=$(hoody --container "$C" daemon ephemeral start \
  --name examples-daemon-qs --user user --ttl 600 \
  --command 'sh -c "for i in $(seq 1 30); do echo qs-$i; sleep 1; done"' \
  -o json | jq -r .temporary_id)
```
**Step 2 — find via `hoody daemon ephemeral list` (in SDK mode this avoids the TypeScript SDK's client-side `^quick_\d+$` pattern validator on `hoody daemon ephemeral status`; CLI and raw HTTP don't need the detour).**

```bash
hoody --container "$C" daemon ephemeral list -o json \
  | jq '.ephemeral_programs[] | select(.name=="examples-daemon-qs")'
```
**Step 3 — tail logs (the full id with `_<seq>` is accepted here).**

```bash
hoody --container "$C" daemon ephemeral logs "$QID" --type stdout --lines 10
```
**Step 4 — stop.** ⚠ The kit's `hoody daemon ephemeral stop` accepts the full `quick_<ms>_<seq>` id (as do the CLI and raw HTTP), but the **generated TypeScript SDK enforces a stricter `^quick_\d+$` pattern client-side** and rejects real ids returned by `hoody daemon ephemeral start`. In SDK mode drive stop via raw HTTP **POST** to `/api/v1/daemon/quick-start/{id}/stop`, or look up by `name` via `hoody daemon ephemeral list` and use the SDK only for ids matching the stricter pattern.

```bash
hoody --container "$C" daemon ephemeral stop "$QID"
```
### 3. Lazy port-range fan-out — one program, N port-bound instances

**Goal:** declare an HTTP service that listens on any port in `18800–18802`, materialised on demand the first time someone hits the proxy URL.

**Step 1 — add with `port_range` + `port_param` + `lazy_load`.** ⚠ `port_param` cannot be empty (live-verified — kit returns `400 Invalid port_param format: ""`). Use a real CLI flag, e.g. `--port`. The kit appends ` <flag> <port>` to your command at start-time.

```bash
ID=$(hoody --container "$C" daemon programs create \
  --name examples-daemon-fanout --command 'python3 -m http.server' \
  --user user --enabled \
  --port-range-start 18800 --port-range-end 18802 \
  --port-param=--port --lazy-load \
  -o json | jq -r .program.id)
```
**Step 2 — start one specific port and read fleet-wide status.** `programs.list?port=18800&include_status=true` returns the program with a `status: { type: "port-range", running_instances, total_instances, instances: [{ port, status, … }] }` block (live-verified).

```bash
hoody --container "$C" daemon programs start "$ID" --port 18800
hoody --container "$C" daemon programs list --port 18800 -o json \
  | jq '.programs[].status'
```
The instance is reachable at `https://${P}-${C}-http-18800.${N}.containers.hoody.com` — no extra alias needed (see § "Reach a service you just started").

### 4. Tail program logs (`hoody daemon programs logs` with type / lines)

**Goal:** investigate why a worker keeps restarting. `hoody daemon programs logs` returns `{ logs, type, lines, log_file }` where `log_file` is the on-disk path under `/hoody/storage/hoody-daemon/logs/<name>/{stdout,stderr}.log` (live-verified).

```bash
hoody --container "$C" daemon programs logs "$ID" --type stderr --lines 200
```
For a port-range program, pass `?port=18800` to read the per-instance log file.

### 5. Webhook on supervisord process events (e.g. crash → HTTPS callback)

**Goal:** when the program enters the `FATAL` state, POST to your HTTPS endpoint. ⚠ Webhook URLs must be **HTTPS** unless `NODE_ENV=development` (and reject userinfo, `localhost`, and private/CGNAT/link-local ranges). ⚠ **Event names are kit-specific, not the supervisord canonical `PROCESS_STATE_*` ones**: live-verified the kit accepts only `STARTING, RUNNING, BACKOFF, STOPPING, STOPPED, EXITED, FATAL, UNKNOWN, "all", "*"`. Sending `PROCESS_STATE_FATAL` returns `400 Invalid event type`.

```bash
# CLI `programs edit` requires --name, --command, --user (echo from your snapshot of programs.get).
hoody --container "$C" daemon programs edit "$ID" \
  --name "$NAME" --command "$CMD" --user "$USER" \
  --webhooks-enabled \
  --webhooks-urls https://hooks.example.com/daemon-events \
  --webhooks-events FATAL --webhooks-events BACKOFF \
  --webhooks-headers X-Source=hoody-daemon \
  --webhooks-timeout 10 --webhooks-retry 2
```
⚠ Webhook edits **deep-merge** — fields you omit from the `webhooks` block are NOT cleared. To turn off, send `{ webhooks: { enabled: false } }`. To rotate URLs, send the new full `urls` array (it replaces — array-set, not array-add). The **generated SDK type** (`ProgramInput`) marks `name`, `command`, and `user` as required on every `hoody daemon programs edit` body (re-send them from a `hoody daemon programs get` snapshot); the raw kit HTTP API does NOT require them on updates — it field-merges and accepts a partial `ProgramData`, so for surgical patches drop down to `fetch()`.

### 6. Wipe + reset to defaults — non-destructive snapshot first

**Goal:** restore the supervisord program set to whatever ships in `programs.default.json`. ⚠ **Destructive** — every program you added gets wiped. Snapshot before you call. (This step is intentionally NOT live-tested — it would break the shared test container; pattern shown for reference.)

```bash
hoody --container "$C" daemon programs list -o json > /tmp/daemon-snapshot.json   # CLI list has no --limit
hoody --container "$C" daemon programs reset
```
### 7. Patch only the env vars on a running program

**Goal:** flip `LOG_LEVEL=debug` without restating `command`/`user`/etc. `hoody daemon programs edit` is a partial merge — fields you don't pass are preserved (live-verified — the response shows merged `environment` plus all original fields intact).

```bash
# `programs edit` requires --name/--command/--user (PUT-style replacement); snapshot first then re-pass:
P=$(hoody --container "$C" daemon programs get "$ID" -o json | jq '.program')
hoody --container "$C" daemon programs edit "$ID" \
  --name "$(echo "$P" | jq -r .name)" \
  --command "$(echo "$P" | jq -r .command)" \
  --user "$(echo "$P" | jq -r .user)" \
  --environment LOG_LEVEL=debug --environment BUILD=examples
hoody --container "$C" daemon programs stop "$ID"
hoody --container "$C" daemon programs start "$ID"
```
⚠ `environment` REPLACES the whole map (not per-key merge). If you have `{A:1,B:2}` and PATCH `{A:9}`, you end up with just `{A:9}` — re-send everything you want to keep.

### 8. Inspect a running program with stats

**Goal:** read CPU/RSS/uptime to feed a dashboard. `status.get?include_stats=true` returns the basic `{ id, status }` plus stats fields when the process is actually `running` (when in `backoff`/`stopped`, only `status` and a string `uptime` like `"too quickly (process log may have details)"` come back — live-verified).

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

**Goal:** keep the program defined but stop supervisord from auto-restarting it. `hoody daemon programs disable` flips `enabled: false` (process stays in the listing for forensics); `hoody daemon programs enable` brings it back without touching `command`/`environment`.

```bash
hoody --container "$C" daemon programs disable "$ID"
hoody --container "$C" daemon programs enable "$ID"
hoody --container "$C" daemon programs start "$ID"
```
⚠ Trying `hoody daemon programs start` while `enabled: false` returns `success: false` with `Program with ID {id} is disabled` (e.g. `Program with ID 7 is disabled`) — call `hoody daemon programs enable` first.

## Reference

### `hoody daemon` (19) — Daemon and ephemeral programs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody daemon ephemeral list` |  | read | List all ephemeral programs | `daemon.quickStart.listIterator` | `hoody daemon ephemeral list` |
| `hoody daemon ephemeral logs` |  | read | Get ephemeral program logs | `daemon.quickStart.getEphemeralLogs` | `hoody daemon ephemeral logs abc-123 --type stdout --lines 100` |
| `hoody daemon ephemeral start` |  | write | Launch ephemeral CUSTOM program | `daemon.quickStart.launch` | `hoody daemon ephemeral start --command "ls -la" --user alice --name my-resource --autorestart true --directory /home/user/src --environment <key=value> --priority 999 --delay-seconds 0 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --ttl 10 --wait --timeout 30 --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive` |
| `hoody daemon ephemeral status` |  | read | Get ephemeral program status | `daemon.quickStart.getStatus` | `hoody daemon ephemeral status abc-123` |
| `hoody daemon ephemeral stop` |  | write | Stop ephemeral program | `daemon.quickStart.stop` | `hoody daemon ephemeral stop abc-123` |
| `hoody daemon health` |  | read | Service health check | `daemon.health.check` | `hoody daemon health` |
| `hoody daemon programs create` |  | write | Add a new CUSTOM program | `daemon.programs.add` | `hoody daemon programs create --id 10 --name my-resource --description "My description" --command "ls -la" --user alice --enabled --boot --delay-seconds 0 --autorestart true --directory /home/user/src --priority 999 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --environment <key=value> --hoody-kit --port-range-start <port_range.start> --port-range-end <port_range.end> --port-param=--port --lazy-load --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive --webhooks-enabled --webhooks-urls <webhooks.urls> --webhooks-events <webhooks.events> --webhooks-headers <key=value> --webhooks-timeout <webhooks.timeout> --webhooks-retry <webhooks.retry>` |
| `hoody daemon programs delete` | rm, remove | destructive | Remove a program | `daemon.programs.remove` | `hoody daemon programs delete abc-123` |
| `hoody daemon programs disable` |  | write | Disable a program | `daemon.control.disable` | `hoody daemon programs disable abc-123` |
| `hoody daemon programs edit` |  | write | Edit a program | `daemon.programs.edit` | `hoody daemon programs edit abc-123 --name my-resource --description "My description" --command "ls -la" --user alice --enabled --boot --delay-seconds 0 --autorestart true --directory /home/user/src --priority 999 --stdout-logfile <stdout_logfile> --stderr-logfile <stderr_logfile> --logs-enabled --log-max-bytes 5242880 --log-backups 2 --environment <key=value> --hoody-kit --port-range-start <port_range.start> --port-range-end <port_range.end> --port-param=--port --lazy-load --display :0 --terminal-id 10 --terminal-shell bash --terminal-interactive --webhooks-enabled --webhooks-urls <webhooks.urls> --webhooks-events <webhooks.events> --webhooks-headers <key=value> --webhooks-timeout <webhooks.timeout> --webhooks-retry <webhooks.retry>` |
| `hoody daemon programs enable` |  | write | Enable a program | `daemon.control.enable` | `hoody daemon programs enable abc-123` |
| `hoody daemon programs get` |  | read | Get a specific program | `daemon.programs.get` | `hoody daemon programs get abc-123` |
| `hoody daemon programs list` |  | read | List all programs | `daemon.programs.listIterator` | `hoody daemon programs list --port 8080 --port-from 10 --port-to 10` |
| `hoody daemon programs logs` |  | read | Get program logs | `daemon.status.getLogs` | `hoody daemon programs logs abc-123 --type stdout --lines 100 --port 8080` |
| `hoody daemon programs reset` |  | write | Reset programs to default | `daemon.programs.reset` | `hoody daemon programs reset` |
| `hoody daemon programs start` |  | write | Start a program or port instance | `daemon.control.start` | `hoody daemon programs start abc-123 --port 8080 --wait --timeout 30 --if-not-running` |
| `hoody daemon programs status` |  | read | Get specific program status | `daemon.status.get` | `hoody daemon programs status abc-123 --port 8080 --include-stats true` |
| `hoody daemon programs statuses` |  | read | Get all program statuses | `daemon.status.getAll` | `hoody daemon programs statuses` |
| `hoody daemon programs stop` |  | write | Stop a program or port instance | `daemon.control.stop` | `hoody daemon programs stop abc-123 --port 8080 --all` |


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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. See-then-act loop

1. `hoody display screenshots capture` (`base64=true` for vision).
2. `hoody display input click-at` / `hoody display input type-at`.
3. `hoody display screenshots capture-metadata` — cheap timestamp check.
4. Re-capture only when timestamp advanced.

### 2. Find and focus a window

1. `hoody display windows list` (`onlyVisible=true`).
2. `hoody display windows search` — name/class/classname.
3. `hoody display windows focus` / `hoody display windows raise`.
4. `hoody display windows geometry` — coords.
5. `hoody display windows active` — confirm.

### 3. Drag / select

1. `hoody display mouse move` — optional pre-position.
2. `hoody display input drag` `(sx,sy)`→`(ex,ey)`, optional `steps`.
3. Or `hoody display input select` — click + shift-click.
4. `hoody display input reset` — release stuck buttons.

### 4. Clipboard hand-off

1. `hoody display clipboard set` — `text`, optional `selection`.
2. `hoody display keyboard key` — `["ctrl+v"]` (`["shift+Insert"]` for primary).
3. `hoody display clipboard get` — read back after GUI copy.

### 5. Batch input replay

1. `hoody display input batch` — POST ordered actions.
2. `hoody display input wait` — interleave waits.
3. `hoody display screenshots capture` — confirm.

## Quirks & gotchas

- `?displayId=N` overrides `*-display-N.*` host.
- `displayId` `1..999999`, digits only (regex `^\d+$` at displayContext.ts:22, range check at :24); invalid silently falls through to host-derived id by :31.
- All endpoints except `health` and the HTML client root (`GET /api/v1/display/`) need a displayId or return `400 NO_DISPLAY_CONTEXT`.
- Screenshot GETs return binary PNG; `base64=true` for JSON.
- `getByTimestamp` needs numeric `timestamp`, not `timestamp_human`.
- Clipboard `selection`: `clipboard` (default), `primary`, `secondary`. PRIMARY ≠ Ctrl+V.
- Window IDs accept decimal or hex (`0x...`); returns decimal.
- `hoody display access` returns HTML, browser-only.
- SDK-only quirk: the screenshot-list accessor hangs off the namespace root (`hoody display screenshots list`), not the `screenshots` service — there is no `screenshots.list`.
- `hoody display info` returns display info, a window list (each with per-window `position`/`size`), and the screenshot list — but NOT the Xvfb canvas dimensions (those live on `hoody display input geometry`, see `inputRoutes.ts:499`).
- `hoody display input reset` clears stuck modifiers/buttons.

## Common errors

- `400 NO_DISPLAY_CONTEXT` — supply `?displayId=N` or `*-display-N.*`.
- `DISPLAY_NOT_AVAILABLE` — X server for displayId unreachable; thrown by `inputService.parseError` (re-emitted by the input route handler) and also by the clipboard/window route handlers.
- `404` on `getByTimestamp` — no match. Refresh by calling `hoody display screenshots capture-metadata` (`/api/v1/display/screenshot/info`) — that endpoint **takes a fresh screenshot** and returns its metadata, not just a timestamp lookup; then retry `getByTimestamp` with the new ts. (`/screenshot/last/info`/`hoody display screenshots latest-metadata` only returns metadata for the *latest* screenshot — not a usable replacement for a missed timestamp.)

## Related namespaces

`terminal`, `notifications`, `browser`, `files`, `exec`.

## Examples

Every step in every example was live-tested against a real `display-1` kit driving an Xpra/X11 session inside a Hoody container. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, and pick a `DID` (the active display id, e.g. `1`). The `display-1` in the kit URL is the kit instance, NOT the display id — `?displayId=N` (or `--display-id N`) selects the X server.

### 1. See-then-act loop — capture, click, re-capture, diff

**Goal:** snapshot the screen, click a coordinate, snapshot again, and use cheap metadata (`timestamp`) to detect that the second capture is fresh — typical inner loop for vision-driven agents.

**Step 1 — capture a baseline with `base64` so the bytes round-trip in JSON.**

```bash
TS_BEFORE=$(hoody --container "$C" display screenshots capture-metadata --display-id 1 -o json | jq -r .timestamp)
hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json | jq -r .image.data > /tmp/before.b64
```
**Step 2 — click at `(75, 50)`.** `hoody display input click-at` moves AND clicks in one call; default `button=1` (left).

```bash
hoody --container "$C" display input click-at --display-id 1 --x 75 --y 50 --button 1
```
**Step 3 — cheap freshness check, then full re-capture only if the timestamp advanced.** `screenshot/info` returns metadata without the PNG bytes — much cheaper than a full capture for polling.

```bash
TS_AFTER=$(hoody --container "$C" display screenshots capture-metadata --display-id 1 -o json | jq -r .timestamp)
[ "$TS_AFTER" != "$TS_BEFORE" ] && hoody --container "$C" display screenshots capture --display-id 1 --base64 -o json | jq -r .image.data > /tmp/after.b64
```
### 2. Find a window by name + focus it

**Goal:** locate the `xeyes` window without knowing its decimal `windowId`, then focus and confirm.

**Step 1 — `hoody display windows search` with a regex `pattern`.** The booleans control which X11 fields to match against (`name` = WM_NAME / `_NET_WM_NAME`, `class` / `classname` = WM_CLASS pair). Returns just an array of `windowId` integers.

```bash
WID=$(hoody --container "$C" display windows search --display-id 1 \
  --pattern xeyes --name --class --classname -o json | jq -r '.windows[0]')
```
**Step 2 — focus + confirm.** `hoody display windows active` returns the currently focused id; compare with what you focused.

```bash
hoody --container "$C" display windows focus --display-id 1 --window-id "$WID"
hoody --container "$C" display windows active --display-id 1 -o json | jq -r .windowId
```
### 3. Click sequence, then type into the focused window

**Goal:** focus an editable field (e.g. a text input at `(120, 80)`), type a string, with a small per-keystroke delay so the target app doesn't drop characters.

```bash
hoody --container "$C" display input click-at --display-id 1 --x 120 --y 80
hoody --container "$C" display keyboard type --display-id 1 --text "hello world" --delay 20
```
`hoody display input type-at` collapses click-then-type into one call when you only need plain ASCII at one point: `{ x, y, text, delay }`.

### 4. Drag from one position to another

**Goal:** smooth-drag from `(50, 50)` to `(200, 150)` over `steps=20` interpolated mouse positions (raise `steps` if the target app's drag-recogniser misses fast moves; cap is 1000).

```bash
hoody --container "$C" display input drag --display-id 1 \
  --start-x 50 --start-y 50 --end-x 200 --end-y 150 --button 1 --steps 20
```
If a drag aborts mid-way and the button stays "pressed" (next click misbehaves), see example 10 — `hoody display input reset` releases stuck buttons + modifiers.

### 5. Clipboard hand-off — write text, paste with Ctrl+V

**Goal:** stage text in the X11 CLIPBOARD selection, then send Ctrl+V into the focused window so it's pasted natively. ⚠ See quirk: clipboard ops can fail with `CLIPBOARD_FAILED` / "no HOME directory" if the X session was launched without a writable `$HOME` for the kit user; verify by reading back the clipboard after the write.

**Step 1 — `hoody display clipboard set` to the standard CLIPBOARD buffer.** PRIMARY (middle-click paste) is a different selection — Ctrl+V reads CLIPBOARD only.

```bash
hoody --container "$C" display clipboard set --display-id 1 --text "pasted via hoody" --selection clipboard
hoody --container "$C" display clipboard get --display-id 1 --selection clipboard
```
**Step 2 — Ctrl+V into the focused window.** `keys` is an array — pass `["shift+Insert"]` instead if the target app paste-binds to PRIMARY.

```bash
hoody --container "$C" display keyboard key --display-id 1 --keys ctrl+v
```
### 6. Read window properties (geometry + WM_CLASS + WM_NAME)

**Goal:** for an unknown window id `WID`, read its title, class hints, and pixel rectangle to decide where to click.

```bash
hoody --container "$C" display windows properties "$WID" --display-id 1 -o json | jq '.properties'
hoody --container "$C" display windows geometry "$WID" --display-id 1 -o json | jq '{x,y,width,height}'
```
`windowId` accepts decimal or hex (`0x...`); the response always normalises to decimal.

### 7. List visible windows with `onlyVisible` filter

**Goal:** enumerate everything mapped on screen (not iconified / withdrawn), pick the one with a name matching `xeyes`, no regex.

```bash
hoody --container "$C" display windows list --display-id 1 --only-visible -o json \
  | jq '.windows[] | select(.name=="xeyes") | {windowId, name, class, geometry}'
```
Each item carries `windowId`, `name`, `class` (the WM_CLASS pair as 2 strings), `desktop`, a per-window geometry object (the JSON key is "geometry", shaped `{x,y,width,height}`), `focused`, `states`. Use `focusedWindowId` on the parent object to find the active window without a second call.

### 8. Batch input replay — one POST, many actions

**Goal:** replay a recorded interaction (move → wait → click → wait → type) atomically. `actions[]` cap is 50, each item is `{ action: "<service>/<verb>", params: {...} }`. The response lists every step with success/failure indexed back to the request order.

```bash
# The generated CLI exposes NO flag for the actions array (only --display-id) — run
# the sequence as per-step `input act` calls, or POST the batch over HTTP:
hoody --container "$C" display input act --display-id 1 --action mouse/move  --params x=120 --params y=80
hoody --container "$C" display input act --display-id 1 --action input/wait  --params ms=150
hoody --container "$C" display input act --display-id 1 --action mouse/click --params button=1
hoody --container "$C" display input act --display-id 1 --action keyboard/type --params text=replayed --params delay=15
```
`hoody display input wait` standalone (`{ ms, screenshot }`) is the right way to insert pauses between separate calls if you don't want to use `hoody display input batch`. `ms` floor 50, ceiling 30 000.

### 9. Get display information — geometry, screenshots, X server status

**Goal:** one call that returns the running PID/session-name, connected clients, the window list, and the recent screenshot list — then pair it with `hoody display input geometry` for the X server's pixel size. Useful as a one-shot diagnostic before driving input.

```bash
hoody --container "$C" display info --display-id 1 -o json
hoody --container "$C" display input geometry --display-id 1 -o json
```
Note: the geometry returned is the underlying Xvfb canvas (often `8192x4096` for Hoody Xpra sessions), not a physical monitor size. Click coordinates are in this canvas space.

### 10. Reset stuck modifiers / buttons after a misfired drag

**Goal:** after an aborted drag or a `hoody display keyboard key-down` you forgot to release, the X server still thinks Shift / Ctrl / Button-1 is held. Symptom: every subsequent click acts as Shift-click; typed letters arrive uppercase. `hoody display input reset` releases everything in one call.

```bash
hoody --container "$C" display input reset --display-id 1
```
Safe to call any time, even when nothing is stuck. Pair it with the start of every new automation run as a defensive default.

## Reference

### `hoody display` (48) — Display control — screenshots, input, windows, clipboard

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody display access` |  | read | Access the HTML5 Display client interface | `display.accessClient` | `hoody display access --display-id 10 --decorations --toolbar --menu --maximize-new-windows --readonly --dark-mode --node node-abc --project-id abc-123 --container-id abc-123 --url-display-id abc-123 --ssl --webtransport --path / --action connect --display :0 --encoding auto --offscreen --bandwidth-limit 0 --override-width auto --override-height auto --vrefresh=-1 --suspend-inactive-tab --sound --audio-codec <audio_codec> --keyboard --keyboard-layout us --swap-keys --clipboard --clipboard-preferred-format text/plain --clipboard-poll --printing --file-transfer --video --mediasource-video --open-url --notification-server-url https://example.com --web-notifications --display-notifications --notification-connection-type websocket --sharing --steal --reconnect --floating-menu --clock --scroll-reverse-y auto --scroll-reverse-x --title-show-hoody --title-show-display-id --app firefox --remote-logging --insecure --debug-main --debug-keyboard --debug-geometry --debug-mouse --debug-clipboard --debug-draw --debug-audio --debug-network --debug-file` |
| `hoody display clipboard get` |  | read | Read clipboard text | `display.getClipboard` | `hoody display clipboard get --display-id 10 --selection clipboard` |
| `hoody display clipboard set` |  | write | Write clipboard text | `display.setClipboard` | `hoody display clipboard set --display-id 10 --text "Hello" --selection clipboard` |
| `hoody display health` |  | read | Service health check | `display.health.check` | `hoody display health` |
| `hoody display info` |  | read | Get display information and screenshots | `display.getInformation` | `hoody display info --display-id 10` |
| `hoody display input act` |  | write | Execute one action with optional screenshot | `display.input.act` | `hoody display input act --display-id 10 --action <action> --params <key=value> --screenshot --screenshot-delay 100 --screenshot-region <screenshot_region>` |
| `hoody display input batch` |  | write | Execute a sequence of actions | `display.input.batch` | `hoody display input batch --display-id 10` |
| `hoody display input click-at` |  | write | Move cursor and click | `display.input.clickAt` | `hoody display input click-at --display-id 10 --x 10 --y 10 --button 1` |
| `hoody display input drag` |  | write | Drag from one position to another | `display.input.drag` | `hoody display input drag --display-id 10 --start-x 10 --start-y 10 --end-x 10 --end-y 10 --button 1 --steps 10` |
| `hoody display input geometry` |  | read | Get display dimensions | `display.input.geometry` | `hoody display input geometry --display-id 10` |
| `hoody display input reset` |  | write | Emergency release all inputs | `display.input.reset` | `hoody display input reset --display-id 10` |
| `hoody display input select` |  | write | Select a range via click + shift-click | `display.input.select` | `hoody display input select --display-id 10 --x 10 --y 10 --end-x 10 --end-y 10` |
| `hoody display input type-at` |  | write | Move, click, and type in one operation | `display.input.typeAt` | `hoody display input type-at --display-id 10 --x 10 --y 10 --text "Hello" --delay 10` |
| `hoody display input wait` |  | write | Wait for a duration with optional screenshot | `display.input.wait` | `hoody display input wait --display-id 10 --ms 100 --screenshot` |
| `hoody display keyboard key` |  | write | Press key combinations | `display.input.keyboardKey` | `hoody display keyboard key --display-id 10 --keys <keys> --window 100 --delay 10 --clear-modifiers` |
| `hoody display keyboard key-down` |  | write | Hold a key down | `display.input.keyboardKeyDown` | `hoody display keyboard key-down --display-id 10 --key <key> --window 100 --hold-ms 100` |
| `hoody display keyboard key-up` |  | write | Release a held key | `display.input.keyboardKeyUp` | `hoody display keyboard key-up --display-id 10 --key <key> --window 100` |
| `hoody display keyboard type` |  | write | Type a string of text | `display.input.keyboardType` | `hoody display keyboard type --display-id 10 --text "Hello" --window 100 --delay 10 --clear-modifiers` |
| `hoody display mouse click` |  | write | Click a mouse button | `display.input.mouseClick` | `hoody display mouse click --display-id 10 --button 1 --repeat 1 --delay 10 --window 100` |
| `hoody display mouse double-click` |  | write | Double-click a mouse button | `display.input.mouseDoubleClick` | `hoody display mouse double-click --display-id 10 --button 1 --window 100` |
| `hoody display mouse down` |  | write | Press and hold a mouse button | `display.input.mouseDown` | `hoody display mouse down --display-id 10 --button 1 --window 100 --hold-ms 100` |
| `hoody display mouse location` |  | read | Get cursor position | `display.input.mouseLocation` | `hoody display mouse location --display-id 10` |
| `hoody display mouse move` |  | write | Move cursor to absolute position | `display.input.mouseMove` | `hoody display mouse move --display-id 10 --x 10 --y 10 --window 100 --screen 10 --sync` |
| `hoody display mouse move-relative` |  | write | Move cursor by offset | `display.input.mouseMoveRelative` | `hoody display mouse move-relative --display-id 10 --x 10 --y 10 --sync` |
| `hoody display mouse scroll` |  | write | Scroll in a direction | `display.input.mouseScroll` | `hoody display mouse scroll --display-id 10 --direction up --clicks 5` |
| `hoody display mouse up` |  | write | Release a mouse button | `display.input.mouseUp` | `hoody display mouse up --display-id 10 --button 1 --window 100` |
| `hoody display open` | browse | action | Open the Display kit service in your browser |  | `hoody display open [index] [--decorations]` |
| `hoody display screenshots by-timestamp` |  | read | Retrieve a specific screenshot by timestamp | `display.screenshots.getByTimestamp` | `hoody display screenshots by-timestamp 1750000000 --base64 --display-id 10` |
| `hoody display screenshots capture` |  | read | Capture a new screenshot | `display.screenshots.capture` | `hoody display screenshots capture --base64 --display-id 10` |
| `hoody display screenshots capture-metadata` |  | read | Capture screenshot and return metadata only | `display.screenshots.captureMetadata` | `hoody display screenshots capture-metadata --display-id 10` |
| `hoody display screenshots latest` |  | read | Retrieve the most recent screenshot | `display.screenshots.getLatest` | `hoody display screenshots latest --base64 --display-id 10` |
| `hoody display screenshots latest-metadata` |  | read | Get metadata for the most recent screenshot | `display.screenshots.getLatestMetadata` | `hoody display screenshots latest-metadata --display-id 10` |
| `hoody display screenshots list` |  | read | List all available screenshots | `display.listScreenshots` | `hoody display screenshots list --display-id 10` |
| `hoody display thumbnails by-timestamp` |  | read | Retrieve a specific thumbnail by timestamp | `display.thumbnails.getByTimestamp` | `hoody display thumbnails by-timestamp 1750000000 --base64 --display-id 10` |
| `hoody display thumbnails capture` |  | read | Capture a new screenshot thumbnail | `display.thumbnails.capture` | `hoody display thumbnails capture --base64 --display-id 10` |
| `hoody display thumbnails latest` |  | read | Retrieve the most recent thumbnail | `display.thumbnails.getLatest` | `hoody display thumbnails latest --base64 --display-id 10` |
| `hoody display windows active` |  | read | Get the active window ID | `display.input.windowActive` | `hoody display windows active --display-id 10` |
| `hoody display windows close` |  | write | Close a window | `display.input.windowClose` | `hoody display windows close --display-id 10 --window-id 100` |
| `hoody display windows focus` |  | write | Focus/activate a window | `display.input.windowFocus` | `hoody display windows focus --display-id 10 --window-id 100` |
| `hoody display windows geometry` |  | read | Get window position and size | `display.input.windowGeometry` | `hoody display windows geometry 1 --display-id 10` |
| `hoody display windows list` |  | read | List windows on the current display | `display.listWindows` | `hoody display windows list --display-id 10 --only-visible` |
| `hoody display windows minimize` |  | write | Minimize a window | `display.input.windowMinimize` | `hoody display windows minimize --display-id 10 --window-id 100` |
| `hoody display windows move` |  | write | Move a window | `display.input.windowMove` | `hoody display windows move --display-id 10 --window-id 100 --x 10 --y 10 --sync --relative` |
| `hoody display windows name` |  | read | Get window title | `display.input.windowName` | `hoody display windows name 1 --display-id 10` |
| `hoody display windows properties` |  | read | Get extended properties for a window | `display.getWindowProperties` | `hoody display windows properties 1 --display-id 10` |
| `hoody display windows raise` |  | write | Raise a window to the top | `display.input.windowRaise` | `hoody display windows raise --display-id 10 --window-id 100` |
| `hoody display windows resize` |  | write | Resize a window | `display.input.windowResize` | `hoody display windows resize --display-id 10 --window-id 100 --width 10 --height 10 --sync --use-hints` |
| `hoody display windows search` |  | write | Search for windows by pattern | `display.input.windowSearch` | `hoody display windows search --display-id 10 --pattern "TODO" --name --class --classname --only-visible` |


---

<!-- ===== namespace: exec ===== -->

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To make a script **public**: create a `hoody proxy create` — get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` leak in the URL. Layer Password / Token / JWT / IP gates via `proxyPermissionsContainer.*` exactly like any other kit URL.

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

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `hoody exec scripts write`.
- **`require('hoody-sdk')` works with no install step** — the runtime auto-installs any `require()`d npm package on first execution (it is not pre-injected or bundled). Import from `'hoody-sdk'` (NOT `'hoody-sdk'`). The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the Hoody Proxy — no localhost bypass — so all the usual capability gates / request hooks / proxy logs apply (see § No local bypass in `SKILL-CLI.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out: `Bun.$\`hoody projects list\`` from the same script works end-to-end.

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

1. `hoody exec packages check` → `hoody exec packages add-modules` → `hoody exec packages pin`.
2. `hoody exec validate script` + `hoody exec validate magic-comments` (`// @description`, `// @cors`, `// @timeout`).
3. `hoody exec scripts write` (auto-validates unless `validate:false`).
4. `hoody exec system cache-clear` — drop compiled cache; ephemeral runtime, no state across recompiles.

### 3. Debug + OpenAPI

1. `hoody exec logs list` / `hoody exec logs search` / `hoody exec logs read` (streamed `--lines`/`--tail`).
2. `hoody exec system active-requests` / `hoody exec system stats` / `hoody exec scripts performance`.
3. `hoody exec scripts list-user` → `hoody exec openapi generate` → `hoody exec openapi merge` → `hoody exec openapi serve` → `hoody exec validate user-schema`.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. The stored file is ALWAYS kept verbatim; the pattern-normaliser rewrites the code at load time on every request, independent of `validate`.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `hoody exec scripts delete` needs literal `confirm=true`.
- `hoody exec scripts write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `hoody containers proxy discovery services list` returning `[]` is normal.
- `hoody exec scripts write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every script gets pre-injected globals: `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`, default model **`hoody-ai/hoody-free`**). **No `require()`, no base URL, and no API key** — the key auto-defaults to `container-<hash>` and is a usage-tracking tag, NOT auth, so you specify nothing. **The default model is the free tier: it costs nothing and needs no wallet credit, so a script with no `// @ai-model` line runs on a brand-new account.** Overriding it with a catalog model (`GET https://api.hoody.com/api/v1/ai/models`) bills the wallet and is **refused outright** while `ai_limit` is `0.00` — check `GET /api/v1/wallet/balances/ai` before you name one. Override per-script with magic comments (`// @ai-model minimax/minimax-m3` — paid, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — recheck `safePath`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`hoody exec system restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Every step in every example was live-tested against a real `exec-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST {KIT}/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when syntax + TS-transpile + dependency-check + magic-comment parse all pass.

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
**Step 3 — read it back.** `hoody exec scripts read` returns the literal content + parsed `magicComments` + metadata.

```bash
hoody --container "$C" exec scripts read --path echo.js -o json | jq .content
```
### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `hoody curl exec` / SDK calls.

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
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
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
**Step 2 — fire a signed request.** The Bun `req.body` is an *object* if Content-Type was JSON, so re-serialise before HMAC'ing on both sides for byte-stable signing.

### 4. Pin npm deps — `hoody exec packages check` → `hoody exec packages add-modules` → `hoody exec packages pin`

**Goal:** add `lodash` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```bash
hoody --container "$C" exec packages check --code 'const _ = require("lodash");'
```
**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"lodash@4.17.21"`).

```bash
hoody --container "$C" exec packages add-modules --modules lodash
```
**Step 3 — pin to exact versions** (drops the leading `^`/`~`).

```bash
hoody --container "$C" exec packages pin --packages '["lodash"]'   # --packages takes a JSON array blob today; repeatable scalar flags planned
```
### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```bash
CODE='// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });'
hoody --container "$C" exec validate script --code "$CODE"
hoody --container "$C" exec validate magic-comments --code "$CODE"
```
If `valid:true`, ship it via `hoody exec scripts write` (default `validate:true` will re-run the same checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies,magicComments}` slots tell you exactly which checker rejected it.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry (and inferred request/response shapes from any handler-attached schema) in a single OpenAPI 3.0 document the proxy can serve.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```bash
hoody --container "$C" exec scripts list-user
```
**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```bash
hoody --container "$C" exec openapi serve --format json > /tmp/user-scripts.openapi.json
```
**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `hoody exec openapi merge`. `hoody exec openapi generate` rebuilds the on-disk spec from current scripts; `hoody exec validate user-schema` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `hoody exec logs list` returns kit-wide log files; `hoody exec logs read` slices a specific one.

```bash
hoody --container "$C" exec logs list
hoody --container "$C" exec logs read --file "$LOGNAME"   # from `exec logs list` → .logs[].name --lines 200 --tail
hoody --container "$C" exec logs stream --file "$LOGNAME"   # from `exec logs list` → .logs[].name --follow true
```
Access logging is ON by default (`@log-level` defaults to `standard`); the magic comments opt *out* — `// @log-level none` disables it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `hoody exec system stats` is a single snapshot; `hoody exec system active-requests` lists in-flight HTTP/WS; `hoody exec scripts performance` aggregates by script.

```bash
hoody --container "$C" exec system stats
hoody --container "$C" exec system active-requests
hoody --container "$C" exec scripts performance --body '{}'
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

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log; `res.json` is what an HTTP `hoody exec schedules trigger` call returns.

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
**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, and the absolute on-disk `scriptPath` you'll need to trigger it.

```bash
hoody --container "$C" exec schedules list
```
**Step 3 — fire it on demand.** `scriptPath` accepts either the absolute path returned in step 2 OR a path relative to the kit's scripts dir (the handler resolves relative paths against `scriptDir`). `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only.

```bash
hoody --container "$C" exec schedules trigger \
  --script-path /hoody/storage/hoody-exec/scripts/default/1/tick.js --force
hoody --container "$C" exec schedules history --limit 5
```
**Stop the schedule** by deleting the script (`scripts.delete?path=tick.js&confirm=true`) or by editing the file to remove the `// @schedule` directive and calling `hoody exec schedules reload`.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. The runtime pre-injects `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key auto-defaults to `container-<hash>` (a usage-tracking tag, not auth). Default model is **`hoody-ai/hoody-free`**, the free tier — no wallet credit needed, so the script below works on a brand-new account with `ai_limit: "0.00"`. Override per-script with `// @ai-model <provider/model>` **only when you need a paid catalog model and have confirmed the wallet has AI credit**, and set a system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```bash
SUM=$(cat <<'JS'
// @description One-line summary via built-in Hoody AI (no key/setup, free model by default)
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

For structured output use `ai.object({ schema, prompt })` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`.

## Reference

### `hoody exec` (66) — Script execution and templates

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody exec health` |  | read | Health Check | `exec.health.check` | `hoody exec health` |
| `hoody exec logs clear` |  | destructive | Clear Logs | `exec.logs.clear` | `hoody exec logs clear --file /home/user/file.txt --type default --older-than-days <older_than_days> --confirm <confirm>` |
| `hoody exec logs list` |  | read | List Logs | `exec.logs.list` | `hoody exec logs list --type default --limit 10` |
| `hoody exec logs read` |  | read | Read Log | `exec.logs.read` | `hoody exec logs read --file /home/user/file.txt --execution-id abc-123 --lines 100 --tail --search "my search"` |
| `hoody exec logs search` |  | read | Search Logs | `exec.logs.search` | `hoody exec logs search --query "my search" --regex <regex> --files <files> --limit 1000 --case-sensitive` |
| `hoody exec logs stream` |  | read | Stream Logs | `exec.logs.stream` | `hoody exec logs stream --file /home/user/file.txt --follow <follow>` |
| `hoody exec magic-comments bulk-update` |  | write | Bulk Update Magic Comments | `exec.magic.bulkUpdate` | `hoody exec magic-comments bulk-update --directory /home/user/src --exec-id abc-123 --comments <comments> --extension .ts --recursive --dry-run` |
| `hoody exec magic-comments read` |  | read | Read Magic Comments | `exec.magic.read` | `hoody exec magic-comments read --path /home/user/file.txt` |
| `hoody exec magic-comments schema` |  | read | Get Magic Comments Schema | `exec.magic.getSchema` | `hoody exec magic-comments schema` |
| `hoody exec magic-comments update` |  | write | Update Magic Comments Handler | `exec.magic.updateHandler` | `hoody exec magic-comments update --path /home/user/file.txt --comments <comments> --dry-run` |
| `hoody exec namespaces list` |  | read | List All Exec Ids | `exec.ids.list` | `hoody exec namespaces list` |
| `hoody exec open` |  | action | Open the Exec kit service (script runner UI) in your browser |  | `hoody exec open [index] [--url]` |
| `hoody exec openapi generate` |  | action | Generate User Open A P I | `exec.openapi.generate` | `hoody exec openapi generate --body '{}'` |
| `hoody exec openapi merge` |  | write | Merge Open A P I Specs | `exec.openapi.merge` | `hoody exec openapi merge --body '{}'` |
| `hoody exec openapi serve` |  | read | Serve Generated Spec | `exec.openapi.serve` | `hoody exec openapi serve --dir scripts --directory /home/user/src --format json --subdomain my-app --exec-id abc-123` |
| `hoody exec openapi serve-schema` |  | read | Serve Schema File | `exec.openapi.serveSchema` | `hoody exec openapi serve-schema --file /home/user/file.txt --path /home/user/file.txt` |
| `hoody exec packages add-modules` |  | write | Install Dependencies | `exec.dependencies.install` | `hoody exec packages add-modules --modules <modules> --force` |
| `hoody exec packages check` |  | read | Check Dependencies | `exec.dependencies.check` | `hoody exec packages check --code <code> --modules <modules>` |
| `hoody exec packages compare` |  | read | Compare Packages | `exec.package.compare` | `hoody exec packages compare --body '{}'` |
| `hoody exec packages install` |  | write | Install Packages | `exec.package.install` | `hoody exec packages install --packages <packages> --dev --save --force` |
| `hoody exec packages json init` |  | write | Init Package Json | `exec.package.initJson` | `hoody exec packages json init --name hoody-exec-project --version 1.0.0 --description "Hoody Exec project" --force` |
| `hoody exec packages json read` |  | read | Read Package Json | `exec.package.readJson` | `hoody exec packages json read` |
| `hoody exec packages json update` |  | write | Update Package Json | `exec.package.updateJson` | `hoody exec packages json update --dependencies <dependencies> --scripts <scripts> --remove <remove>` |
| `hoody exec packages list` |  | read | List Bundled Dependencies | `exec.dependencies.listBundled` | `hoody exec packages list` |
| `hoody exec packages pin` |  | write | Pin Versions | `exec.package.pinVersions` | `hoody exec packages pin --packages <packages>` |
| `hoody exec routes discover` |  | read | Discover Routes | `exec.route.discover` | `hoody exec routes discover --base-dir <base_dir> --include-metadata` |
| `hoody exec routes resolve` |  | read | Resolve Route | `exec.route.resolve` | `hoody exec routes resolve --body '{}'` |
| `hoody exec routes test` |  | read | Test Route | `exec.route.test` | `hoody exec routes test --body '{}'` |
| `hoody exec schedules history` |  | read | Schedule History | `exec.schedules.scheduleHistory` | `hoody exec schedules history --script-path /home/user/file.txt --since 2026-01-01T00:00:00Z --limit 100 --include-rotated` |
| `hoody exec schedules list` |  | read | List Schedules | `exec.schedules.listSchedules` | `hoody exec schedules list` |
| `hoody exec schedules reload` |  | action | Reload Schedules | `exec.schedules.reloadSchedules` | `hoody exec schedules reload --dry-run` |
| `hoody exec schedules trigger` |  | action | Trigger Schedule | `exec.schedules.triggerSchedule` | `hoody exec schedules trigger --script-path /home/user/file.txt --force` |
| `hoody exec scripts delete` |  | destructive | Delete Script | `exec.scripts.delete` | `hoody exec scripts delete --path /home/user/file.txt --confirm <confirm> --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts list` |  | read | List Scripts (system scripts only — see `scripts list-user` for user scripts) | `exec.scripts.list` | `hoody exec scripts list --dir <dir> --filter <filter> --metadata '{}' --label my-label --tags "tag1,tag2" --mode stable --enabled true --websocket <websocket> --recursive true --include-comments <include_comments> --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts list-user` |  | read | List User Scripts | `exec.openapi.listScripts` | `hoody exec scripts list-user --directory scripts --dir <dir> --subdomain my-app --exec-id abc-123` |
| `hoody exec scripts move` |  | write | Move Script | `exec.scripts.move` | `hoody exec scripts move --exec-id abc-123 --subdomain my-app --from <from> --to <to> --overwrite` |
| `hoody exec scripts performance` |  | read | Get Script Performance | `exec.monitor.getScriptPerformance` | `hoody exec scripts performance --body '{}'` |
| `hoody exec scripts read` |  | read | Read Script | `exec.scripts.read` | `hoody exec scripts read --path /home/user/file.txt --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts tree` |  | read | Get Script Tree | `exec.scripts.getTree` | `hoody exec scripts tree --exec-id abc-123 --subdomain my-app --base-dir <base_dir> --max-depth 10 --include-metadata` |
| `hoody exec scripts write` |  | write | Write Script | `exec.scripts.write` | `hoody exec scripts write --exec-id abc-123 --subdomain my-app --path /home/user/file.txt --content "Hello" --create-dirs --validate` |
| `hoody exec sdks delete` |  | destructive | Delete S D K | `exec.sdk.delete` | `hoody exec sdks delete --id abc-123` |
| `hoody exec sdks get` |  | read | Get S D K | `exec.sdk.get` | `hoody exec sdks get --id abc-123` |
| `hoody exec sdks import` |  | write | Import S D K | `exec.sdk.importSDK` | `hoody exec sdks import --exec-id abc-123 --source-url https://example.com --source-auth <source_auth> --middleware <middleware> --magic-comments <magic_comments> --force` |
| `hoody exec sdks list` |  | read | List S D Ks | `exec.sdk.list` | `hoody exec sdks list` |
| `hoody exec state clear` |  | destructive | Clear Shared State | `exec.state.clear` | `hoody exec state clear --hostname example.com --path /home/user/file.txt --clear-all` |
| `hoody exec state get` |  | read | Get Shared State | `exec.state.get` | `hoody exec state get --hostname example.com --path /home/user/file.txt` |
| `hoody exec state set` |  | write | Set Shared State | `exec.state.set` | `hoody exec state set --hostname example.com --path /home/user/file.txt --value "hello" --merge` |
| `hoody exec system active-requests` |  | read | Get Active Requests | `exec.monitor.getActiveRequests` | `hoody exec system active-requests` |
| `hoody exec system cache-clear` |  | destructive | Clear Cache | `exec.cache.clear` | `hoody exec system cache-clear --hostname example.com --script-path /home/user/file.txt --clear-vm --clear-state --clear-all` |
| `hoody exec system prometheus` |  | read | Prometheus Export | `exec.monitor.prometheusExport` | `hoody exec system prometheus` |
| `hoody exec system restart` |  | destructive | Restart Server | `exec.system.restartServer` | `hoody exec system restart --graceful --drain-timeout-ms 5000 --reason "API restart request"` |
| `hoody exec system restart-status` |  | read | Get Restart Status | `exec.system.getRestartStatus` | `hoody exec system restart-status` |
| `hoody exec system stats` |  | read | Get Stats | `exec.monitor.getStats` | `hoody exec system stats` |
| `hoody exec templates create` | new, add | write | Create Custom Template | `exec.templates.createCustom` | `hoody exec templates create --body '{}'` |
| `hoody exec templates delete` |  | destructive | Delete Custom Template | `exec.templates.deleteCustom` | `hoody exec templates delete --name my-resource` |
| `hoody exec templates generate` |  | action | Generate From Template | `exec.templates.generate` | `hoody exec templates generate --name my-resource --variables <variables> --output-path /home/user/file.txt --save-file` |
| `hoody exec templates list` |  | read | List Templates | `exec.templates.list` | `hoody exec templates list --category general --include-builtin --include-custom` |
| `hoody exec templates preview` |  | read | Preview Template | `exec.templates.preview` | `hoody exec templates preview --name my-resource --variables <variables>` |
| `hoody exec templates update` |  | write | Update Custom Template | `exec.templates.updateCustom` | `hoody exec templates update --name my-resource --code <code>` |
| `hoody exec validate dependencies` |  | read | Validate Dependencies | `exec.validate.validateDependencies` | `hoody exec validate dependencies --code <code>` |
| `hoody exec validate magic-comments` |  | read | Validate Magic Comments | `exec.validate.validateMagicComments` | `hoody exec validate magic-comments --code <code>` |
| `hoody exec validate return-type` |  | read | Validate Return Type | `exec.validate.validateReturnType` | `hoody exec validate return-type --type-definition <type_definition> --value "hello"` |
| `hoody exec validate script` |  | read | Validate Script | `exec.validate.validateScript` | `hoody exec validate script --code <code>` |
| `hoody exec validate syntax` |  | read | Validate Syntax | `exec.validate.validateSyntax` | `hoody exec validate syntax --code <code>` |
| `hoody exec validate types` |  | read | Validate Type Script | `exec.validate.validateTypeScript` | `hoody exec validate types --code <code>` |
| `hoody exec validate user-schema` |  | read | Validate User Schema | `exec.openapi.validateSchema` | `hoody exec validate user-schema --body '{}'` |


---

<!-- ===== namespace: files ===== -->

# `files` — container filesystem over HTTP, with automatic Git-like change history

## Purpose

**Default surface: the container's own filesystem, exposed over HTTP — with optional automatic mutation journaling when the kit is started with `--journal-path`.** Read, write, copy, move, delete, stat, chmod, list, glob, grep, archive-preview/extract, fetch URLs into the FS, resumable upload — all on absolute container paths (`/workspace/main.py`, `/etc/hostname`, `/hoody/databases/foo.db`). No backend flag needed.

**Headline feature when journaling is on — automatic change history (think Git, but for every file write).** With the journal enabled, every `PUT` / `PATCH` / `DELETE` / `MOVE` / `COPY` is appended to a per-container mutation log: monotonic sequence number, timestamp, path, op, size, hash. **You never lose a previous version of a journaled path.** The journal lets you:

- **Time-travel a single file** — `hoody files get` `?revision=<seq>` or `?at=<unix-ms>` returns the bytes as they were at that point.
- **List a file's history** — `hoody files get` `?history=1` walks every revision of the path.
- **Diff between revisions** — `hoody files get` `?diff=1&from_seq=<N>` returns a unified diff between revision `N` and current.
- **Replay / audit** — `hoody files journal query` `?path=<p>&after_id=<seq>` streams every operation since seq `N`. Run `hoody files journal flush` to force-persist before querying for the absolute latest.
- **Cross-replicate** — pipe the journal into another container as an event source for mirroring / fan-out / append-only sync.

When provisioned with `--journal-path`, no per-write setup is needed — every covered write is recorded (add `--allow-journal` to expose the journal query endpoints — history, revision, diff, stats, flush — over the API). Treat it as "always-on undo for the whole filesystem." Journaling is ON in the standard `hoody_kit: true` container image; raw kit deployments without those flags will accept writes but skip recording.

**Optional add-ons (per-request, opt-in):**
- **Remote backends** — append `?backend=<id>` (or `?type=<rclone-type>`) to operate against any of the 60+ rclone backend types you've connected (Mega, SFTP, S3, GDrive, Dropbox, Backblaze B2, WebDAV, Git, …) instead of the local FS. Requires `--allow-remote` server-side flag. Note: the journal records local-FS mutations; remote-backend ops go to the remote and aren't replayable from the journal.
- **FUSE mounts** — `hoody files mounts create` to surface a remote backend AS a path in the local FS. Same `--allow-remote` requirement.
- **chmod / chown** — Unix-only, requires `--allow-chmod` / `--allow-chown` server flags.

## When to use

- **Local container FS (the 90% case)** — CRUD, archive entry / extract, cross-binary search (glob, grep), download a URL into a path, resumable upload. Local works out of the box.
- **Recover / inspect a previous version of any file** — `?history=1`, `?revision=<seq>`, `?at=<unix-ms>`, `?diff=1&from_seq=<N>`. Always available because every write is journaled.
- **Audit / replay every change to the filesystem** — `hoody files journal query` for the full event stream (sequence, timestamp, path, op, size, hash).
- **Remote cloud / SSH / S3 / Git** — append `?backend=<id>` on `hoody files get` / `hoody files put` / `hoody files delete` / `hoody files modify-properties` / `hoody files operation` calls (the methods that accept a `backend` option). The same endpoints transparently target the remote.
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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Read, search, write

1. `hoody files get` `?stat`/`?lines=10-50`.
2. `hoody files glob` `?pattern=**/*.ts`; `hoody files grep` `?pattern=TODO&context=2` (local only).
3. `hoody files put` `?append=true`; `hoody files delete`.

### 2. Download, extract, FUSE-mount

1. `hoody files downloads url` `GET /{dir}?download=<url>`; `hoody files downloads active` to poll.
2. `hoody files archive preview` `?preview`; `hoody files extractions create` `?extract=src/**&dest=work-src` (`?dest=` MUST be relative).
3. `hoody files backends connect s3` (60+ `connect*`) -> `hoody files get` for one-shot reads OR `hoody files mounts create` -> `hoody files dir` for a regular FS view -> `hoody files mounts unmount`/`hoody files backends disconnect`. (`hoody files dir` itself has no `backend` option; `hoody files get`/`hoody files put`/`hoody files delete` do.)

### 3. Journal time-travel + TUS-like upload

1. `hoody files get` `?history=1`, `?revision=N`/`?at=<unix-ms>`, `?diff=1&from_seq=<N>`.
2. `hoody files journal query` `?path=<p>&after_id=<seq>`; `hoody files journal flush` first.
3. Resumable: `PUT /{path}` first chunk, then `PATCH /{path}` `X-Update-Range: append` per chunk.

## Quirks & gotchas

- Reserved sub-prefixes (stat, chmod, chown, realpath, glob, grep, copy, move, append) dispatch by URL prefix in `api/files.rs`, each scoped to a specific HTTP method (stat/grep/glob/realpath→GET, chmod/chown→PATCH, copy/move→POST, append→PUT) to prevent method bleeding -- so `DELETE /api/v1/files/stat/foo` does NOT trigger the stat dispatcher; it removes the literal path `/stat/foo`. (`/api/v1/files/health` is intercepted by a separate top-level route in `api/mod.rs:106` before this dispatcher sees it.)
- `hoody files glob`/`hoody files grep`/`hoody files realpath`/`?lines=` local-only; `?backend=` -> 400.
- `?backend=` and `?type=` need `--allow-remote`.
- `hoody files chmod`/`hoody files chown` Unix-only + `--allow-chmod`/`--allow-chown`.
- WebDAV verbs on `/{path}`: PROPFIND, PROPPATCH, MKCOL, COPY, MOVE, LOCK, UNLOCK, CHECKAUTH, LOGOUT.
- Cross-host propagation is SSHFS-only via `/external/...`.
- `hoody files realpath` follows symlinks even where blocked.
- **Resumable upload PATCH must use the WebDAV root route (`PATCH /{path}`), NOT `PATCH /api/v1/files/{path}`** — the api/v1 PATCH expects a JSON body and rejects raw bytes with `400 Invalid JSON body`. The WebDAV form takes `X-Update-Range: append` — or an HTTP-Range offset `bytes=<start>-<end>` (a Content-Range-style `/<size>` suffix is REJECTED with `400 Invalid X-Update-Range Header`) — plus the raw body, and returns `204 No Content` on success. An explicit offset must fall INSIDE the current file, so it can only overwrite, never extend past EOF; use `hoody files append` to extend. [live-verified]
- **Archive `?dest=` MUST be relative** (e.g. `?dest=extracted`), not absolute — sending `?dest=/abs/path` returns `400 Absolute destination path not allowed`. The directory is created relative to the archive's containing dir. [live-verified]
- **`?preview` query value matters** — pass `?preview` empty (no `=…`) for a full archive listing; `?preview=true` is parsed as the entry name `true` and returns `404 Entry not found in archive: true`. Same trap on `?contents`. [live-verified]
- **Bare `?extract_file=` is unhandled by the kit's GET dispatcher** — the request falls through to "send the raw archive file" and you get the **whole archive's bytes**, not the selected entry. The generated SDK and CLI work around this by ALSO sending `?extract=` — when both query params are present, the `hoody files extractions create` branch runs (writes to disk under `?dest=`). The OpenAPI-only `?extract_file=` form is effectively dead.
- **Journal default `max_file_size` is 2 MiB; oversized files still produce a journal entry with hash + size, but the body bytes are not stored**.
- **`journal.is_excluded(<relative-path>)` gates which paths are recorded.** Built-in dev-dir excludes (`node_modules`, `target`, `.next`, `.nuxt`, `.svelte-kit`, `.turbo`, `__pycache__`, `.venv`, `venv`, `env`, `__pypackages__`, `.tox`, `.nox`, `bower_components`, …) skip journaling unless you pass `--no-journal-ignore-dev-dirs`. `.git` is always excluded regardless of that flag (separate hardcoded check, not part of the toggleable list). Custom excludes via `--journal-exclude`. This is why "I wrote to `node_modules/x` and saw no journal entry" is expected.
- **Journal does NOT cover everything by default.** Live behaviour observed: a fresh `PUT` (create) and an overwriting `PUT` (write) on `/home/user/...` produce entries; URL downloads (`?download=`) and archive extraction are NOT journaled — those write through paths with no journal hook. `hoody files chmod`, `hoody files chown`, `hoody files touch`, `?append=true` and copy/move ARE recorded. Always call `hoody files journal flush` then `hoody files journal query` (or `?history=1`) to inspect what was actually recorded — don't assume coverage. [live-verified]
- **Built-in dev-dir exclude list always skips journaling** for `node_modules`, `__pycache__`, `.venv`, `target`, `.next`, `.nuxt`, etc. — even on `/home/user/...` paths. Disable these with `--no-journal-ignore-dev-dirs` at kit start. `.git` is hardcoded to ALWAYS be excluded and stays excluded even with `--no-journal-ignore-dev-dirs`.
- **`/tmp/...` paths appear NOT to be journaled** at all (live-verified — 0 entries for `/tmp/files-examples-*` writes). Use `/home/user/...` (or another non-`/tmp` path) when you need history.
- **`HEAD /api/v1/files/{path}` returns `405`**; the `hoody files metadata` operation in mappings is the WebDAV-style `HEAD /{path}` route (no `/api/v1/files/` prefix). Use `hoody files stat` (`GET /api/v1/files/stat/{path}`) for a JSON envelope instead. [live-verified]
- **`hoody files chown` to root is rejected** with `400 Cannot change ownership to root (UID 0)` (owner) or `400 Cannot change group to root (GID 0)` (group) — even if the kit has `--allow-chown`. Use a non-root user (`nobody`, `user`, …). [live-verified]
- **FUSE mount paths are confined to a configured mount-dir** (`/hoody/mounts` by default); arbitrary paths return `400 Mount path must be under the configured mount directory`. Override at kit start with `--mount-dir <path>`.
- **Listing-style query params (`?downloads`, `?download_history`, `?extractions`, `?extraction_history`) are honoured on the WebDAV root route, NOT on `/api/v1/files/...`** — calling `GET /api/v1/files/<dir>?downloads` returns a regular directory listing (the query is ignored). Use `GET /<dir>?downloads` (or `GET /?download_history` for the global feed). [live-verified]
- **`hoody-files` test container goes to sleep** between requests on a quiet kit; first hit may return `502` from the proxy with a `<!DOCTYPE html>…Error 502` body. Retry 2-3× with a few seconds backoff and the kit wakes up. [live-verified]
- **Mount the whole FS as a local drive on the USER's machine (client-side WebDAV).** Because the kit serves a WebDAV API at its URL root, the container's files mount natively as a drive/folder with no install: on **Windows** *Map network drive* to `https://{P}-{C}-files-1.{N}.containers.hoody.com/`, on **macOS** Finder → *Connect to Server* to the same URL; cross-platform/scripted, via `hoody mount <containerId> <localDir>` (WebDAV-backed remote mount; `--read-only`/`--background`/`--auth-token`/`--auth-password`/`--auth-ip` flags). This is the inverse of the server-side FUSE `hoody files mounts *` family (which mounts remote backends INTO the container).

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

Every step in every example was live-tested against a real `files-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. Paths under `/tmp/...` are NOT journaled by default — examples that need history use `/home/user/...`.

### 1. Read a file — full bytes, stat envelope, and a slice of lines

**Goal:** inspect an unknown text file three ways: get its metadata, peek the raw bytes, and slice an arbitrary line range without pulling the whole thing.

**Step 1 — stat first.** `hoody files stat` returns size, owner/group, octal permissions, mtime, plus a `revisions` count (how many journal entries exist for this path). Use this BEFORE downloading a file you don't know the size of.

```bash
hoody --container "$C" files stat /etc/hostname
```
**Step 2 — line slice.** `?lines=2-3` returns just lines 2 through 3 inclusive. Local-FS only (rejected with `400` when combined with `?backend=`).

```bash
hoody --container "$C" files get /var/log/syslog --lines 2-3
```
**Step 3 — full body.** No query params, raw bytes (or `Content-Type: application/octet-stream` for binaries).

```bash
hoody --container "$C" files get /etc/hostname > /tmp/hostname.txt
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
hoody --container "$C" files put /home/user/upload-test.bin < /tmp/chunk1.bin
```
**Step 2 — append remaining chunks.** Send `PATCH /<path>` (the WebDAV root route, NOT `/api/v1/files/...` — that one expects JSON and 400s on raw bytes). Header `X-Update-Range: append` says "concatenate". Returns `204 No Content`.

```bash
# _(no native `hoody files` shape)_ — `files patch` is not a raw-body command: its
# `--body` is an inline string with NO `@file` expansion, and `--input` is rejected.
# Use the HTTP form (`curl -X PATCH --data-binary @/tmp/chunk2.bin`) for this step.
hoody --container "$C" files stat /home/user/upload-test.bin
```
**Step 3 — same shape for resume after a network drop.** Re-append the missing chunk with `X-Update-Range: append` if you tracked the cursor client-side. An explicit `bytes=<start>-<end>` offset (no `/<total>` suffix — that is rejected) only overwrites INSIDE the existing file and cannot extend it, so it is not a resume mechanism. The generated **SDK and CLI currently expose only `X-Update-Range: append`**; explicit byte ranges need raw HTTP.

### 4. Time-travel a single file — history → revision N → diff

**Goal:** roll back a config file by reading an earlier revision, comparing it to current, then writing the chosen revision back. Journal tracks every PUT under `/home/user/...` (NOT `/tmp/...` — see Quirks).

**Step 1 — write two revisions.**

```bash
P=/home/user/config.toml
echo 'verbose = false' | hoody --container "$C" files put "$P"
sleep 1
echo 'verbose = true'  | hoody --container "$C" files put "$P"
hoody --container "$C" files journal flush
```
**Step 2 — list history.** `?history=1` returns the per-revision log: each entry has `seq`, `op` (`"create"` / `"write"` / `"delete"` / `"moved_from"`/`"moved_to"` / etc. — see Example 5 for the full enum), `ts`, hashes, and size deltas.

```bash
hoody --container "$C" files get "$P" --history -o json \
  | jq '.revisions[] | {seq, op, ts, size_after}'
```
**Step 3 — fetch revision N.** `?revision=1` returns the bytes of that point-in-time. (Use `?at=<unix-ms>` for an instant.)

```bash
hoody --container "$C" files get "$P" --revision 1
hoody --container "$C" files get "$P" --diff --from-seq 1
```
**Step 4 — restore by writing rev1 bytes back.** PUT the body returned by `?revision=1`.

### 5. Audit — stream every mutation since seq N via the journal

**Goal:** wire a SIEM / alerting pipeline. Get every FS mutation since the last cursor, including hashes for tamper detection. Don't forget `hoody files journal flush` first.

**Step 1 — flush so buffered journal writes are on disk.**

```bash
hoody --container "$C" files journal flush
```
**Step 2 — query since cursor.** `after_id` is the last `id` you've seen. `op` enum is `"create"` / `"write"` / `"append"` / `"delete"` / `"touch"` / `"moved_from"` / `"moved_to"` / `"copied_from"` / `"copied_to"` / `"dir_moved_from"` / `"dir_moved_to"` / `"dir_copied_from"` / `"dir_copied_to"` / `"dir_deleted"` / `"mkdir"` / `"chmod"` / `"chown"` / `"gap"` (no bare `"move"`/`"copy"` — use the directional `"moved_from"`/`"moved_to"` etc. pair).

```bash
hoody --container "$C" files journal query --after-id 0 --limit 200 -o json \
  | jq '{count, next: .next_after_id, entries}'
```
**Step 3 — health check.** Watch `hoody files journal stats` for `writer_healthy:false`, `parse_failures`, or `skipped_overflow > 0` — any of those means the audit trail is degraded.

```bash
hoody --container "$C" files journal stats
```
### 6. Download a URL straight into the FS (no curl, no wget needed)

**Goal:** pull an asset from the public internet into a container path. The kit handles the actual HTTP fetch — useful for sandboxed containers without outbound HTTP libs.

**Step 1 — fire-and-poll.** `GET /<directory>?download=<url>&filename=<name>` (URL-encode the URL). Returns a `download_id` for tracking.

```bash
hoody --container "$C" files downloads url /home/user/inbox \
  --download 'https://httpbin.org/robots.txt' --filename robots.txt --timeout 15
```
**Step 2 — list active.** `?downloads` ONLY works on the WebDAV root route — `GET /api/v1/files/<dir>?downloads` ignores the flag and returns a normal listing (live-verified).

```bash
hoody --container "$C" files downloads active /home/user/inbox --downloads
hoody --container "$C" files downloads history --download-history
```
### 7. Archive workflow — preview, then selective extract

**Goal:** extract just one subpath of a zip without unpacking the whole archive.

**Step 1 — preview** to see what's inside. `?preview` MUST be empty — `?preview=true` is parsed as the entry name `true` and 404s (live-verified).

```bash
hoody --container "$C" files archive preview /home/user/inbox/hello.zip --preview ''
```
**Step 2 — extract a subset.** `?extract=<glob>` selects entries (empty = all). `?dest=` MUST be relative — absolute paths return `400 Absolute destination path not allowed`. Destination is created relative to the archive's parent dir.

```bash
hoody --container "$C" files extractions create /home/user/inbox/hello.zip \
  --extract 'Hello-World-master/' --dest extracted
```
**Step 3 — extract a single file to disk.** Pass BOTH `?extract=<glob>` and `?extract_file=<path>` (the bare `?extract_file=` form falls through to "send whole archive"). The kit writes the matched entry under `?dest=` (or alongside the archive if omitted).

```bash
hoody --container "$C" files extractions extract-file /home/user/inbox/hello.zip \
  --extract Hello-World-master/README > /tmp/readme.txt
```
### 8. Cross-directory copy + move + chmod (a one-shot deploy)

**Goal:** stage a config in a working dir, copy to the target, set permissions, move the staging file to a backup folder. Uses POST against the copy/move reserved-prefix routes (`/api/v1/files/copy/...`, `/move/...`) and PATCH for chmod/chown (`/api/v1/files/chmod/...`, `/chown/...`).

**Step 1 — copy.** Both `copy_to` and (for move) `move_to` are **query params**, NOT body fields. Add `?overwrite=true` to allow replacing an existing destination.

```bash
hoody --container "$C" files copy /home/user/staging/app.toml \
  --copy-to /etc/myapp/app.toml --overwrite true
```
**Step 2 — chmod.** Octal as a query param (`?chmod=600`). Requires `--allow-chmod` at kit start; Unix-only.

```bash
hoody --container "$C" files chmod /etc/myapp/app.toml --chmod 600
```
**Step 3 — move staging → archive.** Same pattern as copy but no overwrite by default; `?move_to=` is required.

```bash
hoody --container "$C" files move /home/user/staging/app.toml \
  --move-to /home/user/archive/app.toml
```
### 9. Connect a remote backend, mount it as a path, list through both surfaces

**Goal:** attach a remote backend (here: `local` for portability — swap in `s3`/`sftp`/`drive` etc.) and surface it as a regular FS path via FUSE. Requires `--allow-remote` at kit start.

**Step 1 — connect.** Each backend has its own `POST /api/v1/backends/<type>` with type-specific config. Returns `{id, type, vfs_backend_type}`.

```bash
BID=$(hoody --container "$C" files backends connect local \
  --description local-passthrough -o json | jq -r '.id')   # CLI -o json unwraps the envelope → .id (not .data.id)
hoody --container "$C" files backends test "$BID"
```
**Step 2 — mount.** `mount_path` MUST sit under the kit's configured mount-dir (default `/hoody/mounts/...`) — arbitrary paths return `400 Mount path must be under the configured mount directory`.

```bash
MID=$(hoody --container "$C" files mounts create \
  --backend-id "$BID" --label local-mount \
  --mount-path /hoody/mounts/local-test -o json | jq -r '.id')   # CLI -o json unwraps the envelope → .id (not .data.id)
```
**Step 3 — read through the mount as a regular path.**

```bash
hoody --container "$C" files dir /hoody/mounts/local-test
```
**Step 4 — tear down** (in order: unmount, then disconnect).

```bash
hoody --container "$C" files mounts unmount "$MID"
hoody --container "$C" files backends disconnect "$BID"
```
### 10. Bulk delete a tree atomically — and verify nothing leaked

**Goal:** wipe a working directory and every file under it, then confirm via journal + listing that nothing remains.

**Step 1 — DELETE on the directory.** `DELETE /api/v1/files/<dir>` removes recursively. (Reserved-prefix trap: a path like `/api/v1/files/stat/foo` is interpreted as removing `/stat/foo`, NOT a stat call. Always use absolute container paths.)

```bash
hoody --container "$C" files delete /home/user/files-examples-cleanup
```
**Step 2 — verify.** A `404` from `hoody files stat` is what you want.

```bash
hoody --container "$C" files stat /home/user/files-examples-cleanup || echo "gone"
```
**Step 3 — confirm via journal.** A successful tree-delete emits `op: "delete"` (or `op: "dir_deleted"` per child). Flush first.

```bash
hoody --container "$C" files journal flush
hoody --container "$C" files journal query --path /home/user/files-examples-cleanup --limit 10
```

## Reference

### `hoody files` (117) — File operations and remote backends

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody files access ftp` |  | read | Access file via FTP | `files.ftp.access` | `hoody files access ftp /home/user/file.txt --type ftp --server srv-abc --user anonymous --pass <pass> --ftp-secure --ftp-passive` |
| `hoody files access s3` |  | read | Access file from S3 | `files.s3.access` | `hoody files access s3 /home/user/file.txt --type s3 --server srv-abc --s3-bucket <s3_bucket> --s3-region <s3_region> --user alice --pass <pass> --s3-endpoint <s3_endpoint>` |
| `hoody files access ssh` |  | read | Access file via SSH/SFTP | `files.ssh.access` | `hoody files access ssh /home/user/file.txt --type ssh --server srv-abc --user alice --pass <pass> --key <key> --passphrase <passphrase>` |
| `hoody files access ssh-upload` |  | write | Upload file via SSH/SFTP | `files.ssh.upload` | `hoody files access ssh-upload /home/user/file.txt --server srv-abc --user alice --pass <pass> --key <key> --passphrase <passphrase> --input <input>` |
| `hoody files access webdav` |  | read | Access file via WebDAV | `files.webdav.access` | `hoody files access webdav /home/user/file.txt --type webdav --server srv-abc --user alice --pass <pass> --webdav-path /` |
| `hoody files append` |  | write | Append data to file | `files.append` | `hoody files append /home/user/file.txt --owner <owner> --input <input>` |
| `hoody files archive preview` |  | read | Preview archive contents or read file | `files.archives.preview` | `hoody files archive preview /home/user/archive.zip --preview <preview> --contents <contents>` |
| `hoody files archive view` |  | read | View file from archive | `files.archives.viewFile` | `hoody files archive view /home/user/archive.zip --preview <preview>` |
| `hoody files backends connect alias` |  | write | Connect to alias backend | `files.backends.connectAlias` | `hoody files backends connect alias --description "My description" --remote origin` |
| `hoody files backends connect azureblob` |  | write | Connect to azureblob backend | `files.backends.connectAzureblob` | `hoody files backends connect azureblob --access-tier <access_tier> --account acc-abc --archive-tier-delete --chunk-size 4194304 --client-certificate-password <client_certificate_password> --client-certificate-path /home/user/file.txt --client-id abc-123 --client-secret <client_secret> --client-send-certificate-chain --delete-snapshots include --description "My description" --directory-markers --disable-checksum --disable-instance-discovery --encoding 21078018 --endpoint https://example.com --env-auth --key <key> --list-chunk 5000 --memory-pool-flush-time 60 --memory-pool-use-mmap --msi-client-id abc-123 --msi-mi-res-id abc-123 --msi-object-id abc-123 --password <password> --public-access blob --sas-url https://example.com --service-principal-file <service_principal_file> --tenant tenant-abc --upload-concurrency 16 --upload-cutoff 1048576 --use-az --use-emulator --use-msi --username alice` |
| `hoody files backends connect azurefiles` |  | write | Connect to azurefiles backend | `files.backends.connectAzurefiles` | `hoody files backends connect azurefiles --account acc-abc --chunk-size 4194304 --client-certificate-password <client_certificate_password> --client-certificate-path /home/user/file.txt --client-id abc-123 --client-secret <client_secret> --client-send-certificate-chain --connection-string <connection_string> --description "My description" --encoding 54634382 --endpoint https://example.com --env-auth --key <key> --max-stream-size 10737418240 --msi-client-id abc-123 --msi-mi-res-id abc-123 --msi-object-id abc-123 --password <password> --sas-url https://example.com --service-principal-file <service_principal_file> --share-name <share_name> --tenant tenant-abc --upload-concurrency 16 --use-msi --username alice` |
| `hoody files backends connect b2` |  | write | Connect to b2 backend | `files.backends.connectB2` | `hoody files backends connect b2 --account acc-abc --chunk-size 100663296 --copy-cutoff 4294967296 --description "My description" --disable-checksum --download-auth-duration 604800 --download-url https://example.com --encoding 50438146 --endpoint https://example.com --hard-delete --key <key> --lifecycle 0 --memory-pool-flush-time 60 --memory-pool-use-mmap --test-mode <test_mode> --upload-concurrency 4 --upload-cutoff 209715200 --version-at 0001-01-01T00:00:00Z --versions` |
| `hoody files backends connect box` |  | write | Connect to box backend | `files.backends.connectBox` | `hoody files backends connect box --access-token <access_token> --auth-url https://example.com/auth --box-config-file <box_config_file> --box-sub-type user --client-credentials --client-id abc-123 --client-secret <client_secret> --commit-retries 100 --description "My description" --encoding 52535298 --impersonate abc-123 --list-chunk 1000 --owned-by <owned_by> --root-folder-id 0 --token <token> --token-url https://example.com/token --upload-cutoff 52428800` |
| `hoody files backends connect cache` |  | write | Connect to cache backend | `files.backends.connectCache` | `hoody files backends connect cache --chunk-clean-interval 60 --chunk-no-memory --chunk-path /home/user/.cache/hoody-vfs/cache-backend --chunk-size 1M --chunk-total-size 500M --db-path /home/user/.cache/hoody-vfs/cache-backend --db-purge --db-wait-time 1 --description "My description" --info-age 1h --plex-insecure <plex_insecure> --plex-password <plex_password> --plex-token <plex_token> --plex-url https://example.com --plex-username <plex_username> --read-retries 10 --remote origin --rps=-1 --tmp-upload-path /home/user/file.txt --tmp-wait-time 15 --workers 4 --writes` |
| `hoody files backends connect chunker` |  | write | Connect to chunker backend | `files.backends.connectChunker` | `hoody files backends connect chunker --chunk-size 2147483648 --description "My description" --fail-hard --hash-type none --meta-format none --name-format *.hoody-vfs_chunk.### --remote origin --start-from 1 --transactions rename` |
| `hoody files backends connect cloudinary` |  | write | Connect to cloudinary backend | `files.backends.connectCloudinary` | `hoody files backends connect cloudinary --api-key <api_key> --api-secret <api_secret> --cloud-name <cloud_name> --description "My description" --encoding 52543246 --eventually-consistent-delay 0 --upload-prefix <upload_prefix> --upload-preset <upload_preset>` |
| `hoody files backends connect combine` |  | write | Connect to combine backend | `files.backends.connectCombine` | `hoody files backends connect combine --description "My description" --upstreams <upstreams>` |
| `hoody files backends connect compress` |  | write | Connect to compress backend | `files.backends.connectCompress` | `hoody files backends connect compress --description "My description" --level=-1 --mode gzip --ram-cache-limit 20971520 --remote origin` |
| `hoody files backends connect crypt` |  | write | Connect to crypt backend | `files.backends.connectCrypt` | `hoody files backends connect crypt --description "My description" --directory-name-encryption --filename-encoding base32 --filename-encryption standard --pass-bad-blocks --password <password> --password2 <password2> --remote origin --server-side-across-configs --show-mapping --strict-names --suffix .bin` |
| `hoody files backends connect drive` |  | write | Connect to drive backend | `files.backends.connectDrive` | `hoody files backends connect drive --acknowledge-abuse --allow-import-name-change --alternate-export --auth-owner-only --auth-url https://example.com/auth --chunk-size 8388608 --client-credentials --client-id abc-123 --client-secret <client_secret> --copy-shortcut-content --description "My description" --disable-http2 --encoding 16777216 --env-auth --export-formats docx,xlsx,pptx,svg --fast-list-bug-fix --formats <formats> --impersonate <impersonate> --import-formats <import_formats> --keep-revision-forever --list-chunk 1000 --metadata-labels off --metadata-owner off --metadata-permissions off --pacer-burst 100 --pacer-min-sleep 0 --resource-key <resource_key> --root-folder-id abc-123 --scope drive --server-side-across-configs --service-account-credentials <service_account_credentials> --service-account-file <service_account_file> --shared-with-me --show-all-gdocs --size-as-quota --skip-checksum-gphotos --skip-dangling-shortcuts --skip-gdocs --skip-shortcuts --starred-only --stop-on-download-limit --stop-on-upload-limit --team-drive <team_drive> --token <token> --token-url https://example.com/token --trashed-only --upload-cutoff 8388608 --use-created-date --use-shared-date --use-trash --v2-download-min-size=-1` |
| `hoody files backends connect dropbox` |  | write | Connect to dropbox backend | `files.backends.connectDropbox` | `hoody files backends connect dropbox --auth-url https://example.com/auth --batch-commit-timeout 600 --batch-mode sync --batch-size 0 --batch-timeout 0 --chunk-size 50331648 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 52469762 --impersonate <impersonate> --pacer-min-sleep 0 --root-namespace <root_namespace> --shared-files --shared-folders --token <token> --token-url https://example.com/token` |
| `hoody files backends connect fichier` |  | write | Connect to fichier backend | `files.backends.connectFichier` | `hoody files backends connect fichier --api-key <api_key> --cdn --description "My description" --encoding 52666494 --file-password <file_password> --folder-password <folder_password> --shared-folder <shared_folder>` |
| `hoody files backends connect filefabric` |  | write | Connect to filefabric backend | `files.backends.connectFilefabric` | `hoody files backends connect filefabric --description "My description" --encoding 50429954 --permanent-token <permanent_token> --root-folder-id abc-123 --token <token> --token-expiry <token_expiry> --url https://storagemadeeasy.com --version 1.0.0` |
| `hoody files backends connect filescom` |  | write | Connect to filescom backend | `files.backends.connectFilescom` | `hoody files backends connect filescom --api-key <api_key> --description "My description" --encoding 60923906 --password <password> --site <site> --username alice` |
| `hoody files backends connect ftp` |  | write | Connect to ftp backend | `files.backends.connectFtp` | `hoody files backends connect ftp --ask-password --close-timeout 60 --concurrency 0 --description "My description" --disable-epsv --disable-mlsd --disable-tls13 --disable-utf8 --encoding Asterisk,Ctl,Dot,Slash --explicit-tls --force-list-hidden --host example.com --idle-timeout 60 --pass <pass> --port 21 --shut-timeout 60 --socks-proxy <socks_proxy> --tls --tls-cache-size 32 --user user --writing-mdtm` |
| `hoody files backends connect gofile` |  | write | Connect to gofile backend | `files.backends.connectGofile` | `hoody files backends connect gofile --access-token <access_token> --account-id abc-123 --description "My description" --encoding 323331982 --list-chunk 1000 --root-folder-id abc-123` |
| `hoody files backends connect google-cloud-storage` |  | write | Connect to google cloud storage backend | `files.backends.connectGoogleCloudStorage` | `hoody files backends connect google-cloud-storage --access-token <access_token> --anonymous --auth-url https://example.com/auth --bucket-acl authenticatedRead --bucket-policy-only --client-credentials --client-id abc-123 --client-secret <client_secret> --decompress --description "My description" --directory-markers --encoding 50348034 --endpoint https://example.com --env-auth --location asia --object-acl authenticatedRead --project-number <project_number> --service-account-credentials <service_account_credentials> --service-account-file <service_account_file> --storage-class MULTI_REGIONAL --token <token> --token-url https://example.com/token --user-project <user_project>` |
| `hoody files backends connect google-photos` |  | write | Connect to google photos backend | `files.backends.connectGooglePhotos` | `hoody --proxy <proxy> files backends connect google-photos --auth-url https://example.com/auth --batch-commit-timeout 600 --batch-mode sync --batch-size 0 --batch-timeout 0 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50348034 --include-archived --read-only --read-size --start-year 2000 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect hasher` |  | write | Connect to hasher backend | `files.backends.connectHasher` | `hoody files backends connect hasher --auto-size 0 --description "My description" --hashes <hashes> --max-age 0 --remote origin` |
| `hoody files backends connect hdfs` |  | write | Connect to hdfs backend | `files.backends.connectHdfs` | `hoody files backends connect hdfs --data-transfer-protection privacy --description "My description" --encoding 50430082 --namenode <namenode> --service-principal-name <service_principal_name> --username root` |
| `hoody files backends connect hidrive` |  | write | Connect to hidrive backend | `files.backends.connectHidrive` | `hoody files backends connect hidrive --auth-url https://example.com/auth --chunk-size 50331648 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --disable-fetching-member-count --encoding 33554434 --endpoint https://api.hidrive.strato.com/2.1 --root-prefix / --scope-access rw --scope-role user --token <token> --token-url https://example.com/token --upload-concurrency 4 --upload-cutoff 100663296` |
| `hoody files backends connect http` |  | write | Connect to http backend | `files.backends.connectHttp` | `hoody files backends connect http --description "My description" --headers '{}' --url https://example.com` |
| `hoody files backends connect iclouddrive` |  | write | Connect to iclouddrive backend | `files.backends.connectIclouddrive` | `hoody files backends connect iclouddrive --apple-id abc-123 --client-id d39ba9916b7251055b22c7f910e2ea796ee65e98b2ddecea8f5dde8d9d1a815d --cookies <cookies> --description "My description" --encoding 50438146 --password <password> --trust-token <trust_token>` |
| `hoody files backends connect imagekit` |  | write | Connect to imagekit backend | `files.backends.connectImagekit` | `hoody files backends connect imagekit --description "My description" --encoding 117553486 --endpoint https://example.com --only-signed --private-key <private_key> --public-key pk_abc123 --upload-tags <upload_tags> --versions` |
| `hoody files backends connect internetarchive` |  | write | Connect to internetarchive backend | `files.backends.connectInternetarchive` | `hoody files backends connect internetarchive --access-key-id abc-123 --description "My description" --disable-checksum --encoding 50446342 --endpoint https://s3.us.archive.org --front-endpoint https://archive.org --secret-access-key <secret_access_key> --wait-archive 0` |
| `hoody files backends connect jottacloud` |  | write | Connect to jottacloud backend | `files.backends.connectJottacloud` | `hoody files backends connect jottacloud --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50431886 --hard-delete --md5-memory-limit 10485760 --token <token> --token-url https://example.com/token --trashed-only --upload-resume-limit 10485760` |
| `hoody files backends connect koofr` |  | write | Connect to koofr backend | `files.backends.connectKoofr` | `hoody files backends connect koofr --description "My description" --encoding 50438146 --endpoint https://example.com --mountid <mountid> --password <password> --provider koofr --setmtime --user alice` |
| `hoody files backends connect linkbox` |  | write | Connect to linkbox backend | `files.backends.connectLinkbox` | `hoody files backends connect linkbox --description "My description" --token <token>` |
| `hoody files backends connect local` |  | write | Connect to local backend | `files.backends.connectLocal` | `hoody files backends connect local --case-insensitive --case-sensitive --copy-links --description "My description" --encoding 33554434 --links --nounc --one-file-system --skip-links --time-type mtime --unicode-normalization --zero-size-links` |
| `hoody files backends connect mailru` |  | write | Connect to mailru backend | `files.backends.connectMailru` | `hoody files backends connect mailru --auth-url https://example.com/auth --check-hash --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50440078 --pass <pass> --quirks <quirks> --speedup-enable --speedup-file-patterns * --speedup-max-disk 0 --speedup-max-memory 0 --token <token> --token-url https://example.com/token --user alice --user-agent "Mozilla/5.0"` |
| `hoody files backends connect mega` |  | write | Connect to mega backend | `files.backends.connectMega` | `hoody files backends connect mega --debug --description "My description" --encoding 50331650 --hard-delete --pass <pass> --use-https --user alice` |
| `hoody files backends connect memory` |  | write | Connect to memory backend | `files.backends.connectMemory` | `hoody files backends connect memory --description "My description"` |
| `hoody files backends connect netstorage` |  | write | Connect to netstorage backend | `files.backends.connectNetstorage` | `hoody files backends connect netstorage --account acc-abc --description "My description" --host example.com --protocol http --secret <secret>` |
| `hoody files backends connect onedrive` |  | write | Connect to onedrive backend | `files.backends.connectOnedrive` | `hoody files backends connect onedrive --access-scopes "Files.Read Files.ReadWrite Files.Read.All Files.ReadWrite.All Sites.Read.All offline_access" --auth-url https://example.com/auth --av-override --chunk-size 10485760 --client-credentials --client-id abc-123 --client-secret <client_secret> --delta --description "My description" --disable-site-permission --drive-id abc-123 --drive-type <drive_type> --encoding 57386894 --expose-onenote-files --hard-delete --hash-type auto --link-password <link_password> --link-scope anonymous --link-type view --list-chunk 1000 --metadata-permissions off --region global --root-folder-id abc-123 --server-side-across-configs --tenant tenant-abc --token <token> --token-url https://example.com/token` |
| `hoody files backends connect opendrive` |  | write | Connect to opendrive backend | `files.backends.connectOpendrive` | `hoody files backends connect opendrive --chunk-size 10485760 --description "My description" --encoding 62007182 --password <password> --username alice` |
| `hoody files backends connect oracleobjectstorage` |  | write | Connect to oracleobjectstorage backend | `files.backends.connectOracleobjectstorage` | `hoody files backends connect oracleobjectstorage --attempt-resume-upload --chunk-size 5242880 --compartment <compartment> --config-file ~/.oci/config --config-profile Default --copy-cutoff 4999610368 --copy-timeout 60 --description "My description" --disable-checksum --encoding 50331650 --endpoint https://example.com --leave-parts-on-error --max-upload-parts 10000 --namespace <namespace> --provider env_auth --region eu-west-1 --sse-customer-algorithm AES256 --sse-customer-key <sse_customer_key> --sse-customer-key-file <sse_customer_key_file> --sse-customer-key-sha256 <sse_customer_key_sha256> --sse-kms-key-id abc-123 --storage-tier Standard --upload-concurrency 10 --upload-cutoff 209715200` |
| `hoody files backends connect pcloud` |  | write | Connect to pcloud backend | `files.backends.connectPcloud` | `hoody files backends connect pcloud --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438146 --hostname api.pcloud.com --password <password> --root-folder-id d0 --token <token> --token-url https://example.com/token --username alice` |
| `hoody files backends connect pikpak` |  | write | Connect to pikpak backend | `files.backends.connectPikpak` | `hoody files backends connect pikpak --chunk-size 5242880 --description "My description" --device-id abc-123 --encoding 56829838 --hash-memory-limit 10485760 --pass <pass> --root-folder-id abc-123 --trashed-only --upload-concurrency 5 --use-trash --user alice --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:129.0) Gecko/20100101 Firefox/129.0"` |
| `hoody files backends connect pixeldrain` |  | write | Connect to pixeldrain backend | `files.backends.connectPixeldrain` | `hoody files backends connect pixeldrain --api-key <api_key> --api-url https://pixeldrain.com/api --description "My description" --root-folder-id me` |
| `hoody files backends connect premiumizeme` |  | write | Connect to premiumizeme backend | `files.backends.connectPremiumizeme` | `hoody files backends connect premiumizeme --api-key <api_key> --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438154 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect protondrive` |  | write | Connect to protondrive backend | `files.backends.connectProtondrive` | `hoody files backends connect protondrive --2fa <2fa> --app-version macos-drive@1.0.0-alpha.1+hoody-vfs --client-access-token <client_access_token> --client-refresh-token <client_refresh_token> --client-salted-key-pass <client_salted_key_pass> --client-uid <client_uid> --description "My description" --enable-caching --encoding 52559874 --mailbox-password <mailbox_password> --original-file-size --password <password> --replace-existing-draft --username alice` |
| `hoody files backends connect putio` |  | write | Connect to putio backend | `files.backends.connectPutio` | `hoody files backends connect putio --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50438146 --token <token> --token-url https://example.com/token` |
| `hoody files backends connect qingstor` |  | write | Connect to qingstor backend | `files.backends.connectQingstor` | `hoody files backends connect qingstor --access-key-id abc-123 --chunk-size 4194304 --connection-retries 3 --description "My description" --encoding 16842754 --endpoint https://example.com --env-auth --secret-access-key <secret_access_key> --upload-concurrency 1 --upload-cutoff 209715200 --zone pek3a` |
| `hoody files backends connect quatrix` |  | write | Connect to quatrix backend | `files.backends.connectQuatrix` | `hoody files backends connect quatrix --api-key <api_key> --description "My description" --effective-upload-time 4s --encoding 50438146 --hard-delete --host example.com --maximal-summary-chunk-size 100000000 --minimal-chunk-size 10000000 --skip-project-folders` |
| `hoody files backends connect s3` |  | write | Connect to s3 backend | `files.backends.connectS3` | `hoody --profile default files backends connect s3 --access-key-id abc-123 --acl default --bucket-acl private --chunk-size 5242880 --copy-cutoff 4999610368 --decompress --description "My description" --directory-bucket --directory-markers --disable-checksum --disable-http2 --download-url https://example.com --encoding 50331650 --endpoint objects-us-east-1.dream.io --env-auth --force-path-style --leave-parts-on-error --list-chunk 1000 --list-url-encode <list_url_encode> --list-version 0 --location-constraint <location_constraint> --max-upload-parts 10000 --memory-pool-flush-time 60 --memory-pool-use-mmap --might-gzip <might_gzip> --provider AWS --region other-v2-signature --requester-pays --sdk-log-mode 0 --secret-access-key <secret_access_key> --server-side-encryption AES256 --session-token <session_token> --shared-credentials-file <shared_credentials_file> --sse-customer-algorithm AES256 --sse-customer-key <sse_customer_key> --sse-customer-key-base64 <sse_customer_key_base64> --sse-customer-key-md5 <sse_customer_key_md5> --sse-kms-key-id arn:aws:kms:us-east-1:* --storage-class STANDARD --sts-endpoint <sts_endpoint> --upload-concurrency 4 --upload-cutoff 209715200 --use-accelerate-endpoint --use-accept-encoding-gzip <use_accept_encoding_gzip> --use-already-exists <use_already_exists> --use-dual-stack --use-multipart-etag <use_multipart_etag> --use-multipart-uploads <use_multipart_uploads> --use-presigned-request --use-unsigned-payload <use_unsigned_payload> --v2-auth --version-at 0001-01-01T00:00:00Z --version-deleted --versions` |
| `hoody files backends connect seafile` |  | write | Connect to seafile backend | `files.backends.connectSeafile` | `hoody files backends connect seafile --2fa --auth-token <auth_token> --create-library --description "My description" --encoding 16850954 --library <library> --library-key <library_key> --pass <pass> --url https://cloud.seafile.com/ --user alice` |
| `hoody files backends connect sftp` |  | write | Connect to sftp backend | `files.backends.connectSftp` | `hoody files backends connect sftp --ask-password --chunk-size 32768 --ciphers <ciphers> --concurrency 64 --connections 0 --copy-is-hardlink --description "My description" --disable-concurrent-reads --disable-concurrent-writes --disable-hashcheck --host example.com --host-key-algorithms <host_key_algorithms> --idle-timeout 60 --key-exchange <key_exchange> --key-file <key_file> --key-file-pass <key_file_pass> --key-pem <key_pem> --key-use-agent --known-hosts-file ~/.ssh/known_hosts --macs <macs> --md5sum-command <md5sum_command> --pass <pass> --path-override <path_override> --port 22 --pubkey <pubkey> --pubkey-file <pubkey_file> --server-command <server_command> --set-env <set_env> --set-modtime --sha1sum-command <sha1sum_command> --shell-type none --skip-links --socks-proxy <socks_proxy> --ssh <ssh> --subsystem sftp --use-fstat --use-insecure-cipher --user user` |
| `hoody files backends connect sharefile` |  | write | Connect to sharefile backend | `files.backends.connectSharefile` | `hoody files backends connect sharefile --auth-url https://example.com/auth --chunk-size 67108864 --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 57091982 --endpoint https://example.com --root-folder-id favorites --token <token> --token-url https://example.com/token --upload-cutoff 134217728` |
| `hoody files backends connect sia` |  | write | Connect to sia backend | `files.backends.connectSia` | `hoody files backends connect sia --api-password <api_password> --api-url http://127.0.0.1:9980 --description "My description" --encoding 50436354 --user-agent Sia-Agent` |
| `hoody files backends connect smb` |  | write | Connect to smb backend | `files.backends.connectSmb` | `hoody files backends connect smb --case-insensitive --description "My description" --domain WORKGROUP --encoding 56698766 --hide-special-share --host example.com --idle-timeout 60 --pass <pass> --port 445 --spn <spn> --user user` |
| `hoody files backends connect storj` |  | write | Connect to storj backend | `files.backends.connectStorj` | `hoody files backends connect storj --access-grant <access_grant> --api-key <api_key> --description "My description" --passphrase <passphrase> --provider existing --satellite-address us1.storj.io` |
| `hoody files backends connect sugarsync` |  | write | Connect to sugarsync backend | `files.backends.connectSugarsync` | `hoody files backends connect sugarsync --access-key-id abc-123 --app-id abc-123 --authorization <authorization> --authorization-expiry <authorization_expiry> --deleted-id abc-123 --description "My description" --encoding 50397186 --hard-delete --private-access-key <private_access_key> --refresh-token <refresh_token> --root-id abc-123 --user alice` |
| `hoody files backends connect swift` |  | write | Connect to swift backend | `files.backends.connectSwift` | `hoody files backends connect swift --application-credential-id abc-123 --application-credential-name <application_credential_name> --application-credential-secret <application_credential_secret> --auth https://auth.api.rackspacecloud.com/v1.0 --auth-token <auth_token> --auth-version 0 --chunk-size 5368709120 --description "My description" --domain example.com --encoding 16777218 --endpoint-type public --env-auth --fetch-until-empty-page --key <key> --leave-parts-on-error --partial-page-fetch-threshold 0 --region eu-west-1 --storage-policy pcs --storage-url https://example.com --tenant tenant-abc --tenant-domain <tenant_domain> --tenant-id abc-123 --use-segments-container <use_segments_container> --user alice --user-id abc-123` |
| `hoody files backends connect tardigrade` |  | write | Connect to tardigrade backend | `files.backends.connectTardigrade` | `hoody files backends connect tardigrade --access-grant <access_grant> --api-key <api_key> --description "My description" --passphrase <passphrase> --provider existing --satellite-address us1.storj.io` |
| `hoody files backends connect ulozto` |  | write | Connect to ulozto backend | `files.backends.connectUlozto` | `hoody files backends connect ulozto --app-token <app_token> --description "My description" --encoding 50438146 --list-page-size 500 --password <password> --root-folder-slug <root_folder_slug> --username alice` |
| `hoody files backends connect union` |  | write | Connect to union backend | `files.backends.connectUnion` | `hoody files backends connect union --action-policy epall --cache-time 120 --create-policy epmfs --description "My description" --min-free-space 1073741824 --search-policy ff --upstreams <upstreams>` |
| `hoody files backends connect uptobox` |  | write | Connect to uptobox backend | `files.backends.connectUptobox` | `hoody files backends connect uptobox --access-token <access_token> --description "My description" --encoding 50561070 --private` |
| `hoody files backends connect webdav` |  | write | Connect to webdav backend | `files.backends.connectWebdav` | `hoody files backends connect webdav --auth-redirect --bearer-token <bearer_token> --bearer-token-command <bearer_token_command> --description "My description" --encoding utf-8 --headers '{}' --nextcloud-chunk-size 10485760 --owncloud-exclude-mounts --owncloud-exclude-shares --pacer-min-sleep 0 --pass <pass> --unix-socket <unix_socket> --url https://example.com --user alice --vendor fastmail` |
| `hoody files backends connect yandex` |  | write | Connect to yandex backend | `files.backends.connectYandex` | `hoody files backends connect yandex --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 50429954 --hard-delete --spoof-ua --token <token> --token-url https://example.com/token` |
| `hoody files backends connect zoho` |  | write | Connect to zoho backend | `files.backends.connectZoho` | `hoody files backends connect zoho --auth-url https://example.com/auth --client-credentials --client-id abc-123 --client-secret <client_secret> --description "My description" --encoding 16875520 --region com --token <token> --token-url https://example.com/token --upload-cutoff 10485760` |
| `hoody files backends disconnect` |  | destructive | Disconnect backend | `files.backends.disconnect` | `hoody files backends disconnect abc-123` |
| `hoody files backends get` |  | read | Get backend details | `files.backends.getDetails` | `hoody files backends get abc-123` |
| `hoody files backends list` |  | read | List all backends | `files.backends.list` | `hoody files backends list` |
| `hoody files backends test` |  | read | Test backend connection | `files.backends.testConnection` | `hoody files backends test abc-123` |
| `hoody files backends update` |  | write | Update backend credentials | `files.backends.update` | `hoody files backends update abc-123 --body '{}'` |
| `hoody files chmod` |  | write | Change file permissions | `files.chmod` | `hoody files chmod /home/user/file.txt --chmod <chmod>` |
| `hoody files chown` |  | write | Change file ownership | `files.chown` | `hoody files chown /home/user/file.txt --chown <chown>` |
| `hoody files copy` |  | write | Copy file or directory | `files.copy` | `hoody files copy /home/user/file.txt --copy-to <copy_to> --overwrite true --owner <owner>` |
| `hoody files delete` | rm, remove | destructive | Delete file or directory | `files.delete` | `hoody files delete /home/user/file.txt --backend <backend>` |
| `hoody files delete-recursive` |  | destructive | Delete file or directory | `files.deleteRecursive` | `hoody files delete-recursive /home/user/file.txt` |
| `hoody files dir` |  | read | List directory contents or download file | `files.listDirectory` | `hoody files dir /home/user/file.txt --json --simple --sort name --order asc --hash --sha256 --base64 --edit --view --download 1 --content-type <content_type> --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100` |
| `hoody files downloads active` |  | read | List active downloads | `files.downloads.listActive` | `hoody files downloads active /home/user/src --downloads` |
| `hoody files downloads all` |  | read | List active downloads | `files.downloads.listGlobal` | `hoody files downloads all` |
| `hoody files downloads history` |  | read | Download history | `files.downloads.getHistory` | `hoody files downloads history --download-history` |
| `hoody files downloads url` |  | read | Download file from remote URL | `files.downloads.fetch` | `hoody files downloads url /home/user/src --download <download> --filename <filename> --timeout 300` |
| `hoody files downloads zip` |  | read | Download directory as ZIP | `files.archives.downloadAsZip` | `hoody files downloads zip /home/user/src --zip` |
| `hoody files extractions active` |  | read | List active extractions | `files.archives.listActive` | `hoody files extractions active --extractions` |
| `hoody files extractions all` |  | read | List active extractions | `files.archives.listGlobal` | `hoody files extractions all` |
| `hoody files extractions create` |  | read | Extract archive | `files.archives.extract` | `hoody files extractions create /home/user/archive.zip --extract <extract> --dest <dest>` |
| `hoody files extractions extract-file` |  | read | Extract file from archive | `files.archives.extractFile` | `hoody files extractions extract-file /home/user/archive.zip --extract <extract> --dest <dest>` |
| `hoody files extractions history` |  | read | Extraction history | `files.archives.getHistory` | `hoody files extractions history --extraction-history` |
| `hoody files fetch-from-git` |  | read | Fetch file from Git repository | `files.git.fetch` | `hoody files fetch-from-git /home/user/file.txt --type git --url https://example.com --ref <ref> --pass <pass>` |
| `hoody files get` |  | read | List directory or download file | `files.get` | `hoody files get /home/user/file.txt --backend <backend> --hash --sha256 --base64 --preview --contents --stat --thumbnail <thumbnail> --grep ".*" --ignore-case --fixed-string --glob "*.ts" --context 0 --max-count 50 --max-matches 500 --max-depth 50 --max-filesize 10485760 --timeout 30 --max-results 1000 --max-files-scanned 100000 --sort mtime --order asc --lines 100 --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100 --zip` |
| `hoody files glob` |  | read | Find files by glob pattern | `files.glob` | `hoody files glob /home/user/file.txt --pattern "*.ts" --max-results 1000 --max-depth 50 --max-files-scanned 100000 --timeout 30 --sort mtime --order asc` |
| `hoody files grep` |  | read | Search file contents (grep) | `files.grep` | `hoody files grep /home/user/file.txt --pattern "TODO" --ignore-case --fixed-string --glob "*.ts" --context 0 --max-count 50 --max-matches 500 --max-depth 50 --max-filesize 10485760 --timeout 30` |
| `hoody files health` |  | read | Service health check | `files.health.check` | `hoody files health` |
| `hoody files journal flush` |  | write | Flush journal to disk | `files.journal.flush` | `hoody files journal flush` |
| `hoody files journal query` |  | read | Query journal entries | `files.journal.query` | `hoody files journal query --path /home/user/file.txt --op <op> --since 2026-01-01T00:00:00Z --limit 100 --after-id 0` |
| `hoody files journal stats` |  | read | Get journal statistics | `files.journal.getStats` | `hoody files journal stats` |
| `hoody files metadata` |  | read | Get file metadata | `files.getMetadata` | `hoody files metadata /home/user/file.txt --history --at <at> --revision 10 --diff --from-seq 10 --from-ts <from_ts> --to-seq 10 --to-ts <to_ts> --after-id 10 --limit 100` |
| `hoody files mounts create` | new, add | write | Create persistent FUSE mount | `files.mounts.create` | `hoody files mounts create --backend-id abc-123 --label my-label --mount-path /home/user/file.txt --vfs-config-cache-max-age <vfs_config.cache_max_age> --vfs-config-cache-max-size 100 --vfs-config-cache-mode <vfs_config.cache_mode> --vfs-config-dir-cache-time <vfs_config.dir_cache_time>` |
| `hoody files mounts get` |  | read | Get mount details | `files.mounts.getDetails` | `hoody files mounts get abc-123` |
| `hoody files mounts list` |  | read | List all mounts | `files.mounts.list` | `hoody files mounts list --label my-label` |
| `hoody files mounts unmount` |  | destructive | Unmount filesystem | `files.mounts.unmount` | `hoody files mounts unmount abc-123` |
| `hoody files mounts update` |  | write | Update mount VFS configuration | `files.mounts.update` | `hoody files mounts update abc-123` |
| `hoody files move` |  | write | Move file or directory | `files.move` | `hoody files move /home/user/file.txt --move-to <move_to> --owner <owner>` |
| `hoody files open` |  | action | Open the Files kit service (file explorer) in your browser |  | `hoody files open [index] [--url]` |
| `hoody files options` |  | read | Get allowed methods | `files.webdav.getOptions` | `hoody files options /home/user/file.txt` |
| `hoody files patch` |  | write | File operations | `files.patch` | `hoody files patch /home/user/file.txt --x-update-range append --body '{}'` |
| `hoody files process-image` |  | read | Process and convert images | `files.images.process` | `hoody files process-image img-abc --thumbnail --format jpeg --size <size> --width 10 --height 10 --resize fit --quality low --q 85 --blur 10 --grayscale --bg <bg>` |
| `hoody files put` |  | write | Upload or append file | `files.put` | `hoody files put /home/user/file.txt --backend <backend> --append --owner <owner> --input <input>` |
| `hoody files realpath` |  | read | Resolve canonical path (realpath) | `files.realpath` | `hoody files realpath /home/user/file.txt` |
| `hoody files search` |  | read | Search directory | `files.search` | `hoody files search /home/user/src --q <q> --json` |
| `hoody files stat` |  | read | Get file metadata (stat) | `files.stat` | `hoody files stat /home/user/file.txt` |
| `hoody files touch` |  | write | Touch file (create or update mtime) | `files.touch` | `hoody files touch /home/user/file.txt --touch` |
| `hoody files upload` |  | write | Upload file | `files.upload` | `hoody files upload /home/user/file.txt --input <input>` |
| `hoody files version` |  | read | Get API version | `files.system.getApiVersion` | `hoody files version` |


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

- `notebookId` per call; first `hoody notes whoami` auto-provisions notebook+user from `?username=` (default `user`).
- HTTP/raw fetch supports `X-Idempotency-Key` for retry-safe creates. **Most generated SDK service methods do NOT expose per-call request headers** (`requestOptions` has no `headers` field), so idempotency-keyed retries on those must use raw `fetch()` against the kit URL. **The exception is `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`, which accepts the key as `options.XIdempotencyKey`** — so the recommended document-writing path is fully retry-safe from the SDK. Export `ticket` is HTML-export-only.
- **Writing a document needs editor-or-admin role on the node** — `hoody notes doc put`/`hoody notes doc patch`/`POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` resolve access via `getNodeAccess` and reject viewers/read-only collaborators with `403`. Documents attach only to `page` and `record` nodes (the node types that declare a `documentSchema`); `message`/`channel`/`database` nodes do not support documents.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

1. **Write a page (RECOMMENDED: append)** — the simplest, most reliable way to put content into a note. First get a page node id (use the auto-provisioned `Home` section: `hoody notes node list` `type:"section"` → pick `Home` → `hoody notes node create` `type:"page"`, `parentId:<sectionId>`, `attributes:{name}`). Then `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` with `{text:"…", type:"paragraph"|"heading1"|…}` (one block from plain text) OR `{blocks:[{type,content,attrs}]}` (batch). **The server assigns each block's `id`, `parentId`, and `index`** — you never compute fractional indices or block ids, which is the part agents get wrong with `hoody notes doc put`. Creates the document if absent; pass `X-Idempotency-Key` (SDK `options.XIdempotencyKey`) for safe retries. See §Examples 1–2.
2. **Bootstrap identity + notebook** — `hoody notes whoami` → `{userId,username,role,notebookId}` (auto-provisions a notebook + `Home` section + starter pages). `hoody notes notebook list`/`create`/`get` open to any non-`none` member; `update`/`delete` are owner-gated.
3. **Build a structured document with `hoody notes doc put`** — use this only when you need full control over layout/ordering (append cannot create lists, tables, or nested blocks). `hoody notes doc put` OVERWRITES the whole document; `hoody notes doc patch` shallow-merges at the TOP level only (submitting `content.blocks` REPLACES the entire blocks map — it does NOT merge per-block). The body is `{content:{type:"rich_text",blocks:{<id>:<block>}}}`. **Use the real `EditorNodeTypes` strings and the `attrs` key, and remember container blocks (lists/tasks/blockquote/table cells) hold their text in a CHILD `paragraph` block** — see §Examples 0 (block-model cheat-sheet) and 3.
4. **Database CRUD** — `hoody notes node create` `type:"database"`; then `hoody notes db create`/`hoody notes db list`/`hoody notes db search`/`hoody notes db update` (merges `fields`)/`hoody notes db delete`. Page with `page`/`count` on `hoody notes db list` (count max 100). ⚠ SDK-only: the auto-pagination helpers (listIterator / listAll) are misconfigured upstream — they send `limit`/`offset` while the route accepts `page`/`count`; prefer manual paged list loops.
5. **Comments + versions** — `hoody notes collab add` (`admin`/`editor`/`collaborator`/`viewer`). `hoody notes comment create` (top-level, anchored, or reply); `hoody notes comment edit`/`delete`/`hoody notes comment resolve` accept optional `expectedVersion` for optimistic concurrency. `hoody notes version create`/`list`/`get`/`hoody notes version restore`.
6. **TUS upload + download** — `POST /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` for `fileId`; `PATCH /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `PATCH`+`Upload-Offset`; `HEAD /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` `HEAD` returns resume offset; `DELETE /api/v1/notes/notebooks/{notebookId}/files/{fileId}/tus` cancels. `hoody notes file list`, `hoody notes file download`.

## Quirks & gotchas

- **Use the real block `type` strings and the `attrs` key — wrong values store silently but render blank.** Valid block types are the `EditorNodeTypes` values: `paragraph`, `heading1`/`heading2`/`heading3`, `blockquote`, `bulletList`, `listItem`, `orderedList`, `taskList`, `taskItem`, `codeBlock`, `horizontalRule`, `table`/`tableRow`/`tableHeader`/`tableCell`, `page`, `file`, `folder`, `tempFile`, `drawing`, `grid`, plus the editor-extension blocks `embed` (block) and inline `mention`/`hardBreak`. There is NO `code`, `bullet_list_item`, or `quote` type, and block attributes live under `attrs` (NOT `props`); code language is `attrs.language`, a task's done-state is `attrs.checked`. The block schema is loose (`type:z.string()`, `attrs:z.record`), so a bad `type`/`props` is accepted with `200` and stored — the CRDT bridge validates with `safeParse` but writes the ORIGINAL object, persisting the junk key — the editor then has no renderer for it and the block shows blank. (A later full rewrite that omits the bad key reconciles it away.)
- **Container blocks hold NO direct text — their text lives in a CHILD `paragraph` block.** Only `paragraph`/`heading1-3`/`codeBlock` (and the text-less `horizontalRule`) are leaf blocks that carry `content:[{type:'text',text}]` directly. For `listItem`, `taskItem`, `blockquote`, `tableCell`, `tableHeader` you MUST add a child `paragraph` block whose `parentId` is the container's id; putting text directly on the container makes it render empty. See §Examples 0 and 3 for the exact nesting.
- **Prefer `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append` for adding content; it does NOT create the node.** Append server-assigns `id`/`parentId`/`index` and creates the document row if missing, but `404`s if the node is absent and `400`s for node types without a `documentSchema` (only `page`/`record`) — so create/find the page first. It rejects client-supplied `id`/`parentId`/`index` and reserved `attrs` keys (`id`,`parentId`,`index`,`type`,`__proto__`,`constructor`,`prototype`), accepts only `{type:'text'}` leaves (no inline `mention`/image), the `{text}` form does NOT split newlines (one literal block), and it caps at 100 blocks / 512 KiB per call. Appendable types: `paragraph`, `heading1-3`, `codeBlock`, `horizontalRule` (containers and `file` are rejected).
- **`hoody notes doc put` has no block/byte cap** (only the Fastify 10 MB body limit) and requires the node to exist, creating the document row if it has none; the 100-block / 512 KiB caps are append-only.
- **`hoody notes node create` with schema-invalid `attributes` for a KNOWN type returns `500 unknown`, not `400`** — `YDoc.update()` throws on the attribute `safeParse` before the create transaction's try/catch (unknown type / missing parent → `400`; permission/`canCreate` → `403`). A page needs `attributes.name` + `parentId` and cannot be root-level; a manually-created `section` must include `attributes.collaborators` with the creator as `admin` and is root-only — easiest is to reuse the auto-provisioned `Home` section.
- `notebookAuthenticator` re-anchors identity to URL `notebookId`; one bearer reaches any notebook the username joined.
- Cross-client convergence is **mutation-stream-driven** via the `POST /api/v1/notes/notebooks/{notebookId}/mutations` route + WS feed: each mutation type (`document.update`, `node.*`, etc.) is dispatched server-side to a SQL-backed lib function. `hoody notes doc put`/`hoody notes doc patch` are last-writer-wins JSON overlays on top of the same store; two concurrent PATCHes will clobber each other unless drivers coordinate via the WS mutation feed.
- `identity.get?username=&role=` creates user+notebook and runs `initializeNotebookContent`. Priority Bearer → `ticket` → `?username=&role=`; invalid Bearer = 401 even with fallback. **Without any of the three, requests default to username `user` (NOT to a previously seen `?username=alex` query)** — re-pass `?username=` on every unauthenticated call, or attach Bearer / `ticket`. Username lowercased `/^[a-zA-Z0-9_-]+$/` 1–32. `role` ∈ `owner|admin|collaborator|guest|none`; `none` → `notebook_no_access`.
- **`Readonly` notebook gates writes only** — read endpoints still serve through; write routes (mutations, document.put/patch, record-create, etc.) are rejected with `403 notebook_readonly`.
- `X-Idempotency-Key` replay returns saved response; same key+different payload → 409.
- `hoody notes db update` merges `fields`; access runs through `getNodeAccess(notebookId, databaseId, userId)`, which resolves your role from the `collaborations` row on the notebook **root** node, then walks the database's full ancestor chain and returns `403` if any ancestor is a private `section`, or a `channel` whose `attributes.collaborators` map omits you (notebook owner/admin bypasses the privacy walk). A root collaboration alone is therefore NOT sufficient. TUS validates `notebookId`/`fileId` against generated-id regex; free-form id → 400 `file_not_found`.
- `documents.get?output=html` needs single-use export `ticket` on `GET .../document`. `hoody notes doc put` overwrites; `hoody notes doc patch` top-level spreads the request body over current content — submitting `content.blocks` REPLACES the blocks map, it does not merge per-block. For per-block CRDT merging use the `POST /api/v1/notes/notebooks/{notebookId}/mutations` WS feed instead. `hoody notes comment edit`/`delete`/`hoody notes comment resolve` accept optional `expectedVersion`.
- `hoody notes db search` matches against record names AND field values (not just names).
- Text filter operators in `databases.list?filters=`: `is_equal_to` / `is_not_equal_to` / `contains` / `does_not_contain` / `starts_with` / `ends_with` / `is_empty` / `is_not_empty`. The bare `is` is NOT a valid operator — use `is_equal_to`; the bare `not_contains` is NOT either — use `does_not_contain`.
- TUS chunk uploads: `PATCH /api/v1/notes/notebooks/{n}/files/{id}/tus` is the byte-transfer call — send the raw chunk as the request body with `Upload-Offset`/`Tus-Resumable` headers (e.g. via `@tus/client`). SDK-only: the generated tusUploadChunk method takes no chunk-body or Upload-Offset parameter, so drop to raw `@tus/client`/`fetch` for the actual byte transfer.

## Common errors

- `400 bad_request` validation (`details[]`); `400 file_not_found` TUS id regex; `409` PK dupe or idempotency-key reused w/ different payload.
- `403 notebook_no_access`/`notebook_readonly`/`forbidden` (db needs `collaborations` or `canCreate`).
- `404 not_found` — node/file/comment/version missing or `notebook_id` mismatch. `500 unknown` — read-back failed or uncategorized.

## Related namespaces

`files`, `sqlite`, `notifications`, `api`, `exec`

## Examples

Every step in every example was live-tested against a real `notes-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first; bootstrap identity once with `GET /api/v1/notes/me?username=...&role=owner` to auto-provision `notebookId`.

### 0. Block model cheat-sheet — types, the `attrs` key, and container nesting

**Read this before hand-building any `hoody notes doc put` body.** A document is
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

**Step 1 — bootstrap identity & create notebook.** First call to `hoody notes whoami` with `?username=&role=` auto-provisions a default notebook + Home section + Welcome page; pass it once per `username`. Then `hoody notes notebook create` for a second, named one.

```bash
hoody --container "$C" notes whoami
NBID=$(hoody --container "$C" notes notebook create \
  --name team-wiki --description 'engineering docs' -o json | jq -r .id)
```
**Step 2 — find the auto-created Home section and add a page under it.** Every fresh notebook ships with a `section` named `Home`; `hoody notes node create` with `type:"page"` needs that section as `parentId`. POST returns `201` (NOT 200 — generic retry helpers that only accept 200 will treat success as failure).

```bash
SEC=$(hoody --container "$C" notes node list --notebook-id "$NBID" -o json \
  | jq -r '.nodes[] | select(.type=="section") | .id' | head -1)
PAGE=$(hoody --container "$C" notes node create --notebook-id "$NBID" \
  --type page --parent-id "$SEC" --attributes name=Runbook -o json | jq -r .id)
```
**Step 3 — append the first content (recommended).** `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`
appends to the END of the page's document and **the server assigns each block's
`id`, `parentId`, and `index`** — so you never compute fractional indices or block
ids. Send EITHER `{text, type?}` (one block from plain text; `type` defaults to
`paragraph`) OR `{blocks:[{type, content?, attrs?}]}` (a batch of flat blocks).
Appendable types are `paragraph`, `heading1`–`heading3`, `codeBlock`,
`horizontalRule` only; containers (lists/tables) need `hoody notes doc put` (Example 3).
If the document doesn't exist yet it is created. `X-Idempotency-Key` makes retries
safe.

```bash
# There is no generated document-append CLI command (only doc get/put/patch), so
# use the kit HTTP endpoint directly:
curl -sf -X POST "$KIT/api/v1/notes/notebooks/$NBID/nodes/$PAGE/document/append" \
  -H 'Content-Type: application/json' \
  -d '{"type":"heading1","text":"Runbook"}'
```
### 2. Build a structured document with `hoody notes doc put` — leaf blocks + a bulleted list

**Goal:** lay out a page with a header, prose, a fenced code block, and a 2-item
bulleted list, in one full-document write. Use PUT (not append) when you need
containers or precise ordering. ⚠ Two traps this example fixes: (1) use the REAL type
strings — `codeBlock` (not `code`) with the language under `attrs` (not `props`),
and a `bulletList`→`listItem`→`paragraph` nest (there is no `bullet_list_item`); a
wrong type/`props` is stored silently and renders blank. (2) `hoody notes doc patch` does
NOT merge by block id — it REPLACES the entire `blocks` map (live-verified). To add to
an existing doc, `GET` the current blocks, mutate locally, `PUT` the union back (or
just use `POST /api/v1/notes/notebooks/{notebookId}/nodes/{nodeId}/document/append`).

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 3. Update one block's content + reorder by changing `index`

**Goal:** rewrite a paragraph and move it to the top of the page. Because PUT is full-overwrite, you read the current doc, mutate the target block, and write the full map back.

**Step 1 — read current blocks.**

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
**Step 2 — mutate locally + PUT back.** Set the target block's `index` to a key that sorts FIRST (e.g. prefix `Z` → swap to `9`, or use a fresh small string like `_a0`); rewrite its `content`.

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 4. Delete a block + verify ordering survives

**Goal:** drop a single block from the doc. Same overwrite trick — `delete blocks[b3]` locally, PUT remaining map back, then GET to verify the survivors keep their `index` order.

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 5. Create a database (Tasks) with typed columns + add records

**Goal:** make a database node with `text`, `number`, `boolean` fields, then create a few records. ⚠ `hoody notes node create` for `type:"database"` REQUIRES `attributes.fields` populated — without it the kit returns `500` (the attribute `safeParse` throws inside `YDoc.update` before the create transaction's try/catch — a `canCreate` failure would be a `403`). Each field needs `id` (matching `^[a-zA-Z0-9_-]+$`), `type`, `name`, `index`.

```bash
# _(no native `hoody notes` shape)_ — `--fields` is a KEY=VALUE collector, so the
# JSON would be sent as a literal STRING and the server rejects the untyped value
# (`db create` 500s, `db update` 400s). Typed database fields are HTTP/SDK-only.
```
### 6. Query records — filter + sort

**Goal:** find records with `priority > 1` sorted descending. Both `filters` and `sorts` are JSON-encoded query strings. ⚠ `filters` MUST be a **JSON array** (not an object) of `{ id, type:"field", fieldId, operator, value }`; sending an object returns `400 "filters" query parameter must be a JSON array.` Operators are field-type-specific: numbers use `is_equal_to`/`is_not_equal_to`/`is_greater_than`/`is_less_than`/`is_greater_than_or_equal_to`/`is_less_than_or_equal_to`, text uses `is_equal_to`/`is_not_equal_to`/`contains`/`does_not_contain`/`starts_with`/`ends_with`/`is_empty`/`is_not_empty`, booleans use `is_true`/`is_false`. Sort entries are `{ id, fieldId, direction:"asc"|"desc" }` (also array).

```bash
hoody --container "$C" notes db list --notebook-id "$NBID" --database-id "$DBID" \
  --filters '[{"id":"f1","type":"field","fieldId":"f_priority","operator":"is_greater_than","value":1}]' \
  --sorts '[{"id":"s1","fieldId":"f_priority","direction":"desc"}]' \
  --count 50 -o json | jq '.records[] | {n:.name,p:.fields.f_priority.value}'
```
A simpler full-text alternative is `databases.search?q=...` — no array shape, just a query string; matches against record `name` AND field values.

### 7. Update a record by id — partial-merge fields

**Goal:** mark Task 1 as done. `hoody notes db update` PATCH MERGES `fields` (live-verified: sending only `f_status` + `f_done` left `f_priority` untouched). Each field value must be the typed wrapper `{ type: <type>, value: <v> }` matching the column type.

```bash
RID=$(hoody --container "$C" notes db list --notebook-id "$NBID" --database-id "$DBID" --count 50 -o json \
  | jq -r '.records[] | select(.name=="Task 1") | .id' | head -1)
# _(no native `hoody notes` shape for the update itself)_ — `--fields` is a KEY=VALUE
# collector and would send the typed union as a literal string (`400` at the route).
# Use the HTTP or SDK form below to write typed field values.
```
### 8. Bulk import records from a CSV

**Goal:** load a list of imports into the Tasks database in a loop. There is no single-call bulk-create endpoint; loop `hoody notes db create` per row. ⚠ Records DO NOT auto-deduplicate by `name` — re-running the same import doubles your data. If you need idempotency over HTTP/raw fetch, set the request header `X-Idempotency-Key` to a deterministic per-row key (replay returns the saved response; same key + different payload returns `409`). The **generated SDK service methods do not expose per-call headers**, so idempotency keys must be sent via raw `fetch()` (or `client.api.http.*` low-level if available).

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
### 9. Export a page to HTML — single-use ticket flow

**Goal:** publish a static HTML snapshot of a page. `documents.get?output=html` requires a single-use export `ticket` (markdown via `?output=md` does NOT — it returns text directly with no ticket). Tickets default to 3 uses and expire in ~2 minutes (live-verified). Anyone with the kit URL + ticket can download until it expires.

**Step 1 — create a ticket.**

_(this step has no native `hoody notes` shape — the CLI flag set can't carry nested rich-text blocks; use the HTTP curl form above or the SDK form below)_
**Step 2 — fetch the HTML.** Same kit URL; pass `ticket=` in the query.

```bash
hoody --container "$C" notes doc get --notebook-id "$NBID" --node-id "$PAGE" \
  --output html --ticket "$TICKET" > /tmp/page.html
```
### 10. Tear down — delete the database, then the section (cascade), then the notebook

**Goal:** clean up everything you created. Order matters: deleting a `section` cascades to every descendant page/database/record under it (live-verified — one DELETE on the section emptied the notebook). Then `hoody notes notebook delete` removes the notebook itself.

`hoody notes notebook delete` returns `200` immediately after soft-deleting the notebook (flips `status` to `Inactive`); the caller must be `owner`. A background `notebook.clean` job then recursively purges child rows asynchronously — re-list via `hoody notes notebook list` to confirm the notebook no longer appears (the list filters out `Inactive` status).

```bash
hoody --container "$C" notes db list --notebook-id "$NBID" --database-id "$DBID" -o json \
  | jq -r '.records[].id' | while read RID; do
      hoody --container "$C" notes db delete --notebook-id "$NBID" --database-id "$DBID" --record-id "$RID"
    done
hoody --container "$C" notes node delete --notebook-id "$NBID" --node-id "$DBID"
hoody --container "$C" notes node delete --notebook-id "$NBID" --node-id "$SEC"
hoody --container "$C" notes notebook delete --notebook-id "$NBID" || true
hoody --container "$C" notes notebook update --notebook-id "$NBID" --name team-wiki-DELETED
```

## Reference

### `hoody notes` (43) — Hoody Notes — notebooks, nodes, documents, comments, versions, and databases

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notes collab add` |  | write | Add a collaborator to a node | `notes.collaborators.add` | `hoody notes collab add --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes collab list` |  | read | List collaborators on a node | `notes.collaborators.list` | `hoody notes collab list --notebook-id abc-123 --node-id 1` |
| `hoody notes collab remove` |  | destructive | Remove a collaborator from a node | `notes.collaborators.remove` | `hoody notes collab remove --notebook-id abc-123 --node-id 1 --collaborator-id abc-123` |
| `hoody notes collab update` |  | write | Update a collaborator's role on a node | `notes.collaborators.update` | `hoody notes collab update --notebook-id abc-123 --node-id 1 --collaborator-id abc-123 --role admin` |
| `hoody notes comment anchors` |  | read | List comment anchors (the inline document positions threads are pinned to) | `notes.comments.listAnchors` | `hoody notes comment anchors --limit 500 --offset 0 --cursor <cursor> --notebook-id abc-123 --node-id 1` |
| `hoody notes comment create` |  | write | Create a new comment (optionally anchored to a document location) | `notes.comments.create` | `hoody notes comment create --notebook-id abc-123 --node-id 1 --content "Hello" --parent-id abc-123 --anchor-block-id abc-123 --anchor <anchor>` |
| `hoody notes comment delete` |  | destructive | Delete a comment | `notes.comments.delete` | `hoody notes comment delete --expected-version 10 --notebook-id abc-123 --node-id 1 --comment-id abc-123` |
| `hoody notes comment edit` |  | write | Edit a comment's body | `notes.comments.edit` | `hoody notes comment edit --notebook-id abc-123 --node-id 1 --comment-id abc-123 --content "Hello" --expected-version 10` |
| `hoody notes comment list` |  | read | List comments on a node | `notes.comments.list` | `hoody notes comment list --limit 100 --offset 0 --cursor <cursor> --notebook-id abc-123 --node-id 1` |
| `hoody notes comment resolve` |  | action | Mark a comment thread resolved | `notes.comments.resolve` | `hoody notes comment resolve --notebook-id abc-123 --node-id 1 --comment-id abc-123 --expected-version 10` |
| `hoody notes db create` |  | write | Create a new record in a database node | `notes.databases.create` | `hoody notes db create --notebook-id abc-123 --database-id abc-123 --id abc-123 --name Untitled --avatar https://example.com/avatar.png --fields <key=value>` |
| `hoody notes db delete` |  | destructive | Delete a database record | `notes.databases.delete` | `hoody notes db delete --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes db get` |  | read | Get a database record by id | `notes.databases.get` | `hoody notes db get --notebook-id abc-123 --database-id abc-123 --record-id abc-123` |
| `hoody notes db list` |  | read | List records in a database node | `notes.databases.listIterator` | `hoody notes db list --filters <filters> --sorts <sorts> --page 1 --count 50 --notebook-id abc-123 --database-id abc-123` |
| `hoody notes db search` |  | read | Search records in a database node | `notes.databases.search` | `hoody notes db search --q <q> --exclude "*.ts" --notebook-id abc-123 --database-id abc-123` |
| `hoody notes db update` |  | write | Update a database record's fields | `notes.databases.update` | `hoody notes db update --notebook-id abc-123 --database-id abc-123 --record-id abc-123 --name my-resource --avatar https://example.com/avatar.png --fields <key=value>` |
| `hoody notes doc get` |  | read | Get document content for a node (rich-text body) | `notes.documents.get` | `hoody notes doc get --block-ids <block_ids> --lines 100 --include-comments none --ticket <ticket> --notebook-id abc-123 --node-id 1` |
| `hoody notes doc patch` |  | write | Merge changes into a node's document content | `notes.documents.patch` | `hoody notes doc patch --notebook-id abc-123 --node-id 1 --content <key=value>` |
| `hoody notes doc put` |  | write | Create or replace a node's document content (full overwrite) | `notes.documents.put` | `hoody notes doc put --notebook-id abc-123 --node-id 1 --content <key=value>` |
| `hoody notes file download` |  | read | Download a file attachment by id | `notes.files.download` | `hoody notes file download --file-id abc-123 --notebook-id abc-123` |
| `hoody notes file list` |  | read | List file attachments in a notebook | `notes.files.listIterator` | `hoody notes file list --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes node children` |  | read | List immediate child nodes of a node | `notes.nodes.listChildren` | `hoody notes node children --limit 50 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes node create` |  | write | Create a node inside a notebook (type: page/folder/database/etc.) | `notes.nodes.create` | `hoody notes node create --notebook-id abc-123 --id abc-123 --type default --parent-id abc-123 --attributes <key=value>` |
| `hoody notes node delete` |  | destructive | Delete a node and its descendants | `notes.nodes.delete` | `hoody notes node delete --notebook-id abc-123 --node-id 1` |
| `hoody notes node get` |  | read | Get a node by id | `notes.nodes.get` | `hoody notes node get --notebook-id abc-123 --node-id 1` |
| `hoody notes node get-by-alias` |  | read | Resolve a page-style node by its URL alias (slug) | `notes.nodes.getByAlias` | `hoody notes node get-by-alias --notebook-id abc-123 --alias my-resource` |
| `hoody notes node list` |  | read | List nodes in a notebook (pages, folders, databases) | `notes.nodes.list` | `hoody notes node list --type default --parent-id abc-123 --root-id abc-123 --limit 50 --offset 0 --notebook-id abc-123` |
| `hoody notes node update` |  | write | Update a node (rename, move, change attributes) | `notes.nodes.update` | `hoody notes node update --notebook-id abc-123 --node-id 1 --attributes <key=value>` |
| `hoody notes notebook create` |  | write | Create a new notebook (top-level workspace) | `notes.notebooks.create` | `hoody notes notebook create --name my-resource --description "My description" --avatar https://example.com/avatar.png` |
| `hoody notes notebook delete` |  | destructive | Delete a notebook (irreversible — deletes all nodes/documents/comments inside) | `notes.notebooks.delete` | `hoody notes notebook delete --notebook-id abc-123` |
| `hoody notes notebook get` |  | read | Get notebook details | `notes.notebooks.get` | `hoody notes notebook get --notebook-id abc-123` |
| `hoody notes notebook list` |  | read | List notebooks the current user has access to | `notes.notebooks.listNotebooks` | `hoody notes notebook list` |
| `hoody notes notebook update` |  | write | Update notebook settings (name, description, avatar) | `notes.notebooks.update` | `hoody notes notebook update --notebook-id abc-123 --name my-resource --description "My description" --avatar https://example.com/avatar.png` |
| `hoody notes reaction add` |  | write | Add an emoji reaction to a node | `notes.reactions.add` | `hoody notes reaction add --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes reaction list` |  | read | List reactions on a node | `notes.reactions.list` | `hoody notes reaction list --notebook-id abc-123 --node-id 1` |
| `hoody notes reaction remove` |  | destructive | Remove an emoji reaction from a node | `notes.reactions.remove` | `hoody notes reaction remove --notebook-id abc-123 --node-id 1 --reaction <reaction>` |
| `hoody notes user set-role` |  | write | Update a user's role on a notebook (owner/admin/collaborator/guest/none) | `notes.users.updateRole` | `hoody notes user set-role --notebook-id abc-123 --user-id abc-123 --role owner` |
| `hoody notes version create` |  | write | Create a new document version snapshot (point-in-time backup) | `notes.versions.create` | `hoody notes version create --notebook-id abc-123 --node-id 1` |
| `hoody notes version delete` |  | destructive | Delete a document version snapshot | `notes.versions.delete` | `hoody notes version delete --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes version get` |  | read | Get a specific document version's content | `notes.versions.get` | `hoody notes version get --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes version list` |  | read | List document version snapshots for a node | `notes.versions.list` | `hoody notes version list --limit 20 --offset 0 --notebook-id abc-123 --node-id 1` |
| `hoody notes version restore` |  | action | Restore a document to a previous version (replaces current content) | `notes.versions.restore` | `hoody notes version restore --notebook-id abc-123 --node-id 1 --version-id abc-123` |
| `hoody notes whoami` |  | read | Get current Notes identity (user id, username, role, default notebook id) | `notes.identity.get` | `hoody notes whoami` |


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
- Required: `display`+`summary` on `hoody notifications trigger`; `display` on `hoody notifications list`; `displays` on `hoody notifications stream`.

## Capability URL

Kit slug is `n` (not `notifications`): `https://{P}-{C}-n-1.{N}.containers.hoody.com`. The HTTP API lives under `/api/v1/notifications/...`. **The root of that URL is a user-facing web page**: open `https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all` in any browser and it requests notification permission, then turns every streamed entry into a real OS notification (works backgrounded; auto-reconnects, polling fallback). The hostname itself is the credential, so no token or header goes in the URL — hand the human that exact URL with `{P}`/`{C}`/`{N}` filled in from `hoody containers get`. → See `SKILL-CLI.md § Proxy URLs` for the slug table and capability-token rules.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Fire a notification

`hoody notifications trigger` body: `display`+`summary` (req); optional `body`, `urgency`, `icon`, `category`, `expire_time`. CLI: `hoody notifications trigger --display :0 --summary "Build done"`.

### 2. Read recent notifications

`hoody notifications list` — `display`: `":0"`, `"0"`, `"0,:1,2"`, or `"all"`. Optional `limit` (1–1000, default 100), `since` (ms), `username`, `session`. **`after_id` is supported by the kit HTTP route but is NOT in the generated SDK options** (`notifications.service.generated.ts:340-422`); use raw HTTP/curl when you need cursor pagination. The SDK additionally exposes `hoody notifications list` (one-shot fetch-all) and `hoody notifications list` (async page iterator) on top of plain list; the CLI exposes only a single `hoody notifications list` subcommand under `hoody notifications`. CLI: see CLI-broken caveat in Quirks.

### 3. Subscribe to events

`hoody notifications stream` — `displays`: `"all"`, `"*"`, or 1–3-digit IDs comma list. WS if `Upgrade`; else SSE (`connected`, 15 s `heartbeat`, `notification`). WS sends `{"type":"subscribe"|"unsubscribe","displays":[...]}`.

### 4. Dismiss / restore

`hoody notifications list` → int `id`s → `hoody notifications dismiss` POST `{"notificationIds":[<int>,…],"displayId":":0"}`. `hoody notifications clear-dismissed` DELETE (optional `displayId`) restores. CLI: `hoody notifications dismiss --display-id 1 --notification-ids 12,13`.

### 5. Fetch an icon

`hoody notifications list` → `icon` → `hoody notifications icon` by `iconId`. Honours `If-None-Match`/`If-Modified-Since`.

### 6. Remotely notify the human operator

Reach a human who isn't watching the session — on their phone, desktop, or smartwatch. One-time human setup: they open the kit web page with `?displays=all` (see § Capability URL), grant browser-notification permission, and leave the tab backgrounded. Agent side: `hoody notifications trigger` with a `display` (any real display number — the kit auto-ensures it, so you do NOT have to set up X first), a `summary`, and optional `body`/`urgency`. The kit records the entry and broadcasts it on its stream; the operator's page renders it as an OS notification. Full copy-paste recipe in Example 11.

## Quirks & gotchas

- Kit slug is `n`, not `notifications`.
- `dismiss.notificationIds` MUST be integers (strings → `400`); `displayId` strips leading `:`.
- `hoody notifications trigger` limits: `summary` ≤200, `body` ≤1000, `category` ≤50, `expire_time` 0–300000; `urgency` ∈ `low|normal|critical`.
- `list.display` numeric or `"all"`; `connectStream.displays` accepts 1–5-digit IDs (`20001` is valid; 6+ digits rejected) (`"1000"` rejected).
- `list.limit` `[1,1000]` def 100; cursor `after_id`; `username`/`session` 1–100 ASCII alnum.
- `iconId` ext whitelist `jpg|jpeg|png|webp|avif|gif|bmp`; traversal rejected.
- WS only with `Upgrade`; else SSE+15 s heartbeat. WS: per-IP caps, origin allow-list, drops after 2 missed pongs.
- `hoody notifications clear-dismissed`=DELETE, `hoody notifications dismiss`=POST, same path.
- **There are two distinct `notifications` surfaces; this namespace is the kit one.** This file documents the per-container kit (`hoody-notifications`, kit slug `n`) — `/api/v1/notifications/{display}`, `notify-send`, icons, WS/SSE stream. The control-plane *account inbox* lives at `hoody inbox *` (`GET /api/v1/notifications/`, `PUT /:id/read`, `read-all`) and is unrelated.
- The CLI uses `namespace: 'notifications'`, which routes through `normalizeKitProgram` to the kit slug `n` and builds `https://{P}-{C}-n-{N}.{server}.containers.hoody.com/api/v1/notifications/...` — `hoody --container <C> notifications {list|dismiss|icon|trigger}` reaches the kit correctly.
- `notifications stream` mapping has no `cli_stream` flag — the generated CLI buffers SSE events forever instead of streaming. Use SDK `hoody notifications stream` (returns a WebSocket wrapper, not void) or hit `/api/v1/notifications/stream` directly with `EventSource`/`fetch` for live feeds.
- `hoody notifications stream` returns a `Promise<NotificationsConnectNotificationStreamWebSocket>` wrapper. Wire callbacks first (`wrapper.onNotification(cb)` / `onHeartbeat(cb)` / `onDisconnect(cb)` / `onError(cb)`), then `await wrapper.connect()`. Close with `wrapper.close()`. There is NO `onMessage`/`onClose` — those names are wrong. `displays` is typed optional in the TS signature but is required at runtime — the SDK throws `ValidationError('displays is required')` if omitted, so always pass it.
- The kit serves a **browser client at `/`** (and at the `/api/v1/notifications` alias): it connects to the stream and raises a browser `Notification` per entry, with a polling fallback and auto-reconnect. Mount it as `?displays=all` to catch every display. This is the supported path for delivering an agent's notifications to a human's device; no token goes in the URL (the hostname is the capability).
- `hoody notifications trigger` does NOT require you to pre-create an X display: when display-ensure is enabled (the kit default), the kit runs `hoody-terminal create --terminal-id N --display-id N --wait-for-display --wait-timeout S` (where `S` is the display-ensure timeout, default 30 s; results are cached 60 s) to bring the target display up before calling `notify-send`, so firing to e.g. `:1` works on demand. It still returns `500 "No D-Bus session available"` if the display genuinely can't be brought up — pick another display instead of retrying the same one.

## Common errors

- `400 "Notification dispatch failed"` w/ details; non-`Invalid` → `500`.
- WS `1008` origin-deny; `1001` heartbeat timeout. `429` on `hoody notifications trigger` / `hoody notifications icon`; both are enforced by the shared per-IP rate-limit middleware.
- `/health` 200 ≠ authorised endpoints reachable.

## Related namespaces

- `display`, `api` (account inbox), `pipe`, `exec`, `watch`.

## Examples

Every step in every example was live-tested against a real `n-1` kit (kit slug is `n`, NOT `notifications` — the long form returns DNS NXDOMAIN). Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, and tag your test traffic with a distinctive `category` like `sdk-doc-*` so cleanup can find it.

### 1. Fire a notification on a display + read it back

**Goal:** post a toast on display `:2`, then confirm the kit recorded it. ⚠ Display `:0` typically has no D-Bus session in headless containers (`500 "No D-Bus session available for display :0"`); use a display that an X session is actually attached to (`:2` and `3` were live on the test container).

**Step 1 — trigger.** Body is `application/json`; `display` + `summary` are required, the rest are optional. The kit responds `{"success":true,"message":"Notification sent successfully"}` — note: NO `id` is returned here, so step 2 has to recover the per-display id by listing.

```bash
hoody --container "$C" notifications trigger \
  --display 2 --summary 'Build done' --body 'v1.4.2 deployed' \
  --urgency normal --category sdk-doc-build
```
**Step 2 — read it back.** `id` in the response is **per-display**, not global; the dismiss compound key is `(displayId, id)`. Capture both.

```bash
hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-build")'   # CLI -o json strips only the TRANSPORT wrapper; the kit envelope survives → .data.notifications
```
### 2. Fan out the same notification to multiple displays

**Goal:** ship one alert to every X session attached to the container. The trigger endpoint takes ONE display per call — you fire N times, the response carries no id, and per-display id sequences are independent (display `:2` and `:3` each have their own `id=1`, `id=2`…).

```bash
for D in 2 3; do
  hoody --container "$C" notifications trigger \
    --display "$D" --summary 'Maintenance in 5m' \
    --urgency critical --category sdk-doc-fanout
done
hoody --container "$C" notifications list 2,3 --limit 20 -o json \
  | jq '.data.notifications[] | select(.category=="sdk-doc-fanout") | {id, display_id}'
```
### 3. Subscribe to the live SSE stream and react to new notifications

**Goal:** keep a long-lived consumer that processes every new notification as it arrives. Default is SSE (no `Upgrade` header); WebSocket activates only with an `Upgrade: websocket` request. Frames: `connected` (once), `heartbeat` (every 15 s), `notification` (on new entry).

```bash
# Generated CLI buffers SSE events in memory (no cli_stream flag in the namespace
# mapping), so `notifications stream` is not a true live tail. For a streaming
# feed, drop to EventSource/fetch on $KIT/api/v1/notifications/stream or use the
# SDK connectStream() wrapper.
hoody --container "$C" notifications trigger --display 2 \
  --summary 'hello-stream' --category 'sdk-doc-stream'
```
### 4. Dismiss a list of notifications, scoped to one display

**Goal:** after handling a batch of toasts in your UI, hide them on display `:2` without affecting display `:3`. ⚠ `notificationIds` MUST be **integers** — strings return `400 "notificationIds must contain valid integer IDs"`. ⚠ Scoped dismiss (with `displayId`) hides the entries from `GET /:displayId` but they remain visible from `GET /all`; for cross-display hide, omit `displayId` (see example 5).

```bash
IDS=$(hoody --container "$C" notifications list 2 --limit 50 -o json \
  | jq -r '.data.notifications[].id' | paste -sd, -)
hoody --container "$C" notifications dismiss \
  --display-id 2 --notification-ids "$IDS"
```
### 5. Restore everything you just dismissed

**Goal:** undo step 4 — bring dismissed items back into the listing. `hoody notifications clear-dismissed` is `DELETE /dismiss` (same path as POST `hoody notifications dismiss`); pass `displayId` to scope, or omit it for global restore.

```bash
hoody --container "$C" notifications clear-dismissed --display-id 2
hoody --container "$C" notifications clear-dismissed
```
### 6. Fetch a notification icon by id with revalidation

**Goal:** download the icon a notification carried, then revalidate cheaply via `If-None-Match`. `iconId` looks like `6_10_1749024932903.png`; the kit rejects unknown extensions and any path traversal. Unknown/unresolvable `iconId` returns `400` (`{"error":"Icon not found"}` / `Icon not found or path invalid`); an unsupported extension or path traversal returns `400 "Icon ID is invalid or has an unsupported extension."`, and an existing-but-unreadable icon returns `500` — NOT 404, despite the openapi.yaml documenting a 404 for this case.

```bash
ICON=$(hoody --container "$C" notifications list 2 --limit 10 -o json \
  | jq -r '[.data.notifications[] | select(.has_icon)][0].icon_url' | sed 's|.*/||')
hoody --container "$C" notifications icon "$ICON" > /tmp/icon.bin
```
### 7. Filter a listing by display, time window, and cursor

**Goal:** "give me everything new on display `:2` since the last poll, with a stable cursor for the next call." `since` is **Unix milliseconds**, `after_id` is the per-display integer cursor (HTTP only — neither the SDK nor the CLI exposes `after_id`). `display_id` in responses is a `DisplayIdValue` — either a number or a string depending on the entry source — but the path/CLI accepts `"2"`, `":2"`, or even `"all"`.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 24*60*60*1000 ))  # last 24h, ms
hoody --container "$C" notifications list 2 \
  --limit 100 --since "$SINCE_MS" -o json \
  | jq '.data | {count, last_id: ([.notifications[].id] | max)}'
```
### 8. Page through history — newest 50, then walk backwards

**Goal:** the listing default is 100 newest; you want clean pagination. The kit hands back items already in newest-first order. There's no `before_id` flag — you walk by re-querying with `after_id` for forward catch-up, or take page slices client-side. The SDK adds two helpers on top of plain list: a one-shot fetch-all and a streaming iterator (both shown in the SDK example below).

```bash
hoody --container "$C" notifications list all --limit 50 -o json \
  | jq '[.notifications[].id] | min'
```
### 9. Audit notifications by username / session

**Goal:** "show me everything user `alex` saw in session `sessabc`." `username` and `session` are filter query params on `hoody notifications list`; pure ASCII alnum 1–100 chars — hyphens/underscores are rejected with `400` (e.g. `sess-abc` would fail validation). ⚠ Unknown values DO NOT 404 — the kit returns `count` of whatever it has from the wider context (live-confirmed: `username=root` returned non-empty even though notifications never had that field set), so always combine with `display`+`since` to keep the result tight.

```bash
SINCE_MS=$(( $(date +%s) * 1000 - 36*60*60*1000 ))  # last 36h, ms
hoody --container "$C" notifications list all \
  --limit 200 --since "$SINCE_MS" \
  --username alex --session sessabc -o json
```
### 10. Survive a 429 rate-limit burst on `hoody notifications trigger`

**Goal:** you're shipping a flood of toasts (CI, monitoring, …) and the kit pushes back with `429 Too Many Requests`. The kit per-IP rate-limits both `hoody notifications trigger` and `hoody notifications icon`. Strategy: cap concurrency client-side, exponential-backoff on `429`, and never retry on `400` (validation — fix the body instead). On `500 "No D-Bus session available"`, the display has no live X session — pick another display, don't retry the same one.

```bash
# CLI has no built-in retry — wrap in shell:
for i in $(seq 1 50); do
  hoody --container "$C" notifications trigger \
    --display 2 --summary "burst-$i" --category sdk-doc-burst || sleep 2
done
```
### 11. Notify a human on their phone / desktop / watch (remote operator alert)

**Goal:** the agent finished something — or needs input — and the human isn't watching the session. Deliver a real OS notification to whatever device they left the page open on. Two parts: a one-time human action (open the page, allow notifications) and the agent firing the alert.

**One-time, human side** — open this URL in a browser, click "Allow" when prompted, and leave the tab in the background (phone, desktop, or a browser that mirrors notifications to a smartwatch). `{P}`/`{C}`/`{N}` come from `hoody containers get`; `?displays=all` catches notifications fired on any display:

```
https://{P}-{C}-n-1.{N}.containers.hoody.com/?displays=all
```

The page asks for notification permission on first load, reconnects on its own, and falls back to polling if WebSocket is blocked. No token goes in the URL — the hostname is the credential.

**Agent side** — fire the alert. Any real display number works; the kit auto-ensures it, so you don't need to set up X first.

```bash
hoody --container "$C" notifications trigger \
  --display 1 --summary 'Build finished' \
  --body 'v1.4.2 is deployed — review when you can' --urgency normal
```

## Reference

### `hoody notifications` (9) — Notifications

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody notifications clear-dismissed` |  | destructive | Clear dismissed notifications | `notifications.clearDismissed` | `hoody notifications clear-dismissed --display-id 1` |
| `hoody notifications dismiss` |  | write | Dismiss notifications | `notifications.dismiss` | `hoody notifications dismiss --display-id 1 --notification-ids <notification_ids>` |
| `hoody notifications health` |  | read | Service health check | `notifications.health.check` | `hoody notifications health` |
| `hoody notifications icon` |  | read | Get notification icon | `notifications.icons.get` | `hoody notifications icon abc-123` |
| `hoody notifications list` |  | read | Get notifications for specified display(s) | `notifications.listIterator` | `hoody notifications list :0 --limit 100 --since 1750000000000 --session sess-abc` |
| `hoody notifications metrics` |  | read | Prometheus-compatible metrics endpoint | `notifications.health.getMetrics` | `hoody notifications metrics` |
| `hoody notifications open` |  | action | Open the Notifications kit service in your browser |  | `hoody notifications open [index] [--url]` |
| `hoody notifications stream` |  | read | Real-time notification stream via WebSocket | `notifications.connectStream` | `hoody notifications stream --displays <displays>` |
| `hoody notifications trigger` |  | write | Trigger a new desktop notification | `notifications.notify.trigger` | `hoody notifications trigger --body '{}' --category general --display :0 --expire-time 10 --icon <icon> --summary <summary> --urgency low` |


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

→ See `SKILL-CLI.md § Proxy URLs`.

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

_(no CLI commands registered for this namespace)_

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
- Sweep: `hoody proxy logs list` / `hoody proxy logs list`.

### 2. Drill into 5xx

- `hoody proxy logs list` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate with `limit`/`offset` (DB rowids); `afterId` on the kit URL hits the ring buffer where `id: 0`.

### 3. Live-tail with resume

- `hoody proxy logs stream` — SSE; live frames carry `id: <ringSeq>` (initial replay frame is a data-only array with no `id:` line).
- Reconnect with `Last-Event-ID`; replays from ~5000-entry ring.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Status snapshot

- `hoody proxy logs stats` — totals + status breakdown.

### 5. Bodies for a slice

- `hoody proxy logs list` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `hoody proxy logs list` ignored — SNI auto-scopes.
- `cursor` is only accepted when the deployment enables cursor pagination.
- `level` accepts ONE value at a time; despite the mapping description claiming comma-separated, `level=warn,error` returns `total: 0` — query each level separately and union client-side.
- `serviceName` handling is path-dependent: the kit/SNI `/_logs` LIST handler silently ignores `serviceName`, but the kit/SNI `/_logs/stream` BOUNCE forwards `serviceName`/`source` to the management port; the management-port `/_logs` handler always honours it. The generated SDK `hoody proxy logs list` sends the param either way, but on a kit-URL list it is a no-op — scan + client-side filter. The generated **streamLogs** SDK method does not expose `serviceName` at all. `traceId` is not exposed as a query param anywhere; scan with `limit/afterId` and filter client-side.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

> **CLI caveat — `hoody proxy logs …` does NOT target the kit.** `hoody proxy logs list`/`stats` declare `namespace: 'api'` and `hoody exec logs stream` builds from the client base URL, so `--container` is IGNORED and the call goes to your configured API/management base URL (`--base-url`), where no `/_logs` route exists. The kit-URL behaviours documented below (flat `last=N` array, `id: 0` ring rows) apply to the HTTP and SDK forms only.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. We picked **7** end-to-end recipes that exercise every working filter, both response shapes, the stats endpoint, and SSE resume. Three additional scenarios from the suggestion list — *filter by program*, *filter by source IP*, and *search by alias hostname* — were dropped because the kit does **not** filter on those fields server-side (`serviceName`, `clientIp`, alias-hostname are *not* honoured as query params on `GET /_logs`); the only way to scope by them is client-side `.filter()` after a paged scan, which is already shown in §2 (status) and §5 (traceId).

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns a flat ARRAY (no `entries` wrapper) ordered **oldest-first within the returned last-N slice** with `id: 0` placeholders — the cheapest call you can make.

```bash
hoody --container "$C" proxy logs list --last 50 -o json \
  | jq -r '.[] | "\(.tsIso)  \(.kind)/\(.level)  \(.serviceName)  \(.method) \(.url) \(.status // "—")"'
```
### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```bash
hoody --container "$C" proxy logs list --level error --limit 200 -o json \
  | jq '[.entries[] | select(.status >= 500 and .status < 600)] | sort_by(.id) | reverse'
```
### 3. Walk the full window with `limit`/`offset` paging (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. On the kit URL **do not** cursor-page by `id`: a bare `afterId`/`last` (no bodies) routes to the in-memory ring buffer where every entry is `id: 0`, so `max(id)` is always `0` and `afterId=0` never advances. Page with `limit`/`offset` instead — that path queries the DB, returns the wrapped `{entries,total,limit,offset}` shape, and carries real rowids. Walk pages until `entries` is empty.

```bash
OFFSET=0
while :; do
  PAGE=$(hoody --container "$C" proxy logs list --limit 500 --offset "$OFFSET" -o json)
  COUNT=$(echo "$PAGE" | jq '.entries | length')
  [ "$COUNT" -eq 0 ] && break
  echo "$PAGE" | jq -c '.entries[] | {id,tsIso,serviceName,status}'
  OFFSET=$((OFFSET + COUNT))
done
```
### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byContainer, byService }` — perfect for a dashboard tile.

```bash
hoody --container "$C" proxy logs stats -o json | jq '{
  total, byLevel,
  noisiest: (.byService | to_entries | sort_by(-.value) | .[:3])
}'
```
### 5. Trace one request across kits via `traceId`

**Goal:** one HTTP request that fans out to multiple internal kits shares a single `traceId` (UUID for edge entries; 32-char hex for backend hops). The kit does not filter on `traceId` server-side, so scan a recent window and group client-side. Each `traceId` typically yields a `kind: "request"` (edge) + one or more `kind: "request"`/`"response"` (backend) frames.

```bash
TID=354a5a0222e7107c46ae2851ded57fa6
hoody --container "$C" proxy logs list --limit 1000 \
    --include-request-body --include-response-body -o json \
  | jq --arg tid "$TID" '[.entries[] | select(.traceId == $tid)] | sort_by(.tsMs)'
```
### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and pick up exactly where you left off after a network blip. Live frames carry `id: <ringSeq>`; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

```bash
# The CLI seeds the first request's Last-Event-ID header from --last-event-id and
# auto-resumes across reconnects within the same process
#.
hoody --container "$C" proxy logs stream --level warn --last-event-id "$LAST"
```
### 7. Capture request + response bodies for a debug slice

**Goal:** body payloads are off by default. Turn them on for a narrow window (e.g. recent warns) to inspect what the upstream actually sent or received. Bodies are capped at `maxBodySize` (default 65 536 B) and content-types in the kit's `excludeContentTypes` (`image/`, `video/`, `audio/`, `application/octet-stream`, `font/`) are skipped — `bodyTruncated: true` flags both cases.

```bash
hoody --container "$C" proxy logs list --level warn --limit 20 \
    --include-request-body --include-response-body -o json \
  | jq '.entries[] | {id, tsIso, status, url, reqBody: .requestBody, resBody: .responseBody}'
```

## Reference

### `hoody proxy` (3) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy logs list` | ls | read | Query centralized logs | `proxyLogs.logs.listIterator` | `hoody proxy logs list --limit 200 --offset 0 --project-id abc-123 --container-id abc-123 --service-name <service_name> --level <level> --include-request-body --include-response-body --last 10 --after-id 10 --cursor <cursor> --kind request --method GET --source backend` |
| `hoody proxy logs stats` |  | read | Get log statistics | `proxyLogs.logs.getStats` | `hoody proxy logs stats` |
| `hoody proxy logs stream` |  | read | Live-tail logs over Server-Sent Events | `proxyLogs.logs.streamLogs` | `hoody proxy logs stream --project-id abc-123 --container-id abc-123 --kind request --level debug --last-event-id abc-123` |


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

→ See `SKILL-CLI.md § Proxy URLs`.

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
- CLI: `hoody run <app>` resolves an app to a command (e.g. `hoody run firefox`). Bare `run` PRINTS the command on stdout (context — `title · provider · kind · score`, viewer URLs, warnings — on stderr) and launches nothing; the run kit stays a pure resolver.
- CLI `--open`: after resolving, the CLI executes the command in the container for you (via the terminal kit's `POST /api/v1/terminal/execute`, detached with `wait:false`) — the run kit still never executes. `--open` needs a single pick, so it can't combine with `--pick ask` (or an unpicked candidate set); use `--pick first|id|index`. In `--open` mode the PRIMARY viewer URL goes to stdout (display URL for a GUI app, terminal URL for a CLI app).
- CLI GUI apps: a `kind:'gui'` result is launched with `DISPLAY` pointed at the handoff's display and surfaces BOTH a display URL (where it renders) and a terminal URL; a `kind:'cli'` result surfaces the terminal URL. URLs come from the resolver's `preview_*_url` when set, else are built from the container's kit routing (`display-{n}` / `terminal-{n}`).
- CLI `--browser`: with `--open`, also opens the primary viewer URL in the local browser (implies `--open`; falls back to printing the URL when headless).
## Common errors

- `400 INVALID_PICK` — bad `pick_index`/`candidate_id`.
- `409 cursor set expired` — re-search.
- `502 SOURCE_RESOLUTION_FAILED` — a source (e.g. `nix`/`pkgx`) failed or is missing.

## Related namespaces

- `terminal` — run a known command / interactive shell. `exec` — one-shot remote exec. `daemon` — supervised process. `display` — GUI X11.

## Examples

Each example below has a copy-pasteable code block in the mode you're reading (curl for HTTP, TypeScript for SDK, or the CLI). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. These examples reflect the resolve/preview contract — re-verify against a live `run-1` kit before relying on exact response shapes.

### 1. Resolve `firefox` to a shell command — search, then pick the top hit

**Goal:** turn the user's typed `firefox` into a runnable shell command. The default `pick` mode is `ask` (returns candidates, no selection); use `first` to auto-pick the highest-ranked one.

**Step 1 — search.** Returns a `set_id` (binds your follow-up `pick` against this exact candidate list — `set_id` expires after ~300s) and `candidates[]` ranked by score. Each candidate carries a `kind` (`gui`/`cli`/`any`).

**Step 2 — resolve to a command.** `pick: 'first'` returns `shell_command` for the top candidate.

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

The response carries `shell_command` plus the full selected entry: `run_plan.{command,env,cwd}` (the resolved shell-form) and `execution_plan.{argv,env,cwd}` (the argv-form). When the candidate has display/terminal surfaces, `preview_display_url` / `preview_terminal_url` are populated so a caller can open the preview; resolve itself never launches anything.

### 3. Pick a non-default candidate by index when multiple match

**Goal:** `git` resolves to `system-path:/usr/bin/git` by default, but you specifically want the `pkgx` candidate at index 2. Bind the pick to a `set_id` to avoid the candidate list shifting under you.

**Step 1 — list candidates with `set_id`.**

**Step 2 — pick by index against the captured `set_id`.** Out-of-range raises `400 pick_index out of range: <N>`.

**Pick by id alternative** — when you know the exact candidate, use `pick: 'id'` + `candidate_id`:

### 4. Filter by os / arch / kind / source / tags

**Goal:** narrow candidates to Linux x86_64 CLI tools sourced only from the system PATH (skip `nix`/`pkgx`/`appimage`). Useful when you don't want long resolver tails.

`source` is repeatable on `GET` (`source=system&source=registry`); it's an array on the JSON body. Empty / absent → no filter. `kind` narrows by classification (`cli` / `gui` / `any`).

**Tags** are free-form ranking hints (e.g. `tags: ['portable']` boosts AppImage / pkgx candidates). Combine with `kind: 'gui'` for X11 apps, or `os: 'windows'` to filter the catalog to Wine-runnable variants.

### 5. Preflight before resolving — check requirements + policy

**Goal:** before resolving a GUI app, learn whether the kit thinks it'll succeed. `preflight` returns `recommended_mode`, `missing_requirements`, and the `effective_policy` (verify, integrity, deny-lists).

### 6. Pagination — walk a long candidate list with `POST /api/v1/run/search/paged`

**Goal:** the `git` query returns many candidates across providers. Fetch them in pages of 3 without re-running expensive nix/pkgx queries.

`POST /api/v1/run/search/paged` returns `{ set_id, total_count, items, next_cursor }`. (Note: response field is `items`, not `candidates`.) Pass `next_cursor` back to get the next page; bound to the original `set_id` so the candidate set is stable.

**Step 1 — first page.**

**Step 2 — fetch all pages.** ⚠ The `search/paged` endpoint returns one page per call — there is no built-in drain-all behavior, so walk it manually by carrying `next_cursor` between calls until it's null/absent.
⚠ `409 cursor set expired` after ~300s — re-run the initial search with `selector` (no cursor) to get a fresh `set_id`.

### 7. Async search via job queue — for slow nix/pkgx queries

**Goal:** searching `firefox` across nixpkgs can take 15+s synchronously. Submit as a job, do other work, fetch result later.

⚠ `POST /api/v1/run/search/jobs` body is a **flat Selector** (NOT `{selector: ...}` like `search/paged`) — the wrapped form returns `Failed to deserialize ... missing field 'app'`.

**Step 1 — submit.**

**Step 2 — poll.** Status transitions `queued → running → done` (or `error`). Search-resolve jobs have a 10-minute TTL refreshed on every status/result read, so polling keeps them alive — but plan to read the result the moment status flips to `done`/`error` rather than relying on the TTL.

### 8. Batch — resolve N apps in a single round-trip

**Goal:** the agent decided on three apps at once (`ls`, `echo`, `git`); resolve all to commands without three separate HTTP hits.

`POST /api/v1/run/batch` accepts items with `mode: 'search' | 'run'` (NOT `'preflight'`). Each item has its own `request_id` for correlation; results come back in the same order with one of `result: 'search'` (full search response) or `result: 'run'` (with `selected` + `shell_command`).

### 9. Save a recipe — reusable selector template with override allow-list

**Goal:** the team often resolves "give me a JS runtime" with a fixed set of filters. Save it once as a recipe; teammates run it by name and only override approved fields.

**Step 1 — create.** `allowed_overrides` is a whitelist; any `overrides.*` outside it is rejected with `400 "recipe override not allowed: <field>"` on `POST /api/v1/run/recipes/{name}/run` — update the recipe to widen the allow-list.

**Step 2 — list / get / update / delete.**

### 10. Invoke a recipe with overrides — `POST /api/v1/run/recipes/{name}/run`

**Goal:** teammate uses the `team-js-runtime` recipe but wants `bun` instead of the default `node`. They override only the allow-listed `app` field; other selector fields stay locked.

**Step 1 — run with overrides.** Returns the same envelope as `POST /api/v1/run/resolve` (`{ status, shell_command, selected, ... }`).

**Step 2 — search through the recipe** (same selector, but stop at candidate listing instead of resolving) via `POST /api/v1/run/recipes/{name}/search`:

⚠ Overrides outside `allowed_overrides` are **rejected** with `400 "recipe override not allowed: <field>"` — they are NOT silently dropped. Use `PATCH /api/v1/run/recipes/{name}` to widen the allow-list.

## Reference

_(no CLI commands registered for this namespace)_

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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### DB + SQL tx

`hoody db create` `path` (bare/`./name`/abs under `/hoody/databases`), `init_kv: true` for KV table → `hoody db exec-transaction` `{ transaction: [{ statement, values?|valuesBatch? }] }` (`create_db_if_missing: true` skips create) → `hoody db history list`.

### KV CRUD + CAS + counters

- `hoody kv set` — `ttl`, `if_match` (CAS), `path`, `history`.
- `hoody kv get` — `path`, `at_timestamp`. `hoody kv exists` takes only `db`/`table`; `hoody kv delete` takes only `db`/`table`/`history` (`history` keeps the tombstone).
- `hoody kv incr`/`hoody kv decr`/`hoody kv arrays push`/`pop`/`hoody kv arrays delete` — atomic, `path`-aware.

### Time-travel (needs `history: true`)

- `hoody kv history` (default 50, max 1000); `hoody kv snapshots get-key` at `op_number`.
- `hoody kv snapshots get-table` / `hoody kv snapshots compare-table` — Unix `timestamp` / diff.
- `hoody kv rollback` last N; `hoody kv rollback-table`: `dry_run` (query) then `confirm: 'yes'` (query — NOT body field). Body is **required** by SDK/CLI; pass `{}` for full-table rollback or `{"keys":[...]}` / `{"exclude_keys":[...]}` to scope.

### Bulk + shareable

- `hoody kv batch set`/`hoody kv batch get`/`hoody kv batch delete` — single SQLite tx.
- `hoody db exec-shareable` — GET, URL-safe base64 `sql`, read-only. `GET /api/v1/sqlite/health`/`GET /api/v1/sqlite/health/cache`.

## Quirks & gotchas

- **Bare-URL auth (no claim/token headers).** Like every kit (including `agent`), the `sqlite` kit accepts the bare per-container kit URL — no `X-Hoody-Container-Claim` or `X-Hoody-Token` headers required. The capability URL itself is the bearer.
- **Tx item key matters: `"query"` vs `statement` are NOT interchangeable.** Each `transaction[i]` MUST carry exactly one of `"query"` (returns rows) or `statement` (rows-affected only). If you put a SELECT under `statement`, you silently get back `rowsUpdated: 0` and no data. The `sql` alias maps to `statement`.
- Path resolution: bare names auto-resolve under `/hoody/databases/` (with `.db` appended if no extension). Relative paths containing `/` or `\` are **rejected**, NOT auto-absoluted; only literal absolute paths (e.g. `/hoody/databases/app.db`) are treated as absolute. Outside `/hoody/databases` needs `--allow-any-absolute-db-path`. Symlinks followed; outward targets rejected. `:memory:` databases are rejected.
- Directory mode requires absolute db (`directory-mode: invalid path input: path must be absolute`).
- Tx items: `statement` or alias `sql`. `hoody db exec-transaction` caps: 10k items, 100k rows/`valuesBatch`, 1M total rows. `values` and `valuesBatch` are mutually exclusive on a single item; `"query"` items cannot use `valuesBatch`.
- **GET `/query` rejects mutations**: INSERT/UPDATE/DELETE, `RETURNING` on writes, multi-statement (semicolons), PRAGMA writes, VACUUM, ATTACH/DETACH. Use `hoody db exec-transaction` with `statement:` items for writes.
- **SELECT result-row cap is 10 000** (responses set `truncated: true` when hit) on both transaction `"query"` items and GET `/query`; further rows silently truncated. Paginate explicitly for larger result sets.
- **`hoody kv set` body is a JSON-encoded STRING**, not an object. Generated SDK type is `string`; encode objects yourself before sending (e.g. JSON-stringify the value). Same for the `hoody kv batch set` per-item `value`.
- Time-travel **history is opt-out, not opt-in**: write handlers default `history: true`. Pass `history: false` to skip recording — but later `hoody kv history` / snapshot / time-travel reads will see gaps (`has_gaps`, `gap_keys`, `candidate_truncated` fields). Per-key history reconstruction is capped at 50 000 ops.
- `create_db_if_missing`/`auto_create` aliases; mismatch → `conflicting flags`.
- `hoody kv list` w/ `at_timestamp` → time-travel handler (different envelope, ignores `offset`). `getHistory.limit`: 0→50, >1000→1000.
- `hoody db exec-shareable` `sql` accepts URL-safe base64 (`+`→`-`, `/`→`_`); both padded and unpadded forms are accepted. Inputs that do not decode to a SELECT/WITH query are treated as raw SQL. No workspace scoping — the kit URL alone is the credential, share carefully.
- CLI: `hoody db` (aliases `sql`, `sqlite`); KV under `hoody kv`.

## Common errors

- `412 Value mismatch for CAS` (`if_match` mismatch) / `412 Key does not exist for CAS` (both CAS failures are 412).
- `400 directory-mode: invalid path input: path must be absolute`.
- `400 absolute database paths outside /hoody/databases are disallowed`.
- `400 in-memory databases are not supported`.
- `400 conflicting flags: create_db_if_missing and auto_create must match`.
- `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL` (returned for non-SELECT input; a non-base64 `sql` value is not an error — it is interpreted as raw SQL).
- `400 Invalid JSON body` on `hoody kv batch set` — wire shape requires each `value` to be a JSON-encoded string, not an object.
- `409 time-travel chain gap` when the requested timestamp falls inside a `history: false` window.
- Per-statement tx errors → `{ reqIdx, error }`; HTTP 200 if tx parsed.

## Related namespaces

`files` `.db` in `/hoody/databases/` · `exec` in-container · `notes` notebooks · `cron` schedule maintenance.

## Examples

Every step in every example was live-tested against a real `sqlite-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first, then choose a `DB` path. Bare names (`./mydb`) auto-resolve under `/hoody/databases/`; absolute paths outside that tree need the kit's `--allow-any-absolute-db-path` flag (`/tmp/...` works on dev kits).

**Two SQL field names that are NOT interchangeable:** in a transaction item, the `"query":"..."` key is for SELECT (returns `resultSet`/`resultHeaders`) and the `"statement":"..."` key is for DDL/DML (returns `rowsUpdated` only). Putting a SELECT under `"statement"` runs it but throws away rows — `rowsUpdated:0` even when matches exist. The `"sql"` alias maps to `"statement"`, not `"query"`.

### 1. Schema setup with idempotent multi-statement transaction

**Goal:** create a fresh database under `/tmp/`, install a 3-statement schema (table + index + seed row) atomically, then read it back. Every statement is `IF NOT EXISTS` / parameterised so the whole step is replay-safe.

**Step 1 — create the db file** with the kv table pre-seeded so KV ops on the same db don't have to bootstrap separately.

```bash
DB="/tmp/sqlite-examples-$RANDOM.db"
hoody --container "$C" db create --path "$DB" --init-kv
```
**Step 2 — install schema** in a single transaction. Returns `{results:[...]}` with one entry per statement; `rowsUpdated:1` on the final INSERT confirms the seed landed.

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[
  {"statement":"CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, created_at INTEGER)"},
  {"statement":"CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)"},
  {"statement":"INSERT OR IGNORE INTO users (name, email, created_at) VALUES (?, ?, ?)","values":["Ada","ada@example.com",1778191500]}
]'
```
**Step 3 — read back using a SELECT under a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key — `statement` returns `rowsUpdated` only and silently drops rows).** The response carries `resultHeaders` + `resultSet` of column→value objects.

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[{"query":"SELECT id, name, email FROM users"}]'
```
### 2. KV CRUD with TTL — short-lived session token

**Goal:** store a per-user session blob with a 60-second TTL, prove `hoody kv exists` flips to 404 after expiry, then explicitly delete.

**Step 1 — set with TTL.** The PUT body is the raw JSON value (string, object, array — kit infers `content_type`); query params carry `ttl` in seconds.

```bash
hoody --container "$C" kv set 'session:alex' --db "$DB" --ttl 60 \
  --body '{"user_id":"d6ec...","scopes":["read","write"]}'
```
**Step 2 — `HEAD` for existence** (zero-body, cheap). Returns `200` while live, `404` once TTL elapses.

```bash
hoody --container "$C" kv exists 'session:alex' --db "$DB"
```
**Step 3 — explicit delete** (don't wait for TTL). `hoody kv delete` is NOT idempotent: deleting a missing key returns `404 Key not found`; on a hit it returns `{success:true,deleted:true}`. Wrap with try/catch or pre-check via `hoody kv get`.

```bash
hoody --container "$C" kv delete 'session:alex' --db "$DB"
```
### 3. Compare-and-swap on a versioned config blob

**Goal:** roll a config doc forward only when the current value matches what we last read. CAS uses `if_match` carrying the **literal raw value** (URL-encoded), not a hash — wrong value → `412 Value mismatch for CAS`.

**Step 1 — initial set** (no `if_match` needed; CAS only protects subsequent updates).

```bash
hoody --container "$C" kv set config --db "$DB" --body '{"version":1,"feature_x":false}'
```
**Step 2 — read current**, then send the next version with `if_match` set to the exact JSON bytes you just read. Mismatched expected → `412`, request body is rejected.

```bash
CUR=$(hoody --container "$C" kv get config --db "$DB" -o raw)   # -o raw: CAS compares BYTE-EXACT, and `-o json | jq` would re-serialize
hoody --container "$C" kv set config --db "$DB" --if-match "$CUR" \
  --body '{"version":2,"feature_x":true}'
```
**Step 3 — observe a conflict** by sending stale `if_match`. Expect `HTTP 412 {"error":"Value mismatch for CAS"}` — the write is rejected without modifying the stored value.

```bash
hoody --container "$C" kv set config --db "$DB" --if-match 'stale' --body '{"version":99}' || echo 'CAS rejected as expected'
```
### 4. Atomic counter for per-user rate limiting

**Goal:** hot-path increment/decrement without a transaction round-trip. `hoody kv incr`/`hoody kv decr` are server-side atomic and create the key on first hit; `delta` must be a POSITIVE integer (`delta <= 0` → `400 delta must be a positive integer`) — use `hoody kv decr` for the negative direction. Useful for request quotas, login-attempt counters, work-queue depth.

**Step 1 — increment by 1** on each request. First call materialises the key as `text/plain` integer.

```bash
hoody --container "$C" kv incr 'rate:alex:hour' --db "$DB" --delta 1
```
**Step 2 — bulk-add 10** in one shot (e.g. credit refund). `delta` must be a positive integer; use `hoody kv decr` to go the other way — a negative `delta` is rejected with `400`.

```bash
hoody --container "$C" kv incr 'rate:alex:hour' --db "$DB" --delta 10
```
**Step 3 — burn down by 3** (e.g. consume 3 quota units). Final value is plain text — `hoody kv get` returns the integer body directly, not wrapped.

```bash
hoody --container "$C" kv decr 'rate:alex:hour' --db "$DB" --delta 3
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
**Step 2 — inspect history** (`hoody kv history` returns newest first; each entry has `op_number` and `operation` — `operation.raw_old_value` / `operation.raw_new_value` are base64 and appear only for non-JSON content types).

```bash
hoody --container "$C" kv history feature-flags --db "$DB" --limit 10
```
**Step 3 — roll back the last two ops** so `feature-flags` returns to `{chat:false,voice:false}`. Only the chosen key is affected.

```bash
hoody --container "$C" kv rollback feature-flags --db "$DB" --steps 2
hoody --container "$C" kv get      feature-flags --db "$DB"
```
### 7. Snapshot at op-number, then diff against current

**Goal:** prove what a key looked like right after creation, then summarise every key that changed in a window. Uses `hoody kv snapshots get-key` (per-key, by `op_number`) and `hoody kv snapshots compare-table` (whole table, by Unix timestamps).

**Step 1 — fetch the per-key snapshot at `op_number=1`** (= the first state).

```bash
hoody --container "$C" kv snapshots get-key feature-flags --db "$DB" --op-number 1
```
**Step 2 — record `from` and `to` timestamps** around a write window, then mutate so there is something to diff.

```bash
FROM=$(date +%s); sleep 1
hoody --container "$C" kv set cmp-test --db "$DB" --history --body '{"v":1}'
sleep 1; TO=$(date +%s)
```
**Step 3 — diff the table** between the two timestamps. `stats.created/modified/deleted` summarises; `changes[]` enumerates per-key.

```bash
hoody --container "$C" kv snapshots compare-table --db "$DB" --from "$FROM" --to "$TO"
```
### 8. Bulk batch — set / get / delete in single round-trips

**Goal:** seed three KV pairs, fetch them in one request (with one missing key to see the null payload), then drop them all. Each call wraps in a single SQLite tx; cap is 100 items per batch.

**Important wire-format detail:** in `hoody kv batch set`, every `value` must be a **string** (a JSON-encoded scalar/object). Sending a raw object → `400 Invalid JSON body`.

**Step 1 — bulk set with TTL on one item.**

```bash
hoody --container "$C" kv batch set --db "$DB" --body '{"items":[
  {"key":"u:1","value":"{\"name\":\"alice\"}","content_type":"application/json"},
  {"key":"u:2","value":"{\"name\":\"bob\"}","content_type":"application/json"},
  {"key":"u:3","value":"{\"name\":\"carol\"}","content_type":"application/json","ttl":3600}
]}'
```
**Step 2 — bulk get** (missing keys come back as `null`, present ones as `{value, content_type}`).

```bash
hoody --container "$C" kv batch get --db "$DB" --body '{"keys":["u:1","u:2","u:3","u:404"]}'
```
**Step 3 — bulk delete.** Returns `{deleted: <count>, success: true}`. Missing keys silently no-op.

```bash
hoody --container "$C" kv batch delete --db "$DB" --body '{"keys":["u:1","u:2","u:3"]}'
```
### 9. Shareable read-only SQL via base64-encoded GET

**Goal:** mint a one-shot URL that runs a SELECT — safe to embed in dashboards / logs because the kit enforces read-only. `sql` is **URL-safe base64** (`+`→`-`, `/`→`_`); padding is optional — both padded and unpadded forms are accepted (the kit falls back to `base64.RawURLEncoding`).

**Step 1 — encode** the query.

```bash
SQL='SELECT id, name, email FROM users LIMIT 10'
# `db exec-shareable` does NOT auto-encode the SQL; pre-encode to URL-safe
# base64 (padding optional) the same way the HTTP example does:
SQL_B64=$(printf '%s' "$SQL" | base64 -w0 | tr '+/' '-_')
hoody --container "$C" db exec-shareable --db "$DB" --sql "$SQL_B64"
```
**Step 2 — issue the GET.** Response includes `columns`, `resultSet`, `rowCount`, `truncated`. A non-base64 `sql` value is not an error — it is interpreted as raw SQL; a non-SELECT query → `400 GET /query only accepts read-only SELECT/WITH queries; use POST /db for mutating SQL`.

```bash
# Step 1 already executed it
:
```
**Step 3 — paste-able URL** (e.g. dashboard link). The kit URL itself is the auth grant — guard who you share it with.

```bash
# `--url` is NOT a flag on `db exec-shareable` (it belongs to `db open`);
# compose a pasteable URL by hand if you want one:
echo "https://${P}-${C}-sqlite-1.${N}.containers.hoody.com/api/v1/sqlite/query?db=${DB}&sql=${SQL_B64}"
```
### 10. Bulk insert via `valuesBatch` — one statement, many rows

**Goal:** load 3 rows (or 100k) through one prepared statement instead of one tx item per row. `valuesBatch` is an array of value-arrays positionally aligned with the `?` placeholders. Caps: 100k rows per `valuesBatch`, 1M rows per tx.

**Step 1 — bulk insert.** Response carries `rowsUpdatedBatch:[1,1,1]` — one entry per row.

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[{
  "statement":"INSERT INTO users (name, email, created_at) VALUES (?, ?, ?)",
  "valuesBatch":[["Bob","bob@example.com",1778000000],["Carol","carol@example.com",1778000100],["Dan","dan@example.com",1778000200]]
}]'
```
**Step 2 — verify count** by sending a SELECT inside a transaction item with the `"query":"..."` key (NOT the `"statement":"..."` key).

```bash
hoody --container "$C" db exec-transaction --db "$DB" --transaction '[{"query":"SELECT COUNT(*) AS n FROM users"}]'
```
**Step 3 — clean up** (drop the throwaway db file via `files`, or just leave under `/tmp/` for the next reboot to reclaim).

```bash
hoody --container "$C" files rm "$DB"
```

## Reference

### `hoody db` (8) — SQLite database operations

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody db create` | new, add | write | Create new SQLite database | `sqlite.database.create` | `hoody db create --path /home/user/file.txt --init-kv --kv-table kv_store` |
| `hoody db exec-shareable` |  | action | Execute shareable SQL query | `sqlite.query.executeShareable` | `hoody db exec-shareable --db <db> --sql <sql>` |
| `hoody db exec-transaction` |  | action | Execute SQL transaction | `sqlite.database.executeTransaction` | `hoody db exec-transaction --db <db> --create-db-if-missing --result-format <result_format> --transaction <transaction>` |
| `hoody db history clear` |  | destructive | Clear query history | `sqlite.history.clear` | `hoody db history clear --db <db>` |
| `hoody db history delete` | rm, remove | destructive | Delete history entry | `sqlite.history.deleteEntry` | `hoody db history delete <index> --db <db>` |
| `hoody db history list` |  | read | Get query history | `sqlite.history.list` | `hoody db history list --db <db> --limit 100` |
| `hoody db history stats` |  | read | Get history statistics | `sqlite.history.getStats` | `hoody db history stats --db <db>` |
| `hoody db open` |  | action | Open the SQLite kit service (DB UI) in your browser |  | `hoody db open [index] [--url]` |

### `hoody kv` (20) — Key-value store

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody kv arrays delete` |  | destructive | Remove array element | `sqlite.kvStore.removeElement` | `hoody kv arrays delete <key> --db <db> --table kv_store --path /home/user/file.txt --index 10 --history --body '{}'` |
| `hoody kv arrays pop` |  | write | Remove from array end | `sqlite.kvStore.pop` | `hoody kv arrays pop <key> --db <db> --table kv_store --path /home/user/file.txt --history` |
| `hoody kv arrays push` |  | write | Append to array | `sqlite.kvStore.push` | `hoody kv arrays push <key> --db <db> --table kv_store --path /home/user/file.txt --history --body '{}'` |
| `hoody kv batch delete` |  | write | Batch delete multiple keys | `sqlite.kvStore.batchDelete` | `hoody kv batch delete --db <db> --table kv_store --keys <keys>` |
| `hoody kv batch get` |  | write | Batch get multiple keys | `sqlite.kvStore.batchGet` | `hoody kv batch get --db <db> --table kv_store --keys <keys>` |
| `hoody kv batch set` |  | write | Batch set multiple keys | `sqlite.kvStore.batchSet` | `hoody kv batch set --db <db> --table kv_store --items <items>` |
| `hoody kv decr` |  | write | Atomic decrement | `sqlite.kvStore.decr` | `hoody kv decr <key> --db <db> --table kv_store --delta 1 --path /home/user/file.txt --history` |
| `hoody kv delete` |  | destructive | Delete key | `sqlite.kvStore.delete` | `hoody kv delete <key> --db <db> --table kv_store --history` |
| `hoody kv exists` |  | read | Check if key exists | `sqlite.kvStore.exists` | `hoody kv exists <key> --db <db> --table kv_store` |
| `hoody kv get` |  | read | Get value by key | `sqlite.kvStore.get` | `hoody kv get <key> --db <db> --table kv_store --path /home/user/file.txt --at-timestamp 10 --rebuild` |
| `hoody kv history` |  | read | Get key operation history | `sqlite.kvStore.getHistory` | `hoody kv history <key> --db <db> --table kv_store --limit 50` |
| `hoody kv incr` |  | write | Atomic increment | `sqlite.kvStore.incr` | `hoody kv incr <key> --db <db> --table kv_store --delta 1 --path /home/user/file.txt --history` |
| `hoody kv list` | ls | read | List keys | `sqlite.kvStore.listIterator` | `hoody kv list --db <db> --table kv_store --prefix <prefix> --limit 100 --offset 0 --at-timestamp 10` |
| `hoody kv open` |  | action | Open the SQLite kit service (KV UI) in your browser |  | `hoody kv open [index] [--url]` |
| `hoody kv rollback` |  | write | Rollback key operations | `sqlite.kvStore.rollback` | `hoody kv rollback <key> --db <db> --table kv_store --steps 1` |
| `hoody kv rollback-table` |  | write | Rollback entire table | `sqlite.kvStore.rollbackTable` | `hoody kv rollback-table --db <db> --table kv_store --to-timestamp 10 --dry-run --confirm <confirm> --exclude-keys <exclude_keys> --keys <keys>` |
| `hoody kv set` |  | write | Set value for key | `sqlite.kvStore.set` | `hoody kv set <key> --db <db> --table kv_store --path /home/user/file.txt --ttl 10 --if-match <if_match> --history --create-db-if-missing --body '{}'` |
| `hoody kv snapshots compare-table` |  | read | Compare table snapshots | `sqlite.kvStore.compareSnapshots` | `hoody kv snapshots compare-table --db <db> --table kv_store --from 10 --to 10 --keys <keys>` |
| `hoody kv snapshots get-key` |  | read | Get key snapshot at operation | `sqlite.kvStore.getSnapshot` | `hoody kv snapshots get-key <key> --db <db> --table kv_store --op-number 10` |
| `hoody kv snapshots get-table` |  | read | Get table snapshot at timestamp | `sqlite.kvStore.getTableSnapshot` | `hoody kv snapshots get-table --db <db> --table kv_store --timestamp 1750000000000 --limit 100 --prefix <prefix>` |


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
- Host introspection (`hoody terminal *`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process — the `display-<terminal_id>` kit URL also pairs by id, so reusing breaks GUI routing too. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `40000–65535`, run the command, then evict at 300 s; your Claude Code / Codex session would die when the timer fires.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- One-shot synchronous request/response → `exec`.
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

`hoody terminal sessions create` (pin `terminal_id` or `ephemeral=true`) → `hoody terminal sessions exec` (`wait=true` is the default → sync; pass `wait=false` for async `command_id`; shares shell state) → `hoody terminal sessions command-result` → `hoody terminal sessions raw-output`/`hoody terminal sessions screenshot` → `hoody terminal sessions delete`.

### 2. Ephemeral one-off execute

`hoody terminal sessions exec` `ephemeral=true`, `wait=true` — auto ID 40000–65535, runs `cmd`, cleans up. Later: `hoody terminal sessions command-result` before ephemeral-result-timeout (300s).

### 3. Automate a TUI

`hoody terminal sessions create` (or `hoody terminal sessions exec` to launch) → `hoody terminal sessions press` (`Down`/`Enter`/`F2`; `hoody terminal automation keys`) → `hoody terminal sessions paste` (`bracketed=true`) → `hoody terminal sessions wait` (`stable` or `pattern`) → `hoody terminal sessions snapshot`/`hoody terminal sessions find`.

### 4. Live stream — WebSocket

`hoody terminal sessions connect` at `/api/v1/terminal/ws?terminal_id=…`. Multiple WS clients attach simultaneously; writes broadcast to PTY. Inject from REST via `hoody terminal sessions write` or `hoody terminal sessions press`. `hoody terminal sessions abort` interrupts by `command_id`.

### 5. Container introspection

`hoody terminal processes list`, `hoody terminal processes get`, `hoody terminal processes signal`, `hoody terminal system ports`, `hoody terminal system resources`, `hoody terminal system display-info`, `hoody terminal system daemon-config`, `hoody terminal system reboot`/`hoody terminal system shutdown`. Both `hoody terminal processes list` and `hoody terminal system ports` also have streamed `*Iterator` variants for paginated traversal.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–39999, **never** the ephemeral range 40000–65535, **never** re-use one another program is on).
2. `hoody terminal sessions create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/workspace'` (or wherever).
3. `hoody terminal sessions exec` `cmd: 'claude code'` (or `codex`, `aider`, `gemini …`) with `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request.
4. Reattach any time: `hoody terminal sessions connect` (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or REST via `hoody terminal sessions press` / `hoody terminal sessions paste` to drive it.
5. Tear down only when really done: `sessions.delete <terminal_id>`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a container reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `1`, Codex on `2`). The `display-<id>` kit URL pairs by id, so non-collision keeps GUI routing clean too.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. **You must explicitly pair the IDs** — the kit injects `DISPLAY` from the JSON `display` field on `hoody terminal sessions create`; there is no automatic `terminal_id ⇒ DISPLAY=:N` mapping.

1. `hoody terminal sessions create` with a pinned `terminal_id` (e.g. `1`) AND a matching `display: "1"` field (string in the SDK type), so the kit exports `DISPLAY=:1` into the PTY.
2. From that session: `hoody terminal sessions exec` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-1`.
3. Open the matching display kit URL — `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` (read `projectId`, `containerId`, and `server_name` from `hoody containers get`; the SDK exposes `getKitUrl('display', container, 1)` and `getKitUrls(container)` if you want to skip the string manipulation).
4. Drive the GUI via the `display` namespace:
   - `hoody display screenshots capture` — see what's on screen (use `base64=true` for vision agents).
   - `hoody display input click-at` `{ x, y, button }` — left/right click; `hoody display input type-at` `{ text }` — keyboard.
   - `hoody display windows search` `{ name | class }` → `hoody display windows focus` / `hoody display windows geometry` / `hoody display windows active` to focus + locate.
   - `hoody display input batch` — bulk input replay; `hoody display input wait` between actions.
5. Tear down: kill the X process via `hoody terminal processes signal` from the terminal session, or `hoody terminal sessions delete` to drop the whole shell + its child GUIs.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=1`↔`display:":1"`, `terminal_id=2`↔`display:":2"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, swap step 3 for the `desktop-<N>` alias (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-CLI.md`). The desktop alias auto-spawns the DE for you; this recipe is for spawning **specific** apps under your own control.

## Quirks & gotchas

- **Sharing a terminal URL = handing out root.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as root: read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `proxyPermissionsContainer`. Share only with people you'd trust with `ssh root@…`. For wider audiences, gate (`setPasswordGroup` / `setTokenGroup` / `setIpGroup`), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script or a read-only `display` stream over a live PTY.
- `terminal_id` numeric **1–65535**. **40000–65535 reserved for ephemeral**; pin manual IDs in 1–39999.
- `terminal_id=0` = sentinel "treat as absent".
- **Display pairing.** GUI apps run with the `DISPLAY` value supplied by the JSON `display` field on `hoody terminal sessions create`. There is no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — if you want X11 rendering on display `:N`, pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` returns `/execute` immediately even with `wait=true`; queues until named PID exits (TUI-safe).
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is sent as RAW UTF-8 (written straight into the PTY unmodified); only the URL-form `?cmd=<base64>` is base64-decoded.**
- **`/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A body-only `terminal_id` is rejected by the validator before routing.
- Completion via `COMMAND_COMPLETED_MARKER_{id}` tail; stripped before `/result/{id}`. Programs swallowing it hang `wait=true`.
- **`wait=false` returns `status:"queued"` or `"running"` immediately** (NOT `"completed"`) — the kit only tracks the prompt-marker, not the underlying PID. Re-check actual output via `hoody terminal sessions raw-output` / `hoody terminal sessions snapshot`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. (Note: the generated SDK type only allows `png | jpeg | gif`, so `jpg` works only via raw HTTP.)
- **`hoody terminal processes signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).
- `hoody pty` (and `hoody ssh`, `hoody run`) rewrite to `hoody shell` — an interactive PTY, or a one-shot via a POSITIONAL command (`hoody pty <cid> -- uname -a`). There is no `--command` flag and no `--ephemeral` flag on `shell`. For pinned ids on the automation surface use `terminal sessions exec --terminal-id <n>`.

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id; the lower-level validator logs a near-identical `0-65535` warning.
- `400` config-error on `hoody terminal sessions create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `404` on `hoody terminal sessions command-result` after ephemeral-result-timeout — buffer GC'd.
- "Unknown program name" on `hoody proxy create` → use `program=exec`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Every step in every example was live-tested against a real `terminal-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

⚠ The HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body parser only consumes the `command`, `id`, `timeout`, the boolean wait sync flag, `cwd` and `env` keys); missing the query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`. Always pass `?terminal_id=N`. The `command` body field is sent as **raw UTF-8** (written straight into the PTY unmodified; only the URL form `?cmd=<base64>` is base64-decoded). `wait=true` returns when the kit sees the completion marker; programs that swallow the marker or only background-fork can return `status:"completed"` with empty stdout — re-check via `hoody terminal sessions raw-output` if in doubt. SDK callers pass `terminal_id` / `ephemeral` / `defer_pid` / `display` / `ssh_*` in the **options object** (2nd arg), NOT in the body: `hoody terminal sessions exec`.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session. All four steps live-verified.

**Step 1 — create the session.** `terminal_id` is required in the body; pin in `1–39999`.

```bash
hoody --container "$C" terminal sessions create --terminal-id 100 --shell /bin/bash --cols 120 --rows 30
```
**Step 2 — execute** with `wait=true`. The body's `command` field is **raw UTF-8** (no base64).

```bash
RESP=$(hoody --container "$C" terminal sessions exec --terminal-id 100 \
  --command 'echo HELLO; uname -a' --wait -o json)
CID=$(echo "$RESP" | jq -r .command_id)
```
**Step 3 — re-fetch the result later** via `hoody terminal sessions command-result`. This is a pinned (non-ephemeral) session, so the result stays available until the session is idle-reaped at `terminal-idle-timeout` (300 s default).

```bash
hoody --container "$C" terminal sessions command-result "$CID"
```
**Step 4 — clean up.** Always delete the session you created — autostart may re-spawn id 1, so explicit delete keeps your pinned ids tidy.

```bash
hoody --container "$C" terminal sessions delete 100
```
### 2. Ephemeral one-off — run a command without pinning anything

**Goal:** behave like `child_process.exec` — auto-allocated PTY, runs, evicts. No need to track a terminal_id.

```bash
hoody --container "$C" terminal sessions exec --ephemeral --wait \
  --command 'date -u +%FT%TZ; uname -m'
# Or use the equivalent shorthand:
hoody --container "$C" pty -- date -u +%FT%TZ; uname -m
```
⚠ Ephemeral allocates from `40000–65535` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

### 3. Automate a TUI — paste, press, wait, snapshot, find

**Goal:** drive an interactive program (here a simple shell echo, but the same recipe works for `htop`, `vim`, `fzf`, …). All five automation calls live-verified against a real session.

**Step 1 — create the session and paste a line** (raw, not base64; bracketed-paste optional).

```bash
hoody --container "$C" terminal sessions create --terminal-id 101
hoody --container "$C" terminal sessions paste --terminal-id 101 --text 'echo PASTED_TEXT'
```
**Step 2 — press Enter, wait for the screen to go stable, snapshot + regex-find.**

```bash
hoody --container "$C" terminal sessions press --terminal-id 101 --key enter
hoody --container "$C" terminal sessions wait --terminal-id 101 --mode stable --debounce-ms 500 --timeout-ms 3000
hoody --container "$C" terminal sessions snapshot --terminal-id 101
hoody --container "$C" terminal sessions find --terminal-id 101 --pattern PASTED
```
**Step 3 — discover what keys you can press** (named keys differ per kit build):

```bash
hoody --container "$C" terminal automation keys
```
Cleanup: `DELETE /api/v1/terminal/101`.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL, `terminal_id` in query. Inject input via REST `/write` or `/press`; the WS receives the rendered bytes.

```bash
hoody --container "$C" terminal sessions create --terminal-id 102
hoody --container "$C" terminal sessions connect --terminal-id 102 --readonly &
hoody --container "$C" terminal sessions write --terminal-id 102 --input 'echo VIA_WRITE' --enter
```
`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `hoody terminal sessions delete`.

### 5. Container introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness. All five endpoints live-verified.

```bash
hoody --container "$C" terminal system resources
hoody --container "$C" terminal processes list --limit 5
hoody --container "$C" terminal system ports
hoody --container "$C" terminal system display-info
hoody --container "$C" terminal system daemon-config
hoody --container "$C" terminal processes get 1
```
⚠ `hoody terminal system reboot` and `hoody terminal system shutdown` exist on the same surface — don't call them on a shared dev container, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. **You must pair the ids explicitly**: pass `display: 10` on `hoody terminal sessions create` so the kit exports `DISPLAY=:10` (the kit does NOT auto-derive DISPLAY from `terminal_id`).

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```bash
hoody --container "$C" terminal sessions create --terminal-id 10 --display 10
hoody --container "$C" terminal sessions exec --terminal-id 10 --command 'xeyes &' --wait
```
**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```bash
hoody --container "$C" terminal system display-info | jq '.[] | select(.display==10)'
hoody --container "$C" display screenshots capture --instance 10
```
Cleanup: kill `xeyes` via `system.sendSignal { name: 'xeyes', signal: 'SIGTERM' }` or just `hoody terminal sessions delete` (drops the shell + child GUIs).

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the container's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```bash
hoody --container "$C" terminal sessions create --terminal-id 11 \
  --shell ssh --ssh-host 10.0.0.42 --ssh-user deploy --ssh-port 22 --ssh-password hunter2
hoody --container "$C" terminal sessions exec --terminal-id 11 --command 'hostname; whoami' --wait
```
For SOCKS5, swap to `socks5_host` / `socks5_port` / `socks5_user` / `socks5_pass`. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with `wait=false`** so the request returns instantly while the agent stays alive in the PTY:

```bash
hoody --container "$C" terminal sessions create --terminal-id 50 --shell bash --cwd /workspace
hoody --container "$C" terminal sessions exec --terminal-id 50 --command 'sleep 600; echo agent-stopped' --cwd-auto-create
```
**Step 2 — reattach later** — same `terminal_id`, WS or REST, multiplayer:

```bash
hoody --container "$C" terminal sessions connect --terminal-id 50
hoody --container "$C" terminal sessions snapshot --terminal-id 50
```
⚠ `wait=false` returns `status:"queued"` or `"running"` immediately (NOT `"completed"`) because the kit only tracks the prompt marker, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `hoody terminal sessions raw-output` / `hoody terminal sessions snapshot`. **Never** start a durable agent with `ephemeral=true`: the 300 s sweep would kill it.

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` finishes. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```bash
hoody --container "$C" terminal sessions create --terminal-id 60
hoody --container "$C" terminal sessions exec --terminal-id 60 --defer-pid 12345 \
  --command 'echo build-finished; ./run-tests.sh' --wait
```
`defer_pid` returns `/execute` immediately even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits. Pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (`wait=false`), capture `command_id`.**

```bash
hoody --container "$C" terminal sessions create --terminal-id 70
CID=$(hoody --container "$C" terminal sessions exec --terminal-id 70 --command 'sleep 120' -o json | jq -r .command_id)
```
**Step 2 — abort** the command tracker. Add `force:true` to send SIGKILL; default sends SIGINT.

```bash
hoody --container "$C" terminal sessions abort "$CID" --force
```
**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `hoody terminal processes signal` by name. Targets every process matching the name.

```bash
hoody --container "$C" terminal processes signal --name sleep --signal SIGTERM
```
Cleanup: `hoody terminal sessions delete`. ⚠ Never call `hoody terminal system shutdown` / `hoody terminal system reboot` to recover from a hung command — they wipe the entire container.

## Reference

### `hoody terminal` (31) — Terminal sessions and execution

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody terminal automation keys` |  | read | List supported key names for /press endpoint | `terminal.terminalAutomation.listSupportedKeys` | `hoody terminal automation keys` |
| `hoody terminal automation metrics` |  | read | Get terminal automation metrics | `terminal.terminalAutomation.getAutomationMetrics` | `hoody terminal automation metrics` |
| `hoody terminal health` |  | read | Service health check | `terminal.health.check` | `hoody terminal health` |
| `hoody terminal open` |  | action | Open the Terminal kit service (web terminal) in your browser |  | `hoody terminal open [index] [--url]` |
| `hoody terminal processes get` | show, describe | read | Get process details by PID | `terminal.system.getProcess` | `hoody terminal processes get 1234` |
| `hoody terminal processes list` |  | read | List all system processes | `terminal.system.listProcessesIterator` | `hoody terminal processes list --sort cpu --limit 10 --filter <filter>` |
| `hoody terminal processes signal` |  | write | Send signal to process(es) | `terminal.system.sendSignal` | `hoody terminal processes signal --pid 1234 --name my-resource --signal SIGTERM --force` |
| `hoody terminal sessions abort` |  | write | Abort a running command | `terminal.abort` | `hoody terminal sessions abort abc-123 --force` |
| `hoody terminal sessions automation-state` |  | read | Get per-session automation state | `terminal.terminalAutomation.getSessionAutomationState` | `hoody terminal sessions automation-state 1` |
| `hoody terminal sessions command-result` |  | read | Get command result | `terminal.execution.getResult` | `hoody terminal sessions command-result abc-123` |
| `hoody terminal sessions connect` |  | read | WebSocket terminal connection | `terminal.sessions.connectWebSocket` | `hoody terminal sessions connect --terminal-id 1 --readonly --cwd <cwd> --cwd-auto-create --shell <shell> --user alice --cmd "ls -la" --env <env> --display :0 --pid 1234 --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --socks5-host <socks5_host> --socks5-port <socks5_port>` |
| `hoody terminal sessions create` | new, add | write | Create a terminal session | `terminal.sessions.create` | `hoody terminal sessions create --terminal-id 1 --ephemeral --display :0 --shell <shell> --user alice --cwd <cwd> --startup-script <startup_script> --welcome --debug --desktop --desktop-env <desktop_env> --cols 10 --rows 10 --wait-until-display --wait-timeout 10 --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --ssh-key <ssh_key> --socks5-host <socks5_host> --socks5-port <socks5_port> --socks5-user <socks5_user> --socks5-pass <socks5_pass>` |
| `hoody terminal sessions delete` | rm, remove | destructive | Delete a terminal session | `terminal.sessions.delete` | `hoody terminal sessions delete 1` |
| `hoody terminal sessions exec` |  | action | Execute command in terminal session | `terminal.execution.execute` | `hoody terminal sessions exec --terminal-id 1 --ephemeral --defer-pid 10 --defer-start-time-ticks 0 --defer-timeout-ms 100 --defer-poll-ms 100 --reset --cwd <cwd> --cwd-auto-create --shell <shell> --user alice --cmd "ls -la" --env <env> --skip-display-wait --display-wait-timeout 10 --display :0 --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --socks5-host <socks5_host> --socks5-port <socks5_port> --socks5-user <socks5_user> --ssh-key <ssh_key> --socks5-pass <socks5_pass> --command "ls -la" --id abc-123 --timeout 10 --wait` |
| `hoody terminal sessions find` |  | read | Search terminal screen with regex | `terminal.terminalAutomation.findInTerminal` | `hoody terminal sessions find --terminal-id 1 --pattern "TODO" --scope screen --limit 10 --case-insensitive --scroll-offset 10` |
| `hoody terminal sessions history` |  | read | Get terminal command history | `terminal.sessions.listHistoryIterator` | `hoody terminal sessions history 1` |
| `hoody terminal sessions list` |  | read | List all terminal sessions | `terminal.sessions.listIterator` | `hoody terminal sessions list --history-limit 10 --history-lines 10` |
| `hoody terminal sessions paste` |  | write | Paste text into terminal | `terminal.terminalAutomation.pasteTerminalText` | `hoody terminal sessions paste --terminal-id 1 --text "Hello" --bracketed` |
| `hoody terminal sessions press` |  | write | Send named key presses to terminal | `terminal.terminalAutomation.pressTerminalKeys` | `hoody terminal sessions press --terminal-id 1 --keys <keys> --key <key>` |
| `hoody terminal sessions raw-output` |  | read | Get raw terminal output | `terminal.sessions.getRawOutput` | `hoody terminal sessions raw-output --terminal-id 1 --format download --tail 10` |
| `hoody terminal sessions screenshot` |  | read | Capture terminal screenshot | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshot --terminal-id 1 --format png --foreground <foreground> --background <background> --fontsize 100 --save` |
| `hoody terminal sessions snapshot` |  | read | Get rendered terminal snapshot | `terminal.terminalAutomation.getTerminalSnapshot` | `hoody terminal sessions snapshot --terminal-id 1 --include-colors --include-highlights --scroll-offset 10` |
| `hoody terminal sessions wait` |  | write | Wait for terminal condition | `terminal.terminalAutomation.waitForTerminal` | `hoody terminal sessions wait --terminal-id 1 --mode stable --debounce-ms 100 --pattern "TODO" --timeout-ms 100 --search-scope <search_scope> --include-colors --include-highlights` |
| `hoody terminal sessions web` |  | read | Get web terminal interface | `terminal.web.get` | `hoody terminal sessions web --terminal-id 1 --cwd <cwd> --cwd-auto-create --shell <shell> --user alice --cmd "ls -la" --readonly --title "My Title" --font-size 100 --background-color <background_color> --panel <panel> --panel-visible --panel-position <panel_position> --panel-width <panel_width> --panel-resizable --hide-toolbar --ssh-host <ssh_host> --ssh-user <ssh_user> --ssh-port <ssh_port> --ssh-password <ssh_password> --socks5-host <socks5_host> --socks5-port <socks5_port> --socks5-user <socks5_user> --socks5-pass <socks5_pass> --desktop --desktop-env <desktop_env> --redirect <redirect> --redirect-delay 10 --arg <arg> --welcome --debug --reset --pid 1234 --env <env> --display :0 --env-inject --startup-script <startup_script> --ssh-key <ssh_key> --panel-height <panel_height>` |
| `hoody terminal sessions write` |  | write | Write input to terminal | `terminal.write` | `hoody terminal sessions write --terminal-id 1 --input <input> --enter` |
| `hoody terminal system daemon-config` |  | read | Get daemon programs configuration | `terminal.system.getDaemonConfig` | `hoody terminal system daemon-config` |
| `hoody terminal system display-info` |  | read | Get display information | `terminal.system.getDisplayInfo` | `hoody terminal system display-info` |
| `hoody terminal system ports` |  | read | List all listening network ports | `terminal.system.listPortsIterator` | `hoody terminal system ports --protocol <protocol> --user alice --port 8080 --ip <ip> --skip-program <skip_program> --http-only --hoody-only` |
| `hoody terminal system reboot` |  | write | Reboot the system | `terminal.system.reboot` | `hoody terminal system reboot --delay 10` |
| `hoody terminal system resources` |  | read | Get system resources and statistics | `terminal.system.getResources` | `hoody terminal system resources` |
| `hoody terminal system shutdown` |  | write | Shutdown the system | `terminal.system.shutdown` | `hoody terminal system shutdown --delay 10` |


---

<!-- ===== namespace: tunnel ===== -->

# `tunnel` — reverse tunnels for HTTP/WS/TCP via container relay

## Purpose

**Mental model: ngrok, but built into every container, with the rest of the platform glued in for free.** Same job — reverse tunnel laptop ↔ container — but the public URL lives on the container's own `*.containers.hoody.com` host, so it inherits everything the proxy already does:

- **Capability gates** (`proxyPermissionsContainer.*`) apply unchanged — Password / Token / JWT / IP groups gate the tunnel URL the same way they gate any kit URL.
- **Request hooks (MITM)** — wire `proxyHooks.*` rules to inspect, transform, redirect, or block requests before they reach the tunnel; same engine as the rest of the platform.
- **Proxy logs** — every tunnel request is captured by `proxyLogs.*` automatically (status, latency, headers, source IP). No extra setup.
- **Friendly aliases** — point a `<alias>.{server_name}.containers.hoody.com` at the tunnel via `hoody proxy create` so the public URL hides `containerId`.

Two surfaces:
- **EXPOSE**: publish laptop HTTP/1.1 (+WS) on container's public domain. (ngrok `http`)
- **PULL**: project laptop TCP onto container loopback. (ngrok `tcp` reverse)

Each surface has:
- **Data plane** (open the tunnel) — long-running WebSocket process. Lives in a separate driver (see Quirks).
- **Control plane** (inspect / kill) — short request/response: `hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel health`, `hoody tunnel sessions kill`.

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
2. `hoody tunnel sessions kill` with `grace_ms` 0–5000 (default 50). Returns `202`. Live → GOAWAY then close; orphans drop now (parking skipped).
3. Re-list before re-binding.

### 3. MITM / log / gate the tunnel

Tunnel traffic flows through the same proxy as every other kit URL, so:

- **Logs**: `client.proxyLogs.logs.list({ serviceName: 'tunnel' })` returns every request that hit the tunnel — status, latency, source IP, headers — and `client.proxyLogs.logs.streamLogs(...)` for live tail; the generated SDK stream method does **not** expose `serviceName`, so use `list({ serviceName: 'tunnel', ... })` for tunnel-scoped polling. (proxyLogs query params on `list` are `limit` / `offset` / `projectId` / `containerId` / `serviceName` / `level` / `includeRequestBody` / `includeResponseBody` / `last` / `afterId` / `cursor` / `kind` / `method` / `source`; there is no `program` filter.) No agent on the laptop needed.
- **Hooks (MITM)**: register a `proxyHooks` rule scoped to `program: 'tunnel'` (or by alias hostname) to inspect / rewrite / inject / block requests before they reach the WS data plane. Same hook DSL as for any kit. Useful for: stripping a bearer header on the way through, redacting PII, rate-limiting, swapping bodies on the fly, fault-injecting for tests.
- **Gates**: layer `proxyPermissionsContainer.set{Password,Token,Jwt,Ip}Group` on the container; the tunnel URL becomes auth-gated without the laptop ever needing to handle it.

## Quirks & gotchas

- The data-plane (open / pull) is a long-running driver process, not a request/response call. Runtime: Bun 1.3+ or Node 20+ (the listening-server form is Bun-only). The main `tunnel` namespace covers only the read/observability + admin surface (`hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel sessions kill`).
- `BIND_OK.publicUrl=null` without `HOODY_TUNNEL_PUBLIC_URL_PATTERN`.
- `grace_ms` capped at 5000ms; over → `400`.
- Ports `<80` rejected; `80..=1023` need `--allow-privileged-expose`/`--allow-privileged-pull`.
- PULL loopback-only. EXPOSE has atomic takeover (`takeover:true`); old owner gets `RESET(BIND_TAKEOVER)`+`BIND_REVOKED`. PULL takeover → `BIND_ERR(INVALID_KIND)`.
- Idle reaping needs zero streams AND zero bindings. Orphans with parked bindings wait 60s takeover-grace.
- v1 vs v2 subprotocols share `/connect` (`hoody-tunnel.v1` for single-WS sessions, `hoody-tunnel.v2` for multi-WS shard pools); `isV2` on `hoody tunnel sessions list` reports the shape. Both subprotocols support graceful resume via `resume.sessionId` in HELLO; `isV2:false` does NOT mean "no resume".
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
- `503`+`Retry-After:5` at visitor URL — orphan takeover-grace window (set by `expose` driver kill, NOT by admin `hoody tunnel sessions kill` which skips orphan parking).

## Related namespaces

- `proxyLogs` — every tunnel request appears here automatically; filter by `serviceName: 'tunnel'` (there is no `program` filter on the proxy-log API).
- `api` — `proxyHooks.*` (MITM rules), `proxyPermissionsContainer.*` (capability gates), `hoody proxy create` (friendly hostnames hiding `containerId`).
- `exec` — for one-off HTTP handlers hosted directly inside the container (no laptop). `curl` — outbound HTTP from the container. `browser` — full headless Chromium. `daemon` — supervise long-running processes.

## Examples

The `tunnel` namespace covers only the **observability + admin** surface — `hoody tunnel health`, `hoody tunnel list`, `hoody tunnel sessions list`, `hoody tunnel bindings list`, `hoody tunnel metrics`, `hoody tunnel sessions kill`. The data plane (open / pull) is a long-running WebSocket driver that lives in a separate package; it is intentionally out of scope here, so these 7 examples assume *somebody else* (a teammate's tunnel expose/pull session, your CI machine's tunnel session, a test rig) is currently holding the tunnel. You're the operator: inspecting it, scraping metrics, killing it. Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

Read-only steps were live-attempted against the test container; on this deployment the tunnel kit process was not running on that container at the moment of writing (502); the admin endpoints serve independently of any session. Schemas, status codes, response shapes and CLI flags are verified against `generated/openapi.public.json`, `docs/reference/CLI-COMMANDS.md`, and a previously-recorded happy-path run (`scenarios/logs/2026-05-05_22-21-38/tunnel-kit.json`).

### 1. Health probe — kit alive, FD budget not exhausted

**Goal:** before any other call, confirm the tunnel kit is reachable and not saturated. Response includes `pid`, `started`, `userAgent`, `fds` (Unix-only file-descriptor count when available), and `memory.rss`.

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

**Goal:** you got a `sessionId` from #2; now you want the operator-facing detail (who's connected, how loaded). Returns `peerAddr` (`<ip>:<port>` of the laptop holding the tunnel), `connectionsGranted` (lifetime), `activeStreams` (right now), `maxStreams` (negotiated cap), `isV2` (control-plane protocol), and `bindings[]`.

```bash
hoody --container "$C" tunnel sessions list -o json \
  | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s) | {peer:.peerAddr, load:"\(.activeStreams)/\(.maxStreams)", binds:.bindings}'
```
`activeStreams / maxStreams` is the headroom number — a session sitting at `48/50` is one curl away from `STREAM_LIMIT`. `isV2:false` means the session negotiated the single-WebSocket v1 control plane; resume is still supported via `resume.sessionId` while the orphan is in takeover grace.

### 4. List bindings — which ports are exposed across every session

**Goal:** answer "what container ports are tunnels eating right now?". `hoody tunnel bindings list` flattens across one row per active binding — `port`, `kind` (`http` / `tcp`), `mode` (`expose` / `pull`). EXPOSE rows include the owning `sessionId`/`bindId`; current PULL rows report `sessionId: ""` and `bindId: 0`.

```bash
hoody --container "$C" tunnel bindings list -o json \
  | jq '.bindings | group_by(.mode) | map({mode:.[0].mode, count:length, ports:map(.port)})'
```
Useful pre-flight check before someone tries to bind another port — `BIND_ERR(PORT_IN_USE)` is one of the most common BIND failures. Also: the wire field is `port` here but `containerPort` inside the per-session `bindings[]` array of #3 — same value, different name (verified against `tunnel_BindingDetail` vs `tunnel_BindingInfo` in the openapi spec).

### 5. Scrape Prometheus metrics — sessions, bindings, FD permits

**Goal:** wire the tunnel kit into your scrape job. Endpoint emits Prometheus text (one of the few endpoints that's not JSON). Three live-verified counters: `hoody_tunnel_sessions_active`, `hoody_tunnel_bindings_active`, `hoody_tunnel_fd_permits_available`.

```bash
hoody --container "$C" tunnel metrics -o raw \
  | grep -E '^hoody_tunnel_(sessions_active|bindings_active|fd_permits_available)'
# -o raw is REQUIRED: without it the text/plain body prints as one JSON-quoted line.
```
For a dashboard, register the kit URL as a Prometheus scrape target via `hoody proxy create` so the scrape config doesn't carry `containerId`, then gate it with `hoody containers proxy groups ip set` so only your monitoring VPC can hit `/api/v1/tunnel/metrics`.

### 6. Kill a stuck session (recipe — needs a real session)

**Goal:** a teammate's tunnel expose session is wedged; you want it gone without restarting the kit. `hoody tunnel sessions kill` returns `202` with `{sessionId, status}`. `grace_ms` ∈ [0, 5000] (default 50, anything above 5000 → `400`); the kit sends GOAWAY then waits up to that many ms for in-flight streams before closing. Orphan sessions skip the parking grace window and drop immediately.

⚠ Don't run this in the doc as live verification — it kills whoever's actually connected. Recipe only.

```bash
SID=$(hoody --container "$C" tunnel sessions list -o json \
  | jq -r '.sessions[] | select(.peerAddr | startswith("203.0.113.")) | .sessionId' | head -1)
hoody --container "$C" tunnel sessions kill "$SID" --grace-ms 1000
hoody --container "$C" tunnel sessions list -o json | jq --arg s "$SID" '.sessions[] | select(.sessionId==$s)'
```
After a non-admin driver disconnect, visitors of an orphaned `expose` URL see `503 Retry-After:5` during takeover grace. `hoody tunnel sessions kill` (admin) skips orphan parking and tears bindings down, so do **not** expect that 60 s 503 window from an admin kill — bindings drop immediately. PULL bindings drop instantly in both paths.

### 7. Auto-discover orphans + low-FD alert (monitoring recipe)

**Goal:** one cron-able script that watches both the orphan count (parked bindings whose laptop dropped) and the FD permits remaining; pages on either. `hoody tunnel list` carries both numbers.

```bash
J=$(hoody --container "$C" tunnel list -o json)
ORPH=$(echo "$J" | jq '.orphanedSessions'); FDS=$(echo "$J" | jq '.fdPermitsAvailable')
[ "$FDS" -lt 64 ] || [ "$ORPH" -gt 0 ] && echo "ALERT orphans=$ORPH fds=$FDS"
```
For a continuous live tail of `GOAWAY` / `IDLE_TIMEOUT` / `BIND_REVOKED` events as they happen, attach with the tunnel driver helpers (`TunnelSession` / `tunnelExpose` / `tunnelPull`, re-exported from the main SDK package) to `/api/v1/tunnel/connect` — that's the data-plane driver's surface and lives outside this namespace; do **not** use generated `GET /api/v1/tunnel/connect` for a real attach. The polling recipe above stays inside the request/response admin surface.

## Reference

### `hoody tunnel` (8) — Reverse tunnels — expose HTTP/WS/TCP services online via container relay

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody tunnel bindings list` |  | read | List active bindings across all sessions | `tunnel.listBindings` | `hoody tunnel bindings list` |
| `hoody tunnel expose` |  | action | Expose a local service to the internet through the container (long-running, Ctrl+C to stop) |  | `hoody tunnel expose 3000` |
| `hoody tunnel health` |  | read | Tunnel kit health | `tunnel.health.check` | `hoody tunnel health` |
| `hoody tunnel list` | ls | read | List all active tunnels (combined sessions + bindings) | `tunnel.listTunnels` | `hoody tunnel list` |
| `hoody tunnel metrics` |  | read | Prometheus metrics for the tunnel kit | `tunnel.getMetrics` | `hoody tunnel metrics` |
| `hoody tunnel pull` |  | action | Pull a TCP service from local machine into the container loopback (long-running, Ctrl+C to stop) |  | `hoody tunnel pull 5432 --port 5432` |
| `hoody tunnel sessions kill` | stop, terminate | destructive | Terminate an active tunnel session | `tunnel.killSession` | `hoody tunnel sessions kill abc-123 --grace-ms 100` |
| `hoody tunnel sessions list` |  | read | List active tunnel sessions | `tunnel.listSessions` | `hoody tunnel sessions list` |


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

1. `hoody watch create`
2. `hoody watch events stream` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `hoody watch events list`/`Iterator` with `since_id`; persist highest `id`.

### 4. WebSocket consumer

1. `hoody watch create`
2. `GET /watchers/{id}/events/ws` — respond to server `Ping` within ~20s or socket closes
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory and teardown

List/inspect/delete via `hoody watch list`/`get`/`hoody watch delete`.

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
- `503 SHUTTING_DOWN` — only on `hoody watch events stream`/`GET /watchers/{id}/events/ws` while draining; history reads still work
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Every step in every example was live-tested against a real `watch-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. **There is no `update` endpoint** — change a watcher's config = delete + recreate.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history.

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

**Step 1 — open the SSE stream.** Each frame is `id: <n>\nevent: file_event\ndata: {…json…}\n\n`. The `id` is monotonic; persist it as your resume cursor.

```bash
hoody --container "$C" watch events stream --id "$WID"
```
**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if the buffer rolled past your cursor you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```bash
hoody --container "$C" watch events stream --id "$WID" --since-id "$LAST_ID"
```
### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer needs binary frames or bidirectional control. Server sends Ping every ~20 s; miss the pong and the socket closes.

```bash
# CLI streams via SSE (no WS subcommand); use `events stream` for live-tail.
hoody --container "$C" watch events stream --id "$WID" --since-id 37000
```
A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from `newest_available_id`. Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```bash
hoody --container "$C" watch events list --id "$WID" \
  --since-id "$LAST" --limit 200 -o json > /tmp/events.json
```
### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild only on real content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`.

```bash
WID=$(hoody --container "$C" watch create \
  --paths /tmp/wt --kinds modified --coalesce-ms 50 -o json | jq -r .id)
hoody --container "$C" watch events list --id "$WID" -o json \
  | jq '[.items[].kind] | unique'
```
⚠ A single `writeFile` triggers two `inotify` events on Linux: the `created` (size 0) and a follow-up `modified` once data is written. With `kinds: ["modified"]` you skip the empty-file noise and only see real writes — live-verified.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`.

```bash
WID=$(hoody --container "$C" watch create --paths /tmp/wt \
  --include '**/*.log' --exclude '**/secret-*.log' -o json | jq -r .id)
```
### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` is the inotify-side counter (post-coalesce); `active_clients` counts live SSE+WS connections.

```bash
hoody --container "$C" watch list --limit 200 -o json \
  | jq '.items[] | {id, paths: .config.paths, events_seen: .stats.events_seen}'
```
### 8. Change a watcher's config — there is no `update`, you delete and recreate

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. The kit exposes only `create | get | delete` — there is **no** `PATCH /watchers/{id}`. Pattern: snapshot the old config, delete, create new, hand off the resume cursor.

```bash
hoody --container "$C" watch delete --id "$WID"
hoody --container "$C" watch create --paths /tmp/wt --kinds modified --kinds removed
```
⚠ Event ids are process-global, not per-watcher; the `since_id` cursor remains numerically valid across the swap, but the new watcher's first event will have an id ≥ the global counter, so any gap below that is from the old watcher's stream — treat HISTORY_GAP as the trigger for a full re-list, not the swap itself.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /watchers/{id}` and `/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```bash
hoody --container "$C" watch delete --id "$WID"
hoody --container "$C" watch get    --id "$WID"   # exits non-zero
```
### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**.

```bash
hoody --container "$C" watch events list --id "$WID" \
  --since-timestamp "$(date -u -d '5 minutes ago' +%FT%TZ)" --limit 200
```
For a rename the kit relies on the notify backend's combined `RenameMode::Both` event, which carries both paths: it emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side with `old_path: null`. Filter on `old_path != null` to keep only the paired form.

## Reference

### `hoody watch` (7) — File system watchers — observe file changes and tail live events

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody watch create` |  | write | Create a new file system watcher. `--paths` is repeatable; `--include`/`--exclude`/`--ignore-dirs`/`--kinds` are optional repeatable filters. | `watch.watchers.create` | `hoody watch create --coalesce-ms 100 --exclude "*.ts" --history-size 100 --ignore-dirs <ignore_dirs> --include "*.ts" --kinds created --paths /home/user/src --recursive --skip-hidden` |
| `hoody watch delete` |  | write | Delete a watcher and tear down its inotify subscriptions | `watch.watchers.delete` | `hoody watch delete --id abc-123` |
| `hoody watch events list` |  | read | List historical events for a watcher (paged). Supports cursor resume via `--since-id` or `--since-timestamp`. | `watch.streams.listEventsIterator` | `hoody watch events list --id abc-123 --since-id 10 --since-timestamp 1750000000 --page 10 --limit 10` |
| `hoody watch events stream` |  | read | Live-tail watcher events over Server-Sent Events. Resumes from `--since-id` on reconnect. | `watch.streams.streamSse` | `hoody watch events stream --id abc-123 --since-id 10 --since-timestamp 1750000000` |
| `hoody watch get` |  | read | Get a single watcher by id, including its config and stats | `watch.watchers.get` | `hoody watch get --id abc-123` |
| `hoody watch health` |  | read | Health check for the watch service (liveness, memory usage, watcher count) | `watch.health.check` | `hoody watch health` |
| `hoody watch list` |  | read | List all file system watchers (paged) | `watch.watchers.listIterator` | `hoody watch list --page 10 --limit 10` |

