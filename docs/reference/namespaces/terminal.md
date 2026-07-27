# `terminal` — 48 methods

**Version:** 1.0.0-beta.7
**Accessor:** `client.terminal`

```typescript
import * as terminal from 'hoody-sdk/terminal';
```

---

## `client.terminal.docs` (2 methods)

### `getJson`

**GET** `/api/v1/terminal/openapi.json`

Get OpenAPI specification in JSON format

```typescript
client.terminal.docs.getJson(): Promise<TerminalDocsGetJsonResponse>
```

**Returns:** `TerminalDocsGetJsonResponse`

---

### `getYaml`

**GET** `/api/v1/terminal/openapi.yaml`

Get OpenAPI specification in YAML format

```typescript
client.terminal.docs.getYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

---

## `client.terminal.execution` (2 methods)

### `execute`

**POST** `/api/v1/terminal/execute`

Execute command in terminal session

```typescript
client.terminal.execution.execute(data: TerminalExecutionExecuteRequest, options?: { terminal_id?: string; ephemeral?: boolean; defer_pid?: number; defer_start_time_ticks?: string; defer_timeout_ms?: number; defer_poll_ms?: number; reset?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string; skip_display_wait?: boolean; display_wait_timeout?: number; display?: string; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; ssh_key?: string; socks5_pass?: string }): Promise<TerminalExecutionExecuteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalExecutionExecuteRequest` | Yes | body |  |
| `terminal_id` | `string` | No | query | Terminal session ID (numeric 1-65535). Use terminal_id=0 as an explicit sentinel meaning "no terminal ID" (treated as absent, useful when a reverse proxy always injects a terminal_id). Required unless ephemeral=true, in which case it is auto-generated if not provided |
| `ephemeral` | `boolean` | No | query | When true, auto-generates a unique terminal_id (if not provided), skips display/dbus initialization, and applies aggressive cleanup. Designed for programmatic CLI command execution like child_process.exec (default: false). WARNING: Do NOT use ephemeral=true for GUI applications that require a display. Ephemeral sessions strip the DISPLAY environment variable, which means X11/GUI applications will not work. Use a regular terminal session with an explicit terminal_id and display parameter instead for GUI workloads |
| `defer_pid` | `number` | No | query | Defer command injection until this PID exits (TUI-safe). If set, the API returns immediately regardless of wait=true |
| `defer_start_time_ticks` | `string` | No | query | Optional /proc/&lt;pid&gt;/stat field 22 (starttime in clock ticks since boot) to avoid PID reuse bugs. If it mismatches, command executes immediately |
| `defer_timeout_ms` | `number` | No | query | Max time to wait for defer_pid exit before failing (default: 60000) |
| `defer_poll_ms` | `number` | No | query | Poll interval while waiting for defer_pid exit (default: 50, minimum: 10) |
| `reset` | `boolean` | No | query | Reset existing session and reconfigure (kills current process, clears state, allows switching from bash to SSH or changing any parameter) - Use 'true', '1', or no value |
| `cwd` | `string` | No | query | Working directory for local bash sessions (ignored for SSH) |
| `cwd_auto_create` | `boolean` | No | query | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new or reset local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | No | query | Shell to use for local sessions: bash (case-insensitive), zsh, fish, sh, etc. (default: server startup command, only applies to new sessions or after reset) |
| `user` | `string` | No | query | System user to spawn shell as (requires su permissions, only applies to new sessions or after reset) |
| `cmd` | `string` | No | query | Base64-encoded command to execute automatically (works with both new and active shells, executes every time URL is visited) |
| `env` | `string` | No | query | Environment variable in KEY=VALUE format (can be repeated for multiple variables, e.g., ?env=DEBUG=1&env=API_KEY=abc) |
| `skip_display_wait` | `boolean` | No | query | Skip waiting for Hoody Display readiness before executing command. By default, if a DISPLAY is configured, the endpoint blocks until the display server on port 4000+display_num is ready (default: false) |
| `display_wait_timeout` | `number` | No | query | Timeout in seconds for display readiness wait (default: 10, capped at 10 seconds to prevent event-loop pin; values &lt;=0 or malformed also map to the 10-second cap). Ignored if skip_display_wait=true |
| `display` | `string` | No | query | DISPLAY environment variable for X11 applications (auto-formats:display if number provided, e.g., ?display=1 becomes DISPLAY=:1) |
| `ssh_host` | `string` | No | query | SSH server hostname or IP address (creates SSH session if provided with ssh_user) |
| `ssh_user` | `string` | No | query | SSH username (required if ssh_host is provided) |
| `ssh_port` | `string` | No | query | SSH port number (default: 22) |
| `ssh_password` | `string` | No | query | SSH password for authentication (use with caution, prefer key-based auth) |
| `socks5_host` | `string` | No | query | SOCKS5 proxy hostname for SSH connection |
| `socks5_port` | `string` | No | query | SOCKS5 proxy port (default: 1080) |
| `socks5_user` | `string` | No | query | SOCKS5 proxy username for authentication |
| `ssh_key` | `string` | No | query | Base64-encoded SSH private key for key-based authentication (prefer over password-based auth) |
| `socks5_pass` | `string` | No | query | SOCKS5 proxy password for authentication |

**Returns:** `TerminalExecutionExecuteResponse`

**CLI:** `hoody terminal sessions exec`

---

### `getResult`

**GET** `/api/v1/terminal/result/{command_id}`

Get command result

```typescript
client.terminal.execution.getResult(command_id: string): Promise<TerminalExecutionGetResultResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `command_id` | `string` | Yes | path | Command ID returned from /api/v1/terminal/execute (numeric 1-65535) |

**Returns:** `TerminalExecutionGetResultResponse`

**CLI:** `hoody terminal sessions command-result`

---

## `client.terminal.health` (1 method)

### `check`

**GET** `/api/v1/terminal/health`

Service health check

```typescript
client.terminal.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody terminal health`

---

## `client.terminal.sessions` (11 methods)

### `captureScreenshot`

**GET** `/api/v1/terminal/screenshot`

Capture terminal screenshot

```typescript
client.terminal.sessions.captureScreenshot(options?: { terminal_id: string; format?: "png" | "jpeg" | "gif"; foreground?: string; background?: string; fontsize?: number; save?: boolean }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535) |
| `format` | `"png" \| "jpeg" \| "gif"` | No | query | Output format: png, jpeg, gif (default: png) |
| `foreground` | `string` | No | query | Foreground color: black, red, green, yellow, blue, magenta, cyan, white, or RGB (R,G,B,A) (default: white) |
| `background` | `string` | No | query | Background color: same as foreground options (default: black) |
| `fontsize` | `number` | No | query | Font size in pixels (default: 20) |
| `save` | `boolean` | No | query | Save to storage directory (default: true) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody terminal sessions screenshot`

---

### `connectWebSocket`

**GET** `/api/v1/terminal/ws`

WebSocket terminal connection

```typescript
client.terminal.sessions.connectWebSocket(options?: { terminal_id?: string; readonly?: boolean; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; env?: string; display?: string; pid?: number; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string }): Promise<TerminalConnectTerminalWebSocketWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | No | query | Terminal session ID (numeric 1-65535, auto-generated if not provided) - Multiple clients can share by using same ID |
| `readonly` | `boolean` | No | query | Enable read-only mode for this client (blocks keyboard input) - Use 'true', '1', or no value |
| `cwd` | `string` | No | query | Working directory for new sessions |
| `cwd_auto_create` | `boolean` | No | query | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new local session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | No | query | Shell to use (bash, zsh, fish, tmux, ssh, etc.) |
| `user` | `string` | No | query | System user to spawn shell as (requires permissions) |
| `cmd` | `string` | No | query | Base64-encoded command to auto-execute on spawn |
| `env` | `string` | No | query | Environment variable KEY=VALUE (repeatable) |
| `display` | `string` | No | query | DISPLAY variable for X11 apps (auto-formats:N) |
| `pid` | `number` | No | query | Attach to existing process PID for monitoring |
| `ssh_host` | `string` | No | query | SSH server hostname/IP for remote connections |
| `ssh_user` | `string` | No | query | SSH username (required if ssh_host provided) |
| `ssh_port` | `string` | No | query | SSH port (default: 22) |
| `ssh_password` | `string` | No | query | SSH password (use with caution) |
| `socks5_host` | `string` | No | query | SOCKS5 proxy for SSH |
| `socks5_port` | `string` | No | query | SOCKS5 port (default: 1080) |

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
| `terminal_id` | `string` | Yes | path | Terminal session ID to delete (numeric 1-65535) |

**Returns:** `TerminalSessionsDeleteResponse`

**CLI:** `hoody terminal sessions delete`

---

### `getRawOutput`

**GET** `/api/v1/terminal/raw`

Get raw terminal output

```typescript
client.terminal.sessions.getRawOutput(options?: { terminal_id?: string; format?: "download" | "text" | "html"; tail?: number }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | No | query | Terminal session ID (numeric 1-65535, defaults to "1" if not provided) |
| `format` | `"download" \| "text" \| "html"` | No | query | Output format: download, text, or html (defaults to "download" if not provided) |
| `tail` | `number` | No | query | Return only the last N lines of output |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody terminal sessions raw-output`

---

### `list`

**GET** `/api/v1/terminal/sessions`

List all terminal sessions

```typescript
client.terminal.sessions.list(options?: { history_limit?: number; history_lines?: number }): Promise<TerminalSessionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `history_limit` | `number` | No | query | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `number` | No | query | Alias of history_limit |

**Returns:** `TerminalSessionsListResponse`

**CLI:** `hoody terminal sessions list`

---

### `listAll`

**GET** `/api/v1/terminal/sessions`

List all terminal sessions (collect all pages)

```typescript
client.terminal.sessions.listAll(options?: { history_limit?: number; history_lines?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `history_limit` | `number` | No | query | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `number` | No | query | Alias of history_limit |

**Returns:** `unknown[]`

**CLI:** `hoody terminal sessions list`

---

### `listHistory`

**GET** `/api/v1/terminal/history/{terminal_id}`

Get terminal command history

```typescript
client.terminal.sessions.listHistory(terminal_id: string): Promise<TerminalSessionsListHistoryResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | path | Terminal session ID (numeric 1-65535, can also be provided as query parameter) |

**Returns:** `TerminalSessionsListHistoryResponse`

**CLI:** `hoody terminal sessions history`

---

### `listHistoryAll`

**GET** `/api/v1/terminal/history/{terminal_id}`

Get terminal command history (collect all pages)

```typescript
client.terminal.sessions.listHistoryAll(terminal_id: string): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | path | Terminal session ID (numeric 1-65535, can also be provided as query parameter) |

**Returns:** `unknown[]`

**CLI:** `hoody terminal sessions history`

---

### `listHistoryIterator`

**GET** `/api/v1/terminal/history/{terminal_id}`

Get terminal command history (async iterator)

```typescript
client.terminal.sessions.listHistoryIterator(terminal_id: string): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | path | Terminal session ID (numeric 1-65535, can also be provided as query parameter) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody terminal sessions history`

---

### `listIterator`

**GET** `/api/v1/terminal/sessions`

List all terminal sessions (async iterator)

```typescript
client.terminal.sessions.listIterator(options?: { history_limit?: number; history_lines?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `history_limit` | `number` | No | query | Max command_history entries to include per session (default: 50, max: 1000) |
| `history_lines` | `number` | No | query | Alias of history_limit |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody terminal sessions list`

---

## `client.terminal.system` (15 methods)

### `freezeProcess`

**POST** `/api/v1/system/processes/freeze`

Freeze (SIGSTOP) a process or process tree

```typescript
client.terminal.system.freezeProcess(data: FreezeProcessRequest): Promise<FreezeProcessResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `FreezeProcessRequest` | Yes | body |  |

**Returns:** `FreezeProcessResponse`

---

### `getDaemonConfig`

**GET** `/api/v1/system/daemon`

Get daemon programs configuration

```typescript
client.terminal.system.getDaemonConfig(): Promise<TerminalSystemGetDaemonConfigResponse>
```

**Returns:** `TerminalSystemGetDaemonConfigResponse`

**CLI:** `hoody terminal system daemon-config`

---

### `getDisplayInfo`

**GET** `/api/v1/system/displays`

Get display information

```typescript
client.terminal.system.getDisplayInfo(): Promise<TerminalSystemGetDisplayInfoResponse>
```

**Returns:** `TerminalSystemGetDisplayInfoResponse`

**CLI:** `hoody terminal system display-info`

---

### `getProcess`

**GET** `/api/v1/system/processes/{pid}`

Get process details by PID

```typescript
client.terminal.system.getProcess(pid: number): Promise<TerminalSystemGetProcessResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `pid` | `number` | Yes | path | Process ID |

**Returns:** `TerminalSystemGetProcessResponse`

**CLI:** `hoody terminal processes get`

---

### `getResources`

**GET** `/api/v1/system/resources`

Get system resources and statistics

```typescript
client.terminal.system.getResources(): Promise<TerminalSystemGetResourcesResponse>
```

**Returns:** `TerminalSystemGetResourcesResponse`

**CLI:** `hoody terminal system resources`

---

### `listPorts`

**GET** `/api/v1/system/ports`

List all listening network ports

```typescript
client.terminal.system.listPorts(options?: { protocol?: string; user?: string; port?: number; ip?: string; skip_program?: string; http_only?: boolean; hoody_only?: boolean }): Promise<TerminalSystemListPortsResponse>
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

**Returns:** `TerminalSystemListPortsResponse`

**CLI:** `hoody terminal system ports`

---

### `listPortsAll`

**GET** `/api/v1/system/ports`

List all listening network ports (collect all pages)

```typescript
client.terminal.system.listPortsAll(options?: { protocol?: string; user?: string; port?: number; ip?: string; skip_program?: string; http_only?: boolean; hoody_only?: boolean }): Promise<unknown[]>
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

**Returns:** `unknown[]`

**CLI:** `hoody terminal system ports`

---

### `listPortsIterator`

**GET** `/api/v1/system/ports`

List all listening network ports (async iterator)

```typescript
client.terminal.system.listPortsIterator(options?: { protocol?: string; user?: string; port?: number; ip?: string; skip_program?: string; http_only?: boolean; hoody_only?: boolean }): AsyncIterableIterator<unknown>
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

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody terminal system ports`

---

### `listProcesses`

**GET** `/api/v1/system/processes`

List all system processes

```typescript
client.terminal.system.listProcesses(options?: { sort?: "cpu" | "memory" | "pid" | "name"; limit?: number; filter?: string }): Promise<TerminalSystemListProcessesResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sort` | `"cpu" \| "memory" \| "pid" \| "name"` | No | query | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `number` | No | query | Maximum number of processes to return (default: all) |
| `filter` | `string` | No | query | Filter by process name (substring match, case-insensitive) |

**Returns:** `TerminalSystemListProcessesResponse`

**CLI:** `hoody terminal processes list`

---

### `listProcessesAll`

**GET** `/api/v1/system/processes`

List all system processes (collect all pages)

```typescript
client.terminal.system.listProcessesAll(options?: { sort?: "cpu" | "memory" | "pid" | "name"; limit?: number; filter?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sort` | `"cpu" \| "memory" \| "pid" \| "name"` | No | query | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `number` | No | query | Maximum number of processes to return (default: all) |
| `filter` | `string` | No | query | Filter by process name (substring match, case-insensitive) |

**Returns:** `unknown[]`

**CLI:** `hoody terminal processes list`

---

### `listProcessesIterator`

**GET** `/api/v1/system/processes`

List all system processes (async iterator)

```typescript
client.terminal.system.listProcessesIterator(options?: { sort?: "cpu" | "memory" | "pid" | "name"; limit?: number; filter?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `sort` | `"cpu" \| "memory" \| "pid" \| "name"` | No | query | Sort by field: cpu, memory, pid, name (default: pid) |
| `limit` | `number` | No | query | Maximum number of processes to return (default: all) |
| `filter` | `string` | No | query | Filter by process name (substring match, case-insensitive) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody terminal processes list`

---

### `reboot`

**POST** `/api/v1/system/reboot`

Reboot the system

```typescript
client.terminal.system.reboot(options?: { delay?: number }): Promise<TerminalSystemRebootResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `delay` | `number` | No | query | Delay in seconds before reboot, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**Returns:** `TerminalSystemRebootResponse`

**CLI:** `hoody terminal system reboot`

---

### `sendSignal`

**POST** `/api/v1/system/process/signal`

Send signal to process(es)

```typescript
client.terminal.system.sendSignal(data: TerminalSystemSendSignalRequest): Promise<TerminalSystemSendSignalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalSystemSendSignalRequest` | Yes | body |  |

**Returns:** `TerminalSystemSendSignalResponse`

**CLI:** `hoody terminal processes signal`

---

### `shutdown`

**POST** `/api/v1/system/shutdown`

Shutdown the system

```typescript
client.terminal.system.shutdown(options?: { delay?: number }): Promise<TerminalSystemShutdownResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `delay` | `number` | No | query | Delay in seconds before shutdown, 0..86400 (default: 0 for immediate). shutdown(8) schedules in whole minutes, so the server rounds UP to the nearest minute and reports the actual scheduled value as `effective_minutes` in the response. |

**Returns:** `TerminalSystemShutdownResponse`

**CLI:** `hoody terminal system shutdown`

---

### `unfreezeProcess`

**POST** `/api/v1/system/processes/unfreeze`

Unfreeze (SIGCONT) a process or process tree

```typescript
client.terminal.system.unfreezeProcess(data: UnfreezeProcessRequest): Promise<UnfreezeProcessResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `UnfreezeProcessRequest` | Yes | body |  |

**Returns:** `UnfreezeProcessResponse`

---

## `client.terminal` (2 methods)

### `abort`

**POST** `/api/v1/terminal/execute/{command_id}/abort`

Abort a running command

```typescript
client.terminal.abort(command_id: string, data?: TerminalAbortRequest): Promise<TerminalAbortResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `command_id` | `string` | Yes | path | The command ID returned by the execute endpoint |
| `data` | `TerminalAbortRequest` | No | body |  |

**Returns:** `TerminalAbortResponse`

**CLI:** `hoody terminal sessions abort`

---

### `write`

**POST** `/api/v1/terminal/write`

Write input to terminal

```typescript
client.terminal.write(data?: TerminalWriteRequest, options?: { terminal_id: string }): Promise<TerminalWriteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `TerminalWriteRequest` | No | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID to write to |

**Returns:** `TerminalWriteResponse`

**CLI:** `hoody terminal sessions write`

---

## `client.terminal.terminalAutomation` (9 methods)

### `findInTerminal`

**GET** `/api/v1/terminal/find`

Search terminal screen with regex

```typescript
client.terminal.terminalAutomation.findInTerminal(options?: { pattern: string; terminal_id: string; scope?: "screen" | "scrollback" | "all"; limit?: number; case_insensitive?: boolean; scroll_offset?: number }): Promise<FindInTerminalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `pattern` | `string` | Yes | query | PCRE2 regex pattern to search for (max 1024 bytes) |
| `terminal_id` | `string` | Yes | query | Terminal session ID |
| `scope` | `"screen" \| "scrollback" \| "all"` | No | query | Search scope: screen (default), scrollback, or all |
| `limit` | `number` | No | query | Maximum number of hits to return (default 100, max 1000) |
| `case_insensitive` | `boolean` | No | query | Case-insensitive matching. Default: false |
| `scroll_offset` | `number` | No | query | Scrollback offset for screen scope (0 = live viewport). Default: 0 |

**Returns:** `FindInTerminalResponse`

**CLI:** `hoody terminal sessions find`

---

### `getAutomationMetrics`

**GET** `/api/v1/terminal/automation/metrics`

Get terminal automation metrics

```typescript
client.terminal.terminalAutomation.getAutomationMetrics(): Promise<GetAutomationMetricsResponse>
```

**Returns:** `GetAutomationMetricsResponse`

**CLI:** `hoody terminal automation metrics`

---

### `getSessionAutomationState`

**GET** `/api/v1/terminal/{terminal_id}/automation`

Get per-session automation state

```typescript
client.terminal.terminalAutomation.getSessionAutomationState(terminal_id: string): Promise<GetSessionAutomationStateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | path | Terminal session ID |

**Returns:** `GetSessionAutomationStateResponse`

**CLI:** `hoody terminal sessions automation-state`

---

### `getTerminalSnapshot`

**GET** `/api/v1/terminal/snapshot`

Get rendered terminal snapshot

```typescript
client.terminal.terminalAutomation.getTerminalSnapshot(options?: { terminal_id: string; include_colors?: boolean; include_highlights?: boolean; scroll_offset?: number }): Promise<GetTerminalSnapshotResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535) |
| `include_colors` | `boolean` | No | query | Include ANSI SGR colored_lines array alongside plain text lines. Default: false |
| `include_highlights` | `boolean` | No | query | Include reverse-video highlight spans. Default: true |
| `scroll_offset` | `number` | No | query | Lines into scrollback (0 = live viewport). Default: 0 |

**Returns:** `GetTerminalSnapshotResponse`

**CLI:** `hoody terminal sessions snapshot`

---

### `listSupportedKeys`

**GET** `/api/v1/terminal/keys`

List supported key names for /press endpoint

```typescript
client.terminal.terminalAutomation.listSupportedKeys(): Promise<ListSupportedKeysResponse>
```

**Returns:** `ListSupportedKeysResponse`

**CLI:** `hoody terminal automation keys`

---

### `pasteTerminalText`

**POST** `/api/v1/terminal/paste`

Paste text into terminal

```typescript
client.terminal.terminalAutomation.pasteTerminalText(data: PasteTerminalTextRequest, options?: { terminal_id: string }): Promise<PasteTerminalTextResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `PasteTerminalTextRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID |

**Returns:** `PasteTerminalTextResponse`

**CLI:** `hoody terminal sessions paste`

---

### `pressTerminalKeys`

**POST** `/api/v1/terminal/press`

Send named key presses to terminal

```typescript
client.terminal.terminalAutomation.pressTerminalKeys(data: PressTerminalKeysRequest, options?: { terminal_id: string }): Promise<PressTerminalKeysResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `PressTerminalKeysRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID |

**Returns:** `PressTerminalKeysResponse`

**CLI:** `hoody terminal sessions press`

---

### `sendTerminalMouseEvents`

**POST** `/api/v1/terminal/mouse`

Send cell-based mouse events to terminal

```typescript
client.terminal.terminalAutomation.sendTerminalMouseEvents(data: SendTerminalMouseEventsRequest, options?: { terminal_id: string }): Promise<SendTerminalMouseEventsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `SendTerminalMouseEventsRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID |

**Returns:** `SendTerminalMouseEventsResponse`

---

### `waitForTerminal`

**POST** `/api/v1/terminal/wait`

Wait for terminal condition

```typescript
client.terminal.terminalAutomation.waitForTerminal(data: WaitForTerminalRequest, options?: { terminal_id: string }): Promise<WaitForTerminalResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `WaitForTerminalRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID |

**Returns:** `WaitForTerminalResponse`

**CLI:** `hoody terminal sessions wait`

---

## `client.terminal.terminalDragAndDrop` (4 methods)

### `beginTerminalDrop`

**POST** `/api/v1/terminal/drop-begin`

Begin a drag-and-drop staging transaction

```typescript
client.terminal.terminalDragAndDrop.beginTerminalDrop(options?: { terminal_id: string }): Promise<BeginTerminalDropResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535) |

**Returns:** `BeginTerminalDropResponse`

---

### `commitTerminalDrop`

**POST** `/api/v1/terminal/drop-commit`

Finalize a drop and inject the OSC frame

```typescript
client.terminal.terminalDragAndDrop.commitTerminalDrop(data: CommitTerminalDropRequest, options?: { drop: string; token: string; terminal_id: string }): Promise<CommitTerminalDropResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CommitTerminalDropRequest` | Yes | body |  |
| `drop` | `string` | Yes | query | Drop id from /drop-begin |
| `token` | `string` | Yes | query | Drop token from /drop-begin |
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535) |

**Returns:** `CommitTerminalDropResponse`

---

### `oneShotTerminalDrop`

**POST** `/api/v1/terminal/drop`

One-shot drop (begin + stage + commit)

```typescript
client.terminal.terminalDragAndDrop.oneShotTerminalDrop(data: OneShotTerminalDropRequest, options?: { terminal_id: string }): Promise<OneShotTerminalDropResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `OneShotTerminalDropRequest` | Yes | body |  |
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535) |

**Returns:** `OneShotTerminalDropResponse`

---

### `uploadTerminalDropSlice`

**POST** `/api/v1/terminal/upload`

Upload a raw file slice into a drop

```typescript
client.terminal.terminalDragAndDrop.uploadTerminalDropSlice(data: object, options?: { drop: string; token: string; path: string; offset: number; terminal_id: string }): Promise<UploadTerminalDropSliceResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `object` | Yes | body |  |
| `drop` | `string` | Yes | query | Drop id from /drop-begin |
| `token` | `string` | Yes | query | Drop token from /drop-begin |
| `path` | `string` | Yes | query | Sanitized relative path of the staged file (no `..`, not absolute) |
| `offset` | `number` | Yes | query | Byte offset to write at (must equal the current staged size) |
| `terminal_id` | `string` | Yes | query | Terminal session ID (numeric 1-65535) |

**Returns:** `UploadTerminalDropSliceResponse`

---

## `client.terminal.terminalState` (1 method)

### `postTerminalState`

**POST** `/api/v1/terminal/state`

Client render/connection diagnostics beacon

```typescript
client.terminal.terminalState.postTerminalState(data?: PostTerminalStateRequest): Promise<PostTerminalStateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `PostTerminalStateRequest` | No | body |  |

**Returns:** `PostTerminalStateResponse`

---

## `client.terminal.web` (1 method)

### `get`

**GET** `/`

Get web terminal interface

```typescript
client.terminal.web.get(options?: { terminal_id?: string; cwd?: string; cwd_auto_create?: boolean; shell?: string; user?: string; cmd?: string; readonly?: boolean; title?: string; fontSize?: number; backgroundColor?: string; panel?: string; panelVisible?: boolean; panelPosition?: string; panelWidth?: string; panelResizable?: boolean; hideToolbar?: boolean; ssh_host?: string; ssh_user?: string; ssh_port?: string; ssh_password?: string; socks5_host?: string; socks5_port?: string; socks5_user?: string; socks5_pass?: string; desktop?: boolean; desktop_env?: string; redirect?: string; redirect_delay?: number; arg?: string; welcome?: boolean; debug?: boolean; reset?: boolean; pid?: number; env?: string; display?: string; env_inject?: boolean; startup_script?: string; ssh_key?: string; panelHeight?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `terminal_id` | `string` | No | query | Terminal session ID (numeric 1-65535, auto-generated if not provided) - Allows multiple clients to share the same terminal session |
| `cwd` | `string` | No | query | Initial working directory for new terminal sessions (only applied when session is first created) |
| `cwd_auto_create` | `boolean` | No | query | Auto-create cwd when the requested working directory does not exist yet. Only applies when cwd is explicitly provided for a new session. Enable with 'true', '1', or no value (default: false) |
| `shell` | `string` | No | query | Shell to use: bash, zsh, fish, sh, etc. (default: server startup command, only applies to new sessions) |
| `user` | `string` | No | query | System user to spawn shell as (requires su permissions, only applies to new sessions, user must exist on system) |
| `cmd` | `string` | No | query | Base64-encoded command to execute automatically on spawn (executes once when shell starts) |
| `readonly` | `boolean` | No | query | Enable read-only mode (blocks keyboard input, allows viewing only) - Use 'true', '1', or no value |
| `title` | `string` | No | query | Browser window/tab title (default: application default) - HTML tags removed, max 200 characters, useful for organizing multiple terminal tabs |
| `fontSize` | `number` | No | query | Terminal font size in pixels (default: 13, range: 8-72) - Accepts 'px' suffix (e.g., 16px), applied immediately when terminal loads |
| `backgroundColor` | `string` | No | query | Terminal background color (default: #2b2b2b) - Supports hex colors (#RGB, #RRGGBB, #RRGGBBAA) or CSS named colors (black, white, red, blue, green, navy, etc.) |
| `panel` | `string` | No | query | URL to display in side panel iframe (enables panel feature) |
| `panelVisible` | `boolean` | No | query | Show panel on load (default: true if panel URL provided, false otherwise) |
| `panelPosition` | `string` | No | query | Panel position: 'left' or 'right' (default: right) |
| `panelWidth` | `string` | No | query | Initial panel width in pixels or percentage (default: 400px) |
| `panelResizable` | `boolean` | No | query | Allow panel resizing via drag handle (default: true) |
| `hideToolbar` | `boolean` | No | query | Hide the terminal toolbar (default: false) |
| `ssh_host` | `string` | No | query | SSH server hostname or IP address (creates SSH session if provided with ssh_user) |
| `ssh_user` | `string` | No | query | SSH username (required if ssh_host is provided) |
| `ssh_port` | `string` | No | query | SSH port number (default: 22) |
| `ssh_password` | `string` | No | query | SSH password for authentication (use with caution, prefer key-based auth) |
| `socks5_host` | `string` | No | query | SOCKS5 proxy hostname for SSH connection |
| `socks5_port` | `string` | No | query | SOCKS5 proxy port (default: 1080) |
| `socks5_user` | `string` | No | query | SOCKS5 proxy username for authentication |
| `socks5_pass` | `string` | No | query | SOCKS5 proxy password for authentication |
| `desktop` | `boolean` | No | query | Enable Hoody Display desktop mode. Provides a full desktop environment instead of seamless individual windows (default: false) |
| `desktop_env` | `string` | No | query | Desktop environment to launch (implies desktop=true). Starts the specified DE session after the display is ready. Valid values: xfce, mate |
| `redirect` | `string` | No | query | Redirect mode. When set to "display", creates/ensures the terminal session, waits for X11 display readiness, then returns HTTP 302 redirect to the display URL. Requires terminal_id and display params |
| `redirect_delay` | `number` | No | query | Extra delay in seconds after display is ready before redirecting. Only used when redirect=display (default: 0) |
| `arg` | `string` | No | query | Command-line arguments to pass to shell (requires --url-arg server option, can be repeated) |
| `welcome` | `boolean` | No | query | Show welcome message on startup (default: false). Supports ?welcome=true, ?welcome=1, or ?welcome (no value = true) |
| `debug` | `boolean` | No | query | Enable debug output in wrapper script (default: false) |
| `reset` | `boolean` | No | query | Kill existing terminal process and reconfigure session (default: false). Use to switch shell, user, or from shell to SSH |
| `pid` | `number` | No | query | Attach to an existing process by PID instead of spawning a new shell. Implies reset |
| `env` | `string` | No | query | Inject environment variable as KEY=VALUE. Can be repeated for multiple variables (e.g., ?env=FOO=bar&env=BAZ=qux) |
| `display` | `string` | No | query | X11 display number for GUI applications. Accepts number (e.g., 1) or:number (e.g.,:1). Shorthand for ?env=DISPLAY=:N |
| `env_inject` | `boolean` | No | query | Inject HOODY_* environment variables into shell session (default: true). Set to false to disable |
| `startup_script` | `string` | No | query | Path to startup script to execute before shell launch (only applied on first session creation) |
| `ssh_key` | `string` | No | query | Base64-encoded SSH private key for key-based authentication (prefer over password-based auth) |
| `panelHeight` | `string` | No | query | Initial panel height for top/bottom positioned panels (default: 300px) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody terminal sessions web`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
