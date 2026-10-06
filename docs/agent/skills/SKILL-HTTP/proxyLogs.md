> _**HTTP skill · `proxyLogs` namespace** · ~4,055 tokens · hoody-sdk v1.0.0-beta.15_

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

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. List recent

- `GET /_logs` with `last: N` or `limit`+`offset` (SNI-bound).

### 2. Drill into 5xx

- `GET /_logs` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate from a cursor with `afterId`: it reads the log database (real row ids), oldest first, and `total` counts every entry after the cursor.

### 3. Live-tail with resume

- `GET /_logs/stream` — SSE; live frames carry an `id:` line holding an opaque increasing integer cursor (a fresh connection first gets a data-only array of recent matching entries with no `id:` line, only when there are some; otherwise its first frame is a live one).
- Reconnect with `Last-Event-ID`; the server replays the buffered frames after it. `event: gap` (no `id:`) means it no longer reaches back that far: backfill the missing entries from `GET /_logs`.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Stats snapshot

- `GET /_logs/stats` — `total` plus counts `byLevel`, `byProject`, `byContainer` and `byService`, and the `timeRange`. There is no status-code breakdown: derive one client-side from `GET /_logs`.

### 5. Bodies for a slice

- `GET /_logs` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `GET /_logs` ignored — SNI auto-scopes.
- On the stream the scope also comes from the kit URL, but `projectId`/`containerId` are checked rather than ignored: omit them or pass the URL's own values; any other value returns `400 {"error":"scope_mismatch"}`. They cannot retarget the stream.
- `traceId` is per log source: edge entries carry the edge's hex request ID, backend request/response pairs share their own UUID. Entries from the edge and the backend, or from different kits, never share one.
- `level` accepts ONE value at a time on the kit URL: `level=warn,error` returns `total: 0`, so query each level separately and union client-side.
- `serviceName` is not honoured on the kit URL for `GET /_logs` (the list handler ignores it); filter client-side. It IS honoured on `GET /_logs/stream`, so tail with `serviceName=` and list without it.
- Every `GET /_logs` read returns `{entries,total,limit,offset}`. `last=N` returns the newest N entries, oldest first, in one response (`total` is the number returned, `offset` does not apply, and `last` wins over `afterId`); on the kit URL without bodies or time filters those entries come from the in-memory recent buffer and carry `id: 0`, so never cursor from them. `afterId` always reads the log database: real row ids, oldest first, `total` counts every entry after the cursor and `offset` pages through them.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. The 7 recipes below cover every working filter, both paging modes, the stats endpoint, and SSE resume. The list endpoint does **not** filter by program, source IP (`clientIp`), alias hostname or `serviceName` server-side (none of them is honoured as a query parameter on `GET /_logs`); scope by those fields client-side after a paged scan, as §2 (status) and §5 (traceId) do.

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns the newest N entries in the usual `{entries,total,…}` envelope, ordered **oldest-first within the returned slice**. On the kit URL they come from the in-memory recent buffer and carry `id: 0` placeholders, so use §3 for a cursor. It is the cheapest call you can make.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?last=50" | jq -r '.entries[] | "\(.tsIso)  \(.kind)/\(.level)  \(.serviceName)  \(.method) \(.url) \(.status // "—")"'
```

### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?level=error&limit=200" \
  | jq '[.entries[] | select(.status >= 500 and .status < 600)] | sort_by(.id) | reverse'
```

### 3. Walk the full window with an `afterId` cursor (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. Page by row id: `afterId` always reads the log database, returns entries **oldest first** with real row ids, and `total` counts every entry after the cursor. Start at `afterId=0`, then pass the last `id` of each page as the next `afterId`; new traffic lands after your cursor, so nothing shifts under you. Plain `limit`/`offset` without `afterId` counts from the **newest** entry, so arriving entries move every page during a walk. Do not cursor from a `last=N` read: its rows carry `id: 0`. Walk until `entries` is empty.

**Rate limit:** kit-URL reads are limited per scope: by default a burst of 10, then 30 per minute (one every 2 s), and some deployments differ (see Common errors). A walk longer than about 10 pages therefore gets `429 {"error":"rate_limited"}`. That reply has no `entries`, so a loop that reads it as an empty page stops early and looks finished. The loops below treat any failed call, or any reply without an `entries` array, as a failure. After each failure they wait (2 s, then 4, 8, 16 and 32 s) and retry. The walk stops with an error and exit status 1 on the 6th failed call in a row, after 5 retries and about 62 s of waiting.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
walk_logs() {
  local after=0 tries=0 page count
  while :; do
    # -f: an HTTP error (429, 403) fails here instead of reading as an empty page.
    if page=$(curl -sf "$KIT/_logs?afterId=${after}&limit=500") \
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
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs/stats" | jq '{
  total,
  warn_pct: (if .total > 0 then ((.byLevel.warn // 0) / .total * 100 | floor) else 0 end),
  noisiest: (.byService | to_entries | sort_by(-.value) | .[:3])
}'
```

### 5. Group entries that share a `traceId`

**Goal:** find every entry recorded under one `traceId`. The ID is assigned per log source, not per end-to-end request: an edge entry carries the edge's own 32-character hex request ID, and a backend `request`/`response` pair shares a separately generated UUID. A `traceId` therefore does not link an edge entry to a backend entry, or a request to calls it makes to other kits; correlate those by `tsMs`, `serviceName` and `url` instead. The kit does not filter on `traceId` server-side, so scan a recent window and group client-side.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
TID="$1"   # e.g. 354a5a0222e7107c46ae2851ded57fa6
curl -s "$KIT/_logs?limit=1000&includeRequestBody=true&includeResponseBody=true" \
  | jq --arg tid "$TID" '[.entries[] | select(.traceId == $tid)] | sort_by(.tsMs)'
```

### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and resume after a network blip. Live frames carry an `id:` line holding an increasing integer cursor; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. The resume is complete only while your cursor is still in the server's replay buffer: when it is not, the first frame is `event: gap` (no `id:`, data `{"after","resumedFrom"}`), and the entries in between are NOT replayed. Treat `gap` as a control event, not a log entry: backfill the missing window with `GET /_logs` (`sinceMs` = the `tsMs` of the last entry you processed), skip entries you already handled, then carry on with the stream. `event: purged` carries an `id:` and `data: {}`: advance the cursor past it, but it is not an entry. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
# Send Last-Event-ID only once you hold a real cursor. Any non-empty value, "0"
# included, is parsed as a cursor: it replays the buffered frames after it and can
# raise a spurious `event: gap`. Leave LAST unset on a first connect or after a reset.
curl -sN -H 'Accept: text/event-stream' \
  ${LAST:+-H "Last-Event-ID: $LAST"} \
  "$KIT/_logs/stream?level=warn"
# First frame may be `data: [...]\n\n` with no `id:` line; later live frames are `id: 12345\ndata: {...}\n\n`.
# Heartbeat every 30s:  ": keepalive\n\n"   (ignore)
# A resume whose cursor fell out of the buffer starts with `event: gap` (no id:):
# backfill from "$KIT/_logs?sinceMs=<tsMs of the last entry you processed>" and skip entries you already have.
```

### 7. Read request + response bodies for a debug slice

**Goal:** inspect what the upstream actually sent or received for a narrow slice of entries (e.g. recent warns). Request and response bodies are captured by default, but query results leave them out. Pass `includeRequestBody` and `includeResponseBody` to get the bodies already stored with the entries you query. These options change what a query returns, not what gets captured: a body that was never captured cannot be brought back. The live stream never carries bodies. Bodies are capped at 65 536 B by default, and bodies whose content type matches `image/`, `video/`, `audio/`, `application/octet-stream` or `font/` are not captured by default. The deployment's log configuration sets whether bodies are captured, the cap and the excluded types; this API cannot change any of them. A body the reader-side cap shortens ends in `...[TRUNCATED]`; one already cut upstream carries no marker, so do not test for that suffix to detect truncation. `bodyTruncated` can be `true`, `false` or absent, so test it for truthiness and never compare it to `false`.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?level=warn&limit=20&includeRequestBody=true&includeResponseBody=true" \
  | jq '.entries[] | select(.bodyTruncated != true) | {
      id, tsIso, status, url,
      reqBody: (.requestBody // null),
      resBody: (.responseBody // null)
    }'
```

## Reference

### `proxyLogs` (3) — logs

| Method | Summary | Params |
|--------|---------|--------|
| `GET /_logs/stats` | Get log statistics |  |
| `GET /_logs` | Query centralized logs | `?limit` `?offset` `?projectId` `?containerId` `?serviceName` `?level` `?includeRequestBody` `?includeResponseBody` `?last` `?afterId` `?kind` `?method` `?source` `?sinceMs` `?untilMs` |
| `GET /_logs/stream` | Live-tail logs over Server-Sent Events | `?projectId` `?containerId` `?serviceName` `?kind` `?level` `?source` `?afterId` `H:Last-Event-ID` |

**Param notes:**

- `limit` — Page size. A value above 1000 is treated as 1000.
- `offset` — Entries to skip: counted from the newest match, or with `afterId` from the oldest entry after the cursor. Ignored with `last`.
- `serviceName` — Filter to one service. The per-container logs URL ignores it, so filter the returned entries client-side. GET /_logs/stream honours it. _(on `GET /_logs`)_
- `level` — Log level: exactly ONE of debug, info, warn or error. A comma-separated value matches nothing.
- `last` — Return only the newest N matching entries, oldest first, in one response: `total` is the number returned and `offset` does not apply. Takes precedence over `afterId`.
- `afterId` — Return the entries whose row id (`id`) is greater than this, oldest first. `total` counts every such entry and `offset` pages through them. _(on `GET /_logs`)_
- `sinceMs` — Only entries whose `tsMs` is at least this (Unix milliseconds).
- `untilMs` — Only entries whose `tsMs` is at most this (Unix milliseconds).
- `projectId` — Filter to a single project
- `containerId` — Filter to a single container
- `serviceName` — Filter the stream to one service, e.g. tunnel. Honoured here, unlike GET /_logs. _(on `GET /_logs/stream`)_
- `afterId` — Limits the initial batch of a fresh connection to entries whose `id` is greater than this. Entries in that batch carry `id: 0`, so a value of 0 or more leaves it empty. Live frames are unaffected. _(on `GET /_logs/stream`)_
- `Last-Event-ID` — The numeric `id` of the last event received. On reconnect the server skips buffered entries whose `id` is at most this value.

