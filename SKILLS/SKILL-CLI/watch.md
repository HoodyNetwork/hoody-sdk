> _**CLI skill · `watch` namespace** · ~3,333 tokens · hoody-sdk v1.0.0-beta.12_

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

- Container with `hoody-watch` kit (Linux only); see `SKILL-CLI.md` for auth + URL routing.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Provision and verify

1. `hoody watch create` — paths plus optional `recursive`, `include`, `exclude`, `kinds`, `ignore_dirs`, `skip_hidden`, `coalesce_ms`, `history_size`
2. `hoody watch get` — read back `id`, `WatcherConfigView`, `WatcherStats`

### 2. SSE live-tail with resume

1. `hoody watch create`
2. `hoody watch events stream` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `hoody watch events list`/`Iterator` with `since_id`; persist highest `id`.

### 4. WebSocket consumer

1. `hoody watch create`
2. `GET /watchers/{id}/events/ws` — respond to server `Ping` within ~20s or socket closes
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory and teardown

List/inspect/delete via `hoody watch list`/`get`/`hoody watch delete`.

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
- `503 SHUTTING_DOWN` — only on `hoody watch events stream`/`GET /watchers/{id}/events/ws` while draining; history reads still work
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Every step in every example was live-tested against a real `watch-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. **There is no `update` endpoint** — change a watcher's config = delete + recreate.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history.

**Step 1 — create the watcher.** Capture `id`. `recursive` defaults to `true`; tighten `coalesce_ms` from the default 100 ms to 50 ms for snappier debounce.

```bash
WID=$(hoody --container "$C" watch create \
  --paths /tmp/wt --recursive --coalesce-ms 50 \
  -o json | jq -r .id)
```
**Step 2 — read back stats** (response carries `config` + `stats`; `events_seen > 0` after the first FS touch confirms the inotify watch is live).

```bash
hoody --container "$C" watch get --id "$WID" -o json | jq '.stats'
```
### 2. SSE live-tail with `since_id` resume after disconnect

**Goal:** subscribe to live events; on disconnect, replay everything missed.

**Step 1 — open the SSE stream.** Each frame is `id: <n>\nevent: file_event\ndata: {…json…}\n\n`. The `id` is monotonic; persist it as your resume cursor.

```bash
hoody --container "$C" watch events stream --id "$WID"
```
**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if the buffer rolled past your cursor you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```bash
hoody --container "$C" watch events stream --id "$WID" --since-id "$LAST_ID"
```
### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer needs binary frames or bidirectional control. Server sends Ping every ~20 s; miss the pong and the socket closes.

```bash
# CLI streams via SSE (no WS subcommand); use `events stream` for live-tail.
hoody --container "$C" watch events stream --id "$WID" --since-id 37000
```
A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from `newest_available_id`. Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```bash
hoody --container "$C" watch events list --id "$WID" \
  --since-id "$LAST" --limit 200 -o json > /tmp/events.json
```
### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild only on real content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`.

```bash
WID=$(hoody --container "$C" watch create \
  --paths /tmp/wt --kinds modified --coalesce-ms 50 -o json | jq -r .id)
hoody --container "$C" watch events list --id "$WID" -o json \
  | jq '[.items[].kind] | unique'
```
⚠ A single `writeFile` triggers two `inotify` events on Linux: the `created` (size 0) and a follow-up `modified` once data is written. With `kinds: ["modified"]` you skip the empty-file noise and only see real writes — live-verified.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`.

```bash
WID=$(hoody --container "$C" watch create --paths /tmp/wt \
  --include '**/*.log' --exclude '**/secret-*.log' -o json | jq -r .id)
```
### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` is the inotify-side counter (post-coalesce); `active_clients` counts live SSE+WS connections.

```bash
hoody --container "$C" watch list --limit 200 -o json \
  | jq '.items[] | {id, paths: .config.paths, events_seen: .stats.events_seen}'
```
### 8. Change a watcher's config — there is no `update`, you delete and recreate

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. The kit exposes only `create | get | delete` — there is **no** `PATCH /watchers/{id}`. Pattern: snapshot the old config, delete, create new, hand off the resume cursor.

```bash
hoody --container "$C" watch delete --id "$WID"
hoody --container "$C" watch create --paths /tmp/wt --kinds modified --kinds removed
```
⚠ Event ids are process-global, not per-watcher; the `since_id` cursor remains numerically valid across the swap, but the new watcher's first event will have an id ≥ the global counter, so any gap below that is from the old watcher's stream — treat HISTORY_GAP as the trigger for a full re-list, not the swap itself.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /watchers/{id}` and `/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```bash
hoody --container "$C" watch delete --id "$WID"
hoody --container "$C" watch get    --id "$WID"   # exits non-zero
```
### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**.

```bash
hoody --container "$C" watch events list --id "$WID" \
  --since-timestamp "$(date -u -d '5 minutes ago' +%FT%TZ)" --limit 200
```
For a rename the kit relies on the notify backend's combined `RenameMode::Both` event, which carries both paths: it emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side with `old_path: null`. Filter on `old_path != null` to keep only the paired form.

## Reference

### `hoody watch` (7) — File system watchers — observe file changes and tail live events

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody watch create` |  | write | Create a new file system watcher. `--paths` is repeatable; `--include`/`--exclude`/`--ignore-dirs`/`--kinds` are optional repeatable filters. | `watch.watchers.create` | `hoody watch create --coalesce-ms 100 --exclude "*.ts" --history-size 100 --ignore-dirs <ignore_dirs> --include "*.ts" --kinds created --paths /home/user/src --recursive --skip-hidden` |
| `hoody watch delete` |  | write | Delete a watcher and tear down its inotify subscriptions | `watch.watchers.delete` | `hoody watch delete --id abc-123` |
| `hoody watch events list` |  | read | List historical events for a watcher (paged). Supports cursor resume via `--since-id` or `--since-timestamp`. | `watch.streams.listEventsIterator` | `hoody watch events list --id abc-123 --since-id 10 --since-timestamp 1750000000 --page 10 --limit 10` |
| `hoody watch events stream` |  | read | Live-tail watcher events over Server-Sent Events. Resumes from `--since-id` on reconnect. | `watch.streams.streamSse` | `hoody watch events stream --id abc-123 --since-id 10 --since-timestamp 1750000000` |
| `hoody watch get` |  | read | Get a single watcher by id, including its config and stats | `watch.watchers.get` | `hoody watch get --id abc-123` |
| `hoody watch health` |  | read | Health check for the watch service (liveness, memory usage, watcher count) | `watch.health.check` | `hoody watch health` |
| `hoody watch list` |  | read | List all file system watchers (paged) | `watch.watchers.listIterator` | `hoody watch list --page 10 --limit 10` |

