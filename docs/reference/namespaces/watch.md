# `watch` — 13 methods

**Version:** 1.0.0-beta.15
**Accessor:** `client.watch`

```typescript
import * as watch from 'hoody-sdk/watch';
```

---

## `client.watch.events` (5 methods)

### `connect`

**GET** `/watchers/{id}/events/ws`

Stream Watcher Events Ws

```typescript
client.watch.events.connect(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; cache?: boolean | number }): Promise<WatchStreamWatcherEventsWsWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `WatchStreamWatcherEventsWsWebSocket`

---

### `list`

**GET** `/watchers/{id}/events`

List Watcher Events

```typescript
client.watch.events.list(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null; cache?: boolean | number }): Promise<WatchEventsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Ignored when `after_id` is set. |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `after_id` | `number \| null` | No | query | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`). `since_id`, `since_timestamp` and `page` are ignored when it is set. If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `WatchEventsListResponse`

**CLI:** `hoody watch events list`

---

### `listAll`

**GET** `/watchers/{id}/events`

List Watcher Events (collect all pages)

```typescript
client.watch.events.listAll(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Ignored when `after_id` is set. |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `after_id` | `number \| null` | No | query | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`). `since_id`, `since_timestamp` and `page` are ignored when it is set. If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/watchers/{id}/events`

List Watcher Events (async iterator)

```typescript
client.watch.events.listIterator(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | No | query | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Ignored when `after_id` is set. |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `after_id` | `number \| null` | No | query | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`). `since_id`, `since_timestamp` and `page` are ignored when it is set. If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `stream`

**GET** `/watchers/{id}/events/sse`

Stream Watcher Events Sse

```typescript
client.watch.events.stream(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; cache?: boolean | number }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `id` | `string` | Yes | path | Watcher id |
| `since_id` | `number \| null` | No | query | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | No | query | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `IEventStream`

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
client.watch.watchers.list(options?: { page?: number | null; limit?: number | null; cache?: boolean | number }): Promise<WatchWatchersListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `WatchWatchersListResponse`

**CLI:** `hoody watch list`

---

### `listAll`

**GET** `/watchers`

List Watchers (collect all pages)

```typescript
client.watch.watchers.listAll(options?: { page?: number | null; limit?: number | null; cache?: boolean | number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/watchers`

List Watchers (async iterator)

```typescript
client.watch.watchers.listIterator(options?: { page?: number | null; limit?: number | null; cache?: boolean | number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `page` | `number \| null` | No | query | Page number (1-based). |
| `limit` | `number \| null` | No | query | Items per page (1-200). |
| `cache` | `boolean \| number` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `update`

**PATCH** `/watchers/{id}`

Reconfigure a live watcher in place. Omitted fields keep their current values. The watcher keeps its id, replay history (so since_id / since_timestamp cursors stay valid) and its connected SSE/WebSocket clients; only the file-system backend is replaced. The new backend starts before the old one stops, and events the old backend had already queued are processed before the handoff completes. So a change under a path watched by both configurations is not lost across the swap (one landing inside that window may be reported twice), and a change under a path only the old configuration watched is delivered if the old backend saw it before stopping. The drain is bounded: if the old backend has not finished within 5 seconds (a backstop against a wedged backend), the handoff completes anyway and events still queued in the old backend at that point are dropped, with a warning in the service log. A request that fails leaves the watcher unchanged. A body with no field is refused with 400 `INVALID_REQUEST`; a body whose fields all equal the current values returns the watcher as it is, without replacing the backend.

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
