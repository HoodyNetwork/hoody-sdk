> _**CLI skill · `proxyLogs` namespace** · ~5,180 tokens · hoody-sdk v1.0.1_

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

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. List recent

- `hoody proxy logs list` with `--last N` or `--limit`+`--offset` (SNI-bound).

### 2. Drill into 5xx

- `hoody proxy logs list` `--level error` (5xx entries auto-promote to `error`), `--include-response-body`; add `--service-name <name>` to keep one kit's entries (applied before paging).
- Paginate from a cursor with `afterId`: it reads the log database (real row ids), oldest first, and `total` counts every entry after the cursor.

### 3. Live-tail with resume

- `hoody proxy logs stream` — SSE; live frames carry an `id:` line holding an opaque increasing integer cursor (a fresh connection first gets a data-only array of recent matching entries with no `id:` line, only when there are some; otherwise its first frame is a live one).
- `hoody proxy logs stream` reconnects by itself during a run. On a later run, `--after-id <row-id>` limits the fresh connection's initial batch to entries after that log row id; it is not a replay cursor, so backfill missing entries with `hoody proxy logs list` when the record must be complete.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Stats snapshot

- `hoody proxy logs stats` — with no filter: `total` plus `byLevel`, `byProject`, `byComputer`, `byService` and `timeRange`. With a read filter (`serviceName`, `level`, `status`/`minStatus`/`maxStatus`, `path`, `sinceMs`/`untilMs`, …) it counts the matching rows and adds `byStatusClass` (`1xx` through `5xx`, `none`). To get a `buckets[]` time series of `byLevel` and `byStatusClass`, pass `sinceMs` and `bucketMs` (at least 60000); `untilMs` defaults to now, and the window may contain at most 240 buckets. It refuses `afterId`, `beforeId`, `last`, `offset` and `limit`.

### 5. Bodies for a slice

- `hoody proxy logs list` + `--include-request-body`/`--include-response-body` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `hoody proxy logs list` has no `--project-id` or `--computer-id`: the kit URL scopes the logs to the computer you select, and passing either flag is refused with exit 2.
- On the stream the kit URL also determines the scope. Caller-supplied `projectId`/`computerId` cannot retarget it: the edge overwrites them with the URL's own values.
- `traceId` is per log source: edge entries carry the edge's hex request ID, backend request/response pairs share their own UUID. Entries from the edge and the backend, or from different kits, never share one.
- `level` takes one or more of `debug`, `info`, `warn`, `error` as ONE comma-separated value on the kit URL (`level=warn,error`). A repeated `level` key, an empty item in a list (`warn,`) or an unknown level is refused with 400 `INVALID_QUERY_PARAMETER`; a bare `level=` is treated as no `level` filter.
- `serviceName` and `traceId` are applied by `GET /_logs` on the kit URL before `last`, `limit` and `offset`, so a page holds only matching entries and `total` counts only those (so do the other filters listed in the intro to Examples). `serviceName` also filters `GET /_logs/stream`. Public Bot calls are logged under `serviceName=bots`
- `hoody proxy logs stream` forwards `--service-name`, `--exclude-service`, `--kind`, `--level`, `--source` and `--after-id` (an entry row ID that limits the initial batch of a fresh connection) to the stream endpoint as query parameters (it has no `--project-id` or `--computer-id`: the computer you select scopes the stream), so `--service-name` and `--exclude-service` filter the stream on the server; no client-side post-filter is needed.
- Every `hoody proxy logs list` read returns `{entries,total,limit,offset}`. `last=N` returns the newest N entries (N is at most 1000; a smaller `limit` caps it further only on a read with no `afterId`, time filter or body option, otherwise `last` alone sets the count), oldest first, in one response (`total` is the number returned, `offset` does not apply, and `last` wins over `afterId`); on the kit URL without bodies or time filters the in-memory recent buffer answers when it holds N matching entries, and the computer's log database answers otherwise, so neighbouring traffic or a server restart does not shorten the result. Every entry carries its row `id`, so pass the last one as `afterId` to follow on. `afterId` always reads the log database: oldest first, `total` counts every entry after the cursor and `offset` pages through them.
- `--include-request-body`/`--include-response-body` default `false`.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `hoody computers get` first.

> **CLI note.** `hoody proxy logs list`, `hoody proxy logs stats` and `hoody proxy logs stream` target the kit's `logs` service for the computer selected with `--computer` (`{project}-{computer}-logs-1.…`), authorised by that computer's proxy permissions — no account bearer is sent. The kit-URL behaviours documented below (`last=N` rows come from the recent buffer when it holds enough, otherwise from the log database) therefore apply to the CLI form as well.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. The 7 recipes below cover both paging modes, the stats endpoint, and SSE resume. The list endpoint filters on the server by `serviceName`, `traceId`, `level` (comma list), `excludeService` (comma list, up to 8), `kind`, `method`, `source`, `status` or a `minStatus`/`maxStatus` range (100-599, not both), `path` (a substring of the entry's URL), `botUrl` (a Bot URL id, `bu_…`) and a `sinceMs`/`untilMs` window; all apply before `last`, `limit` and `offset`. It does not filter by program, source IP (`clientIp`) or alias hostname.

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the computer's edge proxy. Uses `last=N`, which returns the newest N entries in the usual `{entries,total,…}` envelope, ordered **oldest-first within the returned slice**. On the kit URL they come from the in-memory recent buffer when it holds enough matching entries, otherwise from the log database. Each entry carries its row `id`: pass the last one as `afterId` (§3) to read what came after. It is the cheapest call you can make.

```bash
hoody --computer "$C" proxy logs list --last 50 -o json \
  | jq -r '.entries[] | "\(.tsIso)  \(.kind)/\(.level)  \(.serviceName)  \(.method) \(.url) \(.status // "—")"'
```

### 2. Triage 4xx/5xx with a server-side status range

**Goal:** find the failed requests. `minStatus`/`maxStatus` select a status range on the server, before `limit`, so the page holds only 4xx/5xx entries and `total` counts only those; an entry without a status never matches a range. (The edge also promotes **5xx** to `level: error` and **4xx** to `level: warn`, except a Bot call the client closed (499), which is `info`; so `level=warn,error` is a coarser alternative that misses it.)

```bash
hoody --computer "$C" proxy logs list --min-status 400 --max-status 599 --limit 200 -o json \
  | jq '.entries | sort_by(.id) | reverse'
```

### 3. Walk the full window with an `afterId` cursor (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. Page by row id: `afterId` always reads the log database, returns entries **oldest first** with real row ids, and `total` counts every entry after the cursor. Start at `afterId=0`, then pass the last `id` of each page as the next `afterId`; new traffic lands after your cursor, so nothing shifts under you. Plain `limit`/`offset` without `afterId` counts from the **newest** entry, so arriving entries move every page during a walk. To start from the present instead of the oldest entry, take the cursor from the last entry of a `last=N` read. Walk until `entries` is empty.

**Rate limit:** kit-URL reads are limited per scope: by default a burst of 10, then 30 per minute (one every 2 s), and some deployments differ (see Common errors). A rapid walk longer than about 10 pages can therefore get `429 {"error":"rate_limited"}`. That reply has no `entries`, so a loop that reads it as an empty page stops early and looks finished. A read the kit could not complete is harder to see: it answers `200` with `entries: []` and `failed: true`, which also looks like the end of the log. The loops below treat any failed call, any reply without an `entries` array and any reply with `failed: true` as a failure. After each failure they wait (2 s, then 4, 8, 16 and 32 s) and retry. The walk stops with an error and exit status 1 on the 6th failed call in a row, after 5 retries and about 62 s of waiting, so an `audit_quota_exceeded` refusal (`Retry-After: 60`) can stop it early: wait, then resume from the `afterId` it reports.

```bash
walk_logs() {
  local after=0 tries=0 page count
  while :; do
    if page=$(hoody --computer "$C" proxy logs list --after-id "$after" --limit 500 -o json) \
       && count=$(printf '%s' "$page" | jq -e 'select(.failed != true) | .entries | arrays | length'); then
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

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byComputer, byService }` — perfect for a dashboard tile. Filtered results also include `byStatusClass`; a valid `sinceMs` and `bucketMs` request includes `buckets`.

```bash
hoody --computer "$C" proxy logs stats -o json | jq '{
  total, byLevel,
  noisiest: (.byService | to_entries | sort_by(-.value) | .[:3])
}'
```

### 5. Look up the entries of one `traceId`

**Goal:** find every entry recorded under one `traceId`. The ID is assigned per log source, not per end-to-end request: an edge entry carries the edge's own 32-character hex request ID, and a backend `request`/`response` pair shares a separately generated UUID. A `traceId` therefore does not link an edge entry to a backend entry, or a request to calls it makes to other kits; correlate those by `tsMs`, `serviceName` and `url` instead. Pass `traceId` and the kit returns only that ID's entries; the request ID a public Bot URL answers with (`X-Request-Id`) is the `traceId` of its `bots` entry.

```bash
TID=354a5a0222e7107c46ae2851ded57fa6
hoody --computer "$C" proxy logs list --trace-id "$TID" \
    --include-request-body --include-response-body -o json \
  | jq '.entries | sort_by(.tsMs)'
```

### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and resume after a network blip. Live frames carry an `id:` line holding an increasing integer cursor; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. The CLI sends `Last-Event-ID` itself when it reconnects during a run. The resume is complete only while your cursor is still in the server's replay buffer: when it is not, the first frame is `event: gap` (no `id:`, data `{"after","resumedFrom"}`), and the entries in between are NOT replayed. Treat `gap` as a control event, not a log entry: backfill with `hoody proxy logs list` (`afterId` = the greatest entry row `id` you already processed, with the stream's filters kept; read every page and deduplicate by row `id`, because producer timestamps can arrive out of order, so a `sinceMs` window can miss rows), then carry on with the stream. `event: purged` carries an `id:` and `data: {}`: advance the cursor past it, but it is not an entry. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — this log scope was destroyed (the computer may still exist).

A live or replayed frame (one entry) larger than 256 KiB is replaced by a stub that keeps the entry's row `id` and carries `truncated: true` and `originalFrameBytes`. The initial replay array has its own byte budget instead, so it can exceed 256 KiB as a whole. To get the full entry, read that row with the list call, `hoody proxy logs list --limit 1 --after-id <id minus 1>` (`--after-id` is exclusive, so passing the `id` itself skips the row) (add `--include-request-body` / `--include-response-body` for its stored bodies, which the list leaves out by default) and check that the returned entry's `id` matches; the SSE `id:` line is a different cursor from this row id. If the row cannot be read, report the missing entry instead of treating the stub as complete.

```bash
# The CLI auto-resumes across reconnects within the same process. To pick up after an
# earlier run, pass --after-id with the greatest entry row id you saw. `-o json` shows it (so do `-o ndjson` and `-o raw`):
# each entry line is the raw payload (the first may be an array of entries), and each entry has an `id`.
# The first request's initial batch then holds only newer rows (live frames are unaffected).
hoody --computer "$C" proxy logs stream --level warn -o json ${LAST_ROW:+--after-id "$LAST_ROW"}
# A resume whose cursor fell out of the buffer prints a gap notice on stderr; with
# -o json, -o ndjson or -o raw it prints a {"event":"gap",...} line on stdout instead. The CLI does not backfill the
# missing entries: when the record must be complete, read the window after a reconnect with
# `hoody --computer "$C" proxy logs list --level warn --after-id "$LAST_ROW"` (LAST_ROW = the greatest row id you saw; read every page).
```

### 7. Read request + response bodies for a debug slice

**Goal:** inspect what the upstream actually sent or received for a narrow slice of entries (e.g. recent warns). Request and response bodies are captured by default, but query results leave them out. Pass `--include-request-body` and `--include-response-body` to get the bodies already stored with the entries you query. One query returns about 4 MiB of stored bodies at most (the first entry with a body always keeps its stored bodies, even over that, still subject to the reader-side cap below): once that is spent, the remaining entries come back without bodies and the result carries `bodiesOmitted: true`. Read those entries again with a smaller `--limit` (a page of one always carries its body). These options change what a query returns, not what gets captured: a body that was never captured cannot be brought back. The live stream leaves out `requestBody` and `responseBody`, but keeps `data`: for a reply the proxy answered itself, `data` holds what it answered, redacted (for example `{error, errorCode}`; an inline reply puts its body, or a short summary of it, under `data.body`). By default a response body is stored up to its first 64 KB (65 536 bytes), and a request body is stored only when it declares a `Content-Length` of 64 KB or less (a larger or chunked request body is not stored at all). Bodies whose content type matches `image/`, `video/`, `audio/`, `application/octet-stream` or `font/` are not captured by default. The deployment's log configuration sets whether bodies are captured, the cap and the excluded types; this API cannot change any of them. A body the reader-side cap shortens (by default it counts 65 536 UTF-16 code units of each returned `requestBody`, `responseBody` and `data.body` string, not bytes; the deployment's log configuration sets the limit) ends in `...[TRUNCATED]`; one already cut upstream carries no marker, so do not test for that suffix to detect truncation. `bodyTruncated` can be `true`, `false` or absent, so test it for truthiness and never compare it to `false`.

```bash
hoody --computer "$C" proxy logs list --level warn --limit 20 \
    --include-request-body --include-response-body -o json \
  | jq '.entries[] | {id, tsIso, status, url, reqBody: .requestBody, resBody: .responseBody}'
```

## Reference

### `hoody proxy` (3) — Global proxy routing, aliases, and logs

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody proxy logs list` |  | read | Query centralized logs | `proxyLogs.list` | `hoody proxy logs list --limit 200 --path /home/user/file.txt` |
| `hoody proxy logs stats` |  | read | Get log statistics | `proxyLogs.getStats` | `hoody proxy logs stats --path /home/user/file.txt --status 100` |
| `hoody proxy logs stream` |  | read | Live-tail logs over Server-Sent Events | `proxyLogs.stream` | `hoody proxy logs stream --kind request --source backend` |

