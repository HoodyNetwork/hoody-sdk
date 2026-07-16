# `watch` — 14 methods

**Version:** 1.0.0-beta.1
**Accessor:** `client.watch`

```typescript
import * as watch from 'hoody-sdk/watch';
```

---

## `client.watch.health` (1 methods)

### `check`

**GET** `/api/v1/watch/health`

Health Check

```typescript
client.watch.health.check(): Promise<WatchHealthCheckResponse>
```

**Returns:** `WatchHealthCheckResponse`

**CLI:** `hoody watch health`

---

## `client.watch.streams` (5 methods)

### `listEvents`

**GET** `/watchers/{id}/events`

List Watcher Events

```typescript
client.watch.streams.listEvents(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null }): Promise<WatchStreamsListEventsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `WatchStreamsListEventsResponse`

**CLI:** `hoody watch events list`

---

### `listEventsAll`

**GET** `/watchers/{id}/events`

List Watcher Events (collect all pages)

```typescript
client.watch.streams.listEventsAll(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `unknown[]`

**CLI:** `hoody watch events list`

---

### `listEventsIterator`

**GET** `/watchers/{id}/events`

List Watcher Events (async iterator)

```typescript
client.watch.streams.listEventsIterator(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `AsyncIterableIterator&lt;unknown&gt;`

**CLI:** `hoody watch events list`

---

### `streamSse`

**GET** `/watchers/{id}/events/sse`

Stream Watcher Events Sse

```typescript
client.watch.streams.streamSse(id: string, options?: { since_id?: number | null; since_timestamp?: string | null }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |

**Returns:** `ApiResponse&lt;unknown&gt;`

**CLI:** `hoody watch events stream`

---

### `streamWs`

**GET** `/watchers/{id}/events/ws`

Stream Watcher Events Ws

```typescript
client.watch.streams.streamWs(id: string, options?: { since_id?: number | null; since_timestamp?: string | null }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |

**Returns:** `ApiResponse&lt;unknown&gt;`

---

## `client.watch.system` (2 methods)

### `getOpenApiJson`

**GET** `/openapi.json`

Get Open Api Json

```typescript
client.watch.system.getOpenApiJson(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse&lt;unknown&gt;`

---

### `getOpenApiYaml`

**GET** `/openapi.yaml`

Get Open Api Yaml

```typescript
client.watch.system.getOpenApiYaml(): Promise<ApiResponse<unknown>>
```

**Returns:** `ApiResponse&lt;unknown&gt;`

---

## `client.watch.watchers` (6 methods)

### `create`

**POST** `/watchers`

Create Watcher

```typescript
client.watch.watchers.create(data: WatchWatchersCreateRequest): Promise<WatchWatchersCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `WatchWatchersCreateRequest` | Yes | body |  |

**Returns:** `WatchWatchersCreateResponse`

**CLI:** `hoody watch create`

---

### `delete`

**DELETE** `/watchers/{id}`

Delete Watcher

```typescript
client.watch.watchers.delete(id: string): Promise<WatchWatchersDeleteResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |

**Returns:** `WatchWatchersDeleteResponse`

**CLI:** `hoody watch delete`

---

### `get`

**GET** `/watchers/{id}`

Get Watcher

```typescript
client.watch.watchers.get(id: string): Promise<WatchWatchersGetResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |

**Returns:** `WatchWatchersGetResponse`

**CLI:** `hoody watch get`

---

### `list`

**GET** `/watchers`

List Watchers

```typescript
client.watch.watchers.list(options?: { page?: number | null; limit?: number | null }): Promise<WatchWatchersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `WatchWatchersListResponse`

**CLI:** `hoody watch list`

---

### `listAll`

**GET** `/watchers`

List Watchers (collect all pages)

```typescript
client.watch.watchers.listAll(options?: { page?: number | null; limit?: number | null }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `unknown[]`

**CLI:** `hoody watch list`

---

### `listIterator`

**GET** `/watchers`

List Watchers (async iterator)

```typescript
client.watch.watchers.listIterator(options?: { page?: number | null; limit?: number | null }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `AsyncIterableIterator&lt;unknown&gt;`

**CLI:** `hoody watch list`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
