> _**CLI skill · `watch` namespace** · ~5,433 tokens · hoody-sdk v1.0.1_

# `watch` — Linux inotify file-change streams with replay history

## Purpose

Per-computer filesystem-event service. Configure watchers (paths, globs, ignore-dirs, coalesce window); consume events via paginated history, SSE, or WebSocket. Bounded in-memory replay buffer supports `since_id` resume.

## When to use

- Live-tail FS changes inside a computer (build, hot-reload, log tail)
- Detect `created | modified | removed | renamed | metadata` events on paths/trees
- Audit writes by filtering `kinds`
- Resume after disconnect via `since_id` / `since_timestamp`

## When NOT to use

- One-shot listing/stat, file-content tail, shell-process lifecycle, cross-computer aggregation (see §Related namespaces).

## Prerequisites

- Computer with `hoody-watch` kit (Linux only); see `SKILL-CLI.md` for auth + URL routing.
- Every `hoody watch` command, `hoody watch health` included, acts on the computer named by the global `-c <computerId>`, else `HOODY_COMPUTER` / `HOODY_COMPUTER_ID`, else the `computer` saved in `~/.hoody/config.json`, by id or by name (a value not shaped like an id is looked up among your computers); with no computer resolved the CLI refuses before sending anything.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

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

Bulk replay: `hoody watch events list` with `since_id`: one command follows `after_id` across pages by itself, up to 10,000 events in 1,000 requests, and `--limit N` caps the total; persist the highest `id`.

### 4. WebSocket consumer

1. Create the watcher as in workflow 1
2. `GET /api/v1/watch/watchers/{id}/events/ws` (HTTP only; no CLI command) — the server pings every 20 s and closes the socket when the pong is missing; most WebSocket clients answer pings on their own
3. `{"type":"lag",...}` text frame = same handling as SSE lag

### 5. Inventory, reconfiguration and teardown

List with `hoody watch list`, inspect with `hoody watch get`, reconfigure in place with `hoody watch update`, remove with `hoody watch delete`.

## Quirks & gotchas

- Linux only; on non-Linux hosts the binary exits before opening the listener (no HTTP served) — typically with code 0 via the computer-path check, or code 1 if those paths exist. A 501 `UNSUPPORTED_PLATFORM` response is defined but unreachable from a normal startup: the process exits before it can serve one.
- The kit checks no credential of its own. Under the default allow policy, the kit URL is sufficient. When proxy permissions protect a kit, supply the credential required by its authentication group; in the SDK, configure `kitAuth` on `withComputer()`.
- `recursive` defaults `true`; `coalesce_ms` defaults `100`
- `ignore_dirs` default: `node_modules, .git, target, __pycache__, .hg, .svn, .cache, dist, .next, .nuxt, vendor, bower_components`. Pass `[]` to disable (on the CLI an empty value does that: `--ignore-dirs ''`; the text `[]` would be sent as one entry named `[]`). Left out on create, the default list applies; left out on update, the watcher keeps its current list
- Default limits, which the kit's command-line flags can change: 128 watchers/kit, 32 paths/watcher, 64 stream clients/watcher, replay buffer of 100 000 events or 16 MiB per watcher (whichever is hit first). `history_size` on create overrides the event count per watcher; values under 32 are raised to 32 and there is no upper cap, so the 16 MiB memory limit is the effective bound
- Watcher ids are UUIDs; a path segment that is not a UUID is rejected with `400` before the route runs
- `hoody watch get`, `hoody watch update`, `hoody watch delete`, `hoody watch events list` and `hoody watch events stream` name the watcher with a positional `<watcherId>` (the UUID that `watch list -o json` shows), as in `hoody --computer "$C" watch get "$WATCHER_ID"` with `$WATCHER_ID` holding that UUID; `--id` is refused, naming the positional.
- `since_id` and `since_timestamp` mutually exclusive — both = 400 `INVALID_CURSOR` (on the history list, `after_id` overrides both)
- 409 `HISTORY_GAP` means an event after your cursor is lost: it was evicted from the replay history, or it was too large to keep. The test is exact for every cursor (`since_id`, `since_timestamp`, `after_id`): a cursor older than the oldest retained event does not gap by itself, so "the last 5 minutes" of a watcher created 2 minutes ago returns everything it has. `since_id=0` means "everything retained" and never gaps.
- Walking history page by page: pass `after_id` (the previous response's `next_after_id`; the response also carries `has_more`). If an event you have not read yet was evicted between two requests, the next one fails with 409 `HISTORY_GAP` instead of skipping it. A `page` walk counts from the oldest retained event, so an eviction between pages skips events silently. `since_id`, `since_timestamp` and `page` are ignored when `after_id` is set.
- `since_timestamp` accepts RFC3339, unix seconds, or millis (switches to ms when `|n| >= 100_000_000_000`)
- WS message cap 64 KiB by default; every data frame the server sends is JSON text (control frames aside: it pings every 20 s and disconnects on a missed pong); it ignores text and binary frames from the client
- `kind` (wire field name): `created | modified | removed | renamed | metadata | overflow | other` (snake_case enum); `overflow` = events were lost, because the kernel event queue overflowed, because the kit's own internal event channel was saturated, or because work for a newly created directory was refused when the kit's deferred queue was full (it is also sent when the watcher's backend reports an error, which does not mean events were lost); `overflow` events are delivered even when `kinds` does not list them

## Common errors

- `400 INVALID_PAGINATION` — `page=0` (unless `after_id` is set), `limit=0` or `limit` above 200 (the CLI never sends more than 200 in one request: `--limit N` caps the total and the command splits it; only `--limit 0` is refused); defaults `page=1, limit=50`. A negative or non-numeric `page`/`limit` also answers HTTP 400 `INVALID_PAGINATION`; the message names the parameter
- `400 INVALID_REQUEST` — empty `paths`, an invalid or missing path, a glob that does not compile, an invalid `ignore_dirs` entry, an update that gives no field, or an invalid request body (for example, not JSON, no JSON content type, an unknown field, or a value of the wrong type). On create, an invalid `Idempotency-Key` header (a character outside visible ASCII, space and tab, or a trimmed value that is empty or longer than 256 bytes) also returns this code. All of these answer the same code, so read the message, not the code, to tell them apart
- `400 INVALID_CURSOR` — both cursor fields (without `after_id`), or unparseable timestamp
- `404 WATCHER_NOT_FOUND` — UUID syntactically valid but no watcher; also raised pre-upgrade on stream endpoints
- `409 LIMIT_EXCEEDED` — more than 32 `paths` in one watcher, or 128 watchers already live on the computer
- `409 HISTORY_GAP` — an event after the cursor was evicted or too large to keep; body `details` carries `oldest_available_id` / `newest_available_id`
- `429 MAX_CLIENTS_REACHED` — >64 concurrent SSE+WS on one watcher; capacity incremented after checks pass (no slot leak)
- `500 WATCHER_START_FAILED` — the kit could not start the inotify watch for a new watcher
- `503 SHUTTING_DOWN` — once the kit begins stopping, `hoody watch events stream`/`GET /api/v1/watch/watchers/{id}/events/ws` (HTTP only; no CLI command), `hoody watch create` and `hoody watch update` can return it. Shutdown removes the watchers; after removal, reads of a watcher or its history return 404 `WATCHER_NOT_FOUND`
- Mid-stream `event: lag` (SSE) / `{"type":"lag",...}` (WS) — broadcast lagged AND replay buffer cannot fill gap; connection closed after lag frame

## Related namespaces

- `files` — read/write watched paths
- `exec` — run command on event (rebuild on save)
- `daemon` — supervise the consumer process
- `pipe` — fan SSE stream into another computer/process

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first. To change a watcher's config, update it in place (example 8); deleting and recreating it loses its history and disconnects its consumers.

### 1. Provision a recursive watcher and verify it sees events

**Goal:** watch `/tmp/wt` for any change; confirm the inotify subscriptions are wired by mutating a file and reading the history. Create `/tmp/wt` inside the computer first (or use a path that already exists): creating a watcher does not create its paths, and a missing path is refused with `400 INVALID_REQUEST`.

**Step 1 — create the watcher.** Capture `id`. `recursive` defaults to `true`; tighten `coalesce_ms` from the default 100 ms to 50 ms for snappier debounce.

```bash
WID=$(hoody --computer "$C" watch create \
  --paths /tmp/wt --recursive --coalesce-ms 50 \
  -o json | jq -r .id)
```

**Step 2 — read back stats** (response carries `config` + `stats`; `events_seen > 0` after the first FS touch confirms the inotify watch is live).

```bash
hoody --computer "$C" watch get "$WID" -o json | jq '.stats'
```

**Step 3 — touch a file and read the history.** Create or change a file under `/tmp/wt` on the computer (with `exec` or a terminal), then list the events: `events_seen` rises and the list holds a `created` or `modified` event for it.

```bash
hoody --computer "$C" watch events list "$WID" --limit 20 -o json | jq '.items[] | {id, kind, path}'
```

### 2. SSE live-tail with `since_id` resume after disconnect

**Goal:** subscribe to live events; on disconnect, replay everything missed.

**Step 1 — open the SSE stream.** The command prints one NDJSON record per event, `{id, event, data}`, with `data` already parsed; a record whose `event` is `lag` means history was lost. It reconnects on its own from the last id it printed: the reconnect sends that id as `since_id` and leaves out a `since_timestamp` the command started with, since the kit refuses both together. The `id` is monotonic; persist it as your resume cursor.

```bash
hoody --computer "$C" watch events stream "$WID"
```

**Step 2 — reconnect with `since_id`.** Server replays from the buffer; if an event after your cursor was evicted you get **HTTP 409 `HISTORY_GAP`** with `details` (a JSON-encoded string) holding `oldest_available_id` / `newest_available_id` / `requested_cursor`. Treat that as data loss and rebuild from a fresh listing.

```bash
hoody --computer "$C" watch events stream "$WID" --since-id "$LAST_ID"
```

### 3. WebSocket consumer — replay buffer + live events on one socket

**Goal:** alternative to SSE when the consumer prefers a WebSocket. The server sends each event as a JSON text frame carrying `"type":"file_event"` and ignores text and binary messages from the client. It sends a Ping every 20 s and closes the socket when the Pong does not arrive, so the client must answer Pings (most WebSocket libraries do this automatically); it also answers the client's own Pings.

```bash
# CLI streams via SSE (no WS subcommand); use `events stream` for live-tail.
hoody --computer "$C" watch events stream "$WID" --since-id 37000
```

A lag frame is `{"type":"lag", …}` (text); after it, the server closes the socket — same handling as the SSE inline `event: lag`.

### 4. Bulk replay history via paginated listing

**Goal:** cursor-walk every event since a known id, persist offline, then resume from the highest event id you actually persisted (not the response's `newest_available_id`, which describes the whole buffer). Useful for batch consumers (cron, periodic syncers) that don't want to hold a stream.

**Step 1 — page through.** Fetch the first page with your starting `since_id`, then follow `next_after_id` as `after_id` while `has_more` is true; a 409 `HISTORY_GAP` on an `after_id` page means events were evicted before you read them, so the replay is incomplete. Do not walk with `page`: with `since_id=0` an eviction between pages shifts the offsets and skips events without an error. `limit ∈ [1,200]` per request; out-of-range = **400 `INVALID_PAGINATION`**. `--limit N` on the CLI caps the total instead and the command splits it into requests of at most 200. Response carries `oldest_available_id` / `newest_available_id` / `oldest_available_timestamp` / `newest_available_timestamp` (omitted while the buffer holds no event) so you can detect buffer churn between pages.

```bash
CURSOR=${CURSOR:-0}   # highest id already stored; 0 = everything retained
# One call walks every page by after_id (up to 10,000 events); it fails on a 409 (replay incomplete).
R=$(hoody --computer "$C" watch events list "$WID" --since-id "$CURSOR" -o json) || exit 1
jq -c '.items[]' <<< "$R" >> /tmp/events.ndjson || exit 1
LAST=$(jq -r '.items[-1].id // empty' <<< "$R"); CURSOR=${LAST:-$CURSOR}   # unchanged when nothing new arrived
echo "resume cursor=$CURSOR"
# has_more true = the walk hit its bound: run again with this cursor.
[ "$(jq -r .has_more <<< "$R")" = false ] || echo "more events: rerun from the cursor above" >&2
```

### 5. Filter by event kind — only writes, ignore creates / removes / metadata

**Goal:** trigger a rebuild on content edits, not on file creation noise. `kinds` accepts a subset of `created | modified | removed | renamed | metadata | overflow | other`. `overflow` events still arrive when `kinds` leaves them out, so a consumer should handle them anyway.

```bash
WID=$(hoody --computer "$C" watch create \
  --paths /tmp/wt --kinds modified --coalesce-ms 50 -o json | jq -r .id)
hoody --computer "$C" watch events list "$WID" -o json \
  | jq '[.items[].kind] | unique'
```

Warning: Creating and writing a file usually produces a `created` and a `modified`, but the number of events and the size recorded on the `created` event are not fixed: sizes are sampled when the kit processes the event, and events inside the `coalesce_ms` window are merged. `kinds: ["modified"]` drops the `created` events, but `modified` is also reported when a file opened for writing is closed unchanged, so it does not prove the content changed.

### 6. Glob include/exclude — watch logs but ignore secret rotations

**Goal:** stream `*.log` events but exclude `secret-*.log` rotations a security agent doesn't need to see. `exclude` takes precedence over `include`. Both match an ordinary event's new `path` only; `overflow` events (empty `path`) bypass both filters, so handle them too: renaming `secret-1.log` to `app.log` still emits a `renamed` event whose `old_path` names the excluded file, so filter `old_path` yourself when that name must not reach the consumer.

```bash
WID=$(hoody --computer "$C" watch create --paths /tmp/wt \
  --include '**/*.log' --exclude '**/secret-*.log' -o json | jq -r .id)
```

### 7. Inventory — list every watcher with its event-counter and active-clients

**Goal:** an audit screen that shows every watcher in the kit, what it watches, and whether it has live consumers. `stats.events_seen` counts raw inotify events before coalescing, so it can be larger than the number of events in the history; `active_clients` counts live SSE+WS connections. `hoody watch list` walks the pages by itself, up to 10,000 watchers; `--limit N` caps the total.

```bash
hoody --computer "$C" watch list -o json \
  | jq '.items[] | {id, paths: .config.paths, events_seen: .stats.events_seen, active_clients: .stats.active_clients}'
```

### 8. Change a watcher's config — update it in place

**Goal:** widen `kinds` from `["modified"]` to `["modified","removed"]`. Update the watcher in place: omitted fields keep their current value, a list you send replaces that whole list, and at least one field must be given. Changing only `kinds`, as below, keeps the watcher's id, its retained history and its connected SSE/WebSocket clients. Shrinking `history_size` evicts the oldest events beyond the new cap and can turn an existing replay cursor into a `HISTORY_GAP`; ordinary eviction as new events arrive still applies. Deleting and recreating the watcher instead would lose the history and disconnect every consumer.

```bash
hoody --computer "$C" watch update "$WID" --kinds modified --kinds removed
```

If the new configuration cannot be started, the request fails with 500 and the watcher keeps its old configuration.

### 9. Tear down on shutdown + verify events stop

**Goal:** clean up. After delete, both `GET /api/v1/watch/watchers/{id}` and `/api/v1/watch/watchers/{id}/events` return **404 `WATCHER_NOT_FOUND`**, and any open SSE/WS sockets close. The DELETE response body is `{ id, deleted: true }`.

```bash
hoody --computer "$C" watch delete "$WID"
hoody --computer "$C" watch get "$WID"   # exits non-zero
```

### 10. Recent history without a stream — `since_timestamp` for one-shot tail

**Goal:** a forensics caller wants every event in the last 5 min without holding a connection. `since_timestamp` accepts RFC3339, unix seconds, or unix milliseconds (auto-detected when `|n| >= 100_000_000_000`). It is **mutually exclusive** with `since_id` — pass both and you get **400 `INVALID_CURSOR`**. A watcher younger than 5 minutes is fine on its own: the cursor reaching back before the watcher existed does not count as a gap, so the call returns every event the watcher still holds. It answers **409 `HISTORY_GAP`** only when an event after the timestamp was lost (evicted, or too large to keep), so the result would be incomplete. One command walks the pages by `after_id` itself, up to 10,000 events; it answers 409 the same way when an event after the cursor was lost while paging. Treat any 409 as a failure: the history for that window is incomplete.

```bash
# One call walks every page (up to 10,000 events) and fails on a 409: history incomplete.
hoody --computer "$C" watch events list "$WID" \
  --since-timestamp "$(date -u -d '5 minutes ago' +%FT%TZ)"
```

When the filesystem reports a rename as a single event carrying both paths, the kit emits **one** `renamed` event with `(path=new, old_path=old)`. Renames the backend reports as separate from/to halves (e.g. across mount boundaries) fall through to one event per side without an `old_path` field (it is omitted, not null). Keep only events that have `old_path` to get the paired form.

## Reference

### `hoody watch` (9) — File system watchers — observe file changes and tail live events

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody watch create` |  | write | Create a new file system watcher. `--paths` is repeatable; `--include`/`--exclude`/`--ignore-dirs`/`--kinds` are optional repeatable filters. | `watch.watchers.create` | `hoody watch create --coalesce-ms 100 --exclude '*.ts' --paths /home/user/src` |
| `hoody watch delete` |  | write | Delete a watcher and tear down its inotify subscriptions | `watch.watchers.delete` | `hoody watch delete 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch events list` |  | read | List historical events for a watcher (paged). Supports cursor resume via `--since-id` or `--since-timestamp`. | `watch.events.list` | `hoody watch events list 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10 --page 10` |
| `hoody watch events stream` |  | read | Live-tail watcher events over Server-Sent Events. Resumes from `--since-id` on reconnect. | `watch.events.stream` | `hoody watch events stream 3fa85f64-5717-4562-b3fc-2c963f66afa6 --since-id 10` |
| `hoody watch get` |  | read | Get a single watcher by id, including its config and stats | `watch.watchers.get` | `hoody watch get 3fa85f64-5717-4562-b3fc-2c963f66afa6` |
| `hoody watch health` |  | read | Health check for the watch service (status, build, start time, memory, open file descriptors, pid) | `watch.kit.getHealth` | `hoody watch health` |
| `hoody watch list` |  | read | List all file system watchers (paged) | `watch.watchers.list` | `hoody watch list --page 10 --limit 10` |
| `hoody watch open` |  | action | Open the Watch kit info page in your browser |  | `hoody watch open` |
| `hoody watch update` |  | write | Reconfigure a watcher in place. Omitted fields keep their current value; a repeatable filter flag replaces that whole list. The watcher keeps its id, history and connected clients | `watch.watchers.update` | `hoody watch update 3fa85f64-5717-4562-b3fc-2c963f66afa6 --coalesce-ms 100 --exclude '*.ts'` |

