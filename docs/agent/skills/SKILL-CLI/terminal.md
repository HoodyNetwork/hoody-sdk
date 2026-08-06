> _**CLI skill · `terminal` namespace** · ~7,558 tokens · hoody-sdk v1.0.0-beta.12_

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
  --shell ssh --ssh-host 10.0.0.42 --ssh-user deploy --ssh-port 22 --ssh-password "$SSH_PASSWORD"
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

