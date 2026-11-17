> _**SDK skill · `terminal` namespace** · ~21,332 tokens · hoody-sdk v1.0.1_

# `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket

## Purpose

Real PTY per computer, numeric `terminal_id` (a new session needs 1–9999; ids up to 65535 only reach sessions an older version made). REST + WebSocket. Multiplayer; sessions persist.

## When to use

- **Interactive TUIs** that paint the screen (Claude Code, Codex, vim, htop, less, fzf, ssh, etc.) — these need a real PTY; only `terminal` provides one.
- **Durable / long-lived programs that you may need to interact with later** (the agent you spawned, a coding assistant, a chat REPL) — pin a stable `terminal_id` (1–1600) and reattach over WS or REST. When it must be supervised (restarted on exit, started at boot), run it as a `daemon` program with `terminal_id` instead: its terminal is attached the same way (see "Daemon program terminals" below).
- Sequenced commands sharing shell state, keystroke automation, screen capture, regex-search the rendered buffer.
- SSH / SOCKS5 sessions (`ssh_*` / `socks5_*`).
- Host introspection (`system.*`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process. A session made by `sessions.create` renders on a display only when given a `display` (a string such as `"10"`; the id never sets it); a session first created by `commands.run` takes its display from the request URL instead (see Quirks). Keeping ids distinct keeps each terminal-to-display pairing one-to-one. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `5001–7999` when no `terminal_id` is given (a pinned id converts that terminal, see recipe 2), and once one sits inactive with no attached WebSocket client it is removed and its process force-killed by the periodic cleanup: after 60 s of inactivity by default when it holds no results, otherwise after `ephemeral-result-timeout` (300 s default). Your Claude Code / Codex session would die at that point.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- A script that should be callable over HTTP → `exec`. (A one-off shell command fits `terminal` itself: ephemeral, workflow 2. When its logs must outlive the response, use `daemon.ephemeralPrograms.start`.)
- File I/O → `files`. GUI rendering → `display`. Schedule → `cron`.

## Prerequisites

- Computer with `terminal` kit running; capability URL.
- SSH needs reachable `ssh_host:ssh_port`; automation needs existing `terminal_id`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Persistent interactive session

`sessions.create` (pin `terminal_id` in 1–1600 and keep `ephemeral: false`: an ephemeral session's process is killed once idle with no client attached) → `commands.run` (body `wait` defaults to `true` and asks for a synchronous result, but SSH sessions, `defer_pid` commands and a server at its concurrent-wait cap answer asynchronously — check `status` and poll `commands.get` by `command_id`; send body `wait: false` for an async `command_id`; shares shell state) → `commands.get` → `sessions.read`/`sessions.captureScreenshot` → `sessions.delete`. 

### 2. Ephemeral one-off execute

`commands.run` `ephemeral=true`, `wait=true` — auto ID 5001–7999, runs `command`, cleans up. Through the proxy, send it to the `terminal-0` hostname: any other `terminal-N` host pins the request to terminal N: the command runs inside that terminal, which becomes an ephemeral session (a terminal N with a display, one a client has attached to, or an agent session is refused with `409` instead), and every later execute on that host queues behind it. Each execute's timeout (600 s by default on an ephemeral session) starts when the command is submitted for execution, after any `defer_pid` wait, and runs while it waits in the queue, so behind a command that hangs until its timeout, later ones can time out without ever running. Later: `commands.get` before the session goes: an ephemeral session holding results is removed after `ephemeral-result-timeout` (300 s default) of inactivity with no attached client. 

### 3. Automate a TUI

`sessions.create` (or `commands.run` to launch) → `sessions.pressKeys` (`Down`/`Enter`/`F2`; `keys.list`) → `sessions.paste` (`bracketed=true`) → `sessions.wait` (`mode`: `stable`, `regex` with a `pattern`, or `either`) → `sessions.getSnapshot`/`sessions.search`.

### 4. Live stream — WebSocket

`sessions.connect` at `/api/v1/terminal/ws?terminal_id=…` on the session's `terminal-N` host. After the socket opens, the client must send the initial JSON dimensions message (`{"columns":…,"rows":…}`) before the server sends output. Multiple WS clients attach simultaneously; writes broadcast to PTY. Inject from REST via `sessions.write` or `sessions.pressKeys`. `commands.cancel` interrupts by `command_id`.

### 5. Computer introspection

`processes.list`, `processes.get`, `processes.signal`, `system.listPorts`, `system.getStats`, `system.listDisplays`, `system.listDaemonPrograms`, `system.reboot`/`system.shutdown`. `processes.list` and `system.listPorts` answer in a single response with no pages (`processes.list` takes `limit`, `sort` and `filter`). Call `processes.list`, `system.listPorts` and `sessions.list` directly; each returns one response and has no paging helpers.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–1600; **never** 1601–5000, which backs `desktop-N` and `agent-N` with the default bands, the ephemeral range 5001–7999 or the 8001–9999 program-terminal band; **never** re-use one another program is on).
2. `sessions.create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/home/user'` (or wherever).
3. `commands.run` with body `command: 'claude'` (or `codex`, `aider`, `gemini …`) and body `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request. 
4. Reattach any time: `sessions.connect`, then connect and send the initial dimensions message (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or REST via `sessions.pressKeys` / `sessions.paste` to drive it.
5. Tear down only when really done: `sessions.delete(terminal_id)`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a computer reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `21`, Codex on `22`; avoid `1`, the shared terminal that `hoody shell`, the `terminal-1` URL and every client that names no terminal attach to). If a session needs a display, pass `display` explicitly on `sessions.create` (a string, for example `"10"`); distinct ids keep that pairing one-to-one.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. When creating the session with `sessions.create`, pass the matching `display` explicitly; it does not derive it from `terminal_id`. A session first created by `commands.run` on a `terminal-N` host gets `DISPLAY=:N` from the URL instead; see Quirks.

1. `sessions.create` with a pinned `terminal_id` (e.g. `10`) AND a matching `display: "10"` field (string in the SDK type), so the kit exports `DISPLAY=:10` into the PTY.
2. From that session: `commands.run` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-10`.
3. Open the matching display kit URL — `https://{projectId}-{computerId}-display-10.{node}.computers.hoody.com` (read `project_id`, `id` and `server_name` from `computers.get` for `{projectId}`, `{computerId}` and `{node}`; the SDK exposes `getKitUrl('display', computer, 10)` and `listKitUrls(computer)` if you want to skip the string manipulation).
4. Drive the GUI via the `display` namespace, passing `{ displayId: 10 }` in the options argument of every `display.*` call (without it the call goes to display 1):
   - `display.screenshots.capture` — see what's on screen (turn `base64` on for vision agents).
   - `display.input.click` `{ x, y, button }` — left/right click; `display.input.type` `{ x, y, text }` — click at a point, then type.
   - `display.windows.search` `{ pattern, name?: true, class?: true }` (a `pattern` plus booleans that pick the fields to match) → `display.windows.focus` / `display.windows.getGeometry` / `display.windows.getActive` to focus + locate.
   - `display.input.actMany` — bulk input replay; `display.input.wait` between actions.
5. Tear down: kill the GUI program with `processes.signal`, or use `sessions.delete` to end the shell and GUI programs it started, unless they detached with `setsid` or `nohup`. The display itself keeps running after the session is deleted; end it with `system.stopDisplay(10)` when nothing else uses it.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=10`↔`display:":10"`, `terminal_id=11`↔`display:":11"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, open the `desktop-<N>` alias directly (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-SDK.md`). It auto-spawns the DE on a separate display of its own (not display `<N>`), so apps started by the steps above do not appear on it; this recipe is for spawning **specific** apps under your own control.

### 8. Daemon program terminals

A daemon program configured with `terminal_id: N` runs on terminal N's PTY, and terminal N belongs to it while the program is configured. Nothing spawns there: shell, cwd, user, env, display, `cmd` and `pid` parameters on that id are ignored.

1. Attach: `client.daemon.programs.connectTerminal(program, { readOnly?, cols?, rows? })` on a computer-scoped client resolves `{ terminalId, ws }`; `ws.disconnect()` leaves the program running. Every client sees the same screen, writable clients type into it (Ctrl-C goes to the program), and the program gets the smallest size among the writable clients (read-only clients count only when none is writable).
2. Drive without a WebSocket: snapshot, find, press, mouse, paste, write, wait, raw and screenshot connect to the program on demand. Execute and session create on the id answer `409 DAEMON_TERMINAL`: there is no shell to run a command in.
3. Program not running: the WebSocket closes `4404` `daemon program not running`; REST answers `409 DAEMON_PROGRAM_NOT_RUNNING`. Start it with the daemon, then attach again.
4. Program ends while attached: clients close with `4404` `daemon program ended`, and a pending wait answers `exited`. The next attach reaches the restarted instance on a clean screen.
5. `sessions.list` shows every program terminal, opened or not: `daemon_program: true`, `shell: null`, and a `daemon` object (`program_id`, `program_name`, `user`, `enabled`, `running`, `connected`, `ended`); `running` means its launcher is listening; `pid` is the terminal's session leader (the program runs under it) while connected, 0 otherwise, and `cols`/`rows` the terminal's current size (`null` until sized). A local shell already on the id stays listed as that shell (`daemon_program: false`, the program in `daemon`); delete it to reach the program.
6. `sessions.delete(String(N))` drops the terminal's connection to the program, not the program. A program that starts before anything attaches sees a 0x0 terminal size until the first attach or REST call.

## Quirks & gotchas

- **Sharing a terminal URL = handing out a shell.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as the terminal's configured user, which may be root (a daemon program's terminal runs as that program's `user`): read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `computers.proxy`. Share only with people you'd trust with a login as that user. For wider audiences, gate the computer (§ How to gate: an auth group via `client.api.computers.proxy.setPasswordGroup`, `client.api.computers.proxy.setTokenGroup` or `client.api.computers.proxy.setIpGroup`, that group's access to `terminal`, and `default: 'deny'`; a group alone restricts nothing), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script over a live PTY (a `display` URL is no read-only alternative: its readonly setting is client-side only, and its holder can still send input).
- `terminal_id` is numeric; a new session needs **1–9999** (the kit still accepts ids up to 65535 for sessions an older version made, but the proxy refuses any terminal index above 9999, so those cannot be reached through a kit URL). With the proxy's default bands, **1601–4500 backs `desktop-N` (terminal 1600+N), 4501–5000 backs `agent-N` (4500+N, refused on a `terminal-N` host), 5001–7999 is the ephemeral band and 8001–9999 is where hoody-run and the Hub allocate program terminals**; the desktop and agent offsets are proxy defaults a deployment can change. Pin manual ids in 1–1600.
- `terminal_id=0` (the `terminal-0` host) only starts a new ephemeral session. A WebSocket connection naming zero without `ephemeral=true`, or in agent mode, is refused rather than attached to terminal 1, and `sessions.read` on terminal zero answers `400 TERMINAL_ID_ZERO`: use the terminal id returned for the session and its `terminal-N` host.
- **Display pairing.** `sessions.create` builds the session's `DISPLAY` from its `display` field and ignores any `display` in the request URL, so it has no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). `commands.run` differs: a session it has to create is configured from the request URL, where `display=N` (or the `display_id=N` alias) sets `DISPLAY=:N` — and on a `terminal-N` host that parameter is supplied for you, so a session first created that way already renders on `:N`. `ephemeral=true` still strips it, and an already-running session keeps the `DISPLAY` it spawned with. The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` does not wait for the command to finish even with `wait=true` (session setup and display readiness can still delay the response, see the `wait=false` note below); queues until the named PID exits and is reaped by its parent (TUI-safe), for at most `defer_timeout_ms` (60000 ms default) — on expiry the command never runs (an exited but unreaped process counts as still running).
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is plain UTF-8, not base64; only the URL-form `?cmd=<base64>` is base64-decoded.** Local PTY commands normally run from staged files through a short shell line, so `stdout` holds only what the command printed. SSH commands, and eligible local commands when staging is unavailable, use typed framing; commands requiring staging fail if it is unavailable. For direct interactive input use `sessions.write`, `sessions.paste` or `sessions.pressKeys`.
- **PTY-mode `/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A `terminal_id` in the body is ignored; with no `?terminal_id` the request is `400 terminal_id parameter required`. With body `mode: "raw"` the command runs as a one-shot process with no terminal session, and `terminal_id` is ignored.
- Completion normally comes from the wrapper's completion marker: an invisible OSC 7771 sequence for staged commands, or a printable `COMMAND_COMPLETED_MARKER_{id}` echo for typed framing. The marker is removed from the result. A command is also marked completed when the session's process has died (`completion: "ended"`, `exit_code` the process's own exit status, which can be `0`; `1` when the process was already gone before the command was set up), or — on a non-ephemeral session with no explicit `timeout` — after 10 s (the default quiet timeout) without output, also while it is still waiting in the queue behind an earlier command (`completion: "output_quiet"`, `exit_code: null`: the exit status is unknown; the program may still be running, or may not have started yet; a command completed while it was still waiting untyped in the queue never runs). A `completed` result therefore does not prove the command ran or exited; check `completion` and `started` (`started: false` alone does not exclude a typed command starting later); a program that swallows the marker and never falls silent keeps `wait=true` waiting.
- **`wait=false` returns `status:"queued"` or `"running"` without waiting for completion** (NOT `"completed"`; when the session has a display configured, the response can still wait up to 10 s for display readiness, and `skip_display_wait=true` skips that check, though the request still queues behind earlier display-waiting requests on the same terminal) — the kit tracks the command through its marker and output, not the underlying PID. Re-check actual output via `sessions.read` / `sessions.getSnapshot`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. Raw HTTP can send `jpg`. The SDK type lists `png | jpeg | gif`, and its runtime validation throws a `ValidationError` for any other non-null supplied value. The CLI `--format` refuses `jpg` before sending; use `jpeg` with either client.
- **`processes.signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- `processes.pause` / `processes.resume` send SIGSTOP / SIGCONT to `{pid}` or `{name}`, never both. `name` matches the kernel `comm`, which Linux cuts to 15 characters, so a longer name matches nothing. PIDs 1 and 2 and the terminal server's own and parent PIDs are guarded: a `{pid}` naming one is refused with 403, while by `name` or through `include_descendants` a guarded PID is skipped and listed in `skipped` with error `GUARDED`, and when every match is guarded the answer is 200 with a zero count. `include_descendants: true` also signals every child process (best-effort, not atomic). A frozen process keeps its memory until `processes.resume`.
- `sessions.sendMouseEvents` takes 0-based text cells (row, col), not pixels; a cell off the screen is a 400. The program sees the event only when it has turned on terminal mouse reporting (htop, vim with `mouse=a`, tmux with `mouse on`); otherwise the call still answers 200, with `bytes_written: 0`.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id.
- `400 terminal_id above 9999 cannot start a new session (new sessions use 1-9999)` (code `INVALID_TERMINAL_ID`) when a create or execute would start a session above 9999.
- `400` config-error on `sessions.create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `409 EPHEMERAL_SESSION` on `sessions.create` — the `terminal_id` names a running ephemeral session, usually left by an `ephemeral=true` command sent to that id's own `terminal-N` host (the proxy pins it to N). That session has no `DISPLAY` and is reaped when idle, so it is not handed back as the session you asked for: `sessions.delete` it and create it again, and send one-off ephemeral commands to the `terminal-0` host.
- `409 PERSISTENT_SESSION` on `commands.run` with `ephemeral=true` — the `terminal_id` names a running session that has a display; turning it ephemeral would strip its display and reap it, so nothing runs. Drop `ephemeral`, or send the command to the `terminal-0` host.
- `404` on `commands.get` once the result is gone: its session was removed (an ephemeral session holding results goes after `ephemeral-result-timeout` of inactivity with no attached client), or the session's result buffer filled and evicted it.
- `Unknown program name "<name>"` (400) on `proxy.aliases.create` → the `program` is not in the platform's program catalog. For a terminal alias use `program=terminal` (not `hoody-terminal` or `terminal-N`); pick the instance with `index`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first.

Warning: Through the computers proxy, the **`terminal-N` hostname selects the terminal**: the proxy sets `terminal_id` from `N` and overwrites any value you send, so every example addresses the session's own host (`terminal-100` for session 100; `terminal-0` for ephemeral allocation). The short alias `t-<N>` (`<projectId>-<computerId>-t-<N>.<server>.computers.hoody.com`) selects the same terminal. The proxy refuses either form above 9999 (`404 SERVICE_INDEX_OUT_OF_RANGE`), so a session an older version made above 9999 cannot be reached through a kit URL. In the SDK, pass `{ serviceIndex: N }` in the template-vars argument. It follows the body, path and operation-options arguments; some methods also take a separate `requestOptions` or `wsOptions` argument after it. The default is 1. For a computer-scoped client, a supplied `terminal_id` normally selects the host automatically. When calling the kit directly, the HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body carries `command`, `wait`, `mode` (`pty` by default, or `raw` for a one-shot process with no terminal session), `stdin_b64` and `user` (raw mode only), `id`, `timeout`, `cwd` and `env`); in PTY mode a missing query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`; raw mode ignores `terminal_id`. Always pass `?terminal_id=N` in PTY mode. The `command` body field is **plain UTF-8**, not base64 (only the URL form `?cmd=<base64>` is base64-decoded); local PTY commands normally run from staged files through a short shell line; SSH commands, and eligible local commands when staging is unavailable, use typed framing, and commands requiring staging fail if it is unavailable. `wait=true` normally returns when the kit sees the completion marker; a non-ephemeral command with no `timeout` is also reported completed after 10 s (the default quiet timeout) without new output, also while it still waits in the queue (`completion: "output_quiet"`, `exit_code: null`; the program may still be running, and a command completed while still untyped in the queue never runs: check `completion` and `started`), and programs that swallow the marker or only background-fork can return `status:"completed"` with empty or partial stdout — re-check via `sessions.read` if in doubt. SDK callers pass `terminal_id` / `ephemeral` / `defer_pid` / `display` / `ssh_*` in the **options object** (2nd arg) and `wait` in the **body**: `client.terminal.commands.run({ command: 'echo hi', wait: true }, { terminal_id: '100' }, { serviceIndex: 100 })`.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session.

**Step 1 — create the session.** Pin in `1–1600`. On the session's `terminal-N` host the proxy supplies the query `terminal_id=N`, so an HTTP body may omit `terminal_id`; if it names one, it must match N or creation answers `400 TERMINAL_ID_MISMATCH`. The examples below send matching ids.

```typescript
const slot = { serviceIndex: 100 }; // _templateVars: routes every call to terminal-100
await client.terminal.sessions.create({ terminal_id: '100', shell: '/bin/bash', cols: 120, rows: 30 }, slot);
```

**Step 2 — execute** with body `wait: true`. The body's `command` field is **plain UTF-8** (no base64).

```typescript
const r = await client.terminal.commands.run(
  { command: 'echo HELLO; uname -a', wait: true },
  { terminal_id: '100' },
  slot,
);
const commandId = r.data!.command_id;
```

**Step 3 — re-fetch the result** via `commands.get`, and save it promptly: a completed result can be evicted once the session's result buffer fills (100 results by default), and it is gone when the session is removed.

```typescript
const out = await client.terminal.commands.get(commandId, slot);
```

**Step 4 — clean up.** Always delete the session you created: a session lives until it is deleted or idles out (`terminal-idle-timeout`, 300 s with no client and no running process), and an undeleted pinned id stays taken for the next caller.

```typescript
await client.terminal.sessions.delete('100', undefined, slot);
```

### 2. Ephemeral one-off — run a command without pinning anything

**Goal:** behave like a one-shot `exec()` — auto-allocated PTY, runs, evicts. No need to track a terminal_id.

```typescript
const r = await client.terminal.commands.run(
  { command: 'date -u +%FT%TZ; uname -m', wait: true },
  { ephemeral: true },
  { serviceIndex: 0 }, // terminal-0: no pinned id, so ephemeral can allocate one
);
console.log(r.data!.stdout);
```

Warning: Ephemeral allocates from `5001–7999` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

### 3. Automate a TUI — paste, press, wait, snapshot, find

**Goal:** drive an interactive program (here a simple shell echo, but the same recipe works for `htop`, `vim`, `fzf`, …).

**Step 1 — create the session and paste a line** (raw, not base64; bracketed-paste optional).

```typescript
const slot = { serviceIndex: 101 }; // _templateVars: routes every call to terminal-101
await client.terminal.sessions.create({ terminal_id: '101' }, slot);
// terminal_id is a QUERY param — it goes in the 2nd options arg, NOT the body.
await client.terminal.sessions.paste(
  { text: 'echo PASTED_TEXT', bracketed: false },
  { terminal_id: '101' },
  slot,
);
```

**Step 2 — press Enter, wait for the screen to go stable, snapshot + regex-find.**

```typescript
await client.terminal.sessions.pressKeys({ keys: ['enter'] }, { terminal_id: '101' }, slot);
await client.terminal.sessions.wait(
  { mode: 'stable', debounce_ms: 500, timeout_ms: 3000 },
  { terminal_id: '101' },
  slot,
);
const snap = await client.terminal.sessions.getSnapshot({ terminal_id: '101' }, slot);
const hits = await client.terminal.sessions.search({ terminal_id: '101', pattern: 'PASTED' }, slot);
```

**Step 3 — discover what keys you can press** (named keys differ per kit build):

```typescript
const keys = await client.terminal.keys.list();
```

Cleanup: `await client.terminal.sessions.delete('101', undefined, slot)`.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL on the session's `terminal-N` host, `terminal_id` in query, subprotocol `tty`. Right after the socket opens, send the initial JSON dimensions message; the server starts sending output after it. Server frames start with a type byte: ASCII `'0'` (`0x30`) marks PTY output, followed by the raw PTY bytes, ANSI escape sequences included, not a rendered screen (read that with the snapshot, as in example 3). Inject input via REST `/write` or `/press`.

```typescript
const slot = { serviceIndex: 102 }; // _templateVars: routes every call to terminal-102
await client.terminal.sessions.create({ terminal_id: '102' }, slot);
// Generated WS wrapper exposes connect()/sendJsonData()/sendInput()/onOutput()/onDisconnect()/onError()/close()
const ws = await client.terminal.sessions.connect({ terminal_id: '102', readonly: true }, slot);
ws.onOutput((buf) => process.stdout.write(buf));   // callback receives Uint8Array directly
await ws.connect();                                 // the wrapper does not auto-connect
ws.sendJsonData({ command: '{', columns: 120, rows: 30 }); // initial dimensions message
await client.terminal.sessions.write({ input: 'echo VIA_WRITE' }, { terminal_id: '102' }, slot); // enter defaults to true
```

`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `sessions.delete('102')`.

### 5. Computer introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness.

```typescript
const res = await client.terminal.system.getStats();
const procs = await client.terminal.processes.list({ limit: 5 });
const ports = await client.terminal.system.listPorts();
const disp = await client.terminal.system.listDisplays();
const cfg = await client.terminal.system.listDaemonPrograms();
const init = await client.terminal.processes.get(1);
```

Warning: `system.reboot` and `system.shutdown` exist on the same surface — don't call them on a shared dev computer, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. For this `sessions.create` example, pass the display as a string (`display: '10'`) so the kit exports `DISPLAY=:10`; `sessions.create` does not derive it from `terminal_id`.

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```typescript
const slot = { serviceIndex: 10 }; // _templateVars: routes every call to terminal-10
await client.terminal.sessions.create({ terminal_id: '10', display: '10' }, slot);
await client.terminal.commands.run({ command: 'xeyes &', wait: true }, { terminal_id: '10' }, slot);
```

**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```typescript
const displays = await client.terminal.system.listDisplays();
// data is typed Record<string, unknown>[]; each entry describes one display
const list = displays.data as unknown as Array<{ display: string | number; windows?: unknown[] }>;
const ten = list.find(d => String(d.display) === '10');
console.log(ten?.windows?.length ?? 0); // above 0 once xeyes has opened its window
// then drive via client.display.*({ ... }, { displayId: 10 })
```

Cleanup: kill `xeyes` via `processes.signal { name: 'xeyes', signal: 'SIGTERM' }` or use `sessions.delete('10')` to end the shell and its GUI programs, unless they detached with `setsid` or `nohup`. Display `:10` keeps running; end it with `system.stopDisplay(10)` when nothing else uses it.

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the computer's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```typescript
const slot = { serviceIndex: 11 }; // _templateVars: routes every call to terminal-11
const sshPassword = process.env.SSH_PASSWORD;
if (!sshPassword) throw new Error('Set SSH_PASSWORD');
await client.terminal.sessions.create({
  terminal_id: '11', shell: 'ssh',
  ssh_host: 'ssh.example.com', ssh_user: 'deploy', ssh_port: '22', ssh_password: sshPassword,
}, slot);
await client.terminal.commands.run({ command: 'hostname; whoami', wait: true }, { terminal_id: '11' }, slot);
```

An SSH session always answers `commands.run` asynchronously, even with `wait: true`: read `command_id` from the response and poll `commands.get`. 

To route the SSH connection through a SOCKS5 proxy, keep `ssh_host` and `ssh_user` and add `socks5_host` / `socks5_port` (plus `socks5_user` / `socks5_pass` if the proxy needs credentials); SOCKS5 fields without `ssh_host` and `ssh_user` are rejected. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with body `wait: false`** so the request does not wait for the agent to finish while it stays alive in the PTY. The `cwd` must already exist: `sessions.create` has no auto-create option and fails on a missing directory. To have the kit create it, skip `sessions.create` and let `commands.run` create the session, passing `cwd` and `cwd_auto_create=true` with the pinned `terminal_id`:

```typescript
const slot = { serviceIndex: 50 }; // _templateVars: routes every call to terminal-50
// No sessions.create: this call creates session 50 and its missing working directory.
await client.terminal.commands.run(
  { command: 'sleep 600; echo agent-stopped', wait: false },
  { terminal_id: '50', shell: 'bash', cwd: '/home/user/agent', cwd_auto_create: true },
  slot,
);
```

**Step 2 — reattach later** — same `terminal_id`, WS or REST, multiplayer:

```typescript
const ws = await client.terminal.sessions.connect({ terminal_id: '50' }, slot);
ws.onOutput((buf) => process.stdout.write(buf));
await ws.connect();                                 // the wrapper does not auto-connect
ws.sendJsonData({ command: '{', columns: 120, rows: 30 }); // initial dimensions message
const snap = await client.terminal.sessions.getSnapshot({ terminal_id: '50' }, slot);
```

Warning: Body `wait: false` returns `status:"queued"` or `"running"` without waiting for completion (NOT `"completed"`) because the kit tracks the command, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `sessions.read` / `sessions.getSnapshot`. **Never** start a durable agent with `ephemeral=true`: once an ephemeral session sits inactive with no attached client, the periodic cleanup force-kills its process (after 60 s by default, or after `ephemeral-result-timeout`, 300 s by default, when it holds results).

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` has exited and been reaped by its parent. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```typescript
const slot = { serviceIndex: 60 }; // _templateVars: routes every call to terminal-60
await client.terminal.sessions.create({ terminal_id: '60' }, slot);
await client.terminal.commands.run(
  { command: 'echo build-finished; ./run-tests.sh', wait: true },
  { terminal_id: '60', defer_pid: 12345 },
  slot,
);
```

`defer_pid` does not wait for the command to finish even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits (its `/proc/<pid>` entry is gone: a process that has exited but whose parent has not reaped it still counts as running until `defer_timeout_ms` passes). The wait is bounded by `defer_timeout_ms` (60000 ms default): set it explicitly for longer builds, because on expiry the command is marked timed out (exit code 124) and never runs. A PID that is already gone, or a `defer_start_time_ticks` that does not match the running process, runs the command immediately; pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (body `wait: false`), capture `command_id`.**

```typescript
const slot = { serviceIndex: 70 }; // _templateVars: routes every call to terminal-70
await client.terminal.sessions.create({ terminal_id: '70' }, slot);
const r = await client.terminal.commands.run({ command: 'sleep 120', wait: false }, { terminal_id: '70' }, slot);
const cid = r.data!.command_id;
```

**Step 2 — abort** the command tracker. The default sends Ctrl+C (SIGINT) to the foreground process group, and the session's shell survives. `{ force: true }` as the second argument sends SIGKILL to the shell's process group, which kills the session's shell; the command's own group then gets the kernel's hangup, and a command that ignores hangup keeps running (find it with `processes.list` and stop it with `processes.signal` by `pid`), so use it only when the interrupt did not stop the command.

```typescript
await client.terminal.commands.cancel(cid, undefined, slot);
```

**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `processes.signal` by name. Targets every process matching the name.

```typescript
await client.terminal.processes.signal({ name: 'sleep', signal: 'SIGTERM' });
```

Cleanup: `sessions.delete('70')`. Warning: Never call `system.shutdown` / `system.reboot` to recover from a hung command — they stop every process in the computer and wipe in-memory state.

## Reference

**Accessor:** `client.terminal`  |  **Import:** `import * as terminal from 'hoody-sdk/terminal'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.terminal.commands.cancel()` returns `Promise<TerminalCommandsCancelResponse>`. `data` is the request body; it has a row only where the row says more than the signature.

**Services** (the ones the notes and examples above call most come first):

- `client.terminal.sessions`: captureScreenshot, connect, create, delete, getAutomationStatus, getSnapshot, list, paste, pressKeys, read, reportDiagnostics, search, sendMouseEvents, wait, write, saveScreenshot, createSsh, createLocal, createDesktop
- `client.terminal.commands`: cancel, get, list, run, runSsh
- `client.terminal.system`: getStats, listDaemonPrograms, listDisplays, listPorts, reboot, shutdown, stopDisplay
- `client.terminal.processes`: get, list, pause, resume, signal
- `client.terminal.keys`: list
- `client.terminal.drops`: create, finalize, send, writeChunk
- `client.terminal.kit`: getAutomationStats, getCapabilities, getHealth
- `client.terminal.workloads`: list, signal

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

### `client.terminal.sessions` (15) — Terminal session I/O and lifecycle

**Shared parameters of `client.terminal.sessions`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID. On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |

#### `captureScreenshot` — Capture terminal screenshot

```typescript
client.terminal.sessions.captureScreenshot(options?: { terminal_id?: string; format?: "png" | "jpeg" | "gif"; foreground?: string; background?: string; fontsize?: number; save?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |
| `format` | `"png" \| "jpeg" \| "gif"` | query | No | Output format: png, jpeg, gif (default: png) |
| `foreground` | `string` | query | No | Foreground color: black, red, green, yellow, blue, magenta, cyan, white, or RGB (R,G,B,A) (default: white) |
| `background` | `string` | query | No | Background color: same as foreground options (default: black) |
| `fontsize` | `number` | query | No | Font size in pixels (default: 20) |
| `save` | `boolean` | query | No | Save to storage directory (default: true) |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/terminal/screenshot`
**CLI:** `hoody terminal sessions screenshots capture <terminal-id>`

---

#### `connect` — WebSocket terminal connection

```typescript
client.terminal.sessions.connect(options?: { terminal_id?: string; readonly?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string[]; display?: string; pid?: number; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; socks5_pass?: string; ssh_key?: string; display_id?: string; ephemeral?: boolean; reset?: boolean; startup_script?: string; env_inject?: boolean; desktop?: boolean; desktop_env?: "xfce" | "mate" | "vm"; debug?: boolean; welcome?: boolean; agent?: boolean; onboarding?: boolean; arg?: string }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535; an id with no session yet must be 1-9999, a higher one is refused). Omitted, the connection joins the shared terminal "1" that every client without a terminal_id uses; with ephemeral=true it instead gets a fresh ID in 5001-7999, reported in the SET_TERMINAL_ID frame. A value that is present but malformed is refused, never mapped to "1". 0 (the terminal-0 host) only starts a fresh ephemeral session: without ephemeral=true (or in agent mode) the connection is refused, never mapped to "1". Multiple clients can share by using the same ID. On connections routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |
| `readonly` | `boolean` | query | No | Enable read-only mode for this client (blocks keyboard input) - Use 'true', '1', or no value |
| `cwd` | `string` | query | No | Working directory for new sessions |
| `cwd_auto_create` | `boolean` | query | No | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | query | No | Shell to use (bash, zsh, fish, tmux, ssh, etc.) |
| `user` | `string` | query | No | System user to spawn shell as (requires permissions) |
| `cmd` | `string` | query | No | Base64-encoded command (ignored on a server without -W, by agent sessions and by daemon-program terminals). With no shell running yet it becomes the session's initial command, run once when the shell starts (the first connection that sets it wins); on a shell that already runs it is typed into that shell on every connection that carries it, except from a readonly client, whose cmd is then ignored |
| `env` | `string[]` | query | No | Environment variable KEY=VALUE (repeatable) |
| `display` | `string` | query | No | DISPLAY variable for X11 apps (auto-formats :N) |
| `pid` | `number` | query | No | Attach to existing process PID for monitoring |
| `ssh_host` | `string` | query | No | SSH server hostname/IP for remote connections |
| `ssh_user` | `string` | query | No | SSH username (required if ssh_host provided) |
| `ssh_port` | `string` | query | No | SSH port (default: 22) |
| `ssh_password` | `string` | query | No | SSH password (use with caution) |
| `socks5_host` | `string` | query | No | SOCKS5 proxy for SSH |
| `socks5_port` | `string` | query | No | SOCKS5 port (default: 1080) |
| `socks5_user` | `string` | query | No | SOCKS5 proxy username (alphanumeric with _-. characters) |
| `socks5_pass` | `string` | query | No | SOCKS5 proxy password (shell-dangerous characters are refused) |
| `ssh_key` | `string` | query | No | Base64-encoded SSH private key for key authentication (alternative to ssh_password) |
| `display_id` | `string` | query | No | Alias of display; when both are sent, display wins |
| `ephemeral` | `boolean` | query | No | Throwaway session: without a terminal_id a fresh ID in 5001-7999 is allocated instead of joining shared terminal "1"; the display environment is not inherited, a cmd= command exits the shell when it finishes, and the idle session is cleaned up. Accepts true, 1 or yes (default: false). Ignored with agent=true |
| `reset` | `boolean` | query | No | Tear down the session's running process (or SSH / PID attachment) and start a fresh one before this client joins. Accepts true, 1 or a bare flag (default: false) |
| `startup_script` | `string` | query | No | Absolute path of a script to run before the shell starts; relative paths and paths containing ".." are ignored. Ignored with agent=true |
| `env_inject` | `boolean` | query | No | Inject the HOODY_* environment variables into the spawned shell (default: true; only false or 0 disables it) |
| `desktop` | `boolean` | query | No | Enable Hoody Display desktop mode: the viewer shows the whole display as one screen instead of each window on its own. It starts no window manager and no desktop environment; set `desktop_env` (xfce, mate, vm) for one with a window manager (default: false). Ignored with agent=true |
| `desktop_env` | `"xfce" \| "mate" \| "vm"` | query | No | Desktop environment for desktop mode; implies desktop=true. `vm` is for a hoody-vm display: openbox with hoody-vm's configuration, which binds no keys or mouse buttons so every key and click reaches the VM, and keeps QEMU's window undecorated and maximised. Other values are ignored. Not started again when a window manager already runs on the display; it keeps running after the session is deleted (POST /api/v1/system/displays/{display}/stop ends it) |
| `debug` | `boolean` | query | No | Sets TTYD_DEBUG=true in the shell environment (default: false) |
| `welcome` | `boolean` | query | No | Show the Hoody welcome banner when the shell starts. Default: true on a connection through a terminal-N edge proxy hostname (the proxy adds welcome=true when you do not send it), false when calling the terminal service directly. Send welcome=false to turn it off |
| `agent` | `boolean` | query | No | Launch the server-configured Hoody Agent TUI instead of a shell. A locked-down mode: shell, cmd, user, ssh_*, pid, startup_script, desktop and ephemeral are ignored (default: false) |
| `onboarding` | `boolean` | query | No | With agent=true, start the agent's first-run onboarding (default: false) |
| `arg` | `string` | query | No | Command-line argument for the shell, repeatable and kept in order. Accepted only when URL arguments are enabled on this server; ignored otherwise |

**Returns:** `Promise<TerminalSessionsConnectWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/terminal/ws`

---

#### `create` — Create a terminal session

```typescript
client.terminal.sessions.create(data: TerminalSessionsCreateRequest)
```

**Body:** `{ terminal_id: string, exclusive: bool, ephemeral: bool, display: string, shell: string, user: string, cwd: string, startup_script: string, welcome: bool, debug: bool, desktop: bool, desktop_env: string, cols: int, rows: int, wait_until_display: bool, wait_timeout: int, ssh_host: string, ssh_user: string, ssh_port: string, ssh_password: string, ssh_key: string, socks5_host: string, socks5_port: string, socks5_user: string, socks5_pass: string }`

- `terminal_id` — Terminal session ID (numeric; a new session needs 1-9999, an existing one up to 65535). On the terminal-0 host only an ephemeral session can be created. Sent only here: the method has no `terminal_id` query option.
- `exclusive` — Only create a new session: when the terminal id already has a session (running or not) or belongs to a daemon program, answer 409 SESSION_EXISTS and change nothing (default: false)
- `wait_until_display` — … No wait when no display server holds the display and none can be started on this box: the session is created, the answer comes at once with display_ready false, and its message says the display cannot be started here
- `wait_timeout` — Timeout in seconds for waiting (default: 300, capped at 300). When it elapses the answer is status error, code timeout; the session itself keeps running
- `ssh_host` — SSH hostname/IP. Required together with ssh_user for SSH sessions.
- `ssh_user` — SSH username. Required together with ssh_host for SSH sessions.
- `ssh_password` — SSH password. Cannot contain shell-dangerous characters.

**HTTP:** `POST /api/v1/terminal/create`
**CLI:** `hoody terminal sessions create`

---

#### `delete` — Delete a terminal session

```typescript
client.terminal.sessions.delete(terminal_id: string, options?: { incarnation?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID to delete (numeric 1-65535). edge proxy cannot fill this path segment: supply it explicitly even on hostname-routed calls, and it must name the host's terminal: a path id that differs from the query terminal_id (N on a terminal-N host) is refused with 400 TERMINAL_ID_MISMATCH. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |
| `incarnation` | `string` | query | No | Delete only while the session's shell has this incarnation (32 lowercase hex characters); otherwise 409 INCARNATION_MISMATCH and nothing is deleted. Pending tracked workloads of that incarnation are closed without starting; running ones keep running and stay readable and signallable |

**HTTP:** `DELETE /api/v1/terminal/{terminal_id}`
**CLI:** `hoody terminal sessions delete <terminal-id>`

---

#### `getAutomationStatus` — Get per-session automation state

```typescript
client.terminal.sessions.getAutomationStatus(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID. edge proxy cannot fill this path segment: supply it explicitly even on hostname-routed calls, and it must name the host's terminal: a path id that differs from the query terminal_id (N on a terminal-N host) is refused with 400 TERMINAL_ID_MISMATCH |

**HTTP:** `GET /api/v1/terminal/{terminal_id}/automation`
**CLI:** `hoody terminal sessions automation status <terminal-id>`

---

#### `getSnapshot` — Get rendered terminal snapshot

```typescript
client.terminal.sessions.getSnapshot(options?: { terminal_id?: string; include_colors?: boolean; include_highlights?: boolean; scroll_offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |
| `include_colors` | `boolean` | query | No | Include ANSI SGR colored_lines array alongside plain text lines. Default: false |
| `include_highlights` | `boolean` | query | No | Include reverse-video highlight spans. Default: true |
| `scroll_offset` | `number` | query | No | Lines into scrollback (0 = live viewport). Default: 0 |

**HTTP:** `GET /api/v1/terminal/snapshot`
**CLI:** `hoody terminal sessions snapshot get <terminal-id>`

---

#### `list` — List all terminal sessions

```typescript
client.terminal.sessions.list(options?: { history_limit?: number; history_lines?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `history_limit` | `number` | query | No | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `number` | query | No | Alias of history_limit |

**HTTP:** `GET /api/v1/terminal/sessions`
**CLI:** `hoody terminal sessions list`

---

#### `paste` — Paste text into terminal

```typescript
client.terminal.sessions.paste(data: TerminalSessionsPasteRequest, options?: { terminal_id?: string })
```

**Body:** `{ text*: string, bracketed: bool }`

- `text` — Text to paste (UTF-8, not empty: an empty string is refused with 400)

**HTTP:** `POST /api/v1/terminal/paste`
**CLI:** `hoody terminal sessions paste <terminal-id> --text <text>`

---

#### `pressKeys` — Send named key presses to terminal

```typescript
client.terminal.sessions.pressKeys(data: TerminalSessionsPressKeysRequest, options?: { terminal_id?: string })
```

**Body:** `{ keys: string[], key: string }`

- `keys` — Array of 1 to 256 key names to press in sequence (e.g. ["ctrl+c", "arrow_up", "enter"]). Mutually exclusive with `key`. An empty array is refused with 400.
- `key` — Single key name for one-shot press (e.g. "enter"). Mutually exclusive with `keys`

**HTTP:** `POST /api/v1/terminal/press`
**CLI:** `hoody terminal sessions keys press <terminal-id>`

---

#### `read` — Get raw terminal output

```typescript
client.terminal.sessions.read(options?: { terminal_id?: string; format?: "download" | "text" | "html"; tail?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535, defaults to "1" if not provided). On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. 0 (the terminal-0 host) names no terminal to read and is refused with 400 TERMINAL_ID_ZERO. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |
| `format` | `"download" \| "text" \| "html"` | query | No | Output format: download, text, or html (defaults to "download" if not provided) |
| `tail` | `number` | query | No | Return only the last N lines of output |

**Returns:** `Promise<ApiResponse<ArrayBuffer | string>>`  |  **HTTP:** `GET /api/v1/terminal/raw`
**CLI:** `hoody terminal sessions read`

---

#### `reportDiagnostics` — Client render/connection diagnostics beacon

```typescript
client.terminal.sessions.reportDiagnostics(data?: TerminalSessionsReportDiagnosticsRequest)
```

**Body:** `{ build_id: string, renderer: string, reason: string }`

**HTTP:** `POST /api/v1/terminal/state`

---

#### `search` — Search terminal screen with regex

```typescript
client.terminal.sessions.search(options: { pattern: string; terminal_id?: string; scope?: "screen" | "scrollback" | "all"; limit?: number; case_insensitive?: boolean; scroll_offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pattern` | `string` | query | Yes | PCRE2 regex pattern to search for (max 1024 bytes) |
| `scope` | `"screen" \| "scrollback" \| "all"` | query | No | Search scope: screen (default), scrollback, or all |
| `limit` | `number` | query | No | Maximum number of hits to return, from 1 to 1000 (default 100). A value outside that range is refused with 400 |
| `case_insensitive` | `boolean` | query | No | Case-insensitive matching. Default: false |
| `scroll_offset` | `number` | query | No | Scrollback offset for screen scope (0 = live viewport), from 0 to 2147483647. A value outside that range is refused with 400. Default: 0 |

**HTTP:** `GET /api/v1/terminal/find`
**CLI:** `hoody terminal sessions search <terminal-id> --pattern <pattern>`

---

#### `sendMouseEvents` — Send cell-based mouse events to terminal

```typescript
client.terminal.sessions.sendMouseEvents(data: TerminalSessionsSendMouseEventsRequest, options?: { terminal_id?: string })
```

**Body:** `{ event: TerminalMouseEvent, events: TerminalMouseEvent[] } (exactly one of: event | events required)`

**HTTP:** `POST /api/v1/terminal/mouse`
**CLI:** `hoody terminal sessions mouseevents send <terminal-id>`

---

#### `wait` — Wait for terminal condition

```typescript
client.terminal.sessions.wait(data: TerminalSessionsWaitRequest, options?: { terminal_id?: string })
```

**Body:** `{ mode: string, debounce_ms: int, pattern: string, timeout_ms: int, search_scope: string, include_colors: bool, include_highlights: bool, after_seq: int, fresh: bool }`

- `debounce_ms` — Stable mode debounce in milliseconds (10-60000). Default: 100
- `pattern` — PCRE2 regex pattern (required for regex/either modes, max 1024 bytes)
- `timeout_ms` — Hard deadline in milliseconds (10-300000). Default: 5000
- `after_seq` — Regex and either modes: only rows changed after this seq can match, so a prompt already on screen is ignored unless its row changes (typing on it does); anchor the pattern (`>>> $`). … A non-negative integer no larger than the terminal's current seq. …

**HTTP:** `POST /api/v1/terminal/wait`
**CLI:** `hoody terminal sessions wait <terminal-id>`

---

#### `write` — Write input to terminal

```typescript
client.terminal.sessions.write(data?: TerminalSessionsWriteRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID to write to. On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |

**Body:** `{ input*: string, enter: bool }`

**HTTP:** `POST /api/v1/terminal/write`
**CLI:** `hoody terminal sessions write <terminal-id> --input <input>`

---

#### `saveScreenshot` — Capture a terminal screenshot and save it to the computer filesystem.

```typescript
client.terminal.sessions.saveScreenshot(path?: string, options?: Omit<SaveScreenshotOptions, 'source' | 'path'>)
```

**Returns:** `Promise<SaveScreenshotResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `createSsh` — Create an SSH terminal session.

```typescript
client.terminal.sessions.createSsh(options: SshTerminalOptions)
```

**Returns:** `Promise<TerminalCreateResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `createLocal` — Create a local terminal session (bash/zsh/fish).

```typescript
client.terminal.sessions.createLocal(options?: LocalTerminalOptions)
```

**Returns:** `Promise<TerminalCreateResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `createDesktop` — Create a desktop terminal session with X11 display.

```typescript
client.terminal.sessions.createDesktop(options: DesktopTerminalOptions)
```

**Returns:** `Promise<TerminalCreateResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.terminal.commands` (4) — Commands run in terminal sessions

#### `cancel` — Abort a running command

```typescript
client.terminal.commands.cancel(command_id: string, data?: TerminalCommandsCancelRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | The command ID returned by the execute endpoint (numeric 1-65535) |

**Body:** `{ force: bool }`

**HTTP:** `POST /api/v1/terminal/execute/{command_id}/abort`
**CLI:** `hoody terminal commands cancel <command-id>`

---

#### `get` — Get command result

```typescript
client.terminal.commands.get(command_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | Command ID returned from /api/v1/terminal/execute (numeric 1-65535) |

**HTTP:** `GET /api/v1/terminal/result/{command_id}`
**CLI:** `hoody terminal commands get <command-id>`

---

#### `list` — Get terminal command history

```typescript
client.terminal.commands.list(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID (numeric 1-65535, can also be provided as query parameter). edge proxy injects only the query form on hostname-routed calls, so this path segment must always be supplied explicitly, and it must name the host's terminal: a path id that differs from the query terminal_id (N on a terminal-N host) is refused with 400 TERMINAL_ID_MISMATCH. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |

**HTTP:** `GET /api/v1/terminal/history/{terminal_id}`
**CLI:** `hoody terminal commands list <terminal-id>`

---

#### `run` — Execute command in terminal session

```typescript
client.terminal.commands.run(data: TerminalCommandsRunRequest, options?: { terminal_id?: string; ephemeral?: boolean; defer_pid?: number; defer_start_time_ticks?: string; defer_timeout_ms?: number; defer_poll_ms?: number; reset?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string[]; skip_display_wait?: boolean; display_wait_timeout?: number; display?: string; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; ssh_key?: string; socks5_pass?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric; a new session needs 1-9999, an existing one up to 65535). Required unless ephemeral=true, in which case it is auto-generated if not provided. On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and OVERWRITES any value you send (a ?terminal_id=0 query sentinel never survives the proxy). Use the terminal-0 hostname as the "no terminal ID" sentinel so ephemeral=true can auto-generate; supply this parameter directly only when calling the terminal service without the proxy |
| `ephemeral` | `boolean` | query | No | When true, auto-generates a unique terminal_id (if not provided), skips display/dbus initialization, and applies aggressive cleanup. Designed for programmatic CLI command execution like a scripted command runner (default: false). WARNING: Do NOT use ephemeral=true for GUI applications that require a display. Ephemeral sessions strip the DISPLAY environment variable, which means X11/GUI applications will not work. Use a regular terminal session with an explicit terminal_id and display parameter instead for GUI workloads. A terminal_id that names a running terminal with a display is refused with 409 PERSISTENT_SESSION rather than turned ephemeral; on a terminal-N host the proxy sets terminal_id=N, so send ephemeral commands to the terminal-0 host |
| `defer_pid` | `number` | query | No | Defer command injection until this PID exits (TUI-safe). With defer_pid the response does not wait for completion even when wait=true (session setup and display readiness can still delay it) |
| `defer_start_time_ticks` | `string` | query | No | Optional /proc/<pid>/stat field 22 (starttime in clock ticks since boot) to avoid PID reuse bugs. If it mismatches, command executes immediately |
| `defer_timeout_ms` | `number` | query | No | Max time to wait for defer_pid exit before failing (default: 60000) |
| `defer_poll_ms` | `number` | query | No | Poll interval while waiting for defer_pid exit (default: 50, minimum: 10) |
| `reset` | `boolean` | query | No | Reset existing session and reconfigure (kills current process, clears state, allows switching from bash to SSH or changing any parameter) - Use 'true', '1', or no value |
| `cwd` | `string` | query | No | Working directory for local bash sessions (ignored for SSH). In raw mode: the command's working directory, when the body has no cwd |
| `cwd_auto_create` | `boolean` | query | No | Auto-create cwd when the requested working directory does not exist yet. Applies when cwd is explicitly provided for a new or reset local session, and to a command run with mode raw. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | query | No | Shell to use for local sessions: bash (case-insensitive), zsh, fish, sh, etc. (default: server startup command, only applies to new sessions or after reset) |
| `user` | `string` | query | No | System user to spawn shell as (requires su permissions, only applies to new sessions or after reset). In raw mode: the user the command runs as, when the body has no user |
| `cmd` | `string` | query | No | Base64-encoded command to execute automatically on spawn (executes once when the shell starts; ignored on an active session unless reset is true) |
| `env` | `string[]` | query | No | Environment variable in KEY=VALUE format (can be repeated for multiple variables, e.g., ?env=DEBUG=1&env=API_KEY=abc) |
| `skip_display_wait` | `boolean` | query | No | Skip waiting for Hoody Display readiness before executing command. By default, if a DISPLAY is configured, the request waits until the session's display server is ready, unless no X server holds the display and none can be started, or a wait for it already timed out on the same shell within the last 30 seconds. Commands of one terminal still run in arrival order, so a request with skip_display_wait=true runs after earlier ones still waiting (default: false) |
| `display_wait_timeout` | `number` | query | No | Timeout in seconds for display readiness wait, counted from the request (default: 10, capped at 10 seconds; values <=0 or malformed also map to the 10-second cap). When it elapses the command runs anyway. Ignored if skip_display_wait=true |
| `display` | `string` | query | No | DISPLAY environment variable for X11 applications (auto-formats :display if number provided, e.g., ?display=1 becomes DISPLAY=:1) |
| `ssh_host` | `string` | query | No | SSH server hostname or IP address (creates SSH session if provided with ssh_user) |
| `ssh_user` | `string` | query | No | SSH username (required if ssh_host is provided) |
| `ssh_port` | `string` | query | No | SSH port number (default: 22) |
| `ssh_password` | `string` | query | No | SSH password for authentication (use with caution, prefer key-based auth) |
| `socks5_host` | `string` | query | No | SOCKS5 proxy hostname for SSH connection |
| `socks5_port` | `string` | query | No | SOCKS5 proxy port (default: 1080) |
| `socks5_user` | `string` | query | No | SOCKS5 proxy username for authentication |
| `ssh_key` | `string` | query | No | Base64-encoded SSH private key for key-based authentication (prefer over password-based auth) |
| `socks5_pass` | `string` | query | No | SOCKS5 proxy password for authentication |

**Body:** `{ command*: string, mode: "pty" | "raw", stdin_b64: string, user: string, id: string, timeout: number, wait: bool, cwd: string, require_staged: bool, track: bool, incarnation: string, track_label: string, env: object }`

**HTTP:** `POST /api/v1/terminal/execute`
**CLI:** `hoody terminal commands run --command <command>`

---

#### `runSsh` — Run a command on a remote SSH server.

```typescript
client.terminal.commands.runSsh(options: SshExecOptions)
```

**Returns:** `Promise<SshExecResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.terminal.system` (7) — OS-level operations

#### `getStats` — Get system resources and statistics

```typescript
client.terminal.system.getStats()
```

**HTTP:** `GET /api/v1/system/resources`
**CLI:** `hoody terminal system stats`

---

#### `listDaemonPrograms` — Get daemon programs configuration

```typescript
client.terminal.system.listDaemonPrograms()
```

**HTTP:** `GET /api/v1/system/daemon`
**CLI:** `hoody terminal system daemonprograms list`

---

#### `listDisplays` — Get display information

```typescript
client.terminal.system.listDisplays()
```

**HTTP:** `GET /api/v1/system/displays`
**CLI:** `hoody terminal system displays list`

---

#### `listPorts` — List all listening network ports

```typescript
client.terminal.system.listPorts(options?: { protocol?: string; user?: string; port?: number; ip?: string; skip_program?: string; http_only?: boolean; hoody_only?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `protocol` | `string` | query | No | Filter by protocol: `tcp` or `udp` (one value; omit it for both) |
| `user` | `string` | query | No | Filter by user (exact match) |
| `port` | `number` | query | No | Filter by specific port number |
| `ip` | `string` | query | No | Filter by IP address (comma-separated list) |
| `skip_program` | `string` | query | No | Exclude specific programs (comma-separated list) |
| `http_only` | `boolean` | query | No | Only return HTTP services |
| `hoody_only` | `boolean` | query | No | Only return Hoody Kit services |

**HTTP:** `GET /api/v1/system/ports`
**CLI:** `hoody terminal system ports list`

---

#### `reboot` — Reboot the system

```typescript
client.terminal.system.reboot(options?: { delay?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delay` | `number` | query | No | Delay in seconds before reboot, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**HTTP:** `POST /api/v1/system/reboot`
**CLI:** `hoody terminal system reboot`

---

#### `shutdown` — Shutdown the system

```typescript
client.terminal.system.shutdown(options?: { delay?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delay` | `number` | query | No | Delay in seconds before shutdown, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**HTTP:** `POST /api/v1/system/shutdown`
**CLI:** `hoody terminal system shutdown`

---

#### `stopDisplay` — Stop a display

```typescript
client.terminal.system.stopDisplay(display: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `display` | `number` | path | Yes | Display number (the N in :N), 0-65535 |

**HTTP:** `POST /api/v1/system/displays/{display}/stop`
**CLI:** `hoody terminal system displays stop <display>`

---

### `client.terminal.processes` (5) — System process introspection and signalling

#### `get` — Get process details by PID

```typescript
client.terminal.processes.get(pid: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pid` | `number` | path | Yes | Process ID |

**HTTP:** `GET /api/v1/system/processes/{pid}`
**CLI:** `hoody terminal processes get <pid>`

---

#### `list` — List all system processes

```typescript
client.terminal.processes.list(options?: { sort?: "cpu" | "memory" | "pid" | "name"; limit?: number; filter?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `sort` | `"cpu" \| "memory" \| "pid" \| "name"` | query | No | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `number` | query | No | Maximum number of processes to return (default: 1000) |
| `filter` | `string` | query | No | Keep processes whose name or command line contains this text (case-sensitive) |

**HTTP:** `GET /api/v1/system/processes`
**CLI:** `hoody terminal processes list`

---

#### `pause` — Freeze (SIGSTOP) a process or process tree

```typescript
client.terminal.processes.pause(data: TerminalProcessesPauseRequest)
```

**Body:** `{ pid: int, name: string, include_descendants: bool }`

- `pid` — Process ID to freeze (mutually exclusive with name). PIDs 1 (init), 2 (kthreadd), the server's own PID, and the server's parent PID are guarded (freezing them would wedge the host or the daemon) and are rejected with 403.
- `name` — Process name (case-insensitive `comm` match that freezes EVERY matching process; mutually exclusive with pid). NOTE: Linux truncates `comm` to TASK_COMM_LEN-1 = 15 chars; a name longer than 15 characters silently matches nothing.

**HTTP:** `POST /api/v1/system/processes/freeze`
**CLI:** `hoody terminal processes pause`

---

#### `resume` — Unfreeze (SIGCONT) a process or process tree

```typescript
client.terminal.processes.resume(data: TerminalProcessesResumeRequest)
```

**Body:** `{ pid: int, name: string, include_descendants: bool }`

- `pid` — Process ID to unfreeze (mutually exclusive with name). The guarded-PID set (1, 2, self, parent) is the same as for freeze; calling unfreeze on a guarded PID returns 403.
- `name` — Process name (case-insensitive comm match; mutually exclusive with pid). NOTE: Linux truncates `comm` to 15 chars; longer names silently match nothing.

**HTTP:** `POST /api/v1/system/processes/unfreeze`
**CLI:** `hoody terminal processes resume`

---

#### `signal` — Send signal to process(es)

```typescript
client.terminal.processes.signal(data: TerminalProcessesSignalRequest)
```

**Body:** `{ pid: int, name: string, signal: string | int, force: bool }`

- `pid` — Process ID to signal (mutually exclusive with name)
- `name` — Process name to signal - signals ALL matching processes (mutually exclusive with pid)

**HTTP:** `POST /api/v1/system/process/signal`
**CLI:** `hoody terminal processes signal`

---

### `client.terminal.keys` (1) — Key names the terminal accepts

#### `list` — List supported key names for /press endpoint

```typescript
client.terminal.keys.list()
```

**HTTP:** `GET /api/v1/terminal/keys`
**CLI:** `hoody terminal keys list`

---

### `client.terminal.drops` (4) — Terminal Drag-and-Drop

**Shared parameters of `client.terminal.drops`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N edge proxy hostname, the proxy sets this from the hostname label and overwrites any value you send. Pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy. On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |

#### `create` — Begin a drag-and-drop staging transaction

```typescript
client.terminal.drops.create(options?: { terminal_id?: string })
```

**HTTP:** `POST /api/v1/terminal/drop-begin`

---

#### `finalize` — Finalize a drop and inject the OSC frame

```typescript
client.terminal.drops.finalize(data: TerminalDropsFinalizeRequest, options: { drop: string; token: string; terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `drop` | `string` | query | Yes | Drop id from /drop-begin |
| `token` | `string` | query | Yes | Drop token from /drop-begin |

**Body:** `{ ctx*: "drop" | "paste", r: int, c: int, cr: string, items*: { p*: string, d*: 0 | 1, s*: int, name: string, h: string }[] }`

**HTTP:** `POST /api/v1/terminal/drop-commit`

---

#### `send` — One-shot drop (begin + stage + commit)

```typescript
client.terminal.drops.send(data: TerminalDropsSendRequest, options?: { terminal_id?: string })
```

**Body:** `{ ctx*: "drop" | "paste", r: int, c: int, items*: { name*: string, b64: string, dir: bool, items: object[] }[] }`

**HTTP:** `POST /api/v1/terminal/drop`

---

#### `writeChunk` — Upload a raw file slice into a drop

```typescript
client.terminal.drops.writeChunk(data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { drop: string; token: string; path: string; offset: number; terminal_id?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `drop` | `string` | query | Yes | Drop id from /drop-begin |
| `token` | `string` | query | Yes | Drop token from /drop-begin |
| `path` | `string` | query | Yes | Relative path of the staged file: not empty, shorter than 1024 bytes, each component at most 255 bytes; absolute paths, `.` or `..` components, backslashes, control characters and DEL are refused with 400 DROP_INVALID_PATH |
| `offset` | `number` | query | Yes | Byte offset to write at (must equal the current staged size) |

**HTTP:** `POST /api/v1/terminal/upload`

---

### `client.terminal.kit` (3) — Agent-facing automation primitives: screen snapshot, regex find, named key presses, text paste, and async wait conditions backed by a server-side terminal emulator

#### `getAutomationStats` — Get terminal automation metrics

```typescript
client.terminal.kit.getAutomationStats()
```

**HTTP:** `GET /api/v1/terminal/automation/metrics`
**CLI:** `hoody terminal automation stats`

---

#### `getCapabilities` — Get the terminal service's features

```typescript
client.terminal.kit.getCapabilities()
```

**HTTP:** `GET /api/v1/terminal/capabilities`

---

#### `getHealth` — Service health check

```typescript
client.terminal.kit.getHealth()
```

**HTTP:** `GET /api/v1/terminal/health`
**CLI:** `hoody terminal health`

---

### `client.terminal.workloads` (2) — APIs for executing commands in terminal sessions and retrieving their results

#### `list` — List tracked workloads

```typescript
client.terminal.workloads.list(options?: { terminal_id?: string; incarnation?: string; command_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |
| `incarnation` | `string` | query | No | Only workloads of this shell incarnation (32 lowercase hex characters) |
| `command_id` | `string` | query | No | Only the workload with this command id (numeric 1-65535) |

**HTTP:** `GET /api/v1/terminal/workloads`

---

#### `signal` — Signal a tracked workload

```typescript
client.terminal.workloads.signal(command_id: string, data: TerminalWorkloadsSignalRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | The workload's command id (numeric 1-65535) |
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On a terminal-N edge proxy hostname, N must be at most 9999 and outside the numbers reserved for agent sessions; an existing id above that range (up to 65535) is reached only without the proxy. |

**Body:** `{ incarnation*: string, signal*: "INT" | "TERM" | "KILL" }`

**HTTP:** `POST /api/v1/terminal/workloads/{command_id}/signal`


### Body schemas

- `TerminalMouseEvent` — `{ type*: "move" | "down" | "up" | "click" | "scroll", row*: int, col*: int, button: int, amount: int, direction: "up" | "down", modifiers: ("shift" | "alt" | "meta" | "ctrl" | "control")[] }`

