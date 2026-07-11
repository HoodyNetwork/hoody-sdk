# `daemon` — 23 methods

**Version:** 1.0.0-beta.1
**Accessor:** `client.daemon`

```typescript
import * as daemon from '@hoody-ai/hoody-sdk/daemon';
```

---

## `client.daemon.control` (4 methods)

### `disable`

**POST** `/api/v1/daemon/programs/{id}/disable`

Disable a program

```typescript
client.daemon.control.disable(id: number): Promise<DaemonControlDisableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |

**Returns:** `DaemonControlDisableResponse`

**CLI:** `hoody daemon programs disable`

---

### `enable`

**POST** `/api/v1/daemon/programs/{id}/enable`

Enable a program

```typescript
client.daemon.control.enable(id: number): Promise<DaemonControlEnableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |

**Returns:** `DaemonControlEnableResponse`

**CLI:** `hoody daemon programs enable`

---

### `start`

**POST** `/api/v1/daemon/programs/{id}/start`

Start a program or port instance

```typescript
client.daemon.control.start(id: number, data?: DaemonControlStartRequest): Promise<DaemonControlStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |
| `data` | `DaemonControlStartRequest` | No | body |  |

**Returns:** `DaemonControlStartResponse`

**CLI:** `hoody daemon programs start`

---

### `stop`

**POST** `/api/v1/daemon/programs/{id}/stop`

Stop a program or port instance

```typescript
client.daemon.control.stop(id: number, data?: DaemonControlStopRequest): Promise<DaemonControlStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |
| `data` | `DaemonControlStopRequest` | No | body |  |

**Returns:** `DaemonControlStopResponse`

**CLI:** `hoody daemon programs stop`

---

## `client.daemon.health` (1 methods)

### `check`

**GET** `/api/v1/daemon/health`

Service health check

```typescript
client.daemon.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody daemon health`

---

## `client.daemon.programs` (8 methods)

### `add`

**POST** `/api/v1/daemon/programs/add`

Add a new CUSTOM program

```typescript
client.daemon.programs.add(data: DaemonProgramsAddRequest): Promise<DaemonProgramsAddResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DaemonProgramsAddRequest` | Yes | body |  |

**Returns:** `DaemonProgramsAddResponse`

**CLI:** `hoody daemon programs create`

---

### `edit`

**POST** `/api/v1/daemon/programs/edit/{id}`

Edit a program

```typescript
client.daemon.programs.edit(id: number, data: DaemonProgramsEditRequest): Promise<DaemonProgramsEditResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |
| `data` | `DaemonProgramsEditRequest` | Yes | body |  |

**Returns:** `DaemonProgramsEditResponse`

**CLI:** `hoody daemon programs edit`

---

### `get`

**GET** `/api/v1/daemon/programs/{id}`

Get a specific program

```typescript
client.daemon.programs.get(id: number): Promise<DaemonProgramsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |

**Returns:** `DaemonProgramsGetResponse`

**CLI:** `hoody daemon programs get`

---

### `list`

**GET** `/api/v1/daemon/programs`

List all programs

```typescript
client.daemon.programs.list(options?: { hoody_kit?: "true" | "false"; lazy_load?: "true" | "false"; enabled?: "true" | "false"; boot?: "true" | "false"; port?: number; port_from?: number; port_to?: number; include_status?: "true" | "false"; include_stats?: "true" | "false" }): Promise<DaemonProgramsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `hoody_kit` | `"true" \| "false"` | No | query | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `"true" \| "false"` | No | query | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `"true" \| "false"` | No | query | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `port` | `number` | No | query | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `number` | No | query | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start &lt;= port_to AND program.end &gt;= port_from. |
| `port_to` | `number` | No | query | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `"true" \| "false"` | No | query | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `"true" \| "false"` | No | query | Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |

**Returns:** `DaemonProgramsListResponse`

**CLI:** `hoody daemon programs list`

---

### `listAll`

**GET** `/api/v1/daemon/programs`

List all programs (collect all pages)

```typescript
client.daemon.programs.listAll(options?: { hoody_kit?: "true" | "false"; lazy_load?: "true" | "false"; enabled?: "true" | "false"; boot?: "true" | "false"; port?: number; port_from?: number; port_to?: number; include_status?: "true" | "false"; include_stats?: "true" | "false" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `hoody_kit` | `"true" \| "false"` | No | query | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `"true" \| "false"` | No | query | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `"true" \| "false"` | No | query | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `port` | `number` | No | query | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `number` | No | query | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start &lt;= port_to AND program.end &gt;= port_from. |
| `port_to` | `number` | No | query | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `"true" \| "false"` | No | query | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `"true" \| "false"` | No | query | Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |

**Returns:** `unknown[]`

**CLI:** `hoody daemon programs list`

---

### `listIterator`

**GET** `/api/v1/daemon/programs`

List all programs (async iterator)

```typescript
client.daemon.programs.listIterator(options?: { hoody_kit?: "true" | "false"; lazy_load?: "true" | "false"; enabled?: "true" | "false"; boot?: "true" | "false"; port?: number; port_from?: number; port_to?: number; include_status?: "true" | "false"; include_stats?: "true" | "false" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `hoody_kit` | `"true" \| "false"` | No | query | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `"true" \| "false"` | No | query | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `"true" \| "false"` | No | query | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `port` | `number` | No | query | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `number` | No | query | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start &lt;= port_to AND program.end &gt;= port_from. |
| `port_to` | `number` | No | query | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `"true" \| "false"` | No | query | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `"true" \| "false"` | No | query | Include resource stats (CPU, memory, process tree) for each running program. Implies include_status=true. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |

**Returns:** `AsyncIterableIterator&lt;unknown&gt;`

**CLI:** `hoody daemon programs list`

---

### `remove`

**POST** `/api/v1/daemon/programs/remove/{id}`

Remove a program

```typescript
client.daemon.programs.remove(id: number): Promise<DaemonProgramsRemoveResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |

**Returns:** `DaemonProgramsRemoveResponse`

**CLI:** `hoody daemon programs delete`

---

### `reset`

**POST** `/api/v1/daemon/programs/reset`

Reset programs to default

```typescript
client.daemon.programs.reset(): Promise<DaemonProgramsResetResponse>
```

**Returns:** `DaemonProgramsResetResponse`

**CLI:** `hoody daemon programs reset`

---

## `client.daemon.quickStart` (7 methods)

### `getEphemeralLogs`

**GET** `/api/v1/daemon/quick-start/{id}/logs`

Get ephemeral program logs

```typescript
client.daemon.quickStart.getEphemeralLogs(id: string, options?: { type?: "stdout" | "stderr"; lines?: number }): Promise<DaemonQuickStartGetEphemeralLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Ephemeral program temporary ID |
| `type` | `"stdout" \| "stderr"` | No | query | Log stream: stdout or stderr |
| `lines` | `number` | No | query | Number of lines to return from end of file |

**Returns:** `DaemonQuickStartGetEphemeralLogsResponse`

**CLI:** `hoody daemon ephemeral logs`

---

### `getStatus`

**GET** `/api/v1/daemon/quick-start/{id}/status`

Get ephemeral program status

```typescript
client.daemon.quickStart.getStatus(id: string): Promise<DaemonQuickStartGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Temporary ID of the ephemeral program (format: quick_&lt;timestamp&gt;) |

**Returns:** `DaemonQuickStartGetStatusResponse`

**CLI:** `hoody daemon ephemeral status`

---

### `launch`

**POST** `/api/v1/daemon/quick-start`

Launch ephemeral CUSTOM program

```typescript
client.daemon.quickStart.launch(data: DaemonQuickStartLaunchRequest): Promise<DaemonQuickStartLaunchResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DaemonQuickStartLaunchRequest` | Yes | body |  |

**Returns:** `DaemonQuickStartLaunchResponse`

**CLI:** `hoody daemon ephemeral start`

---

### `list`

**GET** `/api/v1/daemon/quick-start`

List all ephemeral programs

```typescript
client.daemon.quickStart.list(): Promise<DaemonQuickStartListResponse>
```

**Returns:** `DaemonQuickStartListResponse`

**CLI:** `hoody daemon ephemeral list`

---

### `listAll`

**GET** `/api/v1/daemon/quick-start`

List all ephemeral programs (collect all pages)

```typescript
client.daemon.quickStart.listAll(): Promise<unknown[]>
```

**Returns:** `unknown[]`

**CLI:** `hoody daemon ephemeral list`

---

### `listIterator`

**GET** `/api/v1/daemon/quick-start`

List all ephemeral programs (async iterator)

```typescript
client.daemon.quickStart.listIterator(): AsyncIterableIterator<unknown>
```

**Returns:** `AsyncIterableIterator&lt;unknown&gt;`

**CLI:** `hoody daemon ephemeral list`

---

### `stop`

**POST** `/api/v1/daemon/quick-start/{id}/stop`

Stop ephemeral program

```typescript
client.daemon.quickStart.stop(id: string): Promise<DaemonQuickStartStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Temporary ID of the ephemeral program to stop |

**Returns:** `DaemonQuickStartStopResponse`

**CLI:** `hoody daemon ephemeral stop`

---

## `client.daemon.status` (3 methods)

### `get`

**GET** `/api/v1/daemon/status/{id}`

Get specific program status

```typescript
client.daemon.status.get(id: number, options?: { port?: number; include_stats?: "true" | "false" }): Promise<DaemonStatusGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program |
| `port` | `number` | No | query | Filter to specific port instance (for port-range programs only) |
| `include_stats` | `"true" \| "false"` | No | query | Include resource stats (CPU, memory, process tree) for running programs. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. |

**Returns:** `DaemonStatusGetResponse`

**CLI:** `hoody daemon programs status`

---

### `getAll`

**GET** `/api/v1/daemon/status`

Get all program statuses

```typescript
client.daemon.status.getAll(): Promise<DaemonStatusGetAllResponse>
```

**Returns:** `DaemonStatusGetAllResponse`

**CLI:** `hoody daemon programs statuses`

---

### `getLogs`

**GET** `/api/v1/daemon/programs/{id}/logs`

Get program logs

```typescript
client.daemon.status.getLogs(id: number, options?: { type?: "stdout" | "stderr"; lines?: number; port?: number }): Promise<DaemonStatusGetLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Program ID |
| `type` | `"stdout" \| "stderr"` | No | query | Log stream: stdout or stderr |
| `lines` | `number` | No | query | Number of lines to return from end of file |
| `port` | `number` | No | query | Port number (required for port-range programs) |

**Returns:** `DaemonStatusGetLogsResponse`

**CLI:** `hoody daemon programs logs`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
