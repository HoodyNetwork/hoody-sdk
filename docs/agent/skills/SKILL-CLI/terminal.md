> _**CLI skill · `terminal` namespace** · ~9,349 tokens · hoody-sdk v1.0.0-beta.15_

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

`hoody terminal sessions create` (pin `terminal_id` or `ephemeral=true`) → `hoody terminal commands run` (body `wait` defaults to `true` and asks for a synchronous result, but SSH sessions, `defer_pid` commands and a server at its concurrent-wait cap answer asynchronously — check `status` and poll `hoody terminal commands get` by `command_id`; send body `wait: false` for an async `command_id`; shares shell state) → `hoody terminal commands get` → `hoody terminal sessions read`/`hoody terminal sessions screenshots capture` → `hoody terminal sessions delete`. The CLI exec command cannot send `wait: false`; type a fire-and-forget command with `hoody terminal sessions write` instead.

### 2. Ephemeral one-off execute

`hoody terminal commands run` `ephemeral=true`, `wait=true` — auto ID 40000–65535, runs `command`, cleans up. Through the proxy, send it to the `terminal-0` hostname: any other `terminal-N` host pins the request to terminal N. Later: `hoody terminal commands get` before the session goes: an ephemeral session holding results is removed after `ephemeral-result-timeout` (300 s default) of inactivity with no attached client.

### 3. Automate a TUI

`hoody terminal sessions create` (or `hoody terminal commands run` to launch) → `hoody terminal sessions press` (`Down`/`Enter`/`F2`; `hoody terminal keys list`) → `hoody terminal sessions paste` (`bracketed=true`) → `hoody terminal sessions wait` (`mode`: `stable`, `regex` with a `pattern`, or `either`) → `hoody terminal sessions snapshot get`/`hoody terminal sessions search`.

### 4. Live stream — WebSocket

`hoody terminal sessions connect` at `/api/v1/terminal/ws?terminal_id=…` on the session's `terminal-N` host. After the socket opens, the client must send the initial JSON dimensions message (`{"columns":…,"rows":…}`) before the server sends output. Multiple WS clients attach simultaneously; writes broadcast to PTY. The CLI has no streaming WebSocket reader: `hoody shell --terminal-id N` attaches an interactive PTY instead. Inject from REST via `hoody terminal sessions write` or `hoody terminal sessions press`. `hoody terminal commands cancel` interrupts by `command_id`.

### 5. Container introspection

`hoody terminal processes list`, `hoody terminal processes get`, `hoody terminal processes signal`, `hoody terminal system ports list`, `hoody terminal system stats`, `hoody terminal system displays list`, `hoody terminal system daemon programs list`, `hoody terminal system reboot`/`hoody terminal system shutdown`. `hoody terminal processes list` and `hoody terminal system ports list` answer in a single response with no pages (`hoody terminal processes list` takes `limit`, `sort` and `filter`). Add `-o json` to get the full response bodies.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–39999, **never** the ephemeral range 40000–65535, **never** re-use one another program is on).
2. `hoody terminal sessions create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/workspace'` (or wherever).
3. `hoody terminal commands run` with body `command: 'claude'` (or `codex`, `aider`, `gemini …`) and body `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request. The CLI exec command cannot send `wait: false`; type the command into the PTY with `hoody terminal sessions write --terminal-id <id> --input claude` instead.
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

- **Sharing a terminal URL = handing out root.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as root: read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `proxy.containerPermissions`. Share only with people you'd trust with `ssh root@…`. For wider audiences, gate (`setPasswordGroup` / `setTokenGroup` / `setIpGroup`), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script or a read-only `display` stream over a live PTY.
- `terminal_id` numeric **1–65535**. **40000–65535 reserved for ephemeral**; pin manual IDs in 1–39999.
- `terminal_id=0` = sentinel "treat as absent".
- **Display pairing.** `hoody terminal sessions create` builds the session's `DISPLAY` from its `display` field and ignores any `display` in the request URL, so there is no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). `hoody terminal commands run` differs: a session it has to create is configured from the request URL, where `display=N` (or the `display_id=N` alias) sets `DISPLAY=:N` — and on a `terminal-N` host that parameter is supplied for you, so a session first created that way already renders on `:N`. `ephemeral=true` still strips it, and an already-running session keeps the `DISPLAY` it spawned with. The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` returns `/execute` immediately even with `wait=true`; queues until named PID exits (TUI-safe), for at most `defer_timeout_ms` (60000 ms default) — on expiry the command never runs.
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is plain UTF-8, not base64; only the URL-form `?cmd=<base64>` is base64-decoded.** The kit wraps the command with shell bookkeeping (optional `cd`, environment prefix, exit-code capture, completion-marker echo) before it reaches the PTY; for direct interactive input use `hoody terminal sessions write`, `hoody terminal sessions paste` or `hoody terminal sessions press`.
- **`/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A `terminal_id` in the body is ignored; with no `?terminal_id` the request is `400 terminal_id parameter required`.
- Completion normally comes from the `COMMAND_COMPLETED_MARKER_{id}` tail, stripped before `/result/{id}`. A command is also marked completed when the session's process has died (exit code 1), or — on a non-ephemeral session with no explicit `timeout` — after 10 s of output silence once some output was captured (exit code 0, marker never seen). A `completed` result therefore does not prove a long-running program exited; a program that swallows the marker and never falls silent keeps `wait=true` waiting.
- **`wait=false` returns `status:"queued"` or `"running"` immediately** (NOT `"completed"`) — the kit tracks the command through its marker and output, not the underlying PID. Re-check actual output via `hoody terminal sessions read` / `hoody terminal sessions snapshot get`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. (Note: the generated SDK type only allows `png | jpeg | gif`, so `jpg` works only via raw HTTP.)
- **`hoody terminal processes signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- `hoody terminal processes pause` / `hoody terminal processes resume` send SIGSTOP / SIGCONT to `{pid}` or `{name}`, never both. `name` matches the kernel `comm`, which Linux cuts to 15 characters, so a longer name matches nothing. PIDs 1 and 2 and the terminal server's own and parent PIDs are refused with 403. `include_descendants: true` also signals every child process (best-effort, not atomic). A frozen process keeps its memory until `hoody terminal processes resume`.
- `hoody terminal sessions mouse send` takes 0-based text cells (row, col), not pixels; a cell off the screen is a 400. The program sees the event only when it has turned on terminal mouse reporting (htop, vim with `mouse=a`, tmux with `mouse on`); otherwise the call still answers 200, with `bytes_written: 0`.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).
- `hoody shell` is an interactive PTY, or a one-shot via a POSITIONAL command (`hoody shell <cid> -- uname -a`). There is no `--command` flag and no `--ephemeral` flag on `shell`. For pinned ids on the automation surface use `terminal commands run --terminal-id <n>`.

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id; the lower-level validator logs a near-identical `0-65535` warning.
- `400` config-error on `hoody terminal sessions create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `404` on `hoody terminal commands get` once the result is gone: its session was removed (an ephemeral session holding results goes after `ephemeral-result-timeout` of inactivity with no attached client), or the session's result buffer filled and evicted it.
- `Unknown program name "<name>"` (400) on `hoody proxy aliases create` → the `program` is not in the platform's program catalog. For a terminal alias use `program=terminal` (not `hoody-terminal` or `terminal-N`); pick the instance with `index`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

⚠ Through the containers proxy, the **`terminal-N` hostname selects the terminal**: the proxy sets `terminal_id` from `N` and overwrites any value you send, so every example addresses the session's own host (`terminal-100` for session 100; `terminal-0` for ephemeral allocation). In the SDK that is `_templateVars: { serviceIndex: N }` (default 1); the CLI derives the host from `--terminal-id`. When calling the kit directly, the HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body parser only consumes the `command`, `id`, `timeout`, the boolean wait sync flag, `cwd` and `env` keys); missing the query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`. Always pass `?terminal_id=N`. The `command` body field is **plain UTF-8**, not base64 (only the URL form `?cmd=<base64>` is base64-decoded); the kit wraps it with its own shell bookkeeping and completion-marker echo before PTY delivery. `wait=true` normally returns when the kit sees the completion marker; a non-ephemeral command with no `timeout` is also reported completed after 10 s without new output, provided some stdout has already been captured, and programs that swallow the marker or only background-fork can return `status:"completed"` with empty or partial stdout — re-check via `hoody terminal sessions read` if in doubt. Add `-o json` to `hoody terminal commands run` to get the full result body (`stdout`, `exit_code`, `command_id`) for scripting.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session.

**Step 1 — create the session.** `terminal_id` is required in the body; pin in `1–39999`.

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

Cleanup: `DELETE /api/v1/terminal/101`.

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
hoody --container "$C" terminal system displays list | jq '.[] | select(.display==10)'
hoody --container "$C" display screenshots capture --display-id 10
```

Cleanup: kill `xeyes` via `hoody terminal processes signal --name xeyes --signal SIGTERM` or just `hoody terminal sessions delete <terminal-id>` (drops the shell + child GUIs).

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the container's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```bash
hoody --container "$C" terminal sessions create --terminal-id 11 \
  --shell ssh --ssh-host 10.0.0.42 --ssh-user deploy --ssh-port 22 --ssh-password "$SSH_PASSWORD"
hoody --container "$C" terminal commands run --terminal-id 11 --command 'hostname; whoami' --wait -o json
```

An SSH session always answers `hoody terminal commands run` asynchronously, even with `wait: true`: read `command_id` from the response and poll `hoody terminal commands get`.

To route the SSH connection through a SOCKS5 proxy, keep `ssh_host` and `ssh_user` and add `socks5_host` / `socks5_port` (plus `socks5_user` / `socks5_pass` if the proxy needs credentials); SOCKS5 fields without `ssh_host` and `ssh_user` are rejected. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with body `wait: false`** so the request returns instantly while the agent stays alive in the PTY. `commands run` in the CLI has no `--no-wait`; the CLI form types the command into the PTY with `sessions write` instead. The `cwd` must already exist: `hoody terminal sessions create` has no auto-create option and fails on a missing directory. To have the kit create it, skip `hoody terminal sessions create` and let `hoody terminal commands run` create the session, passing `cwd` and `cwd_auto_create=true` with the pinned `terminal_id`. The CLI form below creates the session first, so its `--cwd` must exist:

```bash
hoody --container "$C" terminal sessions create --terminal-id 50 --shell bash --cwd /workspace
hoody --container "$C" terminal sessions write --terminal-id 50 --input 'sleep 600; echo agent-stopped'
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

**Step 1 — submit async (body `wait: false`), capture `command_id`.** `commands run` in the CLI has no `--no-wait`, so the CLI form types the command with `sessions write` and has no `command_id` to abort.

```bash
hoody --container "$C" terminal sessions create --terminal-id 70
hoody --container "$C" terminal sessions write --terminal-id 70 --input 'sleep 120'
```

**Step 2 — abort** the command tracker. Add `force:true` to send SIGKILL; default sends SIGINT.

```bash
# With a command_id from HTTP/SDK:
hoody --container "$C" terminal commands cancel "$CID" --force
# For the CLI-typed command above, interrupt it in the PTY instead:
hoody --container "$C" terminal sessions press --terminal-id 70 --key ctrl+c
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
| `hoody terminal commands list` |  | read | Get terminal command history | `terminal.commands.list` | `hoody terminal commands list 12345` |
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
| `hoody terminal sessions connect` |  | read | WebSocket terminal connection | `terminal.sessions.connect` | `hoody terminal sessions connect --terminal-id 12345 --readonly` |
| `hoody terminal sessions create` |  | write | Create a terminal session | `terminal.sessions.create` | `hoody terminal sessions create --ephemeral --display 5` |
| `hoody terminal sessions delete` |  | destructive | Delete a terminal session | `terminal.sessions.delete` | `hoody terminal sessions delete 12345 -y` |
| `hoody terminal sessions list` |  | read | List all terminal sessions | `terminal.sessions.list` | `hoody terminal sessions list --history-limit 50` |
| `hoody terminal sessions mouse send` |  | write | Send a cell-based mouse event to a terminal session | `terminal.sessions.sendMouseEvents` | `hoody terminal sessions mouse send --terminal-id 1 --event-type move --event-row 10 --event-col 10 --event-button 1` |
| `hoody terminal sessions paste` |  | write | Paste text into terminal | `terminal.sessions.paste` | `hoody terminal sessions paste --terminal-id 1 --text Hello --bracketed` |
| `hoody terminal sessions press` |  | write | Send named key presses to terminal | `terminal.sessions.pressKeys` | `hoody terminal sessions press --terminal-id 1 --keys ctrl+c` |
| `hoody terminal sessions read` |  | read | Get raw terminal output | `terminal.sessions.read` | `hoody terminal sessions read --terminal-id 12345 --format download` |
| `hoody terminal sessions screenshots capture` |  | read | Capture terminal screenshot | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshots capture --terminal-id 12345 --format png --foreground white` |
| `hoody terminal sessions search` |  | read | Search terminal screen with regex | `terminal.sessions.search` | `hoody terminal sessions search --terminal-id 1 --pattern TODO --scope screen --limit 100` |
| `hoody terminal sessions snapshot get` |  | read | Get rendered terminal snapshot | `terminal.sessions.getSnapshot` | `hoody terminal sessions snapshot get --terminal-id 1 --include-colors --include-highlights` |
| `hoody terminal sessions wait` |  | write | Wait for terminal condition | `terminal.sessions.wait` | `hoody terminal sessions wait --terminal-id 1 --mode stable --debounce-ms 100` |
| `hoody terminal sessions write` |  | write | Write input to terminal | `terminal.sessions.write` | `hoody terminal sessions write --terminal-id 40001 --input <input> --enter` |
| `hoody terminal system daemon programs list` |  | read | Get daemon programs configuration | `terminal.system.listDaemonPrograms` | `hoody terminal system daemon programs list` |
| `hoody terminal system displays list` |  | read | Get display information | `terminal.system.listDisplays` | `hoody terminal system displays list` |
| `hoody terminal system displays stop` |  | destructive | Stop an X display and everything drawing on it, including a display a deleted terminal session left running | `terminal.system.stopDisplay` | `hoody terminal system displays stop 1 -y` |
| `hoody terminal system ports list` |  | read | List all listening network ports | `terminal.system.listPorts` | `hoody terminal system ports list --protocol tcp --user root` |
| `hoody terminal system reboot` |  | write | Reboot the system | `terminal.system.reboot` | `hoody terminal system reboot --delay 60` |
| `hoody terminal system shutdown` |  | write | Shutdown the system | `terminal.system.shutdown` | `hoody terminal system shutdown --delay 60` |
| `hoody terminal system stats` |  | read | Get system resources and statistics | `terminal.system.getStats` | `hoody terminal system stats` |

