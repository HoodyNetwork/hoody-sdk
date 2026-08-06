> _**HTTP skill · `watch` namespace** · ~4,032 tokens · hoody-sdk v1.0.0-beta.12_

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

- Container with `hoody-watch` kit (Linux only); see `SKILL-HTTP.md` for auth + URL routing.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Provision and verify

1. `POST /watchers` — paths plus optional `recursive`, `include`, `exclude`, `kinds`, `ignore_dirs`, `skip_hidden`, `coalesce_ms`, `history_size`
2. `GET /watchers/{id}` — read back `id`, `WatcherConfigView`, `WatcherStats`

### 2. SSE live-tail with resume

1. `POST /watchers`
2. `GET /watchers/{id}/events/sse` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `GET /watchers/{id}/events`/`Iterator` with `since_id`; persist highest `id`.

### 4. WebSocket consumer

1. `POST /watchers`
2. `GET /watchers/{id}/events/ws` — respond to server `Ping` within ~20s or socket closes
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory and teardown

List/inspect/delete via `GET /watchers`/`get`/`DELETE /watchers/{id}`.

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
- `503 SHUTTING_DOWN` — only on `GET /watchers/{id}/events/sse`/`GET /watchers/{id}/events/ws` while draining; history reads still work
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Every step in every example was live-tested against a real `watch-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first. **There is no `update` endpoint** — change a watcher's config = delete + recreate.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history.

**Step 1 — create the watcher.** Capture `id`. `recursive` defaults to `true`; tighten `coalesce_ms` from the default 100 ms to 50 ms for snappier debounce.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' \
  -d '{"paths":["/tmp/wt"],"recursive":true,"coalesce_ms":50}' | jq -r .id)
echo "WID=$WID"
```
**Step 2 — read back stats** (response carries `config` + `stats`; `events_seen > 0` after the first FS touch confirms the inotify watch is live).

```bash
curl -sf "$KIT/watchers/$WID" | jq '{id, config: .config | {paths, recursive, coalesce_ms}, stats}'
```
### 2. SSE live-tail with `since_id` resume after disconnect

**Goal:** subscribe to live events; on disconnect, replay everything missed.

**Step 1 — open the SSE stream.** Each frame is `id: <n>\nevent: file_event\ndata: {…json…}\n\n`. The `id` is monotonic; persist it as your resume cursor.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
curl -sN -H 'Accept: text/event-stream' "$KIT/watchers/$WID/events/sse"
# id: 519
# event: file_event
# data: {"id":519,"watcher_id":"…","kind":"created","path":"/tmp/wt/app.log","new_size_bytes":0,"is_dir":false,"timestamp":"…"}
```
**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if the buffer rolled past your cursor you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```bash
curl -sN -H 'Accept: text/event-stream' \
  "$KIT/watchers/$WID/events/sse?since_id=$LAST_ID"
```
### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer needs binary frames or bidirectional control. Server sends Ping every ~20 s; miss the pong and the socket closes.

```bash
# wscat or any WS client. URL is wss://, NOT https://, on the SAME host.
wscat -c "wss://${P}-${C}-watch-1.${N}.containers.hoody.com/watchers/$WID/events/ws?since_id=37000"
# < {"id":37511,"watcher_id":"…","kind":"created","path":"/tmp/wt/ws-trigger.txt",…}
# (server Ping arrives every ~20s; client lib auto-pongs)
```
A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from `newest_available_id`. Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
PAGE=1
while :; do
  R=$(curl -sf "$KIT/watchers/$WID/events?since_id=$LAST&page=$PAGE&limit=200")
  N=$(jq '.items | length' <<< "$R")
  jq -c '.items[]' <<< "$R" >> /tmp/events.ndjson
  [ "$N" -lt 200 ] && break
  PAGE=$((PAGE+1))
done
LAST=$(jq -r '.newest_available_id' <<< "$R")
echo "resume cursor=$LAST"
```
### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild only on real content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' \
  -d '{"paths":["/tmp/wt"],"kinds":["modified"],"coalesce_ms":50}' | jq -r .id)
# Sanity-check that only modified events arrive after a few writes:
curl -sf "$KIT/watchers/$WID/events?limit=20" \
  | jq '[.items[].kind] | unique'   # → ["modified"]
```
⚠ A single `writeFile` triggers two `inotify` events on Linux: the `created` (size 0) and a follow-up `modified` once data is written. With `kinds: ["modified"]` you skip the empty-file noise and only see real writes — live-verified.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
WID=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' \
  -d '{
    "paths":["/tmp/wt"],
    "include":["**/*.log"],
    "exclude":["**/secret-*.log"]
  }' | jq -r .id)
# After a few writes, only non-secret .log paths show up:
curl -sf "$KIT/watchers/$WID/events?limit=40" | jq '[.items[].path] | unique'
# → ["/tmp/wt/app.log"]   (secret-1.log and data.json are filtered out)
```
### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` is the inotify-side counter (post-coalesce); `active_clients` counts live SSE+WS connections.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
curl -sf "$KIT/watchers?limit=200" \
  | jq '.items[] | {id, paths: .config.paths, kinds: (.config.kinds // []),
                    events_seen: .stats.events_seen,
                    active_clients: .stats.active_clients}'
```
### 8. Change a watcher's config — there is no `update`, you delete and recreate

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. The kit exposes only `create | get | delete` — there is **no** `PATCH /watchers/{id}`. Pattern: snapshot the old config, delete, create new, hand off the resume cursor.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
# 1. snapshot
OLD=$(curl -sf "$KIT/watchers/$WID")
LAST=$(curl -sf "$KIT/watchers/$WID/events?limit=1" | jq -r '.newest_available_id // 0')
# 2. delete
curl -sX DELETE "$KIT/watchers/$WID"
# 3. recreate with merged config; reuse paths/include/exclude/coalesce_ms from $OLD
NEW_CFG=$(jq '.config | {paths, recursive, include, exclude, ignore_dirs, coalesce_ms,
                          history_size, kinds: ["modified","removed"]}' <<<"$OLD")
NEW=$(curl -sX POST "$KIT/watchers" -H 'Content-Type: application/json' -d "$NEW_CFG" | jq -r .id)
# 4. consumer reconnects to NEW with since_id="$LAST" — but ids are per-watcher,
#    Event ids are process-global (monotonic AtomicU64 on WatchServiceInner — see models.rs:20),
#    so the new watcher's first event has id ≥ the global counter at swap time; treat HISTORY_GAP
#    as the trigger for a full re-list, not the swap itself.
echo "old=$WID new=$NEW (caller MUST drop the old cursor; new id space)"
```
⚠ Event ids are process-global, not per-watcher; the `since_id` cursor remains numerically valid across the swap, but the new watcher's first event will have an id ≥ the global counter, so any gap below that is from the old watcher's stream — treat HISTORY_GAP as the trigger for a full re-list, not the swap itself.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /watchers/{id}` and `/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
curl -sX DELETE "$KIT/watchers/$WID"   # → {"id":"…","deleted":true}
# Verify gone:
curl -sw '\n%{http_code}\n' "$KIT/watchers/$WID"          # → 404 WATCHER_NOT_FOUND
curl -sw '\n%{http_code}\n' "$KIT/watchers/$WID/events"   # → 404 WATCHER_NOT_FOUND
```
### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**.

```bash
KIT="https://${P}-${C}-watch-1.${N}.containers.hoody.com"
TS=$(date -u -d '5 minutes ago' +%FT%TZ)
curl -sf "$KIT/watchers/$WID/events?since_timestamp=$TS&limit=200" \
  | jq '{count: (.items|length), kinds: [.items[].kind] | unique, oldest_available_id, newest_available_id}'
```
For a rename the kit relies on the notify backend's combined `RenameMode::Both` event, which carries both paths: it emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side with `old_path: null`. Filter on `old_path != null` to keep only the paired form.

## Reference

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/watch/health` | Health Check |  |

### `streams` (3) — Real-time event streams

| Method | Summary | Params |
|--------|---------|--------|
| `GET /watchers/{id}/events` | List Watcher Events | `?since_id` `?since_timestamp` `?page` `?limit` |
| `GET /watchers/{id}/events/sse` | Stream Watcher Events Sse | `?since_id` `?since_timestamp` |
| `GET /watchers/{id}/events/ws` | Stream Watcher Events Ws | `?since_id` `?since_timestamp` |

**Param notes:**

- `since_id` — Replay events strictly after this event id.
- `since_timestamp` — Replay events strictly after this timestamp. Accepted formats: - RFC3339 (e.g. 2026-02-11T15:30:00Z) - Unix seconds (e.g. 1739287800) - Unix milliseconds (e.g. 1739287800123)
- `page` — Page number (1-based).
- `limit` — Items per page (1-200).

### `system` (2) — System endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /openapi.json` | Get Open Api Json |  |
| `GET /openapi.yaml` | Get Open Api Yaml |  |

### `watchers` (4) — Watcher management

| Method | Summary | Params |
|--------|---------|--------|
| `POST /watchers` | Create Watcher | `body*:watch_CreateWatcherRequest` |
| `DELETE /watchers/{id}` | Delete Watcher |  |
| `GET /watchers/{id}` | Get Watcher |  |
| `GET /watchers` | List Watchers | `?page` `?limit` |

**Param notes:**

- `page` — Page number (1-based).
- `limit` — Items per page (1-200).


### Body schemas

- `watch_CreateWatcherRequest` — `{ coalesce_ms: int|null, exclude: string[]|null, history_size: int|null, ignore_dirs: string[]|null, include: string[]|null, kinds: watch_WatchEventKind[]|null, paths*: string[], recursive: bool|null, skip_hidden: bool|null }`
- `watch_WatchEventKind` — `"created" | "modified" | "removed" | "renamed" | "metadata" | "overflow" | "other"`
