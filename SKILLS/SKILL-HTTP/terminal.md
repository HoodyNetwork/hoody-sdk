> _**HTTP skill · `terminal` namespace** · ~18,293 tokens · hoody-sdk v1.0.1_

# `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket

## Purpose

Real PTY per computer, numeric `terminal_id` (a new session needs 1–9999; ids up to 65535 only reach sessions an older version made). REST + WebSocket. Multiplayer; sessions persist.

## When to use

- **Interactive TUIs** that paint the screen (Claude Code, Codex, vim, htop, less, fzf, ssh, etc.) — these need a real PTY; only `terminal` provides one.
- **Durable / long-lived programs that you may need to interact with later** (the agent you spawned, a coding assistant, a chat REPL) — pin a stable `terminal_id` (1–1600) and reattach over WS or REST. When it must be supervised (restarted on exit, started at boot), run it as a `daemon` program with `terminal_id` instead: its terminal is attached the same way (see "Daemon program terminals" below).
- Sequenced commands sharing shell state, keystroke automation, screen capture, regex-search the rendered buffer.
- SSH / SOCKS5 sessions (`ssh_*` / `socks5_*`).
- Host introspection (`* /api/v1/system/*`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process. A session made by `POST /api/v1/terminal/create` renders on a display only when given a `display` (a string such as `"10"`; the id never sets it); a session first created by `POST /api/v1/terminal/execute` takes its display from the request URL instead (see Quirks). Keeping ids distinct keeps each terminal-to-display pairing one-to-one. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `5001–7999` when no `terminal_id` is given (a pinned id converts that terminal, see recipe 2), and once one sits inactive with no attached WebSocket client it is removed and its process force-killed by the periodic cleanup: after 60 s of inactivity by default when it holds no results, otherwise after `ephemeral-result-timeout` (300 s default). Your Claude Code / Codex session would die at that point.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- A script that should be callable over HTTP → `exec`. (A one-off shell command fits `terminal` itself: ephemeral, workflow 2. When its logs must outlive the response, use `POST /api/v1/daemon/quick-start`.)
- File I/O → `files`. GUI rendering → `display`. Schedule → `cron`.

## Prerequisites

- Computer with `terminal` kit running; capability URL.
- SSH needs reachable `ssh_host:ssh_port`; automation needs existing `terminal_id`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Persistent interactive session

`POST /api/v1/terminal/create` (pin `terminal_id` in 1–1600 and keep `ephemeral: false`: an ephemeral session's process is killed once idle with no client attached) → `POST /api/v1/terminal/execute` (body `wait` defaults to `true` and asks for a synchronous result, but SSH sessions, `defer_pid` commands and a server at its concurrent-wait cap answer asynchronously — check `status` and poll `GET /api/v1/terminal/result/{command_id}` by `command_id`; send body `wait: false` for an async `command_id`; shares shell state) → `GET /api/v1/terminal/result/{command_id}` → `GET /api/v1/terminal/raw`/`GET /api/v1/terminal/screenshot` → `DELETE /api/v1/terminal/{terminal_id}`. 

### 2. Ephemeral one-off execute

`POST /api/v1/terminal/execute` `ephemeral=true`, `wait=true` — auto ID 5001–7999, runs `command`, cleans up. Through the proxy, send it to the `terminal-0` hostname: any other `terminal-N` host pins the request to terminal N: the command runs inside that terminal, which becomes an ephemeral session (a terminal N with a display, one a client has attached to, or an agent session is refused with `409` instead), and every later execute on that host queues behind it. Each execute's timeout (600 s by default on an ephemeral session) starts when the command is submitted for execution, after any `defer_pid` wait, and runs while it waits in the queue, so behind a command that hangs until its timeout, later ones can time out without ever running. Later: `GET /api/v1/terminal/result/{command_id}` before the session goes: an ephemeral session holding results is removed after `ephemeral-result-timeout` (300 s default) of inactivity with no attached client. 

### 3. Automate a TUI

`POST /api/v1/terminal/create` (or `POST /api/v1/terminal/execute` to launch) → `POST /api/v1/terminal/press` (`Down`/`Enter`/`F2`; `GET /api/v1/terminal/keys`) → `POST /api/v1/terminal/paste` (`bracketed=true`) → `POST /api/v1/terminal/wait` (`mode`: `stable`, `regex` with a `pattern`, or `either`) → `GET /api/v1/terminal/snapshot`/`GET /api/v1/terminal/find`.

### 4. Live stream — WebSocket

`GET` at `/api/v1/terminal/ws?terminal_id=…` on the session's `terminal-N` host. After the socket opens, the client must send the initial JSON dimensions message (`{"columns":…,"rows":…}`) before the server sends output. Multiple WS clients attach simultaneously; writes broadcast to PTY. Inject from REST via `POST /api/v1/terminal/write` or `POST /api/v1/terminal/press`. `POST /api/v1/terminal/execute/{command_id}/abort` interrupts by `command_id`.

### 5. Computer introspection

`GET /api/v1/system/processes`, `GET /api/v1/system/processes/{pid}`, `POST /api/v1/system/process/signal`, `GET /api/v1/system/ports`, `GET /api/v1/system/resources`, `GET /api/v1/system/displays`, `GET /api/v1/system/daemon`, `POST /api/v1/system/reboot`/`POST /api/v1/system/shutdown`. `GET /api/v1/system/processes` and `GET /api/v1/system/ports` answer in a single response with no pages (`GET /api/v1/system/processes` takes `limit`, `sort` and `filter`). 

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–1600; **never** 1601–5000, which backs `desktop-N` and `agent-N` with the default bands, the ephemeral range 5001–7999 or the 8001–9999 program-terminal band; **never** re-use one another program is on).
2. `POST /api/v1/terminal/create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/home/user'` (or wherever).
3. `POST /api/v1/terminal/execute` with body `command: 'claude'` (or `codex`, `aider`, `gemini …`) and body `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request. 
4. Reattach any time: open the WebSocket at `/api/v1/terminal/ws?terminal_id=<id>` and send the initial dimensions message (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or drive it over REST with `/press` / `/paste`.
5. Tear down only when really done: `DELETE /api/v1/terminal/{terminal_id}`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a computer reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `21`, Codex on `22`; avoid `1`, the shared terminal that `hoody shell`, the `terminal-1` URL and every client that names no terminal attach to). If a session needs a display, pass `display` explicitly on `POST /api/v1/terminal/create` (a string, for example `"10"`); distinct ids keep that pairing one-to-one.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. When creating the session with `POST /api/v1/terminal/create`, pass the matching `display` explicitly; it does not derive it from `terminal_id`. A session first created by `POST /api/v1/terminal/execute` on a `terminal-N` host gets `DISPLAY=:N` from the URL instead; see Quirks.

1. `POST /api/v1/terminal/create` with a pinned `terminal_id` (e.g. `10`) AND a matching `display: "10"` field (string in the SDK type), so the kit exports `DISPLAY=:10` into the PTY.
2. From that session: `POST /api/v1/terminal/execute` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-10`.
3. Open the matching display kit URL — `https://{projectId}-{computerId}-display-10.{node}.computers.hoody.com` (read `project_id`, `id` and `server_name` from `GET /api/v1/computers/{id}` for `{projectId}`, `{computerId}` and `{node}`).
4. Drive the GUI via the `display` namespace:
   - `GET /api/v1/display/screenshot` — see what's on screen (turn `base64` on for vision agents).
   - `POST /api/v1/display/input/click-at` with `{ x, y, button }` — left/right click; `POST /api/v1/display/input/type-at` with `{ x, y, text }` — click at a point, then type.
   - `POST /api/v1/display/window/search` with `{ pattern, name?: true, class?: true }` (a `pattern` plus booleans that pick the fields to match) → `POST /api/v1/display/window/focus` / `GET /api/v1/display/window/{windowId}/geometry` / `GET /api/v1/display/window/active` to focus + locate.
   - `POST /api/v1/display/input/batch` — bulk input replay; `POST /api/v1/display/input/wait` between actions.
5. Tear down: kill the GUI program with `POST /api/v1/system/process/signal`, or use `DELETE /api/v1/terminal/{terminal_id}` to end the shell and GUI programs it started, unless they detached with `setsid` or `nohup`. The display itself keeps running after the session is deleted; end it with `POST /api/v1/system/displays/{display}/stop` when nothing else uses it.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=10`↔`display:":10"`, `terminal_id=11`↔`display:":11"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, open the `desktop-<N>` alias directly (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-HTTP.md`). It auto-spawns the DE on a separate display of its own (not display `<N>`), so apps started by the steps above do not appear on it; this recipe is for spawning **specific** apps under your own control.

### 8. Daemon program terminals

A daemon program configured with `terminal_id: N` runs on terminal N's PTY, and terminal N belongs to it while the program is configured. Nothing spawns there: shell, cwd, user, env, display, `cmd` and `pid` parameters on that id are ignored.

1. Attach: `/api/v1/terminal/ws` on host `terminal-N` with the `tty` subprotocol, then the JSON dimensions message; no spawn parameters. Every client sees the same screen, writable clients type into it (Ctrl-C goes to the program), and the program gets the smallest size among the writable clients (read-only clients count only when none is writable).
2. Drive without a WebSocket: snapshot, find, press, mouse, paste, write, wait, raw and screenshot connect to the program on demand. Execute and session create on the id answer `409 DAEMON_TERMINAL`: there is no shell to run a command in.
3. Program not running: the WebSocket closes `4404` `daemon program not running`; REST answers `409 DAEMON_PROGRAM_NOT_RUNNING`. Start it with the daemon, then attach again.
4. Program ends while attached: clients close with `4404` `daemon program ended`, and a pending wait answers `exited`. The next attach reaches the restarted instance on a clean screen.
5. `GET /api/v1/terminal/sessions` shows every program terminal, opened or not: `daemon_program: true`, `shell: null`, and a `daemon` object (`program_id`, `program_name`, `user`, `enabled`, `running`, `connected`, `ended`); `running` means its launcher is listening; `pid` is the terminal's session leader (the program runs under it) while connected, 0 otherwise, and `cols`/`rows` the terminal's current size (`null` until sized). A local shell already on the id stays listed as that shell (`daemon_program: false`, the program in `daemon`); delete it to reach the program.
6. `DELETE /api/v1/terminal/{terminal_id}` drops the terminal's connection to the program, not the program. A program that starts before anything attaches sees a 0x0 terminal size until the first attach or REST call.

## Quirks & gotchas

- **Sharing a terminal URL = handing out a shell.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as the terminal's configured user, which may be root (a daemon program's terminal runs as that program's `user`): read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `computers.proxy`. Share only with people you'd trust with a login as that user. For wider audiences, gate the computer (§ How to gate: an auth group via `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/password`, `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/token` or `PUT /api/v1/computers/{id}/proxy/permissions/groups/{groupName}/ip`, that group's access to `terminal`, and `default: 'deny'`; a group alone restricts nothing), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script over a live PTY (a `display` URL is no read-only alternative: its readonly setting is client-side only, and its holder can still send input).
- `terminal_id` is numeric; a new session needs **1–9999** (the kit still accepts ids up to 65535 for sessions an older version made, but the proxy refuses any terminal index above 9999, so those cannot be reached through a kit URL). With the proxy's default bands, **1601–4500 backs `desktop-N` (terminal 1600+N), 4501–5000 backs `agent-N` (4500+N, refused on a `terminal-N` host), 5001–7999 is the ephemeral band and 8001–9999 is where hoody-run and the Hub allocate program terminals**; the desktop and agent offsets are proxy defaults a deployment can change. Pin manual ids in 1–1600.
- `terminal_id=0` (the `terminal-0` host) only starts a new ephemeral session. A WebSocket connection naming zero without `ephemeral=true`, or in agent mode, is refused rather than attached to terminal 1, and `GET /api/v1/terminal/raw` on terminal zero answers `400 TERMINAL_ID_ZERO`: use the terminal id returned for the session and its `terminal-N` host.
- **Display pairing.** `POST /api/v1/terminal/create` builds the session's `DISPLAY` from its `display` field and ignores any `display` in the request URL, so it has no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). `POST /api/v1/terminal/execute` differs: a session it has to create is configured from the request URL, where `display=N` (or the `display_id=N` alias) sets `DISPLAY=:N` — and on a `terminal-N` host that parameter is supplied for you, so a session first created that way already renders on `:N`. `ephemeral=true` still strips it, and an already-running session keeps the `DISPLAY` it spawned with. The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` does not wait for the command to finish even with `wait=true` (session setup and display readiness can still delay the response, see the `wait=false` note below); queues until the named PID exits and is reaped by its parent (TUI-safe), for at most `defer_timeout_ms` (60000 ms default) — on expiry the command never runs (an exited but unreaped process counts as still running).
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is plain UTF-8, not base64; only the URL-form `?cmd=<base64>` is base64-decoded.** Local PTY commands normally run from staged files through a short shell line, so `stdout` holds only what the command printed. SSH commands, and eligible local commands when staging is unavailable, use typed framing; commands requiring staging fail if it is unavailable. For direct interactive input use `POST /api/v1/terminal/write`, `POST /api/v1/terminal/paste` or `POST /api/v1/terminal/press`.
- **PTY-mode `/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A `terminal_id` in the body is ignored; with no `?terminal_id` the request is `400 terminal_id parameter required`. With body `mode: "raw"` the command runs as a one-shot process with no terminal session, and `terminal_id` is ignored.
- Completion normally comes from the wrapper's completion marker: an invisible OSC 7771 sequence for staged commands, or a printable `COMMAND_COMPLETED_MARKER_{id}` echo for typed framing. The marker is removed from the result. A command is also marked completed when the session's process has died (`completion: "ended"`, `exit_code` the process's own exit status, which can be `0`; `1` when the process was already gone before the command was set up), or — on a non-ephemeral session with no explicit `timeout` — after 10 s (the default quiet timeout) without output, also while it is still waiting in the queue behind an earlier command (`completion: "output_quiet"`, `exit_code: null`: the exit status is unknown; the program may still be running, or may not have started yet; a command completed while it was still waiting untyped in the queue never runs). A `completed` result therefore does not prove the command ran or exited; check `completion` and `started` (`started: false` alone does not exclude a typed command starting later); a program that swallows the marker and never falls silent keeps `wait=true` waiting.
- **`wait=false` returns `status:"queued"` or `"running"` without waiting for completion** (NOT `"completed"`; when the session has a display configured, the response can still wait up to 10 s for display readiness, and `skip_display_wait=true` skips that check, though the request still queues behind earlier display-waiting requests on the same terminal) — the kit tracks the command through its marker and output, not the underlying PID. Re-check actual output via `GET /api/v1/terminal/raw` / `GET /api/v1/terminal/snapshot`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. Raw HTTP can send `jpg`. The SDK type lists `png | jpeg | gif`, and its runtime validation throws a `ValidationError` for any other non-null supplied value. The CLI `--format` refuses `jpg` before sending; use `jpeg` with either client.
- **`POST /api/v1/system/process/signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- `POST /api/v1/system/processes/freeze` / `POST /api/v1/system/processes/unfreeze` send SIGSTOP / SIGCONT to `{pid}` or `{name}`, never both. `name` matches the kernel `comm`, which Linux cuts to 15 characters, so a longer name matches nothing. PIDs 1 and 2 and the terminal server's own and parent PIDs are guarded: a `{pid}` naming one is refused with 403, while by `name` or through `include_descendants` a guarded PID is skipped and listed in `skipped` with error `GUARDED`, and when every match is guarded the answer is 200 with a zero count. `include_descendants: true` also signals every child process (best-effort, not atomic). A frozen process keeps its memory until `POST /api/v1/system/processes/unfreeze`.
- `POST /api/v1/terminal/mouse` takes 0-based text cells (row, col), not pixels; a cell off the screen is a 400. The program sees the event only when it has turned on terminal mouse reporting (htop, vim with `mouse=a`, tmux with `mouse on`); otherwise the call still answers 200, with `bytes_written: 0`.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id.
- `400 terminal_id above 9999 cannot start a new session (new sessions use 1-9999)` (code `INVALID_TERMINAL_ID`) when a create or execute would start a session above 9999.
- `400` config-error on `POST /api/v1/terminal/create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `409 EPHEMERAL_SESSION` on `POST /api/v1/terminal/create` — the `terminal_id` names a running ephemeral session, usually left by an `ephemeral=true` command sent to that id's own `terminal-N` host (the proxy pins it to N). That session has no `DISPLAY` and is reaped when idle, so it is not handed back as the session you asked for: `DELETE /api/v1/terminal/{terminal_id}` it and create it again, and send one-off ephemeral commands to the `terminal-0` host.
- `409 PERSISTENT_SESSION` on `POST /api/v1/terminal/execute` with `ephemeral=true` — the `terminal_id` names a running session that has a display; turning it ephemeral would strip its display and reap it, so nothing runs. Drop `ephemeral`, or send the command to the `terminal-0` host.
- `404` on `GET /api/v1/terminal/result/{command_id}` once the result is gone: its session was removed (an ephemeral session holding results goes after `ephemeral-result-timeout` of inactivity with no attached client), or the session's result buffer filled and evicted it.
- `Unknown program name "<name>"` (400) on `POST /api/v1/proxy/aliases` → the `program` is not in the platform's program catalog. For a terminal alias use `program=terminal` (not `hoody-terminal` or `terminal-N`); pick the instance with `index`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `GET /api/v1/computers/{id}` first.

Warning: Through the computers proxy, the **`terminal-N` hostname selects the terminal**: the proxy sets `terminal_id` from `N` and overwrites any value you send, so every example addresses the session's own host (`terminal-100` for session 100; `terminal-0` for ephemeral allocation). The short alias `t-<N>` (`<projectId>-<computerId>-t-<N>.<server>.computers.hoody.com`) selects the same terminal. The proxy refuses either form above 9999 (`404 SERVICE_INDEX_OUT_OF_RANGE`), so a session an older version made above 9999 cannot be reached through a kit URL.  When calling the kit directly, the HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body carries `command`, `wait`, `mode` (`pty` by default, or `raw` for a one-shot process with no terminal session), `stdin_b64` and `user` (raw mode only), `id`, `timeout`, `cwd` and `env`); in PTY mode a missing query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`; raw mode ignores `terminal_id`. Always pass `?terminal_id=N` in PTY mode. The `command` body field is **plain UTF-8**, not base64 (only the URL form `?cmd=<base64>` is base64-decoded); local PTY commands normally run from staged files through a short shell line; SSH commands, and eligible local commands when staging is unavailable, use typed framing, and commands requiring staging fail if it is unavailable. `wait=true` normally returns when the kit sees the completion marker; a non-ephemeral command with no `timeout` is also reported completed after 10 s (the default quiet timeout) without new output, also while it still waits in the queue (`completion: "output_quiet"`, `exit_code: null`; the program may still be running, and a command completed while still untyped in the queue never runs: check `completion` and `started`), and programs that swallow the marker or only background-fork can return `status:"completed"` with empty or partial stdout — re-check via `GET /api/v1/terminal/raw` if in doubt. 

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session.

**Step 1 — create the session.** Pin in `1–1600`. On the session's `terminal-N` host the proxy supplies the query `terminal_id=N`, so an HTTP body may omit `terminal_id`; if it names one, it must match N or creation answers `400 TERMINAL_ID_MISMATCH`. The examples below send matching ids.

```bash
KIT="https://${P}-${C}-terminal-100.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{"terminal_id":"100","shell":"/bin/bash","cols":120,"rows":30}'
# → { "status":"ok", "terminal_id":"100", "shell_ready":true, ... }
```

**Step 2 — execute** with body `wait: true`. The body's `command` field is **plain UTF-8** (no base64).

```bash
RESP=$(curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=100" \
  -H 'Content-Type: application/json' \
  -d '{"command":"echo HELLO; uname -a","wait":true}')
CID=$(echo "$RESP" | jq -r .command_id)
echo "command_id=$CID"
```

**Step 3 — re-fetch the result** via `GET /api/v1/terminal/result/{command_id}`, and save it promptly: a completed result can be evicted once the session's result buffer fills (100 results by default), and it is gone when the session is removed.

```bash
curl -sf "$KIT/api/v1/terminal/result/$CID" | jq '{status, exit_code, stdout: (.stdout|tostring|.[0:200])}'
```

**Step 4 — clean up.** Always delete the session you created: a session lives until it is deleted or idles out (`terminal-idle-timeout`, 300 s with no client and no running process), and an undeleted pinned id stays taken for the next caller.

```bash
curl -sX DELETE "$KIT/api/v1/terminal/100"
```

### 2. Ephemeral one-off — run a command without pinning anything

**Goal:** behave like a one-shot `exec()` — auto-allocated PTY, runs, evicts. No need to track a terminal_id.

```bash
KIT="https://${P}-${C}-terminal-0.${N}.computers.hoody.com"   # terminal-0: no pinned id, so ephemeral can allocate one
curl -sX POST "$KIT/api/v1/terminal/execute?ephemeral=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"date -u +%FT%TZ; uname -m","wait":true}' \
  | jq '{terminal_id, exit_code, stdout}'
```

Warning: Ephemeral allocates from `5001–7999` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

### 3. Automate a TUI — paste, press, wait, snapshot, find

**Goal:** drive an interactive program (here a simple shell echo, but the same recipe works for `htop`, `vim`, `fzf`, …).

**Step 1 — create the session and paste a line** (raw, not base64; bracketed-paste optional).

```bash
KIT="https://${P}-${C}-terminal-101.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":"101"}' >/dev/null
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
curl -sf "$KIT/api/v1/terminal/keys" | jq '.keys | length, .[0:8]'
```

Cleanup: `DELETE /api/v1/terminal/101` on the session's `terminal-101` host.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL on the session's `terminal-N` host, `terminal_id` in query, subprotocol `tty`. Right after the socket opens, send the initial JSON dimensions message; the server starts sending output after it. Server frames start with a type byte: ASCII `'0'` (`0x30`) marks PTY output, followed by the raw PTY bytes, ANSI escape sequences included, not a rendered screen (read that with the snapshot, as in example 3). Inject input via REST `/write` or `/press`.

```bash
KIT="https://${P}-${C}-terminal-102.${N}.computers.hoody.com"
# Make sure session exists:
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":"102"}' >/dev/null
WS=$(echo "$KIT" | sed 's|^https://|wss://|')
# Stream live: send the dimensions message first, then keep the socket open:
{ printf '%s\n' '{"columns":120,"rows":30}'; sleep 3600; } \
  | websocat --protocol tty "$WS/api/v1/terminal/ws?terminal_id=102&readonly=true" &
# Drive from another shell — output appears on the WS reader:
curl -sX POST "$KIT/api/v1/terminal/write?terminal_id=102" \
  -H 'Content-Type: application/json' -d '{"input":"echo VIA_WRITE"}'   # enter defaults to true
```

`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `DELETE /api/v1/terminal/{terminal_id}`.

### 5. Computer introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness.

```bash
KIT="https://${P}-${C}-terminal-1.${N}.computers.hoody.com"
curl -sf "$KIT/api/v1/system/resources"          | jq '{used_pct: .memory.used_percent, load: .cpu.load_1min}'
curl -sf "$KIT/api/v1/system/processes?limit=5"  | jq '.processes[] | {pid, name, cpu_percent}'
curl -sf "$KIT/api/v1/system/ports"              | jq '.[] | {port, program, user}'
curl -sf "$KIT/api/v1/system/displays"           | jq '.[] | {display, user, connected_clients}'
curl -sf "$KIT/api/v1/system/daemon"             | jq '.[] | {name, enabled}'
curl -sf "$KIT/api/v1/system/processes/1"        | jq '{pid, name, cmdline}'
```

Warning: `POST /api/v1/system/reboot` and `POST /api/v1/system/shutdown` exist on the same surface — don't call them on a shared dev computer, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. For this `POST /api/v1/terminal/create` example, pass the display as a string (`"display":"10"` in the body) so the kit exports `DISPLAY=:10`; `POST /api/v1/terminal/create` does not derive it from `terminal_id`.

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```bash
KIT="https://${P}-${C}-terminal-10.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{"terminal_id":"10","display":"10"}' >/dev/null
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=10" \
  -H 'Content-Type: application/json' \
  -d '{"command":"xeyes &","wait":true}'
```

**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```bash
curl -sf "$KIT/api/v1/system/displays" \
  | jq '.[] | select((.display | tostring) == "10") | {display, user, windows: (.windows|length)}'
DISPLAY_KIT="https://${P}-${C}-display-10.${N}.computers.hoody.com"
# ... then any display.* call against $DISPLAY_KIT
```

Cleanup: kill `xeyes` via `POST /api/v1/system/process/signal` with `{ name: 'xeyes', signal: 'SIGTERM' }` or use `DELETE /api/v1/terminal/{terminal_id}` to end the shell and its GUI programs, unless they detached with `setsid` or `nohup`. Display `:10` keeps running; end it with `POST /api/v1/system/displays/{display}/stop` when nothing else uses it.

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the computer's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```bash
KIT="https://${P}-${C}-terminal-11.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" \
  -H 'Content-Type: application/json' \
  -d '{
    "terminal_id":"11",
    "shell":"ssh",
    "ssh_host":"ssh.example.com",
    "ssh_user":"deploy",
    "ssh_port":"22",
    "ssh_password":"<ssh-password>"
  }'
# Then drive it like any other PTY (body `command` is raw UTF-8):
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=11" \
  -H 'Content-Type: application/json' -d '{"command":"hostname; whoami","wait":true}'
```

An SSH session always answers `POST /api/v1/terminal/execute` asynchronously, even with `wait: true`: read `command_id` from the response and poll `GET /api/v1/terminal/result/{command_id}`. 

To route the SSH connection through a SOCKS5 proxy, keep `ssh_host` and `ssh_user` and add `socks5_host` / `socks5_port` (plus `socks5_user` / `socks5_pass` if the proxy needs credentials); SOCKS5 fields without `ssh_host` and `ssh_user` are rejected. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with body `wait: false`** so the request does not wait for the agent to finish while it stays alive in the PTY. The `cwd` must already exist: `POST /api/v1/terminal/create` has no auto-create option and fails on a missing directory. To have the kit create it, skip `POST /api/v1/terminal/create` and let `POST /api/v1/terminal/execute` create the session, passing `cwd` and `cwd_auto_create=true` with the pinned `terminal_id`:

```bash
KIT="https://${P}-${C}-terminal-50.${N}.computers.hoody.com"
# No /create call: this request creates session 50 and its missing working directory.
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=50&shell=bash&cwd=/home/user/agent&cwd_auto_create=true" \
  -H 'Content-Type: application/json' \
  -d '{"command":"sleep 600; echo agent-stopped","wait":false}'   # placeholder for `claude`/`codex`
```

**Step 2 — reattach later** — same `terminal_id`, WS or REST, multiplayer:

```bash
WS=$(echo "$KIT" | sed 's|^https://|wss://|')
# Send the dimensions message first; websocat then relays output frames:
{ printf '%s\n' '{"columns":120,"rows":30}'; sleep 3600; } \
  | websocat --protocol tty "$WS/api/v1/terminal/ws?terminal_id=50"
# Or peek without connecting:
curl -sf "$KIT/api/v1/terminal/snapshot?terminal_id=50" | jq '.lines[-5:]'
```

Warning: Body `wait: false` returns `status:"queued"` or `"running"` without waiting for completion (NOT `"completed"`) because the kit tracks the command, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `GET /api/v1/terminal/raw` / `GET /api/v1/terminal/snapshot`. **Never** start a durable agent with `ephemeral=true`: once an ephemeral session sits inactive with no attached client, the periodic cleanup force-kills its process (after 60 s by default, or after `ephemeral-result-timeout`, 300 s by default, when it holds results).

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` has exited and been reaped by its parent. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```bash
KIT="https://${P}-${C}-terminal-60.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":"60"}' >/dev/null
# Find the parent pid however you want — here: a long-running build pid you already know.
PARENT_PID=12345
curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=60&defer_pid=$PARENT_PID" \
  -H 'Content-Type: application/json' \
  -d '{"command":"echo build-finished; ./run-tests.sh","wait":true}'
```

`defer_pid` does not wait for the command to finish even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits (its `/proc/<pid>` entry is gone: a process that has exited but whose parent has not reaped it still counts as running until `defer_timeout_ms` passes). The wait is bounded by `defer_timeout_ms` (60000 ms default): set it explicitly for longer builds, because on expiry the command is marked timed out (exit code 124) and never runs. A PID that is already gone, or a `defer_start_time_ticks` that does not match the running process, runs the command immediately; pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (body `wait: false`), capture `command_id`.**

```bash
KIT="https://${P}-${C}-terminal-70.${N}.computers.hoody.com"
curl -sX POST "$KIT/api/v1/terminal/create" -H 'Content-Type: application/json' -d '{"terminal_id":"70"}' >/dev/null
CID=$(curl -sX POST "$KIT/api/v1/terminal/execute?terminal_id=70" \
  -H 'Content-Type: application/json' \
  -d '{"command":"sleep 120","wait":false}' | jq -r .command_id)
echo "cid=$CID"
```

**Step 2 — abort** the command tracker. The default sends Ctrl+C (SIGINT) to the foreground process group, and the session's shell survives. `"force":true` in the body sends SIGKILL to the shell's process group, which kills the session's shell; the command's own group then gets the kernel's hangup, and a command that ignores hangup keeps running (find it with `GET /api/v1/system/processes` and stop it with `POST /api/v1/system/process/signal` by `pid`), so use it only when the interrupt did not stop the command.

```bash
curl -sX POST "$KIT/api/v1/terminal/execute/$CID/abort" \
  -H 'Content-Type: application/json' -d '{}'
```

**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `POST /api/v1/system/process/signal` by name. Targets every process matching the name.

```bash
curl -sX POST "$KIT/api/v1/system/process/signal" \
  -H 'Content-Type: application/json' \
  -d '{"name":"sleep","signal":"SIGTERM","force":false}'
# Response shape: {"success":true,"message":"Signal SIGTERM sent to N process(es) named 'sleep'","affected_pids":[...]}
```

Cleanup: `DELETE /api/v1/terminal/{terminal_id}`. Warning: Never call `POST /api/v1/system/shutdown` / `POST /api/v1/system/reboot` to recover from a hung command — they stop every process in the computer and wipe in-memory state.

## Reference

### `commands` (4) — Commands run in terminal sessions

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/terminal/execute/{command_id}/abort` | Abort a running command | `body` |
| `GET /api/v1/terminal/result/{command_id}` | Get command result |  |
| `GET /api/v1/terminal/history/{terminal_id}` | Get terminal command history |  |
| `POST /api/v1/terminal/execute` | Execute command in terminal session | `?terminal_id` `?ephemeral` `?defer_pid` `?defer_start_time_ticks` `?defer_timeout_ms` `?defer_poll_ms` `?reset` `?cwd` `?cwd_auto_create` `?shell` `?user` `?cmd` `?env` `?skip_display_wait` `?display_wait_timeout` `?display` `?ssh_host` `?ssh_user` `?ssh_port` `?ssh_password` `?socks5_host` `?socks5_port` `?socks5_user` `?ssh_key` `?socks5_pass` `body*` |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric; a new session needs 1-9999, an existing one up to 65535). Required unless ephemeral=true, in which case it is auto-generated if not provided. On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and OVERWRITES any value you send (a ?terminal_id=0 query sentinel never survives the proxy). Use the terminal-0 hostname as the "no terminal ID" sentinel so ephemeral=true can auto-generate; supply this parameter directly only when calling the terminal service without the proxy
- `ephemeral` — When true, auto-generates a unique terminal_id (if not provided), skips display/dbus initialization, and applies aggressive cleanup. Designed for programmatic CLI command execution like a scripted command runner (default: false). WARNING: Do NOT use ephemeral=true for GUI applications that require a display. Ephemeral sessions strip the DISPLAY environment variable, which means X11/GUI applications will not work. Use a regular terminal session with an explicit terminal_id and display parameter instead for GUI workloads. A terminal_id that names a running terminal with a display is refused with 409 PERSISTENT_SESSION rather than turned ephemeral; on a terminal-N host the proxy sets terminal_id=N, so send ephemeral commands to the terminal-0 host
- `defer_pid` — Defer command injection until this PID exits (TUI-safe). With defer_pid the response does not wait for completion even when wait=true (session setup and display readiness can still delay it)
- `defer_start_time_ticks` — Optional /proc/<pid>/stat field 22 (starttime in clock ticks since boot) to avoid PID reuse bugs. If it mismatches, command executes immediately
- `defer_timeout_ms` — Max time to wait for defer_pid exit before failing (default: 60000)
- `defer_poll_ms` — Poll interval while waiting for defer_pid exit (default: 50, minimum: 10)
- `reset` — Reset existing session and reconfigure (kills current process, clears state, allows switching from bash to SSH or changing any parameter) - Use 'true', '1', or no value
- `cwd` — Working directory for local bash sessions (ignored for SSH). In raw mode: the command's working directory, when the body has no cwd
- `cwd_auto_create` — Auto-create cwd when the requested working directory does not exist yet. Applies when cwd is explicitly provided for a new or reset local session, and to a command run with mode raw. Enable with 'true', '1', or no value (default: false)
- `shell` — Shell to use for local sessions: bash (case-insensitive), zsh, fish, sh, etc. (default: server startup command, only applies to new sessions or after reset)
- `user` — System user to spawn shell as (requires su permissions, only applies to new sessions or after reset). In raw mode: the user the command runs as, when the body has no user
- `cmd` — Base64-encoded command to execute automatically on spawn (executes once when the shell starts; ignored on an active session unless reset is true)
- `env` — Environment variable in KEY=VALUE format (can be repeated for multiple variables, e.g., ?env=DEBUG=1&env=API_KEY=abc)
- `skip_display_wait` — Skip waiting for Hoody Display readiness before executing command. By default, if a DISPLAY is configured, the request waits until the session's display server is ready, unless no X server holds the display and none can be started, or a wait for it already timed out on the same shell within the last 30 seconds. Commands of one terminal still run in arrival order, so a request with skip_display_wait=true runs after earlier ones still waiting (default: false)
- `display_wait_timeout` — Timeout in seconds for display readiness wait, counted from the request (default: 10, capped at 10 seconds; values <=0 or malformed also map to the 10-second cap). When it elapses the command runs anyway. Ignored if skip_display_wait=true
- `display` — DISPLAY environment variable for X11 applications (auto-formats :display if number provided, e.g., ?display=1 becomes DISPLAY=:1)
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

- `POST /api/v1/terminal/execute/{command_id}/abort` body — `{ force: bool }` — Abort parameters
  - `force` — Send SIGKILL to process group instead of SIGINT (default: false)
- `POST /api/v1/terminal/execute` body — `{ command*: string, mode: "pty" | "raw", stdin_b64: string, user: string, id: string, timeout: number, wait: bool, cwd: string, require_staged: bool, track: bool, incarnation: string, track_label: string, env: object }` — Command execution parameters
  - _(13 fields carry longer docs — see the spec shipped as `hoody-sdk/openapi.json` for full field semantics)_

### `drops` (4) — Terminal Drag-and-Drop

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/terminal/drop-begin` | Begin a drag-and-drop staging transaction | `?terminal_id` |
| `POST /api/v1/terminal/drop-commit` | Finalize a drop and inject the OSC frame | `?terminal_id` `?drop*` `?token*` `body*` |
| `POST /api/v1/terminal/drop` | One-shot drop (begin + stage + commit) | `?terminal_id` `body*` |
| `POST /api/v1/terminal/upload` | Upload a raw file slice into a drop | `?terminal_id` `?drop*` `?token*` `?path*` `?offset*` `body*:application/octet-stream` |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric 1-65535). On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy.
- `drop` — Drop id from /drop-begin
- `token` — Drop token from /drop-begin
- `path` — Relative path of the staged file: not empty, shorter than 1024 bytes, each component at most 255 bytes; absolute paths, `.` or `..` components, backslashes, control characters and DEL are refused with 400 DROP_INVALID_PATH
- `offset` — Byte offset to write at (must equal the current staged size)

**Body shapes:**

- `POST /api/v1/terminal/drop-commit` body — `{ ctx*: "drop" | "paste", r: int, c: int, cr: string, items*: { p*: string, d*: 0 | 1, s*: int, name: string, h: string }[] }` — Manifest draft
  - `ctx` — Drop context: `drop` for a drag-and-drop, `paste` for a clipboard paste
  - `r` — Drop cell row (Chat grid pane mapping). Used only together with `c`
  - `c` — Drop cell column. Used only together with `r`
  - `cr` — Clip-read correlation nonce ([A-Za-z0-9_-]{1,64}); echoed verbatim as the injected frame's cr field so the TUI can match a clipboard-read landing. Invalid/oversized values are ignored.
  - `items` — Manifest draft: one entry per staged file or empty directory
- `POST /api/v1/terminal/drop` body — `{ ctx*: "drop" | "paste", r: int, c: int, items*: { name*: string, b64: string, dir: bool, items: object[] }[] }` — One-shot drop payload
  - `r` — Drop cell row. Used only together with `c`
  - `items` — Files and directories to stage

### `keys` (1) — Key names the terminal accepts

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/keys` | List supported key names for /press endpoint |  |

### `kit` (3) — Agent-facing automation primitives: screen snapshot, regex find, named key presses, text paste, and async wait conditions backed by a server-side terminal emulator

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/automation/metrics` | Get terminal automation metrics |  |
| `GET /api/v1/terminal/capabilities` | Get the terminal service's features |  |
| `GET /api/v1/terminal/health` | Service health check |  |

### `processes` (5) — System process introspection and signalling

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/system/processes/{pid}` | Get process details by PID |  |
| `GET /api/v1/system/processes` | List all system processes | `?sort` `?limit` `?filter` |
| `POST /api/v1/system/processes/freeze` | Freeze (SIGSTOP) a process or process tree | `body*` |
| `POST /api/v1/system/processes/unfreeze` | Unfreeze (SIGCONT) a process or process tree | `body*` |
| `POST /api/v1/system/process/signal` | Send signal to process(es) | `body*` |

**Param notes:**

- `sort` — Sort by field: cpu, memory, pid, name (default: pid)
- `limit` — Maximum number of processes to return (default: 1000)
- `filter` — Keep processes whose name or command line contains this text (case-sensitive)

**Body shapes:**

- `POST /api/v1/system/processes/freeze` body — `{ pid: int, name: string, include_descendants: bool }` — Target selector and options
  - `pid` — Process ID to freeze (mutually exclusive with name). PIDs 1 (init), 2 (kthreadd), the server's own PID, and the server's parent PID are guarded (freezing them would wedge the host or the daemon) and are rejected with 403.
  - `name` — Process name (case-insensitive `comm` match that freezes EVERY matching process; mutually exclusive with pid). NOTE: Linux truncates `comm` to TASK_COMM_LEN-1 = 15 chars; a name longer than 15 characters silently matches nothing.
  - `include_descendants` — When true, also freezes every descendant via a one-shot /proc PPID snapshot (bounded at 65535 PIDs). Default false. The parent is signalled before descendants to shrink the fork/escape race window, but the operation is best-effort, not atomic. …
- `POST /api/v1/system/processes/unfreeze` body — `{ pid: int, name: string, include_descendants: bool }` — Target selector and options
  - `pid` — Process ID to unfreeze (mutually exclusive with name). The guarded-PID set (1, 2, self, parent) is the same as for freeze; calling unfreeze on a guarded PID returns 403.
  - `name` — Process name (case-insensitive comm match; mutually exclusive with pid). NOTE: Linux truncates `comm` to 15 chars; longer names silently match nothing.
  - `include_descendants` — Also unfreeze all descendants via /proc PPID snapshot (bounded at 65535 PIDs). Default false. By-name dedupes overlapping subtrees.
- `POST /api/v1/system/process/signal` body — `{ pid: int, name: string, signal: string | int, force: bool }` — Signal parameters
  - `pid` — Process ID to signal (mutually exclusive with name)
  - `name` — Process name to signal - signals ALL matching processes (mutually exclusive with pid)
  - `signal` — Signal to send. String form accepts `SIGTERM`, `TERM`, `15`, etc. (with or without `SIG` prefix). Integer form accepts any value in `[0, NSIG)` including realtime signals `SIGRTMIN`..`SIGRTMAX` (typically 34..64 on Linux), which have no portable string names.
  - `force` — true sends SIGKILL and overrides signal; false or omitted leaves signal in effect (SIGTERM when signal is omitted too)

### `sessions` (15) — Terminal session I/O and lifecycle

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/screenshot` | Capture terminal screenshot | `?terminal_id` `?format` `?foreground` `?background` `?fontsize` `?save` |
| `GET /api/v1/terminal/ws` | WebSocket terminal connection | `?terminal_id` `?readonly` `?cwd` `?cwd_auto_create` `?shell` `?user` `?cmd` `?env` `?display` `?pid` `?ssh_host` `?ssh_user` `?ssh_port` `?ssh_password` `?socks5_host` `?socks5_port` `?socks5_user` `?socks5_pass` `?ssh_key` `?display_id` `?ephemeral` `?reset` `?startup_script` `?env_inject` `?desktop` `?desktop_env` `?debug` `?welcome` `?agent` `?onboarding` `?arg` |
| `POST /api/v1/terminal/create` | Create a terminal session | `?terminal_id` `body*` |
| `DELETE /api/v1/terminal/{terminal_id}` | Delete a terminal session | `?incarnation` |
| `GET /api/v1/terminal/{terminal_id}/automation` | Get per-session automation state |  |
| `GET /api/v1/terminal/snapshot` | Get rendered terminal snapshot | `?terminal_id` `?include_colors` `?include_highlights` `?scroll_offset` |
| `GET /api/v1/terminal/sessions` | List all terminal sessions | `?history_limit` `?history_lines` |
| `POST /api/v1/terminal/paste` | Paste text into terminal | `?terminal_id` `body*` |
| `POST /api/v1/terminal/press` | Send named key presses to terminal | `?terminal_id` `body*` |
| `GET /api/v1/terminal/raw` | Get raw terminal output | `?terminal_id` `?format` `?tail` |
| `POST /api/v1/terminal/state` | Client render/connection diagnostics beacon | `body` |
| `GET /api/v1/terminal/find` | Search terminal screen with regex | `?terminal_id` `?pattern*` `?scope` `?limit` `?case_insensitive` `?scroll_offset` |
| `POST /api/v1/terminal/mouse` | Send cell-based mouse events to terminal | `?terminal_id` `body*` |
| `POST /api/v1/terminal/wait` | Wait for terminal condition | `?terminal_id` `body*` |
| `POST /api/v1/terminal/write` | Write input to terminal | `?terminal_id` `body` |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric 1-65535). On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. _(on `GET /api/v1/terminal/screenshot`, `GET /api/v1/terminal/snapshot`)_
- `format` — Output format: png, jpeg, gif (default: png) _(on `GET /api/v1/terminal/screenshot`)_
- `foreground` — Foreground color: black, red, green, yellow, blue, magenta, cyan, white, or RGB (R,G,B,A) (default: white)
- `background` — Background color: same as foreground options (default: black)
- `fontsize` — Font size in pixels (default: 20)
- `save` — Save to storage directory (default: true)
- `terminal_id` — Terminal session ID (numeric 1-65535; an id with no session yet must be 1-9999, a higher one is refused). Omitted, the connection joins the shared terminal "1" that every client without a terminal_id uses; with ephemeral=true it instead gets a fresh ID in 5001-7999, reported in the SET_TERMINAL_ID frame. A value that is present but malformed is refused, never mapped to "1". 0 (the terminal-0 host) only starts a fresh ephemeral session: without ephemeral=true (or in agent mode) the connection is refused, never mapped to "1". Multiple clients can share by using the same ID. On connections routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. _(on `GET /api/v1/terminal/ws`)_
- `readonly` — Enable read-only mode for this client (blocks keyboard input) - Use 'true', '1', or no value
- `cwd` — Working directory for new sessions
- `cwd_auto_create` — Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new local session. Enable with 'true', '1', or no value (default: false)
- `shell` — Shell to use (bash, zsh, fish, tmux, ssh, etc.)
- `user` — System user to spawn shell as (requires permissions)
- `cmd` — Base64-encoded command (ignored on a server without -W, by agent sessions and by daemon-program terminals). With no shell running yet it becomes the session's initial command, run once when the shell starts (the first connection that sets it wins); on a shell that already runs it is typed into that shell on every connection that carries it, except from a readonly client, whose cmd is then ignored
- `env` — Environment variable KEY=VALUE (repeatable)
- `display` — DISPLAY variable for X11 apps (auto-formats :N)
- `pid` — Attach to existing process PID for monitoring
- `ssh_host` — SSH server hostname/IP for remote connections
- `ssh_user` — SSH username (required if ssh_host provided)
- `ssh_port` — SSH port (default: 22)
- `ssh_password` — SSH password (use with caution)
- `socks5_host` — SOCKS5 proxy for SSH
- `socks5_port` — SOCKS5 port (default: 1080)
- `socks5_user` — SOCKS5 proxy username (alphanumeric with _-. characters)
- `socks5_pass` — SOCKS5 proxy password (shell-dangerous characters are refused)
- `ssh_key` — Base64-encoded SSH private key for key authentication (alternative to ssh_password)
- `display_id` — Alias of display; when both are sent, display wins
- `ephemeral` — Throwaway session: without a terminal_id a fresh ID in 5001-7999 is allocated instead of joining shared terminal "1"; the display environment is not inherited, a cmd= command exits the shell when it finishes, and the idle session is cleaned up. Accepts true, 1 or yes (default: false). Ignored with agent=true
- `reset` — Tear down the session's running process (or SSH / PID attachment) and start a fresh one before this client joins. Accepts true, 1 or a bare flag (default: false)
- `startup_script` — Absolute path of a script to run before the shell starts; relative paths and paths containing ".." are ignored. Ignored with agent=true
- `env_inject` — Inject the HOODY_* environment variables into the spawned shell (default: true; only false or 0 disables it)
- `desktop` — Enable Hoody Display desktop mode: the viewer shows the whole display as one screen instead of each window on its own. It starts no window manager and no desktop environment; set `desktop_env` (xfce, mate, vm) for one with a window manager (default: false). Ignored with agent=true
- `desktop_env` — Desktop environment for desktop mode; implies desktop=true. `vm` is for a hoody-vm display: openbox with hoody-vm's configuration, which binds no keys or mouse buttons so every key and click reaches the VM, and keeps QEMU's window undecorated and maximised. Other values are ignored. Not started again when a window manager already runs on the display; it keeps running after the session is deleted (POST /api/v1/system/displays/{display}/stop ends it)
- `debug` — Sets TTYD_DEBUG=true in the shell environment (default: false)
- `welcome` — Show the Hoody welcome banner when the shell starts. Default: true on a connection through a terminal-N edge proxy hostname (the proxy adds welcome=true when you do not send it), false when calling the terminal service directly. Send welcome=false to turn it off
- `agent` — Launch the server-configured Hoody Agent TUI instead of a shell. A locked-down mode: shell, cmd, user, ssh_*, pid, startup_script, desktop and ephemeral are ignored (default: false)
- `onboarding` — With agent=true, start the agent's first-run onboarding (default: false)
- `arg` — Command-line argument for the shell, repeatable and kept in order. Accepted only when URL arguments are enabled on this server; ignored otherwise
- `terminal_id` — Terminal session ID. On a terminal-N edge proxy hostname the proxy sets it to N; a different terminal_id in the body is refused with 400 TERMINAL_ID_MISMATCH. Terminal 0 (the terminal-0 hostname) only starts an ephemeral session with a generated id. _(on `POST /api/v1/terminal/create`)_
- `incarnation` — Delete only while the session's shell has this incarnation (32 lowercase hex characters); otherwise 409 INCARNATION_MISMATCH and nothing is deleted. Pending tracked workloads of that incarnation are closed without starting; running ones keep running and stay readable and signallable
- `include_colors` — Include ANSI SGR colored_lines array alongside plain text lines. Default: false
- `include_highlights` — Include reverse-video highlight spans. Default: true
- `scroll_offset` — Lines into scrollback (0 = live viewport). Default: 0 _(on `GET /api/v1/terminal/snapshot`)_
- `history_limit` — Max command_history entries to include per session (default: 50, max: 1000)
- `history_lines` — Alias of history_limit
- `terminal_id` — Terminal session ID. On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy _(on `POST /api/v1/terminal/paste`, `POST /api/v1/terminal/press`, `GET /api/v1/terminal/find` +2 more)_
- `terminal_id` — Terminal session ID (numeric 1-65535, defaults to "1" if not provided). On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. 0 (the terminal-0 host) names no terminal to read and is refused with 400 TERMINAL_ID_ZERO. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. _(on `GET /api/v1/terminal/raw`)_
- `format` — Output format: download, text, or html (defaults to "download" if not provided) _(on `GET /api/v1/terminal/raw`)_
- `tail` — Return only the last N lines of output
- `pattern` — PCRE2 regex pattern to search for (max 1024 bytes)
- `scope` — Search scope: screen (default), scrollback, or all
- `limit` — Maximum number of hits to return, from 1 to 1000 (default 100). A value outside that range is refused with 400
- `case_insensitive` — Case-insensitive matching. Default: false
- `scroll_offset` — Scrollback offset for screen scope (0 = live viewport), from 0 to 2147483647. A value outside that range is refused with 400. Default: 0 _(on `GET /api/v1/terminal/find`)_
- `terminal_id` — Terminal session ID to write to. On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy _(on `POST /api/v1/terminal/write`)_

**Body shapes:**

- `POST /api/v1/terminal/create` body — `{ terminal_id: string, exclusive: bool, ephemeral: bool, display: string, shell: string, user: string, cwd: string, startup_script: string, welcome: bool, debug: bool, desktop: bool, desktop_env: string, cols: int, rows: int, wait_until_display: bool, wait_timeout: int, ssh_host: string, ssh_user: string, ssh_port: string, ssh_password: string, ssh_key: string, socks5_host: string, socks5_port: string, socks5_user: string, socks5_pass: string }`
  - `terminal_id` — Terminal session ID (numeric; a new session needs 1-9999, an existing one up to 65535). Required unless ephemeral is true, in which case it is auto-generated (range 5001-7999), or unless the query carries terminal_id: on a terminal-N host it is N, and a body terminal_id that differs from it is refused with 400 TERMINAL_ID_MISMATCH. …
  - `exclusive` — Only create a new session: when the terminal id already has a session (running or not) or belongs to a daemon program, answer 409 SESSION_EXISTS and change nothing (default: false)
  - `ephemeral` — Enable ephemeral session mode. A terminal id in 5001-7999 is generated when the body gives none and the query gives none or gives terminal_id=0. Ephemeral sessions are cleaned up after an idle timeout and have DISPLAY removed. (default: false)
  - `display` — X11 display number (e.g., "1" or ":1"). Sets the DISPLAY env var and enables Hoody Display readiness waiting. The display is started if it is not running and reused if it is; it keeps running after the session is deleted (stop it with POST /api/v1/system/displays/{display}/stop).
  - `shell` — Shell to use (bash/zsh/fish/sh). Ignored for SSH sessions.
  - `user` — System user to spawn the shell as. Ignored for SSH sessions.
  - `cwd` — Working directory for the terminal. Ignored for SSH sessions.
  - `startup_script` — Path to startup script to run
  - `welcome` — Show welcome message on startup (default: false)
  - `debug` — Enable debug output in wrapper script (default: false)
  - `desktop` — Enable Hoody Display desktop mode: the viewer shows the whole display as one screen instead of each window on its own. It starts no window manager and no desktop environment; set `desktop_env` (xfce, mate, vm) for one with a window manager (default: false)
  - `desktop_env` — Desktop environment to launch (implies desktop=true). Valid values: xfce, mate, vm; `vm` is for a hoody-vm display: openbox with hoody-vm's configuration, which binds no keys or mouse buttons so every key and click reaches the VM, and keeps QEMU's window undecorated and maximised. …
  - `cols` — Terminal columns (default: 80)
  - `rows` — Terminal rows (default: 24)
  - `wait_until_display` — … No wait when no display server holds the display and none can be started on this box: the session is created, the answer comes at once with display_ready false, and its message says the display cannot be started here
  - `wait_timeout` — Timeout in seconds for waiting (default: 300, capped at 300). When it elapses the answer is status error, code timeout; the session itself keeps running
  - `ssh_host` — SSH hostname/IP. Required together with ssh_user for SSH sessions.
  - `ssh_user` — SSH username. Required together with ssh_host for SSH sessions.
  - `ssh_password` — SSH password. Cannot contain shell-dangerous characters.
  - `ssh_key` — Base64-encoded SSH private key (PEM format)
  - `socks5_host` — SOCKS5 proxy hostname/IP for routing SSH connections
  - `socks5_port` — SOCKS5 proxy port (default: 1080)
  - `socks5_user` — SOCKS5 proxy authentication username
  - `socks5_pass` — SOCKS5 proxy authentication password
- `POST /api/v1/terminal/paste` body — `{ text*: string, bracketed: bool }` — Paste text specification
  - `text` — Text to paste (UTF-8, not empty: an empty string is refused with 400)
  - `bracketed` — Use bracketed paste mode if the program supports it. Default: true
- `POST /api/v1/terminal/press` body — `{ keys: string[], key: string }` — Key press specification (exactly one of `keys` or `key` required)
  - `keys` — Array of 1 to 256 key names to press in sequence (e.g. ["ctrl+c", "arrow_up", "enter"]). Mutually exclusive with `key`. An empty array is refused with 400.
  - `key` — Single key name for one-shot press (e.g. "enter"). Mutually exclusive with `keys`
- `POST /api/v1/terminal/state` body — `{ build_id: string, renderer: string, reason: string }` — Small client-state envelope (renderer, WebGL
  - `build_id` — Frontend build identifier
  - `renderer` — Effective renderer (webgl|dom)
  - `reason` — What triggered this beacon
- `POST /api/v1/terminal/mouse` body — `{ event: terminal_TerminalMouseEvent, events: terminal_TerminalMouseEvent[] } (exactly one of: event | events required)` — Mouse event specification
- `POST /api/v1/terminal/wait` body — `{ mode: string, debounce_ms: int, pattern: string, timeout_ms: int, search_scope: string, include_colors: bool, include_highlights: bool, after_seq: int, fresh: bool }` — Wait condition specification
  - `mode` — Wait mode: stable, regex, or either. Default: stable
  - `debounce_ms` — Stable mode debounce in milliseconds (10-60000). Default: 100
  - `pattern` — PCRE2 regex pattern (required for regex/either modes, max 1024 bytes)
  - `timeout_ms` — Hard deadline in milliseconds (10-300000). Default: 5000
  - `search_scope` — Where to search: screen, scrollback, or all. Default: screen
  - `include_colors` — Include colored_lines in response snapshot. Default: false
  - `include_highlights` — Include highlights in response snapshot. Default: true
  - `after_seq` — Regex and either modes: only rows changed after this seq can match, so a prompt already on screen is ignored unless its row changes (typing on it does); anchor the pattern (`>>> $`). … A non-negative integer no larger than the terminal's current seq. …
  - `fresh` — Regex and either modes: true ignores every match already on screen when the wait starts (the same as `after_seq` set to the current seq). A prompt a fast command drew before the wait arrived counts as old, so to wait for the prompt after a command take `seq` before sending it and use `after_seq`. …
- `POST /api/v1/terminal/write` body — `{ input*: string, enter: bool }` — JSON object with input and optional enter flag
  - `input` — The text to type into the terminal
  - `enter` — Auto-append Enter (newline) after input. Default: true. Set to false for raw keystroke input

### `system` (7) — OS-level operations

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/system/resources` | Get system resources and statistics |  |
| `GET /api/v1/system/daemon` | Get daemon programs configuration |  |
| `GET /api/v1/system/displays` | Get display information |  |
| `GET /api/v1/system/ports` | List all listening network ports | `?protocol` `?user` `?port` `?ip` `?skip_program` `?http_only` `?hoody_only` |
| `POST /api/v1/system/reboot` | Reboot the system | `?delay` |
| `POST /api/v1/system/shutdown` | Shutdown the system | `?delay` |
| `POST /api/v1/system/displays/{display}/stop` | Stop a display |  |

**Param notes:**

- `protocol` — Filter by protocol: `tcp` or `udp` (one value; omit it for both)
- `user` — Filter by user (exact match)
- `port` — Filter by specific port number
- `ip` — Filter by IP address (comma-separated list)
- `skip_program` — Exclude specific programs (comma-separated list)
- `http_only` — Only return HTTP services
- `hoody_only` — Only return Hoody Kit services
- `delay` — Delay in seconds before reboot, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. _(on `POST /api/v1/system/reboot`)_
- `delay` — Delay in seconds before shutdown, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. _(on `POST /api/v1/system/shutdown`)_
- `display` — Display number (the N in :N), 0-65535

### `workloads` (2) — APIs for executing commands in terminal sessions and retrieving their results

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/terminal/workloads` | List tracked workloads | `?terminal_id` `?incarnation` `?command_id` |
| `POST /api/v1/terminal/workloads/{command_id}/signal` | Signal a tracked workload | `?terminal_id` `body*` |

**Param notes:**

- `terminal_id` — Terminal session ID (numeric 1-65535). On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy.
- `incarnation` — Only workloads of this shell incarnation (32 lowercase hex characters)
- `command_id` — Only the workload with this command id (numeric 1-65535) _(on `GET /api/v1/terminal/workloads`)_
- `command_id` — The workload's command id (numeric 1-65535) _(on `POST /api/v1/terminal/workloads/{command_id}/signal`)_

**Body shapes:**

- `POST /api/v1/terminal/workloads/{command_id}/signal` body — `{ incarnation*: string, signal*: "INT" | "TERM" | "KILL" }` — The workload's incarnation and the signal
  - `incarnation` — The shell incarnation the workload was admitted on
  - `signal` — The signal to send


### Body schemas

- `terminal_TerminalMouseEvent` — `{ type*: "move" | "down" | "up" | "click" | "scroll", row*: int, col*: int, button: int, amount: int, direction: "up" | "down", modifiers: ("shift" | "alt" | "meta" | "ctrl" | "control")[] }`
