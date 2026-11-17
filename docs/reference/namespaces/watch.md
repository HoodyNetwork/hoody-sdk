# `watch` — 13 methods

**Version:** 1.0.1
**Accessor:** `client.watch`

```typescript
import * as watch from 'hoody-sdk/watch';
```

---

## `client.watch.events` (5 methods)

### `connect`

**GET** `/api/v1/watch/watchers/{id}/events/ws`

Stream Watcher Events Ws

```typescript
client.watch.events.connect(id: string, options?: { since_id?: number | null; since_timestamp?: string | null }, _templateVars?: object, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' }): Promise<WatchEventsConnectWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `wsOptions` | `{ reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' \| 'ws' }` | No | path |  |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |

**Returns:** `WatchEventsConnectWebSocket`

---

### `list`

**GET** `/api/v1/watch/watchers/{id}/events`

List Watcher Events

```typescript
client.watch.events.list(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null }): Promise<WatchEventsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Without `after_id` the page must be at least 1. With `after_id` it is ignored, so 0 is accepted, but it must still be a non-negative whole number: any other value is refused with 400 `INVALID_PAGINATION`. |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `after_id` | `number \| null` | No | query | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`, a decimal event id; a typed client passes it as a number). `since_id`, `since_timestamp` and `page` are ignored when it is set. `since_timestamp` is then not checked, but `since_id` and `page` must still be non-negative whole numbers: any other value is refused with 400 (`INVALID_CURSOR` for `since_id`, `INVALID_PAGINATION` for `page`). If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |

**Returns:** `WatchEventsListResponse`

**CLI:** `hoody watch events list`

---

### `listAll`

**GET** `/api/v1/watch/watchers/{id}/events`

List Watcher Events (collect all pages)

```typescript
client.watch.events.listAll(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Without `after_id` the page must be at least 1. With `after_id` it is ignored, so 0 is accepted, but it must still be a non-negative whole number: any other value is refused with 400 `INVALID_PAGINATION`. |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `after_id` | `number \| null` | No | query | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`, a decimal event id; a typed client passes it as a number). `since_id`, `since_timestamp` and `page` are ignored when it is set. `since_timestamp` is then not checked, but `since_id` and `page` must still be non-negative whole numbers: any other value is refused with 400 (`INVALID_CURSOR` for `since_id`, `INVALID_PAGINATION` for `page`). If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/watch/watchers/{id}/events`

List Watcher Events (async iterator)

```typescript
client.watch.events.listIterator(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Without `after_id` the page must be at least 1. With `after_id` it is ignored, so 0 is accepted, but it must still be a non-negative whole number: any other value is refused with 400 `INVALID_PAGINATION`. |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `after_id` | `number \| null` | No | query | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`, a decimal event id; a typed client passes it as a number). `since_id`, `since_timestamp` and `page` are ignored when it is set. `since_timestamp` is then not checked, but `since_id` and `page` must still be non-negative whole numbers: any other value is refused with 400 (`INVALID_CURSOR` for `since_id`, `INVALID_PAGINATION` for `page`). If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `stream`

**GET** `/api/v1/watch/watchers/{id}/events/sse`

Stream Watcher Events Sse

```typescript
client.watch.events.stream(id: string, options?: { since_id?: number | null; since_timestamp?: string | null }): Promise<IEventStream<Record<never, string>, ITypedStreamEvent<WatchEventsStreamFrames>>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |

**Returns:** `IEventStream<Record<never, string>, ITypedStreamEvent<WatchEventsStreamFrames>>`

**CLI:** `hoody watch events stream`

---

## `client.watch.kit` (1 method)

### `getHealth`

**GET** `/api/v1/watch/health`

Health Check

```typescript
client.watch.kit.getHealth(): Promise<WatchKitGetHealthResponse>
```

**Returns:** `WatchKitGetHealthResponse`

**CLI:** `hoody watch health`

---

## `client.watch.watchers` (7 methods)

### `create`

**POST** `/api/v1/watch/watchers`

Create Watcher

```typescript
client.watch.watchers.create(data: WatchWatchersCreateRequest, options?: { idempotencyKey?: string }): Promise<WatchWatchersCreateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `WatchWatchersCreateRequest` | Yes | body |  |
| `idempotencyKey` | `string` | No | header | Makes the create safe to retry. A create with a key that is still kept (for 10 minutes, in memory, up to 10,000 keys: past that the oldest is dropped first, and a restart forgets all of them) and the same body returns the watcher that first create made (200) instead of a second watcher; with another body it is refused (409 `IDEMPOTENCY_KEY_REUSED`). Use a new key for each watcher, such as a random UUID. The key takes printable ASCII characters and tabs only; leading and trailing spaces and tabs are trimmed, and what remains must be 1 to 256 characters. Any other key is refused with 400 `INVALID_REQUEST`. |

**Returns:** `WatchWatchersCreateResponse`

**CLI:** `hoody watch create`

---

### `delete`

**DELETE** `/api/v1/watch/watchers/{id}`

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

**GET** `/api/v1/watch/watchers/{id}`

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

**GET** `/api/v1/watch/watchers`

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

**GET** `/api/v1/watch/watchers`

List Watchers (collect all pages)

```typescript
client.watch.watchers.listAll(options?: { page?: number | null; limit?: number | null }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/watch/watchers`

List Watchers (async iterator)

```typescript
client.watch.watchers.listIterator(options?: { page?: number | null; limit?: number | null }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PATCH** `/api/v1/watch/watchers/{id}`

Reconfigure a live watcher in place. Omitted fields keep their current values. The watcher keeps its id, its replay history and its connected SSE/WebSocket clients; only the file-system backend is replaced. Reconfiguration preserves replay history, except that lowering `history_size` evicts retained events beyond the new capacity (minimum 32). Later replay returns 409 `HISTORY_GAP` if an event strictly after the requested cursor was evicted or could not be retained; `since_id=0` always returns retained history without a gap. The new backend starts before the old one stops, and events the old backend had already queued are processed before the handoff completes. So a change under a path watched by both configurations is not lost across the swap (one landing inside that window may be reported twice), and a change under a path only the old configuration watched is delivered if the old backend saw it before stopping. The drain is bounded: if the old backend has not finished within 5 seconds (a backstop against a wedged backend), the handoff completes anyway and events still queued in the old backend at that point are dropped, with a warning in the service log. A request that fails leaves the watcher unchanged. A body with no field is refused with 400 `INVALID_REQUEST`; a body whose fields all equal the current values returns the watcher as it is, without replacing the backend.

```typescript
client.watch.watchers.update(id: string, data: WatchWatchersUpdateRequest): Promise<WatchWatchersUpdateResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `data` | `WatchWatchersUpdateRequest` | Yes | body |  |

**Returns:** `WatchWatchersUpdateResponse`

**CLI:** `hoody watch update`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
