# `curl` — 31 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.curl`

```typescript
import * as curl from 'hoody-sdk/curl';
```

---

## `client.curl.channel` (1 method)

### `connect`

**GET** `/api/v1/curl/channel`

Execute cURL requests over a WebSocket channel

```typescript
client.curl.channel.connect(options?: { max_concurrent?: number; max_concurrent_streams?: number; max_pool?: number; max_queue?: number; max_frame_bytes?: number; max_request_bytes?: number; chunk_bytes?: number; stream_timeout_secs?: number; idle_timeout_secs?: number; max_outbound_messages?: number; binary?: boolean }): void
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
| `binary` | `boolean` | No | query | `true` negotiates binary frames: response bodies arrive as binary BODY frames and request.start may set binary_body (see x-async-api x-binary-frames). Default false |

**Returns:** `void`

---

## `client.curl` (1 method)

### `run`

**POST** `/api/v1/curl/request`

Execute HTTP request with full cURL capabilities

```typescript
client.curl.run(data: CurlRunRequest): Promise<CurlRunResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `CurlRunRequest` | Yes | body |  |

**Returns:** `CurlRunResponse`

**CLI:** `hoody curl run`

---

## `client.curl.jobs` (9 methods)

### `cancel`

**DELETE** `/api/v1/curl/jobs/{id}`

Cancel a pending or running job, or delete a finished one

```typescript
client.curl.jobs.cancel(id: string): Promise<curl_CurlJobDeleteResult>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique job identifier (UUID format) |

**Returns:** `curl_CurlJobDeleteResult`

**CLI:** `hoody curl jobs cancel`

---

### `connect`

**GET** `/api/v1/curl/ws`

Subscribe to job events over WebSocket

```typescript
client.curl.jobs.connect(options?: { job_id?: string; cache?: boolean | number }): Promise<CurlWsJobEventsWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | No | query | Optional job ID filter |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CurlWsJobEventsWebSocket`

---

### `delete`

**DELETE** `/api/v1/curl/jobs/{id}`

Cancel a pending or running job, or delete a finished one

```typescript
client.curl.jobs.delete(id: string): Promise<curl_CurlJobDeleteResult>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique job identifier (UUID format) |

**Returns:** `curl_CurlJobDeleteResult`

**CLI:** `hoody curl jobs delete`

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

**CLI:** `hoody curl jobs result get`

---

### `list`

**GET** `/api/v1/curl/jobs`

List all async jobs

```typescript
client.curl.jobs.list(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<CurlJobsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CurlJobsListResponse`

**CLI:** `hoody curl jobs list`

---

### `listAll`

**GET** `/api/v1/curl/jobs`

List all async jobs (collect all pages)

```typescript
client.curl.jobs.listAll(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/curl/jobs`

List all async jobs (async iterator)

```typescript
client.curl.jobs.listIterator(options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `stream`

**GET** `/api/v1/curl/sse`

Subscribe to job events over Server-Sent Events

```typescript
client.curl.jobs.stream(options?: { job_id?: string; cache?: boolean | number }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `job_id` | `string` | No | query | Optional job ID filter |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `IEventStream`

**CLI:** `hoody curl jobs stream`

---

## `client.curl.kit` (2 methods)

### `getHealth`

**GET** `/api/v1/curl/health`

Service health check

```typescript
client.curl.kit.getHealth(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl health`

---

### `getMetrics`

**GET** `/metrics`

Prometheus metrics

```typescript
client.curl.kit.getMetrics(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

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
client.curl.schedules.list(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<CurlSchedulesListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CurlSchedulesListResponse`

**CLI:** `hoody curl schedules list`

---

### `listAll`

**GET** `/api/v1/curl/schedule`

List all scheduled jobs (collect all pages)

```typescript
client.curl.schedules.listAll(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/curl/schedule`

List all scheduled jobs (async iterator)

```typescript
client.curl.schedules.listIterator(options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PATCH** `/api/v1/curl/schedule/{id}`

Update a schedule's cron expression, request or enabled state

```typescript
client.curl.schedules.update(id: string, data: CurlSchedulesUpdateRequest): Promise<CurlSchedulesUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Unique schedule identifier |
| `data` | `CurlSchedulesUpdateRequest` | Yes | body |  |

**Returns:** `CurlSchedulesUpdateResponse`

**CLI:** `hoody curl schedules update`

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

### `list`

**GET** `/api/v1/curl/sessions`

List all cookie sessions

```typescript
client.curl.sessions.list(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<CurlSessionsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CurlSessionsListResponse`

**CLI:** `hoody curl sessions list`

---

### `listAll`

**GET** `/api/v1/curl/sessions`

List all cookie sessions (collect all pages)

```typescript
client.curl.sessions.listAll(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listCookies`

**GET** `/api/v1/curl/sessions/{id}/cookies`

Get session cookies only

```typescript
client.curl.sessions.listCookies(id: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Session identifier |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl sessions cookies list`

---

### `listIterator`

**GET** `/api/v1/curl/sessions`

List all cookie sessions (async iterator)

```typescript
client.curl.sessions.listIterator(options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

## `client.curl.storage` (5 methods)

### `delete`

**DELETE** `/api/v1/curl/storage/{path}`

Delete a saved file

```typescript
client.curl.storage.delete(path: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Relative path to file in storage |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody curl storage delete`

---

### `get`

**GET** `/api/v1/curl/storage/{path}`

Download a saved file

```typescript
client.curl.storage.get(path: string): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `path` | `string` | Yes | path | Relative path to file in storage (supports nested paths) |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody curl storage get`

---

### `list`

**GET** `/api/v1/curl/storage`

List all saved downloads

```typescript
client.curl.storage.list(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<CurlStorageListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `CurlStorageListResponse`

**CLI:** `hoody curl storage list`

---

### `listAll`

**GET** `/api/v1/curl/storage`

List all saved downloads (collect all pages)

```typescript
client.curl.storage.listAll(options?: { page?: number; limit?: number; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/curl/storage`

List all saved downloads (async iterator)

```typescript
client.curl.storage.listIterator(options?: { page?: number; limit?: number; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number` | No | query | 1-based page number (optional) |
| `limit` | `number` | No | query | Items per page (optional; current handler returns all items when omitted) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
