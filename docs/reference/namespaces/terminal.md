# `terminal` — 38 methods

**Version:** 1.0.0-beta.16
**Accessor:** `client.terminal`

```typescript
import * as terminal from 'hoody-sdk/terminal';
```

---

## `client.terminal.automation` (1 method)

### `getStats`

**GET** `/api/v1/terminal/automation/metrics`

Get terminal automation metrics

```typescript
client.terminal.automation.getStats(): Promise<TerminalAutomationGetStatsResponse>
```

**Returns:** `TerminalAutomationGetStatsResponse`

**CLI:** `hoody terminal automation stats`

---

## `client.terminal.commands` (4 methods)

### `cancel`

**POST** `/api/v1/terminal/execute/{command_id}/abort`

Abort a running command

```typescript
client.terminal.commands.cancel(command_id: string, data?: TerminalCommandsCancelRequest): Promise<TerminalCommandsCancelResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `command_id` | `string` | Yes | path | The command ID returned by the execute endpoint |
| `data` | `TerminalCommandsCancelRequest` | No | body |  |

**Returns:** `TerminalCommandsCancelResponse`

**CLI:** `hoody terminal commands cancel`

---

### `get`

**GET** `/api/v1/terminal/result/{command_id}`

Get command result

```typescript
client.terminal.commands.get(command_id: string): Promise<TerminalCommandsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `command_id` | `string` | Yes | path | Command ID returned from /api/v1/terminal/execute (numeric 1-65535) |

**Returns:** `TerminalCommandsGetResponse`

**CLI:** `hoody terminal commands get`

---

### `list`

**GET** `/api/v1/terminal/history/{terminal_id}`

Get terminal command history

```typescript
client.terminal.commands.list(terminal_id: string): Promise<TerminalCommandsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | path | Terminal session ID (numeric 1-65535, can also be provided as query parameter). The containers proxy injects only the query form on hostname-routed calls — this path segment must always be supplied explicitly |

**Returns:** `TerminalCommandsListResponse`

**CLI:** `hoody terminal commands list`

---

### `run`

**POST** `/api/v1/terminal/execute`

Execute command in terminal session

```typescript
client.terminal.commands.run(data: TerminalCommandsRunRequest, options?: { terminal_id?: string; ephemeral?: boolean; defer_pid?: number; defer_start_time_ticks?: string; defer_timeout_ms?: number; defer_poll_ms?: number; reset?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string; skip_display_wait?: boolean; display_wait_timeout?: number; display?: string; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; ssh_key?: string; socks5_pass?: string; cache?: boolean | number }): Promise<TerminalCommandsRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalCommandsRunRequest` | Yes | body |  |
| `terminal_id` | `string` | No | query | Terminal session ID (numeric 1-65535). Required unless ephemeral=true, in which case it is auto-generated if not provided. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and OVERWRITES any value you send (a ?terminal_id=0 query sentinel never survives the proxy) — use the terminal-0 hostname as the "no terminal ID" sentinel so ephemeral=true can auto-generate; supply this parameter directly only when calling the terminal service without the proxy |
| `ephemeral` | `boolean` | No | query | When true, auto-generates a unique terminal_id (if not provided), skips display/dbus initialization, and applies aggressive cleanup. Designed for programmatic CLI command execution like a scripted command runner (default: false). WARNING: Do NOT use ephemeral=true for GUI applications that require a display. Ephemeral sessions strip the DISPLAY environment variable, which means X11/GUI applications will not work. Use a regular terminal session with an explicit terminal_id and display parameter instead for GUI workloads |
| `defer_pid` | `number` | No | query | Defer command injection until this PID exits (TUI-safe). If set, the API returns immediately regardless of wait=true |
| `defer_start_time_ticks` | `string` | No | query | Optional /proc/&lt;pid&gt;/stat field 22 (starttime in clock ticks since boot) to avoid PID reuse bugs. If it mismatches, command executes immediately |
| `defer_timeout_ms` | `number` | No | query | Max time to wait for defer_pid exit before failing (default: 60000) |
| `defer_poll_ms` | `number` | No | query | Poll interval while waiting for defer_pid exit (default: 50, minimum: 10) |
| `reset` | `boolean` | No | query | Reset existing session and reconfigure (kills current process, clears state, allows switching from bash to SSH or changing any parameter) - Use 'true', '1', or no value |
| `cwd` | `string` | No | query | Working directory for local bash sessions (ignored for SSH). In raw mode: the command's working directory, when the body has no cwd |
| `cwd_auto_create` | `boolean` | No | query | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new or reset local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | No | query | Shell to use for local sessions: bash (case-insensitive), zsh, fish, sh, etc. (default: server startup command, only applies to new sessions or after reset) |
| `user` | `string` | No | query | System user to spawn shell as (requires su permissions, only applies to new sessions or after reset). In raw mode: the user the command runs as, when the body has no user |
| `cmd` | `string` | No | query | Base64-encoded command to execute automatically (works with both new and active shells, executes every time URL is visited) |
| `env` | `string` | No | query | Environment variable in KEY=VALUE format (can be repeated for multiple variables, e.g., ?env=DEBUG=1&env=API_KEY=abc) |
| `skip_display_wait` | `boolean` | No | query | Skip waiting for Hoody Display readiness before executing command. By default, if a DISPLAY is configured, the request waits until the session's display server is ready, unless no X server holds the display and none can be started, or a wait for it already timed out on the same shell within the last 30 seconds. Commands of one terminal still run in arrival order, so a request with skip_display_wait=true runs after earlier ones still waiting (default: false) |
| `display_wait_timeout` | `number` | No | query | Timeout in seconds for display readiness wait, counted from the request (default: 10, capped at 10 seconds; values &lt;=0 or malformed also map to the 10-second cap). When it elapses the command runs anyway. Ignored if skip_display_wait=true |
| `display` | `string` | No | query | DISPLAY environment variable for X11 applications (auto-formats :display if number provided, e.g., ?display=1 becomes DISPLAY=:1) |
| `ssh_host` | `string` | No | query | SSH server hostname or IP address (creates SSH session if provided with ssh_user) |
| `ssh_user` | `string` | No | query | SSH username (required if ssh_host is provided) |
| `ssh_port` | `string` | No | query | SSH port number (default: 22) |
| `ssh_password` | `string` | No | query | SSH password for authentication (use with caution, prefer key-based auth) |
| `socks5_host` | `string` | No | query | SOCKS5 proxy hostname for SSH connection |
| `socks5_port` | `string` | No | query | SOCKS5 proxy port (default: 1080) |
| `socks5_user` | `string` | No | query | SOCKS5 proxy username for authentication |
| `ssh_key` | `string` | No | query | Base64-encoded SSH private key for key-based authentication (prefer over password-based auth) |
| `socks5_pass` | `string` | No | query | SOCKS5 proxy password for authentication |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalCommandsRunResponse`

**CLI:** `hoody terminal commands run`

---

## `client.terminal.drops` (4 methods)

### `commit`

**POST** `/api/v1/terminal/drop-commit`

Finalize a drop and inject the OSC frame

```typescript
client.terminal.drops.commit(data: TerminalDropsCommitRequest, options: { drop: string; token: string; terminal_id: string; cache?: boolean | number }): Promise<TerminalDropsCommitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalDropsCommitRequest` | Yes | body |  |
| `drop` | `string` | Yes | query | Drop id from /drop-begin |
| `token` | `string` | Yes | query | Drop token from /drop-begin |
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalDropsCommitResponse`

---

### `create`

**POST** `/api/v1/terminal/drop-begin`

Begin a drag-and-drop staging transaction

```typescript
client.terminal.drops.create(options?: { terminal_id: string; cache?: boolean | number }): Promise<TerminalDropsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalDropsCreateResponse`

---

### `send`

**POST** `/api/v1/terminal/drop`

One-shot drop (begin + stage + commit)

```typescript
client.terminal.drops.send(data: TerminalDropsSendRequest, options?: { terminal_id: string; cache?: boolean | number }): Promise<TerminalDropsSendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalDropsSendRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalDropsSendResponse`

---

### `writeChunk`

**POST** `/api/v1/terminal/upload`

Upload a raw file slice into a drop

```typescript
client.terminal.drops.writeChunk(data: Blob | ArrayBuffer | Uint8Array | ReadableStream<Uint8Array> | string, options: { drop: string; token: string; path: string; offset: number; terminal_id: string; cache?: boolean | number; contentType?: 'application/octet-stream' }): Promise<TerminalDropsWriteChunkResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `Blob \| ArrayBuffer \| Uint8Array \| ReadableStream&lt;Uint8Array&gt; \| string` | Yes | body |  |
| `drop` | `string` | Yes | query | Drop id from /drop-begin |
| `token` | `string` | Yes | query | Drop token from /drop-begin |
| `path` | `string` | Yes | query | Sanitized relative path of the staged file (no `..`, not absolute) |
| `offset` | `number` | Yes | query | Byte offset to write at (must equal the current staged size) |
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |
| `contentType` | `'application/octet-stream'` | No | query |  |

**Returns:** `TerminalDropsWriteChunkResponse`

---

## `client.terminal.keys` (1 method)

### `list`

**GET** `/api/v1/terminal/keys`

List supported key names for /press endpoint

```typescript
client.terminal.keys.list(): Promise<TerminalKeysListResponse>
```

**Returns:** `TerminalKeysListResponse`

**CLI:** `hoody terminal keys list`

---

## `client.terminal.kit` (1 method)

### `getHealth`

**GET** `/api/v1/terminal/health`

Service health check

```typescript
client.terminal.kit.getHealth(): Promise<TerminalHealthCheckResponse>
```

**Returns:** `TerminalHealthCheckResponse`

**CLI:** `hoody terminal health`

---

## `client.terminal.processes` (5 methods)

### `get`

**GET** `/api/v1/system/processes/{pid}`

Get process details by PID

```typescript
client.terminal.processes.get(pid: number): Promise<TerminalProcessesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `pid` | `number` | Yes | path | Process ID |

**Returns:** `TerminalProcessesGetResponse`

**CLI:** `hoody terminal processes get`

---

### `list`

**GET** `/api/v1/system/processes`

List all system processes

```typescript
client.terminal.processes.list(options?: { sort?: "cpu" | "memory" | "pid" | "name"; limit?: number; filter?: string; cache?: boolean | number }): Promise<TerminalProcessesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sort` | `"cpu" \| "memory" \| "pid" \| "name"` | No | query | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `number` | No | query | Maximum number of processes to return (default: 1000) |
| `filter` | `string` | No | query | Keep processes whose name or command line contains this text (case-sensitive) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalProcessesListResponse`

**CLI:** `hoody terminal processes list`

---

### `pause`

**POST** `/api/v1/system/processes/freeze`

Freeze (SIGSTOP) a process or process tree

```typescript
client.terminal.processes.pause(data: TerminalProcessesPauseRequest): Promise<TerminalProcessesPauseResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalProcessesPauseRequest` | Yes | body |  |

**Returns:** `TerminalProcessesPauseResponse`

**CLI:** `hoody terminal processes pause`

---

### `resume`

**POST** `/api/v1/system/processes/unfreeze`

Unfreeze (SIGCONT) a process or process tree

```typescript
client.terminal.processes.resume(data: TerminalProcessesResumeRequest): Promise<TerminalProcessesResumeResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalProcessesResumeRequest` | Yes | body |  |

**Returns:** `TerminalProcessesResumeResponse`

**CLI:** `hoody terminal processes resume`

---

### `signal`

**POST** `/api/v1/system/process/signal`

Send signal to process(es)

```typescript
client.terminal.processes.signal(data: TerminalProcessesSignalRequest): Promise<TerminalProcessesSignalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalProcessesSignalRequest` | Yes | body |  |

**Returns:** `TerminalProcessesSignalResponse`

**CLI:** `hoody terminal processes signal`

---

## `client.terminal.sessions` (15 methods)

### `captureScreenshot`

**GET** `/api/v1/terminal/screenshot`

Capture terminal screenshot

```typescript
client.terminal.sessions.captureScreenshot(options?: { terminal_id: string; format?: "png" | "jpeg" | "gif"; foreground?: string; background?: string; fontsize?: number; save?: boolean; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `format` | `"png" \| "jpeg" \| "gif"` | No | query | Output format: png, jpeg, gif (default: png) |
| `foreground` | `string` | No | query | Foreground color: black, red, green, yellow, blue, magenta, cyan, white, or RGB (R,G,B,A) (default: white) |
| `background` | `string` | No | query | Background color: same as foreground options (default: black) |
| `fontsize` | `number` | No | query | Font size in pixels (default: 20) |
| `save` | `boolean` | No | query | Save to storage directory (default: true) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody terminal sessions screenshots capture`

---

### `connect`

**GET** `/api/v1/terminal/ws`

WebSocket terminal connection

```typescript
client.terminal.sessions.connect(options?: { terminal_id?: string; readonly?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string; display?: string; pid?: number; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; socks5_pass?: string; ssh_key?: string; display_id?: string; ephemeral?: boolean; reset?: boolean; startup_script?: string; env_inject?: boolean; desktop?: boolean; desktop_env?: "xfce" | "mate"; debug?: boolean; welcome?: boolean; agent?: boolean; onboarding?: boolean; arg?: string; cache?: boolean | number }): Promise<TerminalConnectTerminalWebSocketWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | No | query | Terminal session ID (numeric 1-65535). Omitted, the connection joins the shared terminal "1" that every client without a terminal_id uses; with ephemeral=true it instead gets a fresh ID in 40000-65535, reported in the SET_TERMINAL_ID frame. A value that is present but malformed is refused, never mapped to "1". Multiple clients can share by using the same ID. On connections routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send |
| `readonly` | `boolean` | No | query | Enable read-only mode for this client (blocks keyboard input) - Use 'true', '1', or no value |
| `cwd` | `string` | No | query | Working directory for new sessions |
| `cwd_auto_create` | `boolean` | No | query | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | No | query | Shell to use (bash, zsh, fish, tmux, ssh, etc.) |
| `user` | `string` | No | query | System user to spawn shell as (requires permissions) |
| `cmd` | `string` | No | query | Base64-encoded command to auto-execute on spawn |
| `env` | `string` | No | query | Environment variable KEY=VALUE (repeatable) |
| `display` | `string` | No | query | DISPLAY variable for X11 apps (auto-formats :N) |
| `pid` | `number` | No | query | Attach to existing process PID for monitoring |
| `ssh_host` | `string` | No | query | SSH server hostname/IP for remote connections |
| `ssh_user` | `string` | No | query | SSH username (required if ssh_host provided) |
| `ssh_port` | `string` | No | query | SSH port (default: 22) |
| `ssh_password` | `string` | No | query | SSH password (use with caution) |
| `socks5_host` | `string` | No | query | SOCKS5 proxy for SSH |
| `socks5_port` | `string` | No | query | SOCKS5 port (default: 1080) |
| `socks5_user` | `string` | No | query | SOCKS5 proxy username (alphanumeric with _-. characters) |
| `socks5_pass` | `string` | No | query | SOCKS5 proxy password (shell-dangerous characters are refused) |
| `ssh_key` | `string` | No | query | Base64-encoded SSH private key for key authentication (alternative to ssh_password) |
| `display_id` | `string` | No | query | Alias of display; when both are sent, display wins |
| `ephemeral` | `boolean` | No | query | Throwaway session: without a terminal_id a fresh ID in 40000-65535 is allocated instead of joining shared terminal "1"; the display environment is not inherited, a cmd= command exits the shell when it finishes, and the idle session is cleaned up. Accepts true, 1 or yes (default: false). Ignored with agent=true |
| `reset` | `boolean` | No | query | Tear down the session's running process (or SSH / PID attachment) and start a fresh one before this client joins. Accepts true, 1 or a bare flag (default: false) |
| `startup_script` | `string` | No | query | Absolute path of a script to run before the shell starts; relative paths and paths containing ".." are ignored. Ignored with agent=true |
| `env_inject` | `boolean` | No | query | Inject the HOODY_* environment variables into the spawned shell (default: true; only false or 0 disables it) |
| `desktop` | `boolean` | No | query | Desktop mode: sets TTYD_DESKTOP_MODE=true in the shell environment (default: false). Ignored with agent=true |
| `desktop_env` | `"xfce" \| "mate"` | No | query | Desktop environment for desktop mode; implies desktop=true. Other values are ignored. Not started again when a window manager already runs on the display; it keeps running after the session is deleted (POST /api/v1/system/displays/{display}/stop ends it) |
| `debug` | `boolean` | No | query | Sets TTYD_DEBUG=true in the shell environment (default: false) |
| `welcome` | `boolean` | No | query | Show the Hoody welcome banner when the shell starts (default: false) |
| `agent` | `boolean` | No | query | Launch the server-configured Hoody Agent TUI instead of a shell. A locked-down mode: shell, cmd, user, ssh_*, pid, startup_script, desktop and ephemeral are ignored (default: false) |
| `onboarding` | `boolean` | No | query | With agent=true, start the agent's first-run onboarding (default: false) |
| `arg` | `string` | No | query | Command-line argument for the shell, repeatable and kept in order. Accepted only when URL arguments are enabled on this server; ignored otherwise |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalConnectTerminalWebSocketWebSocket`

**CLI:** `hoody terminal sessions connect`

---

### `create`

**POST** `/api/v1/terminal/create`

Create a terminal session

```typescript
client.terminal.sessions.create(data: TerminalSessionsCreateRequest): Promise<TerminalSessionsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSessionsCreateRequest` | Yes | body |  |

**Returns:** `TerminalSessionsCreateResponse`

**CLI:** `hoody terminal sessions create`

---

### `delete`

**DELETE** `/api/v1/terminal/{terminal_id}`

Delete a terminal session

```typescript
client.terminal.sessions.delete(terminal_id: string): Promise<TerminalSessionsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | path | Terminal session ID to delete (numeric 1-65535). The containers proxy cannot fill this path segment — supply it explicitly even on hostname-routed calls |

**Returns:** `TerminalSessionsDeleteResponse`

**CLI:** `hoody terminal sessions delete`

---

### `getAutomationStatus`

**GET** `/api/v1/terminal/{terminal_id}/automation`

Get per-session automation state

```typescript
client.terminal.sessions.getAutomationStatus(terminal_id: string): Promise<TerminalSessionsGetAutomationStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | path | Terminal session ID. The containers proxy cannot fill this path segment — supply it explicitly even on hostname-routed calls |

**Returns:** `TerminalSessionsGetAutomationStatusResponse`

**CLI:** `hoody terminal sessions automation status`

---

### `getSnapshot`

**GET** `/api/v1/terminal/snapshot`

Get rendered terminal snapshot

```typescript
client.terminal.sessions.getSnapshot(options?: { terminal_id: string; include_colors?: boolean; include_highlights?: boolean; scroll_offset?: number; cache?: boolean | number }): Promise<TerminalSessionsGetSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `include_colors` | `boolean` | No | query | Include ANSI SGR colored_lines array alongside plain text lines. Default: false |
| `include_highlights` | `boolean` | No | query | Include reverse-video highlight spans. Default: true |
| `scroll_offset` | `number` | No | query | Lines into scrollback (0 = live viewport). Default: 0 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsGetSnapshotResponse`

**CLI:** `hoody terminal sessions snapshot get`

---

### `list`

**GET** `/api/v1/terminal/sessions`

List all terminal sessions

```typescript
client.terminal.sessions.list(options?: { history_limit?: number; history_lines?: number; cache?: boolean | number }): Promise<TerminalSessionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `history_limit` | `number` | No | query | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `number` | No | query | Alias of history_limit |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsListResponse`

**CLI:** `hoody terminal sessions list`

---

### `paste`

**POST** `/api/v1/terminal/paste`

Paste text into terminal

```typescript
client.terminal.sessions.paste(data: TerminalSessionsPasteRequest, options?: { terminal_id: string; cache?: boolean | number }): Promise<TerminalSessionsPasteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSessionsPasteRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsPasteResponse`

**CLI:** `hoody terminal sessions paste`

---

### `pressKeys`

**POST** `/api/v1/terminal/press`

Send named key presses to terminal

```typescript
client.terminal.sessions.pressKeys(data: TerminalSessionsPressKeysRequest, options?: { terminal_id: string; cache?: boolean | number }): Promise<TerminalSessionsPressKeysResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSessionsPressKeysRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsPressKeysResponse`

**CLI:** `hoody terminal sessions press`

---

### `read`

**GET** `/api/v1/terminal/raw`

Get raw terminal output

```typescript
client.terminal.sessions.read(options?: { terminal_id?: string; format?: "download" | "text" | "html"; tail?: number; cache?: boolean | number }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | No | query | Terminal session ID (numeric 1-65535, defaults to "1" if not provided). On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send |
| `format` | `"download" \| "text" \| "html"` | No | query | Output format: download, text, or html (defaults to "download" if not provided) |
| `tail` | `number` | No | query | Return only the last N lines of output |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody terminal sessions read`

---

### `reportDiagnostics`

**POST** `/api/v1/terminal/state`

Client render/connection diagnostics beacon

```typescript
client.terminal.sessions.reportDiagnostics(data?: TerminalSessionsReportDiagnosticsRequest): Promise<TerminalSessionsReportDiagnosticsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSessionsReportDiagnosticsRequest` | No | body |  |

**Returns:** `TerminalSessionsReportDiagnosticsResponse`

---

### `search`

**GET** `/api/v1/terminal/find`

Search terminal screen with regex

```typescript
client.terminal.sessions.search(options: { pattern: string; terminal_id: string; scope?: "screen" | "scrollback" | "all"; limit?: number; case_insensitive?: boolean; scroll_offset?: number; cache?: boolean | number }): Promise<TerminalSessionsSearchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `pattern` | `string` | Yes | query | PCRE2 regex pattern to search for (max 1024 bytes) |
| `terminal_id` | `string` | Yes | query | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `scope` | `"screen" \| "scrollback" \| "all"` | No | query | Search scope: screen (default), scrollback, or all |
| `limit` | `number` | No | query | Maximum number of hits to return (default 100, max 1000) |
| `case_insensitive` | `boolean` | No | query | Case-insensitive matching. Default: false |
| `scroll_offset` | `number` | No | query | Scrollback offset for screen scope (0 = live viewport). Default: 0 |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsSearchResponse`

**CLI:** `hoody terminal sessions search`

---

### `sendMouseEvents`

**POST** `/api/v1/terminal/mouse`

Send cell-based mouse events to terminal

```typescript
client.terminal.sessions.sendMouseEvents(data: TerminalSessionsSendMouseEventsRequest, options?: { terminal_id: string; cache?: boolean | number }): Promise<TerminalSessionsSendMouseEventsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSessionsSendMouseEventsRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsSendMouseEventsResponse`

**CLI:** `hoody terminal sessions mouse send`

---

### `wait`

**POST** `/api/v1/terminal/wait`

Wait for terminal condition

```typescript
client.terminal.sessions.wait(data: TerminalSessionsWaitRequest, options?: { terminal_id: string; cache?: boolean | number }): Promise<TerminalSessionsWaitResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSessionsWaitRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsWaitResponse`

**CLI:** `hoody terminal sessions wait`

---

### `write`

**POST** `/api/v1/terminal/write`

Write input to terminal

```typescript
client.terminal.sessions.write(data?: TerminalSessionsWriteRequest, options?: { terminal_id: string; cache?: boolean | number }): Promise<TerminalSessionsWriteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSessionsWriteRequest` | No | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID to write to. On calls routed through a terminal-N containers-proxy hostname, the proxy sets this from the hostname label and overwrites any value you send — pick the terminal via the hostname; supply it directly only when calling the terminal service without the proxy |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSessionsWriteResponse`

**CLI:** `hoody terminal sessions write`

---

## `client.terminal.system` (7 methods)

### `getStats`

**GET** `/api/v1/system/resources`

Get system resources and statistics

```typescript
client.terminal.system.getStats(): Promise<TerminalSystemGetStatsResponse>
```

**Returns:** `TerminalSystemGetStatsResponse`

**CLI:** `hoody terminal system stats`

---

### `listDaemonPrograms`

**GET** `/api/v1/system/daemon`

Get daemon programs configuration

```typescript
client.terminal.system.listDaemonPrograms(): Promise<TerminalSystemListDaemonProgramsResponse>
```

**Returns:** `TerminalSystemListDaemonProgramsResponse`

**CLI:** `hoody terminal system daemon programs list`

---

### `listDisplays`

**GET** `/api/v1/system/displays`

Get display information

```typescript
client.terminal.system.listDisplays(): Promise<TerminalSystemListDisplaysResponse>
```

**Returns:** `TerminalSystemListDisplaysResponse`

**CLI:** `hoody terminal system displays list`

---

### `listPorts`

**GET** `/api/v1/system/ports`

List all listening network ports

```typescript
client.terminal.system.listPorts(options?: { protocol?: string; user?: string; port?: number; ip?: string; skip_program?: string; http_only?: boolean; hoody_only?: boolean; cache?: boolean | number }): Promise<TerminalSystemListPortsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `protocol` | `string` | No | query | Filter by protocol: tcp, udp, or comma-separated list |
| `user` | `string` | No | query | Filter by user (exact match) |
| `port` | `number` | No | query | Filter by specific port number |
| `ip` | `string` | No | query | Filter by IP address (comma-separated list) |
| `skip_program` | `string` | No | query | Exclude specific programs (comma-separated list) |
| `http_only` | `boolean` | No | query | Only return HTTP services |
| `hoody_only` | `boolean` | No | query | Only return Hoody Kit services |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSystemListPortsResponse`

**CLI:** `hoody terminal system ports list`

---

### `reboot`

**POST** `/api/v1/system/reboot`

Reboot the system

```typescript
client.terminal.system.reboot(options?: { delay?: number; cache?: boolean | number }): Promise<TerminalSystemRebootResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `delay` | `number` | No | query | Delay in seconds before reboot, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSystemRebootResponse`

**CLI:** `hoody terminal system reboot`

---

### `shutdown`

**POST** `/api/v1/system/shutdown`

Shutdown the system

```typescript
client.terminal.system.shutdown(options?: { delay?: number; cache?: boolean | number }): Promise<TerminalSystemShutdownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `delay` | `number` | No | query | Delay in seconds before shutdown, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `TerminalSystemShutdownResponse`

**CLI:** `hoody terminal system shutdown`

---

### `stopDisplay`

**POST** `/api/v1/system/displays/{display}/stop`

Stop a display

```typescript
client.terminal.system.stopDisplay(display: number): Promise<TerminalSystemStopDisplayResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `display` | `number` | Yes | path | Display number (the N in :N), 0-65535 |

**Returns:** `TerminalSystemStopDisplayResponse`

**CLI:** `hoody terminal system displays stop`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
