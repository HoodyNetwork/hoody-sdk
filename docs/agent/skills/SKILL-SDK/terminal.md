> _**SDK skill · `terminal` namespace** · ~18,774 tokens · hoody-sdk v1.0.0-beta.16_

# `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket

## Purpose

Real PTY per container, numeric `terminal_id` (1–65535). REST + WebSocket. Multiplayer; sessions persist.

## When to use

- **Interactive TUIs** that paint the screen (Claude Code, Codex, vim, htop, less, fzf, ssh, etc.) — these need a real PTY; only `terminal` provides one.
- **Durable / long-lived programs that you may need to interact with later** (the agent you spawned, a coding assistant, a chat REPL) — pin a stable `terminal_id` (1–39999) and reattach over WS or REST. When it must be supervised (restarted on exit, started at boot), run it as a `daemon` program with `terminal_id` instead: its terminal is attached the same way (see "Daemon program terminals" below).
- Sequenced commands sharing shell state, keystroke automation, screen capture, regex-search the rendered buffer.
- SSH / SOCKS5 sessions (`ssh_*` / `socks5_*`).
- Host introspection (`system.*`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process. A session made by `sessions.create` renders on a display only when given `display: N` (the id never sets it); a session first created by `commands.run` takes its display from the request URL instead (see Quirks). Keeping ids distinct keeps each terminal-to-display pairing one-to-one. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `40000–65535`, and once one sits inactive with no attached WebSocket client it is removed and its process force-killed: after 60 s when it holds no results, otherwise after `ephemeral-result-timeout` (300 s default). Your Claude Code / Codex session would die at that point.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- A script that should be callable over HTTP → `exec`. (A one-off shell command fits `terminal` itself: ephemeral, workflow 2. When its logs must outlive the response, use `daemon.ephemeralPrograms.start`.)
- File I/O → `files`. GUI rendering → `display`. Schedule → `cron`.

## Prerequisites

- Container with `terminal` kit running; capability URL.
- SSH needs reachable `ssh_host:ssh_port`; automation needs existing `terminal_id`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Persistent interactive session

`sessions.create` (pin `terminal_id` or `ephemeral=true`) → `commands.run` (body `wait` defaults to `true` and asks for a synchronous result, but SSH sessions, `defer_pid` commands and a server at its concurrent-wait cap answer asynchronously — check `status` and poll `commands.get` by `command_id`; send body `wait: false` for an async `command_id`; shares shell state) → `commands.get` → `sessions.read`/`captureScreenshot` → `sessions.delete`. 

### 2. Ephemeral one-off execute

`commands.run` `ephemeral=true`, `wait=true` — auto ID 40000–65535, runs `command`, cleans up. Through the proxy, send it to the `terminal-0` hostname: any other `terminal-N` host pins the request to terminal N. Later: `commands.get` before the session goes: an ephemeral session holding results is removed after `ephemeral-result-timeout` (300 s default) of inactivity with no attached client.

### 3. Automate a TUI

`sessions.create` (or `commands.run` to launch) → `sessions.pressKeys` (`Down`/`Enter`/`F2`; `keys.list`) → `sessions.paste` (`bracketed=true`) → `sessions.wait` (`mode`: `stable`, `regex` with a `pattern`, or `either`) → `sessions.getSnapshot`/`sessions.search`.

### 4. Live stream — WebSocket

`sessions.connect` at `/api/v1/terminal/ws?terminal_id=…` on the session's `terminal-N` host. After the socket opens, the client must send the initial JSON dimensions message (`{"columns":…,"rows":…}`) before the server sends output. Multiple WS clients attach simultaneously; writes broadcast to PTY. Inject from REST via `write` or `sessions.pressKeys`. `commands.cancel` interrupts by `command_id`.

### 5. Container introspection

`processes.list`, `processes.get`, `processes.signal`, `listPorts`, `system.getStats`, `system.listDisplays`, `system.listDaemonPrograms`, `reboot`/`shutdown`. `processes.list` and `listPorts` answer in a single response with no pages (`processes.list` takes `limit`, `sort` and `filter`). Call `processes.list`, `system.listPorts` and `sessions.list` directly; each returns one response and has no paging helpers.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–39999, **never** the ephemeral range 40000–65535, **never** re-use one another program is on).
2. `sessions.create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/home/user'` (or wherever).
3. `commands.run` with body `command: 'claude'` (or `codex`, `aider`, `gemini …`) and body `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request. 
4. Reattach any time: `sessions.connect`, then connect and send the initial dimensions message (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or REST via `sessions.pressKeys` / `sessions.paste` to drive it.
5. Tear down only when really done: `sessions.delete(terminal_id)`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a container reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `1`, Codex on `2`). If a session needs a display, pass `display: N` explicitly on `sessions.create`; distinct ids keep that pairing one-to-one.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. **You must explicitly pair the IDs** — the kit injects `DISPLAY` from the JSON `display` field on `sessions.create`; there is no automatic `terminal_id ⇒ DISPLAY=:N` mapping.

1. `sessions.create` with a pinned `terminal_id` (e.g. `1`) AND a matching `display: "1"` field (string in the SDK type), so the kit exports `DISPLAY=:1` into the PTY.
2. From that session: `commands.run` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-1`.
3. Open the matching display kit URL — `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` (read `projectId`, `containerId`, and `server_name` from `containers.get`; the SDK exposes `getKitUrl('display', container, 1)` and `getKitUrls(container)` if you want to skip the string manipulation).
4. Drive the GUI via the `display` namespace:
   - `display.screenshots.capture` — see what's on screen (turn `base64` on for vision agents).
   - `display.input.click` `{ x, y, button }` — left/right click; `display.input.type` `{ x, y, text }` — click at a point, then type.
   - `display.windows.search` `{ pattern, name?: true, class?: true }` (a `pattern` plus booleans that pick the fields to match) → `display.windows.focus` / `display.windows.getGeometry` / `display.windows.getActive` to focus + locate.
   - `display.input.actMany` — bulk input replay; `display.input.wait` between actions.
5. Tear down: kill the X process via `processes.signal` from the terminal session, or `sessions.delete` to drop the whole shell + its child GUIs.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=1`↔`display:":1"`, `terminal_id=2`↔`display:":2"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, swap step 3 for the `desktop-<N>` alias (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-SDK.md`). The desktop alias auto-spawns the DE for you; this recipe is for spawning **specific** apps under your own control.

### 8. Daemon program terminals

A daemon program configured with `terminal_id: N` runs on terminal N's PTY, and terminal N belongs to it while the program is configured. Nothing spawns there: shell, cwd, user, env, display, `cmd` and `pid` parameters on that id are ignored.

1. Attach: `client.daemon.programs.attachTerminal(program, { readonly?, columns?, rows? })` on a container-scoped client resolves `{ terminalId, ws }`; `ws.disconnect()` leaves the program running. Every client sees the same screen, writable clients type into it (Ctrl-C goes to the program), and the program gets the smallest size among the writable clients (read-only clients count only when none is writable).
2. Drive without a WebSocket: snapshot, find, press, mouse, paste, write, wait, raw and screenshot connect to the program on demand. Execute and session create on the id answer `409 DAEMON_TERMINAL`: there is no shell to run a command in.
3. Program not running: the WebSocket closes `4404` `daemon program not running`; REST answers `409 DAEMON_PROGRAM_NOT_RUNNING`. Start it with the daemon, then attach again.
4. Program ends while attached: clients close with `4404` `daemon program ended`, and a pending wait answers `exited`. The next attach reaches the restarted instance on a clean screen.
5. `sessions.list` shows every program terminal, opened or not: `daemon_program: true`, `shell: null`, and a `daemon` object (`program_id`, `program_name`, `user`, `enabled`, `running`, `connected`, `ended`); `running` means its launcher is listening; `pid` is the terminal's session leader (the program runs under it) while connected, 0 otherwise, and `cols`/`rows` the terminal's current size (`null` until sized). A local shell already on the id stays listed as that shell (`daemon_program: false`, the program in `daemon`); delete it to reach the program.
6. `sessions.delete(N)` drops the terminal's connection to the program, not the program. A program that starts before anything attaches sees a 0x0 terminal size until the first attach or REST call.

## Quirks & gotchas

- **Sharing a terminal URL = handing out root.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as root: read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `proxy.containerPermissions`. Share only with people you'd trust with `ssh root@…`. For wider audiences, gate (`setPasswordGroup` / `setTokenGroup` / `setIpGroup`), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script over a live PTY (a `display` URL is no read-only alternative: its readonly setting is client-side only, and its holder can still send input).
- `terminal_id` numeric **1–65535**. **40000–65535 reserved for ephemeral**; pin manual IDs in 1–39999.
- `terminal_id=0` = sentinel "treat as absent".
- **Display pairing.** `sessions.create` builds the session's `DISPLAY` from its `display` field and ignores any `display` in the request URL, so there is no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). `commands.run` differs: a session it has to create is configured from the request URL, where `display=N` (or the `display_id=N` alias) sets `DISPLAY=:N` — and on a `terminal-N` host that parameter is supplied for you, so a session first created that way already renders on `:N`. `ephemeral=true` still strips it, and an already-running session keeps the `DISPLAY` it spawned with. The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` returns `/execute` immediately even with `wait=true`; queues until named PID exits (TUI-safe), for at most `defer_timeout_ms` (60000 ms default) — on expiry the command never runs.
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is plain UTF-8, not base64; only the URL-form `?cmd=<base64>` is base64-decoded.** The kit wraps the command with shell bookkeeping (optional `cd`, environment prefix, exit-code capture, completion-marker echo) before it reaches the PTY; for direct interactive input use `write`, `sessions.paste` or `sessions.pressKeys`.
- **`/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A `terminal_id` in the body is ignored; with no `?terminal_id` the request is `400 terminal_id parameter required`. With body `mode: "raw"` the command runs as a one-shot process with no terminal session, and `terminal_id` is ignored.
- Completion normally comes from the `COMMAND_COMPLETED_MARKER_{id}` tail, stripped before `/result/{id}`. A command is also marked completed when the session's process has died (exit code 1, `completion: "ended"`), or — on a non-ephemeral session with no explicit `timeout` — after 10 s without output once stdout was captured or the command's start marker was seen (`completion: "output_quiet"`, `exit_code: null`: the exit status is unknown and the program may still be running). A `completed` result therefore does not prove a long-running program exited; check `completion`; a program that swallows the marker and never falls silent keeps `wait=true` waiting.
- **`wait=false` returns `status:"queued"` or `"running"` immediately** (NOT `"completed"`) — the kit tracks the command through its marker and output, not the underlying PID. Re-check actual output via `sessions.read` / `sessions.getSnapshot`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. (Note: the generated SDK type only allows `png | jpeg | gif`, so `jpg` works only via raw HTTP.)
- **`processes.signal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- `processes.pause` / `processes.resume` send SIGSTOP / SIGCONT to `{pid}` or `{name}`, never both. `name` matches the kernel `comm`, which Linux cuts to 15 characters, so a longer name matches nothing. PIDs 1 and 2 and the terminal server's own and parent PIDs are refused with 403. `include_descendants: true` also signals every child process (best-effort, not atomic). A frozen process keeps its memory until `processes.resume`.
- `sessions.sendMouseEvents` takes 0-based text cells (row, col), not pixels; a cell off the screen is a 400. The program sees the event only when it has turned on terminal mouse reporting (htop, vim with `mouse=a`, tmux with `mouse on`); otherwise the call still answers 200, with `bytes_written: 0`.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id.
- `400` config-error on `sessions.create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `404` on `commands.get` once the result is gone: its session was removed (an ephemeral session holding results goes after `ephemeral-result-timeout` of inactivity with no attached client), or the session's result buffer filled and evicted it.
- `Unknown program name "<name>"` (400) on `proxy.aliases.create` → the `program` is not in the platform's program catalog. For a terminal alias use `program=terminal` (not `hoody-terminal` or `terminal-N`); pick the instance with `index`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

⚠ Through the containers proxy, the **`terminal-N` hostname selects the terminal**: the proxy sets `terminal_id` from `N` and overwrites any value you send, so every example addresses the session's own host (`terminal-100` for session 100; `terminal-0` for ephemeral allocation). A DNS label holds at most 63 characters, so from id 10000 up the `<projectId>-<containerId>-terminal-<N>` label is too long: use the short alias `t-<N>` (`<projectId>-<containerId>-t-<N>.<server>.containers.hoody.com`), which selects the same terminal. The SDK and CLI switch to it automatically."] In the SDK, pass `{ serviceIndex: N }` as the last, template-vars argument (default 1); the CLI derives the host from `--terminal-id`. When calling the kit directly, the HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body carries `command`, `wait`, `mode` (`pty` by default, or `raw` for a one-shot process with no terminal session), `stdin_b64` and `user` (raw mode only), `id`, `timeout`, `cwd` and `env`); missing the query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`. Always pass `?terminal_id=N`. The `command` body field is **plain UTF-8**, not base64 (only the URL form `?cmd=<base64>` is base64-decoded); the kit wraps it with its own shell bookkeeping and completion-marker echo before PTY delivery. `wait=true` normally returns when the kit sees the completion marker; a non-ephemeral command with no `timeout` is also reported completed after 10 s without new output once stdout was captured or its start marker was seen (`completion: "output_quiet"`, `exit_code: null`; the program may still be running), and programs that swallow the marker or only background-fork can return `status:"completed"` with empty or partial stdout — re-check via `sessions.read` if in doubt. SDK callers pass `terminal_id` / `ephemeral` / `defer_pid` / `display` / `ssh_*` in the **options object** (2nd arg) and `wait` in the **body**: `client.terminal.commands.run({ command: 'echo hi', wait: true }, { terminal_id: '100' }, { serviceIndex: 100 })`.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session.

**Step 1 — create the session.** `terminal_id` is required in the body; pin in `1–39999`.

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
const commandId = String(r.data!.command_id); // data is untyped (Record<string, unknown>)
```

**Step 3 — re-fetch the result** via `commands.get`, and save it promptly: a completed result can be evicted once the session's result buffer fills (100 results by default), and it is gone when the session is removed.

```typescript
const out = await client.terminal.commands.get(commandId, slot);
```

**Step 4 — clean up.** Always delete the session you created — autostart may re-spawn id 1, so explicit delete keeps your pinned ids tidy.

```typescript
await client.terminal.sessions.delete('100', slot);
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

⚠ Ephemeral allocates from `40000–65535` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

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

Cleanup: `DELETE /api/v1/terminal/101`.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL on the session's `terminal-N` host, `terminal_id` in query, subprotocol `tty`. Right after the socket opens, send the initial JSON dimensions message; the server starts sending output after it. Server frames start with a type byte (`0` = PTY output). Inject input via REST `/write` or `/press`; the WS receives the rendered bytes.

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

`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `sessions.delete(102)`.

### 5. Container introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness.

```typescript
const res = await client.terminal.system.getStats();
const procs = await client.terminal.processes.list({ limit: 5 });
const ports = await client.terminal.system.listPorts();
const disp = await client.terminal.system.listDisplays();
const cfg = await client.terminal.system.listDaemonPrograms();
const init = await client.terminal.processes.get(1);
```

⚠ `system.reboot` and `system.shutdown` exist on the same surface — don't call them on a shared dev container, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. **You must pair the ids explicitly**: pass `display: 10` on `sessions.create` so the kit exports `DISPLAY=:10` (the kit does NOT auto-derive DISPLAY from `terminal_id`).

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```typescript
const slot = { serviceIndex: 10 }; // _templateVars: routes every call to terminal-10
await client.terminal.sessions.create({ terminal_id: '10', display: '10' }, slot);
await client.terminal.commands.run({ command: 'xeyes &', wait: true }, { terminal_id: '10' }, slot);
```

**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```typescript
const displays = await client.terminal.system.listDisplays();
// data is typed Record<string, unknown>; the body is an array of displays
const list = displays.data as unknown as Array<{ display: number }>;
const ten = list.find(d => d.display === 10);
// then drive via client.display.* targeting display-10
```

Cleanup: kill `xeyes` via `processes.signal { name: 'xeyes', signal: 'SIGTERM' }` or just `sessions.delete(10)` (drops the shell + child GUIs).

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the container's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```typescript
const slot = { serviceIndex: 11 }; // _templateVars: routes every call to terminal-11
await client.terminal.sessions.create({
  terminal_id: '11', shell: 'ssh',
  ssh_host: '10.0.0.42', ssh_user: 'deploy', ssh_port: '22', ssh_password: process.env.SSH_PASSWORD,
}, slot);
await client.terminal.commands.run({ command: 'hostname; whoami', wait: true }, { terminal_id: '11' }, slot);
```

An SSH session always answers `commands.run` asynchronously, even with `wait: true`: read `command_id` from the response and poll `commands.get`.

To route the SSH connection through a SOCKS5 proxy, keep `ssh_host` and `ssh_user` and add `socks5_host` / `socks5_port` (plus `socks5_user` / `socks5_pass` if the proxy needs credentials); SOCKS5 fields without `ssh_host` and `ssh_user` are rejected. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with body `wait: false`** so the request returns instantly while the agent stays alive in the PTY. The `cwd` must already exist: `sessions.create` has no auto-create option and fails on a missing directory. To have the kit create it, skip `sessions.create` and let `commands.run` create the session, passing `cwd` and `cwd_auto_create=true` with the pinned `terminal_id`:

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

⚠ Body `wait: false` returns `status:"queued"` or `"running"` immediately (NOT `"completed"`) because the kit tracks the command, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `sessions.read` / `sessions.getSnapshot`. **Never** start a durable agent with `ephemeral=true`: once an ephemeral session sits inactive with no attached client (60 s, or `ephemeral-result-timeout` when it holds results) the kit force-kills its process.

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` finishes. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```typescript
const slot = { serviceIndex: 60 }; // _templateVars: routes every call to terminal-60
await client.terminal.sessions.create({ terminal_id: '60' }, slot);
await client.terminal.commands.run(
  { command: 'echo build-finished; ./run-tests.sh', wait: true },
  { terminal_id: '60', defer_pid: 12345 },
  slot,
);
```

`defer_pid` returns `/execute` immediately even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits. The wait is bounded by `defer_timeout_ms` (60000 ms default): set it explicitly for longer builds, because on expiry the command is marked timed out (exit code 124) and never runs. A PID that is already gone, or a `defer_start_time_ticks` that does not match the running process, runs the command immediately; pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (body `wait: false`), capture `command_id`.**

```typescript
const slot = { serviceIndex: 70 }; // _templateVars: routes every call to terminal-70
await client.terminal.sessions.create({ terminal_id: '70' }, slot);
const r = await client.terminal.commands.run({ command: 'sleep 120', wait: false }, { terminal_id: '70' }, slot);
const cid = String(r.data!.command_id); // data is untyped (Record<string, unknown>)
```

**Step 2 — abort** the command tracker. Add `force:true` to send SIGKILL; default sends SIGINT.

```typescript
await client.terminal.commands.cancel(cid, { force: true }, slot);
```

**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `processes.signal` by name. Targets every process matching the name.

```typescript
await client.terminal.processes.signal({ name: 'sleep', signal: 'SIGTERM' });
```

Cleanup: `sessions.delete(70)`. ⚠ Never call `system.shutdown` / `system.reboot` to recover from a hung command — they wipe the entire container.

## Reference

**Accessor:** `client.terminal`  |  **Import:** `import * as terminal from 'hoody-sdk/terminal'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.terminal.automation` (1) — Agent-facing automation primitives: screen snapshot, regex find, named key presses, text paste, and async wait conditions backed by a server-side terminal emulator

#### `getStats` — Get terminal automation metrics

```typescript
client.terminal.automation.getStats()
```

**Returns:** `Promise<TerminalAutomationGetStatsResponse>`  |  **HTTP:** `GET /api/v1/terminal/automation/metrics`
**CLI:** `hoody terminal automation stats`

---

### `client.terminal.commands` (4) — APIs for executing commands in terminal sessions and retrieving their results

#### `cancel` — Abort a running command

```typescript
client.terminal.commands.cancel(command_id: string, data?: TerminalCommandsCancelRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | The command ID returned by the execute endpoint |
| `data` | `TerminalCommandsCancelRequest` | body | No |  |

**Body:** `{ force: bool }`

**Returns:** `Promise<TerminalCommandsCancelResponse>`  |  **HTTP:** `POST /api/v1/terminal/execute/{command_id}/abort`
**CLI:** `hoody terminal commands cancel`

---

#### `get` — Get command result

```typescript
client.terminal.commands.get(command_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | Command ID returned from /api/v1/terminal/execute (numeric 1-65535) |

**Returns:** `Promise<TerminalCommandsGetResponse>`  |  **HTTP:** `GET /api/v1/terminal/result/{command_id}`
**CLI:** `hoody terminal commands get`

---

#### `list` — Get terminal command history

```typescript
client.terminal.commands.list(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID (numeric 1-65535, can also be provided as query parameter). The containers proxy injects only the query form on hostname-routed calls — this path segment must always be supplied explicitly |

**Returns:** `Promise<TerminalCommandsListResponse>`  |  **HTTP:** `GET /api/v1/terminal/history/{terminal_id}`
**CLI:** `hoody terminal commands list`

---

#### `run` — Execute command in terminal session

```typescript
client.terminal.commands.run(data: TerminalCommandsRunRequest, options?: { terminal_id?: string; ephemeral?: boolean; defer_pid?: number; defer_start_time_ticks?: string; defer_timeout_ms?: number; defer_poll_ms?: number; reset?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string; skip_display_wait?: boolean; display_wait_timeout?: number; display?: string; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; ssh_key?: string; socks5_pass?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). Required unless ephemeral=true, in which case it is auto-generated if not provided. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and OVERWRITES any value you send (a ?terminal_id=0 query sentinel never survives the proxy) — use the terminal-0 hostname as the "no terminal ID" sentinel so ephemeral=true can auto-generate; supply this parameter directly only when calling the terminal service without the proxy |
| `ephemeral` | `boolean` | query | No | When true, auto-generates a unique terminal_id (if not provided), skips display/dbus initialization, and applies aggressive cleanup. Designed for programmatic CLI command execution like a scripted command runner (default: false). WARNING: Do NOT use ephemeral=true for GUI applications that require a display. Ephemeral sessions strip the DISPLAY environment variable, which means X11/GUI applications will not work. Use a regular terminal session with an explicit terminal_id and display parameter instead for GUI workloads |
| `defer_pid` | `number` | query | No | Defer command injection until this PID exits (TUI-safe). If set, the API returns immediately regardless of wait=true |
| `defer_start_time_ticks` | `string` | query | No | Optional /proc/<pid>/stat field 22 (starttime in clock ticks since boot) to avoid PID reuse bugs. If it mismatches, command executes immediately |
| `defer_timeout_ms` | `number` | query | No | Max time to wait for defer_pid exit before failing (default: 60000) |
| `defer_poll_ms` | `number` | query | No | Poll interval while waiting for defer_pid exit (default: 50, minimum: 10) |
| `reset` | `boolean` | query | No | Reset existing session and reconfigure (kills current process, clears state, allows switching from bash to SSH or changing any parameter) - Use 'true', '1', or no value |
| `cwd` | `string` | query | No | Working directory for local bash sessions (ignored for SSH). In raw mode: the command's working directory, when the body has no cwd |
| `cwd_auto_create` | `boolean` | query | No | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new or reset local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | query | No | Shell to use for local sessions: bash (case-insensitive), zsh, fish, sh, etc. (default: server startup command, only applies to new sessions or after reset) |
| `user` | `string` | query | No | System user to spawn shell as (requires su permissions, only applies to new sessions or after reset). In raw mode: the user the command runs as, when the body has no user |
| `cmd` | `string` | query | No | Base64-encoded command to execute automatically (works with both new and active shells, executes every time URL is visited) |
| `env` | `string` | query | No | Environment variable in KEY=VALUE format (can be repeated for multiple variables, e.g., ?env=DEBUG=1&env=API_KEY=abc) |
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
| `data` | `TerminalCommandsRunRequest` | body | Yes |  |

**Body:** `{ command*: string, mode: "pty" | "raw", stdin_b64: string, user: string, id: string, timeout: int, wait: bool, cwd: string, env: object }`

- `command` — The command to execute. In raw mode at most 131071 bytes
- `wait` — Whether to wait for completion (default: true; forced false when defer_pid is set). Raw mode refuses false
- `env` — Environment variables for this command only, as string values. … Keys must be shell variable names ([A-Za-z_][A-Za-z0-9_]*) not starting with __HOODY_ (any case), else 400. …

**Returns:** `Promise<TerminalCommandsRunResponse>`  |  **HTTP:** `POST /api/v1/terminal/execute`
**CLI:** `hoody terminal commands run`

---

#### `runSsh` — Run a command on a remote SSH server.

```typescript
client.terminal.commands.runSsh(options: SshExecOptions)
```

**Returns:** `Promise<SshExecResult>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.terminal.drops` (4) — Terminal Drag-and-Drop

#### `commit` — Finalize a drop and inject the OSC frame

```typescript
client.terminal.drops.commit(data: TerminalDropsCommitRequest, options: { drop: string; token: string; terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `drop` | `string` | query | Yes | Drop id from /drop-begin |
| `token` | `string` | query | Yes | Drop token from /drop-begin |
| `data` | `TerminalDropsCommitRequest` | body | Yes |  |

**Body:** `{ ctx*: "drop" | "paste", r: int, c: int, cr: string, items*: { p*: string, d*: 0 | 1, s*: int, name: string, h: string }[] }`

**Returns:** `Promise<TerminalDropsCommitResponse>`  |  **HTTP:** `POST /api/v1/terminal/drop-commit`

---

#### `create` — Begin a drag-and-drop staging transaction

```typescript
client.terminal.drops.create(options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |

**Returns:** `Promise<TerminalDropsCreateResponse>`  |  **HTTP:** `POST /api/v1/terminal/drop-begin`

---

#### `send` — One-shot drop (begin + stage + commit)

```typescript
client.terminal.drops.send(data: TerminalDropsSendRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `data` | `TerminalDropsSendRequest` | body | Yes |  |

**Body:** `{ ctx*: "drop" | "paste", r: int, c: int, items*: { name*: string, b64: string, dir: bool, items: object[] }[] }`

**Returns:** `Promise<TerminalDropsSendResponse>`  |  **HTTP:** `POST /api/v1/terminal/drop`

---

#### `writeChunk` — Upload a raw file slice into a drop

```typescript
client.terminal.drops.writeChunk(data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { drop: string; token: string; path: string; offset: number; terminal_id?: string; contentType?: 'application/octet-stream' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `drop` | `string` | query | Yes | Drop id from /drop-begin |
| `token` | `string` | query | Yes | Drop token from /drop-begin |
| `path` | `string` | query | Yes | Sanitized relative path of the staged file (no `..`, not absolute) |
| `offset` | `number` | query | Yes | Byte offset to write at (must equal the current staged size) |
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream<Uint8Array> \| string` | body | Yes |  |

**Returns:** `Promise<TerminalDropsWriteChunkResponse>`  |  **HTTP:** `POST /api/v1/terminal/upload`

---

### `client.terminal.keys` (1) — Agent-facing automation primitives: screen snapshot, regex find, named key presses, text paste, and async wait conditions backed by a server-side terminal emulator

#### `list` — List supported key names for /press endpoint

```typescript
client.terminal.keys.list()
```

**Returns:** `Promise<TerminalKeysListResponse>`  |  **HTTP:** `GET /api/v1/terminal/keys`
**CLI:** `hoody terminal keys list`

---

### `client.terminal.kit` (1) — APIs for monitoring system resources, processes, network ports, and controlling system state

#### `getHealth` — Service health check

```typescript
client.terminal.kit.getHealth()
```

**Returns:** `Promise<TerminalHealthCheckResponse>`  |  **HTTP:** `GET /api/v1/terminal/health`
**CLI:** `hoody terminal health`

---

### `client.terminal.processes` (5) — APIs for monitoring system resources, processes, network ports, and controlling system state

#### `get` — Get process details by PID

```typescript
client.terminal.processes.get(pid: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pid` | `number` | path | Yes | Process ID |

**Returns:** `Promise<TerminalProcessesGetResponse>`  |  **HTTP:** `GET /api/v1/system/processes/{pid}`
**CLI:** `hoody terminal processes get`

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

**Returns:** `Promise<TerminalProcessesListResponse>`  |  **HTTP:** `GET /api/v1/system/processes`
**CLI:** `hoody terminal processes list`

---

#### `pause` — Freeze (SIGSTOP) a process or process tree

```typescript
client.terminal.processes.pause(data: TerminalProcessesPauseRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `TerminalProcessesPauseRequest` | body | Yes |  |

**Body:** `{ pid: int, name: string, include_descendants: bool }`

- `pid` — Process ID to freeze (mutually exclusive with name). PIDs 1 (init), 2 (kthreadd), the server's own PID, and the server's parent PID are guarded — freezing them would wedge the host or the daemon — and are rejected with 403.
- `name` — Process name (case-insensitive `comm` match — freezes EVERY matching process; mutually exclusive with pid). NOTE: Linux truncates `comm` to TASK_COMM_LEN-1 = 15 chars; a name longer than 15 characters silently matches nothing.

**Returns:** `Promise<TerminalProcessesPauseResponse>`  |  **HTTP:** `POST /api/v1/system/processes/freeze`
**CLI:** `hoody terminal processes pause`

---

#### `resume` — Unfreeze (SIGCONT) a process or process tree

```typescript
client.terminal.processes.resume(data: TerminalProcessesResumeRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `TerminalProcessesResumeRequest` | body | Yes |  |

**Body:** `{ pid: int, name: string, include_descendants: bool }`

- `pid` — Process ID to unfreeze (mutually exclusive with name). The guarded-PID set (1, 2, self, parent) is the same as for freeze; calling unfreeze on a guarded PID returns 403.
- `name` — Process name (case-insensitive comm match; mutually exclusive with pid). NOTE: Linux truncates `comm` to 15 chars; longer names silently match nothing.

**Returns:** `Promise<TerminalProcessesResumeResponse>`  |  **HTTP:** `POST /api/v1/system/processes/unfreeze`
**CLI:** `hoody terminal processes resume`

---

#### `signal` — Send signal to process(es)

```typescript
client.terminal.processes.signal(data: TerminalProcessesSignalRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `TerminalProcessesSignalRequest` | body | Yes |  |

**Body:** `{ pid: int, name: string, signal: string | int, force: bool }`

- `pid` — Process ID to signal (mutually exclusive with name)
- `name` — Process name to signal - signals ALL matching processes (mutually exclusive with pid)

**Returns:** `Promise<TerminalProcessesSignalResponse>`  |  **HTTP:** `POST /api/v1/system/process/signal`
**CLI:** `hoody terminal processes signal`

---

### `client.terminal.sessions` (15) — Agent-facing automation primitives: screen snapshot, regex find, named key presses, text paste, and async wait conditions backed by a server-side terminal emulator

#### `captureScreenshot` — Capture terminal screenshot

```typescript
client.terminal.sessions.captureScreenshot(options?: { terminal_id?: string; format?: "png" | "jpeg" | "gif"; foreground?: string; background?: string; fontsize?: number; save?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `format` | `"png" \| "jpeg" \| "gif"` | query | No | Output format: png, jpeg, gif (default: png) |
| `foreground` | `string` | query | No | Foreground color: black, red, green, yellow, blue, magenta, cyan, white, or RGB (R,G,B,A) (default: white) |
| `background` | `string` | query | No | Background color: same as foreground options (default: black) |
| `fontsize` | `number` | query | No | Font size in pixels (default: 20) |
| `save` | `boolean` | query | No | Save to storage directory (default: true) |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/terminal/screenshot`
**CLI:** `hoody terminal sessions screenshots capture`

---

#### `connect` — WebSocket terminal connection

```typescript
client.terminal.sessions.connect(options?: { terminal_id?: string; readonly?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string; display?: string; pid?: number; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; socks5_pass?: string; ssh_key?: string; display_id?: string; ephemeral?: boolean; reset?: boolean; startup_script?: string; env_inject?: boolean; desktop?: boolean; desktop_env?: "xfce" | "mate"; debug?: boolean; welcome?: boolean; agent?: boolean; onboarding?: boolean; arg?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). Omitted, the connection joins the shared terminal "1" that every client without a terminal_id uses; with ephemeral=true it instead gets a fresh ID in 40000-65535, reported in the SET_TERMINAL_ID frame. A value that is present but malformed is refused, never mapped to "1". Multiple clients can share by using the same ID. On connections routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send |
| `readonly` | `boolean` | query | No | Enable read-only mode for this client (blocks keyboard input) - Use 'true', '1', or no value |
| `cwd` | `string` | query | No | Working directory for new sessions |
| `cwd_auto_create` | `boolean` | query | No | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | query | No | Shell to use (bash, zsh, fish, tmux, ssh, etc.) |
| `user` | `string` | query | No | System user to spawn shell as (requires permissions) |
| `cmd` | `string` | query | No | Base64-encoded command to auto-execute on spawn |
| `env` | `string` | query | No | Environment variable KEY=VALUE (repeatable) |
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
| `ephemeral` | `boolean` | query | No | Throwaway session: without a terminal_id a fresh ID in 40000-65535 is allocated instead of joining shared terminal "1"; the display environment is not inherited, a cmd= command exits the shell when it finishes, and the idle session is cleaned up. Accepts true, 1 or yes (default: false). Ignored with agent=true |
| `reset` | `boolean` | query | No | Tear down the session's running process (or SSH / PID attachment) and start a fresh one before this client joins. Accepts true, 1 or a bare flag (default: false) |
| `startup_script` | `string` | query | No | Absolute path of a script to run before the shell starts; relative paths and paths containing ".." are ignored. Ignored with agent=true |
| `env_inject` | `boolean` | query | No | Inject the HOODY_* environment variables into the spawned shell (default: true; only false or 0 disables it) |
| `desktop` | `boolean` | query | No | Desktop mode: sets TTYD_DESKTOP_MODE=true in the shell environment (default: false). Ignored with agent=true |
| `desktop_env` | `"xfce" \| "mate"` | query | No | Desktop environment for desktop mode; implies desktop=true. Other values are ignored. Not started again when a window manager already runs on the display; it keeps running after the session is deleted (POST /api/v1/system/displays/{display}/stop ends it) |
| `debug` | `boolean` | query | No | Sets TTYD_DEBUG=true in the shell environment (default: false) |
| `welcome` | `boolean` | query | No | Show the Hoody welcome banner when the shell starts (default: false) |
| `agent` | `boolean` | query | No | Launch the server-configured Hoody Agent TUI instead of a shell. A locked-down mode: shell, cmd, user, ssh_*, pid, startup_script, desktop and ephemeral are ignored (default: false) |
| `onboarding` | `boolean` | query | No | With agent=true, start the agent's first-run onboarding (default: false) |
| `arg` | `string` | query | No | Command-line argument for the shell, repeatable and kept in order. Accepted only when URL arguments are enabled on this server; ignored otherwise |

**Returns:** `Promise<TerminalConnectTerminalWebSocketWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/terminal/ws`
**CLI:** `hoody terminal sessions connect`

---

#### `create` — Create a terminal session

```typescript
client.terminal.sessions.create(data: TerminalSessionsCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `TerminalSessionsCreateRequest` | body | Yes |  |

**Body:** `{ terminal_id: string, ephemeral: bool, display: string, shell: string, user: string, cwd: string, startup_script: string, welcome: bool, debug: bool, desktop: bool, desktop_env: string, cols: int, rows: int, wait_until_display: bool, wait_timeout: int, ssh_host: string, ssh_user: string, ssh_port: string, ssh_password: string, ssh_key: string, socks5_host: string, socks5_port: string, socks5_user: string, socks5_pass: string }`

- `terminal_id` — Terminal session ID (numeric 1-65535). Required unless ephemeral is true, in which case it is auto-generated (range 40000-65535).
- `ssh_host` — SSH hostname/IP. Required together with ssh_user for SSH sessions.
- `ssh_user` — SSH username. Required together with ssh_host for SSH sessions.
- `ssh_password` — SSH password. Cannot contain shell-dangerous characters.

**Returns:** `Promise<TerminalSessionsCreateResponse>`  |  **HTTP:** `POST /api/v1/terminal/create`
**CLI:** `hoody terminal sessions create`

---

#### `delete` — Delete a terminal session

```typescript
client.terminal.sessions.delete(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID to delete (numeric 1-65535). The containers proxy cannot fill this path segment — supply it explicitly even on hostname-routed calls |

**Returns:** `Promise<TerminalSessionsDeleteResponse>`  |  **HTTP:** `DELETE /api/v1/terminal/{terminal_id}`
**CLI:** `hoody terminal sessions delete`

---

#### `getAutomationStatus` — Get per-session automation state

```typescript
client.terminal.sessions.getAutomationStatus(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID. The containers proxy cannot fill this path segment — supply it explicitly even on hostname-routed calls |

**Returns:** `Promise<TerminalSessionsGetAutomationStatusResponse>`  |  **HTTP:** `GET /api/v1/terminal/{terminal_id}/automation`
**CLI:** `hoody terminal sessions automation status`

---

#### `getSnapshot` — Get rendered terminal snapshot

```typescript
client.terminal.sessions.getSnapshot(options?: { terminal_id?: string; include_colors?: boolean; include_highlights?: boolean; scroll_offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `include_colors` | `boolean` | query | No | Include ANSI SGR colored_lines array alongside plain text lines. Default: false |
| `include_highlights` | `boolean` | query | No | Include reverse-video highlight spans. Default: true |
| `scroll_offset` | `number` | query | No | Lines into scrollback (0 = live viewport). Default: 0 |

**Returns:** `Promise<TerminalSessionsGetSnapshotResponse>`  |  **HTTP:** `GET /api/v1/terminal/snapshot`
**CLI:** `hoody terminal sessions snapshot get`

---

#### `list` — List all terminal sessions

```typescript
client.terminal.sessions.list(options?: { history_limit?: number; history_lines?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `history_limit` | `number` | query | No | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `number` | query | No | Alias of history_limit |

**Returns:** `Promise<TerminalSessionsListResponse>`  |  **HTTP:** `GET /api/v1/terminal/sessions`
**CLI:** `hoody terminal sessions list`

---

#### `paste` — Paste text into terminal

```typescript
client.terminal.sessions.paste(data: TerminalSessionsPasteRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `data` | `TerminalSessionsPasteRequest` | body | Yes |  |

**Body:** `{ text*: string, bracketed: bool }`

**Returns:** `Promise<TerminalSessionsPasteResponse>`  |  **HTTP:** `POST /api/v1/terminal/paste`
**CLI:** `hoody terminal sessions paste`

---

#### `pressKeys` — Send named key presses to terminal

```typescript
client.terminal.sessions.pressKeys(data: TerminalSessionsPressKeysRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `data` | `TerminalSessionsPressKeysRequest` | body | Yes |  |

**Body:** `{ keys: string[], key: string }`

- `keys` — Array of key names to press in sequence (e.g. ["ctrl+c", "arrow_up", "enter"]). Mutually exclusive with `key`. Maximum 256 entries per request.
- `key` — Single key name for one-shot press (e.g. "enter"). Mutually exclusive with `keys`

**Returns:** `Promise<TerminalSessionsPressKeysResponse>`  |  **HTTP:** `POST /api/v1/terminal/press`
**CLI:** `hoody terminal sessions press`

---

#### `read` — Get raw terminal output

```typescript
client.terminal.sessions.read(options?: { terminal_id?: string; format?: "download" | "text" | "html"; tail?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535, defaults to "1" if not provided). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send |
| `format` | `"download" \| "text" \| "html"` | query | No | Output format: download, text, or html (defaults to "download" if not provided) |
| `tail` | `number` | query | No | Return only the last N lines of output |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/terminal/raw`
**CLI:** `hoody terminal sessions read`

---

#### `reportDiagnostics` — Client render/connection diagnostics beacon

```typescript
client.terminal.sessions.reportDiagnostics(data?: TerminalSessionsReportDiagnosticsRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `TerminalSessionsReportDiagnosticsRequest` | body | No |  |

**Body:** `{ build_id: string, renderer: string, reason: string }`

**Returns:** `Promise<TerminalSessionsReportDiagnosticsResponse>`  |  **HTTP:** `POST /api/v1/terminal/state`

---

#### `search` — Search terminal screen with regex

```typescript
client.terminal.sessions.search(options: { pattern: string; terminal_id?: string; scope?: "screen" | "scrollback" | "all"; limit?: number; case_insensitive?: boolean; scroll_offset?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `pattern` | `string` | query | Yes | PCRE2 regex pattern to search for (max 1024 bytes) |
| `scope` | `"screen" \| "scrollback" \| "all"` | query | No | Search scope: screen (default), scrollback, or all |
| `limit` | `number` | query | No | Maximum number of hits to return (default 100, max 1000) |
| `case_insensitive` | `boolean` | query | No | Case-insensitive matching. Default: false |
| `scroll_offset` | `number` | query | No | Scrollback offset for screen scope (0 = live viewport). Default: 0 |

**Returns:** `Promise<TerminalSessionsSearchResponse>`  |  **HTTP:** `GET /api/v1/terminal/find`
**CLI:** `hoody terminal sessions search`

---

#### `sendMouseEvents` — Send cell-based mouse events to terminal

```typescript
client.terminal.sessions.sendMouseEvents(data: TerminalSessionsSendMouseEventsRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `data` | `TerminalSessionsSendMouseEventsRequest` | body | Yes |  |

**Body:** `{ event: terminal_TerminalMouseEvent, events: terminal_TerminalMouseEvent[] } (exactly one of: event | events required)`

**Returns:** `Promise<TerminalSessionsSendMouseEventsResponse>`  |  **HTTP:** `POST /api/v1/terminal/mouse`
**CLI:** `hoody terminal sessions mouse send`

---

#### `wait` — Wait for terminal condition

```typescript
client.terminal.sessions.wait(data: TerminalSessionsWaitRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `data` | `TerminalSessionsWaitRequest` | body | Yes |  |

**Body:** `{ mode: string, debounce_ms: int, pattern: string, timeout_ms: int, search_scope: string, include_colors: bool, include_highlights: bool }`

- `debounce_ms` — Stable mode debounce in milliseconds (10-60000). Default: 100
- `pattern` — PCRE2 regex pattern (required for regex/either modes, max 1024 bytes)
- `timeout_ms` — Hard deadline in milliseconds (10-300000). Default: 5000

**Returns:** `Promise<TerminalSessionsWaitResponse>`  |  **HTTP:** `POST /api/v1/terminal/wait`
**CLI:** `hoody terminal sessions wait`

---

#### `write` — Write input to terminal

```typescript
client.terminal.sessions.write(data?: TerminalSessionsWriteRequest, options?: { terminal_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID to write to. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `data` | `TerminalSessionsWriteRequest` | body | No |  |

**Body:** `{ input*: string, enter: bool }`

**Returns:** `Promise<TerminalSessionsWriteResponse>`  |  **HTTP:** `POST /api/v1/terminal/write`
**CLI:** `hoody terminal sessions write`

---

#### `saveScreenshot` — Capture a terminal screenshot and save it to the container filesystem.

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

### `client.terminal.system` (7) — APIs for monitoring system resources, processes, network ports, and controlling system state

#### `getStats` — Get system resources and statistics

```typescript
client.terminal.system.getStats()
```

**Returns:** `Promise<TerminalSystemGetStatsResponse>`  |  **HTTP:** `GET /api/v1/system/resources`
**CLI:** `hoody terminal system stats`

---

#### `listDaemonPrograms` — Get daemon programs configuration

```typescript
client.terminal.system.listDaemonPrograms()
```

**Returns:** `Promise<TerminalSystemListDaemonProgramsResponse>`  |  **HTTP:** `GET /api/v1/system/daemon`
**CLI:** `hoody terminal system daemon programs list`

---

#### `listDisplays` — Get display information

```typescript
client.terminal.system.listDisplays()
```

**Returns:** `Promise<TerminalSystemListDisplaysResponse>`  |  **HTTP:** `GET /api/v1/system/displays`
**CLI:** `hoody terminal system displays list`

---

#### `listPorts` — List all listening network ports

```typescript
client.terminal.system.listPorts(options?: { protocol?: string; user?: string; port?: number; ip?: string; skip_program?: string; http_only?: boolean; hoody_only?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `protocol` | `string` | query | No | Filter by protocol: tcp, udp, or comma-separated list |
| `user` | `string` | query | No | Filter by user (exact match) |
| `port` | `number` | query | No | Filter by specific port number |
| `ip` | `string` | query | No | Filter by IP address (comma-separated list) |
| `skip_program` | `string` | query | No | Exclude specific programs (comma-separated list) |
| `http_only` | `boolean` | query | No | Only return HTTP services |
| `hoody_only` | `boolean` | query | No | Only return Hoody Kit services |

**Returns:** `Promise<TerminalSystemListPortsResponse>`  |  **HTTP:** `GET /api/v1/system/ports`
**CLI:** `hoody terminal system ports list`

---

#### `reboot` — Reboot the system

```typescript
client.terminal.system.reboot(options?: { delay?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delay` | `number` | query | No | Delay in seconds before reboot, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**Returns:** `Promise<TerminalSystemRebootResponse>`  |  **HTTP:** `POST /api/v1/system/reboot`
**CLI:** `hoody terminal system reboot`

---

#### `shutdown` — Shutdown the system

```typescript
client.terminal.system.shutdown(options?: { delay?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delay` | `number` | query | No | Delay in seconds before shutdown, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**Returns:** `Promise<TerminalSystemShutdownResponse>`  |  **HTTP:** `POST /api/v1/system/shutdown`
**CLI:** `hoody terminal system shutdown`

---

#### `stopDisplay` — Stop a display

```typescript
client.terminal.system.stopDisplay(display: number)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `display` | `number` | path | Yes | Display number (the N in :N), 0-65535 |

**Returns:** `Promise<TerminalSystemStopDisplayResponse>`  |  **HTTP:** `POST /api/v1/system/displays/{display}/stop`
**CLI:** `hoody terminal system displays stop`


### Body schemas

- `terminal_TerminalMouseEvent` — `{ type*: "move" | "down" | "up" | "click" | "scroll", row*: int, col*: int, button: int, amount: int, direction: "up" | "down", modifiers: ("shift" | "alt" | "meta" | "ctrl" | "control")[] }`

