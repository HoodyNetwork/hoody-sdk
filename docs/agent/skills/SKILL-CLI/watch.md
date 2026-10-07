> _**CLI skill · `watch` namespace** · ~4,892 tokens · hoody-sdk v1.0.0-beta.16_

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
- Every `hoody watch` command, `hoody watch health` included, acts on the container named by the global `-c <containerId>` (or `HOODY_CONTAINER`), its id and never its name; without one the CLI refuses before sending anything.

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

1. Create the watcher as in workflow 1
2. `hoody watch events stream` — each event carries monotonic `id`
3. Reconnect with `since_id` = last seen id
4. On HTTP 409 `HISTORY_GAP` or inline `event: lag` — treat as data loss; rebuild from fresh listing

### 3. Bulk replay via pagination

Bulk replay: `hoody watch events list` with `since_id`, one page per call; persist the highest `id`.

### 4. WebSocket consumer

1. Create the watcher as in workflow 1
2. `GET /watchers/{id}/events/ws` (HTTP only; no CLI command) — the server pings every 20 s and closes the socket when the pong is missing; most WebSocket clients answer pings on their own
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory, reconfiguration and teardown

List with `hoody watch list`, inspect with `hoody watch get`, reconfigure in place with `hoody watch update`, remove with `hoody watch delete`.

## Quirks & gotchas

- Linux only; on non-Linux hosts the binary exits before opening the listener (no HTTP served) — typically with code 0 via the container-path check, or code 1 if those paths exist. A 501 `UNSUPPORTED_PLATFORM` response is defined but unreachable from a normal startup: the process exits before it can serve one.
- No kit-level auth header; do not add `Authorization` on direct kit calls
- `recursive` defaults `true`; `coalesce_ms` defaults `100`
- `ignore_dirs` default: `node_modules, .git, target, __pycache__, .hg, .svn, .cache, dist, .next, .nuxt, vendor, bower_components`. Pass `[]` to disable; `null` falls back to default
- Default limits, which the kit's command-line flags can change: 128 watchers/kit, 32 paths/watcher, 64 stream clients/watcher, replay buffer of 100 000 events or 16 MiB per watcher (whichever is hit first). `history_size` on create overrides the event count per watcher; values under 32 are raised to 32 and there is no upper cap, so the 16 MiB memory limit is the effective bound
- Watcher ids are UUIDs; a path segment that is not a UUID is rejected with `400` before the route runs
- `hoody watch get`, `hoody watch update`, `hoody watch delete`, `hoody watch events list` and `hoody watch events stream` name the watcher with `--id <watcherId>` (the UUID that `watch list -o json` shows), never with a positional argument.
- `since_id` and `since_timestamp` mutually exclusive — both = 400 `INVALID_CURSOR`
- A cursor older than the retained history returns 409 `HISTORY_GAP`. For `since_id` that means `since_id > 0` and `since_id + 1` is below the oldest retained id, so `since_id=0` never gaps. For `since_timestamp` it means the timestamp is earlier than the oldest retained event, which is common on a young or quiet watcher ("the last 5 minutes" of a watcher created 2 minutes ago gaps as soon as it has one event). An empty history never gaps for `since_id` or `since_timestamp`; an `after_id` walk (next bullet) can still gap on an empty history, when an event after its cursor was evicted or was too large to keep.
- Walking history page by page: pass `after_id` (the previous response's `next_after_id`; the response also carries `has_more`). If an event you have not read yet was evicted between two requests, the next one fails with 409 `HISTORY_GAP` instead of skipping it. A `page` walk counts from the oldest retained event, so an eviction between pages skips events silently. `since_id`, `since_timestamp` and `page` are ignored when `after_id` is set.
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
- `503 SHUTTING_DOWN` — the kit is stopping: `hoody watch events stream`/`GET /watchers/{id}/events/ws` (HTTP only; no CLI command) and `hoody watch create` return it. Watchers are removed at shutdown, so reads of a watcher or its history return 404 `WATCHER_NOT_FOUND` instead
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another container/process

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first. To change a watcher's config, update it in place (example 8); deleting and recreating it loses its history and disconnects its consumers.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history. Create `/tmp/wt` inside the container first (or use a path that already exists): creating a watcher does not create its paths, and a missing path is refused with `400 INVALID_REQUEST`.

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

**Step 1 — open the SSE stream.** The command prints one NDJSON record per event, `{id, event, data}`, with `data` already parsed; a record whose `event` is `lag` means history was lost. It reconnects on its own from the last id it printed. The `id` is monotonic; persist it as your resume cursor.

```bash
hoody --container "$C" watch events stream --id "$WID"
```

**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if the buffer rolled past your cursor you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```bash
hoody --container "$C" watch events stream --id "$WID" --since-id "$LAST_ID"
```

### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer prefers a WebSocket. The server sends each event as a JSON text frame carrying `"type":"file_event"` and ignores text and binary messages from the client. It sends a Ping every 20 s and closes the socket when the Pong does not arrive, so the client must answer Pings (most WebSocket libraries do this automatically); it also answers the client's own Pings.

```bash
# CLI streams via SSE (no WS subcommand); use `events stream` for live-tail.
hoody --container "$C" watch events stream --id "$WID" --since-id 37000
```

A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from the highest event id you actually persisted (not the response's `newest_available_id`, which describes the whole buffer). Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** Fetch the first page with your starting `since_id`, then follow `next_after_id` as `after_id` while `has_more` is true; a 409 `HISTORY_GAP` on an `after_id` page means events were evicted before you read them, so the replay is incomplete. Do not walk with `page`: with `since_id=0` an eviction between pages shifts the offsets and skips events without an error. `limit ∈ [1,200]`; out-of-range = **400 `INVALID_PAGINATION`**. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` so you can detect buffer churn between pages.

```bash
CURSOR=${CURSOR:-0}   # highest id already stored; 0 = everything retained
# One call returns one page (at most 200 events). Follow next_after_id until has_more is false.
R=$(hoody --container "$C" watch events list --id "$WID" --since-id "$CURSOR" --limit 200 -o json) || exit 1
jq -c '.items[]' <<< "$R" >> /tmp/events.ndjson
while [ "$(jq -r .has_more <<< "$R")" = true ]; do
  R=$(hoody --container "$C" watch events list --id "$WID" \
        --after-id "$(jq -r .next_after_id <<< "$R")" --limit 200 -o json) || exit 1   # 409 = replay incomplete
  jq -c '.items[]' <<< "$R" >> /tmp/events.ndjson
done
```

### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild on content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`. `overflow` events still arrive when `kinds` leaves them out, so a consumer should handle them anyway.

```bash
WID=$(hoody --container "$C" watch create \
  --paths /tmp/wt --kinds modified --coalesce-ms 50 -o json | jq -r .id)
hoody --container "$C" watch events list --id "$WID" -o json \
  | jq '[.items[].kind] | unique'
```

⚠ Creating and writing a file usually produces a `created` and a `modified`, but the number of events and the size recorded on the `created` event are not fixed: sizes are sampled when the kit processes the event, and events inside the `coalesce_ms` window are merged. `kinds: ["modified"]` drops the `created` events, but `modified` is also reported when a file opened for writing is closed unchanged, so it does not prove the content changed.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`.

```bash
WID=$(hoody --container "$C" watch create --paths /tmp/wt \
  --include '**/*.log' --exclude '**/secret-*.log' -o json | jq -r .id)
```

### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` counts raw inotify events before coalescing, so it can be larger than the number of events in the history; `active_clients` counts live SSE+WS connections. One call returns at most 200 watchers; with the default cap of 128 watchers per kit that is all of them, but when the cap has been raised, walk further pages with `page` until the items seen reach `total`.

```bash
hoody --container "$C" watch list --limit 200 -o json \
  | jq '.items[] | {id, paths: .config.paths, events_seen: .stats.events_seen}'
```

### 8. Change a watcher's config — update it in place

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. Update the watcher in place: omitted fields keep their current value, a list you send replaces that whole list, and at least one field must be given. Changing only `kinds`, as below, keeps the watcher's id, its retained history and its connected SSE/WebSocket clients. Shrinking `history_size` evicts the oldest events beyond the new cap and can turn an existing replay cursor into a `HISTORY_GAP`; ordinary eviction as new events arrive still applies. Deleting and recreating the watcher instead would lose the history and disconnect every consumer.

```bash
hoody --container "$C" watch update --id "$WID" --kinds modified --kinds removed
```

If the new configuration cannot be started, the request fails with 500 and the watcher keeps its old configuration.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /watchers/{id}` and `/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```bash
hoody --container "$C" watch delete --id "$WID"
hoody --container "$C" watch get    --id "$WID"   # exits non-zero
```

### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**. If the oldest retained event is newer than the timestamp (a watcher younger than 5 minutes, or a buffer that has rolled over), the call returns **409 `HISTORY_GAP`**. That only means the history does not reach back that far: every retained event is newer than the timestamp, so read them all from `since_id=0`. One call returns at most 200 events; walk further pages with `after_id` set to the last id received, not `since_id`: `since_id` only checks the oldest retained id, so it misses an event evicted, or too large to keep, between two pages without an error. A 409 on one of those later `after_id` pages means such an event was lost while paging, so the result is incomplete. Treat it as a failure and run the recovery again from the start.

```bash
# One page only (at most 200 events). For more, repeat with --after-id set to the
# previous response's next_after_id while has_more is true (see example 4).
hoody --container "$C" watch events list --id "$WID" \
  --since-timestamp "$(date -u -d '5 minutes ago' +%FT%TZ)" --limit 200
```

When the filesystem reports a rename as a single event carrying both paths, the kit emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side without an `old_path` field (it is omitted, not null). Keep only events that have `old_path` to get the paired form.

## Reference

### `hoody watch` (9) — File system watchers — observe file changes and tail live events

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody watch create` |  | write | Create a new file system watcher. `--paths` is repeatable; `--include`/`--exclude`/`--ignore-dirs`/`--kinds` are optional repeatable filters. | `watch.watchers.create` | `hoody watch create --coalesce-ms 100 --exclude '*.ts' --paths /home/user/src` |
| `hoody watch delete` |  | write | Delete a watcher and tear down its inotify subscriptions | `watch.watchers.delete` | `hoody watch delete --id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch events list` |  | read | List historical events for a watcher (paged). Supports cursor resume via `--since-id` or `--since-timestamp`. | `watch.events.list` | `hoody watch events list --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10 --limit 10` |
| `hoody watch events stream` |  | read | Live-tail watcher events over Server-Sent Events. Resumes from `--since-id` on reconnect. | `watch.events.stream` | `hoody watch events stream --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10` |
| `hoody watch get` |  | read | Get a single watcher by id, including its config and stats | `watch.watchers.get` | `hoody watch get --id 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch health` |  | read | Health check for the watch service (status, build, start time, memory, open file descriptors, pid) | `watch.kit.getHealth` | `hoody watch health` |
| `hoody watch list` |  | read | List all file system watchers (paged) | `watch.watchers.list` | `hoody watch list --page 10 --limit 10` |
| `hoody watch open` |  | action | Open the Watch kit info page in your browser |  | `hoody watch open` |
| `hoody watch update` |  | write | Reconfigure a watcher in place. Omitted fields keep their current value; a repeatable filter flag replaces that whole list. The watcher keeps its id, history and connected clients | `watch.watchers.update` | `hoody watch update --id 3fa85f64-5717-4562-b3fc-2c963f66afa6 --coalesce-ms 100 --exclude '*.ts'` |

