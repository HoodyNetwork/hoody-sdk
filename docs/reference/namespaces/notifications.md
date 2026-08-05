# `notifications` — 10 methods

**Version:** 1.0.0-beta.10
**Accessor:** `client.notifications`

```typescript
import * as notifications from 'hoody-sdk/notifications';
```

---

## `client.notifications.health` (2 methods)

### `check`

**GET** `/api/v1/notifications/health`

Service health check

```typescript
client.notifications.health.check(): Promise<BrowserHealthCheckResponse>
```

**Returns:** `BrowserHealthCheckResponse`

**CLI:** `hoody notifications health`

---

### `getMetrics`

**GET** `/api/v1/notifications/metrics`

Prometheus-compatible metrics endpoint

```typescript
client.notifications.health.getMetrics(): Promise<BrowserHealthGetMetricsResponse>
```

**Returns:** `BrowserHealthGetMetricsResponse`

**CLI:** `hoody notifications metrics`

---

## `client.notifications.icons` (1 method)

### `get`

**GET** `/api/v1/notifications/icons/{iconId}`

Get notification icon

```typescript
client.notifications.icons.get(iconId: string): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `iconId` | `string` | Yes | path | The unique identifier for the icon (e.g., "6_10_1749024932903.png") |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody notifications icon`

---

## `client.notifications` (6 methods)

### `clearDismissed`

**DELETE** `/api/v1/notifications/dismiss`

Clear dismissed notifications

```typescript
client.notifications.clearDismissed(options?: { displayId?: string }): Promise<NotificationsClearDismissedResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displayId` | `string` | No | query | Optional display ID to scope the clear operation |

**Returns:** `NotificationsClearDismissedResponse`

**CLI:** `hoody notifications clear-dismissed`

---

### `connectStream`

**GET** `/api/v1/notifications/stream`

Real-time notification stream via WebSocket

```typescript
client.notifications.connectStream(options?: { displays: string }): Promise<NotificationsConnectNotificationStreamWebSocket>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `displays` | `string` | Yes | query | Comma-separated display IDs to subscribe to (e.g., "1,:2,3"), or "all" to receive notifications from every display. |

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
client.notifications.list(display: string, options?: { limit?: number; since?: number; username?: string; session?: string }): Promise<NotificationsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `display` | `string` | Yes | path | A single display ID (e.g., "1" or ":1"), a comma-separated list (e.g., "1,:2,3"), or "all" to fetch from all displays |
| `limit` | `number` | No | query | Maximum number of notifications to return |
| `since` | `number` | No | query | Unix timestamp in milliseconds to get notifications after this time |
| `username` | `string` | No | query | Filter notifications by username |
| `session` | `string` | No | query | Filter notifications by session ID |

**Returns:** `NotificationsListResponse`

**CLI:** `hoody notifications list`

---

### `listAll`

**GET** `/api/v1/notifications/{display}`

Get notifications for specified display(s) (collect all pages)

```typescript
client.notifications.listAll(display: string, options?: { limit?: number; since?: number; username?: string; session?: string }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `display` | `string` | Yes | path | A single display ID (e.g., "1" or ":1"), a comma-separated list (e.g., "1,:2,3"), or "all" to fetch from all displays |
| `limit` | `number` | No | query | Maximum number of notifications to return |
| `since` | `number` | No | query | Unix timestamp in milliseconds to get notifications after this time |
| `username` | `string` | No | query | Filter notifications by username |
| `session` | `string` | No | query | Filter notifications by session ID |

**Returns:** `unknown[]`

**CLI:** `hoody notifications list`

---

### `listIterator`

**GET** `/api/v1/notifications/{display}`

Get notifications for specified display(s) (async iterator)

```typescript
client.notifications.listIterator(display: string, options?: { limit?: number; since?: number; username?: string; session?: string }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `display` | `string` | Yes | path | A single display ID (e.g., "1" or ":1"), a comma-separated list (e.g., "1,:2,3"), or "all" to fetch from all displays |
| `limit` | `number` | No | query | Maximum number of notifications to return |
| `since` | `number` | No | query | Unix timestamp in milliseconds to get notifications after this time |
| `username` | `string` | No | query | Filter notifications by username |
| `session` | `string` | No | query | Filter notifications by session ID |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody notifications list`

---

## `client.notifications.notify` (1 method)

### `trigger`

**POST** `/api/v1/notifications/notify`

Trigger a new desktop notification

```typescript
client.notifications.notify.trigger(data: NotificationsNotifyTriggerRequest): Promise<NotificationsNotifyTriggerResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `data` | `NotificationsNotifyTriggerRequest` | Yes | body |  |

**Returns:** `NotificationsNotifyTriggerResponse`

**CLI:** `hoody notifications trigger`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
