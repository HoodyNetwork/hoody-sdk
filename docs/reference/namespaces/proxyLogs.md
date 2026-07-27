# `proxyLogs` — 5 methods

**Version:** 1.0.0-beta.8
**Accessor:** `client.proxyLogs`

```typescript
import * as proxyLogs from 'hoody-sdk/proxyLogs';
```

---

## `client.proxyLogs.logs` (5 methods)

### `getStats`

**GET** `/_logs/stats`

Get log statistics

```typescript
client.proxyLogs.logs.getStats(): Promise<ProxyLogsLogsGetStatsResponse>
```

**Returns:** `ProxyLogsLogsGetStatsResponse`

**CLI:** `hoody proxy logs stats`

---

### `list`

**GET** `/_logs`

Query centralized logs

```typescript
client.proxyLogs.logs.list(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; cursor?: string; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge" }): Promise<ProxyLogsLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `projectId` | `string` | No | query |  |
| `containerId` | `string` | No | query |  |
| `serviceName` | `string` | No | query |  |
| `level` | `string` | No | query | Comma-separated levels (debug,info,warn,error) |
| `includeRequestBody` | `boolean` | No | query |  |
| `includeResponseBody` | `boolean` | No | query |  |
| `last` | `number` | No | query | Return only the last N entries |
| `afterId` | `number` | No | query | Return entries with SQLite row ID greater than this (ASC cursor) |
| `cursor` | `string` | No | query | — pagination cursor (signed opaque base64).. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `method` | `string` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |

**Returns:** `ProxyLogsLogsListResponse`

**CLI:** `hoody proxy logs list`

---

### `listAll`

**GET** `/_logs`

Query centralized logs (collect all pages)

```typescript
client.proxyLogs.logs.listAll(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; cursor?: string; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge" }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `projectId` | `string` | No | query |  |
| `containerId` | `string` | No | query |  |
| `serviceName` | `string` | No | query |  |
| `level` | `string` | No | query | Comma-separated levels (debug,info,warn,error) |
| `includeRequestBody` | `boolean` | No | query |  |
| `includeResponseBody` | `boolean` | No | query |  |
| `last` | `number` | No | query | Return only the last N entries |
| `afterId` | `number` | No | query | Return entries with SQLite row ID greater than this (ASC cursor) |
| `cursor` | `string` | No | query | — pagination cursor (signed opaque base64).. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `method` | `string` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |

**Returns:** `unknown[]`

**CLI:** `hoody proxy logs list`

---

### `listIterator`

**GET** `/_logs`

Query centralized logs (async iterator)

```typescript
client.proxyLogs.logs.listIterator(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; cursor?: string; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge" }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query |  |
| `offset` | `number` | No | query |  |
| `projectId` | `string` | No | query |  |
| `containerId` | `string` | No | query |  |
| `serviceName` | `string` | No | query |  |
| `level` | `string` | No | query | Comma-separated levels (debug,info,warn,error) |
| `includeRequestBody` | `boolean` | No | query |  |
| `includeResponseBody` | `boolean` | No | query |  |
| `last` | `number` | No | query | Return only the last N entries |
| `afterId` | `number` | No | query | Return entries with SQLite row ID greater than this (ASC cursor) |
| `cursor` | `string` | No | query | — pagination cursor (signed opaque base64).. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `method` | `string` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |

**Returns:** `AsyncIterableIterator<unknown>`

**CLI:** `hoody proxy logs list`

---

### `streamLogs`

**GET** `/_logs/stream`

Live-tail logs over Server-Sent Events (v8 SSE contract)

```typescript
client.proxyLogs.logs.streamLogs(options?: { projectId?: string; containerId?: string; kind?: "request" | "response" | "event"; level?: "debug" | "info" | "warn" | "error"; LastEventID?: string }): Promise<ApiResponse<unknown>>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `projectId` | `string` | No | query | Filter to a single project |
| `containerId` | `string` | No | query | Filter to a single container |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `level` | `"debug" \| "info" \| "warn" \| "error"` | No | query |  |
| `LastEventID` | `string` | No | header | — numeric ringSeq of the last event received. Server skips entries ≤ this value from the ring buffer on reconnect. |

**Returns:** `ApiResponse<unknown>`

**CLI:** `hoody proxy logs stream`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
