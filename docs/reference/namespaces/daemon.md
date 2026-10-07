# `daemon` — 21 methods

**Version:** 1.0.0-beta.16
**Accessor:** `client.daemon`

```typescript
import * as daemon from 'hoody-sdk/daemon';
```

---

## `client.daemon.ephemeralPrograms` (5 methods)

### `getLogs`

**GET** `/api/v1/daemon/quick-start/{id}/logs`

Get ephemeral program logs

```typescript
client.daemon.ephemeralPrograms.getLogs(id: string, options?: { type?: "stdout" | "stderr"; lines?: number; cache?: boolean | number }): Promise<DaemonEphemeralProgramsGetLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Ephemeral program temporary ID |
| `type` | `"stdout" \| "stderr"` | No | query | Log stream: stdout or stderr |
| `lines` | `number` | No | query | Number of lines to return from the end of the file (default 100). A non-negative integer: `0` returns empty content, and the server clamps values above 10000 to 10000. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DaemonEphemeralProgramsGetLogsResponse`

**CLI:** `hoody daemon ephemeral programs logs get`

---

### `getStatus`

**GET** `/api/v1/daemon/quick-start/{id}/status`

Get ephemeral program status

```typescript
client.daemon.ephemeralPrograms.getStatus(id: string): Promise<DaemonEphemeralProgramsGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Temporary ID of the ephemeral program, as returned in `temporary_id` (`quick_&lt;unix-ms&gt;_&lt;sequence&gt;`). |

**Returns:** `DaemonEphemeralProgramsGetStatusResponse`

**CLI:** `hoody daemon ephemeral programs status`

---

### `list`

**GET** `/api/v1/daemon/quick-start`

List all ephemeral programs

```typescript
client.daemon.ephemeralPrograms.list(): Promise<DaemonEphemeralProgramsListResponse>
```

**Returns:** `DaemonEphemeralProgramsListResponse`

**CLI:** `hoody daemon ephemeral programs list`

---

### `start`

**POST** `/api/v1/daemon/quick-start`

Launch ephemeral CUSTOM program

```typescript
client.daemon.ephemeralPrograms.start(data: DaemonEphemeralProgramsStartRequest): Promise<DaemonEphemeralProgramsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DaemonEphemeralProgramsStartRequest` | Yes | body |  |

**Returns:** `DaemonEphemeralProgramsStartResponse`

**CLI:** `hoody daemon ephemeral programs start`

---

### `stop`

**POST** `/api/v1/daemon/quick-start/{id}/stop`

Stop ephemeral program

```typescript
client.daemon.ephemeralPrograms.stop(id: string): Promise<DaemonEphemeralProgramsStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Temporary ID of the ephemeral program, as returned in `temporary_id` (`quick_&lt;unix-ms&gt;_&lt;sequence&gt;`). |

**Returns:** `DaemonEphemeralProgramsStopResponse`

**CLI:** `hoody daemon ephemeral programs stop`

---

## `client.daemon.kit` (1 method)

### `getHealth`

**GET** `/api/v1/daemon/health`

Service health check

```typescript
client.daemon.kit.getHealth(): Promise<DaemonHealthCheckResponse>
```

**Returns:** `DaemonHealthCheckResponse`

**CLI:** `hoody daemon health`

---

## `client.daemon.programs` (15 methods)

### `create`

**POST** `/api/v1/daemon/programs/add`

Add a new CUSTOM program

```typescript
client.daemon.programs.create(data: DaemonProgramsCreateRequest): Promise<DaemonProgramsCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `DaemonProgramsCreateRequest` | Yes | body |  |

**Returns:** `DaemonProgramsCreateResponse`

**CLI:** `hoody daemon programs create`

---

### `delete`

**POST** `/api/v1/daemon/programs/remove/{id}`

Remove a program

```typescript
client.daemon.programs.delete(id: number): Promise<DaemonProgramsDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `DaemonProgramsDeleteResponse`

**CLI:** `hoody daemon programs delete`

---

### `disable`

**POST** `/api/v1/daemon/programs/{id}/disable`

Disable a program

```typescript
client.daemon.programs.disable(id: number): Promise<DaemonProgramsDisableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `DaemonProgramsDisableResponse`

**CLI:** `hoody daemon programs disable`

---

### `enable`

**POST** `/api/v1/daemon/programs/{id}/enable`

Enable a program

```typescript
client.daemon.programs.enable(id: number): Promise<DaemonProgramsEnableResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `DaemonProgramsEnableResponse`

**CLI:** `hoody daemon programs enable`

---

### `get`

**GET** `/api/v1/daemon/programs/{id}`

Get a specific program

```typescript
client.daemon.programs.get(id: number): Promise<DaemonProgramsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `DaemonProgramsGetResponse`

**CLI:** `hoody daemon programs get`

---

### `getLogs`

**GET** `/api/v1/daemon/programs/{id}/logs`

Get program logs

```typescript
client.daemon.programs.getLogs(id: number, options?: { type?: "stdout" | "stderr"; lines?: number; port?: number; cache?: boolean | number }): Promise<DaemonProgramsGetLogsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Program ID |
| `type` | `"stdout" \| "stderr"` | No | query | Log stream: stdout or stderr |
| `lines` | `number` | No | query | Number of lines to return from the end of the file (default 100). A non-negative integer: `0` returns empty content, and the server clamps values above 10000 to 10000. |
| `port` | `number` | No | query | Port number (required for port-range programs) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DaemonProgramsGetLogsResponse`

**CLI:** `hoody daemon programs logs get`

---

### `getSandbox`

**GET** `/api/v1/daemon/programs/{id}/sandbox`

Get sandbox status for a program

```typescript
client.daemon.programs.getSandbox(id: number): Promise<DaemonProgramsGetSandboxResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |

**Returns:** `DaemonProgramsGetSandboxResponse`

**CLI:** `hoody daemon programs sandbox get`

---

### `getStatus`

**GET** `/api/v1/daemon/status/{id}`

Get specific program status

```typescript
client.daemon.programs.getStatus(id: number, options?: { port?: number; include_stats?: "true" | "false"; cache?: boolean | number }): Promise<DaemonProgramsGetStatusResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `port` | `number` | No | query | Filter to specific port instance (for port-range programs only) |
| `include_stats` | `"true" \| "false"` | No | query | Include resource stats (CPU, memory, process tree) for running programs. WHERE the stats land depends on the program: a standard program gets a top-level `stats`; a port-range program gets one `stats` per instance, on the instance itself (`instance.stats`, or `instances[].stats`), never at the top level. Each carries pid, started_at, cpu_percent, memory_rss_bytes, process_count and a per-process breakdown. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DaemonProgramsGetStatusResponse`

**CLI:** `hoody daemon programs status`

---

### `list`

**GET** `/api/v1/daemon/programs`

List all programs

```typescript
client.daemon.programs.list(options?: { hoody_kit?: "true" | "false"; lazy_load?: "true" | "false"; enabled?: "true" | "false"; boot?: "true" | "false"; name?: string; port?: number; port_from?: number; port_to?: number; include_status?: "true" | "false"; include_stats?: "true" | "false"; cache?: boolean | number }): Promise<DaemonProgramsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `hoody_kit` | `"true" \| "false"` | No | query | Filter by hoody_kit status. Use "true" for Hoody Kit programs only, "false" for user (non-kit) programs only. |
| `lazy_load` | `"true" \| "false"` | No | query | Filter by lazy_load status. Use "true" for lazy-loaded programs only (started on-demand), "false" for programs that auto-start. |
| `enabled` | `"true" \| "false"` | No | query | Filter by enabled status. Use "true" for enabled programs only, "false" for disabled programs only. |
| `boot` | `"true" \| "false"` | No | query | Filter by boot status. Use "true" for programs that auto-start on system boot, "false" for manual-start programs. |
| `name` | `string` | No | query | Filter by exact program name (e.g. "hoody-agent"). Lazy mode: the proxy resolves the agent BY NAME because it is a standard program with no port_range (the port filter cannot match it) and program ids are positional. Invalid names return 400. |
| `port` | `number` | No | query | Filter programs by single port number. Returns only programs whose port_range includes this specific port. Example: ?port=8042 returns programs with ranges containing 8042. |
| `port_from` | `number` | No | query | Filter by port range start (must be used with port_to). Returns programs whose port ranges overlap with the specified range. Uses overlap logic: program.start &lt;= port_to AND program.end &gt;= port_from. |
| `port_to` | `number` | No | query | Filter by port range end (must be used with port_from). Returns programs whose port ranges overlap with the specified range. Multiple programs may be returned if their ranges overlap. |
| `include_status` | `"true" \| "false"` | No | query | Include runtime status for each program. When true, adds a "status" field to each program showing current running state, instances, and process details. |
| `include_stats` | `"true" \| "false"` | No | query | Include resource stats (CPU, memory, process tree) for each running program. Turns status on only when `include_status` is omitted: an explicit `include_status=false` suppresses both status and stats. Adds a "stats" field with pid, started_at, cpu_percent, memory_rss_bytes, process_count, and per-process breakdown. Only present for running programs. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `DaemonProgramsListResponse`

**CLI:** `hoody daemon programs list`

---

### `listStatus`

**GET** `/api/v1/daemon/status`

Get all program statuses

```typescript
client.daemon.programs.listStatus(): Promise<DaemonProgramsListStatusResponse>
```

**Returns:** `DaemonProgramsListStatusResponse`

**CLI:** `hoody daemon programs status`

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

### `start`

**POST** `/api/v1/daemon/programs/{id}/start`

Start a program or port instance

```typescript
client.daemon.programs.start(id: number, data: DaemonProgramsStartRequest): Promise<DaemonProgramsStartResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `data` | `DaemonProgramsStartRequest` | Yes | body |  |

**Returns:** `DaemonProgramsStartResponse`

**CLI:** `hoody daemon programs start`

---

### `stop`

**POST** `/api/v1/daemon/programs/{id}/stop`

Stop a program or port instance

```typescript
client.daemon.programs.stop(id: number, data: DaemonProgramsStopRequest): Promise<DaemonProgramsStopResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `data` | `DaemonProgramsStopRequest` | Yes | body |  |

**Returns:** `DaemonProgramsStopResponse`

**CLI:** `hoody daemon programs stop`

---

### `streamLogs`

**GET** `/api/v1/daemon/programs/{id}/logs/stream`

Follow program logs (SSE)

```typescript
client.daemon.programs.streamLogs(options: { id: number; type?: string; lines?: number; port?: number; offset?: number; LastEventID?: string }): Promise<any>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Program ID |
| `type` | `string` | No | query | Log stream: stdout or stderr |
| `lines` | `number` | No | query | Number of complete lines replayed from the end of the file before following (default 100). `0` replays nothing and only follows; values above 10000 are clamped to 10000. The replay is found in the last 10 MiB of the file. Ignored when resuming with `offset` or `Last-Event-ID`. |
| `port` | `number` | No | query | Port number (required for port-range programs) |
| `offset` | `number` | No | query | Resume cursor: the `id` of the last `line` event received (a byte offset just past that line). Streaming restarts at the next line and no backlog is replayed. An offset beyond the end of the current file means it was truncated or replaced since: the stream sends a `reset` event and starts from the top of the file. The cursor is a byte position, not a file identity, so a file replaced by one at least as long is not detected across a reconnect. Takes precedence over `Last-Event-ID`. |
| `LastEventID` | `string` | No | header | Same cursor as `offset`, as sent automatically by an EventSource when it reconnects. Must be a non-negative integer. |

**Returns:** `any`

**CLI:** `hoody daemon programs logs stream`

---

### `update`

**POST** `/api/v1/daemon/programs/edit/{id}`

Edit a program

```typescript
client.daemon.programs.update(id: number, data: DaemonProgramsUpdateRequest): Promise<DaemonProgramsUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `number` | Yes | path | Unique numeric identifier of the program. An id that is not a valid `i32` (a word, an empty segment, a number too large) never reaches the handler: the path extractor refuses it with a plain-text 404, on every route that takes an id, which is NOT the documented JSON 404 of the routes that have one. An id that parses but names no program is the handler's own answer, a 400 carrying the `{success: false, error: ...}` envelope, except on the routes that document a 404. |
| `data` | `DaemonProgramsUpdateRequest` | Yes | body |  |

**Returns:** `DaemonProgramsUpdateResponse`

**CLI:** `hoody daemon programs update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
