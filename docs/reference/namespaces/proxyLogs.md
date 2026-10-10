# `proxyLogs` — 5 methods

**Version:** 1.0.0-beta.17
**Accessor:** `client.proxyLogs`

```typescript
import * as proxyLogs from 'hoody-sdk/proxyLogs';
```

---

## `client.proxyLogs` (5 methods)

### `getStats`

**GET** `/_logs/stats`

Get log statistics

```typescript
client.proxyLogs.getStats(): Promise<ProxyLogsGetStatsResponse>
```

**Returns:** `ProxyLogsGetStatsResponse`

**CLI:** `hoody proxy logs stats`

---

### `list`

**GET** `/_logs`

Query centralized logs

```typescript
client.proxyLogs.list(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number }): Promise<ProxyLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | No | query | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. |
| `projectId` | `string` | No | query |  |
| `containerId` | `string` | No | query |  |
| `serviceName` | `string` | No | query | Filter to one service. The per-container logs URL ignores it, so filter the returned entries client-side. GET /_logs/stream honours it. |
| `level` | `string` | No | query | Log level: exactly ONE of debug, info, warn or error. A comma-separated value matches nothing. |
| `includeRequestBody` | `boolean` | No | query | Include each entry's stored request body (redacted as described above). |
| `includeResponseBody` | `boolean` | No | query | Include each entry's stored response body (redacted as described above). |
| `last` | `number` | No | query | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. To follow on, pass the `id` of the last entry as `afterId`. |
| `afterId` | `number` | No | query | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `method` | `string` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |
| `sinceMs` | `number` | No | query | Only entries whose `tsMs` is at least this (Unix milliseconds). |
| `untilMs` | `number` | No | query | Only entries whose `tsMs` is at most this (Unix milliseconds). |

**Returns:** `ProxyLogsListResponse`

**CLI:** `hoody proxy logs list`

---

### `listAll`

**GET** `/_logs`

Query centralized logs (collect all pages)

```typescript
client.proxyLogs.listAll(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | No | query | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. |
| `projectId` | `string` | No | query |  |
| `containerId` | `string` | No | query |  |
| `serviceName` | `string` | No | query | Filter to one service. The per-container logs URL ignores it, so filter the returned entries client-side. GET /_logs/stream honours it. |
| `level` | `string` | No | query | Log level: exactly ONE of debug, info, warn or error. A comma-separated value matches nothing. |
| `includeRequestBody` | `boolean` | No | query | Include each entry's stored request body (redacted as described above). |
| `includeResponseBody` | `boolean` | No | query | Include each entry's stored response body (redacted as described above). |
| `last` | `number` | No | query | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. To follow on, pass the `id` of the last entry as `afterId`. |
| `afterId` | `number` | No | query | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `method` | `string` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |
| `sinceMs` | `number` | No | query | Only entries whose `tsMs` is at least this (Unix milliseconds). |
| `untilMs` | `number` | No | query | Only entries whose `tsMs` is at most this (Unix milliseconds). |

**Returns:** `unknown[]`

---

### `listIterator`

**GET** `/_logs`

Query centralized logs (async iterator)

```typescript
client.proxyLogs.listIterator(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | No | query | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. |
| `projectId` | `string` | No | query |  |
| `containerId` | `string` | No | query |  |
| `serviceName` | `string` | No | query | Filter to one service. The per-container logs URL ignores it, so filter the returned entries client-side. GET /_logs/stream honours it. |
| `level` | `string` | No | query | Log level: exactly ONE of debug, info, warn or error. A comma-separated value matches nothing. |
| `includeRequestBody` | `boolean` | No | query | Include each entry's stored request body (redacted as described above). |
| `includeResponseBody` | `boolean` | No | query | Include each entry's stored response body (redacted as described above). |
| `last` | `number` | No | query | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. To follow on, pass the `id` of the last entry as `afterId`. |
| `afterId` | `number` | No | query | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `method` | `string` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |
| `sinceMs` | `number` | No | query | Only entries whose `tsMs` is at least this (Unix milliseconds). |
| `untilMs` | `number` | No | query | Only entries whose `tsMs` is at most this (Unix milliseconds). |

**Returns:** `AsyncIterableIterator<unknown>`

---

### `stream`

**GET** `/_logs/stream`

Live-tail logs over Server-Sent Events

```typescript
client.proxyLogs.stream(options?: { projectId?: string; containerId?: string; serviceName?: string; kind?: "request" | "response" | "event"; level?: "debug" | "info" | "warn" | "error"; source?: "backend" | "edge"; afterId?: number; LastEventID?: string }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `projectId` | `string` | No | query | Filter to a single project |
| `containerId` | `string` | No | query | Filter to a single container |
| `serviceName` | `string` | No | query | Filter the stream to one service, e.g. tunnel. Honoured here, unlike GET /_logs. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `level` | `"debug" \| "info" \| "warn" \| "error"` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |
| `afterId` | `number` | No | query | Limits the initial batch of a fresh connection to entries whose row id (`id`) is greater than this: the same `id` that GET /_logs returns and takes as `afterId`. Live frames are unaffected. |
| `LastEventID` | `string` | No | header | The numeric `id` of the last event received. On reconnect the server skips buffered entries whose `id` is at most this value. |

**Returns:** `IEventStream`

**CLI:** `hoody proxy logs stream`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
