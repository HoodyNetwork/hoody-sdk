> _**SDK skill · `watch` namespace** · ~8,709 tokens · hoody-sdk v1.0.0-beta.16_

# `watch` — Linux inotify file-change streams with replay history

## Purpose

Per-container filesystem-event service. Configure watchers (paths, globs, ignore-dirs, coalesce window); consume events via paginated history, SSE, or WebSocket. Bounded in-memory replay buffer supports `since_id` resume.

## When to use

- Live-tail FS changes inside a container (build, hot-reload, log tail)
- Detect `created | modified | removed | renamed | metadata` events on paths/trees
- Audit writes by filtering `kinds`
- Resume after disconnect via `since_id` / `since_timestamp`

## When NOT to use

- One-shot listing/stat, file-content tail, shell-process lifecycle, cross-container aggregation (see §Related namespaces).

## Prerequisites

- Container with `hoody-watch` kit (Linux only); see `SKILL-SDK.md` for auth + URL routing.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Provision and verify

1. `client.watch.watchers.create` — paths plus optional `recursive`, `include`, `exclude`, `kinds`, `ignore_dirs`, `skip_hidden`, `coalesce_ms`, `history_size`
2. `client.watch.watchers.get` — read back `id`, `WatcherConfigView`, `WatcherStats`

### 2. SSE live-tail with resume

1. Create the watcher as in workflow 1
2. `client.watch.events.stream` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `client.watch.events.list` with `since_id`, one page per call; persist the highest `id`. `client.watch.events.listAll` and `client.watch.events.listIterator` walk at most 1,000 pages (50 events each by default), then throw if more remain: pass `{ limit: 200 }` for large histories, and beyond 200,000 events page by hand with `after_id`.

### 4. WebSocket consumer

1. Create the watcher as in workflow 1
2. `client.watch.events.connect` — the server pings every 20 s and closes the socket when the pong is missing; most WebSocket clients answer pings on their own
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory, reconfiguration and teardown

List with `client.watch.watchers.list`, inspect with `client.watch.watchers.get`, reconfigure in place with `client.watch.watchers.update`, remove with `client.watch.watchers.delete`. `client.watch.watchers.listIterator` yields every watcher across pages.

## Quirks & gotchas

- Linux only; on non-Linux hosts the binary exits before opening the listener (no HTTP served) — typically with code 0 via the container-path check, or code 1 if those paths exist. A 501 `UNSUPPORTED_PLATFORM` response is defined but unreachable from a normal startup: the process exits before it can serve one.
- No kit-level auth header; do not add `Authorization` on direct kit calls
- `recursive` defaults `true`; `coalesce_ms` defaults `100`
- `ignore_dirs` default: `node_modules, .git, target, __pycache__, .hg, .svn, .cache, dist, .next, .nuxt, vendor, bower_components`. Pass `[]` to disable; `null` falls back to default
- Default limits, which the kit's command-line flags can change: 128 watchers/kit, 32 paths/watcher, 64 stream clients/watcher, replay buffer of 100 000 events or 16 MiB per watcher (whichever is hit first). `history_size` on create overrides the event count per watcher; values under 32 are raised to 32 and there is no upper cap, so the 16 MiB memory limit is the effective bound
- Watcher ids are UUIDs; a path segment that is not a UUID is rejected with `400` before the route runs
- `since_id` and `since_timestamp` mutually exclusive — both = 400 `INVALID_CURSOR`
- A cursor older than the retained history returns 409 `HISTORY_GAP`. For `since_id` that means `since_id > 0` and `since_id + 1` is below the oldest retained id, so `since_id=0` never gaps. For `since_timestamp` it means the timestamp is earlier than the oldest retained event, which is common on a young or quiet watcher ("the last 5 minutes" of a watcher created 2 minutes ago gaps as soon as it has one event). An empty history never gaps for `since_id` or `since_timestamp`; an `after_id` walk (next bullet) can still gap on an empty history, when an event after its cursor was evicted or was too large to keep.
- Walking history page by page: pass `after_id` (the previous response's `next_after_id`; the response also carries `has_more`). If an event you have not read yet was evicted between two requests, the next one fails with 409 `HISTORY_GAP` instead of skipping it. A `page` walk counts from the oldest retained event, so an eviction between pages skips events silently. `since_id`, `since_timestamp` and `page` are ignored when `after_id` is set. `events.listAll` and `events.listIterator` walk by `after_id`, starting from the numeric `after_id` you pass, if any.
- `since_timestamp` accepts RFC3339, unix seconds, or millis (switches to ms when `|n| >= 100_000_000_000`)
- WS message cap 64 KiB by default; the server sends JSON text frames only, ignores text and binary frames from the client, pings every 20 s and disconnects on a missed pong
- `kind` (wire field name): `created | modified | removed | renamed | metadata | overflow | other` (snake_case enum); `overflow` = events were lost, either because the kernel event queue overflowed or because the kit's own internal event channel was saturated; `overflow` events are delivered even when `kinds` does not list them

## Common errors

- `400 INVALID_PAGINATION` — `page=0`, `limit=0` or `limit` above 200; defaults `page=1, limit=50`. A negative or non-numeric `page`/`limit` also answers HTTP 400 `INVALID_PAGINATION`; the message names the parameter
- `400 INVALID_REQUEST` — empty `paths`, an invalid or missing path, a glob that does not compile, or an invalid `ignore_dirs` entry. All of these answer the same code, so read the message, not the code, to tell them apart
- `400 INVALID_CURSOR` — both cursor fields, or unparseable timestamp
- `404 WATCHER_NOT_FOUND` — UUID syntactically valid but no watcher; also raised pre-upgrade on stream endpoints
- `409 LIMIT_EXCEEDED` — more than 32 `paths` in one watcher, or 128 watchers already live on the container
- `409 HISTORY_GAP` — cursor older than oldest retained; body `details` carries `oldest_available_id` / `newest_available_id`
- `429 MAX_CLIENTS_REACHED` — >64 concurrent SSE+WS on one watcher; capacity incremented after checks pass (no slot leak)
- `500 WATCHER_START_FAILED` — the kit could not start the inotify watch for a new watcher
- `503 SHUTTING_DOWN` — the kit is stopping: `events.stream`/`events.connect` and `watchers.create` return it. Watchers are removed at shutdown, so reads of a watcher or its history return 404 `WATCHER_NOT_FOUND` instead
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. To change a watcher's config, update it in place (example 8); deleting and recreating it loses its history and disconnects its consumers.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history. Create `/tmp/wt` inside the container first (or use a path that already exists): creating a watcher does not create its paths, and a missing path is refused with `400 INVALID_REQUEST`.

**Step 1 — create the watcher.** Capture `id`. `recursive` defaults to `true`; tighten `coalesce_ms` from the default 100 ms to 50 ms for snappier debounce.

```typescript
const r = await client.watch.watchers.create({
  paths: ['/tmp/wt'],
  recursive: true,
  coalesce_ms: 50,
});
const wid = r.data!.id;
```

**Step 2 — read back stats** (response carries `config` + `stats`; `events_seen > 0` after the first FS touch confirms the inotify watch is live).

```typescript
const view = await client.watch.watchers.get(wid);
console.log(view.data!.stats.events_seen);
```

### 2. SSE live-tail with `since_id` resume after disconnect

**Goal:** subscribe to live events; on disconnect, replay everything missed.

**Step 1 — open the SSE stream.** Each frame the SDK yields carries `event` (`file_event` or `lag`), `seq` (the event id) and `raw` (the JSON payload as text). The `id` is monotonic; persist it as your resume cursor.

```typescript
// streamSse resolves to an async iterable of SSE frames; iterate it to live-tail.
let lastId = 0;
const stream = await client.watch.events.stream(wid, { since_id: lastId });
for await (const frame of stream) {
  if (frame.event === 'lag') break; // history lost: rebuild from a fresh listing
  if (frame.event !== 'file_event') continue;
  const ev = JSON.parse(frame.raw);
  lastId = ev.id;
  console.log(ev.kind, ev.path);
}
```

**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if the buffer rolled past your cursor you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```typescript
// Resume from the last id processed, page by page, with after_id: it answers 409
// HISTORY_GAP when any event after the cursor was lost (evicted, or too large to
// keep), where since_id would skip it silently. On a 409, restart once from
// since_id=0 (which never gaps) to re-read everything still retained.
let cursor: { since_id?: number; after_id?: number } = { after_id: lastId };
let recovered = false;
for (;;) {
  let items: any[];
  try {
    const page = await client.watch.events.list(wid, { ...cursor, limit: 200 });
    items = (page.data as any)?.items ?? [];
  } catch (e: any) {
    if (e.status !== 409 || e.code !== 'HISTORY_GAP' || recovered) throw e;
    recovered = true;
    cursor = { since_id: 0 }; // data loss: rebuild from the oldest retained event
    continue;
  }
  for (const ev of items) { lastId = ev.id; console.log(ev.kind, ev.path); }
  if (items.length < 200) break;
  cursor = { after_id: lastId };
}
// lastId now continues the step 1 loop from here
```

### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer prefers a WebSocket. The server sends each event as a JSON text frame carrying `"type":"file_event"` and ignores text and binary messages from the client. It sends a Ping every 20 s and closes the socket when the Pong does not arrive, so the client must answer Pings (most WebSocket libraries do this automatically); it also answers the client's own Pings.

```typescript
// streamWs resolves to a WebSocket client: register handlers, then connect.
const ws = await client.watch.events.connect(wid, { since_id: 37000 });
ws.onFileEvent((ev) => console.log(ev.kind, ev.path));
ws.onLag(() => { /* history lost: drop state and rebuild from a fresh listing */ });
await ws.connect();
```

A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from the highest event id you actually persisted (not the response's `newest_available_id`, which describes the whole buffer). Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** Fetch the first page with your starting `since_id`, then follow `next_after_id` as `after_id` while `has_more` is true; a 409 `HISTORY_GAP` on an `after_id` page means events were evicted before you read them, so the replay is incomplete. Do not walk with `page`: with `since_id=0` an eviction between pages shifts the offsets and skips events without an error. `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```typescript
// events.listIterator yields individual events (NOT pages) and walks by after_id, so just push.
// Signature is (id, options?, _templateVars?) — since_id / limit go in options.
const collected: any[] = [];
for await (const ev of client.watch.events.listIterator(wid, { since_id: lastId, limit: 200 })) {
  collected.push(ev);
}
const resume = collected.at(-1)?.id ?? lastId;
```

### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild on content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`. `overflow` events still arrive when `kinds` leaves them out, so a consumer should handle them anyway.

```typescript
const r = await client.watch.watchers.create({
  paths: ['/tmp/wt'], kinds: ['modified'], coalesce_ms: 50,
});
const events = await client.watch.events.list(r.data!.id, { limit: 50 });
```

⚠ Creating and writing a file usually produces a `created` and a `modified`, but the number of events and the size recorded on the `created` event are not fixed: sizes are sampled when the kit processes the event, and events inside the `coalesce_ms` window are merged. `kinds: ["modified"]` drops the `created` events, but `modified` is also reported when a file opened for writing is closed unchanged, so it does not prove the content changed.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`.

```typescript
const r = await client.watch.watchers.create({
  paths: ['/tmp/wt'],
  include: ['**/*.log'],
  exclude: ['**/secret-*.log'],
});
```

### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` counts raw inotify events before coalescing, so it can be larger than the number of events in the history; `active_clients` counts live SSE+WS connections. One call returns at most 200 watchers; with the default cap of 128 watchers per kit that is all of them, but when the cap has been raised, walk further pages with `page` until the items seen reach `total`.

```typescript
// listIterator yields individual watcher records (NOT pages); signature is
// (options?, _templateVars?) — pagination params live in options.
const all: any[] = [];
for await (const w of client.watch.watchers.listIterator({ limit: 200 })) {
  all.push(w);
}
```

### 8. Change a watcher's config — update it in place

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. Update the watcher in place: omitted fields keep their current value, a list you send replaces that whole list, and at least one field must be given. Changing only `kinds`, as below, keeps the watcher's id, its retained history and its connected SSE/WebSocket clients. Shrinking `history_size` evicts the oldest events beyond the new cap and can turn an existing replay cursor into a `HISTORY_GAP`; ordinary eviction as new events arrive still applies. Deleting and recreating the watcher instead would lose the history and disconnect every consumer.

```typescript
await client.watch.watchers.update(wid, { kinds: ['modified', 'removed'] });
```

If the new configuration cannot be started, the request fails with 500 and the watcher keeps its old configuration.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /watchers/{id}` and `/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```typescript
await client.watch.watchers.delete(wid);
try { await client.watch.watchers.get(wid); }
catch (e: any) { /* e.status === 404, e.code === 'WATCHER_NOT_FOUND' */ }
```

### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**. If the oldest retained event is newer than the timestamp (a watcher younger than 5 minutes, or a buffer that has rolled over), the call returns **409 `HISTORY_GAP`**. That only means the history does not reach back that far: every retained event is newer than the timestamp, so read them all from `since_id=0`. One call returns at most 200 events; walk further pages with `after_id` set to the last id received, not `since_id`: `since_id` only checks the oldest retained id, so it misses an event evicted, or too large to keep, between two pages without an error. A 409 on one of those later `after_id` pages means such an event was lost while paging, so the result is incomplete. Treat it as a failure and run the recovery again from the start.

```typescript
const events: any[] = [];
let cursor: { since_timestamp?: string; since_id?: number; after_id?: number } = {
  since_timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
};
for (;;) {
  let items: any[];
  try {
    items = ((await client.watch.events.list(wid, { ...cursor, limit: 200 })).data as any)?.items ?? [];
  } catch (e: any) {
    // 409 HISTORY_GAP on the timestamp query: every retained event is newer than
    // the timestamp, so read them all (since_id=0 never gaps).
    if (e.status === 409 && cursor.since_timestamp) { cursor = { since_id: 0 }; continue; }
    throw e; // includes a 409 on a later after_id page: history incomplete, run again
  }
  events.push(...items);
  if (items.length < 200) break;
  cursor = { after_id: items[items.length - 1].id }; // next page: after_id detects unread evictions
}
```

When the filesystem reports a rename as a single event carrying both paths, the kit emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side without an `old_path` field (it is omitted, not null). Keep only events that have `old_path` to get the paired form.

## Reference

**Accessor:** `client.watch`  |  **Import:** `import * as watch from 'hoody-sdk/watch'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself is complete as written: the object after it takes the transport options too.

### `client.watch.events` (5) — Real-time event streams

#### `connect` — Stream Watcher Events Ws

```typescript
client.watch.events.connect(id: string, options?: { since_id?: number | null; since_timestamp?: string | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `number \| null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | query | No | Replay events strictly after this timestamp. Accepted formats: RFC3339 (e.g. 2026-02-11T15:30:00Z); Unix seconds (e.g. 1739287800); Unix milliseconds (e.g. 1739287800123) |

**Returns:** `Promise<WatchStreamWatcherEventsWsWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /watchers/{id}/events/ws`

---

#### `list` — List Watcher Events

```typescript
client.watch.events.list(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `number \| null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | query | No | Replay events strictly after this timestamp. Accepted formats: RFC3339 (e.g. 2026-02-11T15:30:00Z); Unix seconds (e.g. 1739287800); Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | query | No | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Ignored when `after_id` is set. |
| `limit` | `number \| null` | query | No | Items per page (1-200). |
| `after_id` | `number \| null` | query | No | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`). `since_id`, `since_timestamp` and `page` are ignored when it is set. If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |

**Returns:** `Promise<WatchEventsListResponse>`  |  **HTTP:** `GET /watchers/{id}/events`
**CLI:** `hoody watch events list`

---

#### `listAll` — List Watcher Events (collect all pages)

```typescript
client.watch.events.listAll(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `number \| null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | query | No | Replay events strictly after this timestamp. Accepted formats: RFC3339 (e.g. 2026-02-11T15:30:00Z); Unix seconds (e.g. 1739287800); Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | query | No | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Ignored when `after_id` is set. |
| `limit` | `number \| null` | query | No | Items per page (1-200). |
| `after_id` | `number \| null` | query | No | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`). `since_id`, `since_timestamp` and `page` are ignored when it is set. If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |

**Returns:** `Promise<(NonNullable<WatchEventsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `watch_FileEvent`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /watchers/{id}/events`
**CLI:** `hoody watch events list`

---

#### `listIterator` — List Watcher Events (async iterator)

```typescript
client.watch.events.listIterator(id: string, options?: { since_id?: number | null; since_timestamp?: string | null; page?: number | null; limit?: number | null; after_id?: number | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `number \| null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | query | No | Replay events strictly after this timestamp. Accepted formats: RFC3339 (e.g. 2026-02-11T15:30:00Z); Unix seconds (e.g. 1739287800); Unix milliseconds (e.g. 1739287800123) |
| `page` | `number \| null` | query | No | Page number (1-based), counted from the oldest event still retained. History is a ring buffer: if events are evicted between two page requests the offsets shift and a page walk can skip events without an error. Walk with `after_id` instead to have that reported. Ignored when `after_id` is set. |
| `limit` | `number \| null` | query | No | Items per page (1-200). |
| `after_id` | `number \| null` | query | No | Continue a walk: return the `limit` events after this event id (the previous response's `next_after_id`). `since_id`, `since_timestamp` and `page` are ignored when it is set. If any event after it has been evicted from history since, the request fails with `409 HISTORY_GAP` rather than skipping it. |

**Returns:** `AsyncGenerator<(NonNullable<WatchEventsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `watch_FileEvent`.  |  **HTTP:** `GET /watchers/{id}/events`
**CLI:** `hoody watch events list`

---

#### `stream` — Stream Watcher Events Sse

```typescript
client.watch.events.stream(id: string, options?: { since_id?: number | null; since_timestamp?: string | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `number \| null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string \| null` | query | No | Replay events strictly after this timestamp. Accepted formats: RFC3339 (e.g. 2026-02-11T15:30:00Z); Unix seconds (e.g. 1739287800); Unix milliseconds (e.g. 1739287800123) |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /watchers/{id}/events/sse`
**CLI:** `hoody watch events stream`

---

### `client.watch.kit` (1) — System endpoints

#### `getHealth` — Health Check

```typescript
client.watch.kit.getHealth()
```

**Returns:** `Promise<WatchKitGetHealthResponse>`  |  **HTTP:** `GET /api/v1/watch/health`
**CLI:** `hoody watch health`

---

### `client.watch.watchers` (7) — Watcher management

#### `create` — Create Watcher

```typescript
client.watch.watchers.create(data: WatchWatchersCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `WatchWatchersCreateRequest` | body | Yes | Shape: `watch_CreateWatcherRequest` under Body schemas. |

**Returns:** `Promise<WatchWatchersCreateResponse>`  |  **HTTP:** `POST /watchers`
**CLI:** `hoody watch create`

---

#### `delete` — Delete Watcher

```typescript
client.watch.watchers.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |

**Returns:** `Promise<WatchWatchersDeleteResponse>`  |  **HTTP:** `DELETE /watchers/{id}`
**CLI:** `hoody watch delete`

---

#### `get` — Get Watcher

```typescript
client.watch.watchers.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |

**Returns:** `Promise<WatchWatchersGetResponse>`  |  **HTTP:** `GET /watchers/{id}`
**CLI:** `hoody watch get`

---

#### `list` — List Watchers

```typescript
client.watch.watchers.list(options?: { page?: number | null; limit?: number | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number \| null` | query | No | Page number (1-based). |
| `limit` | `number \| null` | query | No | Items per page (1-200). |

**Returns:** `Promise<WatchWatchersListResponse>`  |  **HTTP:** `GET /watchers`
**CLI:** `hoody watch list`

---

#### `listAll` — List Watchers (collect all pages)

```typescript
client.watch.watchers.listAll(options?: { page?: number | null; limit?: number | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number \| null` | query | No | Page number (1-based). |
| `limit` | `number \| null` | query | No | Items per page (1-200). |

**Returns:** `Promise<(NonNullable<WatchWatchersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `watch_WatcherResponse`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /watchers`
**CLI:** `hoody watch list`

---

#### `listIterator` — List Watchers (async iterator)

```typescript
client.watch.watchers.listIterator(options?: { page?: number | null; limit?: number | null })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number \| null` | query | No | Page number (1-based). |
| `limit` | `number \| null` | query | No | Items per page (1-200). |

**Returns:** `AsyncGenerator<(NonNullable<WatchWatchersListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `watch_WatcherResponse`.  |  **HTTP:** `GET /watchers`
**CLI:** `hoody watch list`

---

#### `update` — Reconfigure a live watcher in place. Omitted fields keep their current values. The watcher keeps its id, replay history (so since_id / since_timestamp cursors stay valid) and its connected SSE/WebSocket clients; only the file-system backend is replaced. The new backend starts before the old one stops, and events the old backend had already queued are processed before the handoff completes. So a change under a path watched by both configurations is not lost across the swap (one landing inside that window may be reported twice), and a change under a path only the old configuration watched is delivered if the old backend saw it before stopping. The drain is bounded: if the old backend has not finished within 5 seconds (a backstop against a wedged backend), the handoff completes anyway and events still queued in the old backend at that point are dropped, with a warning in the service log. A request that fails leaves the watcher unchanged. A body with no field is refused with 400 `INVALID_REQUEST`; a body whose fields all equal the current values returns the watcher as it is, without replacing the backend.

```typescript
client.watch.watchers.update(id: string, data: WatchWatchersUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `data` | `WatchWatchersUpdateRequest` | body | Yes | Shape: `watch_UpdateWatcherRequest` under Body schemas. |

**Returns:** `Promise<WatchWatchersUpdateResponse>`  |  **HTTP:** `PATCH /watchers/{id}`
**CLI:** `hoody watch update`


### Body schemas

- `watch_CreateWatcherRequest` — `{ coalesce_ms: int|null, exclude: string[]|null, history_size: int|null, ignore_dirs: string[]|null, include: string[]|null, kinds: watch_WatchEventKind[]|null, paths*: string[], recursive: bool|null, skip_hidden: bool|null }`
  - Create a watcher. Only `paths` is required. A field the service does not know (a misspelt option such as `recursiv`) is refused with 400 `INVALID_REQUEST` naming it, as on update, rather than ignored.
  - `include` — Optional include glob patterns. If present, path must match one include.
- `watch_UpdateWatcherRequest` — `{ coalesce_ms: int|null, exclude: string[]|null, history_size: int|null, ignore_dirs: string[]|null, include: string[]|null, kinds: watch_WatchEventKind[]|null, paths: string[]|null, recursive: bool|null, skip_hidden: bool|null }`
  - Reconfigure a live watcher. Every field is optional; an omitted field keeps the watcher's current value, but at least one field must be given. The watcher keeps its id, its replay history (so `since_id` / `since_timestamp` cursors stay valid) and its connected SSE/WebSocket clients.
  - `coalesce_ms` — Coalescing window in milliseconds (minimum 10).
  - `history_size` — Replay history capacity (minimum 32). Growing keeps every retained event; shrinking drops only the oldest events beyond the new cap.
- `watch_WatchEventKind` — `"created" | "modified" | "removed" | "renamed" | "metadata" | "overflow" | "other"`
  - What changed. … `modified` and `metadata` are reported only for a path that exists when the event is processed, so a write or close through a descriptor that outlives the file's name is not reported. …

