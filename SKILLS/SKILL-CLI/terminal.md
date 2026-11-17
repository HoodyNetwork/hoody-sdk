> _**CLI skill · `terminal` namespace** · ~11,520 tokens · hoody-sdk v1.0.1_

# `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket

## Purpose

Real PTY per computer, numeric `terminal_id` (a new session needs 1–9999; ids up to 65535 only reach sessions an older version made). REST + WebSocket. Multiplayer; sessions persist.

## When to use

- **Interactive TUIs** that paint the screen (Claude Code, Codex, vim, htop, less, fzf, ssh, etc.) — these need a real PTY; only `terminal` provides one.
- **Durable / long-lived programs that you may need to interact with later** (the agent you spawned, a coding assistant, a chat REPL) — pin a stable `terminal_id` (1–1600) and reattach over WS or REST. When it must be supervised (restarted on exit, started at boot), run it as a `daemon` program with `terminal_id` instead: its terminal is attached the same way (see "Daemon program terminals" below).
- Sequenced commands sharing shell state, keystroke automation, screen capture, regex-search the rendered buffer.
- SSH / SOCKS5 sessions (`ssh_*` / `socks5_*`).
- Host introspection (`hoody terminal system *`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process. A session made by `hoody terminal sessions create` renders on a display only when given a `display` (a string such as `"10"`; the id never sets it); a session first created by `hoody terminal commands run` takes its display from the request URL instead (see Quirks). Keeping ids distinct keeps each terminal-to-display pairing one-to-one. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `5001–7999` when no `terminal_id` is given (a pinned id converts that terminal, see recipe 2), and once one sits inactive with no attached WebSocket client it is removed and its process force-killed by the periodic cleanup: after 60 s of inactivity by default when it holds no results, otherwise after `ephemeral-result-timeout` (300 s default). Your Claude Code / Codex session would die at that point.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- A script that should be callable over HTTP → `exec`. (A one-off shell command fits `terminal` itself: ephemeral, workflow 2. When its logs must outlive the response, use `hoody daemon ephemeralprograms start`.)
- File I/O → `files`. GUI rendering → `display`. Schedule → `cron`.

## Prerequisites

- Computer with `terminal` kit running; capability URL.
- SSH needs reachable `ssh_host:ssh_port`; automation needs existing `terminal_id`.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Persistent interactive session

`hoody terminal sessions create` (pin `terminal_id` in 1–1600 and keep `ephemeral: false`: an ephemeral session's process is killed once idle with no client attached) → `hoody terminal commands run` (body `wait` defaults to `true` and asks for a synchronous result, but SSH sessions, `defer_pid` commands and a server at its concurrent-wait cap answer asynchronously — check `status` and poll `hoody terminal commands get` by `command_id`; send body `wait: false` for an async `command_id`; shares shell state) → `hoody terminal commands get` → `hoody terminal sessions read`/`hoody terminal sessions screenshots capture` → `hoody terminal sessions delete`. Use `hoody --computer "$C" terminal commands run --terminal-id 100 --command 'make test' --no-wait -o json` to start asynchronously and keep the returned `command_id` (here in `$COMMAND_ID`). Read it with `hoody --computer "$C" terminal commands get "$COMMAND_ID" --terminal-id 100`: a command belongs to its terminal, and without `--terminal-id` the CLI asks terminal 1, which answers 404 for a command of another terminal.

### 2. Ephemeral one-off execute

`hoody terminal commands run` `ephemeral=true`, `wait=true` — auto ID 5001–7999, runs `command`, cleans up. Through the proxy, send it to the `terminal-0` hostname: any other `terminal-N` host pins the request to terminal N: the command runs inside that terminal, which becomes an ephemeral session (a terminal N with a display, one a client has attached to, or an agent session is refused with `409` instead), and every later execute on that host queues behind it. Each execute's timeout (600 s by default on an ephemeral session) starts when the command is submitted for execution, after any `defer_pid` wait, and runs while it waits in the queue, so behind a command that hangs until its timeout, later ones can time out without ever running. Later: `hoody terminal commands get` before the session goes: an ephemeral session holding results is removed after `ephemeral-result-timeout` (300 s default) of inactivity with no attached client. Read it with `hoody --computer "$C" terminal commands get "$COMMAND_ID" --terminal-id 0` (`$COMMAND_ID` holds the returned `command_id`); without `--terminal-id` the CLI asks terminal 1 and gets 404 for it.

### 3. Automate a TUI

`hoody terminal sessions create` (or `hoody terminal commands run` to launch) → `hoody terminal sessions keys press` (`Down`/`Enter`/`F2`; `hoody terminal keys list`) → `hoody terminal sessions paste` (`bracketed=true`) → `hoody terminal sessions wait` (`mode`: `stable`, `regex` with a `pattern`, or `either`) → `hoody terminal sessions snapshot get`/`hoody terminal sessions search`.

### 4. Live stream — WebSocket

The terminal WebSocket at `/api/v1/terminal/ws?terminal_id=…` on the session's `terminal-N` host. After the socket opens, the client must send the initial JSON dimensions message (`{"columns":…,"rows":…}`) before the server sends output. Multiple WS clients attach simultaneously; writes broadcast to PTY. The CLI has no command for this stream: attach an interactive PTY with `hoody shell --terminal-id N`. Inject from REST via `hoody terminal sessions write` or `hoody terminal sessions keys press`. `hoody terminal commands cancel` interrupts by `command_id`.

### 5. Computer introspection

`hoody terminal processes list`, `hoody terminal processes get`, `hoody terminal processes signal`, `hoody terminal system ports list`, `hoody terminal system stats`, `hoody terminal system displays list`, `hoody terminal system daemonprograms list`, `hoody terminal system reboot`/`hoody terminal system shutdown`. `hoody terminal processes list` and `hoody terminal system ports list` answer in a single response with no pages (`hoody terminal processes list` takes `limit`, `sort` and `filter`). Add `-o json` to get the full response bodies.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–1600; **never** 1601–5000, which backs `desktop-N` and `agent-N` with the default bands, the ephemeral range 5001–7999 or the 8001–9999 program-terminal band; **never** re-use one another program is on).
2. `hoody terminal sessions create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/home/user'` (or wherever).
3. `hoody terminal commands run` with body `command: 'claude'` (or `codex`, `aider`, `gemini …`) and body `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request. In the CLI: `hoody --computer "$C" terminal commands run --terminal-id 100 --command claude --no-wait -o json`.
4. Reattach any time: `hoody --computer "$C" shell --terminal-id 100` for an interactive attach (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or drive it with `hoody terminal sessions keys press` / `paste`.
5. Tear down only when really done: `hoody terminal sessions delete <terminal-id>`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a computer reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `21`, Codex on `22`; avoid `1`, the shared terminal that `hoody shell`, the `terminal-1` URL and every client that names no terminal attach to). If a session needs a display, pass `display` explicitly on `hoody terminal sessions create` (a string, for example `"10"`); distinct ids keep that pairing one-to-one.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. When creating the session with `hoody terminal sessions create`, pass the matching `display` explicitly; it does not derive it from `terminal_id`. A session first created by `hoody terminal commands run` on a `terminal-N` host gets `DISPLAY=:N` from the URL instead; see Quirks.

1. `hoody terminal sessions create` with a pinned `terminal_id` (e.g. `10`) AND a matching `display: "10"` field (string in the SDK type), so the kit exports `DISPLAY=:10` into the PTY.
2. From that session: `hoody terminal commands run` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-10`.
3. Open the matching display kit URL — `https://{projectId}-{computerId}-display-10.{node}.computers.hoody.com` (read `project_id`, `id` and `server_name` from `hoody computers get` for `{projectId}`, `{computerId}` and `{node}`).
4. Drive the GUI via the `display` namespace, passing `--display-id 10` to every `hoody display` command (without it the CLI addresses display 1, whatever the URL in step 3 says):
   - `hoody display screenshots capture` — see what's on screen (turn `base64` on for vision agents).
   - `hoody display input click --x <x> --y <y> --button <button>` — left/right click; `hoody display input type --x <x> --y <y> --text <text>` — click at a point, then type.
   - `hoody display windows search --pattern <pattern> [--name] [--class]` (a `pattern` plus booleans that pick the fields to match) → `hoody display windows focus` / `hoody display windows geometry get` / `hoody display windows active get` to focus + locate.
   - `hoody display input batch act` — bulk input replay; `hoody display input wait` between actions.
5. Tear down: kill the GUI program with `hoody terminal processes signal`, or use `hoody terminal sessions delete` to end the shell and GUI programs it started, unless they detached with `setsid` or `nohup`. The display itself keeps running after the session is deleted; end it with `hoody terminal system displays stop <display>` when nothing else uses it.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=10`↔`display:":10"`, `terminal_id=11`↔`display:":11"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, open the `desktop-<N>` alias directly (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-CLI.md`). It auto-spawns the DE on a separate display of its own (not display `<N>`), so apps started by the steps above do not appear on it; this recipe is for spawning **specific** apps under your own control.

### 8. Daemon program terminals

A daemon program configured with `terminal_id: N` runs on terminal N's PTY, and terminal N belongs to it while the program is configured. Nothing spawns there: shell, cwd, user, env, display, `cmd` and `pid` parameters on that id are ignored.

1. Attach: `hoody --computer "$C" daemon programs terminal connect "$PROGRAM"`, where `$PROGRAM` holds the program's id or exact name (add `--name` when the name is only digits; Ctrl-] detaches and leaves the program running; `--read-only` watches only; `hoody shell --terminal-id N` also reaches the program). Every client sees the same screen, writable clients type into it (Ctrl-C goes to the program), and the program gets the smallest size among the writable clients (read-only clients count only when none is writable).
2. Drive without a WebSocket: snapshot, find, press, mouse, paste, write, wait, raw and screenshot connect to the program on demand. Execute and session create on the id answer `409 DAEMON_TERMINAL`: there is no shell to run a command in.
3. Program not running: the WebSocket closes `4404` `daemon program not running`; REST answers `409 DAEMON_PROGRAM_NOT_RUNNING`. Start it with the daemon, then attach again.
4. Program ends while attached: clients close with `4404` `daemon program ended`, and a pending wait answers `exited`. The next attach reaches the restarted instance on a clean screen.
5. `hoody terminal sessions list` shows every program terminal, opened or not: `daemon_program: true`, `shell: null`, and a `daemon` object (`program_id`, `program_name`, `user`, `enabled`, `running`, `connected`, `ended`); `running` means its launcher is listening; `pid` is the terminal's session leader (the program runs under it) while connected, 0 otherwise, and `cols`/`rows` the terminal's current size (`null` until sized). A local shell already on the id stays listed as that shell (`daemon_program: false`, the program in `daemon`); delete it to reach the program.
6. `hoody terminal sessions delete <terminal-id>` drops the terminal's connection to the program, not the program. A program that starts before anything attaches sees a 0x0 terminal size until the first attach or REST call.

## Quirks & gotchas

- **Sharing a terminal URL = handing out a shell.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as the terminal's configured user, which may be root (a daemon program's terminal runs as that program's `user`): read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `computers.proxy`. Share only with people you'd trust with a login as that user. For wider audiences, gate the computer (§ How to gate: an auth group via `hoody computers proxy groups password set`, `hoody computers proxy groups token set` or `hoody computers proxy groups ip set`, that group's access to `terminal`, and `default: 'deny'`; a group alone restricts nothing), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script over a live PTY (a `display` URL is no read-only alternative: its readonly setting is client-side only, and its holder can still send input).
- `terminal_id` is numeric; a new session needs **1–9999** (the kit still accepts ids up to 65535 for sessions an older version made, but the proxy refuses any terminal index above 9999, so those cannot be reached through a kit URL). With the proxy's default bands, **1601–4500 backs `desktop-N` (terminal 1600+N), 4501–5000 backs `agent-N` (4500+N, refused on a `terminal-N` host), 5001–7999 is the ephemeral band and 8001–9999 is where hoody-run and the Hub allocate program terminals**; the desktop and agent offsets are proxy defaults a deployment can change. Pin manual ids in 1–1600.
- `terminal_id=0` (the `terminal-0` host) only starts a new ephemeral session. A WebSocket connection naming zero without `ephemeral=true`, or in agent mode, is refused rather than attached to terminal 1, and `hoody terminal sessions read` on terminal zero answers `400 TERMINAL_ID_ZERO`: use the terminal id returned for the session and its `terminal-N` host.
- **Display pairing.** `hoody terminal sessions create` builds the session's `DISPLAY` from its `display` field and ignores any `display` in the request URL, so it has no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). `hoody terminal commands run` differs: a session it has to create is configured from the request URL, where `display=N` (or the `display_id=N` alias) sets `DISPLAY=:N` — and on a `terminal-N` host that parameter is supplied for you, so a session first created that way already renders on `:N`. `ephemeral=true` still strips it, and an already-running session keeps the `DISPLAY` it spawned with. The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` does not wait for the command to finish even with `wait=true` (session setup and display readiness can still delay the response, see the `wait=false` note below); queues until the named PID exits and is reaped by its parent (TUI-safe), for at most `defer_timeout_ms` (60000 ms default) — on expiry the command never runs (an exited but unreaped process counts as still running).
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is plain UTF-8, not base64; only the URL-form `?cmd=<base64>` is base64-decoded.** Local PTY commands normally run from staged files through a short shell line, so `stdout` holds only what the command printed. SSH commands, and eligible local commands when staging is unavailable, use typed framing; commands requiring staging fail if it is unavailable. For direct interactive input use `hoody terminal sessions write`, `hoody terminal sessions paste` or `hoody terminal sessions keys press`.
- **PTY-mode `/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A `terminal_id` in the body is ignored; with no `?terminal_id` the request is `400 terminal_id parameter required`. With body `mode: "raw"` the command runs as a one-shot process with no terminal session, and `terminal_id` is ignored.
- Completion normally comes from the wrapper's completion marker: an invisible OSC 7771 sequence for staged commands, or a printable `COMMAND_COMPLETED_MARKER_{id}` echo for typed framing. The marker is removed from the result. A command is also marked completed when the session's process has died (`completion: "ended"`, `exit_code` the process's own exit status, which can be `0`; `1` when the process was already gone before the command was set up), or — on a non-ephemeral session with no explicit `timeout` — after 10 s (the default quiet timeout) without output, also while it is still waiting in the queue behind an earlier command (`completion: "output_quiet"`, `exit_code: null`: the exit status is unknown; the program may still be running, or may not have started yet; a command completed while it was still waiting untyped in the queue never runs). A `completed` result therefore does not prove the command ran or exited; check `completion` and `started` (`started: false` alone does not exclude a typed command starting later); a program that swallows the marker and never falls silent keeps `wait=true` waiting.
- **`wait=false` returns `status:"queued"` or `"running"` without waiting for completion** (NOT `"completed"`; when the session has a display configured, the response can still wait up to 10 s for display readiness, and `skip_display_wait=true` skips that check, though the request still queues behind earlier display-waiting requests on the same terminal) — the kit tracks the command through its marker and output, not the underlying PID. Re-check actual output via `hoody terminal sessions read` / `hoody terminal sessions snapshot get`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. Raw HTTP can send `jpg`. The SDK type lists `png | jpeg | gif`, and its runtime validation throws a `ValidationError` for any other non-null supplied value. The CLI `--format` refuses `jpg` before sending; use `jpeg` with either client.
- **`hoody terminal processes signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- `hoody terminal processes pause` / `hoody terminal processes resume` send SIGSTOP / SIGCONT to `{pid}` or `{name}`, never both. `name` matches the kernel `comm`, which Linux cuts to 15 characters, so a longer name matches nothing. PIDs 1 and 2 and the terminal server's own and parent PIDs are guarded: a `{pid}` naming one is refused with 403, while by `name` or through `include_descendants` a guarded PID is skipped and listed in `skipped` with error `GUARDED`, and when every match is guarded the answer is 200 with a zero count. `include_descendants: true` also signals every child process (best-effort, not atomic). A frozen process keeps its memory until `hoody terminal processes resume`.
- `hoody terminal sessions mouseevents send` takes 0-based text cells (row, col), not pixels; a cell off the screen is a 400. The program sees the event only when it has turned on terminal mouse reporting (htop, vim with `mouse=a`, tmux with `mouse on`); otherwise the call still answers 200, with `bytes_written: 0`.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).
- `hoody shell` is an interactive PTY, or a one-shot via a POSITIONAL command (`hoody shell "$C" -- uname -a`). There is no `--command` flag and no `--ephemeral` flag on `shell`. For pinned ids on the automation surface use `hoody --computer "$C" terminal commands run --terminal-id 100 --command 'uname -a'`.

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id.
- `400 terminal_id above 9999 cannot start a new session (new sessions use 1-9999)` (code `INVALID_TERMINAL_ID`) when a create or execute would start a session above 9999.
- `400` config-error on `hoody terminal sessions create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `409 EPHEMERAL_SESSION` on `hoody terminal sessions create` — the `terminal_id` names a running ephemeral session, usually left by an `ephemeral=true` command sent to that id's own `terminal-N` host (the proxy pins it to N). That session has no `DISPLAY` and is reaped when idle, so it is not handed back as the session you asked for: `hoody terminal sessions delete` it and create it again, and send one-off ephemeral commands to the `terminal-0` host.
- `409 PERSISTENT_SESSION` on `hoody terminal commands run` with `ephemeral=true` — the `terminal_id` names a running session that has a display; turning it ephemeral would strip its display and reap it, so nothing runs. Drop `ephemeral`, or send the command to the `terminal-0` host.
- `404` on `hoody terminal commands get` once the result is gone: its session was removed (an ephemeral session holding results goes after `ephemeral-result-timeout` of inactivity with no attached client), or the session's result buffer filled and evicted it.
- `Unknown program name "<name>"` (400) on `hoody proxy aliases create` → the `program` is not in the platform's program catalog. For a terminal alias use `program=terminal` (not `hoody-terminal` or `terminal-N`); pick the instance with `index`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first.

Warning: Through the computers proxy, the **`terminal-N` hostname selects the terminal**: the proxy sets `terminal_id` from `N` and overwrites any value you send, so every example addresses the session's own host (`terminal-100` for session 100; `terminal-0` for ephemeral allocation). The short alias `t-<N>` (`<projectId>-<computerId>-t-<N>.<server>.computers.hoody.com`) selects the same terminal. The proxy refuses either form above 9999 (`404 SERVICE_INDEX_OUT_OF_RANGE`), so a session an older version made above 9999 cannot be reached through a kit URL. The CLI derives the host from `--terminal-id`. When calling the kit directly, the HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body carries `command`, `wait`, `mode` (`pty` by default, or `raw` for a one-shot process with no terminal session), `stdin_b64` and `user` (raw mode only), `id`, `timeout`, `cwd` and `env`); in PTY mode a missing query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`; raw mode ignores `terminal_id`. Always pass `?terminal_id=N` in PTY mode. The `command` body field is **plain UTF-8**, not base64 (only the URL form `?cmd=<base64>` is base64-decoded); local PTY commands normally run from staged files through a short shell line; SSH commands, and eligible local commands when staging is unavailable, use typed framing, and commands requiring staging fail if it is unavailable. `wait=true` normally returns when the kit sees the completion marker; a non-ephemeral command with no `timeout` is also reported completed after 10 s (the default quiet timeout) without new output, also while it still waits in the queue (`completion: "output_quiet"`, `exit_code: null`; the program may still be running, and a command completed while still untyped in the queue never runs: check `completion` and `started`), and programs that swallow the marker or only background-fork can return `status:"completed"` with empty or partial stdout — re-check via `hoody terminal sessions read` if in doubt. Add `-o json` to `hoody terminal commands run` to get the full result body (`stdout`, `exit_code`, `command_id`) for scripting.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session.

**Step 1 — create the session.** Pin in `1–1600`. On the session's `terminal-N` host the proxy supplies the query `terminal_id=N`, so an HTTP body may omit `terminal_id`; if it names one, it must match N or creation answers `400 TERMINAL_ID_MISMATCH`. The examples below send matching ids.

```bash
hoody --computer "$C" terminal sessions create --terminal-id 100 --shell /bin/bash --cols 120 --rows 30
```

**Step 2 — execute** with body `wait: true`. The body's `command` field is **plain UTF-8** (no base64).

```bash
RESP=$(hoody --computer "$C" terminal commands run --terminal-id 100 \
  --command 'echo HELLO; uname -a' --wait -o json)
CID=$(echo "$RESP" | jq -r .command_id)
```

**Step 3 — re-fetch the result** via `hoody terminal commands get`, and save it promptly: a completed result can be evicted once the session's result buffer fills (100 results by default), and it is gone when the session is removed.

```bash
# The command belongs to terminal 100: without --terminal-id the CLI asks terminal 1, which
# answers 404 COMMAND_NOT_FOUND.
hoody --computer "$C" terminal commands get "$CID" --terminal-id 100 -o json | jq '{status, exit_code, stdout: (.stdout|tostring|.[0:200])}'
```

**Step 4 — clean up.** Always delete the session you created: a session lives until it is deleted or idles out (`terminal-idle-timeout`, 300 s with no client and no running process), and an undeleted pinned id stays taken for the next caller.

```bash
hoody --computer "$C" terminal sessions delete 100 -y
```

### 2. Ephemeral one-off — run a command without pinning anything

**Goal:** behave like a one-shot `exec()` — auto-allocated PTY, runs, evicts. No need to track a terminal_id.

```bash
hoody --computer "$C" terminal commands run --ephemeral --wait \
  --command 'date -u +%FT%TZ; uname -m' -o json | jq '{terminal_id, exit_code, stdout}'
# Without a PTY: `hoody shell` runs the command in raw mode (exact stdout and stderr bytes up to 16 MiB per stream by default, then it reports the cut and exits nonzero; no terminal session). Quote the command so `;` runs remotely, not locally:
hoody --computer "$C" shell -- sh -c 'date -u +%FT%TZ; uname -m'
```

Warning: Ephemeral allocates from `5001–7999` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

### 3. Automate a TUI — paste, press, wait, snapshot, find

**Goal:** drive an interactive program (here a simple shell echo, but the same recipe works for `htop`, `vim`, `fzf`, …).

**Step 1 — create the session and paste a line** (raw, not base64; bracketed-paste optional).

```bash
hoody --computer "$C" terminal sessions create --terminal-id 101
hoody --computer "$C" terminal sessions paste 101 --text 'echo PASTED_TEXT'
```

**Step 2 — press Enter, wait for the screen to go stable, snapshot + regex-find.**

```bash
hoody --computer "$C" terminal sessions keys press 101 --key enter
hoody --computer "$C" terminal sessions wait 101 --mode stable --debounce-ms 500 --timeout-ms 3000 -o json | jq .status
hoody --computer "$C" terminal sessions snapshot get 101
hoody --computer "$C" terminal sessions search 101 --pattern PASTED
```

**Step 3 — discover what keys you can press** (named keys differ per kit build):

```bash
hoody --computer "$C" terminal keys list -o json | jq '.keys | length, .[0:8]'
```

Cleanup: `hoody --computer "$C" terminal sessions delete 101 -y`.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL on the session's `terminal-N` host, `terminal_id` in query, subprotocol `tty`. Right after the socket opens, send the initial JSON dimensions message; the server starts sending output after it. Server frames start with a type byte: ASCII `'0'` (`0x30`) marks PTY output, followed by the raw PTY bytes, ANSI escape sequences included, not a rendered screen (read that with the snapshot, as in example 3). Inject input via REST `/write` or `/press`.

```bash
hoody --computer "$C" terminal sessions create --terminal-id 102
# The CLI has no streaming WebSocket reader. Attach interactively with:
#   hoody --computer "$C" shell --terminal-id 102
# or drive and read the session over REST:
hoody --computer "$C" terminal sessions write 102 --input 'echo VIA_WRITE' --enter
hoody --computer "$C" terminal sessions snapshot get 102
```

`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `hoody terminal sessions delete <terminal-id>`.

### 5. Computer introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness.

```bash
hoody --computer "$C" terminal system stats
hoody --computer "$C" terminal processes list --limit 5 -o json | jq '.processes[] | {pid, name, cpu_percent}'
hoody --computer "$C" terminal system ports list -o json | jq '.[] | {port, program, user}'
hoody --computer "$C" terminal system displays list
hoody --computer "$C" terminal system daemonprograms list
hoody --computer "$C" terminal processes get 1 -o json | jq '{pid, name, cmdline}'
```

Warning: `hoody terminal system reboot` and `hoody terminal system shutdown` exist on the same surface — don't call them on a shared dev computer, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. For this `hoody terminal sessions create` example, pass the display as a string (`--display 10`) so the kit exports `DISPLAY=:10`; `hoody terminal sessions create` does not derive it from `terminal_id`.

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```bash
hoody --computer "$C" terminal sessions create --terminal-id 10 --display 10
hoody --computer "$C" terminal commands run --terminal-id 10 --command 'xeyes &' --wait -o json
```

**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```bash
hoody --computer "$C" terminal system displays list \
  | jq '.[] | select((.display | tostring) == "10") | {display, user, windows: (.windows|length)}'
# optional: save a screenshot to look at; saving it alone does not prove a window is there
hoody --computer "$C" display screenshots capture --display-id 10 --out-file /tmp/display-10.png
```

Cleanup: kill `xeyes` via `hoody terminal processes signal --name xeyes --signal SIGTERM` or use `hoody terminal sessions delete <terminal-id>` to end the shell and its GUI programs, unless they detached with `setsid` or `nohup`. Display `:10` keeps running; end it with `hoody terminal system displays stop <display>` when nothing else uses it.

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the computer's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```bash
hoody --computer "$C" terminal sessions create --terminal-id 11 \
  --shell ssh --ssh-host ssh.example.com --ssh-user deploy --ssh-port 22 --ssh-password "$SSH_PASSWORD"
hoody --computer "$C" terminal commands run --terminal-id 11 --command 'hostname; whoami' --wait -o json
```

An SSH session always answers `hoody terminal commands run` asynchronously, even with `wait: true`: read `command_id` from the response and poll `hoody terminal commands get`. For an SSH session on another terminal, pass its number: `hoody --computer "$C" terminal commands get "$COMMAND_ID" --terminal-id 11`, with `$COMMAND_ID` holding the returned `command_id` (without `--terminal-id` the CLI asks terminal 1).

To route the SSH connection through a SOCKS5 proxy, keep `ssh_host` and `ssh_user` and add `socks5_host` / `socks5_port` (plus `socks5_user` / `socks5_pass` if the proxy needs credentials); SOCKS5 fields without `ssh_host` and `ssh_user` are rejected. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with body `wait: false`** so the request does not wait for the agent to finish while it stays alive in the PTY. In the CLI, `commands run --no-wait` sends `wait: false`. The `cwd` must already exist: `hoody terminal sessions create` has no auto-create option and fails on a missing directory. To have the kit create it, skip `hoody terminal sessions create` and let `hoody terminal commands run` create the session, passing `cwd` and `cwd_auto_create=true` with the pinned `terminal_id`:

```bash
# No sessions create: this call creates session 50 and its missing working directory.
hoody --computer "$C" terminal commands run --terminal-id 50 --shell bash \
  --cwd /home/user/agent --cwd-auto-create true \
  --command 'sleep 600; echo agent-stopped' --no-wait -o json   # placeholder for `claude`/`codex`
```

**Step 2 — reattach later** — same `terminal_id`, WS or REST, multiplayer:

```bash
hoody --computer "$C" shell --terminal-id 50     # interactive attach
hoody --computer "$C" terminal sessions snapshot get 50
```

Warning: Body `wait: false` returns `status:"queued"` or `"running"` without waiting for completion (NOT `"completed"`) because the kit tracks the command, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `hoody terminal sessions read` / `hoody terminal sessions snapshot get`. **Never** start a durable agent with `ephemeral=true`: once an ephemeral session sits inactive with no attached client, the periodic cleanup force-kills its process (after 60 s by default, or after `ephemeral-result-timeout`, 300 s by default, when it holds results).

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` has exited and been reaped by its parent. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```bash
hoody --computer "$C" terminal sessions create --terminal-id 60
hoody --computer "$C" terminal commands run --terminal-id 60 --defer-pid 12345 \
  --command 'echo build-finished; ./run-tests.sh' --wait -o json
```

`defer_pid` does not wait for the command to finish even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits (its `/proc/<pid>` entry is gone: a process that has exited but whose parent has not reaped it still counts as running until `defer_timeout_ms` passes). The wait is bounded by `defer_timeout_ms` (60000 ms default): set it explicitly for longer builds, because on expiry the command is marked timed out (exit code 124) and never runs. A PID that is already gone, or a `defer_start_time_ticks` that does not match the running process, runs the command immediately; pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (body `wait: false`), capture `command_id`.** In the CLI, `commands run --no-wait` sends `wait: false`.

```bash
hoody --computer "$C" terminal sessions create --terminal-id 70
CID=$(hoody --computer "$C" terminal commands run --terminal-id 70 \
  --command 'sleep 120' --no-wait -o json | jq -r .command_id)
```

**Step 2 — abort** the command tracker. The default sends Ctrl+C (SIGINT) to the foreground process group, and the session's shell survives. `--force` sends SIGKILL to the shell's process group, which kills the session's shell; the command's own group then gets the kernel's hangup, and a command that ignores hangup keeps running (find it with `hoody terminal processes list` and stop it with `hoody terminal processes signal` by `pid`), so use it only when the interrupt did not stop the command.

```bash
# The command belongs to terminal 70: without --terminal-id the CLI asks terminal 1, which
# answers 404 COMMAND_NOT_FOUND and leaves the command running.
hoody --computer "$C" terminal commands cancel "$CID" --terminal-id 70
```

**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `hoody terminal processes signal` by name. Targets every process matching the name.

```bash
hoody --computer "$C" terminal processes signal --name sleep --signal SIGTERM
```

Cleanup: `hoody terminal sessions delete <terminal-id>`. Warning: Never call `hoody terminal system shutdown` / `hoody terminal system reboot` to recover from a hung command — they stop every process in the computer and wipe in-memory state.

## Reference

### `hoody terminal` (33) — Terminal sessions and execution

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody terminal automation stats` |  | read | Get terminal automation metrics | `terminal.kit.getAutomationStats` | `hoody terminal automation stats` |
| `hoody terminal commands cancel` |  | write | Abort a running command | `terminal.commands.cancel` | `hoody terminal commands cancel 45678 --force --terminal-id 1` |
| `hoody terminal commands get` |  | read | Get command result | `terminal.commands.get` | `hoody terminal commands get 45678 --terminal-id 1` |
| `hoody terminal commands list` |  | read | Get terminal command history | `terminal.commands.list` | `hoody terminal commands list 1 --watch 2s` |
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
| `hoody terminal sessions create` |  | write | Create a terminal session | `terminal.sessions.create` | `hoody terminal sessions create --exclusive --ephemeral` |
| `hoody terminal sessions delete` |  | destructive | Delete a terminal session | `terminal.sessions.delete` | `hoody terminal sessions delete 1 --incarnation 0123456789abcdef0123456789abcdef -y` |
| `hoody terminal sessions keys press` |  | write | Send named key presses to terminal | `terminal.sessions.pressKeys` | `hoody terminal sessions keys press 1 --keys ctrl+c` |
| `hoody terminal sessions list` |  | read | List all terminal sessions | `terminal.sessions.list` | `hoody terminal sessions list --history-limit 50 --watch 2s` |
| `hoody terminal sessions mouseevents send` |  | write | Send a cell-based mouse event to a terminal session | `terminal.sessions.sendMouseEvents` | `hoody terminal sessions mouseevents send 1 --event-type move --event-row 10 --event-col 10 --event-button 1` |
| `hoody terminal sessions paste` |  | write | Paste text into terminal | `terminal.sessions.paste` | `hoody terminal sessions paste 1 --text Hello --bracketed` |
| `hoody terminal sessions read` |  | read | Get raw terminal output | `terminal.sessions.read` | `hoody terminal sessions read 1 --format download --tail 100` |
| `hoody terminal sessions screenshots capture` |  | read | Capture terminal screenshot | `terminal.sessions.captureScreenshot` | `hoody terminal sessions screenshots capture 1 --format png --foreground white` |
| `hoody terminal sessions search` |  | read | Search terminal screen with regex | `terminal.sessions.search` | `hoody terminal sessions search 1 --pattern TODO --scope screen --limit 100` |
| `hoody terminal sessions snapshot get` |  | read | Get rendered terminal snapshot | `terminal.sessions.getSnapshot` | `hoody terminal sessions snapshot get 1 --include-colors --include-highlights` |
| `hoody terminal sessions wait` |  | write | Wait for terminal condition | `terminal.sessions.wait` | `hoody terminal sessions wait 1 --mode stable --debounce-ms 100` |
| `hoody terminal sessions write` |  | write | Write input to terminal | `terminal.sessions.write` | `hoody terminal sessions write 1 --input <input> --enter` |
| `hoody terminal system daemonprograms list` |  | read | Get daemon programs configuration | `terminal.system.listDaemonPrograms` | `hoody terminal system daemonprograms list --watch 2s` |
| `hoody terminal system displays list` |  | read | Get display information | `terminal.system.listDisplays` | `hoody terminal system displays list --watch 2s` |
| `hoody terminal system displays stop` |  | destructive | Stop an X display and everything drawing on it, including a display a deleted terminal session left running | `terminal.system.stopDisplay` | `hoody terminal system displays stop 1 -y` |
| `hoody terminal system ports list` |  | read | List all listening network ports | `terminal.system.listPorts` | `hoody terminal system ports list --protocol tcp --user root` |
| `hoody terminal system reboot` |  | write | Reboot the system | `terminal.system.reboot` | `hoody terminal system reboot --delay 60 -y` |
| `hoody terminal system shutdown` |  | write | Shutdown the system | `terminal.system.shutdown` | `hoody terminal system shutdown --delay 60 -y` |
| `hoody terminal system stats` |  | read | Get system resources and statistics | `terminal.system.getStats` | `hoody terminal system stats` |

