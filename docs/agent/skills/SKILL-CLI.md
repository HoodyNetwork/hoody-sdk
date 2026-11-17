> _**CLI skill (basic)** · ~28,509 tokens · hoody-sdk v1.0.1_

# CLI mode — `hoody` command

**Online? Use HTTP, not this CLI** (`SKILL-HTTP.md`): in a web chat (ChatGPT, claude.ai, …) or a throwaway sandbox that is not a Hoody computer or the user's own computer, `hoody` is not installed, a login made there does not last, and it is not the user's machine. Check `command -v hoody`; if it is missing, use HTTP rather than installing it.

Covers a mapped subset of the SDK / HTTP surface (somewhat fewer CLI operations than SDK methods) — not a 1:1 mirror. Command names sometimes differ from SDK accessors (e.g. `hoody kv set` for the SDK's `sqlite.kv.set`), a few kits carry commands of their own shape (`pipe`, `tunnel`), and SDK-only helpers (`listAll` / `listIterator`) have no CLI form. For the exact command for a given operation, consult the `SKILL-CLI/<ns>.md` per-namespace pages.

## What is Hoody

Hoody is a remote-first computing platform: every workflow — coding, browsing, scheduling, agent runtimes, file storage, GUI desktops, HTTP services, scripts, databases, displays — runs in account-owned cloud computers reachable by URL, with zero local setup. **Thesis: everything remote, no friction.** A computer is a **full Linux box (systemd + root, just like a VM — not a Docker-style minimal sandbox)** you can spin up, fill, and use from anywhere; ports are auto-published on `https://...computers.hoody.com`; GUIs render to browser tabs; one-shot scripts mount as HTTP endpoints; databases, terminals, file watchers, full XFCE/MATE desktops, and SSH are first-class kits. Standard distro tooling works as expected — `apt install nginx && systemctl enable --now nginx`, `journalctl`, `crontab`, etc. The CLI / SDK / HTTP surfaces are three skins on the same control + computer plane — drive whichever fits your runtime.

**Prefer a GUI?** The **Hoody Agent** browser GUI runs at `https://{P}-{C}-agent-1.{N}.computers.hoody.com` — file browser, code editor, agent sessions, PR review, MCP, memory, image-gen, web search, all in a browser tab. It's the human-facing surface over the same `agent` kit these skills drive programmatically (same `-agent-1` host — the HTTP API lives under its `/api/v1/agent/` path). **Every kit UI is also iframable** (`code`, `files`, `terminal`, `display`, `desktop`, `notes`, `agent`, …; an exec script's response keeps the framing policy it sends) — you can compose a full HTML "operating system" out of kit iframes with no native code. Use whichever surface fits the moment.

**Need a custom API, script-as-service, or multi-step workflow?** Default to `exec`. Drop a `.ts` / `.js` (or shell-out via Bun) into the scripts dir and it auto-mounts as an HTTP endpoint — no framework, no deploy, schema-validated, logged, metric-instrumented, alias-able to a public hostname. Each script is a micro-service (serverless: a fresh VM per request; `// @mode worker` keeps one VM per deployment); **multi-step workflows** (call agent A → check with agent B → trigger action C) are just one script orchestrating the steps. (Not a sandbox for untrusted code — see `exec` namespace.)

**Need a GET-only URL for something that's actually a POST/PUT?** Use `curl` — `hoody curl run --url <target> --method POST [...]` drives the curl kit; over HTTP the kit can turn any REST call into a single GET-able link for browser-only callers, restricted webhooks, agents with web-fetch-only access (the CLI and SDK send the POST form). See `curl` namespace.

**Stuck, or unsure how to do something?** Ask Hoody's public docs assistant — an unauthenticated MCP endpoint at `https://chatbot.hoody.com/mcp` (one tool, `search_hoody_docs`; or the `POST /api/chat` SSE fallback) answers any "how do I…" with cited doc URLs. Use it for discovery when you're not sure which namespace fits.

## When to choose CLI

Agents that need a single-binary surface: `-o table|json` dense; pipe `jq`; streams via `-o ndjson`.

## Getting a `hoody` CLI

The acquisition steps below are for the user to run on their own computer. An agent uses an already-installed CLI only; if `command -v hoody` fails, use HTTP.

### Already installed?

```bash
hoody --version       # if this works, skip to "Login"
```

### Zero-install — public SSH bridge

`ssh hoody.com` opens an in-memory shell with the CLI already on `$PATH` — nothing to install, runs anywhere `ssh` works (CI, locked-down boxes, etc.). Two modes:

```bash
ssh hoody.com                      # interactive — the CLI is on $PATH; bare `hoody` prints where commands act and every command, then exits
ssh -tt "$HOODY_TOKEN@hoody.com"  # scripted — your Hoody token as the username, no prompt
```

Agents: set `HOODY_AGENT_MODE=1` for stable plain output; bare `hoody` then prints a short key/value block instead of the page.

The bridge needs a terminal: a session without one is refused, so pass `-tt` when stdin is piped. It runs no remote command (`ssh hoody.com <command>` is refused); send commands through the shell session.

Inside the SSH session: `hoody --help`, `hoody login`, `hoody projects list`, etc. — exactly the same binary as a local install. Each session runs in a fresh sandbox whose home directory is in memory and discarded when the session ends; what you type and see is not recorded. The gateway does log connection and session metadata (your IP address, timing, how the session ended) for operations and abuse protection.

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
irm https://install.hoody.com/install.ps1 | iex
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

Browser sign-in is the default when a person is present: give the user the printed link and code; they sign in and approve on Hoody's page, and the CLI saves the session. If your shell tool shows output only after a command exits, run it in the background and read the link from its output. Existing account: always browser sign-in first; if it fails, stalls or is refused, ask for a token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password (use one only if offered). Never repeat or store a secret. The password flags below are for an offered password or the user's own terminal:

```bash
hoody login --username alex --password "$HOODY_PASSWORD"
```

- `--username` (`-u`) is the primary login flag; the CLI accepts `--email` as an alternative for email-based login. The server enforces the alphanumeric/underscore/hyphen pattern, so a malformed value fails at the request.
- `--password` takes an optional value: a bare `-p` prompts for it securely. In a terminal, `hoody login` with no flags opens a menu (password, browser, or token). Without a terminal (a script, `-o json`, `--non-interactive`), `--web` (browser sign-in) and `--token <hdy_…>` work as usual; the password path needs an identifier AND a password, supplied through flags, `--password-stdin` or environment variables: a missing identifier comes from `HOODY_USERNAME` (a value containing `@` is sent as `email`), a missing password from `HOODY_PASSWORD`. With none of these it stops with `Missing credentials.`. Token cached at `~/.hoody/config.json`.
- Base URL: the CLI targets `https://api.hoody.com` by default. Override it with `--base-url <url>` (CLI flag is kebab-case), the `HOODY_BASE_URL` (or `HOODY_API_URL`) environment variable, or `hoody config set baseUrl <url>` (config key is camelCase); `hoody config get --resolved` prints the effective settings.

## Config and profiles

`hoody config set <key> <value>` writes `~/.hoody/config.json`; `hoody config get [key]` reads a value or displays the config. `--profile <name>` switches account; each has own token, base-url, default computer.

## Auth modes

Priority: `--token`/`-t` > `HOODY_TOKEN` > stored session. Kit-service routing uses the per-computer capability URL.

## Computer scope — `--computer`/`-c`

Every command that targets a computer kit (`hoody browser|code|cron|curl|daemon|display|exec|files|notes|notifications|pipe|db|kv|terminal|tunnel|watch …`; `db` is the sqlite kit's SQL group, and `kv` is its key-value group; `logs` is a kit URL slug only and has no CLI command group; tail logs via `proxy logs` / `exec logs` / `daemon programs logs`) needs a computer id. Pipe commands also take `--pipe-url <url>` or `HOODY_PIPE_URL`, which skip computer resolution. (`hoody agent` IS a kit command group whose *bare* form opens the Hub, like `hoody hub`; `hoody agent prompt …` and the generated `agent sessions|models|…` subcommands live under it.) Resolution order:

1. `--computer <id>` / `-c <id>` (global flag, before the subcommand)
2. `HOODY_COMPUTER` env var
3. Per-profile sticky default via `hoody local defaults set computer <id>` (recommended; `local defaults` covers the curated user-facing keys `computer`/`realm`/`output`/`noColor`/`quiet`). `local defaults` acts on the profile named by `--for-profile`, `--profile`, `HOODY_PROFILE` or `defaultProfile`, else `default`; `hoody config set computer <id>` writes the same setting, but to the profile named by `--for-profile` or `--profile` only, else the root, so with `HOODY_PROFILE` or `defaultProfile` set the two can write different places.

A computer id is the 24-hex id from `hoody computers list`. `--computer`/`-c` also takes the exact, case-sensitive name of one computer, for kit routing (`files`, `terminal`, …) as well: the CLI looks the name up among your computers and uses its id; an unknown or ambiguous name, or a lookup that could not read every computer, is refused and asks for the id. Prefer the id in scripts: a name can later belong to another computer. `hoody agent` resolves a name given as its positional argument or through `-c`, and `hoody computers get <name>` and `hoody config set computer <name>` take a name the same way and use its id.

```bash
COMPUTER_ID=$(hoody computers list -o json | jq -r '.computers[0].id')
hoody --computer "$COMPUTER_ID" files get /home/user       # inline
HOODY_COMPUTER="$COMPUTER_ID" hoody files get /home/user   # env
hoody local defaults set computer "$COMPUTER_ID"           # sticky; then plain `hoody files get /home/user`
```

Account-level commands (`hoody login`, `hoody projects`, `hoody wallet`, `hoody auth`, `hoody vault`, `hoody computers list`, etc.) hit the control-plane API and ignore `--computer`. Control-plane commands that act on ONE computer read it from `--computer` and require it, e.g. `hoody computers env …`, `hoody snapshots …`, `hoody firewall …`, `hoody network …`, `hoody storage shares get …`. Check `--help` for a `Requires: --computer` line.

## Output formats

`--output`/`-o`. With no saved or typed format, requests use the human layout on a terminal and `table` when piped, in CI or with `HOODY_AGENT_MODE=1`; when piped, in CI or in agent mode, generated event streams and `events stream` print `ndjson`, while `proxy logs stream` and `pipe progress stream` print readable lines unless you type `-o ndjson` or `-o json` (`hoody agent prompt` defaults to `pretty` on a terminal and keeps `ndjson` when piped). Type `-o table` to get the table layout on a terminal.

| Fmt | For |
|---|---|
|`table`|plain layout: the default on a pipe, in CI and in agent mode|
|`json`|`jq`|
|`yaml`|structured|
|`wide`|extra cols|
|`raw`|unwrapped body|
|`ndjson`|streams (auto SSE)|
|`pretty`|stream variant|

## Convenience aliases

- `chat`, `login`, `signup`, `logout`, `config`, `local`, `update`
- `shell` (the one-shot command is positional: `hoody shell <cid> -- uname -a`; there is no `--command` flag)
- `open` (kit UI); `desktop open`; `kits list`

## Index of common ops

§ Core operations covers: login/2FA, projects, computers, exec, files, screenshots, sqlite, watch, snapshots, vault, wallet. Per-namespace deep dives: `SKILL-CLI/<ns>.md`. URL routing → § Proxy URLs. Auth → § Auth model.

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
> - Watch **`proxyLogs`** for unexpected callers; if a URL leaks, disable its alias with `hoody proxy aliases disable <aliasId>` (not instant: it usually stops serving within about 30 seconds and can take longer).
> - For untrusted reviewers (customers, support tickets, public demos): do not hand out a `display` kit URL as a "read-only" view — its readonly setting is client-side only, and anyone holding the URL can still call the display's input API (clicks, typing). Build a constrained `exec` script that exposes only the operation they need, such as serving a captured screenshot.

### Tips for embedders

- The proxy sets sane cross-origin headers; iframe loading works out of the box for kits that need it (`files`, `code`, `terminal`, `display`, `desktop`, `notes`, `agent`, `browser` viewer surfaces).
- Capability-token gates apply per iframe — gate the kit URL with Password / Token / JWT / IP / Hoody identity via `hoody computers proxy permissions *` and `hoody computers proxy groups *` and the embedded surface inherits the gate (so a public Slack canvas embed can still require auth).
- Use `hoody proxy aliases create --computer-id <computer_id> --program '<kit>' --alias repo-acme` to ship a brandable hostname (`https://repo-acme.{N}.computers.hoody.com`) into the iframe instead of the `{computerId}` URL. `agent` is the exception: an alias to it is accepted but never routes, so embed the agent by its kit URL.
- For `display` / `desktop`: clipboard, file-transfer, audio, and notification features are toggleable via query params (`?clipboard=true&sound=true` …) — see the `display` namespace. They apply on a `display-<N>` URL only: a `desktop-<N>` URL redirects to its display without its query, so open the display URL (or add the params to the URL you are redirected to).
- For `code`: append `?extension=<publisher>.<name>` to embed a single extension (e.g. Cline) without the IDE chrome — perfect for chat-channel "agent" widgets.
- Several API kits also serve a browser UI on their kit URL: `cron` (crontab manager) and `watch` at `/`, the `sqlite` studio at `/`, and the `pipe` send / receive / share pages — check a kit's own UI (and its embed views) before building a custom dashboard. `curl` renders no UI, and `http-<port>` shows whatever your app serves.
- `allow="clipboard-read; clipboard-write"` on the `<iframe>` is recommended for `code`, `terminal`, `display` so paste / copy work inside the embed.

## Source IP Guard

Refused by the Source IP Guard: Hoody Kit programs are reached through their URLs only. (403 `forbidden`.)

## One URL form from everywhere

Call kits through their kit URLs on HTTPS, so the proxy's permissions, logging and hooks apply to every call.

What that gives you:

- **The same checks everywhere** — requests from inside computers go through the same `hoody computers proxy permissions *` and `hoody computers proxy groups *` checks and `hoody proxy logs *` capture as external requests. The `hoody computers proxy hooks *` request hooks apply the same way, but only to services that accept hooks: `logs`, `egress` and `cdp` reject hook operations with `404`.
- **One mental model** — the same URL works from your laptop, from another computer and from inside the computer itself. You write the same code everywhere.

Practical consequence: from inside a computer, when calling its OWN kits, use the same kit URL form as anywhere else (`https://{P}-{C}-<kit>-1.{N}.computers.hoody.com/...`). The `hoody` CLI and the Hoody SDK both already do this.

### Computer ↔ computer — anyone reaches anyone (with permissions)

**A process in computer X can call any kit on computer Y just by calling Y's kit URL** — same URL form, same gate stack, same logs. Examples:

- An autonomous agent in computer X reads / writes files in computer Y via the `files` kit at `https://{P-of-Y}-{C-of-Y}-files-1.{N-of-Y}.computers.hoody.com/api/v1/files/...`.
- A scheduler in X copies a file from Y's `files` kit, runs `exec` in Z, writes the result back to Y's `sqlite` kit — three computers, three kit URLs, one transparent network.
- A monitoring computer scrapes `/metrics` from every computer in a project's fleet by listing them via `GET /api/v1/projects/{id}/computers` (HTTP only; no CLI command) and hitting each one's kit URL.

Cross-computer access still goes through the gate stack — Y's `hoody computers proxy permissions *` and `hoody computers proxy groups *` rules apply to whoever's calling, no matter where they're calling from. So:

- **By default** (no gates set), Y's URL is a capability — anyone with the URL has access. Within your account that's usually fine; for production / shared / multi-tenant fleets you SHOULD gate.
- **With a gate set** (§ How to gate — an auth group alone is not a gate), X must satisfy it. A Token gate (`hoody computers proxy groups token set`) is a static shared secret: you choose where it is read (one header, cookie or query parameter) and the exact value it must equal, and X sends that value on every call to Y. It does not check Hoody auth tokens or realms — an `hdy_…` token passes only if it is literally the configured value. A JWT gate (`hoody computers proxy groups jwt set`) verifies a signed JWT instead; by default a valid token in any of its configured sources counts. For a cookie, use a `__Host-` name set by the address it protects.

Every computer-to-computer call gets the same permission checks and logs as an external call.

## Capability-token semantics — open by default, permission for production

**Under the default allow policy, the URL itself is the credential.** A well-formed kit URL routes without any `Authorization` header — anyone who knows the full URL has the same access as the owner, on every kit (an `exec` script that requires its own token is the one exception: it answers `401` without it). `computerId` is the secret. Computer-internal IDs (session, tab, notebook, terminal_id, displayId) follow the same "knowing the ID = having access" model.

**This is intentional for development**: spawn a computer, share the URL, collaborator reaches it instantly. **It is NOT acceptable for production exposure** — leaked URL = leaked computer. Treat any production deployment as "must have a gate".

### When to gate

- Anything reachable from a public network or shared with a third party.
- Anything that handles secrets, customer data, payments, or user PII.
- Anything where a leaked URL would be hard to rotate (long-lived background jobs, public dashboards, customer-facing demos).

### How to gate

Configure under `hoody computers proxy permissions *` (per-computer) or `hoody projects proxy permissions *` (project defaults for every computer in the project; a computer's own document overrides them: its groups and permission cells of the same name, its `default` (unless it is `inherit`, which uses the project's) and its `enable_proxy` win, so check the computer's document before you count on a project-level gate) on the control plane. Groups are alternatives, not layers: each named group (password, token, JWT, IP or hoody-identity — or an OR-array of those) is one way in, a request that satisfies a group gets that group's per-program `permissions`, and a request that matches no group falls to the document's `default` (`allow` or `deny`; on a computer, `inherit` applies the project's).

A group on its own restricts nothing. It grants only the programs you give it access to. With no stored policy, a project reads as `default: 'allow'` and a computer as `default: 'inherit'` (its project's default), and a request that matches no group gets in whenever the effective default is `allow`. A full `set` that leaves `default` out stores `deny`. A working gate takes three calls: define the group (`hoody computers proxy groups password set`, `hoody computers proxy groups token set`, `hoody computers proxy groups jwt set` or `hoody computers proxy groups ip set`; a `hoody-identity` group has no granular setter, so write it with the whole document through `hoody computers proxy permissions set`), give it access to each program it should reach (`hoody computers proxy groups permissions set` with the group name and the program as positionals and `--access true`; for `http` and `https` name the application ports instead, for example program `http` with `--access '[8080]'`, because a boolean or `"*"` is refused with `422`), and set `hoody computers proxy default set` with `--default deny`. Every one of these writes is versioned: send the document's current `file_version` as `If-Match: file:v<N>` (`file:v0` while the document has none), which the CLI takes as the required `--if-match file:v<N>`. A missing header is refused with `428` and a stale one with `412`. A granular write answers with the written document: with `-o json` the command prints that document, so `.file_version` is the new version and `.etag` is the same version as `file:v<N>` (also sent as the `ETag` response header). Use it for the next write, or read the document again. The one partial exception: a password group with an access rule for a program answers a caller without credentials with a `401` challenge for that program even under `default: 'allow'`.

| Gate | Accessor | Caller behavior |
|---|---|---|
| Password | `hoody computers proxy groups password set` | Browser / `curl -u user:pass` — HTTP Basic. |
| Token | `hoody computers proxy groups token set` | The header, cookie or query parameter you configured must carry exactly the value you configured (a static shared secret). Name a cookie with the `__Host-` prefix. |
| JWT | `hoody computers proxy groups jwt set` | Verifies the JWT's signature and its `exp` / `nbf` when present; issuer, audience and any other claim are checked only when you list them in the group's `claims` (exact match). |
| IP | `hoody computers proxy groups ip set` | Source IP must match a CIDR. |
| Hoody identity | the whole document: `hoody computers proxy permissions set` (no granular setter) | The caller presents a Hoody identity claim whose audience equals the group's `audience`; optional `allow_types`, `users` (24-hex user ids) and `max_age_seconds` narrow who passes. |

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
- `hoody proxy aliases create` rejects `program: 'web'`; use `program: 'exec'` for `hoody_kit` runners. The program names to use for an alias are listed in the `program` row of the Anatomy table under §Friendly aliases below — note `logs` for the proxy-logs kit (not `proxy` or `proxyLogs`) and `run` (not `app`).

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

`desktop_env` only picks the environment when the desktop starts. Opening a `desktop-<N>` that is already running with a different value does not switch it: use a free index, or stop that display first (`hoody terminal system displays stop <display>`) and open the URL again.

Other DEs (GNOME, KDE) are not auto-spawned by the alias — install + run them yourself via `daemon` and reach via the matching `display-<N>` URL directly.

### Forced vs caller-overridable

The proxy locks `desktop=true`, `redirect=display`, `terminal_id`, and `display` to the offset values — passing them in the query string is ignored (defense-in-depth so a caller can't escape the offset isolation). **`desktop_env` is caller-overridable, and other query parameters pass through; only those four are forced.**

### When to use the desktop alias vs `display-<N>` directly

- **Desktop alias** — quick "give me a Linux desktop in a browser tab" surface; no setup needed.
- **`display-<N>` directly** — when a session is already running there (e.g. you launched apps from `terminal-N` so the GUI is on `display-N`), or when you want fine-grained control over the X session.

### Building kit URLs

To compose a kit URL by hand, read `project_id`, `id` and `server_name` from `hoody computers get` and fill in the patterns above.

## SSH access — shell through the host-side SSH proxy

**HTTP via kit URLs is the default and encouraged path** — every request flows through the proxy's logging, request-hooks, and capability-token gate stack, and the URL is reachable from anywhere with no client install. Use SSH only when those guarantees aren't needed and you specifically want a raw shell: heavily-firewalled boxes that should not expose any web surface, native tooling that wants stdin/stdout (`rsync`, `scp`, `sftp`, `git push` over SSH), or when running CI inside another network's egress allow-list. Day-to-day: prefer `terminal` (gives you a proxy-logged HTTP-driven PTY, plus `display` for GUIs).

### Hostname

`ssh root@{projectId}-{computerId}-ssh.{node}.computers.hoody.com` (port `22`).

Note the `-ssh.` (no instance number, no kit-suffix). The connection ends at a host-side SSH proxy, not at a server inside the computer: the proxy looks up your public key, finds the one computer that key is registered to, and runs the shell, SFTP or SCP session in that computer through the host. No `sshd` runs in the computer. Port forwarding (`ssh -L`, `ssh -R`) is disabled.

### Public-key authentication only

Set `ssh_public_key` (full OpenSSH line, e.g. `ssh-ed25519 AAAA…`) on `hoody computers create` / `hoody computers update` / `hoody computers copy`. The key is registered with the host-side SSH proxy, not written to an `authorized_keys` file in the computer. Password auth is disabled.

**The public key MUST be unique across computers — one computer per key**, because the key alone selects the computer. Reusing a key that another computer already holds returns `409` with a message saying the key is already in use (when two creates race for the same key, the losing one still creates its computer, without the key: `ssh_public_key` is `null` and `message` says so, so check it before you connect). Generate a fresh keypair per computer; you can rotate via `hoody computers update` with a new `ssh_public_key`.

### What you get — root

SSH login is `root@…` automatically. No sudo prompts, no separate user account; terminal sessions can instead run as a requested user or the terminal server's configured default user. Anything inside the computer is yours.

### IP filtering

The SSH endpoint accepts IPv4 connections only and any IPv4 address may connect; the registered key is the access control. SSH sessions reach the computer through the host-side proxy and the host, not through the computer's network interface, so computer firewall rules (`hoody firewall rules|reset *` ingress rules) and in-computer `iptables` / `nftables` rules do not filter them. To cut off a key, replace it with `hoody computers update` (new `ssh_public_key`). For kit URLs, restrict source IPs with `hoody computers proxy groups ip set`.

### When SSH vs kit URLs

| Need | Use |
|---|---|
| Anywhere-reachable HTTP, logged, gated | Kit URL (`terminal`, `files`, `exec`, `display`, `http-<port>` …) |
| `git clone <ssh url>` / `rsync` / `scp` | SSH |
| Reach an internal-only service from your laptop | Not SSH (port forwarding is disabled): use its `http-<port>` URL, gated with `hoody computers proxy permissions *` and `hoody computers proxy groups *` |
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

Defaults when port omitted: `http` ⇒ port 80, `https` ⇒ port 443. Port range `1..65535`. Capability-token rules still apply — gate the URL via `hoody computers proxy permissions *` and `hoody computers proxy groups *` if you don't want it open.

## Friendly aliases — `<alias>.{N}.computers.hoody.com`

A **proxy alias** is a custom hostname that points at one specific program inside a computer, without putting the `projectId` / `computerId` in the URL you share. Same capability-token semantics — alias URL on its own is the credential — but the URL is shareable, brandable, and hides the computer plumbing.

### Why use them

- **Hide `computerId`**: shipping `https://my-api.{N}.computers.hoody.com` is fine; shipping `https://65f1...c8a-65f2...41e-http-8080.{node}.computers.hoody.com` leaks the computer identifier (which IS the credential of last resort). Not every program keeps it hidden: a `desktop` alias redirects the browser to the canonical `display` URL, which carries both ids. An alias is not an access rule either, and disabling or expiring it does not close the canonical URL: restrict who may open the program with `hoody computers proxy permissions *` and `hoody computers proxy groups *`.
- **Brandable**: short, memorable, copy-pasteable.
- **Retargetable within its computer**: an update can change the alias's program, port, instance index or landing path while the public URL stays the same. It cannot move the alias to another computer (the update takes no `computer_id`); for a new computer, delete the alias and create it there.
- **Same gate stack**: layer Password / Token / JWT / IP / Hoody identity via `hoody computers proxy permissions *` and `hoody computers proxy groups *` exactly as on the canonical URL.
- **No DNS, no TLS work**: the proxy issues the cert and resolves the hostname for you.

### Anatomy

`hoody proxy aliases create --computer-id <computer_id> --program <program> [--alias <alias>] [--index <index>] [--port <port>] [--target-path <target_path>] [--allow-path-override] [--expires-at <expires_at>] [--enabled]`

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

- `hoody proxy aliases disable <aliasId>` disables the alias without releasing the slot — useful to revoke a leaked URL while you investigate. Disable, enable, update and delete are not instant: they usually reach the alias URL within about 30 seconds and can take longer, and until then the alias keeps its previous behavior.
- Wildcards / multi-program aliases not supported — one alias = one `(program, index)` target.
- Conflicts return `409 ALIAS_IN_USE` under any of the three rules: the name is taken on that physical server (by any tenant), your account already holds it on any server, or another account released it on that server within the last 90 days.
- Custom apex domain (e.g. `api.example.com`) requires DNS CNAME + cert provisioning — not part of this surface.

## Common pitfalls

- For kit URL composition use `server_name` (parent physical, always routable). `subserver_name` is the slice display label and is not a routable DNS surface. Show it in UI as `subserver_name ?? server_name`, but never substitute it into a kit URL.
- **After `hoody computers create`, kit URLs may return `502`/`503` for a brief window even once `status === 'running'`** — provisioning continues asynchronously after the API flips status (kits attach, networking warms, dev_kit installers finish). Polling `status === 'running'` is necessary but not sufficient. Practical rule: retry the first kit call on transient 5xx with bounded backoff rather than a fixed sleep.
- `http-<port>` reaches the service immediately after the listener is up — no alias needed unless you want a friendly hostname or want to hide the `computerId`.
- **Default = open.** Treat any URL you publish (canonical or alias) as a public secret. Production exposure without a gate = leaked URL = full computer access.

---

# Auth model — token taxonomy, capability URLs, and gates

## Three credential types

1. **JWT** — browser sign-in (§ Login) or `hoody login`. Access token lives `1d`, refresh token `7d`, by default; a deployment may shorten either, so treat both as values to read from the response rather than constants. The interactive, short-lived credential.
2. **Auth token** — `hoody auth tokens create`. Prefix `hdy_`. Scopable (realms, `resources.*`), IP-restrictable, replaceable (copy it for a new secret, then delete the old one). Long-lived headless credential.
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

`hoody login --web --no-browser` runs these steps for you: it prints the page and the code, polls until the user approves (up to 15 minutes), and saves the session to `~/.hoody/config.json`. Give the user the printed link and code. If your shell tool shows output only once a command exits, run it in the background, `(hoody login --web --no-browser; echo "exit=$?") > hoody-login.log 2>&1 &`, read the link and code from that file, and check it again later: sign-in is done when its last line is `exit=0`.

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

Separately, `hoody computers claims create -c <id>` mints a signed, portable **computer claim** — `data: { computer_claim: { kid, payload_b64, signature_hex }, expires_in, computer_id, project_id }`. It is an *optional* credential for a program **you** run inside a computer to verify a caller **offline** against the API's Ed25519 public key (`GET /api/v1/meta/public-key`); a `503 SIGNING_NOT_CONFIGURED` means no signing key is provisioned on that deployment. No built-in kit requires it.

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

Pass `realm_ids: ['<24-hex>']` when creating the computer — and an array of multiple realm IDs is fine if a computer needs to be visible in several, except with a realm-restricted auth token: it must call the realm-scoped host, naming any other realm in `realm_ids` is refused with `403` ("This token cannot assign computers to other realms"), and an omitted or same-realm array is replaced with the realm of the host you call. Computer realm membership is **independent of project realm membership** (a project in realm A can hold a computer in realms A+B). Read it back from the `realm_ids` field returned by `hoody computers get`.

### Auth tokens × realms

Mint a realm-scoped token via `hoody auth tokens create --realm-ids <realm_ids>`. The token then routes only against `<realmId>.api.hoody.com` (calling bare `api.hoody.com` returns `403` "requires realm-scoped URL", except GET/HEAD `/api/v1/auth/tokens/me`, which allows current-token introspection without a realm host). Add / drop realms post-mint with `hoody auth tokens realms add` / `hoody auth tokens realms remove`. Tokens with no `realm_ids` can still target a specific realm by using the realm subdomain; only when `allow_no_realm` is true can they also use the `realm_id` query parameter on the routes that take one (with `allow_no_realm: false` the bare host is refused).

### Best practice — one realm + one token per project

This is for unattended automation the user asked for, or for handing a scoped credential to another program. For interactive work with the user present, keep the browser sign-in session and select the realm with its realm URL.

Realms are **implicit**: there is no `realms.create` endpoint. A realm comes into existence the first time you reference it on a resource. Pick or generate a 24-hex string (e.g. via `crypto.randomBytes(12).toString('hex')` / `openssl rand -hex 12`) and use it everywhere for the project.

1. **Pick a realm id** — any 24-char lowercase hex; or list existing ones with `hoody realms list`.
2. `hoody auth tokens create` with `realm_ids: [realm_id]` and a sensible `permission_template` (e.g. `external_customer`) — **the token is shown once; copy it before navigating away.**
3. `hoody projects create` with its required `alias` and `realm_ids: [realm_id]` — pin the project to the realm.
4. `hoody computers create` with its required `server_id` and `realm_ids: [realm_id]` (plus `hoody_kit: true` for kit URLs) — pin the computer too.
5. From now on, drive the project against `https://<realm_id>.api.hoody.com` with that single token. Set the token in `HOODY_TOKEN` and the realm in `HOODY_REALM` (or use the `--realm` flag) so every call goes to the right scope.
   The exception is project-wide access: adding, changing or removing a project member and every `hoody projects proxy permissions *` and `hoody projects proxy groups *` read or write need the base API host (`https://api.hoody.com`) and an unrestricted credential (browser sign-in, or a token with no realm restriction). A realm host or a realm-restricted token is refused with `403`, even for a project in that realm.

Result: that token can only see projects, computers, tokens, and vault entries in the realm. An agent given just this token cannot touch your other realms' resources through the API — even if it's the same Hoody account. Account-wide data is not divided by realm: the wallet's balances and history and the notification inbox refuse a realm-restricted token outright; restrict `financial.*` on the token to stop it spending. Kit URLs it already knows stay reachable; they answer to their own gates, not to the token.

## Storing auth tokens

Mint an `hdy_…` token only when the user asks for unattended automation; the session from browser sign-in is not one, so don't save it yourself. The token from `hoody auth tokens create` is shown ONCE; the server stores only a hash. Three storage options:

- **Write it down outside Hoody** (recommended) — password manager, secrets manager, env file outside the computer. The token is a long-lived bearer; treat it like an SSH key.
- **Vault, plaintext** — `hoody vault set <key> --value 'hdy_…'`. Stored server-side as sent — Hoody does not encrypt the value for you — and readable by anyone holding a JWT or vault-scoped auth-token for the account. Convenient for self-hosted automation.
- **Vault, client-side encrypted** — pre-encrypt with your own key (libsodium/`crypto.subtle`/age) before calling `hoody vault set`. Hoody never sees the plaintext; you store only the wrapping-key elsewhere.

Vault gate: any vault read needs BOTH `vault_access===true` on the token AND the `resources.vault` permission granted to it. JWT-as-owner bypasses both. See `hoody vault set` / `hoody vault get` / `hoody vault list` / `hoody vault delete` / `hoody vault clear`.

## Token revocation

- `hoody logout --all` — for a JWT this is a **logout-everywhere**: every access and refresh token minted before the call stops working, on every device, not just the one that called it. Auth tokens are unaffected.
- `hoody auth refresh` — server requires the refresh token in BOTH the request body AND a matching `Authorization: Bearer` header; a missing or mismatched bearer answers `401 Invalid refresh token`, and a missing or empty body field is refused as `422` schema validation. The CLI handles both places for you: `hoody auth refresh` takes `--refresh-token`, or falls back to the refresh token saved by the last `hoody login` / `hoody auth refresh`, sends it in the body and as the bearer, and saves the new tokens (`--no-save` skips that). With no saved refresh token, pass `--refresh-token` or run `hoody login` again. For unattended automation the user asked for, a long-lived `hoody auth tokens create` token avoids refresh handling.
- `hoody auth tokens delete` / disable / IP-restrict — effective next request.

## 2FA

`hoody auth 2fa setup start` prints `{ qr_code, manual_entry_key, backup_codes }` (the envelope's `data`, unwrapped); `hoody auth 2fa setup confirm` enables. Backup codes rotatable, one-time, hashed. `hoody auth 2fa tokengate enable` on → sensitive auth-token mutations made with a login-session JWT need an `otp_code` (a TOTP or a one-time backup code). Basic auth has already proved 2FA at authentication, and delegation by an auth token holding `resources.create_tokens` is exempt.

---

# Pre-installed tools — what every computer ships with

Every Hoody computer starts as a **Debian/Ubuntu base** with a curated battery of dev tools already on `$PATH`. **Computers run real systemd as PID 1 with root inside the computer** — not a Docker-style minimal sandbox. That means `systemctl`, `journalctl`, `apt install <package> && systemctl enable --now <unit>`, `crontab -e`, drop-in unit overrides and socket activation work as on a normal distro. Computers share the host kernel, so computer root cannot load kernel modules. Two tiers of pre-installed software:

1. **Default tier** — installed when the computer's resolved `hoody_kit` setting is true. Left out of `hoody computers create`, it is true for a login (JWT) caller; for an auth-token caller it follows the token's `computers.features.hoody_kit` permission, so it is false when the token lacks it. A computer with `hoody_kit` false is not guaranteed to have these packages.
2. **`dev_kit: true`** — the comprehensive coding setup (Node 26, Bun, Rust, Go, Nix, Docker, …). Pass it on `hoody computers create`, or the `--dev-kit` flag; when omitted, `dev_kit` defaults to the resolved `hoody_kit` value.

Anything missing? Just `apt install`, `npm i -g`, `cargo install`, `go install`, `nix-env -i`, etc. — root is yours, the box is yours. The system Python is externally managed (PEP 668), so a bare `pip install` is refused: use a virtual environment for libraries and `pipx install` for Python CLIs. The `dev_kit` installer attempts to install `python3-venv` and `pipx`; if either is missing, run `sudo apt install python3-venv pipx`

## `kvm: true` — run full VMs inside the computer

Computers on **dedicated (bare-metal) servers** can enable `/dev/kvm` passthrough and run hardware-accelerated virtual machines (QEMU/KVM, libvirt, Firecracker, …) inside the computer. Pass `kvm: true` on `hoody computers create`, or the `--kvm` flag, or toggle it later on a **stopped** computer (`hoody computers kvm enable -c <computer-id>` / `hoody computers kvm disable -c <computer-id>`). Defaults to off. **Never available on free-tier servers or paid subservers (slices)**: the API refuses with `403`. An auth token also needs the `computers.features.kvm` permission (otherwise `403`). `dev_kvm` is accepted as an input alias of `kvm` (`kvm` wins; if both are sent they must agree). Every computer response carries the current `kvm` boolean. A create with KVM requested can still come back `kvm: false` with a `kvm_note` (KVM was not enabled automatically, so the computer was created with KVM off): check both `kvm` and `kvm_note` in the answer, and if it is off, enable it with the toggle once the computer is stopped.

```bash
PROJECT_ID="<project-id>"; SERVER_ID="<server-id>"; COMPUTER_ID="<computer-id>"
hoody computers create --project "$PROJECT_ID" --server-id "$SERVER_ID" --name vm-host --kvm -o json   # enable at creation; check kvm / kvm_note in the output
hoody computers kvm enable -c "$COMPUTER_ID"    # enable on a stopped computer
hoody computers kvm disable -c "$COMPUTER_ID"   # disable
```

## `hoody` CLI is pre-installed inside every computer

The `hoody` binary is on every computer's `$PATH` (`/usr/bin/hoody`) for root, the default `user` account and any account that holds `user`'s group — from a shell session, an `exec` script, a `daemon` program, a cron entry or an SSH session running as one of them. Other uids cannot run it: the binary lives under `/hoody`, which only root and that group can enter; give such a uid its own install of the CLI.

```bash
hoody --version
hoody projects list
hoody --computer <computerId> files get /home/user
```

Do not assume that a shell or program inside the computer has a default computer id. When a command needs one, pass `--computer <computerId>` or set `HOODY_COMPUTER=<computerId>`. The CLI checks `HOODY_COMPUTER`, then `HOODY_COMPUTER_ID`, then the older `HOODY_CONTAINER` and `HOODY_CONTAINER_ID`. Whether a terminal session or a `daemon` program receives these variables depends on its environment injection settings and on what environment is available to it; a cron job can set them in its crontab. Hoody Agent shells can receive the computer bound to the agent session. `$HOODY_TOKEN` is not set in ordinary terminal, `exec`, `daemon` or cron processes: give that code a token through its own environment (a script's `.env`, the program's env) if it needs to call the API. Hoody Agent shells can be the exception: with the agent's Hoody integration on and a usable credential, the agent injects `HOODY_TOKEN` and the API base URL into its bash tool (for a realm session normally a minted realm token; some installs fall back to the account token, and a failed mint or a restricted login injects nothing). Login state is per-user under `~/.hoody/config.json`.

This is the same binary as `hoody` outside the computer, so the CLI skill's examples work the same way inside a computer's shell, once that environment has the sign-in and the `--computer` target an example needs.

## Default user — `user` (uid 1000) with passwordless sudo

Computers created with the Hoody Kit (`hoody_kit: true`) ship with a **non-root account named `user`** (uid 1000, gid 1000, member of `sudo`). Home is `/home/user`. **`/etc/sudoers.d/user` grants `user ALL=(ALL) NOPASSWD: ALL`** — passwordless `sudo` lets agents (and humans) escalate to root for any operation without prompting.

The Hoody Agent runs as `user` and its shell follows this setting: with the drop-in in place the agent can sudo; once the drop-in is removed (or narrowed to some commands) the agent's shell gets exactly what `user` gets without a password.

**Use `user` for everyday work, sudo when you actually need root.** Reasons:

- Files created under `user` are owned by uid 1000 — friendlier when you copy/sync them out of the computer or back-stop with rsync.
- Many apps (npm, pip in venvs, Bun, Go, Nix single-user, Docker rootless, browsers) write into `$HOME` and behave better when `$HOME` is a real user home, not `/root`. (The Rust toolchain is shared: it lives under `/usr/local/cargo` and `/usr/local/rustup`, not under `$HOME`.)
- `journalctl --user`, `systemctl --user`, dbus user buses all hang off a regular user.

The kit's `terminal` / `daemon` / `cron` namespaces let you pass `user: 'user'` (default in many surfaces is `root` — be explicit). Examples: `hoody daemon programs create --name my-app --command '…' --user user`, `hoody terminal sessions create --terminal-id 100 --user user --shell bash --cwd /home/user` (`terminal_id` may be omitted when the `terminal-N` host supplies it, or when `ephemeral: true` generates it. On a computer-scoped client the SDK takes the host index from the body id; if you also pass `serviceIndex`, it must be the same id, or the SDK throws a `ValidationError` before sending. A request that reaches the kit with a mismatched id is refused with `400 TERMINAL_ID_MISMATCH`. The `terminal-0` host creates only ephemeral sessions). The generated `GET /{path}` (HTTP only; no CLI command) does NOT take a `user` param — the script runs under whatever uid the kit was started as.

**Production hardening — disable passwordless sudo.** For computers exposed to untrusted callers (open kit URLs without proxy gates, public alias hostnames, agents you don't fully trust), revoke the NOPASSWD line:

```bash
sudo passwd user && sudo rm /etc/sudoers.d/user    # set a real password first (the account may have none), then remove the drop-in only if that worked
```

Or replace the contents with a tighter policy (e.g. `user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart myapp` for one specific command). Edit via `sudo visudo -f /etc/sudoers.d/user` to validate syntax before commit. Reminder: a leaked kit URL is already a root-shell credential (see auth-model — capability-token semantics); production exposure should ALSO have `hoody computers proxy permissions *` and `hoody computers proxy groups *` gates and ideally a non-root default user.

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

Set the flag on `hoody computers create` to additionally provision:

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

State is per-computer: `hoody computers copy` clones the disk including everything you installed; `hoody snapshots create` saves a point-in-time you can later `hoody snapshots restore` to roll back to. There is no global "shared layer" leak — each computer's filesystem is its own.

---

# CLI — Core operations

Use the `hoody` CLI only where it is already installed: a Hoody computer, or the user's own computer. In a web chat (ChatGPT, claude.ai, …) or a throwaway code sandbox, use HTTP instead: the CLI isn't installed there, a login made there does not last, and it isn't the user's machine. Do not install it with npx or the install script; check with `command -v hoody`.

`hoody` recipes. Base URL: `https://api.hoody.com` by default; override with `--base-url <url>`, `HOODY_BASE_URL` or `hoody config set baseUrl <url>`. Scope: `-c <cid>` | `HOODY_COMPUTER` | `hoody local defaults set computer <id>`.

---

### 1. Sign up
Default for a person: they sign up at `https://api.hoody.com/auth/signup` in their own browser, then sign in with `hoody login --web --no-browser` (§2). Existing account: always browser sign-in first; if it fails, stalls or is refused, ask for a token they create at `https://api.hoody.com/auth/home#/keys` (side menu → Keys and tokens → API keys). Never ask for a password (use one only if offered). Never repeat or store a secret. `hoody signup --email you@example.com --password "$HOODY_PASSWORD"` — signup, email verification and login in one command. On a TTY it waits for you to click the verification link and ends logged in; without a TTY it exits 0 after sending the verification email and you must run `hoody login` yourself once the link is clicked. Signup CLI flags are `--email`, `--password` (or `--password-stdin`), `[--region]`, `[--invite-code <code>]` (remembered as a hash at signup and, after email verification, attempted automatically when needed for gated provisioning; validity is not checked at signup), `[--print-token]` (needs a terminal: without a TTY the command exits 1 before it signs up), `[--no-save]`, `[--wait]` and `[--challenge <code>]` (the browser check, below); there is no `--username`; username is generated (usually from the email local part; log in with the email). Password 12–128 chars and at most 72 UTF-8 bytes. The server needs **3 of 4** character classes (upper/lower/digit/symbol); the interactive prompt demands all four, so use all four. Resend: `hoody auth email verification send --email <email>`. Signup may first ask a person to finish a short check in a browser. On a TTY the command shows the link and the match code and waits until the check passes. Without a TTY it creates nothing, prints the link, the match code and the command that carries on (`-o json`: `challenge_required`, `verification_url`, `match_code`, `challenge`, `next`, and `next_argv`, the same command as an argv array) and exits 2: show the person the link and code, and once they have finished run `next` with the same password on stdin (it keeps the email, `--region`, `--invite-code`, `--profile`, `--config`, `--realm`, `--base-url` and the output format, plus `--challenge <code>`; a `--base-url` with a query, fragment or user name and any `--proxy` are left out and `next_notes` asks for them; it exits 2 again while the check is not finished, or with a new link when a check did not pass). `--wait` keeps the command waiting instead (run it in the background and read the link from stderr). The check lasts about 15 minutes. A check that runs out exits 1: start again. When no answer ends the check (the wait runs out, or a `--challenge` run gets no answer) it also exits 1 (`-o json`: `outcome_unknown`), and the account may exist if the check was finished: check the email or run `hoody login`. Exit 0 means the signup was accepted, which is also the answer for an address that already has an account.

### 2. Log in (+2FA)
`hoody login --web --no-browser` is browser sign-in: it prints a link and a code for the user, polls until they approve on Hoody's page, and saves the session (2FA happens in their browser). If your shell tool shows output only after a command exits, run it in the background and read the link from its output. Password path (last resort, see the order in §1), or for a user signing in from their own terminal: `hoody login --username alex --password "$HOODY_PASSWORD"` (or `--email you@example.com`). On a TTY a 2FA account is prompted for its code in the same run. Without a TTY the command saves nothing, prints the challenge and exits 2; finish with `hoody auth 2fa verify --temp-token <temp_token> --code 123456` using the printed temp token (`--code` also accepts a 10-character backup code). Login password ≥8 chars (signup is ≥12).

### 3. Base URL / profiles
Global flags: `--base-url <URL>`, `--profile <P>`. Persist with `hoody config set baseUrl <URL>` (camelCase key).

### 4. List projects
`hoody projects list [-o json]`

### 5. Create project
`hoody projects create --alias my-project --color '#10B981'`

### 6. List computers
`hoody computers list [--realm <rid>] [-o wide]`. There is no `--project` filter. One call fetches every page, up to 10,000 items or 1,000 requests (`--limit N` caps the total; past the bound the CLI says so on stderr, and `--limit 100 --page 101` continues), so filter the result with `hoody computers list -o json | jq '.computers[] | select(.project_id=="<pid>")'` (the CLI's `-o json` unwraps the API envelope, so the top level is the `data` body — `.computers`, not `.data.items`). `--name <text>` keeps the computers whose name contains the text (case-insensitive). `hoody computers get <name>` also accepts an exact, case-sensitive name that matches exactly one computer; a 24-hex value is always read as an id, and an ambiguous name, or a lookup that hit the bound, is refused, so pass the id then.

### 7. Create computer
`hoody computers create --project <pid> --server-id <sid> --name box-1 --hoody-kit`. Flags `--project` and `--server-id` are required.
`<sid>` is the rental's `server_id`, not the ID column of `hoody servers list` (that is the rental id): `hoody servers list -o json | jq -r '.[].server_id'`. Rentable servers: `hoody servers marketplace list`. Rent with `hoody servers rent <id> --rental-days <days> --max-charge-cents <total-cents>`: pick a duration the server offers and convert `pricing.price_tiers[days].total_first_payment` to integer cents (`"37.00"` → `3700`; the total includes any setup fee); only a zero-total rental may omit `--max-charge-cents`, otherwise the call answers `409 CHARGE_CONFIRMATION_REQUIRED`, or `409 SETUP_FEE_CONFIRMATION_REQUIRED` when a setup fee applies.
After the computer is `running`, give the user the clickable URLs of its main kits (each opens its web UI): `hoody open terminal --url -c <cid>`, then the same with `notifications` (slug `n` in the URL), `desktop`, `browser`, `files` and `agent`. `--url` only prints; without it the command opens the page. See § 24.

### 8. Lifecycle — get/wait, start/stop/restart
```bash
CID=65a1f0c2e4b0a1b2c3d4e5f6   # your computer's 24-hex id, from hoody computers list
hoody computers get "$CID"
until [[ "$(hoody computers get "$CID" -o json|jq -r .status)" == running ]];do sleep 2;done   # CLI -o json unwraps the envelope → .status (not .data.status)
hoody computers restart "$CID"   # the same shape for start, stop, pause and resume; stop --force kills without a clean shutdown
```

### 9. One-off command
```bash
CID=65a1f0c2e4b0a1b2c3d4e5f6   # your computer's 24-hex id
hoody shell "$CID" -- ls -la /home/user   # the command is POSITIONAL — there is no --command flag
hoody shell "$CID" -- tmux ls
hoody terminal commands run --command 'ls' --ephemeral   # the flag form: `terminal commands run` takes the command in --command (hoody shell has no --command flag)
```

### 10. Long-lived terminal
```bash
hoody terminal sessions create --terminal-id 100 --shell bash
hoody terminal commands run --terminal-id 100 --command 'pwd' --wait
hoody terminal sessions read 100                  # terminal id optional, defaults to "1"
hoody terminal sessions snapshot get 100     # terminal id required
hoody terminal sessions delete 100 -y          # terminal id positional
```
Pin 1–1600 (new sessions take 1–9999 except the agent band (4501–5000 with the default bands), which is refused; with the default bands 1601–4500 = desktops, 4501–5000 = agents, 5001–7999 = ephemeral, 8001–9999 = Hoody Run/Hub).

### 11. SSH
`hoody shell <cid>` is not an SSH client by default; pass `--ssh-host`/`--ssh-user` to bridge to a real SSH server.

### 12. Files — list, read, write
```bash
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
`hoody browser screenshots capture --browser-id 1 --url https://example.com --format png --out-file /tmp/p.png`. The CLI uses `--browser-id` to pick the instance's `browser-N` host (the server checks any `browser_id` you send against that instance and answers `400 INSTANCE_SELECTOR_CONFLICT` on a mismatch); without it the CLI targets instance 1. Without `--out-file` the image bytes go to stdout as received (a terminal refuses them; redirect or pipe).

### 14. Display capture
```bash
hoody display screenshots capture --out-file /tmp/d.png      # take one now; or > /tmp/d.png: PNG bytes on stdout
hoody display screenshots latest get --out-file /tmp/d.png   # the most recent one already taken
# `hoody display thumbnails capture` / `thumbnails latest get` are the small versions; both take only `--base64`, `--display-id` and `--out-file`
```

### 15. SQLite KV
Key is positional; `--db <path>` is required; the JSON-encoded value goes in `--body`. The batch pair is typed instead: `--items` takes the item array as one JSON document (`--items @<file>.json` from a file, `--items @-` from standard input, or the array inline) or one `--items key=…,value=…,ttl=…` per item (`value` stays a string; do not mix the two forms). A batch value is stored as the text you give, not decoded as JSON: it is saved as `application/octet-stream` unless the item sets `content_type` (for example `content_type=application/json` to store a JSON value), and `--keys` takes the key list.
```bash
hoody kv set greeting --db /hoody/databases/app.db --body '"hello"' --create-db-if-missing       # value is a JSON-encoded string
hoody kv get greeting --db /hoody/databases/app.db
hoody kv set visits --db /hoody/databases/app.db --body '0'     # a counter holds a JSON number; increment on a non-number value is 400
hoody kv increment visits --db /hoody/databases/app.db --delta 1
hoody kv decrement visits --db /hoody/databases/app.db
echo '[{"key":"a","value":"v1"}]' > items.json
hoody kv batch set --db /hoody/databases/app.db --items @items.json
hoody kv batch set --db /hoody/databases/app.db --items 'key=a,value=v1' --items 'key=b,value=v2,ttl=60'
hoody kv batch get --db /hoody/databases/app.db --keys a,b
```

### 16. Watch — create + stream
`hoody watch create --paths /data --recursive` (`--paths` is repeatable; there is no `--name`). Then `hoody watch {list|events stream <id> -o ndjson}`.

### 17. Tunnels
`hoody tunnel {list|sessions list|bindings list|expose ...}`.

### 18. Snapshots
`hoody snapshots create --computer <cid> --alias pre-deploy [--expiry 30]`. Then `hoody snapshots {list | restore <name> | delete <name> | alias set <name> --alias <new>}` — each takes `--computer <cid>` (or `-c`) for the computer; `restore`, `delete` and `alias set` also take the snapshot name as a positional. `<name>` is the name `snapshots list` returns: the sanitized alias, or `snap-YYYYMMDD-HHMMSS` when none was given. On `alias set`, the new alias goes in `--alias`.

### 19. Vault
```bash
hoody vault set api-token --value "$API_TOKEN"
hoody vault list
TOKEN=$(hoody vault get api-token -o json | jq -r .value)   # -o raw prints the whole JSON record, not the value
hoody vault delete api-token -y
hoody vault clear --yes   # deletes every key in the current realm (the account-level partition when none is selected); other realms keep theirs
```

### 20. Wallet balance
`hoody wallet balances general get` (general balance), `hoody wallet credits get` (AI credits), `hoody wallet balances get` (both). All three are refused for a token limited to realms (403 `REALM_TOKEN_ACCOUNT_MONEY`); use a login session or an unrestricted token.

### 21. Cron entries
```bash
hoody cron entries create user --schedule '0 */6 * * *' --command '/x.sh' --name b6   # the system user is positional and required
hoody cron entries list user
ID=$(hoody cron entries list user -o json | jq -r '.entries[] | select(.name=="b6") | .id')
hoody cron entries update user "$ID" --schedule '0 3 * * *'
hoody cron entries delete user "$ID" -y
hoody cron crontabs set user --crontab '0 3 * * * /x.sh'   # bulk: replaces the user's whole crontab
```

### 22. Daemon — supervised programs
```bash
hoody daemon programs create --id 100 --name app --command 'node /app/s.js' \
  --user user --boot --autorestart unexpected     # --boot (not --autostart) toggles auto-start at computer boot
hoody daemon programs list
hoody daemon programs logs get 100 --lines 200    # stop, logs get and logs stream take the numeric id as a positional, not --name
hoody daemon programs logs stream 100
hoody daemon programs stop 100
```

### 23. Exec — serverless script
```bash
hoody exec scripts write api/users.ts --create-dirs --validate \
  --content '// @mode serverless
return { users: [{ id: 1, name: "Alice" }] };'
```
`// @mode {serverless|worker}`; return value or `module.exports = async(req,res,meta,shared)=>…`.

### 24. Open kit in browser
```bash
hoody open terminal   # service ∈ agent|browser|code|cron|db|desktop|display|exec|files|kv|notes|notifications|pipe|run|terminal|watch|sqlite|curl|logs|ssh|egress|http|https|http-<port>|https-<port>. Top-level `open` takes a service name, NOT a computer id.
hoody files open   # the kit's own open; display, code, exec, db, kv and notifications have one too
```

### 25. Ask Hoody about Hoody (docs chatbot)
`hoody chat ['prompt']`: a one-shot question, or an interactive REPL when the prompt is omitted. Hoody's hosted docs assistant answers questions about Hoody with no API key; use `hoody agent prompt` for agentic AI. In the REPL, `--persist` saves sessions and `--persist --resume [id]` resumes the latest or a given one; `--private` disables disk reads and writes.

### 26. Discover kits
`hoody kits list [--named-only]` — kit slug catalog; see § Proxy URLs above.

### 27. Debug flags
```bash
hoody projects list --verbose         # show HTTP req/resp
hoody projects list --quiet           # drops helper chatter; -o json/yaml/raw output still printed
hoody exec namespaces list --refresh-scripts
hoody files get /x -o raw | bash      # -o raw drops envelope
```

### 28. Structured (JSON) flags
A flag whose `--help` shows `<json|@file.json|@->` takes one JSON document, from any of three sources with the same result: inline, from a file (`@file.json`) or from standard input (`@-`). Only one flag of a command can read standard input. Malformed JSON, or an array where an object is expected, is refused before anything is sent. `<value|json|@file.json|@->` also takes a scalar, and its help lists the JSON types the field takes: inline text is read as JSON first (`true`, `42`, `null`, `'"x"'` the string x), and text that is not JSON (a plain token) is sent as a string when the field takes one. A `<key=value>` flag (a map, or a list such as `kv batch set --items`) takes KEY=VALUE entries or the whole value as one JSON document, never both and never two documents; a token starting with `@` is always a file (or `@-`), so a key cannot start with `@`, `{` or `[`.
```bash
hoody agent settings update --patch '{"model":null}'
hoody agent workflows set --name check --definition @workflow.json
printf '%s\n' '{"model":null}' | hoody agent settings update --patch @-
```

---

URLs → § Proxy URLs; auth → § Auth model; per-namespace flags → `SKILL-CLI/<ns>.md`.

---

# CLI — Reference appendix

## Global flags

|Flag|Notes|
|---|---|
|`-o`|`json`/`yaml`/`table`/`wide`/`raw`/`ndjson`/`pretty` (none typed and none saved: a fixed human layout on a terminal, the plain `table` layout on a pipe, with `TERM=dumb`, in CI or in agent mode)|
|`-q`,`-v`,`--no-color`|suppress helper chatter (status/side messages — JSON/YAML/raw output still emitted); HTTP req/resp; no color|
|`--config`,`--profile`|`~/.hoody/config.json`|
|`--base-url`|API base URL for this run (default `https://api.hoody.com`; also `HOODY_BASE_URL` or `hoody config set baseUrl <url>`).|
|`-t`,`-u`,`-p`,`-y`|bearer; login identifier (username, or an email: a value containing `@` is sent as `email`); pw; auto-yes|
|`-c`,`--realm`,`--proxy`,`--non-interactive`|computer(→env); realm; proxy; CI|
|`--domain`|update-verify; **precede subcommand**|
|`--kit-*`|kit auth; capability URL is credential|
|`--local-password*`,`--local-lock-timeout`,`--allow-ephemeral-token`,`--refresh-scripts`|lock+cache|

Status: in the human layout, status glyphs are green for running, cyan for starting and red for error; stopped and paused glyphs are unpainted, and status words are unpainted. In the plain table layout, stopped and paused status values are yellow when color is enabled.

## Output formats

With no explicit `-o` and no saved machine format, a normal terminal gets the human layout; a pipe, `TERM=dumb`, CI or agent mode (`HOODY_AGENT_MODE=1`) gets the plain layout, and typing `-o table` or `-o wide` also selects the plain layout. A saved `json`, `yaml`, `ndjson` or `raw` format takes precedence when no `-o` is typed. `json`/`yaml` print just the unwrapped `data` payload (the CLI strips the `{statusCode,message,data}` envelope via `isApiEnvelope`), except on a command whose answer has fields beside `data` (the `hoody boturls` management and key commands, for one, with `propagation`): those print `{ data, … }`, so read `.data.<field>` there; with `--until-done`, `-o json` prints `{ response: <that payload>, outcome: { state, event } }` instead (`state` is `done`, `failed`, `timeout`, `interrupted` or `unauthorized`), and `-o yaml` is unchanged; `raw`=payload/SSE; when piped, in CI or in agent mode, generated event streams and `events stream` print `ndjson`, while `proxy logs stream` and `pipe progress stream` print readable lines unless you type `-o ndjson` or `-o json` (`hoody agent prompt` defaults to `pretty` on a terminal, `ndjson` when piped); `pretty`=human stream. `-q` keeps `json`/`yaml`.

## Exit codes

`0`=success; `1`=general command/HTTP failure (4xx and 5xx both, except as `4` and `124` below and in `hoody exec remote`); `2`=a usage refusal of the CLI's own (a missing or malformed Bot URL key or URL, a Bot URL caller's parser error, `--http` or `--http-curl` on a command that has neither, a retired flag spelling, some `hoody shell` errors, an unknown `--profile` on `logout`), a pending 2FA challenge (login saved nothing; finish with `hoody auth 2fa verify --temp-token …`), a signup that needs a browser check (nothing created; finish the check, then run the printed `hoody signup … --challenge <code>`), an update failure, or an exec-dynamic parse failure (other parser errors, such as an unknown option, generally exit `1`); `3`=authenticated but saving credentials failed (or logout could not clear them, or `--print-token` had no token), or a history gap before a match in `events stream --once`; `4`=`events stream`, `computers wait` or `--until-done`: authorization failure (HTTP 401/403) or revocation; `6`=TTY absent (interactive prompt requested but no TTY available); `7`=in `hoody local lock`: a confirmation you declined or could not give (no terminal and no confirming flag), or multiple lock-password sources (everywhere else a declined confirmation prompt prints `Action cancelled` and exits `0`); `8`=lock contention; `9`=lock validation error; `10`=local-lock password or recovery rollback error, or a missing profile or field in `local lock reveal` (an unknown `--profile` on an ordinary command exits `1`); `11`=crypto/lock error; `12`=migration error; `14`=ephemeral-token policy; `70`=`hoody run` or a one-shot `hoody shell <id> -- <command>`: the server answered 5xx (for the shell, also an answer it could not read); `124`=the `--timeout` of `events stream`, `computers wait` or `--until-done` passed; `129`=SIGHUP; `130`=SIGINT; `143`=SIGTERM; `149`=SIGBREAK (Windows). `hoody exec remote` has its own codes: `3`=a disabled capability or a token without the scope (HTTP 403), `4`=a missing, invalid or non-eval token, `5`=the script threw (HTTP 422), `124`=timeout; `hoody exec remote --help` lists them. `hoody run --open`, `hoody run close` and `hoody run status` have theirs too: `2`=failed (nothing running, or the app exited non-zero) or a usage error, `3`=unknown or unreachable, `4`=a kit on the computer is too old to open apps (nothing was sent). A one-shot `hoody shell <id> -- <command>` exits with the command's own code, `124` on a timeout and `128`+N when a signal ended it. Two cases exit differently by command today: "No computer specified" exits `2` in `hoody agent`, `shell`, `daemon attach`, `share`, `run` and `voice`, and `1` in the kit commands, `egress local start`, `tunnel` and `pipe`; over the SSH gateway a refused `share`, `mount` or `unmount` exits `2`, and a refused `pipe`, `tunnel` or `egress local start` operation exits `1`.

## Login flow

`hoody login --web` is browser sign-in (add `--no-browser` to print the link and code instead of opening a browser); it polls until the user approves and saves the session. The rest of this section is the password path: `POST /api/v1/users/auth/login`. Auto-login from the global `-u`/`--username` (or `HOODY_USERNAME`/config) sends a value containing `@` as `email` and anything else as `username`. The explicit `hoody login` sends exactly the flag you pass: `--username <name>` or `--email <addr>`. If the response carries a `temp_token` without a `token`, the auto-login flow throws `Auto-login cannot complete the 2FA challenge`; finish the flow explicitly with `hoody auth 2fa verify --temp-token <tt> --code <6-digit OTP or 10-char backup code>` (or call `POST /api/v1/users/auth/2fa/verify`). Token persisted; `hoody logout` clears.

## Local-only operations

`hoody local` — `~/.hoody/`, no server calls. `defaults set <key> <value>` pins `computer`/`realm`/`output`/`noColor`/`quiet`, `defaults get` shows them and `defaults clear <key>` removes one. `lock {enable|status|password set|reveal|disable|ephemeral enable|ephemeral disable|recover|doctor|delete}` (no `unlock` subcommand) uses `flock()`. `--non-interactive` accepts exactly one password source: `--local-password <pw>`, `HOODY_LOCAL_PASSWORD` env var, file/fd, or stdin. Combining sources (an env var plus a flag included) is refused with exit code 7.

## Update

Two channels. With an update domain (`--domain`/`HOODY_DOMAIN`/`~/.config/hoody/domain`) the CLI fetches that domain's manifest and **minisign-verifies** it against the build-embedded key (bad sig aborts; an explicit but untrusted domain is refused, never downgraded). With no domain configured (the npm and install-script default) it asks npm, then GitHub, for the latest version: no signature check. `update` checks for newer releases and prints install instructions; it does not atomically replace `$0`. The update banner runs only on bare `hoody`, `--help`, and explicit `hoody update` (no per-command implicit check). `HOODY_NO_UPDATE_CHECK=1` suppresses the banner.

## Environment variables

`HOODY_TOKEN`/`HOODY_API_TOKEN`, `HOODY_COMPUTER`/`_ID`, `HOODY_REALM`/`_ID`, `HOODY_USERNAME`, `HOODY_PASSWORD`, `HOODY_BASE_URL`/`_API_URL`, `HOODY_PIPE_URL`, `HOODY_PROFILE`, `HOODY_DOMAIN`, `HOODY_KIT_AUTH`, `HOODY_KIT_USER`, `HOODY_KIT_TOKEN`, `HOODY_KIT_TOKEN_HEADER`, `HOODY_KIT_PASSWORD`, `HOODY_NO_UPDATE_CHECK`, `NO_COLOR`, proxy (`ALL_PROXY`/`HTTPS_PROXY`/`HTTP_PROXY`). The config file path is set via the global `--config` flag (no `HOODY_CONFIG` env var).

## Bot URLs

`hoody boturls` manages your Bot URLs by `bu_` id (`list`, `create`, `get`, `update`, `repoint`, `panic`, `delete`, `label suggest`, and the key commands `keys create <id> --name <name>`, `keys update <id> <key-id>`, `keys rotate <id> <key-id>` and `keys revoke <id> <key-id>` (`keys revoke <id> --all` revokes every key); a new or rotated key's secret is printed once). While Bot URLs are unavailable on the platform (switched off, or no usable Bot zone), `create`, `label suggest`, `repoint` and an `update --enabled` that turns a disabled URL on are refused (503 `BOTS_DISABLED`); while the zone is missing, `url`, `test_curl` and the key's `curl` are `null` in JSON output and `-` in tables. The owner-side rules (who may manage one, the limits, labels, key handling, lifecycle and errors) are in the `api` namespace page, and the `agent` namespace page, Example 4, runs the whole flow: create, mint a key, call it, rotate, panic. The same group calls a Bot URL with a key and no `hoody login`: `hoody boturls ask <url> "<message>"`, `hoody boturls chat <url> "<message>"`, `hoody boturls status <url>`, `hoody boturls answer <url> --decision <decision>` with exactly one of `--gate-id <g_…>` or `--title <title>`, `hoody boturls models list <url>`, `hoody boturls updates list <url>` and `hoody boturls events stream <url>` (`events stream` follows the Bot live; it prints human-readable lines on a terminal's human layout and JSON lines otherwise, `-o json` (or `-o ndjson`) selects JSON lines, and `--max-wait <s>` takes whole seconds from 0 (no limit) to 86400, default 600). The key comes from `HOODY_BOT_KEY` (or the variable `--key-env` names) or `--key-file <path>` (`-` reads stdin); there is no `--key` flag, so the key never sits on a `hoody` command line. Set the variable without typing the key into a command (`read -rs HOODY_BOT_KEY && export HOODY_BOT_KEY`, then paste), or keep it in a file only you can read and pass `--key-file`; `export HOODY_BOT_KEY=hbk_…` typed in a shell puts the key in its history, and errors and diagnostics the Bot URL commands print contain no authentication material: they show fixed texts and checked fields only, a parser error (an unknown option, a missing argument) prints one fixed line that never repeats what you typed, the AI command fixer is never sent a command line with a token starting with `bot`, containing `.hoody.bot` or `hbk_`, or a `--key…` or `--zone` option (other command lines are sent as before, so never put a key in another command's arguments), and abort reasons are not propagated (what the Bot answers on success is printed as written, except that text output shows control and bidirectional-formatting characters as spaces; `-o json` prints it unchanged). Other global option checks can repeat the value they reject (an invalid `--realm`, for one), so pass the key only through `HOODY_BOT_KEY` (or the variable `--key-env` names) or `--key-file`, never as another option's value. `hoody boturls ask <url> "<message>"` follows the Bot's `working` refs for 600 seconds by default (`--max-wait <seconds>`; `--no-wait` does not wait) and can still end with `working` and exit code 0: without `-o json` the status and ref print on stderr, with `-o json` read `status` and `ref`, then rejoin with `hoody boturls ask <url> --ref <ref>` using the same key. A status that says it is waiting on a gate needs the owner. On `outcome_unknown` the Bot may already have acted: read `status <url>` or `updates list <url>` before sending again, because repeating the text can start new work. `hoody boturls chat` reads only the final message, which must be text only (at most 64 KiB); the Bot keeps its own conversation history. `hoody boturls answer <url> --gate-id <g_…> --decision <decision> [--text …]` (or `--title <title>` in place of `--gate-id` when the delegate has one pending gate; `<decision>` is one of `approve`, `allow_session`, `deny` or `answer`) answers a delegate's pending gate; a gate on the Bot's own session (`status` marks it owner-only) can only be resolved by the owner in the Hoody app. A caller verb given a `bu_` id points you at `get`; one given something that looks like a key refuses without repeating it. A refusal prints `<code>: <message>` with any `Retry-After` and the request ID and exits 1; a missing or malformed key or URL exits 2. `-o json` prints JSON (the old `--json` is refused, exit 2). The URL must be a label under `hoody.bot`, under the Bot zone of the platform the CLI was installed from, or under the zone `--zone <zone>` names; any other host is refused before the key is sent.

---

## Subskill index

- [`agent`](https://hoody.com/SKILLS/SKILL-CLI/agent.md) — In-computer AI coding agent over HTTP
- [`api`](https://hoody.com/SKILLS/SKILL-CLI/api.md) — Platform control plane: identity, projects, computers, billing, vault
- [`browser`](https://hoody.com/SKILLS/SKILL-CLI/browser.md) — Per-computer Chromium or Firefox instances, one per slot
- [`code`](https://hoody.com/SKILLS/SKILL-CLI/code.md) — VS Code in the browser, per computer
- [`cron`](https://hoody.com/SKILLS/SKILL-CLI/cron.md) — managed crontab entries per system user
- [`curl`](https://hoody.com/SKILLS/SKILL-CLI/curl.md) — full HTTP client gateway + REST-as-GET-URL bridge
- [`daemon`](https://hoody.com/SKILLS/SKILL-CLI/daemon.md) — supervisord program lifecycle (start any program; logs kept)
- [`display`](https://hoody.com/SKILLS/SKILL-CLI/display.md) — programmatic GUI desktops with screenshots, input, and windows
- [`egress`](https://hoody.com/SKILLS/SKILL-CLI/egress.md) — the computer's outbound HTTP proxy
- [`exec`](https://hoody.com/SKILLS/SKILL-CLI/exec.md) — micro-services: any script or API as an instant HTTP endpoint
- [`files`](https://hoody.com/SKILLS/SKILL-CLI/files.md) — computer filesystem over HTTP, with automatic Git-like change history
- [`notes`](https://hoody.com/SKILLS/SKILL-CLI/notes.md) — Collaborative notebooks, hierarchical nodes, documents, databases
- [`notifications`](https://hoody.com/SKILLS/SKILL-CLI/notifications.md) — Trigger and consume desktop notifications inside a computer
- [`pipe`](https://hoody.com/SKILLS/SKILL-CLI/pipe.md) — Zero-storage streaming HTTP transfers
- [`proxyLogs`](https://hoody.com/SKILLS/SKILL-CLI/proxyLogs.md) — Per-computer request/response/event log query, stats, and SSE tail
- [`run`](https://hoody.com/SKILLS/SKILL-CLI/run.md) — resolve apps to shell commands
- [`sqlite`](https://hoody.com/SKILLS/SKILL-CLI/sqlite.md) — SQLite HTTP API
- [`terminal`](https://hoody.com/SKILLS/SKILL-CLI/terminal.md) — Persistent multiplayer PTY sessions over HTTP and WebSocket
- [`tunnel`](https://hoody.com/SKILLS/SKILL-CLI/tunnel.md) — reverse tunnels for HTTP/WS/TCP via computer relay
- [`vm`](https://hoody.com/SKILLS/SKILL-CLI/vm.md) — virtual machines inside a computer: lifecycle, media, snapshots
- [`watch`](https://hoody.com/SKILLS/SKILL-CLI/watch.md) — Linux inotify file-change streams with replay history
