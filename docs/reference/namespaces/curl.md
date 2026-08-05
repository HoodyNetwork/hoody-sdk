# `curl` — 31 methods

**Version:** 1.0.0-beta.10
**Accessor:** `client.curl`

```typescript
import * as curl from 'hoody-sdk/curl';
```

---

## `client.curl` (2 methods)

### `execute`

**POST** `/api/v1/curl/request`

Execute HTTP request with full cURL capabilities

```typescript
client.curl.execute(data: CurlExecuteRequest): Promise<CurlExecuteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CurlExecuteRequest` | Yes | body |  |

**Returns:** `CurlExecuteResponse`

**CLI:** `hoody curl exec`

---

### `executeCurlRequestGet`

**GET** `/api/v1/curl/request`

Execute simple HTTP request via query parameters

```typescript
client.curl.executeCurlRequestGet(options?: { url: string; method?: string; response?: string; mode?: string; session_id?: string; follow_redirects?: boolean; timeout?: number; user_agent?: string; referer?: string; bearer_token?: string; save?: boolean; save_path?: string; insecure?: boolean; compressed?: boolean; job_name?: string; data?: string; json?: string; header?: string[]; data_base64?: string }): Promise<ExecuteCurlRequestGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `url` | `string` | Yes | query | Target URL (required) |
| `method` | `string` | No | query | HTTP method (default: GET) |
| `response` | `string` | No | query | Response mode: transparent or json (default: json) |
| `mode` | `string` | No | query | Execution mode: sync or async (default: sync) |
| `session_id` | `string` | No | query | Session ID for cookie persistence |
| `follow_redirects` | `boolean` | No | query | Follow redirects (default: true) |
| `timeout` | `number` | No | query | Timeout in seconds |
| `user_agent` | `string` | No | query | User-Agent header |
| `referer` | `string` | No | query | Referer header |
| `bearer_token` | `string` | No | query | Bearer token |
| `save` | `boolean` | No | query | Save to storage |
| `save_path` | `string` | No | query | Custom save path, relative to downloads/by-job/{job_id} (no absolute paths or `..`) |
| `insecure` | `boolean` | No | query | Allow insecure SSL |
| `compressed` | `boolean` | No | query | Request compressed |
| `job_name` | `string` | No | query | Job name for async |
| `data` | `string` | No | query | Raw request body (curl --data); alias `body`; presence upgrades default method to POST |
| `json` | `string` | No | query | JSON request body, sent with Content-Type: application/json (curl --json); upgrades default method to POST |
| `header` | `string[]` | No | query | Custom header as `Name: Value`. Repeatable — supply once per header |
| `data_base64` | `string` | No | query | Base64 request body (binary-safe; standard or URL-safe); alias `body_base64`. Takes precedence over data/json; upgrades default method to POST |

**Returns:** `ExecuteCurlRequestGetResponse`

**CLI:** `hoody curl get-url`

---

## `client.curl.events` (3 methods)

### `sseJobEvents`

**GET** `/api/v1/curl/sse`

Subscribe to job events over Server-Sent Events

```typescript
client.curl.events.sseJobEvents(options?: { job_id?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | No | query | Optional job ID filter |

**Returns:** `ApiResponse<unknown>`

---

### `streamWs`

**GET** `/api/v1/curl/ws`

Subscribe to job events over WebSocket

```typescript
client.curl.events.streamWs(options?: { job_id?: string }): Promise<CurlWsJobEventsWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | No | query | Optional job ID filter |

**Returns:** `CurlWsJobEventsWebSocket`

**CLI:** `hoody curl jobs events`

---

### `wsRequestChannel`

**GET** `/api/v1/curl/channel`

Execute cURL requests over a WebSocket channel

```typescript
client.curl.events.wsRequestChannel(options?: { max_concurrent?: number; max_concurrent_streams?: number; max_pool?: number; max_queue?: number; max_frame_bytes?: number; max_request_bytes?: number; chunk_bytes?: number; stream_timeout_secs?: number; idle_timeout_secs?: number; max_outbound_messages?: number }): Promise<CurlWsRequestChannelWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `max_concurrent` | `number` | No | query | Alias for max concurrent streams on this channel connection |
| `max_concurrent_streams` | `number` | No | query | Maximum concurrently executing streams on this channel connection |
| `max_pool` | `number` | No | query | Alias for max_concurrent; does not configure outbound libcurl connection pooling |
| `max_queue` | `number` | No | query | Maximum queued streams waiting for a per-connection execution slot |
| `max_frame_bytes` | `number` | No | query | Maximum inbound WebSocket text frame size in bytes |
| `max_request_bytes` | `number` | No | query | Maximum assembled request JSON size in bytes |
| `chunk_bytes` | `number` | No | query | Maximum upstream response bytes encoded into one channel body frame |
| `stream_timeout_secs` | `number` | No | query | Per-stream execution timeout in seconds |
| `idle_timeout_secs` | `number` | No | query | Idle channel timeout in seconds |
| `max_outbound_messages` | `number` | No | query | Maximum queued outbound channel messages |

**Returns:** `CurlWsRequestChannelWebSocket`

---

## `client.curl.health` (1 method)

### `check`

**GET** `/api/v1/curl/health`

Service health check

```typescript
client.curl.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody curl health`

---

## `client.curl.jobs` (6 methods)

### `cancel`

**DELETE** `/api/v1/curl/jobs/{id}`

Cancel a pending or running job

```typescript
client.curl.jobs.cancel(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique job identifier (UUID format) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl jobs cancel`

---

### `get`

**GET** `/api/v1/curl/jobs/{id}`

Get detailed job information

```typescript
client.curl.jobs.get(id: string): Promise<CurlJobsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique job identifier (UUID format) |

**Returns:** `CurlJobsGetResponse`

**CLI:** `hoody curl jobs get`

---

### `getResult`

**GET** `/api/v1/curl/jobs/{id}/result`

Get job response body

```typescript
client.curl.jobs.getResult(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique job identifier (UUID format) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl jobs result`

---

### `list`

**GET** `/api/v1/curl/jobs`

List all async jobs

```typescript
client.curl.jobs.list(options?: { page?: number; limit?: number }): Promise<CurlJobsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `CurlJobsListResponse`

**CLI:** `hoody curl jobs list`

---

### `listAll`

**GET** `/api/v1/curl/jobs`

List all async jobs (collect all pages)

```typescript
client.curl.jobs.listAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `unknown[]`

**CLI:** `hoody curl jobs list`

---

### `listIterator`

**GET** `/api/v1/curl/jobs`

List all async jobs (async iterator)

```typescript
client.curl.jobs.listIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody curl jobs list`

---

## `client.curl.ops` (1 method)

### `metrics`

**GET** `/metrics`

Prometheus metrics

```typescript
client.curl.ops.metrics(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl metrics`

---

## `client.curl.schedules` (7 methods)

### `create`

**POST** `/api/v1/curl/schedule`

Create a recurring scheduled job

```typescript
client.curl.schedules.create(data: CurlSchedulesCreateRequest): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CurlSchedulesCreateRequest` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl schedules create`

---

### `delete`

**DELETE** `/api/v1/curl/schedule/{id}`

Delete a schedule

```typescript
client.curl.schedules.delete(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique schedule identifier |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl schedules delete`

---

### `get`

**GET** `/api/v1/curl/schedule/{id}`

Get schedule details

```typescript
client.curl.schedules.get(id: string): Promise<CurlSchedulesGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique schedule identifier (UUID format) |

**Returns:** `CurlSchedulesGetResponse`

**CLI:** `hoody curl schedules get`

---

### `list`

**GET** `/api/v1/curl/schedule`

List all scheduled jobs

```typescript
client.curl.schedules.list(options?: { page?: number; limit?: number }): Promise<CurlSchedulesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `CurlSchedulesListResponse`

**CLI:** `hoody curl schedules list`

---

### `listAll`

**GET** `/api/v1/curl/schedule`

List all scheduled jobs (collect all pages)

```typescript
client.curl.schedules.listAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `unknown[]`

**CLI:** `hoody curl schedules list`

---

### `listIterator`

**GET** `/api/v1/curl/schedule`

List all scheduled jobs (async iterator)

```typescript
client.curl.schedules.listIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody curl schedules list`

---

### `toggle`

**PATCH** `/api/v1/curl/schedule/{id}/toggle`

Enable or disable a schedule

```typescript
client.curl.schedules.toggle(id: string, data: CurlSchedulesToggleRequest): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique schedule identifier |
| `data` | `CurlSchedulesToggleRequest` | Yes | body |  |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl schedules toggle`

---

## `client.curl.sessions` (6 methods)

### `delete`

**DELETE** `/api/v1/curl/sessions/{id}`

Delete a session

```typescript
client.curl.sessions.delete(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Session identifier to delete |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl sessions delete`

---

### `get`

**GET** `/api/v1/curl/sessions/{id}`

Get session details

```typescript
client.curl.sessions.get(id: string): Promise<CurlSessionsGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Session identifier (caller-provided string) |

**Returns:** `CurlSessionsGetResponse`

**CLI:** `hoody curl sessions get`

---

### `getCookies`

**GET** `/api/v1/curl/sessions/{id}/cookies`

Get session cookies only

```typescript
client.curl.sessions.getCookies(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Session identifier |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl sessions cookies`

---

### `list`

**GET** `/api/v1/curl/sessions`

List all cookie sessions

```typescript
client.curl.sessions.list(options?: { page?: number; limit?: number }): Promise<CurlSessionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `CurlSessionsListResponse`

**CLI:** `hoody curl sessions list`

---

### `listAll`

**GET** `/api/v1/curl/sessions`

List all cookie sessions (collect all pages)

```typescript
client.curl.sessions.listAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `unknown[]`

**CLI:** `hoody curl sessions list`

---

### `listIterator`

**GET** `/api/v1/curl/sessions`

List all cookie sessions (async iterator)

```typescript
client.curl.sessions.listIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody curl sessions list`

---

## `client.curl.storage` (5 methods)

### `deleteFile`

**DELETE** `/api/v1/curl/storage/{path}`

Delete a saved file

```typescript
client.curl.storage.deleteFile(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Relative path to file in storage |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl storage delete`

---

### `getFile`

**GET** `/api/v1/curl/storage/{path}`

Download a saved file

```typescript
client.curl.storage.getFile(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Relative path to file in storage (supports nested paths) |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl storage get`

---

### `list`

**GET** `/api/v1/curl/storage`

List all saved downloads

```typescript
client.curl.storage.list(options?: { page?: number; limit?: number }): Promise<CurlStorageListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `CurlStorageListResponse`

**CLI:** `hoody curl storage list`

---

### `listAll`

**GET** `/api/v1/curl/storage`

List all saved downloads (collect all pages)

```typescript
client.curl.storage.listAll(options?: { page?: number; limit?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `unknown[]`

**CLI:** `hoody curl storage list`

---

### `listIterator`

**GET** `/api/v1/curl/storage`

List all saved downloads (async iterator)

```typescript
client.curl.storage.listIterator(options?: { page?: number; limit?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody curl storage list`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
