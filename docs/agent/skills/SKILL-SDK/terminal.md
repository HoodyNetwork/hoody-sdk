> _**SDK skill · `terminal` namespace** · ~15,590 tokens · hoody-sdk v1.0.0-beta.11_

# `terminal` — Persistent multiplayer PTY sessions over HTTP and WebSocket

## Purpose

Real PTY per container, numeric `terminal_id` (1–65535). REST + WebSocket. Multiplayer; sessions persist.

## When to use

- **Interactive TUIs** that paint the screen (Claude Code, Codex, vim, htop, less, fzf, ssh, etc.) — these need a real PTY; only `terminal` provides one.
- **Durable / long-lived programs that you may need to interact with later** (the agent you spawned, a coding assistant, a chat REPL) — pin a stable `terminal_id` (1–39999) and reattach over WS or REST. Daemon-supervised processes have no TTY, so they can't host these.
- Sequenced commands sharing shell state, keystroke automation, screen capture, regex-search the rendered buffer.
- SSH / SOCKS5 sessions (`ssh_*` / `socks5_*`).
- Host introspection (`system.*`).

**Pin a unique `terminal_id` per program.** Re-using the same `terminal_id` for multiple programs writes both into the same PTY (output interleaves, prompts collide). Pick a distinct id per concurrent process — the `display-<terminal_id>` kit URL also pairs by id, so reusing breaks GUI routing too. **Never start a durable program with `ephemeral=true`** — ephemeral terminals auto-allocate from `40000–65535`, run the command, then evict at 300 s; your Claude Code / Codex session would die when the timer fires.

## When NOT to use

- Headless background process you don't need to interact with → `daemon` (supervised, log-captured, auto-restart).
- One-shot synchronous request/response → `exec`.
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

`sessions.create` (pin `terminal_id` or `ephemeral=true`) → `execution.execute` (`wait=true` is the default → sync; pass `wait=false` for async `command_id`; shares shell state) → `execution.getResult` → `sessions.getRawOutput`/`captureScreenshot` → `sessions.delete`.

### 2. Ephemeral one-off execute

`execution.execute` `ephemeral=true`, `wait=true` — auto ID 40000–65535, runs `cmd`, cleans up. Later: `getResult` before ephemeral-result-timeout (300s).

### 3. Automate a TUI

`sessions.create` (or `execute` to launch) → `pressTerminalKeys` (`Down`/`Enter`/`F2`; `listSupportedKeys`) → `pasteTerminalText` (`bracketed=true`) → `waitForTerminal` (`stable` or `pattern`) → `getTerminalSnapshot`/`findInTerminal`.

### 4. Live stream — WebSocket

`sessions.connectWebSocket` at `/api/v1/terminal/ws?terminal_id=…`. Multiple WS clients attach simultaneously; writes broadcast to PTY. Inject from REST via `client.terminal.write` or `pressTerminalKeys`. `abort` interrupts by `command_id`.

### 5. Container introspection

`system.listProcesses`, `getProcess`, `sendSignal`, `listPorts`, `getResources`, `getDisplayInfo`, `getDaemonConfig`, `reboot`/`shutdown`. Both `listProcesses` and `listPorts` also have streamed `*Iterator` variants for paginated traversal.

### 6. Spawn a durable agent CLI (Claude Code, Codex, …) and reattach later

For interactive coding agents and other long-lived TUIs the user may detach from and come back to:

1. Pick an unused `terminal_id` (1–39999, **never** the ephemeral range 40000–65535, **never** re-use one another program is on).
2. `sessions.create` with that pinned id, `ephemeral: false`, `shell: '/bin/bash'`, `cwd: '/workspace'` (or wherever).
3. `execution.execute` `cmd: 'claude code'` (or `codex`, `aider`, `gemini …`) with `wait: false` so the agent stays alive in the PTY rather than being treated as a sync request.
4. Reattach any time: `sessions.connectWebSocket` (multiplayer — multiple viewers / scripts can attach to the same PTY simultaneously), or REST via `pressTerminalKeys` / `pasteTerminalText` to drive it.
5. Tear down only when really done: `sessions.delete <terminal_id>`. The session persists until explicitly deleted or hit by `terminal-idle-timeout` (300 s default with zero attached clients and no running process). Sessions are in-memory only — a container reboot kills the PTY and drops the session; re-create after a reboot.

Two concurrent agents → two distinct `terminal_id`s (e.g. Claude Code on `1`, Codex on `2`). The `display-<id>` kit URL pairs by id, so non-collision keeps GUI routing clean too.

### 7. Launch a GUI app + control it via the display kit

Spin up a terminal, launch any X11 program, then drive it from the paired `display-<N>` kit. **You must explicitly pair the IDs** — the kit injects `DISPLAY` from the JSON `display` field on `sessions.create`; there is no automatic `terminal_id ⇒ DISPLAY=:N` mapping.

1. `sessions.create` with a pinned `terminal_id` (e.g. `1`) AND a matching `display: "1"` field (string in the SDK type), so the kit exports `DISPLAY=:1` into the PTY.
2. From that session: `execution.execute` `command: 'xeyes &'` (or `firefox &`, `gimp &`, `chromium-browser &`, `code &`, `xterm &`, …). The `&` returns the PTY immediately so the shell stays interactive; the GUI continues under `display-1`.
3. Open the matching display kit URL — `https://{projectId}-{containerId}-display-1.{node}.containers.hoody.com` (read `projectId`, `containerId`, and `server_name` from `containers.get`; the SDK exposes `getKitUrl('display', container, 1)` and `getKitUrls(container)` if you want to skip the string manipulation).
4. Drive the GUI via the `display` namespace:
   - `display.screenshots.capture` — see what's on screen (use `base64=true` for vision agents).
   - `display.input.clickAt` `{ x, y, button }` — left/right click; `display.input.typeAt` `{ text }` — keyboard.
   - `display.input.windowSearch` `{ name | class }` → `windowFocus` / `windowGeometry` / `windowActive` to focus + locate.
   - `display.input.batch` — bulk input replay; `display.input.wait` between actions.
5. Tear down: kill the X process via `system.sendSignal` from the terminal session, or `sessions.delete` to drop the whole shell + its child GUIs.

**Opening several GUI apps? Give each its own `terminal_id` + `display`.** Don't pile multiple apps onto one display — pair each app with a distinct id (`terminal_id=1`↔`display:":1"`, `terminal_id=2`↔`display:":2"`, …). Each then has its own `display-<N>` kit URL: a dedicated full-surface stream you can screenshot, embed / iframe, and drive input to **independently per window**, with no window-search/focus juggling. One display per app is almost always the right call; share a display only when you deliberately want them composited together.

For a turnkey full desktop instead of a single window, swap step 3 for the `desktop-<N>` alias (XFCE / MATE in a browser tab — see § Desktop alias in `SKILL-SDK.md`). The desktop alias auto-spawns the DE for you; this recipe is for spawning **specific** apps under your own control.

## Quirks & gotchas

- **Sharing a terminal URL = handing out root.** A `terminal-N` kit URL (or any alias pointed at it) lets anyone who can render it run arbitrary commands as root: read env / tokens / vault, exfiltrate files, install backdoors, mutate state. Capability-token semantics treat the URL itself as the credential — there is no per-recipient gate beyond what's configured in `proxyPermissionsContainer`. Share only with people you'd trust with `ssh root@…`. For wider audiences, gate (`setPasswordGroup` / `setTokenGroup` / `setIpGroup`), set an alias `expires_at`, watch `proxyLogs`, and prefer a constrained `exec` script or a read-only `display` stream over a live PTY.
- `terminal_id` numeric **1–65535**. **40000–65535 reserved for ephemeral**; pin manual IDs in 1–39999.
- `terminal_id=0` = sentinel "treat as absent".
- **Display pairing.** GUI apps run with the `DISPLAY` value supplied by the JSON `display` field on `sessions.create`. There is no automatic `terminal_id=N ⇒ DISPLAY=:N` mapping — if you want X11 rendering on display `:N`, pass `display` explicitly (either `"N"` or `":N"` — the kit normalises a bare number to `:N`). The `display-N` kit URL surface is independent of session id.
- `ephemeral=true` strips `DISPLAY`, skips display/dbus init — X11 won't render.
- `defer_pid` returns `/execute` immediately even with `wait=true`; queues until named PID exits (TUI-safe).
- **`/execute` body field is `command` (NOT `cmd`); request fails `400 Missing 'command' field` if you send `cmd`. The value is sent as RAW UTF-8 (written straight into the PTY unmodified); only the URL-form `?cmd=<base64>` is base64-decoded.**
- **`/execute` REQUIRES `?terminal_id=<n>` as a query parameter** unless `?ephemeral=true`; missing/non-numeric returns `400`. A body-only `terminal_id` is rejected by the validator before routing.
- Completion via `COMMAND_COMPLETED_MARKER_{id}` tail; stripped before `/result/{id}`. Programs swallowing it hang `wait=true`.
- **`wait=false` returns `status:"queued"` or `"running"` immediately** (NOT `"completed"`) — the kit only tracks the prompt-marker, not the underlying PID. Re-check actual output via `sessions.getRawOutput` / `getTerminalSnapshot`.
- **Screenshot `?format=` accepts `png | jpeg | jpg | gif`** at the kit level — `json` is invalid. (Note: the generated SDK type only allows `png | jpeg | gif`, so `jpg` works only via raw HTTP.)
- **`sendSignal` with `{name}` targets EVERY process matching that name** (returns `affected_pids`); use `{pid}` for surgical kills.
- Idle reaping: `terminal-idle-timeout` **300s**; `ephemeral-result-timeout` 300s (min 10s).
- `hoody pty` (and `hoody ssh`, `hoody run`) rewrite to `hoody shell` — an interactive PTY, or a one-shot via a POSITIONAL command (`hoody pty <cid> -- uname -a`). There is no `--command` flag and no `--ephemeral` flag on `shell`. For pinned ids on the automation surface use `terminal sessions exec --terminal-id <n>`.

## Common errors

- `400 Invalid terminal_id (must be numeric 1-65535)` on a non-numeric or out-of-range id; the lower-level validator logs a near-identical `0-65535` warning.
- `400` config-error on `sessions.create` — SSH/SOCKS5 partial validation (e.g. `ssh_user` without `ssh_host`, `socks5_port` out of range). The kit does NOT enforce mutual exclusion of `ssh_password` + `ssh_key`; both can coexist on a single session.
- `404` on `getResult` after ephemeral-result-timeout — buffer GC'd.
- "Unknown program name" on `proxyAliases.create` → use `program=exec`.

## Related namespaces

`exec`, `display`, `files`, `daemon`, `notifications`.

## Examples

Every step in every example was live-tested against a real `terminal-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

⚠ The HTTP routes take **`terminal_id` as a query parameter on `/execute`**, not in the body — a `terminal_id` field in the JSON body is silently ignored (the body parser only consumes the `command`, `id`, `timeout`, the boolean wait sync flag, `cwd` and `env` keys); missing the query param returns 400 `terminal_id parameter required` unless `?ephemeral=true`. Always pass `?terminal_id=N`. The `command` body field is sent as **raw UTF-8** (written straight into the PTY unmodified; only the URL form `?cmd=<base64>` is base64-decoded). `wait=true` returns when the kit sees the completion marker; programs that swallow the marker or only background-fork can return `status:"completed"` with empty stdout — re-check via `sessions.getRawOutput` if in doubt. SDK callers pass `terminal_id` / `ephemeral` / `defer_pid` / `display` / `ssh_*` in the **options object** (2nd arg), NOT in the body: `client.terminal.execution.execute({ command: 'echo hi' }, { terminal_id: '100', wait: true })`.

### 1. Persistent interactive session — create, run, capture, tear down

**Goal:** pin a stable PTY at `terminal_id=100`, run a command, fetch the result by `command_id`, then delete the session. All four steps live-verified.

**Step 1 — create the session.** `terminal_id` is required in the body; pin in `1–39999`.

```typescript
await client.terminal.sessions.create({ terminal_id: '100', shell: '/bin/bash', cols: 120, rows: 30 });
```
**Step 2 — execute** with `wait=true`. The body's `command` field is **raw UTF-8** (no base64).

```typescript
const r = await client.terminal.execution.execute(
  { command: 'echo HELLO; uname -a' },
  { terminal_id: '100', wait: true },
);
const commandId = r.data!.command_id;
```
**Step 3 — re-fetch the result later** via `getResult`. This is a pinned (non-ephemeral) session, so the result stays available until the session is idle-reaped at `terminal-idle-timeout` (300 s default).

```typescript
const out = await client.terminal.execution.getResult(commandId);
```
**Step 4 — clean up.** Always delete the session you created — autostart may re-spawn id 1, so explicit delete keeps your pinned ids tidy.

```typescript
await client.terminal.sessions.delete('100');
```
### 2. Ephemeral one-off — run a command without pinning anything

**Goal:** behave like `child_process.exec` — auto-allocated PTY, runs, evicts. No need to track a terminal_id.

```typescript
const r = await client.terminal.execution.execute(
  { command: 'date -u +%FT%TZ; uname -m' },
  { ephemeral: true, wait: true },
);
console.log(r.data!.stdout);
```
⚠ Ephemeral allocates from `40000–65535` and strips `DISPLAY` — never use it for GUI programs or anything you need to attach back to.

### 3. Automate a TUI — paste, press, wait, snapshot, find

**Goal:** drive an interactive program (here a simple shell echo, but the same recipe works for `htop`, `vim`, `fzf`, …). All five automation calls live-verified against a real session.

**Step 1 — create the session and paste a line** (raw, not base64; bracketed-paste optional).

```typescript
await client.terminal.sessions.create({ terminal_id: '101' });
// terminal_id is a QUERY param — it goes in the 2nd options arg, NOT the body.
await client.terminal.terminalAutomation.pasteTerminalText(
  { text: 'echo PASTED_TEXT', bracketed: false },
  { terminal_id: '101' },
);
```
**Step 2 — press Enter, wait for the screen to go stable, snapshot + regex-find.**

```typescript
await client.terminal.terminalAutomation.pressTerminalKeys({ keys: ['enter'] }, { terminal_id: '101' });
await client.terminal.terminalAutomation.waitForTerminal(
  { mode: 'stable', debounce_ms: 500, timeout_ms: 3000 },
  { terminal_id: '101' },
);
const snap = await client.terminal.terminalAutomation.getTerminalSnapshot({ terminal_id: '101' });
const hits = await client.terminal.terminalAutomation.findInTerminal({ terminal_id: '101', pattern: 'PASTED' });
```
**Step 3 — discover what keys you can press** (named keys differ per kit build):

```typescript
const keys = await client.terminal.terminalAutomation.listSupportedKeys();
```
Cleanup: `DELETE /api/v1/terminal/101`.

### 4. WebSocket attach for live streaming

**Goal:** subscribe to a PTY for live output while still driving it from REST. Multiple clients can attach; writes broadcast.

**Step 1 — create or reuse a session, then connect WS.** `wss://` URL, `terminal_id` in query. Inject input via REST `/write` or `/press`; the WS receives the rendered bytes.

```typescript
await client.terminal.sessions.create({ terminal_id: '102' });
// Generated WS wrapper exposes connect()/sendInput()/onOutput()/onDisconnect()/onError()/close()
const ws = await client.terminal.sessions.connectWebSocket({ terminal_id: '102', readonly: true });
ws.onOutput((buf) => process.stdout.write(buf));   // callback receives Uint8Array directly
await ws.connect();
await client.terminal.write({ input: 'echo VIA_WRITE\n' }, { terminal_id: '102' });
```
`readonly=true` blocks input from this client only; other attached clients keep their write rights. Cleanup: `sessions.delete(102)`.

### 5. Container introspection — processes, ports, resources, displays, daemon-config

**Goal:** one-call situational awareness. All five endpoints live-verified.

```typescript
const res = await client.terminal.system.getResources();
const procs = await client.terminal.system.listProcesses({ limit: 5 });
const ports = await client.terminal.system.listPorts();
const disp = await client.terminal.system.getDisplayInfo();
const cfg = await client.terminal.system.getDaemonConfig();
const init = await client.terminal.system.getProcess(1);
```
⚠ `system.reboot` and `system.shutdown` exist on the same surface — don't call them on a shared dev container, they wipe in-memory state.

### 6. Launch a GUI app + verify it's running on the paired display

**Goal:** start `xeyes &` from `terminal_id=10`, then read `display-10` in the `display` namespace to see the window. **You must pair the ids explicitly**: pass `display: 10` on `sessions.create` so the kit exports `DISPLAY=:10` (the kit does NOT auto-derive DISPLAY from `terminal_id`).

**Step 1 — create the session with display pairing, launch the GUI** (background it with `&` so the PTY stays free):

```typescript
await client.terminal.sessions.create({ terminal_id: '10', display: '10' });
await client.terminal.execution.execute({ command: 'xeyes &' }, { terminal_id: '10', wait: true });
```
**Step 2 — verify display-10 actually has a window** — query system displays from the same kit, then drive it from the `display-10` URL:

```typescript
const displays = await client.terminal.system.getDisplayInfo();
const ten = displays.data!.find(d => d.display === 10);
// then drive via client.display.* targeting display-10
```
Cleanup: kill `xeyes` via `system.sendSignal { name: 'xeyes', signal: 'SIGTERM' }` or just `sessions.delete(10)` (drops the shell + child GUIs).

### 7. SSH session through the terminal kit

**Goal:** open an SSH PTY to a remote host through the container's network. The kit's `/create` accepts `ssh_*` fields and the resulting session looks like any other PTY (paste/press/snapshot/WS all work the same). The kit accepts both `ssh_password` and `ssh_key` together (the underlying `ssh` client picks key first, then password) — there is no mutual-exclusion error.

```typescript
await client.terminal.sessions.create({
  terminal_id: '11', shell: 'ssh',
  ssh_host: '10.0.0.42', ssh_user: 'deploy', ssh_port: '22', ssh_password: 'hunter2',
});
await client.terminal.execution.execute({ command: 'hostname; whoami' }, { terminal_id: '11', wait: true });
```
For SOCKS5, swap to `socks5_host` / `socks5_port` / `socks5_user` / `socks5_pass`. Common 400 config-error triggers: `ssh_user` without `ssh_host`, `socks5_port` out of range; `ssh_password` and `ssh_key` may be sent together (no mutual-exclusion error).

### 8. Spawn a durable agent CLI and reattach over WS

**Goal:** start a long-running TUI (Claude Code, Codex, vim, …) at a pinned `terminal_id`, walk away, come back later from a different host.

**Step 1 — pin id, create, launch with `wait=false`** so the request returns instantly while the agent stays alive in the PTY:

```typescript
await client.terminal.sessions.create({
  terminal_id: '50', shell: 'bash', cwd: '/workspace',
});
await client.terminal.execution.execute(
  { command: 'sleep 600; echo agent-stopped' },
  { terminal_id: '50', wait: false, cwd_auto_create: true },
);
```
**Step 2 — reattach later** — same `terminal_id`, WS or REST, multiplayer:

```typescript
const ws = await client.terminal.sessions.connectWebSocket({ terminal_id: '50' });
const snap = await client.terminal.terminalAutomation.getTerminalSnapshot({ terminal_id: '50' });
```
⚠ `wait=false` returns `status:"queued"` or `"running"` immediately (NOT `"completed"`) because the kit only tracks the prompt marker, not the underlying PID — that's expected; the agent keeps running. Re-check actual output via `sessions.getRawOutput` / `getTerminalSnapshot`. **Never** start a durable agent with `ephemeral=true`: the 300 s sweep would kill it.

### 9. `defer_pid` — schedule a command to run after a parent process exits

**Goal:** queue command B so it only fires after pid `<PID>` finishes. Useful when you want to chain "after this build finishes, run tests" without watching the process from outside.

```typescript
await client.terminal.sessions.create({ terminal_id: '60' });
await client.terminal.execution.execute(
  { command: 'echo build-finished; ./run-tests.sh' },
  { terminal_id: '60', defer_pid: 12345, wait: true },
);
```
`defer_pid` returns `/execute` immediately even with `wait=true` (TUI-safe — see Quirks); it queues the body and runs it once the named PID exits. Pair `defer_start_time_ticks` to disambiguate PID reuse.

### 10. Cancel a running command + kill misbehaving processes

**Goal:** abort a hung `/execute` by `command_id`, then escalate to a process-level signal if the underlying program ignored SIGINT.

**Step 1 — submit async (`wait=false`), capture `command_id`.**

```typescript
await client.terminal.sessions.create({ terminal_id: '70' });
const r = await client.terminal.execution.execute({ command: 'sleep 120' }, { terminal_id: '70', wait: false });
const cid = r.data!.command_id;
```
**Step 2 — abort** the command tracker. Add `force:true` to send SIGKILL; default sends SIGINT.

```typescript
await client.terminal.abort(cid, { force: true });
```
**Step 3 — if the program survives** (ignored SIGINT, double-fork'd, etc.), escalate via `system.sendSignal` by name. Targets every process matching the name.

```typescript
await client.terminal.system.sendSignal({ name: 'sleep', signal: 'SIGTERM' });
```
Cleanup: `sessions.delete(70)`. ⚠ Never call `system.shutdown` / `system.reboot` to recover from a hung command — they wipe the entire container.

## Reference

**Accessor:** `client.terminal`  |  **Import:** `import * as terminal from 'hoody-sdk/terminal'`

### `client.terminal.docs` (2) — Self-documenting API specification endpoints in JSON and YAML formats

#### `getJson` — Get OpenAPI specification in JSON format

```typescript
client.terminal.docs.getJson()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/openapi.json`

---

#### `getYaml` — Get OpenAPI specification in YAML format

```typescript
client.terminal.docs.getYaml()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/openapi.yaml`

---

### `client.terminal.execution` (2) — APIs for executing commands in terminal sessions and retrieving their results

#### `execute` — Execute command in terminal session

```typescript
client.terminal.execution.execute(terminal_id?: string, ephemeral?: boolean, defer_pid?: integer, defer_start_time_ticks?: string, defer_timeout_ms?: integer, defer_poll_ms?: integer, reset?: boolean, cwd?: string, cwd_auto_create?: boolean, shell?: string, user?: string, cmd?: string, env?: string, skip_display_wait?: boolean, display_wait_timeout?: integer, display?: string, ssh_host?: string, ssh_user?: string, ssh_port?: string, ssh_password?: string, socks5_host?: string, socks5_port?: string, socks5_user?: string, ssh_key?: string, socks5_pass?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535). Use terminal_id=0 as an explicit sentinel meaning "no terminal ID" (treated as absent, useful when a reverse proxy always injects a terminal_id). Required unless ephemeral=true, in which case it is auto-generated if not provided |
| `ephemeral` | `boolean` | query | No | When true, auto-generates a unique terminal_id (if not provided), skips display/dbus initialization, and applies aggressive cleanup. Designed for programmatic CLI command execution like child_process.exec (default: false). WARNING: Do NOT use ephemeral=true for GUI applications that require a display. Ephemeral sessions strip the DISPLAY environment variable, which means X11/GUI applications will not work. Use a regular terminal session with an explicit terminal_id and display parameter instead for GUI workloads |
| `defer_pid` | `integer` | query | No | Defer command injection until this PID exits (TUI-safe). If set, the API returns immediately regardless of wait=true |
| `defer_start_time_ticks` | `string` | query | No | Optional /proc/<pid>/stat field 22 (starttime in clock ticks since boot) to avoid PID reuse bugs. If it mismatches, command executes immediately |
| `defer_timeout_ms` | `integer` | query | No | Max time to wait for defer_pid exit before failing (default: 60000) |
| `defer_poll_ms` | `integer` | query | No | Poll interval while waiting for defer_pid exit (default: 50, minimum: 10) |
| `reset` | `boolean` | query | No | Reset existing session and reconfigure (kills current process, clears state, allows switching from bash to SSH or changing any parameter) - Use 'true', '1', or no value |
| `cwd` | `string` | query | No | Working directory for local bash sessions (ignored for SSH) |
| `cwd_auto_create` | `boolean` | query | No | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new or reset local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | query | No | Shell to use for local sessions: bash (case-insensitive), zsh, fish, sh, etc. (default: server startup command, only applies to new sessions or after reset) |
| `user` | `string` | query | No | System user to spawn shell as (requires su permissions, only applies to new sessions or after reset) |
| `cmd` | `string` | query | No | Base64-encoded command to execute automatically (works with both new and active shells, executes every time URL is visited) |
| `env` | `string` | query | No | Environment variable in KEY=VALUE format (can be repeated for multiple variables, e.g., ?env=DEBUG=1&env=API_KEY=abc) |
| `skip_display_wait` | `boolean` | query | No | Skip waiting for Hoody Display readiness before executing command. By default, if a DISPLAY is configured, the endpoint blocks until the display server on port 4000+display_num is ready (default: false) |
| `display_wait_timeout` | `integer` | query | No | Timeout in seconds for display readiness wait (default: 10, capped at 10 seconds to prevent event-loop pin; values <=0 or malformed also map to the 10-second cap). Ignored if skip_display_wait=true |
| `display` | `string` | query | No | DISPLAY environment variable for X11 applications (auto-formats:display if number provided, e.g., ?display=1 becomes DISPLAY=:1) |
| `ssh_host` | `string` | query | No | SSH server hostname or IP address (creates SSH session if provided with ssh_user) |
| `ssh_user` | `string` | query | No | SSH username (required if ssh_host is provided) |
| `ssh_port` | `string` | query | No | SSH port number (default: 22) |
| `ssh_password` | `string` | query | No | SSH password for authentication (use with caution, prefer key-based auth) |
| `socks5_host` | `string` | query | No | SOCKS5 proxy hostname for SSH connection |
| `socks5_port` | `string` | query | No | SOCKS5 proxy port (default: 1080) |
| `socks5_user` | `string` | query | No | SOCKS5 proxy username for authentication |
| `ssh_key` | `string` | query | No | Base64-encoded SSH private key for key-based authentication (prefer over password-based auth) |
| `socks5_pass` | `string` | query | No | SOCKS5 proxy password for authentication |
| `data` | `object` | body | Yes |  |

**Body:** `{ command*: string, id: string, timeout: int, wait: bool, cwd: string, env: object }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/execute`
**CLI:** `hoody terminal sessions exec`

---

#### `getResult` — Get command result

```typescript
client.terminal.execution.getResult(command_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | Command ID returned from /api/v1/terminal/execute (numeric 1-65535) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/result/{command_id}`
**CLI:** `hoody terminal sessions command-result`

---

### `client.terminal.health` (1) — Health

#### `check` — Service health check

```typescript
client.terminal.health.check()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/health`
**CLI:** `hoody terminal health`

---

### `client.terminal.sessions` (11) — APIs for managing terminal sessions, retrieving output, and viewing session history

#### `captureScreenshot` — Capture terminal screenshot

```typescript
client.terminal.sessions.captureScreenshot(terminal_id: string, format?: string, foreground?: string, background?: string, fontsize?: integer, save?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID (numeric 1-65535) |
| `format` | `string` | query | No | Output format: png, jpeg, gif (default: png) |
| `foreground` | `string` | query | No | Foreground color: black, red, green, yellow, blue, magenta, cyan, white, or RGB (R,G,B,A) (default: white) |
| `background` | `string` | query | No | Background color: same as foreground options (default: black) |
| `fontsize` | `integer` | query | No | Font size in pixels (default: 20) |
| `save` | `boolean` | query | No | Save to storage directory (default: true) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/screenshot`
**CLI:** `hoody terminal sessions screenshot`

---

#### `connectWebSocket` — WebSocket terminal connection

```typescript
client.terminal.sessions.connectWebSocket(terminal_id?: string, readonly?: boolean, cwd?: string, cwd_auto_create?: boolean, shell?: string, user?: string, cmd?: string, env?: string, display?: string, pid?: integer, ssh_host?: string, ssh_user?: string, ssh_port?: string, ssh_password?: string, socks5_host?: string, socks5_port?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535, auto-generated if not provided) - Multiple clients can share by using same ID |
| `readonly` | `boolean` | query | No | Enable read-only mode for this client (blocks keyboard input) - Use 'true', '1', or no value |
| `cwd` | `string` | query | No | Working directory for new sessions |
| `cwd_auto_create` | `boolean` | query | No | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | query | No | Shell to use (bash, zsh, fish, tmux, ssh, etc.) |
| `user` | `string` | query | No | System user to spawn shell as (requires permissions) |
| `cmd` | `string` | query | No | Base64-encoded command to auto-execute on spawn |
| `env` | `string` | query | No | Environment variable KEY=VALUE (repeatable) |
| `display` | `string` | query | No | DISPLAY variable for X11 apps (auto-formats:N) |
| `pid` | `integer` | query | No | Attach to existing process PID for monitoring |
| `ssh_host` | `string` | query | No | SSH server hostname/IP for remote connections |
| `ssh_user` | `string` | query | No | SSH username (required if ssh_host provided) |
| `ssh_port` | `string` | query | No | SSH port (default: 22) |
| `ssh_password` | `string` | query | No | SSH password (use with caution) |
| `socks5_host` | `string` | query | No | SOCKS5 proxy for SSH |
| `socks5_port` | `string` | query | No | SOCKS5 port (default: 1080) |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/terminal/ws`
**CLI:** `hoody terminal sessions connect`

---

#### `create` — Create a terminal session

```typescript
client.terminal.sessions.create(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ terminal_id: string, ephemeral: bool, display: string, shell: string, user: string, cwd: string, startup_script: string, welcome: bool, debug: bool, desktop: bool, desktop_env: string, cols: int, rows: int, wait_until_display: bool, wait_timeout: int, ssh_host: string, ssh_user: string, ssh_port: string, ssh_password: string, ssh_key: string, socks5_host: string, socks5_port: string, socks5_user: string, socks5_pass: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/create`
**CLI:** `hoody terminal sessions create`

---

#### `delete` — Delete a terminal session

```typescript
client.terminal.sessions.delete(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID to delete (numeric 1-65535) |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/terminal/{terminal_id}`
**CLI:** `hoody terminal sessions delete`

---

#### `getRawOutput` — Get raw terminal output

```typescript
client.terminal.sessions.getRawOutput(terminal_id?: string, format?: string, tail?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535, defaults to "1" if not provided) |
| `format` | `string` | query | No | Output format: download, text, or html (defaults to "download" if not provided) |
| `tail` | `integer` | query | No | Return only the last N lines of output |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/raw`
**CLI:** `hoody terminal sessions raw-output`

---

#### `list` — List all terminal sessions

```typescript
client.terminal.sessions.list(history_limit?: integer, history_lines?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `history_limit` | `integer` | query | No | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `integer` | query | No | Alias of history_limit |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/sessions`
**CLI:** `hoody terminal sessions list`

---

#### `listAll` — List all terminal sessions (collect all pages)

```typescript
client.terminal.sessions.listAll(history_limit?: integer, history_lines?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `history_limit` | `integer` | query | No | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `integer` | query | No | Alias of history_limit |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/terminal/sessions`
**CLI:** `hoody terminal sessions list`

---

#### `listHistory` — Get terminal command history

```typescript
client.terminal.sessions.listHistory(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID (numeric 1-65535, can also be provided as query parameter) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/history/{terminal_id}`
**CLI:** `hoody terminal sessions history`

---

#### `listHistoryAll` — Get terminal command history (collect all pages)

```typescript
client.terminal.sessions.listHistoryAll(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID (numeric 1-65535, can also be provided as query parameter) |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/terminal/history/{terminal_id}`
**CLI:** `hoody terminal sessions history`

---

#### `listHistoryIterator` — Get terminal command history (async iterator)

```typescript
client.terminal.sessions.listHistoryIterator(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID (numeric 1-65535, can also be provided as query parameter) |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/terminal/history/{terminal_id}`
**CLI:** `hoody terminal sessions history`

---

#### `listIterator` — List all terminal sessions (async iterator)

```typescript
client.terminal.sessions.listIterator(history_limit?: integer, history_lines?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `history_limit` | `integer` | query | No | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `integer` | query | No | Alias of history_limit |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/terminal/sessions`
**CLI:** `hoody terminal sessions list`

---

### `client.terminal.system` (15) — APIs for monitoring system resources, processes, network ports, and controlling system state

#### `freezeProcess` — Freeze (SIGSTOP) a process or process tree

```typescript
client.terminal.system.freezeProcess(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ pid: int, name: string, include_descendants: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/system/processes/freeze`

---

#### `getDaemonConfig` — Get daemon programs configuration

```typescript
client.terminal.system.getDaemonConfig()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/system/daemon`
**CLI:** `hoody terminal system daemon-config`

---

#### `getDisplayInfo` — Get display information

```typescript
client.terminal.system.getDisplayInfo()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/system/displays`
**CLI:** `hoody terminal system display-info`

---

#### `getProcess` — Get process details by PID

```typescript
client.terminal.system.getProcess(pid: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `pid` | `integer` | path | Yes | Process ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/system/processes/{pid}`
**CLI:** `hoody terminal processes get`

---

#### `getResources` — Get system resources and statistics

```typescript
client.terminal.system.getResources()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/system/resources`
**CLI:** `hoody terminal system resources`

---

#### `listPorts` — List all listening network ports

```typescript
client.terminal.system.listPorts(protocol?: string, user?: string, port?: integer, ip?: string, skip_program?: string, http_only?: boolean, hoody_only?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `protocol` | `string` | query | No | Filter by protocol: tcp, udp, or comma-separated list |
| `user` | `string` | query | No | Filter by user (exact match) |
| `port` | `integer` | query | No | Filter by specific port number |
| `ip` | `string` | query | No | Filter by IP address (comma-separated list) |
| `skip_program` | `string` | query | No | Exclude specific programs (comma-separated list) |
| `http_only` | `boolean` | query | No | Only return HTTP services |
| `hoody_only` | `boolean` | query | No | Only return Hoody Kit services |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/system/ports`
**CLI:** `hoody terminal system ports`

---

#### `listPortsAll` — List all listening network ports (collect all pages)

```typescript
client.terminal.system.listPortsAll(protocol?: string, user?: string, port?: integer, ip?: string, skip_program?: string, http_only?: boolean, hoody_only?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `protocol` | `string` | query | No | Filter by protocol: tcp, udp, or comma-separated list |
| `user` | `string` | query | No | Filter by user (exact match) |
| `port` | `integer` | query | No | Filter by specific port number |
| `ip` | `string` | query | No | Filter by IP address (comma-separated list) |
| `skip_program` | `string` | query | No | Exclude specific programs (comma-separated list) |
| `http_only` | `boolean` | query | No | Only return HTTP services |
| `hoody_only` | `boolean` | query | No | Only return Hoody Kit services |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/system/ports`
**CLI:** `hoody terminal system ports`

---

#### `listPortsIterator` — List all listening network ports (async iterator)

```typescript
client.terminal.system.listPortsIterator(protocol?: string, user?: string, port?: integer, ip?: string, skip_program?: string, http_only?: boolean, hoody_only?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `protocol` | `string` | query | No | Filter by protocol: tcp, udp, or comma-separated list |
| `user` | `string` | query | No | Filter by user (exact match) |
| `port` | `integer` | query | No | Filter by specific port number |
| `ip` | `string` | query | No | Filter by IP address (comma-separated list) |
| `skip_program` | `string` | query | No | Exclude specific programs (comma-separated list) |
| `http_only` | `boolean` | query | No | Only return HTTP services |
| `hoody_only` | `boolean` | query | No | Only return Hoody Kit services |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/system/ports`
**CLI:** `hoody terminal system ports`

---

#### `listProcesses` — List all system processes

```typescript
client.terminal.system.listProcesses(sort?: string, limit?: integer, filter?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `sort` | `string` | query | No | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `integer` | query | No | Maximum number of processes to return (default: all) |
| `filter` | `string` | query | No | Filter by process name (substring match, case-insensitive) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/system/processes`
**CLI:** `hoody terminal processes list`

---

#### `listProcessesAll` — List all system processes (collect all pages)

```typescript
client.terminal.system.listProcessesAll(sort?: string, limit?: integer, filter?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `sort` | `string` | query | No | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `integer` | query | No | Maximum number of processes to return (default: all) |
| `filter` | `string` | query | No | Filter by process name (substring match, case-insensitive) |

**Returns:** `any[]`  |  **HTTP:** `GET /api/v1/system/processes`
**CLI:** `hoody terminal processes list`

---

#### `listProcessesIterator` — List all system processes (async iterator)

```typescript
client.terminal.system.listProcessesIterator(sort?: string, limit?: integer, filter?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `sort` | `string` | query | No | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `integer` | query | No | Maximum number of processes to return (default: all) |
| `filter` | `string` | query | No | Filter by process name (substring match, case-insensitive) |

**Returns:** `AsyncIterableIterator<any>`  |  **HTTP:** `GET /api/v1/system/processes`
**CLI:** `hoody terminal processes list`

---

#### `reboot` — Reboot the system

```typescript
client.terminal.system.reboot(delay?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delay` | `integer` | query | No | Delay in seconds before reboot, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/system/reboot`
**CLI:** `hoody terminal system reboot`

---

#### `sendSignal` — Send signal to process(es)

```typescript
client.terminal.system.sendSignal(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ pid: int, name: string, signal: string|integer, force: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/system/process/signal`
**CLI:** `hoody terminal processes signal`

---

#### `shutdown` — Shutdown the system

```typescript
client.terminal.system.shutdown(delay?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `delay` | `integer` | query | No | Delay in seconds before shutdown, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/system/shutdown`
**CLI:** `hoody terminal system shutdown`

---

#### `unfreezeProcess` — Unfreeze (SIGCONT) a process or process tree

```typescript
client.terminal.system.unfreezeProcess(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ pid: int, name: string, include_descendants: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/system/processes/unfreeze`

---

### `client.terminal` (2) — Terminal

#### `abort` — Abort a running command

```typescript
client.terminal.abort(command_id: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `command_id` | `string` | path | Yes | The command ID returned by the execute endpoint |
| `data` | `object` | body | No |  |

**Body:** `{ force: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/execute/{command_id}/abort`
**CLI:** `hoody terminal sessions abort`

---

#### `write` — Write input to terminal

```typescript
client.terminal.write(terminal_id: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID to write to |
| `data` | `object` | body | No |  |

**Body:** `{ input*: string, enter: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/write`
**CLI:** `hoody terminal sessions write`

---

### `client.terminal.terminalAutomation` (9) — Agent-facing automation primitives: screen snapshot, regex find, named key presses, text paste, and async wait conditions backed by a server-side libvterm parser

#### `findInTerminal` — Search terminal screen with regex

```typescript
client.terminal.terminalAutomation.findInTerminal(terminal_id: string, pattern: string, scope?: string, limit?: integer, case_insensitive?: boolean, scroll_offset?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID |
| `pattern` | `string` | query | Yes | PCRE2 regex pattern to search for (max 1024 bytes) |
| `scope` | `string` | query | No | Search scope: screen (default), scrollback, or all |
| `limit` | `integer` | query | No | Maximum number of hits to return (default 100, max 1000) |
| `case_insensitive` | `boolean` | query | No | Case-insensitive matching. Default: false |
| `scroll_offset` | `integer` | query | No | Scrollback offset for screen scope (0 = live viewport). Default: 0 |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/find`
**CLI:** `hoody terminal sessions find`

---

#### `getAutomationMetrics` — Get terminal automation metrics

```typescript
client.terminal.terminalAutomation.getAutomationMetrics()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/automation/metrics`
**CLI:** `hoody terminal automation metrics`

---

#### `getSessionAutomationState` — Get per-session automation state

```typescript
client.terminal.terminalAutomation.getSessionAutomationState(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | path | Yes | Terminal session ID |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/{terminal_id}/automation`
**CLI:** `hoody terminal sessions automation-state`

---

#### `getTerminalSnapshot` — Get rendered terminal snapshot

```typescript
client.terminal.terminalAutomation.getTerminalSnapshot(terminal_id: string, include_colors?: boolean, include_highlights?: boolean, scroll_offset?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID (numeric 1-65535) |
| `include_colors` | `boolean` | query | No | Include ANSI SGR colored_lines array alongside plain text lines. Default: false |
| `include_highlights` | `boolean` | query | No | Include reverse-video highlight spans. Default: true |
| `scroll_offset` | `integer` | query | No | Lines into scrollback (0 = live viewport). Default: 0 |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/snapshot`
**CLI:** `hoody terminal sessions snapshot`

---

#### `listSupportedKeys` — List supported key names for /press endpoint

```typescript
client.terminal.terminalAutomation.listSupportedKeys()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/terminal/keys`
**CLI:** `hoody terminal automation keys`

---

#### `pasteTerminalText` — Paste text into terminal

```typescript
client.terminal.terminalAutomation.pasteTerminalText(terminal_id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ text*: string, bracketed: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/paste`
**CLI:** `hoody terminal sessions paste`

---

#### `pressTerminalKeys` — Send named key presses to terminal

```typescript
client.terminal.terminalAutomation.pressTerminalKeys(terminal_id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ keys: any[], key: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/press`
**CLI:** `hoody terminal sessions press`

---

#### `sendTerminalMouseEvents` — Send cell-based mouse events to terminal

```typescript
client.terminal.terminalAutomation.sendTerminalMouseEvents(terminal_id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ event: terminal_TerminalMouseEvent, events: terminal_TerminalMouseEvent[] } (exactly one of: event | events required)`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/mouse`

---

#### `waitForTerminal` — Wait for terminal condition

```typescript
client.terminal.terminalAutomation.waitForTerminal(terminal_id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID |
| `data` | `object` | body | Yes |  |

**Body:** `{ mode: string, debounce_ms: int, pattern: string, timeout_ms: int, search_scope: string, include_colors: bool, include_highlights: bool }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/wait`
**CLI:** `hoody terminal sessions wait`

---

### `client.terminal.terminalDragAndDrop` (4) — Terminal Drag-and-Drop

#### `beginTerminalDrop` — Begin a drag-and-drop staging transaction

```typescript
client.terminal.terminalDragAndDrop.beginTerminalDrop(terminal_id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID (numeric 1-65535) |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/drop-begin`

---

#### `commitTerminalDrop` — Finalize a drop and inject the OSC frame

```typescript
client.terminal.terminalDragAndDrop.commitTerminalDrop(terminal_id: string, drop: string, token: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID (numeric 1-65535) |
| `drop` | `string` | query | Yes | Drop id from /drop-begin |
| `token` | `string` | query | Yes | Drop token from /drop-begin |
| `data` | `object` | body | Yes |  |

**Body:** `{ ctx*: string, r: int, c: int, cr: string, items*: any[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/drop-commit`

---

#### `oneShotTerminalDrop` — One-shot drop (begin + stage + commit)

```typescript
client.terminal.terminalDragAndDrop.oneShotTerminalDrop(terminal_id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID (numeric 1-65535) |
| `data` | `object` | body | Yes |  |

**Body:** `{ ctx*: string, r: int, c: int, items*: any[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/drop`

---

#### `uploadTerminalDropSlice` — Upload a raw file slice into a drop

```typescript
client.terminal.terminalDragAndDrop.uploadTerminalDropSlice(terminal_id: string, drop: string, token: string, path: string, offset: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | Yes | Terminal session ID (numeric 1-65535) |
| `drop` | `string` | query | Yes | Drop id from /drop-begin |
| `token` | `string` | query | Yes | Drop token from /drop-begin |
| `path` | `string` | query | Yes | Sanitized relative path of the staged file (no `..`, not absolute) |
| `offset` | `integer` | query | Yes | Byte offset to write at (must equal the current staged size) |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/upload`

---

### `client.terminal.terminalState` (1) — Client render/connection diagnostics beacon

#### `postTerminalState` — Client render/connection diagnostics beacon

```typescript
client.terminal.terminalState.postTerminalState(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ build_id: string, renderer: string, reason: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/terminal/state`

---

### `client.terminal.web` (1) — Web-based terminal interface with customizable display and session parameters

#### `get` — Get web terminal interface

```typescript
client.terminal.web.get(terminal_id?: string, cwd?: string, cwd_auto_create?: boolean, shell?: string, user?: string, cmd?: string, readonly?: boolean, title?: string, fontSize?: integer, backgroundColor?: string, panel?: string, panel-visible?: boolean, panel-position?: string, panel-width?: string, panel-resizable?: boolean, hide-toolbar?: boolean, ssh_host?: string, ssh_user?: string, ssh_port?: string, ssh_password?: string, socks5_host?: string, socks5_port?: string, socks5_user?: string, socks5_pass?: string, desktop?: boolean, desktop_env?: string, redirect?: string, redirect_delay?: integer, arg?: string, welcome?: boolean, debug?: boolean, reset?: boolean, pid?: integer, env?: string, display?: string, env_inject?: boolean, startup_script?: string, ssh_key?: string, panel-height?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `terminal_id` | `string` | query | No | Terminal session ID (numeric 1-65535, auto-generated if not provided) - Allows multiple clients to share the same terminal session |
| `cwd` | `string` | query | No | Initial working directory for new terminal sessions (only applied when session is first created) |
| `cwd_auto_create` | `boolean` | query | No | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | query | No | Shell to use: bash, zsh, fish, sh, etc. (default: server startup command, only applies to new sessions) |
| `user` | `string` | query | No | System user to spawn shell as (requires su permissions, only applies to new sessions, user must exist on system) |
| `cmd` | `string` | query | No | Base64-encoded command to execute automatically on spawn (executes once when shell starts) |
| `readonly` | `boolean` | query | No | Enable read-only mode (blocks keyboard input, allows viewing only) - Use 'true', '1', or no value |
| `title` | `string` | query | No | Browser window/tab title (default: application default) - HTML tags removed, max 200 characters, useful for organizing multiple terminal tabs |
| `fontSize` | `integer` | query | No | Terminal font size in pixels (default: 13, range: 8-72) - Accepts 'px' suffix (e.g., 16px), applied immediately when terminal loads |
| `backgroundColor` | `string` | query | No | Terminal background color (default: #2b2b2b) - Supports hex colors (#RGB, #RRGGBB, #RRGGBBAA) or CSS named colors (black, white, red, blue, green, navy, etc.) |
| `panel` | `string` | query | No | URL to display in side panel iframe (enables panel feature) |
| `panel-visible` | `boolean` | query | No | Show panel on load (default: true if panel URL provided, false otherwise) |
| `panel-position` | `string` | query | No | Panel position: 'left' or 'right' (default: right) |
| `panel-width` | `string` | query | No | Initial panel width in pixels or percentage (default: 400px) |
| `panel-resizable` | `boolean` | query | No | Allow panel resizing via drag handle (default: true) |
| `hide-toolbar` | `boolean` | query | No | Hide the terminal toolbar (default: false) |
| `ssh_host` | `string` | query | No | SSH server hostname or IP address (creates SSH session if provided with ssh_user) |
| `ssh_user` | `string` | query | No | SSH username (required if ssh_host is provided) |
| `ssh_port` | `string` | query | No | SSH port number (default: 22) |
| `ssh_password` | `string` | query | No | SSH password for authentication (use with caution, prefer key-based auth) |
| `socks5_host` | `string` | query | No | SOCKS5 proxy hostname for SSH connection |
| `socks5_port` | `string` | query | No | SOCKS5 proxy port (default: 1080) |
| `socks5_user` | `string` | query | No | SOCKS5 proxy username for authentication |
| `socks5_pass` | `string` | query | No | SOCKS5 proxy password for authentication |
| `desktop` | `boolean` | query | No | Enable Hoody Display desktop mode. Provides a full desktop environment instead of seamless individual windows (default: false) |
| `desktop_env` | `string` | query | No | Desktop environment to launch (implies desktop=true). Starts the specified DE session after the display is ready. Valid values: xfce, mate |
| `redirect` | `string` | query | No | Redirect mode. When set to "display", creates/ensures the terminal session, waits for X11 display readiness, then returns HTTP 302 redirect to the display URL. Requires terminal_id and display params |
| `redirect_delay` | `integer` | query | No | Extra delay in seconds after display is ready before redirecting. Only used when redirect=display (default: 0) |
| `arg` | `string` | query | No | Command-line arguments to pass to shell (requires --url-arg server option, can be repeated) |
| `welcome` | `boolean` | query | No | Show welcome message on startup (default: false). Supports ?welcome=true, ?welcome=1, or ?welcome (no value = true) |
| `debug` | `boolean` | query | No | Enable debug output in wrapper script (default: false) |
| `reset` | `boolean` | query | No | Kill existing terminal process and reconfigure session (default: false). Use to switch shell, user, or from shell to SSH |
| `pid` | `integer` | query | No | Attach to an existing process by PID instead of spawning a new shell. Implies reset |
| `env` | `string` | query | No | Inject environment variable as KEY=VALUE. Can be repeated for multiple variables (e.g., ?env=FOO=bar&env=BAZ=qux) |
| `display` | `string` | query | No | X11 display number for GUI applications. Accepts number (e.g., 1) or:number (e.g.,:1). Shorthand for ?env=DISPLAY=:N |
| `env_inject` | `boolean` | query | No | Inject HOODY_* environment variables into shell session (default: true). Set to false to disable |
| `startup_script` | `string` | query | No | Path to startup script to execute before shell launch (only applied on first session creation) |
| `ssh_key` | `string` | query | No | Base64-encoded SSH private key for key-based authentication (prefer over password-based auth) |
| `panel-height` | `string` | query | No | Initial panel height for top/bottom positioned panels (default: 300px) |

**Returns:** `any`  |  **HTTP:** `GET /`
**CLI:** `hoody terminal sessions web`


### Body schemas

- `terminal_TerminalMouseEvent` — `{ type*: "move" | "down" | "up" | "click" | "scroll", row*: int, col*: int, button: int, amount: int, direction: "up" | "down", modifiers: ("shift" | "alt" | "meta" | "ctrl" | "control")[] }`

