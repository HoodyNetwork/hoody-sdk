# `notifications` — 10 methods

**Version:** 1.0.0-beta.17
**Accessor:** `client.notifications`

```typescript
import * as notifications from 'hoody-sdk/notifications';
```

---

## `client.notifications.icons` (1 method)

### `get`

**GET** `/api/v1/notifications/icons/{iconId}`

Get notification icon

```typescript
client.notifications.icons.get(iconId: string, options?: { IfNoneMatch?: string; IfModifiedSince?: string }): Promise<ApiResponse<ArrayBuffer>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `iconId` | `string` | Yes | path | The unique identifier for the icon (e.g., "6_10_1749024932903.png") |
| `IfNoneMatch` | `string` | No | header | ETag(s) from an earlier response, or `*`. A match returns 304. Overrides If-Modified-Since. |
| `IfModifiedSince` | `string` | No | header | HTTP date; returns 304 when the icon has not changed since then (whole seconds). Ignored when If-None-Match is sent. |

**Returns:** `ApiResponse<ArrayBuffer>`

**CLI:** `hoody notifications icons get`

---

## `client.notifications.kit` (2 methods)

### `getHealth`

**GET** `/api/v1/notifications/health`

Service health check

```typescript
client.notifications.kit.getHealth(): Promise<NotificationsHealthCheckResponse>
```

**Returns:** `NotificationsHealthCheckResponse`

**CLI:** `hoody notifications health`

---

### `getMetrics`

**GET** `/api/v1/notifications/metrics`

Prometheus-compatible metrics endpoint

```typescript
client.notifications.kit.getMetrics(): Promise<ApiResponse<string>>
```

**Returns:** `ApiResponse<string>`

**CLI:** `hoody notifications metrics`

---

## `client.notifications` (7 methods)

### `connect`

**GET** `/api/v1/notifications/stream`

Real-time notification stream (WebSocket or SSE)

```typescript
client.notifications.connect(options?: { displays?: string }): Promise<NotificationsConnectNotificationStreamWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displays` | `string` | No | query | Comma-separated display IDs (`1,:2,3`), or `all` / `*` for every display. Required for SSE (400 without it). Optional for WebSocket: without it the socket receives nothing until the client sends a `subscribe` message; an invalid ID arrives as an `error` frame after the upgrade. |

**Returns:** `NotificationsConnectNotificationStreamWebSocket`

**CLI:** `hoody notifications stream`

---

### `dismiss`

**POST** `/api/v1/notifications/dismiss`

Dismiss notifications

```typescript
client.notifications.dismiss(data: NotificationsDismissRequest): Promise<NotificationsDismissResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `NotificationsDismissRequest` | Yes | body |  |

**Returns:** `NotificationsDismissResponse`

**CLI:** `hoody notifications dismiss`

---

### `list`

**GET** `/api/v1/notifications/{display}`

Get notifications for specified display(s)

```typescript
client.notifications.list(display: string, options?: { limit?: number; since?: number; after_id?: number; cursor?: string; username?: string; session?: string }): Promise<NotificationsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `display` | `string` | Yes | path | A display ID (`1` or `:1`, up to 5 digits), a comma-separated list (`1,:2,3`), or `all`. Any invalid element rejects the whole request with 400. |
| `limit` | `number` | No | query | Maximum number of notifications to return |
| `since` | `number` | No | query | Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp &gt;= since`, oldest first. Use it to start from a known time (`0` for the whole history); continue with `cursor` = `data.next_cursor`. |
| `after_id` | `number` | No | query | Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id &gt; after_id`, chosen and listed by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp &gt;= since` and `id &gt; after_id`. |
| `cursor` | `string` | No | query | Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it, oldest first. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`. |
| `username` | `string` | No | query | Read only this user's history files (letters and digits only). See the operation description. |
| `session` | `string` | No | query | Read only this session's history files (letters and digits only). See the operation description. |

**Returns:** `NotificationsListResponse`

**CLI:** `hoody notifications list`

---

### `listAll`

**GET** `/api/v1/notifications/{display}`

Get notifications for specified display(s) (collect all pages)

```typescript
client.notifications.listAll(display: string, options?: { limit?: number; since?: number; after_id?: number; cursor?: string; username?: string; session?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `display` | `string` | Yes | path | A display ID (`1` or `:1`, up to 5 digits), a comma-separated list (`1,:2,3`), or `all`. Any invalid element rejects the whole request with 400. |
| `limit` | `number` | No | query | Maximum number of notifications to return |
| `since` | `number` | No | query | Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp &gt;= since`, oldest first. Use it to start from a known time (`0` for the whole history); continue with `cursor` = `data.next_cursor`. |
| `after_id` | `number` | No | query | Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id &gt; after_id`, chosen and listed by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp &gt;= since` and `id &gt; after_id`. |
| `cursor` | `string` | No | query | Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it, oldest first. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`. |
| `username` | `string` | No | query | Read only this user's history files (letters and digits only). See the operation description. |
| `session` | `string` | No | query | Read only this session's history files (letters and digits only). See the operation description. |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/api/v1/notifications/{display}`

Get notifications for specified display(s) (async iterator)

```typescript
client.notifications.listIterator(display: string, options?: { limit?: number; since?: number; after_id?: number; cursor?: string; username?: string; session?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `display` | `string` | Yes | path | A display ID (`1` or `:1`, up to 5 digits), a comma-separated list (`1,:2,3`), or `all`. Any invalid element rejects the whole request with 400. |
| `limit` | `number` | No | query | Maximum number of notifications to return |
| `since` | `number` | No | query | Forward start point, Unix milliseconds, inclusive: returns the oldest `limit` notifications with `timestamp &gt;= since`, oldest first. Use it to start from a known time (`0` for the whole history); continue with `cursor` = `data.next_cursor`. |
| `after_id` | `number` | No | query | Forward cursor on notification id, exclusive: returns the oldest `limit` notifications with `id &gt; after_id`, chosen and listed by id. Ids are numbered per display, so the filter is only meaningful for a single display; use `since` for lists and `all`. `data.next_cursor` of an `after_id` page continues in id order and keeps the request's `since` bound: with both `since` and `after_id`, every page reached by following it returns only rows with `timestamp &gt;= since` and `id &gt; after_id`. |
| `cursor` | `string` | No | query | Keyset cursor, exclusive: pass back `data.next_cursor` from an earlier response to get the oldest `limit` notifications after it, oldest first. The cursor keeps the order of the request that produced it: (timestamp, display, id), or id order (ties broken by timestamp, display) when that request used `after_id`. Rows that share a timestamp or id are never skipped or repeated. Opaque; cannot be combined with `since` or `after_id`. |
| `username` | `string` | No | query | Read only this user's history files (letters and digits only). See the operation description. |
| `session` | `string` | No | query | Read only this session's history files (letters and digits only). See the operation description. |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `restore`

**DELETE** `/api/v1/notifications/dismiss`

Clear dismissed notifications

```typescript
client.notifications.restore(options?: { displayId?: string }): Promise<NotificationsRestoreResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `string` | No | query | Clear only this display's dismissals (`1` or `:1`, 0-99999; surrounding whitespace and extra leading colons are ignored). Omit to clear everything. An invalid value is rejected with 400. |

**Returns:** `NotificationsRestoreResponse`

**CLI:** `hoody notifications restore`

---

### `send`

**POST** `/api/v1/notifications/notify`

Trigger a new desktop notification

```typescript
client.notifications.send(data: NotificationsSendRequest): Promise<NotificationsSendResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `NotificationsSendRequest` | Yes | body |  |

**Returns:** `NotificationsSendResponse`

**CLI:** `hoody notifications send`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
