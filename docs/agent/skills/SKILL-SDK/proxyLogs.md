> _**SDK skill · `proxyLogs` namespace** · ~9,260 tokens · hoody-sdk v1.0.1_

# `proxyLogs` — Per-computer request/response/event log query, stats, and SSE tail

## Purpose

Read-only access to the computer reverse-proxy log store: query, stats, SSE tail.

## When to use

- Debug 4xx/5xx on a kit subdomain.
- Live-tail during deploys.
- Status-code mix; filter by `kind`/`level`/`method`/`serviceName`.

## When NOT to use

App stdout/stderr → `exec`/`daemon`, file events → `watch`, user SQLite → `sqlite`, shell → `terminal`; clearing logs not exposed.

## Prerequisites

- Project + computer (it need not be running); logging automatic.
- Access: with no proxy policy, or under a default-allow policy, the kit URL alone reads the logs unless a rule refuses them. A computer that has been deleted keeps its retained logs, but those are served only under a computer or project policy that allows them: with no policy the kit URL answers 403. A group grant for logs must be an explicit `"logs": true`; `"*"` does not grant logs. To restrict access, set a policy that denies it.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. List recent

- `proxyLogs.list` with `last: N` or `limit`+`offset` (SNI-bound).
- Sweep: `proxyLogs.listAll` / `proxyLogs.listIterator`.

### 2. Drill into 5xx

- `proxyLogs.list` `level: "error"` (5xx entries auto-promote to `error`), `includeResponseBody: true`; add `serviceName` to keep one kit's entries (applied before paging).
- Paginate from a cursor with `afterId`: it reads the log database (real row ids), oldest first, and `total` counts every entry after the cursor.

### 3. Live-tail with resume

- `proxyLogs.stream` — SSE; live frames carry an `id:` line holding an opaque increasing integer cursor (a fresh connection first gets a data-only array of recent matching entries with no `id:` line, only when there are some; otherwise its first frame is a live one).
- Reconnect with `Last-Event-ID`; the server replays the buffered frames after it. `event: gap` (no `id:`) means it no longer reaches back that far: backfill the missing entries from `proxyLogs.list`.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Stats snapshot

- `proxyLogs.getStats` — with no filter: `total` plus `byLevel`, `byProject`, `byComputer`, `byService` and `timeRange`. With a read filter (`serviceName`, `level`, `status`/`minStatus`/`maxStatus`, `path`, `sinceMs`/`untilMs`, …) it counts the matching rows and adds `byStatusClass` (`1xx` through `5xx`, `none`). To get a `buckets[]` time series of `byLevel` and `byStatusClass`, pass `sinceMs` and `bucketMs` (at least 60000); `untilMs` defaults to now, and the window may contain at most 240 buckets. It refuses `afterId`, `beforeId`, `last`, `offset` and `limit`.

### 5. Bodies for a slice

- `proxyLogs.list` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`computerId` on `proxyLogs.list` ignored — SNI auto-scopes.
- On the stream the kit URL also determines the scope. Caller-supplied `projectId`/`computerId` cannot retarget it: the edge overwrites them with the URL's own values.
- `traceId` is per log source: edge entries carry the edge's hex request ID, backend request/response pairs share their own UUID. Entries from the edge and the backend, or from different kits, never share one.
- `level` takes one or more of `debug`, `info`, `warn`, `error` as ONE comma-separated value on the kit URL (`level=warn,error`). A repeated `level` key, an empty item in a list (`warn,`) or an unknown level is refused with 400 `INVALID_QUERY_PARAMETER`. The SDK checks `level` before it sends: `level: ''`, `'warn,'` and an unknown name throw a `ValidationError` (omit `level` for no filter).
- `serviceName` and `traceId` are applied by `GET /_logs` on the kit URL before `last`, `limit` and `offset`, so a page holds only matching entries and `total` counts only those (so do the other filters listed in the intro to Examples). `serviceName` also filters `GET /_logs/stream`. Public Bot calls are logged under `serviceName=bots`
- Every `proxyLogs.list` read returns `{entries,total,limit,offset}` in `.data`. `last=N` returns the newest N entries (N is at most 1000; a smaller `limit` caps it further only on a read with no `afterId`, time filter or body option, otherwise `last` alone sets the count), oldest first, in one response (`total` is the number returned, `offset` does not apply, and `last` wins over `afterId`); on the kit URL without bodies or time filters the in-memory recent buffer answers when it holds N matching entries, and the computer's log database answers otherwise, so neighbouring traffic or a server restart does not shorten the result. Every entry carries its row `id`, so pass the last one as `afterId` to follow on. `afterId` always reads the log database: oldest first, `total` counts every entry after the cursor and `offset` pages through them.
- `includeRequestBody`/`includeResponseBody` default `false`.
- The resume buffer holds at most 2,000 frames and 8 MiB, shared by every stream on the server, so a busy neighbour shortens your window (when a limit is passed, the server drops the oldest frame of the largest computer of the project holding the most frames, or the most bytes when the bytes limit is the one passed); past it you get `event: gap`.
- A server restart ends the stream with no event; ids then resume at least 10,000 past the last value the server saved, which can trail the last id you saw, and the buffer starts empty, so a pre-restart `Last-Event-ID` gets `event: gap`. On `event: reset` drop your saved id and reconnect without it.
- `logs` strict-boolean; `"*"` does NOT grant.
- `kind` = `request`/`response`/`event`.

## Common errors

- 403 — the computer's proxy policy refuses logs to this caller: a default-deny policy with no group grant of `logs: true` that the caller meets, or a rule that refuses them (permission / blocked-path gate).
- 429 — per-scope rate limit on SNI reads (list, getStats, stream), 30 per minute by default and lower or higher on some deployments → `{error:"rate_limited"}` with `Retry-After: 2`; back off. A 429 `{error:"audit_quota_exceeded"}` with `Retry-After: 60` means the project's log-read audit share, or the global tenant audit ceiling, is used up: wait at least that long (the value is a hint, not a promise that capacity is back). A 503 `audit_write_blocked` or `audit_write_failed` means the read could not be audited; retry later.
- Anything under `/_logs/` other than the three reads above is not part of the kit surface (404).
- The kit-URL log paths accept `GET` and `HEAD` for reads. `OPTIONS` is answered separately as a CORS preflight (200, no log data) while the computer's proxy permissions allow requests (with the proxy switched off or an invalid permission file it is refused like any other request); any other method gets `405` with `Allow: GET, HEAD`.
- Desync if `event:` lines unparsed; reset on `reset`.

## Related namespaces

- `exec`/`daemon` — app logs.
- `terminal` — reproduce.
- `watch` — fs events.
- `api` — lifecycle.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. The 7 recipes below cover both paging modes, the stats endpoint, and SSE resume. The list endpoint filters on the server by `serviceName`, `traceId`, `level` (comma list), `excludeService` (comma list, up to 8), `kind`, `method`, `source`, `status` or a `minStatus`/`maxStatus` range (100-599, not both), `path` (a substring of the entry's URL), `botUrl` (a Bot URL id, `bu_…`) and a `sinceMs`/`untilMs` window; all apply before `last`, `limit` and `offset`. It does not filter by program, source IP (`clientIp`) or alias hostname.

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the computer's edge proxy. Uses `last=N`, which returns the newest N entries in the usual `{entries,total,…}` envelope, ordered **oldest-first within the returned slice**. On the kit URL they come from the in-memory recent buffer when it holds enough matching entries, otherwise from the log database. Each entry carries its row `id`: pass the last one as `afterId` (§3) to read what came after. It is the cheapest call you can make.

```typescript
const r = await client.proxyLogs.list({ last: 50 });
for (const e of r.data.entries ?? []) {
  console.log(e.tsIso, e.kind, e.level, e.serviceName, e.method, e.url, e.status ?? '—');
}
```

### 2. Triage 4xx/5xx with a server-side status range

**Goal:** find the failed requests. `minStatus`/`maxStatus` select a status range on the server, before `limit`, so the page holds only 4xx/5xx entries and `total` counts only those; an entry without a status never matches a range. (The edge also promotes **5xx** to `level: error` and **4xx** to `level: warn`, except a Bot call the client closed (499), which is `info`; so `level=warn,error` is a coarser alternative that misses it.)

```typescript
const r = await client.proxyLogs.list({ minStatus: 400, maxStatus: 599, limit: 200 });
const failed = (r.data as any).entries;
console.log(`${failed.length} of ${(r.data as any).total} 4xx/5xx entries`);
```

### 3. Walk the full window with an `afterId` cursor (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. Page by row id: `afterId` always reads the log database, returns entries **oldest first** with real row ids, and `total` counts every entry after the cursor. Start at `afterId=0`, then pass the last `id` of each page as the next `afterId`; new traffic lands after your cursor, so nothing shifts under you. Plain `limit`/`offset` without `afterId` counts from the **newest** entry, so arriving entries move every page during a walk. To start from the present instead of the oldest entry, take the cursor from the last entry of a `last=N` read. Walk until `entries` is empty.

**Rate limit:** kit-URL reads are limited per scope: by default a burst of 10, then 30 per minute (one every 2 s), and some deployments differ (see Common errors). A rapid walk longer than about 10 pages can therefore get `429 {"error":"rate_limited"}`. That reply has no `entries`, so a loop that reads it as an empty page stops early and looks finished. A read the kit could not complete is harder to see: it answers `200` with `entries: []` and `failed: true`, which also looks like the end of the log. The loops below treat any failed call, any reply without an `entries` array and any reply with `failed: true` as a failure. After each failure they wait (2 s, then 4, 8, 16 and 32 s) and retry. The walk stops with an error and exit status 1 on the 6th failed call in a row, after 5 retries and about 62 s of waiting, so an `audit_quota_exceeded` refusal (`Retry-After: 60`) can stop it early: wait, then resume from the `afterId` it reports.

```typescript
let afterId = 0;
let tries = 0;
for (;;) {
  let rows: any[] | undefined;
  try {
    const page = await client.proxyLogs.list({ afterId, limit: 500 });
    // A 429 or other refusal throws; a reply without an `entries` array, or with `failed: true`, is a failure too.
    const failed = (page.data as { failed?: boolean } | undefined)?.failed === true;
    rows = !failed && Array.isArray(page.data?.entries) ? page.data.entries : undefined;
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
// It does not check `failed`, so a failed read ends it early: use the loop when the walk must be complete.
// Do not pass `last` to listAll/listIterator: a `last` read is one response, never a page.
```

### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byComputer, byService }` — perfect for a dashboard tile. Filtered results also include `byStatusClass`; a valid `sinceMs` and `bucketMs` request includes `buckets`.

```typescript
const s = await client.proxyLogs.getStats();
const d = s.data as any;
const noisiest = Object.entries(d.byService)
  .sort((a, b) => (b[1] as number) - (a[1] as number))
  .slice(0, 3);
console.log(`${d.total} entries, ${d.byLevel.warn} warns, hot:`, noisiest);
```

### 5. Look up the entries of one `traceId`

**Goal:** find every entry recorded under one `traceId`. The ID is assigned per log source, not per end-to-end request: an edge entry carries the edge's own 32-character hex request ID, and a backend `request`/`response` pair shares a separately generated UUID. A `traceId` therefore does not link an edge entry to a backend entry, or a request to calls it makes to other kits; correlate those by `tsMs`, `serviceName` and `url` instead. Pass `traceId` and the kit returns only that ID's entries; the request ID a public Bot URL answers with (`X-Request-Id`) is the `traceId` of its `bots` entry.

```typescript
const tid = '354a5a0222e7107c46ae2851ded57fa6';
const r = await client.proxyLogs.list({
  traceId: tid, includeRequestBody: true, includeResponseBody: true,
});
const chain = [...(r.data.entries ?? [])].sort((a, b) => (a.tsMs ?? 0) - (b.tsMs ?? 0));
console.log(`${chain.length} hops in trace ${tid}`);
```

### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and resume after a network blip. Live frames carry an `id:` line holding an increasing integer cursor; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. The resume is complete only while your cursor is still in the server's replay buffer: when it is not, the first frame is `event: gap` (no `id:`, data `{"after","resumedFrom"}`), and the entries in between are NOT replayed. Treat `gap` as a control event, not a log entry: backfill with `proxyLogs.list` (`afterId` = the greatest entry row `id` you already processed, with the stream's filters kept; read every page and deduplicate by row `id`, because producer timestamps can arrive out of order, so a `sinceMs` window can miss rows), then carry on with the stream. `event: purged` carries an `id:` and `data: {}`: advance the cursor past it, but it is not an entry. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — this log scope was destroyed (the computer may still exist).

A live or replayed frame (one entry) larger than 256 KiB is replaced by a stub that keeps the entry's row `id` and carries `truncated: true` and `originalFrameBytes`. The initial replay array has its own byte budget instead, so it can exceed 256 KiB as a whole. To get the full entry, read that row with the list call, `proxyLogs.list({ afterId: id - 1, limit: 1 })` (`afterId` is exclusive, so passing `id` itself skips the row) (add `includeRequestBody` / `includeResponseBody` for its stored bodies, which the list leaves out by default) and check that the returned entry's `id` matches; the SSE `id:` line is a different cursor from this row id. If the row cannot be read, report the missing entry instead of treating the stub as complete.

```typescript
// `client.proxyLogs.stream(...)` IS the live stream: it returns
// `Promise<IEventStream>`; await the call, then `for await` over the stream it gives back. It also takes
// `serviceName`, `kind` and `level` and sends them as query filters — no raw `fetch()`,
// no hand-rolled SSE frame parsing, no client-side filtering.
// Two cursors. The frame cursor is the last SSE `id:` line (`ev.id`): sent back as
// `lastEventId` (the `Last-Event-ID` header), it replays the buffered frames after it, and a resume the buffer
// no longer covers starts with `event: gap`. The row cursor is the greatest entry row id
// handled: `proxyLogs.list` backfills from it. `afterId` on `stream` only trims a fresh
// connection's initial batch, which comes from a bounded in-memory buffer, so a fresh
// reopen after a disconnect backfills from the row cursor first.
let frameId: string | undefined;                   // last SSE `id:` seen: the Last-Event-ID resume cursor
let newest: number | undefined;                    // greatest row id handled: the backfill start
const seen = new Set<string>();                    // dedupe backfilled vs streamed entries (trim it in long runs)
const handle = (e: any) => {
  const key = String(e.id);                       // the entry's row id: the same in the stream and in list
  if (seen.has(key)) return;
  seen.add(key);
  newest = Math.max(newest ?? 0, e.id);
  console.log(e.tsIso, e.serviceName, e.status, e.url);
};
let running = true;
// Rows after the row cursor, oldest first. Read EVERY page after the cursor before
// handling any of it; `handle` drops what was already streamed.
const backfill = async () => {
  if (newest === undefined) return;
  const afterId = newest;
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    let page: any;
    try {
      page = await client.proxyLogs.list({ level: 'warn', afterId, limit: 500, offset });
      if (page.data?.failed === true) throw new Error('the log read failed (failed: true)');   // a 200 with no entries, not an empty gap
    } catch (err) {
      running = false;                            // an unfilled gap must not be skipped: stop loudly
      throw new Error(`log gap backfill failed after row id=${afterId}`, { cause: err });
    }
    const batch = page.data.entries ?? [];
    rows.push(...batch);
    if (batch.length < 500 || offset + 500 >= (page.data.total ?? 0)) break;
  }
  rows.sort((a, b) => a.id - b.id).forEach(handle);
};
// A disconnect is routine, so the read sits in a reconnect loop that resends the cursor.
// The loop body is guarded: a rejected read is what a dropped connection LOOKS like, and an
// unguarded one escapes the loop instead of reaching the backoff.
while (running) {
  try {
    if (frameId === undefined) await backfill(); // no frame cursor: the fresh initial batch may not reach back
    const events = await client.proxyLogs.stream({
      level: 'warn',
      ...(frameId === undefined
        ? (newest === undefined ? {} : { afterId: newest })
        : { lastEventId: frameId }),
    });
    for await (const ev of events) {
      if (ev.event === 'reset') {          // stream cursor rebased: drop the frame cursor, reopen fresh
        frameId = undefined;
        break;
      }
      if (ev.event === 'scope-destroyed') { // log scope destroyed — stop this tail
        running = false;
        break;
      }
      if (ev.id !== undefined) frameId = ev.id; // every frame with an `id:` line, `purged` included
      if (ev.event === 'purged') continue;  // moves the frame cursor, carries no entry
      if (ev.event === 'gap') {             // buffer no longer reaches the frame cursor: backfill, then go on
        await backfill();
        continue;
      }
      const payload = JSON.parse(ev.raw);   // the data: payload, prefixes stripped
      for (const e of Array.isArray(payload) ? payload : [payload]) {
        let entry = e;
        if (e.truncated === true) {          // a stub: fetch the whole row by its own id
          try {
            const result = await client.proxyLogs.list({ afterId: e.id - 1, limit: 1 });
            const full = result.data.entries?.find(row => row.id === e.id);
            if (!full) throw new Error(`log row ${e.id} is unavailable`);
            entry = full;
          } catch (err) {
            running = false;
            throw new Error(`truncated log row ${e.id} could not be read: ${String(err)}`);
          }
        }
        handle(entry);
      }
    }
  } catch (err) {
    if (!running) throw err;                // a failed gap backfill: surface it, never skip entries
    console.warn('log stream dropped, reconnecting:', err);
  }
  if (running) await new Promise(r => setTimeout(r, 1000)); // brief backoff before reconnecting
}
```

### 7. Read request + response bodies for a debug slice

**Goal:** inspect what the upstream actually sent or received for a narrow slice of entries (e.g. recent warns). Request and response bodies are captured by default, but query results leave them out. Pass `includeRequestBody` and `includeResponseBody` to get the bodies already stored with the entries you query. One query returns about 4 MiB of stored bodies at most (the first entry with a body always keeps its stored bodies, even over that, still subject to the reader-side cap below): once that is spent, the remaining entries come back without bodies and the result carries `bodiesOmitted: true`. Read those entries again with a smaller `limit` (a page of one always carries its body). These options change what a query returns, not what gets captured: a body that was never captured cannot be brought back. The live stream leaves out `requestBody` and `responseBody`, but keeps `data`: for a reply the proxy answered itself, `data` holds what it answered, redacted (for example `{error, errorCode}`; an inline reply puts its body, or a short summary of it, under `data.body`). By default a response body is stored up to its first 64 KB (65 536 bytes), and a request body is stored only when it declares a `Content-Length` of 64 KB or less (a larger or chunked request body is not stored at all). Bodies whose content type matches `image/`, `video/`, `audio/`, `application/octet-stream` or `font/` are not captured by default. The deployment's log configuration sets whether bodies are captured, the cap and the excluded types; this API cannot change any of them. A body the reader-side cap shortens (by default it counts 65 536 UTF-16 code units of each returned `requestBody`, `responseBody` and `data.body` string, not bytes; the deployment's log configuration sets the limit) ends in `...[TRUNCATED]`; one already cut upstream carries no marker, so do not test for that suffix to detect truncation. `bodyTruncated` can be `true`, `false` or absent, so test it for truthiness and never compare it to `false`.

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

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

### `client.proxyLogs` (5) — logs

#### `getStats` — Get log statistics

```typescript
client.proxyLogs.getStats(options?: { serviceName?: string; excludeService?: string; traceId?: string; level?: string; path?: string; status?: number; minStatus?: number; maxStatus?: number; botUrl?: string; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number; bucketMs?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `serviceName` | `string` | query | No | Only entries of this service. |
| `excludeService` | `string` | query | No | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots,exec`). Entries without a service name are kept. Applied before paging. |
| `traceId` | `string` | query | No | Only the entries with this request ID. |
| `level` | `string` | query | No | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applied before `limit`, `offset` and `last`. On the per-computer logs URL an unknown level, an empty item or a repeated `level` is refused with 400. |
| `path` | `string` | query | No | Only entries whose address contains this text, matched literally (`%` and `_` are ordinary characters) and ignoring the case of A-Z. At most 200 characters, with no control characters. Applied before paging. |
| `status` | `number` | query | No | Only entries with this HTTP status. Not allowed with `minStatus` or `maxStatus`. |
| `minStatus` | `number` | query | No | Only entries with an HTTP status of at least this. Entries without a status never match a status range. |
| `maxStatus` | `number` | query | No | Only entries with an HTTP status of at most this. Must not be below `minStatus`. |
| `botUrl` | `string` | query | No | Only the Bot calls of this Bot URL (`bu_` followed by 24 lowercase hex digits). Use with `serviceName=bots`. |
| `kind` | `"request" \| "response" \| "event"` | query | No |  |
| `method` | `string` | query | No |  |
| `source` | `"backend" \| "edge"` | query | No |  |
| `sinceMs` | `number` | query | No | Only entries whose `tsMs` is at least this (Unix milliseconds). Required with `bucketMs`, where it is also the start of the first bucket. |
| `untilMs` | `number` | query | No | Only entries whose `tsMs` is at most this (Unix milliseconds). With `bucketMs` it defaults to the time of the request. |
| `bucketMs` | `number` | query | No | Also count the entries per bucket of this many milliseconds (at least 60000). Bucket i starts at `sinceMs + i × bucketMs`; the last bucket holds `untilMs`, so a window gives floor((untilMs − sinceMs) / bucketMs) + 1 buckets, at most 240. Every bucket is returned, empty ones included. |

**Returns:** `Promise<ProxyLogsGetStatsResponse>`  |  **HTTP:** `GET /_logs/stats`
**CLI:** `hoody proxy logs stats`

---

#### `list` — Query centralized logs

```typescript
client.proxyLogs.list(options?: { limit?: number; offset?: number; projectId?: string; computerId?: string; serviceName?: string; traceId?: string; level?: string; excludeService?: string; path?: string; status?: number; minStatus?: number; maxStatus?: number; botUrl?: string; includeRequestBody?: boolean; includeResponseBody?: boolean; last?: number; afterId?: number; beforeId?: number; kind?: "request" | "response" | "event"; method?: string; source?: "backend" | "edge"; sinceMs?: number; untilMs?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Page size. A value above 1000 is treated as 1000. |
| `offset` | `number` | query | No | Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`. Not allowed with `beforeId`. |
| `projectId` | `string` | query | No | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `computerId` | `string` | query | No | Not needed on a computer's logs URL: the URL fixes the project and computer, and this argument cannot select another computer's logs. |
| `serviceName` | `string` | query | No | Only entries of this service (for example `exec` or `bots`). Applied before `limit`, `offset` and `last`, so `total` counts only matching entries. |
| `traceId` | `string` | query | No | Only the entries with this request ID (`traceId`). Applied before `limit`, `offset` and `last`. |
| `level` | `string` | query | No | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applied before `limit`, `offset` and `last`. On the per-computer logs URL an unknown level, an empty item or a repeated `level` is refused with 400. |
| `excludeService` | `string` | query | No | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots,exec`). Entries without a service name are kept. Applied before paging. |
| `path` | `string` | query | No | Only entries whose address contains this text, matched literally (`%` and `_` are ordinary characters) and ignoring the case of A-Z. At most 200 characters, with no control characters. Applied before paging. |
| `status` | `number` | query | No | Only entries with this HTTP status. Not allowed with `minStatus` or `maxStatus`. |
| `minStatus` | `number` | query | No | Only entries with an HTTP status of at least this. Entries without a status never match a status range. |
| `maxStatus` | `number` | query | No | Only entries with an HTTP status of at most this. Must not be below `minStatus`. |
| `botUrl` | `string` | query | No | Only the Bot calls of this Bot URL (`bu_` followed by 24 lowercase hex digits). Use with `serviceName=bots`. |
| `includeRequestBody` | `boolean` | query | No | Include each entry's stored request body (redacted as described above). |
| `includeResponseBody` | `boolean` | query | No | Include each entry's stored response body (redacted as described above). |
| `last` | `number` | query | No | Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`. To follow on, pass the `id` of the last entry as `afterId`. At most 1000: a larger value is treated as 1000. |
| `afterId` | `number` | query | No | Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. |
| `beforeId` | `number` | query | No | Return the entries whose row id (`id`) is less than this, newest first: pass the `id` of the oldest entry a newest-first page showed to get the page before it. `total` counts every matching entry below the cursor. Not allowed with `afterId`, `last` or `offset`. |
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
client.proxyLogs.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<ProxyLogsListResponse>[]>` — every item of `data.entries`, pages collected from the offset you pass, 0 by default (`list()` fetches one page). Each item is `LogEntry`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `listIterator` — Query centralized logs (async iterator)

```typescript
client.proxyLogs.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<ProxyLogsListResponse>, void, unknown>` — one item of `data.entries` per step, the next page fetched on demand from the offset you pass, 0 by default (`list()` fetches one page). Each item is `LogEntry`.  |  **HTTP:** `GET /_logs`
**CLI:** `hoody proxy logs list`

---

#### `stream` — Live-tail logs over Server-Sent Events

```typescript
client.proxyLogs.stream(options?: { projectId?: string; computerId?: string; serviceName?: string; kind?: "request" | "response" | "event"; level?: string; excludeService?: string; source?: "backend" | "edge"; afterId?: number; lastEventId?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `projectId` | `string` | query | No | Not needed on a computer's logs URL: the URL fixes the stream's project, and a value you send is discarded. |
| `computerId` | `string` | query | No | Not needed on a computer's logs URL: the URL fixes the stream's computer, and a value you send is discarded. |
| `serviceName` | `string` | query | No | Only entries of this service (for example `tunnel` or `bots`). |
| `kind` | `"request" \| "response" \| "event"` | query | No |  |
| `level` | `string` | query | No | Only entries at one of these levels: one or more of debug, info, warn and error, as ONE comma-separated value (for example `warn,error`). Applies to the initial batch, live frames and a resume. An unknown level, an empty item or a repeated `level` is refused with 400. |
| `excludeService` | `string` | query | No | Leave out the entries of these services: up to 8 service names as ONE comma-separated value (for example `bots`). Entries without a service name are kept. Applies to the initial batch, live frames and a resume. |
| `source` | `"backend" \| "edge"` | query | No |  |
| `afterId` | `number` | query | No | Limits the initial batch of a fresh connection to entries whose row id (`id`) is greater than this: the same `id` that GET /_logs returns and takes as `afterId`. Live frames are unaffected. |
| `lastEventId` | `string` | header `Last-Event-ID` | No | The numeric `id` of the last event received. On reconnect the server skips buffered entries whose `id` is at most this value. |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /_logs/stream`
**CLI:** `hoody proxy logs stream`

