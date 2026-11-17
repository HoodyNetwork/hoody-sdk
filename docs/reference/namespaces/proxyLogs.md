# `proxyLogs` — 5 methods

**Version:** 1.0.1
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
client.proxyLogs.getStats(options?: { serviceName?: string; excludeService?: string; traceId?: string; level?: string; path?: string; status?: number; minStatus?: number; maxStatus?: number; botUrl?: string; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number; bucketMs?: number }): Promise<ProxyLogsGetStatsResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `serviceName` | `string` | No | query | Only entries of this service. |
| `excludeService` | `string` | No | query | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots,exec`). Entries without a service name are kept. Applied before paging. |
| `traceId` | `string` | No | query | Only the entries with this request ID. |
| `level` | `string` | No | query | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applied before `limit`, `offset` and `last`. On the per-computer logs URL an unknown level, an empty item or a repeated `level` is refused with 400. |
| `path` | `string` | No | query | Only entries whose address contains this text, matched literally (`%` and `_` are ordinary characters) and ignoring the case of A-Z. At most 200 characters, with no control characters. Applied before paging. |
| `status` | `number` | No | query | Only entries with this HTTP status. Not allowed with `minStatus` or `maxStatus`. |
| `minStatus` | `number` | No | query | Only entries with an HTTP status of at least this. Entries without a status never match a status range. |
| `maxStatus` | `number` | No | query | Only entries with an HTTP status of at most this. Must not be below `minStatus`. |
| `botUrl` | `string` | No | query | Only the Bot calls of this Bot URL (`bu_` followed by 24 lowercase hex digits). Use with `serviceName=bots`. |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `method` | `string` | No | query |  |
| `source` | `"backend" \| "edge"` | No | query |  |
| `sinceMs` | `number` | No | query | Only entries whose `tsMs` is at least this (Unix milliseconds). Required with `bucketMs`, where it is also the start of the first bucket. |
| `untilMs` | `number` | No | query | Only entries whose `tsMs` is at most this (Unix milliseconds). With `bucketMs` it defaults to the time of the request. |
| `bucketMs` | `number` | No | query | Also count the entries per bucket of this many milliseconds (at least 60000). Bucket i starts at `sinceMs + i × bucketMs`; the last bucket holds `untilMs`, so a window gives floor((untilMs − sinceMs) / bucketMs) + 1 buckets, at most 240. Every bucket is returned, empty ones included. |

**Returns:** `ProxyLogsGetStatsResponse`

**CLI:** `hoody proxy logs stats`

---

### `list`

**GET** `/_logs`

Query centralized logs

```typescript
client.proxyLogs.list(options?: { limit?: number; offset?: number; projectId?: string; computerId?: string; serviceName?: string; traceId?: string; level?: string; excludeService?: string; path?: string; status?: number; minStatus?: number; maxStatus?: number; botUrl?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; beforeId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number }): Promise<ProxyLogsListResponse>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | No | query | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. Not allowed with `beforeId`. |
| `projectId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `computerId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `serviceName` | `string` | No | query | Only entries of this service (for example `exec` or `bots`). Applied before `limit`, `offset` and `last`, so `total` counts only matching entries. |
| `traceId` | `string` | No | query | Only the entries with this request ID (`traceId`). Applied before `limit`, `offset` and `last`. |
| `level` | `string` | No | query | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applied before `limit`, `offset` and `last`. On the per-computer logs URL an unknown level, an empty item or a repeated `level` is refused with 400. |
| `excludeService` | `string` | No | query | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots,exec`). Entries without a service name are kept. Applied before paging. |
| `path` | `string` | No | query | Only entries whose address contains this text, matched literally (`%` and `_` are ordinary characters) and ignoring the case of A-Z. At most 200 characters, with no control characters. Applied before paging. |
| `status` | `number` | No | query | Only entries with this HTTP status. Not allowed with `minStatus` or `maxStatus`. |
| `minStatus` | `number` | No | query | Only entries with an HTTP status of at least this. Entries without a status never match a status range. |
| `maxStatus` | `number` | No | query | Only entries with an HTTP status of at most this. Must not be below `minStatus`. |
| `botUrl` | `string` | No | query | Only the Bot calls of this Bot URL (`bu_` followed by 24 lowercase hex digits). Use with `serviceName=bots`. |
| `includeRequestBody` | `boolean` | No | query | Include each entry's stored request body (redacted as described above). |
| `includeResponseBody` | `boolean` | No | query | Include each entry's stored response body (redacted as described above). |
| `last` | `number` | No | query | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. To follow on, pass the `id` of the last entry as `afterId`. At most 1000: a larger value is treated as 1000. |
| `afterId` | `number` | No | query | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `beforeId` | `number` | No | query | Return the entries whose row id (`id`) is less than this, newest first: pass the `id` of the oldest entry a newest-first page showed to get the page before it. `total` counts every matching entry below the cursor. Not allowed with `afterId`, `last` or `offset`. |
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
client.proxyLogs.listAll(options?: { limit?: number; offset?: number; projectId?: string; computerId?: string; serviceName?: string; traceId?: string; level?: string; excludeService?: string; path?: string; status?: number; minStatus?: number; maxStatus?: number; botUrl?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; beforeId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number }): Promise<unknown[]>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | No | query | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. Not allowed with `beforeId`. |
| `projectId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `computerId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `serviceName` | `string` | No | query | Only entries of this service (for example `exec` or `bots`). Applied before `limit`, `offset` and `last`, so `total` counts only matching entries. |
| `traceId` | `string` | No | query | Only the entries with this request ID (`traceId`). Applied before `limit`, `offset` and `last`. |
| `level` | `string` | No | query | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applied before `limit`, `offset` and `last`. On the per-computer logs URL an unknown level, an empty item or a repeated `level` is refused with 400. |
| `excludeService` | `string` | No | query | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots,exec`). Entries without a service name are kept. Applied before paging. |
| `path` | `string` | No | query | Only entries whose address contains this text, matched literally (`%` and `_` are ordinary characters) and ignoring the case of A-Z. At most 200 characters, with no control characters. Applied before paging. |
| `status` | `number` | No | query | Only entries with this HTTP status. Not allowed with `minStatus` or `maxStatus`. |
| `minStatus` | `number` | No | query | Only entries with an HTTP status of at least this. Entries without a status never match a status range. |
| `maxStatus` | `number` | No | query | Only entries with an HTTP status of at most this. Must not be below `minStatus`. |
| `botUrl` | `string` | No | query | Only the Bot calls of this Bot URL (`bu_` followed by 24 lowercase hex digits). Use with `serviceName=bots`. |
| `includeRequestBody` | `boolean` | No | query | Include each entry's stored request body (redacted as described above). |
| `includeResponseBody` | `boolean` | No | query | Include each entry's stored response body (redacted as described above). |
| `last` | `number` | No | query | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. To follow on, pass the `id` of the last entry as `afterId`. At most 1000: a larger value is treated as 1000. |
| `afterId` | `number` | No | query | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `beforeId` | `number` | No | query | Return the entries whose row id (`id`) is less than this, newest first: pass the `id` of the oldest entry a newest-first page showed to get the page before it. `total` counts every matching entry below the cursor. Not allowed with `afterId`, `last` or `offset`. |
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
client.proxyLogs.listIterator(options?: { limit?: number; offset?: number; projectId?: string; computerId?: string; serviceName?: string; traceId?: string; level?: string; excludeService?: string; path?: string; status?: number; minStatus?: number; maxStatus?: number; botUrl?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; beforeId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number }): AsyncIterableIterator<unknown>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `limit` | `number` | No | query | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | No | query | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. Not allowed with `beforeId`. |
| `projectId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `computerId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `serviceName` | `string` | No | query | Only entries of this service (for example `exec` or `bots`). Applied before `limit`, `offset` and `last`, so `total` counts only matching entries. |
| `traceId` | `string` | No | query | Only the entries with this request ID (`traceId`). Applied before `limit`, `offset` and `last`. |
| `level` | `string` | No | query | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applied before `limit`, `offset` and `last`. On the per-computer logs URL an unknown level, an empty item or a repeated `level` is refused with 400. |
| `excludeService` | `string` | No | query | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots,exec`). Entries without a service name are kept. Applied before paging. |
| `path` | `string` | No | query | Only entries whose address contains this text, matched literally (`%` and `_` are ordinary characters) and ignoring the case of A-Z. At most 200 characters, with no control characters. Applied before paging. |
| `status` | `number` | No | query | Only entries with this HTTP status. Not allowed with `minStatus` or `maxStatus`. |
| `minStatus` | `number` | No | query | Only entries with an HTTP status of at least this. Entries without a status never match a status range. |
| `maxStatus` | `number` | No | query | Only entries with an HTTP status of at most this. Must not be below `minStatus`. |
| `botUrl` | `string` | No | query | Only the Bot calls of this Bot URL (`bu_` followed by 24 lowercase hex digits). Use with `serviceName=bots`. |
| `includeRequestBody` | `boolean` | No | query | Include each entry's stored request body (redacted as described above). |
| `includeResponseBody` | `boolean` | No | query | Include each entry's stored response body (redacted as described above). |
| `last` | `number` | No | query | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. To follow on, pass the `id` of the last entry as `afterId`. At most 1000: a larger value is treated as 1000. |
| `afterId` | `number` | No | query | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `beforeId` | `number` | No | query | Return the entries whose row id (`id`) is less than this, newest first: pass the `id` of the oldest entry a newest-first page showed to get the page before it. `total` counts every matching entry below the cursor. Not allowed with `afterId`, `last` or `offset`. |
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
client.proxyLogs.stream(options?: { projectId?: string; computerId?: string; serviceName?: string; kind?: "request" | "response" | "event"; level?: string; excludeService?: string; source?: "backend" | "edge"; afterId?: number; lastEventId?: string }): Promise<IEventStream>
```

| Parameter | Type | Required | Location | Description |
|-----------|------|----------|----------|-------------|
| `projectId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the stream's project, and a value you send is discarded. |
| `computerId` | `string` | No | query | Not needed on a computer's logs URL: the URL fixes the stream's computer, and a value you send is discarded. |
| `serviceName` | `string` | No | query | Only entries of this service (for example `tunnel` or `bots`). |
| `kind` | `"request" \| "response" \| "event"` | No | query |  |
| `level` | `string` | No | query | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applies to the initial batch, live frames and a resume. An unknown level, an empty item or a repeated `level` is refused with 400. |
| `excludeService` | `string` | No | query | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots`). Entries without a service name are kept. Applies to the initial batch, live frames and a resume. |
| `source` | `"backend" \| "edge"` | No | query |  |
| `afterId` | `number` | No | query | Limits the initial batch of a fresh connection to entries whose row id (`id`) is greater than this: the same `id` that GET /_logs returns and takes as `afterId`. Live frames are unaffected. |
| `lastEventId` | `string` | No | header | The numeric `id` of the last event received. On reconnect the server skips buffered entries whose `id` is at most this value. |

**Returns:** `IEventStream`

**CLI:** `hoody proxy logs stream`

---


*Auto-generated by `generate-reference.ts`. Do not edit manually.*
