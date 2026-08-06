> _**SDK skill · `watch` namespace** · ~5,313 tokens · hoody-sdk v1.0.0-beta.12_

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

1. `client.watch.watchers.create`
2. `client.watch.streams.streamSse` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `listEventsAll`/`Iterator` with `since_id`; persist highest `id`.

### 4. WebSocket consumer

1. `client.watch.watchers.create`
2. `client.watch.streams.streamWs` — respond to server `Ping` within ~20s or socket closes
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory and teardown

List/inspect/delete via `watchers.listIterator`/`get`/`delete`.

## Quirks & gotchas

- Linux only; on non-Linux hosts the binary exits before opening the listener (no HTTP served) — typically with code 0 via the container-path check, or code 1 if those paths exist. The 501 `UNSUPPORTED_PLATFORM` mapping in `api.rs` is a defensive branch that is unreachable from a normal startup.
- No kit-level auth header; do not add `Authorization` on direct kit calls
- `recursive` defaults `true`; `coalesce_ms` defaults `100`
- `ignore_dirs` default: `node_modules, .git, target, __pycache__, .hg, .svn, .cache, dist, .next, .nuxt, vendor, bower_components`. Pass `[]` to disable; `null` falls back to default
- Hard limits: 128 watchers/kit, 32 paths/watcher, 64 stream clients/watcher, replay buffer 100 000 events or 16 MiB (first hit)
- Watcher ids are UUIDs (`Path<Uuid>`); non-UUID segment yields 400 from axum extractor
- `since_id` and `since_timestamp` mutually exclusive — both = 400 `INVALID_CURSOR`
- `since_timestamp` accepts RFC3339, unix seconds, or millis (switches to ms when `|n| >= 100_000_000_000`)
- WS message cap 64 KiB (`ws_max_message_bytes`); server pings every 20s, disconnects on missed pong
- `kind` (wire field name): `created | modified | removed | renamed | metadata | overflow | other` (snake_case enum); `overflow` = inotify dropped events

## Common errors

- `400 INVALID_PAGINATION` — `page < 1` or `limit ∉ [1,200]`; defaults `page=1, limit=50`
- `400 INVALID_REQUEST` — empty `paths`, invalid/missing path, or glob compile fail (`EmptyPaths`, `InvalidPath`, `PathNotFound`, `InvalidPattern`, `InvalidIgnoreDir`)
- `400 INVALID_CURSOR` — both cursor fields, or unparseable timestamp
- `404 WATCHER_NOT_FOUND` — UUID syntactically valid but no watcher; also raised pre-upgrade on stream endpoints
- `409 LIMIT_EXCEEDED` — `paths > 32` or `active_watchers >= 128` on create
- `409 HISTORY_GAP` — cursor older than oldest retained; body `details` carries `oldest_available_id` / `newest_available_id`
- `429 MAX_CLIENTS_REACHED` — >64 concurrent SSE+WS on one watcher; capacity incremented after checks pass (no slot leak)
- `503 SHUTTING_DOWN` — only on `streamSse`/`streamWs` while draining; history reads still work
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Every step in every example was live-tested against a real `watch-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first. **There is no `update` endpoint** — change a watcher's config = delete + recreate.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history.

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

**Step 1 — open the SSE stream.** Each frame is `id: <n>\nevent: file_event\ndata: {…json…}\n\n`. The `id` is monotonic; persist it as your resume cursor.

```typescript
// Generated streamSse returns Promise<ApiResponse<unknown>> (single http.get),
// NOT an async iterator. For live consumption use the URL with EventSource /
// fetch+ReadableStream, or poll the cursor:
let lastId = 0;
for (;;) {
  const page = await client.watch.streams.listEvents(wid, { since_id: lastId, limit: 200 });
  const items = (page.data as any)?.items ?? [];
  for (const ev of items) {
    lastId = ev.id;
    console.log(ev.kind, ev.path);
  }
  if (items.length === 0) await new Promise(r => setTimeout(r, 500));
}
```
**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if the buffer rolled past your cursor you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```typescript
// streamSse takes (id, options?, _templateVars?); since_id goes in options.
const resumed = await client.watch.streams.streamSse(wid, { since_id: lastId });
```
### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer needs binary frames or bidirectional control. Server sends Ping every ~20 s; miss the pong and the socket closes.

```typescript
// Generated streamWs is a plain http.get returning Promise<ApiResponse<unknown>>,
// NOT a WebSocket client. For an actual WS connection, use the kit URL with a
// browser/Node `WebSocket` and pass the bearer cookie/header per § Auth model.
import WebSocket from 'ws';
// Kit WS path is mounted at the kit root, NOT under /api/v1/watch.
const ws = new WebSocket(
  `wss://${P}-${C}-watch-1.${N}.containers.hoody.com/watchers/${wid}/events/ws?since_id=37000`,
);
ws.on('message', (raw) => {
  const ev = JSON.parse(raw.toString());
  if (ev.type === 'lag') { /* drop & rebuild from history */ return; }
  console.log(ev.kind, ev.path);
});
```
A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from `newest_available_id`. Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```typescript
// listEventsIterator yields individual events (NOT pages), so just push.
// Signature is (id, options?, _templateVars?) — since_id / limit go in options.
const collected: any[] = [];
for await (const ev of client.watch.streams.listEventsIterator(wid, { since_id: lastId, limit: 200 })) {
  collected.push(ev);
}
const resume = collected.at(-1)?.id ?? lastId;
```
### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild only on real content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`.

```typescript
const r = await client.watch.watchers.create({
  paths: ['/tmp/wt'], kinds: ['modified'], coalesce_ms: 50,
});
const events = await client.watch.streams.listEvents(r.data!.id, { limit: 50 });
```
⚠ A single `writeFile` triggers two `inotify` events on Linux: the `created` (size 0) and a follow-up `modified` once data is written. With `kinds: ["modified"]` you skip the empty-file noise and only see real writes — live-verified.

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

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` is the inotify-side counter (post-coalesce); `active_clients` counts live SSE+WS connections.

```typescript
// listIterator yields individual watcher records (NOT pages); signature is
// (options?, _templateVars?) — pagination params live in options.
const all: any[] = [];
for await (const w of client.watch.watchers.listIterator({ limit: 200 })) {
  all.push(w);
}
```
### 8. Change a watcher's config — there is no `update`, you delete and recreate

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. The kit exposes only `create | get | delete` — there is **no** `PATCH /watchers/{id}`. Pattern: snapshot the old config, delete, create new, hand off the resume cursor.

```typescript
const old = await client.watch.watchers.get(wid);
await client.watch.watchers.delete(wid);
const fresh = await client.watch.watchers.create({
  ...old.data!.config,
  kinds: ['modified', 'removed'],
});
```
⚠ Event ids are process-global, not per-watcher; the `since_id` cursor remains numerically valid across the swap, but the new watcher's first event will have an id ≥ the global counter, so any gap below that is from the old watcher's stream — treat HISTORY_GAP as the trigger for a full re-list, not the swap itself.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /watchers/{id}` and `/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```typescript
await client.watch.watchers.delete(wid);
try { await client.watch.watchers.get(wid); }
catch (e: any) { /* e.status === 404, e.code === 'WATCHER_NOT_FOUND' */ }
```
### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**.

```typescript
const r = await client.watch.streams.listEvents(wid, {
  since_timestamp: new Date(Date.now() - 5 * 60_000).toISOString(),
  limit: 200,
});
```
For a rename the kit relies on the notify backend's combined `RenameMode::Both` event, which carries both paths: it emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side with `old_path: null`. Filter on `old_path != null` to keep only the paired form.

## Reference

**Accessor:** `client.watch`  |  **Import:** `import * as watch from 'hoody-sdk/watch'`

### `client.watch.health` (1) — Health

#### `check` — Health Check

```typescript
client.watch.health.check()
```

**Returns:** `watch_HealthResponse`  |  **HTTP:** `GET /api/v1/watch/health`
**CLI:** `hoody watch health`

---

### `client.watch.streams` (5) — Real-time event streams

#### `listEvents` — List Watcher Events

```typescript
client.watch.streams.listEvents(id: string, since_id?: integer|null, since_timestamp?: string|null, page?: integer|null, limit?: integer|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `integer|null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string|null` | query | No | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `integer|null` | query | No | Page number (1-based). |
| `limit` | `integer|null` | query | No | Items per page (1-200). |

**Returns:** `watch_EventHistoryResponse`  |  **HTTP:** `GET /watchers/{id}/events`
**CLI:** `hoody watch events list`

---

#### `listEventsAll` — List Watcher Events (collect all pages)

```typescript
client.watch.streams.listEventsAll(id: string, since_id?: integer|null, since_timestamp?: string|null, page?: integer|null, limit?: integer|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `integer|null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string|null` | query | No | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `integer|null` | query | No | Page number (1-based). |
| `limit` | `integer|null` | query | No | Items per page (1-200). |

**Returns:** `watch_EventHistoryResponse[]`  |  **HTTP:** `GET /watchers/{id}/events`
**CLI:** `hoody watch events list`

---

#### `listEventsIterator` — List Watcher Events (async iterator)

```typescript
client.watch.streams.listEventsIterator(id: string, since_id?: integer|null, since_timestamp?: string|null, page?: integer|null, limit?: integer|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `integer|null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string|null` | query | No | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |
| `page` | `integer|null` | query | No | Page number (1-based). |
| `limit` | `integer|null` | query | No | Items per page (1-200). |

**Returns:** `AsyncIterableIterator<watch_EventHistoryResponse>`  |  **HTTP:** `GET /watchers/{id}/events`
**CLI:** `hoody watch events list`

---

#### `streamSse` — Stream Watcher Events Sse

```typescript
client.watch.streams.streamSse(id: string, since_id?: integer|null, since_timestamp?: string|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `integer|null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string|null` | query | No | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |

**Returns:** `any`  |  **HTTP:** `GET /watchers/{id}/events/sse`
**CLI:** `hoody watch events stream`

---

#### `streamWs` — Stream Watcher Events Ws

```typescript
client.watch.streams.streamWs(id: string, since_id?: integer|null, since_timestamp?: string|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |
| `since_id` | `integer|null` | query | No | Replay events strictly after this event id. |
| `since_timestamp` | `string|null` | query | No | Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123) |

**Returns:** `void`  |  **HTTP:** `GET /watchers/{id}/events/ws`

---

### `client.watch.system` (2) — System endpoints

#### `getOpenApiJson` — Get Open Api Json

```typescript
client.watch.system.getOpenApiJson()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.json`

---

#### `getOpenApiYaml` — Get Open Api Yaml

```typescript
client.watch.system.getOpenApiYaml()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.yaml`

---

### `client.watch.watchers` (6) — Watcher management

#### `create` — Create Watcher

```typescript
client.watch.watchers.create(data: watch_CreateWatcherRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `watch_CreateWatcherRequest` | body | Yes |  |

**Returns:** `watch_WatcherResponse`  |  **HTTP:** `POST /watchers`
**CLI:** `hoody watch create`

---

#### `delete` — Delete Watcher

```typescript
client.watch.watchers.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |

**Returns:** `watch_DeleteWatcherResponse`  |  **HTTP:** `DELETE /watchers/{id}`
**CLI:** `hoody watch delete`

---

#### `get` — Get Watcher

```typescript
client.watch.watchers.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Watcher id |

**Returns:** `watch_WatcherResponse`  |  **HTTP:** `GET /watchers/{id}`
**CLI:** `hoody watch get`

---

#### `list` — List Watchers

```typescript
client.watch.watchers.list(page?: integer|null, limit?: integer|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer|null` | query | No | Page number (1-based). |
| `limit` | `integer|null` | query | No | Items per page (1-200). |

**Returns:** `watch_WatcherListResponse`  |  **HTTP:** `GET /watchers`
**CLI:** `hoody watch list`

---

#### `listAll` — List Watchers (collect all pages)

```typescript
client.watch.watchers.listAll(page?: integer|null, limit?: integer|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer|null` | query | No | Page number (1-based). |
| `limit` | `integer|null` | query | No | Items per page (1-200). |

**Returns:** `watch_WatcherListResponse[]`  |  **HTTP:** `GET /watchers`
**CLI:** `hoody watch list`

---

#### `listIterator` — List Watchers (async iterator)

```typescript
client.watch.watchers.listIterator(page?: integer|null, limit?: integer|null)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer|null` | query | No | Page number (1-based). |
| `limit` | `integer|null` | query | No | Items per page (1-200). |

**Returns:** `AsyncIterableIterator<watch_WatcherListResponse>`  |  **HTTP:** `GET /watchers`
**CLI:** `hoody watch list`


### Body schemas

- `watch_CreateWatcherRequest` — `{ coalesce_ms: int|null, exclude: string[]|null, history_size: int|null, ignore_dirs: string[]|null, include: string[]|null, kinds: watch_WatchEventKind[]|null, paths*: string[], recursive: bool|null, skip_hidden: bool|null }`
- `watch_WatchEventKind` — `"created" | "modified" | "removed" | "renamed" | "metadata" | "overflow" | "other"`

