> _**CLI skill · `proxyLogs` namespace** · ~3,884 tokens · hoody-sdk v1.0.0-beta.17_

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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. List recent

- `hoody proxy logs list` with `last: N` or `limit`+`offset` (SNI-bound).

### 2. Drill into 5xx

- `hoody proxy logs list` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate from a cursor with `afterId`: it reads the log database (real row ids), oldest first, and `total` counts every entry after the cursor.

### 3. Live-tail with resume

- `hoody proxy logs stream` — SSE; live frames carry an `id:` line holding an opaque increasing integer cursor (a fresh connection first gets a data-only array of recent matching entries with no `id:` line, only when there are some; otherwise its first frame is a live one).
- Reconnect with `Last-Event-ID`; the server replays the buffered frames after it. `event: gap` (no `id:`) means it no longer reaches back that far: backfill the missing entries from `hoody proxy logs list`.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Stats snapshot

- `hoody proxy logs stats` — `total` plus counts `byLevel`, `byProject`, `byContainer` and `byService`, and the `timeRange`. There is no status-code breakdown: derive one client-side from `hoody proxy logs list`.

### 5. Bodies for a slice

- `hoody proxy logs list` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `hoody proxy logs list` ignored — SNI auto-scopes.
- On the stream the scope also comes from the kit URL, but `projectId`/`containerId` are checked rather than ignored: omit them or pass the URL's own values; any other value returns `400 {"error":"scope_mismatch"}`. They cannot retarget the stream.
- `traceId` is per log source: edge entries carry the edge's hex request ID, backend request/response pairs share their own UUID. Entries from the edge and the backend, or from different kits, never share one.
- `level` accepts ONE value at a time on the kit URL: `level=warn,error` returns `total: 0`, so query each level separately and union client-side.
- `serviceName` is not honoured on the kit URL for `GET /_logs` (the list handler ignores it); filter client-side. It IS honoured on `GET /_logs/stream`, so tail with `serviceName=` and list without it.
- `hoody proxy logs stream` forwards `--service-name`, `--source` and `--after-id` to the stream endpoint, so `--service-name` filters the stream on the server; no client-side post-filter is needed.
- Every `hoody proxy logs list` read returns `{entries,total,limit,offset}`. `last=N` returns the newest N entries, oldest first, in one response (`total` is the number returned, `offset` does not apply, and `last` wins over `afterId`); on the kit URL without bodies or time filters those entries come from the in-memory recent buffer, which holds the newest entries of every container on the server, so a busy neighbour can leave fewer than N there, and it starts empty after a server restart. Every entry carries its row `id`, so pass the last one as `afterId` to follow on. `afterId` always reads the log database: oldest first, `total` counts every entry after the cursor and `offset` pages through them.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

> **CLI note.** `hoody proxy logs list|stats|stream` target the kit's `logs` service for the container selected with `--container` (`{project}-{container}-logs-1.…`), authorised by that container's proxy permissions — no account bearer is sent. The kit-URL behaviours documented below (`last=N` rows come from the recent buffer) therefore apply to the CLI form as well.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. The 7 recipes below cover every working filter, both paging modes, the stats endpoint, and SSE resume. The list endpoint does **not** filter by program, source IP (`clientIp`), alias hostname or `serviceName` server-side (none of them is honoured as a query parameter on `GET /_logs`); scope by those fields client-side after a paged scan, as §2 (status) and §5 (traceId) do.

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns the newest N entries in the usual `{entries,total,…}` envelope, ordered **oldest-first within the returned slice**. On the kit URL they come from the in-memory recent buffer. Each entry carries its row `id`: pass the last one as `afterId` (§3) to read what came after. It is the cheapest call you can make.

```bash
hoody --container "$C" proxy logs list --last 50 -o json \
  | jq -r '.entries[] | "\(.tsIso)  \(.kind)/\(.level)  \(.serviceName)  \(.method) \(.url) \(.status // "—")"'
```

### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```bash
hoody --container "$C" proxy logs list --level error --limit 200 -o json \
  | jq '[.entries[] | select(.status >= 500 and .status < 600)] | sort_by(.id) | reverse'
```

### 3. Walk the full window with an `afterId` cursor (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. Page by row id: `afterId` always reads the log database, returns entries **oldest first** with real row ids, and `total` counts every entry after the cursor. Start at `afterId=0`, then pass the last `id` of each page as the next `afterId`; new traffic lands after your cursor, so nothing shifts under you. Plain `limit`/`offset` without `afterId` counts from the **newest** entry, so arriving entries move every page during a walk. To start from the present instead of the oldest entry, take the cursor from the last entry of a `last=N` read. Walk until `entries` is empty.

**Rate limit:** kit-URL reads are limited per scope: by default a burst of 10, then 30 per minute (one every 2 s), and some deployments differ (see Common errors). A walk longer than about 10 pages therefore gets `429 {"error":"rate_limited"}`. That reply has no `entries`, so a loop that reads it as an empty page stops early and looks finished. The loops below treat any failed call, or any reply without an `entries` array, as a failure. After each failure they wait (2 s, then 4, 8, 16 and 32 s) and retry. The walk stops with an error and exit status 1 on the 6th failed call in a row, after 5 retries and about 62 s of waiting.

```bash
walk_logs() {
  local after=0 tries=0 page count
  while :; do
    if page=$(hoody --container "$C" proxy logs list --after-id "$after" --limit 500 -o json) \
       && count=$(printf '%s' "$page" | jq -e '.entries | arrays | length'); then
      tries=0
    else
      tries=$((tries + 1))
      if [ "$tries" -gt 5 ]; then echo "log walk stopped at afterId=${after}" >&2; return 1; fi
      sleep $((1 << tries)); continue   # 2, 4, 8, 16, 32 s
    fi
    [ "$count" -eq 0 ] && return 0
    printf '%s' "$page" | jq -c '.entries[] | {id,tsIso,serviceName,status}'
    after=$(printf '%s' "$page" | jq '.entries[-1].id')
  done
}
walk_logs
```

### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byContainer, byService }` — perfect for a dashboard tile.

```bash
hoody --container "$C" proxy logs stats -o json | jq '{
  total, byLevel,
  noisiest: (.byService | to_entries | sort_by(-.value) | .[:3])
}'
```

### 5. Group entries that share a `traceId`

**Goal:** find every entry recorded under one `traceId`. The ID is assigned per log source, not per end-to-end request: an edge entry carries the edge's own 32-character hex request ID, and a backend `request`/`response` pair shares a separately generated UUID. A `traceId` therefore does not link an edge entry to a backend entry, or a request to calls it makes to other kits; correlate those by `tsMs`, `serviceName` and `url` instead. The kit does not filter on `traceId` server-side, so scan a recent window and group client-side.

```bash
TID=354a5a0222e7107c46ae2851ded57fa6
hoody --container "$C" proxy logs list --limit 1000 \
    --include-request-body --include-response-body -o json \
  | jq --arg tid "$TID" '[.entries[] | select(.traceId == $tid)] | sort_by(.tsMs)'
```

### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and resume after a network blip. Live frames carry an `id:` line holding an increasing integer cursor; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. The resume is complete only while your cursor is still in the server's replay buffer: when it is not, the first frame is `event: gap` (no `id:`, data `{"after","resumedFrom"}`), and the entries in between are NOT replayed. Treat `gap` as a control event, not a log entry: backfill the missing window with `hoody proxy logs list` (`sinceMs` = the `tsMs` of the last entry you processed), skip entries you already handled, then carry on with the stream. `event: purged` carries an `id:` and `data: {}`: advance the cursor past it, but it is not an entry. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

A frame larger than 256 KiB is replaced by a stub that keeps the entry's row `id` and carries `truncated: true` and `originalFrameBytes`. To get the whole record, read that row with `hoody proxy logs list --after-id <afterId> --limit 1` and check that the returned entry's `id` matches; the SSE `id:` line is a different cursor from this row id. If the row cannot be read, report the missing entry instead of treating the stub as complete.

```bash
# The CLI seeds the first request's Last-Event-ID header from --last-event-id and
# auto-resumes across reconnects within the same process. Pass it only when you
# hold a real cursor from an earlier run: "0" is treated as a cursor and replays the buffer.
hoody --container "$C" proxy logs stream --level warn ${LAST:+--last-event-id "$LAST"}
# The CLI neither announces nor backfills a replay gap: it prints the gap event as an
# almost empty line, so its output does not show that entries were missed. When the
# record must be complete, read the window after a reconnect with
# `hoody --container "$C" proxy logs list --since-ms <tsMs of the last entry you saw>`.
```

### 7. Read request + response bodies for a debug slice

**Goal:** inspect what the upstream actually sent or received for a narrow slice of entries (e.g. recent warns). Request and response bodies are captured by default, but query results leave them out. Pass `includeRequestBody` and `includeResponseBody` to get the bodies already stored with the entries you query. These options change what a query returns, not what gets captured: a body that was never captured cannot be brought back. The live stream never carries bodies. Bodies are capped at 65 536 B by default, and bodies whose content type matches `image/`, `video/`, `audio/`, `application/octet-stream` or `font/` are not captured by default. The deployment's log configuration sets whether bodies are captured, the cap and the excluded types; this API cannot change any of them. A body the reader-side cap shortens ends in `...[TRUNCATED]`; one already cut upstream carries no marker, so do not test for that suffix to detect truncation. `bodyTruncated` can be `true`, `false` or absent, so test it for truthiness and never compare it to `false`.

```bash
hoody --container "$C" proxy logs list --level warn --limit 20 \
    --include-request-body --include-response-body -o json \
  | jq '.entries[] | {id, tsIso, status, url, reqBody: .requestBody, resBody: .responseBody}'
```

## Reference

### `hoody proxy` (3) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy logs list` |  | read | Query centralized logs | `proxyLogs.list` | `hoody proxy logs list --limit 200 --include-request-body` |
| `hoody proxy logs stats` |  | read | Get log statistics | `proxyLogs.getStats` | `hoody proxy logs stats` |
| `hoody proxy logs stream` |  | read | Live-tail logs over Server-Sent Events | `proxyLogs.stream` | `hoody proxy logs stream --service-name tunnel --kind request` |

