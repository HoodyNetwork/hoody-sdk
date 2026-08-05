> _**HTTP skill · `proxyLogs` namespace** · ~2,872 tokens · hoody-sdk v1.0.0-beta.11_

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
- Sweep: `GET /_logs` / `GET /_logs`.

### 2. Drill into 5xx

- `GET /_logs` `level: "error"` (single value — 5xx auto-promote to `error`), `includeResponseBody: true`; filter `serviceName` client-side (kit/SNI list ignores it).
- Paginate with `limit`/`offset` (DB rowids); `afterId` on the kit URL hits the ring buffer where `id: 0`.

### 3. Live-tail with resume

- `GET /_logs/stream` — SSE; live frames carry `id: <ringSeq>` (initial replay frame is a data-only array with no `id:` line).
- Reconnect with `Last-Event-ID`; replays from ~5000-entry ring.
- `event: reset` → drop cursor, reconnect. `event: scope-destroyed` → close.

### 4. Status snapshot

- `GET /_logs/stats` — totals + status breakdown.

### 5. Bodies for a slice

- `GET /_logs` + `includeRequestBody`/`includeResponseBody: true` (off by default).

## Quirks & gotchas

- Kit slug `logs`; only `/`, `/_logs`, `/_logs/stream`, `/_logs/stats` reachable.
- `projectId`/`containerId` on `GET /_logs` ignored — SNI auto-scopes.
- `cursor` is only accepted when the deployment enables cursor pagination.
- `level` accepts ONE value at a time; despite the mapping description claiming comma-separated, `level=warn,error` returns `total: 0` — query each level separately and union client-side.
- `serviceName` handling is path-dependent: the kit/SNI `/_logs` LIST handler silently ignores `serviceName`, but the kit/SNI `/_logs/stream` BOUNCE forwards `serviceName`/`source` to the management port; the management-port `/_logs` handler always honours it. The generated SDK `GET /_logs` sends the param either way, but on a kit-URL list it is a no-op — scan + client-side filter. The generated **streamLogs** SDK method does not expose `serviceName` at all. `traceId` is not exposed as a query param anywhere; scan with `limit/afterId` and filter client-side.
- Response shape switches on which paging param you use: `limit/offset` → `{entries,total,limit,offset}`; `last=N` and `afterId` → flat `LogEntry[]` (and `id: 0` placeholders on the `last=N` shape) — but only when bodies are NOT requested; with `includeRequestBody`/`includeResponseBody=true` even the flat-paging paths fall through to the wrapped `{entries,total,limit,offset}` shape.
- `includeRequestBody`/`includeResponseBody` default `false`.
- Ring ~5000 (~50s @ 100/s); longer gaps lose rows.
- `event: reset` rebases ringSeq ≥10000 — drop cursor.
- `logs` strict-boolean; `"*"` does NOT grant.
- `kind` = `request`/`response`/`event`.

## Common errors

- 403 — missing `logs: true` (permission / blocked-path gate).
- 429 — `AUDIT_SNI_RATE_LIMIT_PER_MIN` (default 30) per-scope read/stat/stream rate limit tripped on any SNI read (list, getStats, streamLogs) → `{error:"rate_limited"}` with `Retry-After: 2`; back off.
- 404 on `/_logs/{config,health,export,db/*}`.
- 405 on `DELETE /_logs`.
- 410 NDJSON `snapshot_expired` (admin `cursor`); restart no-cursor.
- Desync if `event:` lines unparsed; reset on `reset`.

## Related namespaces

- `exec`/`daemon` — app logs.
- `terminal` — reproduce.
- `watch` — fs events.
- `api` — lifecycle.

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

> **CLI caveat — `hoody proxy logs …` does NOT target the kit.** `GET /_logs`/`stats` declare `namespace: 'api'` and `GET /api/v1/exec/logs/stream` builds from the client base URL, so `--container` is IGNORED and the call goes to your configured API/management base URL (`--base-url`), where no `/_logs` route exists. The kit-URL behaviours documented below (flat `last=N` array, `id: 0` ring rows) apply to the HTTP and SDK forms only.

`proxyLogs` is read-only (no destructive writes — clear/reset/repair are not exposed via the kit URL), so the surface is small. We picked **7** end-to-end recipes that exercise every working filter, both response shapes, the stats endpoint, and SSE resume. Three additional scenarios from the suggestion list — *filter by program*, *filter by source IP*, and *search by alias hostname* — were dropped because the kit does **not** filter on those fields server-side (`serviceName`, `clientIp`, alias-hostname are *not* honoured as query params on `GET /_logs`); the only way to scope by them is client-side `.filter()` after a paged scan, which is already shown in §2 (status) and §5 (traceId).

### 1. Tail the last N requests across every kit

**Goal:** glance at the most recent ~50 requests handled by the container's edge proxy. Uses `last=N`, which returns a flat ARRAY (no `entries` wrapper) ordered **oldest-first within the returned last-N slice** with `id: 0` placeholders — the cheapest call you can make.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?last=50" | jq -r '.[] | "\(.tsIso)  \(.kind)/\(.level)  \(.serviceName)  \(.method) \(.url) \(.status // "—")"'
```
### 2. Triage 4xx/5xx — pull a level and post-filter by status

**Goal:** find the entries the edge auto-promoted — `level: error` is what **5xx** become, `level: warn` is what **4xx** become — then narrow client-side to a specific status range. The server-side `level` param honours **one** value at a time — `level=warn,error` returns 0 rows; query each level separately and union locally.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?level=error&limit=200" \
  | jq '[.entries[] | select(.status >= 500 and .status < 600)] | sort_by(.id) | reverse'
```
### 3. Walk the full window with `limit`/`offset` paging (oldest → newest)

**Goal:** sweep every entry without skipping or double-reading rows. On the kit URL **do not** cursor-page by `id`: a bare `afterId`/`last` (no bodies) routes to the in-memory ring buffer where every entry is `id: 0`, so `max(id)` is always `0` and `afterId=0` never advances. Page with `limit`/`offset` instead — that path queries the DB, returns the wrapped `{entries,total,limit,offset}` shape, and carries real rowids. Walk pages until `entries` is empty.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
OFFSET=0
while :; do
  PAGE=$(curl -s "$KIT/_logs?limit=500&offset=${OFFSET}")
  COUNT=$(echo "$PAGE" | jq '.entries | length')
  [ "$COUNT" -eq 0 ] && break
  echo "$PAGE" | jq -c '.entries[] | {id,tsIso,serviceName,status}'
  OFFSET=$((OFFSET + COUNT))
done
```
### 4. Status snapshot — total, level mix, per-service breakdown

**Goal:** one call to summarise log volume and where errors are clustering. `/_logs/stats` returns `{ total, byLevel, byProject, byContainer, byService }` — perfect for a dashboard tile.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs/stats" | jq '{
  total,
  warn_pct: ((.byLevel.warn // 0) / .total * 100 | floor),
  noisiest: (.byService | to_entries | sort_by(-.value) | .[:3])
}'
```
### 5. Trace one request across kits via `traceId`

**Goal:** one HTTP request that fans out to multiple internal kits shares a single `traceId` (UUID for edge entries; 32-char hex for backend hops). The kit does not filter on `traceId` server-side, so scan a recent window and group client-side. Each `traceId` typically yields a `kind: "request"` (edge) + one or more `kind: "request"`/`"response"` (backend) frames.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
TID="$1"   # e.g. 354a5a0222e7107c46ae2851ded57fa6
curl -s "$KIT/_logs?limit=1000&includeRequestBody=true&includeResponseBody=true" \
  | jq --arg tid "$TID" '[.entries[] | select(.traceId == $tid)] | sort_by(.tsMs)'
```
### 6. Live-tail with SSE and resume after disconnect

**Goal:** stream new log entries as they happen, and pick up exactly where you left off after a network blip. Live frames carry `id: <ringSeq>`; the initial replay frame may be `data: [...]` with no `id:` line, so seed your cursor only after you see the first `id:` line. Resume by sending `Last-Event-ID: <last>` on reconnect. On `event: reset` clear your cursor and reconnect fresh; on `event: scope-destroyed` exit cleanly — the container is gone.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
LAST=${LAST:-0}
curl -sN -H 'Accept: text/event-stream' \
  -H "Last-Event-ID: ${LAST}" \
  "$KIT/_logs/stream?level=warn"
# First frame may be `data: [...]\n\n` with no `id:` line; later live frames are `id: 12345\ndata: {...}\n\n`.
# Heartbeat every 30s:  ": keepalive\n\n"   (ignore)
```
### 7. Capture request + response bodies for a debug slice

**Goal:** body payloads are off by default. Turn them on for a narrow window (e.g. recent warns) to inspect what the upstream actually sent or received. Bodies are capped at `maxBodySize` (default 65 536 B) and content-types in the kit's `excludeContentTypes` (`image/`, `video/`, `audio/`, `application/octet-stream`, `font/`) are skipped — `bodyTruncated: true` flags both cases.

```bash
KIT="https://${P}-${C}-logs-1.${N}.containers.hoody.com"
curl -s "$KIT/_logs?level=warn&limit=20&includeRequestBody=true&includeResponseBody=true" \
  | jq '.entries[] | select(.bodyTruncated == false) | {
      id, tsIso, status, url,
      reqBody: (.requestBody // null),
      resBody: (.responseBody // null)
    }'
```

## Reference

### `logs` (3) — logs

| Method | Summary | Params |
|--------|---------|--------|
| `GET /_logs/stats` | Get log statistics |  |
| `GET /_logs` | Query centralized logs | `?limit` `?offset` `?projectId` `?containerId` `?serviceName` `?level` `?includeRequestBody` `?includeResponseBody` `?last` `?afterId` `?cursor` `?kind` `?method` `?source` |
| `GET /_logs/stream` | Live-tail logs over Server-Sent Events (v8 SSE contract) | `?projectId` `?containerId` `?kind` `?level` `H:Last-Event-ID` |

**Param notes:**

- `level` — Comma-separated levels (debug,info,warn,error)
- `last` — Return only the last N entries
- `afterId` — Return entries with SQLite row ID greater than this (ASC cursor)
- `cursor` — pagination cursor (signed opaque base64).
- `projectId` — Filter to a single project
- `containerId` — Filter to a single container
- `Last-Event-ID` — numeric ringSeq of the last event received. Server skips entries ≤ this value from the ring buffer on reconnect.

