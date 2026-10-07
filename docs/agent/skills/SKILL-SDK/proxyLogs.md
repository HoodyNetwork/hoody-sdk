> _**SDK skill · `proxyLogs` namespace** · ~6,846 tokens · hoody-sdk v1.0.0-beta.16_

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

- `proxyLogs.list` with `last: N` or `limit`+`offset` (SNI-bound).
- Sweep: `proxyLogs.listAll` / `proxyLogs.listIterator`.

### 2. Drill into 5xx

- `proxyLogs.list` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate from a cursor with `afterId`: it reads the log database (real row ids), oldest first, and `total` counts every entry after the cursor.

### 3. Live-tail with resume

- `proxyLogs.stream` — SSE; live frames carry an `id:` line holding an opaque increasing integer cursor (a fresh connection first gets a data-only array of recent matching entries with no `id:` line, only when there are some; otherwise its first frame is a live one).
- Reconnect with `Last-Event-ID`; the server replays the buffered frames after it. `event: gap` (no `id:`) means it no longer reaches back that far: backfill the missing entries from `proxyLogs.list`.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Stats snapshot

- `proxyLogs.getStats` — `total` plus counts `byLevel`, `byProject`, `byContainer` and `byService`, and the `timeRange`. There is no status-code breakdown: derive one client-side from `proxyLogs.list`.

### 5. Bodies for a slice

- `proxyLogs.list` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `list` ignored — SNI auto-scopes.
- On the stream the scope also comes from the kit URL, but `projectId`/`containerId` are checked rather than ignored: omit them or pass the URL's own values; any other value returns `400 {"error":"scope_mismatch"}`. They cannot retarget the stream.
- `traceId` is per log source: edge entries carry the edge's hex request ID, backend request/response pairs share their own UUID. Entries from the edge and the backend, or from different kits, never share one.
- `level` accepts ONE value at a time on the kit URL: `level=warn,error` returns `total: 0`, so query each level separately and union client-side.
- `serviceName` is not honoured on the kit URL for `GET /_logs` (the list handler ignores it); filter client-side. It IS honoured on `GET /_logs/stream`, so tail with `serviceName=` and list without it.
- Every `list` read returns `{entries,total,limit,offset}`. `last=N` returns the newest N entries, oldest first, in one response (`total` is the number returned, `offset` does not apply, and `last` wins over `afterId`); on the kit URL without bodies or time filters those entries come from the in-memory recent buffer and carry `id: 0`, so never cursor from them. `afterId` always reads the log database: real row ids, oldest first, `total` counts every entry after the cursor and `offset` pages through them.
- `includeRequestBody`/`includeResponseBody` default `false`.
- The resume buffer holds at most 2,000 frames and 8 MiB, shared by every stream on the server, so a busy neighbour shortens your window; past it you get `event: gap`.
- A server restart ends the stream with no event; ids then resume at least 10,000 past the last value the server saved, which can trail the last id you saw, and the buffer starts empty, so a pre-restart `Last-Event-ID` gets `event: gap`. On `event: reset` drop your saved id and reconnect without it.
- `logs` strict-boolean; `"*"` does NOT grant.
- `kind` = `request`/`response`/`event`.

## Common errors

- 403 — missing `logs: true` (permission / blocked-path gate).
- 429 — per-scope rate limit on SNI reads (list, getStats, stream), 30 per minute by default and lower or higher on some deployments → `{error:"rate_limited"}` with `Retry-After: 2`; back off.
- Anything under `/_logs/` other than the three reads above is not part of the kit surface (404).
- The kit-URL log paths accept `GET` and `HEAD` for reads. `OPTIONS` is answered separately as a CORS preflight (200, no log data); any other method gets `405` with `Allow: GET, HEAD`.
- Desync if `event:` lines unparsed; reset on `reset`.

## Related namespaces

- `exec`/`daemon` — app logs.
- `terminal` — reproduce.
- `watch` — fs events.
- `api` — lifecycle.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. The 7 recipes below cover every working filter, both paging modes, the stats endpoint, and SSE resume. The list endpoint does **not** filter by program, source IP (`clientIp`), alias hostname or `serviceName` server-side (none of them is honoured as a query parameter on `GET /_logs`); scope by those fields client-side after a paged scan, as §2 (status) and §5 (traceId) do.

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns the newest N entries in the usual `{entries,total,…}` envelope, ordered **oldest-first within the returned slice**. On the kit URL they come from the in-memory recent buffer and carry `id: 0` placeholders, so use §3 for a cursor. It is the cheapest call you can make.

```typescript
const r = await client.proxyLogs.list({ last: 50 });
for (const e of r.data.entries ?? []) {
  console.log(e.tsIso, e.kind, e.level, e.serviceName, e.method, e.url, e.status ?? '—');
}
```

### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```typescript
const r = await client.proxyLogs.list({ level: 'error', limit: 200 });
const fivexx = (r.data as any).entries.filter((e: any) => e.status >= 500 && e.status < 600);
console.log(`${fivexx.length} 5xx of ${(r.data as any).total} error entries`);
```

### 3. Walk the full window with an `afterId` cursor (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. Page by row id: `afterId` always reads the log database, returns entries **oldest first** with real row ids, and `total` counts every entry after the cursor. Start at `afterId=0`, then pass the last `id` of each page as the next `afterId`; new traffic lands after your cursor, so nothing shifts under you. Plain `limit`/`offset` without `afterId` counts from the **newest** entry, so arriving entries move every page during a walk. Do not cursor from a `last=N` read: its rows carry `id: 0`. Walk until `entries` is empty.

**Rate limit:** kit-URL reads are limited per scope: by default a burst of 10, then 30 per minute (one every 2 s), and some deployments differ (see Common errors). A walk longer than about 10 pages therefore gets `429 {"error":"rate_limited"}`. That reply has no `entries`, so a loop that reads it as an empty page stops early and looks finished. The loops below treat any failed call, or any reply without an `entries` array, as a failure. After each failure they wait (2 s, then 4, 8, 16 and 32 s) and retry. The walk stops with an error and exit status 1 on the 6th failed call in a row, after 5 retries and about 62 s of waiting.

```typescript
let afterId = 0;
let tries = 0;
for (;;) {
  let rows: any[] | undefined;
  try {
    const page = await client.proxyLogs.list({ afterId, limit: 500 });
    // A 429 or other refusal throws; a reply without an `entries` array is a failure too.
    rows = Array.isArray(page.data?.entries) ? page.data.entries : undefined;
  } catch { rows = undefined; }
  if (rows === undefined) {
    tries += 1;
    if (tries > 5) throw new Error(`log walk stopped at afterId=${afterId}`);
    await new Promise(r => setTimeout(r, 1000 * 2 ** tries)); // 2, 4, 8, 16, 32 s
    continue;
  }
  tries = 0;
  if (rows.length === 0) break;
  for (const e of rows) console.log(e.id, e.tsIso, e.serviceName, e.status);
  afterId = rows[rows.length - 1]!.id!;
}
// SDK convenience: `client.proxyLogs.listAll({ afterId: 0, limit: 500 })` walks the same set
// (with `afterId`, `total` counts every entry after the cursor and `offset` pages through them).
// Do not pass `last` to listAll/listIterator: a `last` read is one response, never a page.
```

### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byContainer, byService }` — perfect for a dashboard tile.

```typescript
const s = await client.proxyLogs.getStats();
const d = s.data as any;
const noisiest = Object.entries(d.byService)
  .sort((a, b) => (b[1] as number) - (a[1] as number))
  .slice(0, 3);
console.log(`${d.total} entries, ${d.byLevel.warn} warns, hot:`, noisiest);
```

### 5. Group entries that share a `traceId`

**Goal:** find every entry recorded under one `traceId`. The ID is assigned per log source, not per end-to-end request: an edge entry carries the edge's own 32-character hex request ID, and a backend `request`/`response` pair shares a separately generated UUID. A `traceId` therefore does not link an edge entry to a backend entry, or a request to calls it makes to other kits; correlate those by `tsMs`, `serviceName` and `url` instead. The kit does not filter on `traceId` server-side, so scan a recent window and group client-side.

```typescript
const tid = '354a5a0222e7107c46ae2851ded57fa6';
const r = await client.proxyLogs.list({
  limit: 1000, includeRequestBody: true, includeResponseBody: true,
});
const chain = (r.data as any).entries
  .filter((e: any) => e.traceId === tid)
  .sort((a: any, b: any) => a.tsMs - b.tsMs);
console.log(`${chain.length} hops in trace ${tid}`);
```

### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and resume after a network blip. Live frames carry an `id:` line holding an increasing integer cursor; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. The resume is complete only while your cursor is still in the server's replay buffer: when it is not, the first frame is `event: gap` (no `id:`, data `{"after","resumedFrom"}`), and the entries in between are NOT replayed. Treat `gap` as a control event, not a log entry: backfill the missing window with `proxyLogs.list` (`sinceMs` = the `tsMs` of the last entry you processed), skip entries you already handled, then carry on with the stream. `event: purged` carries an `id:` and `data: {}`: advance the cursor past it, but it is not an entry. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

```typescript
// `client.proxyLogs.stream(...)` IS the live stream: it returns
// `Promise<AsyncIterable<IStreamEvent>>`, so `for await` over it directly. It also takes
// `serviceName`, `kind` and `level` and sends them as query filters — no raw `fetch()`,
// no hand-rolled SSE frame parsing, no client-side filtering.
// No cursor until the first live frame: LastEventID is sent only when defined, and any
// value, '0' included, is parsed as a real cursor (replays the buffer, can raise `gap`).
let lastSeen: string | undefined;
let lastTsMs: number | undefined;                  // tsMs of the last entry handled, for gap backfill
const seen = new Set<string>();                    // dedupe backfilled vs streamed entries (trim it in long runs)
const handle = (e: any) => {
  const key = `${e.traceId}|${e.kind}|${e.tsMs}`;
  if (seen.has(key)) return;
  seen.add(key);
  lastTsMs = e.tsMs;
  console.log(e.tsIso, e.serviceName, e.status, e.url);
};
let running = true;
// A disconnect is routine, so the read sits in a reconnect loop that resends the cursor.
// The loop body is guarded: a rejected read is what a dropped connection LOOKS like, and an
// unguarded one escapes the loop instead of reaching the backoff.
while (running) {
  try {
    const events = await client.proxyLogs.stream({
      level: 'warn',
      LastEventID: lastSeen,
    });
    for await (const ev of events) {
      if (ev.event === 'reset') {          // cursor rebased — drop it and reopen
        lastSeen = undefined;
        break;
      }
      if (ev.event === 'scope-destroyed') { // container gone — stop for good
        running = false;
        break;
      }
      if (ev.id) lastSeen = ev.id;          // first replay frame has no id; seed on live frames
      if (ev.event === 'purged') continue;  // moves the cursor, carries no entry
      if (ev.event === 'gap') {             // buffer no longer reaches the cursor: backfill, then go on
        if (lastTsMs !== undefined) {
          // Fixed window [lastTsMs, now]. Pages come newest first, so read EVERY page of the
          // window before handling any of it; `handle` drops what was already streamed.
          const untilMs = Date.now();
          const rows: any[] = [];
          for (let offset = 0; ; offset += 500) {
            let page: any;
            try {
              page = await client.proxyLogs.list({ level: 'warn', sinceMs: lastTsMs, untilMs, limit: 500, offset });
            } catch (err) {
              running = false;              // an unfilled gap must not be skipped: stop loudly
              throw new Error(`log gap backfill failed after tsMs=${lastTsMs}`, { cause: err });
            }
            const batch = page.data.entries ?? [];
            rows.push(...batch);
            if (batch.length < 500 || offset + 500 >= (page.data.total ?? 0)) break;
          }
          rows.sort((a, b) => a.tsMs - b.tsMs).forEach(handle);
        }
        continue;
      }
      const payload = JSON.parse(ev.raw);   // the data: payload, prefixes stripped
      for (const e of Array.isArray(payload) ? payload : [payload]) handle(e);
    }
  } catch (err) {
    if (!running) throw err;                // a failed gap backfill: surface it, never skip entries
    console.warn('log stream dropped, reconnecting:', err);
  }
  if (running) await new Promise(r => setTimeout(r, 1000)); // brief backoff before reconnecting
}
```

### 7. Read request + response bodies for a debug slice

**Goal:** inspect what the upstream actually sent or received for a narrow slice of entries (e.g. recent warns). Request and response bodies are captured by default, but query results leave them out. Pass `includeRequestBody` and `includeResponseBody` to get the bodies already stored with the entries you query. These options change what a query returns, not what gets captured: a body that was never captured cannot be brought back. The live stream never carries bodies. Bodies are capped at 65 536 B by default, and bodies whose content type matches `image/`, `video/`, `audio/`, `application/octet-stream` or `font/` are not captured by default. The deployment's log configuration sets whether bodies are captured, the cap and the excluded types; this API cannot change any of them. A body the reader-side cap shortens ends in `...[TRUNCATED]`; one already cut upstream carries no marker, so do not test for that suffix to detect truncation. `bodyTruncated` can be `true`, `false` or absent, so test it for truthiness and never compare it to `false`.

```typescript
const r = await client.proxyLogs.list({
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

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.proxyLogs` (5) — logs

#### `getStats` — Get log statistics

```typescript
client.proxyLogs.getStats()
```

**Returns:** `Promise<ProxyLogsGetStatsResponse>`  |  **HTTP:** `GET /_logs/stats`
**CLI:** `hoody proxy logs stats`

---

#### `list` — Query centralized logs

```typescript
client.proxyLogs.list(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | query | No | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. |
| `projectId` | `string` | query | No |  |
| `containerId` | `string` | query | No |  |
| `serviceName` | `string` | query | No | Filter to one service. The per-container logs URL ignores it, so filter the returned entries client-side. GET /_logs/stream honours it. |
| `level` | `string` | query | No | Log level: exactly ONE of debug, info, warn or error. A comma-separated value matches nothing. |
| `includeRequestBody` | `boolean` | query | No |  |
| `includeResponseBody` | `boolean` | query | No |  |
| `last` | `number` | query | No | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. |
| `afterId` | `number` | query | No | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `kind` | `"request" \| "response" \| "event"` | query | No |  |
| `method` | `string` | query | No |  |
| `source` | `"backend" \| "edge"` | query | No |  |
| `sinceMs` | `number` | query | No | Only entries whose `tsMs` is at least this (Unix milliseconds). |
| `untilMs` | `number` | query | No | Only entries whose `tsMs` is at most this (Unix milliseconds). |

**Returns:** `Promise<ProxyLogsListResponse>`  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `listAll` — Query centralized logs (collect all pages)

```typescript
client.proxyLogs.listAll(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | query | No | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. |
| `projectId` | `string` | query | No |  |
| `containerId` | `string` | query | No |  |
| `serviceName` | `string` | query | No | Filter to one service. The per-container logs URL ignores it, so filter the returned entries client-side. GET /_logs/stream honours it. |
| `level` | `string` | query | No | Log level: exactly ONE of debug, info, warn or error. A comma-separated value matches nothing. |
| `includeRequestBody` | `boolean` | query | No |  |
| `includeResponseBody` | `boolean` | query | No |  |
| `last` | `number` | query | No | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. |
| `afterId` | `number` | query | No | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `kind` | `"request" \| "response" \| "event"` | query | No |  |
| `method` | `string` | query | No |  |
| `source` | `"backend" \| "edge"` | query | No |  |
| `sinceMs` | `number` | query | No | Only entries whose `tsMs` is at least this (Unix milliseconds). |
| `untilMs` | `number` | query | No | Only entries whose `tsMs` is at most this (Unix milliseconds). |

**Returns:** `Promise<(NonNullable<ProxyLogsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { entries?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.entries`, all pages collected (`list()` fetches one page). Each item is `proxyLogs_LogEntry`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `listIterator` — Query centralized logs (async iterator)

```typescript
client.proxyLogs.listIterator(options?: { limit?: number; offset?: number; projectId?: string; containerId?: string; serviceName?: string; level?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | query | No | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. |
| `projectId` | `string` | query | No |  |
| `containerId` | `string` | query | No |  |
| `serviceName` | `string` | query | No | Filter to one service. The per-container logs URL ignores it, so filter the returned entries client-side. GET /_logs/stream honours it. |
| `level` | `string` | query | No | Log level: exactly ONE of debug, info, warn or error. A comma-separated value matches nothing. |
| `includeRequestBody` | `boolean` | query | No |  |
| `includeResponseBody` | `boolean` | query | No |  |
| `last` | `number` | query | No | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. |
| `afterId` | `number` | query | No | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `kind` | `"request" \| "response" \| "event"` | query | No |  |
| `method` | `string` | query | No |  |
| `source` | `"backend" \| "edge"` | query | No |  |
| `sinceMs` | `number` | query | No | Only entries whose `tsMs` is at least this (Unix milliseconds). |
| `untilMs` | `number` | query | No | Only entries whose `tsMs` is at most this (Unix milliseconds). |

**Returns:** `AsyncGenerator<(NonNullable<ProxyLogsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { entries?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.entries` per step, next page fetched on demand (`list()` fetches one page). Each item is `proxyLogs_LogEntry`.  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `stream` — Live-tail logs over Server-Sent Events

```typescript
client.proxyLogs.stream(options?: { projectId?: string; containerId?: string; serviceName?: string; kind?: "request" | "response" | "event"; level?: "debug" | "info" | "warn" | "error"; source?: "backend" | "edge"; afterId?: number; LastEventID?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `projectId` | `string` | query | No | Filter to a single project |
| `containerId` | `string` | query | No | Filter to a single container |
| `serviceName` | `string` | query | No | Filter the stream to one service, e.g. tunnel. Honoured here, unlike GET /_logs. |
| `kind` | `"request" \| "response" \| "event"` | query | No |  |
| `level` | `"debug" \| "info" \| "warn" \| "error"` | query | No |  |
| `source` | `"backend" \| "edge"` | query | No |  |
| `afterId` | `number` | query | No | Limits the initial batch of a fresh connection to entries whose `id` is greater than this. Entries in that batch carry `id: 0`, so a value of 0 or more leaves it empty. Live frames are unaffected. |
| `LastEventID` | `string` | header `Last-Event-ID` | No | The numeric `id` of the last event received. On reconnect the server skips buffered entries whose `id` is at most this value. |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /_logs/stream`
**CLI:** `hoody proxy logs stream`

