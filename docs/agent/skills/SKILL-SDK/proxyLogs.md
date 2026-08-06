> _**SDK skill · `proxyLogs` namespace** · ~4,397 tokens · hoody-sdk v1.0.0-beta.12_

# `proxyLogs` — Per-container request/response/event log query, stats, and SSE tail

## Purpose

Read-only access to the container reverse-proxy log store: query, stats, SSE tail.

## When to use

- Debug 4xx/5xx on a kit subdomain.
- Live-tail during deploys.
- Status-code mix; filter by `kind`/`level`/`method`/`serviceName`.

## When NOT to use

App stdout/stderr → `exec`/`daemon`, file events → `watch`, user SQLite → `sqlite`, shell → `terminal`; clearing logs not exposed.

## Prerequisites

- Project + container running; logging automatic.
- Matrix needs `"logs": true`. `"*"` does NOT grant.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. List recent

- `logs.list` with `last: N` or `limit`+`offset` (SNI-bound).
- Sweep: `logs.listAll` / `logs.listIterator`.

### 2. Drill into 5xx

- `logs.list` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate with `limit`/`offset` (DB rowids); `afterId` on the kit URL hits the ring buffer where `id: 0`.

### 3. Live-tail with resume

- `logs.streamLogs` — SSE; live frames carry `id: <ringSeq>` (initial replay frame is a data-only array with no `id:` line).
- Reconnect with `Last-Event-ID`; replays from ~5000-entry ring.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Status snapshot

- `logs.getStats` — totals + status breakdown.

### 5. Bodies for a slice

- `logs.list` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `list` ignored — SNI auto-scopes.
- `cursor` is only accepted when the deployment enables cursor pagination.
- `level` accepts ONE value at a time; despite the mapping description claiming comma-separated, `level=warn,error` returns `total: 0` — query each level separately and union client-side.
- `serviceName` handling is path-dependent: the kit/SNI `/_logs` LIST handler silently ignores `serviceName`, but the kit/SNI `/_logs/stream` BOUNCE forwards `serviceName`/`source` to the management port; the management-port `/_logs` handler always honours it. The generated SDK `list()` sends the param either way, but on a kit-URL list it is a no-op — scan + client-side filter. The generated **streamLogs** SDK method does not expose `serviceName` at all. `traceId` is not exposed as a query param anywhere; scan with `limit/afterId` and filter client-side.
- Response shape switches on which paging param you use: `limit/offset` → `{entries,total,limit,offset}`; `last=N` and `afterId` → flat `LogEntry[]` (and `id: 0` placeholders on the `last=N` shape) — but only when bodies are NOT requested; with `includeRequestBody`/`includeResponseBody=true` even the flat-paging paths fall through to the wrapped `{entries,total,limit,offset}` shape.
- `includeRequestBody`/`includeResponseBody` default `false`.
- Ring ~5000 (~50s @ 100/s); longer gaps lose rows.
- `event: reset` rebases ringSeq ≥10000 — drop cursor.
- `logs` strict-boolean; `"*"` does NOT grant.
- `kind` = `request`/`response`/`event`.

## Common errors

- 403 — missing `logs: true` (permission / blocked-path gate).
- 429 — `AUDIT_SNI_RATE_LIMIT_PER_MIN` (default 30) per-scope read/stat/stream rate limit tripped on any SNI read (list, getStats, streamLogs) → `{error:"rate_limited"}` with `Retry-After: 2`; back off.
- 404 on `/_logs/{config,health,export,db/*}`.
- 405 on `DELETE /_logs`.
- 410 NDJSON `snapshot_expired` (admin `cursor`); restart no-cursor.
- Desync if `event:` lines unparsed; reset on `reset`.

## Related namespaces

- `exec`/`daemon` — app logs.
- `terminal` — reproduce.
- `watch` — fs events.
- `api` — lifecycle.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

> **CLI caveat — `hoody proxy logs …` does NOT target the kit.** `list`/`stats` declare `namespace: 'api'` and `stream` builds from the client base URL, so `--container` is IGNORED and the call goes to your configured API/management base URL (`--base-url`), where no `/_logs` route exists. The kit-URL behaviours documented below (flat `last=N` array, `id: 0` ring rows) apply to the HTTP and SDK forms only.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. We picked **7** end-to-end recipes that exercise every working filter, both response shapes, the stats endpoint, and SSE resume. Three additional scenarios from the suggestion list — *filter by program*, *filter by source IP*, and *search by alias hostname* — were dropped because the kit does **not** filter on those fields server-side (`serviceName`, `clientIp`, alias-hostname are *not* honoured as query params on `GET /_logs`); the only way to scope by them is client-side `.filter()` after a paged scan, which is already shown in §2 (status) and §5 (traceId).

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns a flat ARRAY (no `entries` wrapper) ordered **oldest-first within the returned last-N slice** with `id: 0` placeholders — the cheapest call you can make.

```typescript
const r = await client.proxyLogs.logs.list({ last: 50 });
const rows = r.data as any[];               // `last` returns an array, not a LogQueryResult
for (const e of rows) {
  console.log(e.tsIso, e.kind, e.level, e.serviceName, e.method, e.url, e.status ?? '—');
}
```
### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```typescript
const r = await client.proxyLogs.logs.list({ level: 'error', limit: 200 });
const fivexx = (r.data as any).entries.filter((e: any) => e.status >= 500 && e.status < 600);
console.log(`${fivexx.length} 5xx of ${(r.data as any).total} error entries`);
```
### 3. Walk the full window with `limit`/`offset` paging (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. On the kit URL **do not** cursor-page by `id`: a bare `afterId`/`last` (no bodies) routes to the in-memory ring buffer where every entry is `id: 0`, so `max(id)` is always `0` and `afterId=0` never advances. Page with `limit`/`offset` instead — that path queries the DB, returns the wrapped `{entries,total,limit,offset}` shape, and carries real rowids. Walk pages until `entries` is empty.

```typescript
let offset = 0;
for (;;) {
  const page = await client.proxyLogs.logs.list({ limit: 500, offset });
  const rows = (page.data as any).entries as any[];
  if (rows.length === 0) break;
  for (const e of rows) console.log(e.id, e.tsIso, e.serviceName, e.status);
  offset += rows.length;
}
// SDK convenience: `client.proxyLogs.logs.listIterator({ limit: 500 })` works because limit/offset returns the wrapped shape; do NOT pass `afterId`/`last` to listIterator — itemsPath is hardcoded to `data.entries` (flat-array path returns nothing, and on the kit URL its ids are 0).
```
### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byContainer, byService }` — perfect for a dashboard tile.

```typescript
const s = await client.proxyLogs.logs.getStats();
const d = s.data as any;
const noisiest = Object.entries(d.byService)
  .sort((a, b) => (b[1] as number) - (a[1] as number))
  .slice(0, 3);
console.log(`${d.total} entries, ${d.byLevel.warn} warns, hot:`, noisiest);
```
### 5. Trace one request across kits via `traceId`

**Goal:** one HTTP request that fans out to multiple internal kits shares a single `traceId` (UUID for edge entries; 32-char hex for backend hops). The kit does not filter on `traceId` server-side, so scan a recent window and group client-side. Each `traceId` typically yields a `kind: "request"` (edge) + one or more `kind: "request"`/`"response"` (backend) frames.

```typescript
const tid = '354a5a0222e7107c46ae2851ded57fa6';
const r = await client.proxyLogs.logs.list({
  limit: 1000, includeRequestBody: true, includeResponseBody: true,
});
const chain = (r.data as any).entries
  .filter((e: any) => e.traceId === tid)
  .sort((a: any, b: any) => a.tsMs - b.tsMs);
console.log(`${chain.length} hops in trace ${tid}`);
```
### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and pick up exactly where you left off after a network blip. Live frames carry `id: <ringSeq>`; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

```typescript
// `client.proxyLogs.logs.streamLogs(...)` is request/response-shaped — it returns
// `Promise<ApiResponse<unknown>>`, NOT an async iterator. For live SSE in the SDK,
// drop down to raw `fetch()` against the kit URL and parse `response.body` yourself.
const KIT = `https://${P}-${C}-logs-1.${N}.containers.hoody.com`;
let lastSeen = 0;
const res = await fetch(`${KIT}/_logs/stream?level=warn`, {
  headers: { 'Accept': 'text/event-stream', 'Last-Event-ID': String(lastSeen) },
});
const reader = res.body!.getReader();
const td = new TextDecoder();
let buf = '';
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buf += td.decode(value, { stream: true });
  let sep;
  while ((sep = buf.indexOf('\n\n')) !== -1) {
    const frame = buf.slice(0, sep); buf = buf.slice(sep + 2);
    if (frame.startsWith(':')) continue; // heartbeat (every 30s)
    let id: number | null = null, data = '', event: string | null = null;
    for (const line of frame.split('\n')) {
      if (line.startsWith('id: ')) id = Number(line.slice(4));
      else if (line.startsWith('data: ')) data += line.slice(6);
      else if (line.startsWith('event: ')) event = line.slice(7);
    }
    if (event === 'reset') { lastSeen = 0; continue; }
    if (event === 'scope-destroyed') {
      await reader.cancel().catch(() => undefined);
      break;
    }
    if (id !== null) lastSeen = id; // first replay frame has no id; seed only on live frames
    const payload = JSON.parse(data);
    if (Array.isArray(payload)) for (const e of payload) console.log(e.tsIso, e.serviceName, e.status, e.url);
    else console.log(payload.tsIso, payload.serviceName, payload.status, payload.url);
  }
}
```
### 7. Capture request + response bodies for a debug slice

**Goal:** body payloads are off by default. Turn them on for a narrow window (e.g. recent warns) to inspect what the upstream actually sent or received. Bodies are capped at `maxBodySize` (default 65 536 B) and content-types in the kit's `excludeContentTypes` (`image/`, `video/`, `audio/`, `application/octet-stream`, `font/`) are skipped — `bodyTruncated: true` flags both cases.

```typescript
const r = await client.proxyLogs.logs.list({
  level: 'warn', limit: 20,
  includeRequestBody: true, includeResponseBody: true,
});
for (const e of (r.data as any).entries) {
  if (e.bodyTruncated) continue;
  console.log(e.id, e.status, e.url, e.requestBody, e.responseBody);
}
```

## Reference

**Accessor:** `client.proxyLogs`  |  **Import:** `import * as proxyLogs from 'hoody-sdk/proxyLogs'`

### `client.proxyLogs.logs` (5) — logs

#### `getStats` — Get log statistics

```typescript
client.proxyLogs.logs.getStats()
```

**Returns:** `proxyLogs_LogStats`  |  **HTTP:** `GET /_logs/stats`
**CLI:** `hoody proxy logs stats`

---

#### `list` — Query centralized logs

```typescript
client.proxyLogs.logs.list(limit?: integer, offset?: integer, projectId?: string, containerId?: string, serviceName?: string, level?: string, includeRequestBody?: boolean, includeResponseBody?: boolean, last?: integer, afterId?: integer, cursor?: string, kind?: string, method?: string, source?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `projectId` | `string` | query | No |  |
| `containerId` | `string` | query | No |  |
| `serviceName` | `string` | query | No |  |
| `level` | `string` | query | No | Comma-separated levels (debug,info,warn,error) |
| `includeRequestBody` | `boolean` | query | No |  |
| `includeResponseBody` | `boolean` | query | No |  |
| `last` | `integer` | query | No | Return only the last N entries |
| `afterId` | `integer` | query | No | Return entries with SQLite row ID greater than this (ASC cursor) |
| `cursor` | `string` | query | No | pagination cursor (signed opaque base64). |
| `kind` | `string` | query | No |  |
| `method` | `string` | query | No |  |
| `source` | `string` | query | No |  |

**Returns:** `proxyLogs_LogQueryResult`  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `listAll` — Query centralized logs (collect all pages)

```typescript
client.proxyLogs.logs.listAll(limit?: integer, offset?: integer, projectId?: string, containerId?: string, serviceName?: string, level?: string, includeRequestBody?: boolean, includeResponseBody?: boolean, last?: integer, afterId?: integer, cursor?: string, kind?: string, method?: string, source?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `projectId` | `string` | query | No |  |
| `containerId` | `string` | query | No |  |
| `serviceName` | `string` | query | No |  |
| `level` | `string` | query | No | Comma-separated levels (debug,info,warn,error) |
| `includeRequestBody` | `boolean` | query | No |  |
| `includeResponseBody` | `boolean` | query | No |  |
| `last` | `integer` | query | No | Return only the last N entries |
| `afterId` | `integer` | query | No | Return entries with SQLite row ID greater than this (ASC cursor) |
| `cursor` | `string` | query | No | pagination cursor (signed opaque base64). |
| `kind` | `string` | query | No |  |
| `method` | `string` | query | No |  |
| `source` | `string` | query | No |  |

**Returns:** `proxyLogs_LogQueryResult[]`  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `listIterator` — Query centralized logs (async iterator)

```typescript
client.proxyLogs.logs.listIterator(limit?: integer, offset?: integer, projectId?: string, containerId?: string, serviceName?: string, level?: string, includeRequestBody?: boolean, includeResponseBody?: boolean, last?: integer, afterId?: integer, cursor?: string, kind?: string, method?: string, source?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No |  |
| `offset` | `integer` | query | No |  |
| `projectId` | `string` | query | No |  |
| `containerId` | `string` | query | No |  |
| `serviceName` | `string` | query | No |  |
| `level` | `string` | query | No | Comma-separated levels (debug,info,warn,error) |
| `includeRequestBody` | `boolean` | query | No |  |
| `includeResponseBody` | `boolean` | query | No |  |
| `last` | `integer` | query | No | Return only the last N entries |
| `afterId` | `integer` | query | No | Return entries with SQLite row ID greater than this (ASC cursor) |
| `cursor` | `string` | query | No | pagination cursor (signed opaque base64). |
| `kind` | `string` | query | No |  |
| `method` | `string` | query | No |  |
| `source` | `string` | query | No |  |

**Returns:** `AsyncIterableIterator<proxyLogs_LogQueryResult>`  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `streamLogs` — Live-tail logs over Server-Sent Events (v8 SSE contract)

```typescript
client.proxyLogs.logs.streamLogs(projectId?: string, containerId?: string, kind?: string, level?: string, Last-Event-ID?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `projectId` | `string` | query | No | Filter to a single project |
| `containerId` | `string` | query | No | Filter to a single container |
| `kind` | `string` | query | No |  |
| `level` | `string` | query | No |  |
| `Last-Event-ID` | `string` | header | No | numeric ringSeq of the last event received. Server skips entries ≤ this value from the ring buffer on reconnect. |

**Returns:** `any`  |  **HTTP:** `GET /_logs/stream`
**CLI:** `hoody proxy logs stream`

