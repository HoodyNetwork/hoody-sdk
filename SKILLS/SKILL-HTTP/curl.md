> _**HTTP skill · `curl` namespace** · ~6,585 tokens · hoody-sdk v1.0.0-beta.12_

# `curl` — full HTTP client gateway + REST-as-GET-URL bridge

## Purpose

Full HTTP client gateway. Sync/async jobs, cookie jars, bodies to storage, cron schedules. **Killer use case: turn any REST request — POST / PUT / PATCH / DELETE with bodies and headers — into a single GET-able URL** that works in a browser tab, a webhook field that only takes a URL, an LLM tool with web-search-only access, an `<img src>` / `<a href>`, or any environment that can't issue a non-GET request. The kit takes care of the actual HTTP call; the caller just hits a query-string URL.

## When to use

- **REST-as-GET bridge** — any environment that can only do GET (browsers, restricted webhooks, agents with only "fetch URL" capability, RSS-style schedulers, copy-pasteable links). See workflow #1 for the URL recipe.
- A full HTTP client surface (TLS, client certs, HTTP/2/3, proxies, retries) when you can't / don't want to use `fetch()`.
- Long downloads as background jobs.
- Multi-step auth with cookie jars (server-side session reused across hits).
- Recurring HTTP (pings, scrapes, webhooks) on a cron.

## When NOT to use

Not for: browser → `browser`, shell → `exec`/`terminal`, KV/SQL → `sqlite`, files → `files`, non-HTTP timers → `cron`.

## Prerequisites

- Instance `1`; no workspace ID.
- `* /api/v1/curl/schedule*` 404s if disabled.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Convert any REST call into a single GET-able URL (`GET /api/v1/curl/request`)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }`. Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; standard OR URL-safe base64, padding optional; takes precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Only `form`/multipart and binary `--data-binary @file` uploads remain POST-only.

Live examples (verified — replace the kit URL with your container's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `POST /api/v1/proxy/aliases` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

The CLI command and the SDK accessor `GET /api/v1/curl/request` **execute** the request and return the envelope; they do NOT just compose a URL string. To compose a URL without firing it, build it client-side or use `POST /api/v1/proxy/aliases` to get a stable prefix.

For the imperative full-cURL surface (binary uploads, `--data-binary @file`, multipart, follow-redirects, custom TLS, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`POST /api/v1/curl/request` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `POST /api/v1/curl/request` with `mode:"async"` → `job_id`.
2. Poll `GET /api/v1/curl/jobs/{id}` or subscribe `GET /api/v1/curl/ws` filtered by `job_id`.
3. `GET /api/v1/curl/jobs/{id}/result`; `DELETE /api/v1/curl/jobs/{id}` aborts.

### 4. Cookie-jar session

1. `POST /api/v1/curl/request` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `GET /api/v1/curl/sessions/{id}/cookies` / `DELETE /api/v1/curl/sessions/{id}`.

### 5. Save download

1. `POST /api/v1/curl/request` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `GET /api/v1/curl/storage`/`GET /api/v1/curl/storage/{path}`/`DELETE /api/v1/curl/storage/{path}` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `POST /api/v1/curl/schedule` with `{cron,request}` → `schedule_id`.
2. `GET /api/v1/curl/schedule`/`GET /api/v1/curl/schedule/{id}`/`PATCH /api/v1/curl/schedule/{id}/toggle` (`{"enabled":bool}`)/`DELETE /api/v1/curl/schedule/{id}`.
3. Each firing creates a job; inspect via `GET /api/v1/curl/jobs`.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **Each saved download is mirrored under three indexes** for navigation: `by-job/{job_id}/<save_path>`, `by-domain/<host>/<job_id>`, `by-date/<YYYY-MM-DD>/<job_id>`. `GET /api/v1/curl/storage` returns one item per index path; the bytes are the same file (live-verified — `storage.list?limit=5` after one save returns 3 items pointing to the same content).
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `* /api/v1/curl/schedule*` 404s if disabled.
- `PATCH /api/v1/curl/schedule/{id}/toggle` needs explicit boolean `enabled`; else 400.
- **`schedules.create.cron` is 6-field (with seconds), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- `GET /api/v1/curl/ws` is WebSocket `/api/v1/curl/ws`; filter by `job_id`.

## Common errors

- `408 timeout` — raise timeout or use async (upstream libcurl timeouts surface as `504` instead).
- `410 cancelled`.
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Every step in every example was live-tested against a real `curl-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

### 1. Webhook receiver bridge — outbound system can only fire GETs

**Goal:** your CRM can fire URLs but not POST. Translate a click → real upstream POST with JSON body + bearer.

**Step 1 — compose the bridge URL — body and headers go right in the query string.** The GET bridge takes `url`, `method`, the timing/session/response flags (`response`, `mode`, `session_id`, `timeout`, `bearer_token`, …), **plus the request body + headers**: `data` (raw body), `json` (JSON body; sets `Content-Type: application/json`), `data_base64` (binary-safe base64, standard or URL-safe, precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the method GET→POST.** So a real `POST … {json} + headers` becomes one GET-able link a CRM/webhook can fire:

```
# Full POST as ONE GET URL (json body + header; method auto-upgrades to POST):
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&json=%7B%22event%22%3A%22X%22%7D&header=Authorization:%20Bearer%20XYZ
# For payloads with &, quotes, newlines, or binary, prefer data_base64 (URL-safe base64) to dodge escaping:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<target>&data_base64=eyJldmVudCI6IlgifQ&header=Content-Type:%20application/json
```

(`form`/multipart and binary `--data-binary @file` uploads remain POST-only — use the POST form below for those.)

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
# Drive the upstream POST directly from the kit (server-to-server, no clickable URL):
curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://my-api/events","method":"POST","data":"{\"event\":\"X\"}","headers":{"Content-Type":"application/json"}}'
```
**Step 2 — hide the `containerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```bash
curl -sX POST "https://api.hoody.com/api/v1/proxy/aliases" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg cid "$C" '{container_id:$cid, alias:"webhook-bridge", program:"curl", target_path:"/api/v1/curl/request", allow_path_override:true}')"
```
### 2. Multi-step OAuth login — cookie jar reuse across hits

**Goal:** authenticate against an API that uses a CSRF token + session cookie, then issue an authorized call. Pick a unique `session_id` per flow — once deleted, the same id returns `404 Session not found: <id> (tombstoned)` until the tombstone is garbage-collected (~24 h), after which the id is reusable again.

**Step 1 — fetch CSRF.** The Set-Cookie / response cookies are stored in the kit's jar.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
SID="oauth-$(date +%s)"
TOKEN=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{url:"https://api.example.com/csrf", method:"GET", session_id:$sid, response:"json"}')" \
  | jq -r '.body | fromjson | .csrf_token')
echo "csrf=$TOKEN  session=$SID"
```
**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar.

```bash
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" --arg t "$TOKEN" '{
    url:"https://api.example.com/login", method:"POST",
    data:"username=alex&password=secret&csrf="+$t,
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    session_id:$sid
  }')"
```
**Step 3 — authorized call.** Stored cookie is auto-attached.

```bash
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" '{url:"https://api.example.com/me", method:"GET", session_id:$sid, response:"json"}')" \
  | jq -r .body
# Inspect the jar:
curl -sf "$KIT/api/v1/curl/sessions/$SID/cookies"
# Drop when done:
curl -sX DELETE "$KIT/api/v1/curl/sessions/$SID"
```
### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JOBS=()
for URL in https://httpbin.org/delay/1 https://httpbin.org/delay/2 https://httpbin.org/get; do
  JID=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
    -H 'Content-Type: application/json' \
    -d "$(jq -nc --arg u "$URL" '{url:$u, method:"GET", mode:"async"}')" \
    | jq -r .job_id)
  JOBS+=("$JID")
done
echo "${JOBS[@]}"
```
**Step 2 — poll until all complete.** Live-verified — 3 httpbin jobs reached `completed/200` within ~4 s.

```bash
while :; do
  done=true
  for JID in "${JOBS[@]}"; do
    S=$(curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq -r .status)
    [ "$S" = "completed" ] || done=false
  done
  $done && break
  sleep 1
done
```
**Step 3 — collect bodies.** `GET /api/v1/curl/jobs/{id}/result` returns just the upstream body.

```bash
for JID in "${JOBS[@]}"; do
  curl -sf "$KIT/api/v1/curl/jobs/$JID/result" > "/tmp/$JID.json"
done
```
### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Status flips from `running` to `cancelled`, and the cancelled job's `error` field is set to `Cancelled`.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JID=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://httpbin.org/delay/30","method":"GET","mode":"async","timeout":60}' \
  | jq -r .job_id)
sleep 1
curl -sX DELETE "$KIT/api/v1/curl/jobs/$JID"
sleep 1
curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq '{status, error}'
```
### 5. Schedule + drift detection — fire every 15 min, audit history

**Goal:** ping a health endpoint every 15 min, fast-find failures. ⚠ Scheduler uses **6-field** cron syntax (with seconds) — `*/15 * * * *` (5-field) is rejected as `Invalid cron expression`.

**Step 1 — create.**

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
SID=$(curl -sf -X POST "$KIT/api/v1/curl/schedule" \
  -H 'Content-Type: application/json' \
  -d '{
    "cron":"0 */15 * * * *",
    "request":{"url":"https://prod.example.com/health","method":"GET","job_name":"prod-health"}
  }' | jq -r .schedule_id)
echo "schedule=$SID"
```
**Step 2 — audit failures.**

```bash
curl -sf "$KIT/api/v1/curl/jobs?limit=200" \
  | jq '.items[] | select(.status=="failed") | select(.name=="prod-health")'
```
**Step 3 — pause during deploy** (toggle `enabled: false` and back, or `delete` to drop entirely):

```bash
curl -sX PATCH "$KIT/api/v1/curl/schedule/$SID/toggle" \
  -H 'Content-Type: application/json' -d '{"enabled":false}'
# Resume: same call with {"enabled":true}. Drop entirely:
curl -sX DELETE "$KIT/api/v1/curl/schedule/$SID"
```
### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JID=$(curl -sf -X POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{
    "url":"https://example.com/big.iso","method":"GET","mode":"async",
    "save":true,"save_path":"iso/ubuntu.iso","timeout":600
  }' | jq -r .job_id)
```
**Step 2 — wait + inspect storage.** Three index entries point at the SAME bytes (`by-job/`, `by-domain/`, `by-date/`).

```bash
while [ "$(curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq -r .status)" != "completed" ]; do sleep 2; done
curl -sf "$KIT/api/v1/curl/storage?limit=10" | jq '.items[] | .path'
```
**Step 3 — fetch & delete.** Single delete on ANY of the three mirror paths removes all three (live-verified — others return `404` afterwards).

```bash
curl -sf "$KIT/api/v1/curl/storage/by-job/$JID/iso/ubuntu.iso" > /tmp/ubuntu.iso
curl -sX DELETE "$KIT/api/v1/curl/storage/by-job/$JID/iso/ubuntu.iso"
```
### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Live-verified against `httpbin.org/bearer` (`{"authenticated":true,"token":"…"}`).

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{
    "url":"https://api.github.com/user","method":"GET",
    "bearer_token":"ghp_xxxxxxxxxxxx","response":"json"
  }' | jq '{status_code, headers: .headers | {x_ratelimit_remaining: .["x-ratelimit-remaining"], x_ratelimit_reset: .["x-ratelimit-reset"]}, body}'
```
**HTTP Basic alternative** — swap the auth fields. Body `{ url, method, auth_user, auth_password, auth_method: 'basic' }`. Live-verified against `httpbin.org/basic-auth/alex/secret` → `{"authenticated":true,"user":"alex"}`.

### 8. REST→GET bridge for chat-channel embedding

**Goal:** drop a one-liner URL into Slack so a teammate can re-trigger a build by clicking. URL pattern + alias + IP gate.

**Step 1 — compose** (no kit call — URL pattern). The GET bridge carries the full request in the query string — `url`, `method`, body via `data`/`json`/`data_base64`, and repeatable `header=Name: Value` (a body auto-upgrades the method to POST). So a build-trigger that needs a JSON body + auth header is still one clickable link.

```
# GET-bridge URL — a real POST (json body + bearer header) as a single clickable link:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<url-encoded-build-trigger>&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ
```

**Step 2 — wrap with an alias** so the public URL hides `containerId`:

```bash
ENCODED='/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST'
curl -sX POST "https://api.hoody.com/api/v1/proxy/aliases" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg cid "$C" --arg p "$ENCODED" \
    '{container_id:$cid, alias:"rebuild-main", program:"curl", target_path:$p, allow_path_override:false}')"
```
**Step 3 — gate it** — only your office IPs can fire it (uses `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Job records are NOT auto-expired by the kit — they persist until the container's storage is cleared.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`):

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
JID=$(curl -sf "$KIT/api/v1/curl/jobs?limit=200" \
  | jq -r '.items[] | select(.status=="completed" and .name=="prod-health" and (.completed_at | fromdate) > (now - 86400)) | .id' \
  | head -1)
```
**Step 2 — fetch.** `GET /api/v1/curl/jobs/{id}/result` returns just the upstream body; `GET /api/v1/curl/jobs/{id}` returns the full record (timing, headers, original request).

```bash
curl -sf "$KIT/api/v1/curl/jobs/$JID/result"   # body only
curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq '.' # full record
```
### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%d)
curl -sf "$KIT/api/v1/curl/storage?limit=200" \
  | jq -r --arg c "$CUTOFF" '.items[] | select(.path | startswith("by-date/")) | select((.path | split("/")[1]) < $c) | .path' \
  | while IFS= read -r P; do
      curl -sX DELETE "$KIT/api/v1/curl/storage/$P"
    done
# Single delete on any one of the 3 mirror paths removes all 3.
```

## Reference

### `curl` (2) — cURL execution endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/curl/request` | Execute HTTP request with full cURL capabilities | `body*:curl_CurlRequest` |
| `GET /api/v1/curl/request` | Execute simple HTTP request via query parameters | `?url*` `?method` `?response` `?mode` `?session_id` `?follow_redirects` `?timeout` `?user_agent` `?referer` `?bearer_token` `?save` `?save_path` `?insecure` `?compressed` `?job_name` `?data` `?json` `?header` `?data_base64` |

**Param notes:**

- `url` — Target URL (required)
- `method` — HTTP method (default: GET)
- `response` — Response mode: transparent or json (default: json)
- `mode` — Execution mode: sync or async (default: sync)
- `session_id` — Session ID for cookie persistence
- `follow_redirects` — Follow redirects (default: true)
- `timeout` — Timeout in seconds
- `user_agent` — User-Agent header
- `referer` — Referer header
- `save` — Save to storage
- `save_path` — Custom save path, relative to downloads/by-job/{job_id} (no absolute paths or `..`)
- `insecure` — Allow insecure SSL
- `compressed` — Request compressed
- `job_name` — Job name for async
- `data` — Raw request body (curl --data); alias `body`; presence upgrades default method to POST
- `json` — JSON request body, sent with Content-Type: application/json (curl --json); upgrades default method to POST
- `header` — Custom header as `Name: Value`. Repeatable — supply once per header
- `data_base64` — Base64 request body (binary-safe; standard or URL-safe); alias `body_base64`. Takes precedence over data/json; upgrades default method to POST

### `events` (3) — WebSocket event endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/curl/sse` | Subscribe to job events over Server-Sent Events | `?job_id` |
| `GET /api/v1/curl/ws` | Subscribe to job events over WebSocket | `?job_id` |
| `GET /api/v1/curl/channel` | Execute cURL requests over a WebSocket channel | `?max_concurrent` `?max_concurrent_streams` `?max_pool` `?max_queue` `?max_frame_bytes` `?max_request_bytes` `?chunk_bytes` `?stream_timeout_secs` `?idle_timeout_secs` `?max_outbound_messages` |

**Param notes:**

- `job_id` — Optional job ID filter
- `max_concurrent` — Alias for max concurrent streams on this channel connection
- `max_concurrent_streams` — Maximum concurrently executing streams on this channel connection
- `max_pool` — Alias for max_concurrent; does not configure outbound libcurl connection pooling
- `max_queue` — Maximum queued streams waiting for a per-connection execution slot
- `max_frame_bytes` — Maximum inbound WebSocket text frame size in bytes
- `max_request_bytes` — Maximum assembled request JSON size in bytes
- `chunk_bytes` — Maximum upstream response bytes encoded into one channel body frame
- `stream_timeout_secs` — Per-stream execution timeout in seconds
- `idle_timeout_secs` — Idle channel timeout in seconds
- `max_outbound_messages` — Maximum queued outbound channel messages

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/curl/health` | Service health check |  |

### `jobs` (4) — Job management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/jobs/{id}` | Cancel a pending or running job |  |
| `GET /api/v1/curl/jobs/{id}` | Get detailed job information |  |
| `GET /api/v1/curl/jobs/{id}/result` | Get job response body |  |
| `GET /api/v1/curl/jobs` | List all async jobs | `?page` `?limit` |

**Param notes:**

- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

### `ops` (1) — Operational endpoints (health and metrics)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /metrics` | Prometheus metrics |  |

### `schedules` (5) — Schedule management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/curl/schedule` | Create a recurring scheduled job | `body*:curl_CreateScheduleRequest` |
| `DELETE /api/v1/curl/schedule/{id}` | Delete a schedule |  |
| `GET /api/v1/curl/schedule/{id}` | Get schedule details |  |
| `GET /api/v1/curl/schedule` | List all scheduled jobs | `?page` `?limit` |
| `PATCH /api/v1/curl/schedule/{id}/toggle` | Enable or disable a schedule | `body*` |

**Param notes:**

- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

**Body shapes:**

- `PATCH /api/v1/curl/schedule/{id}/toggle` body — `any` — Toggle a schedule between enabled and disabled states without deleting it. Request body: {"enabled": true} or {"enabled": false}

### `sessions` (4) — Session management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/sessions/{id}` | Delete a session |  |
| `GET /api/v1/curl/sessions/{id}` | Get session details |  |
| `GET /api/v1/curl/sessions/{id}/cookies` | Get session cookies only |  |
| `GET /api/v1/curl/sessions` | List all cookie sessions | `?page` `?limit` |

**Param notes:**

- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

### `storage` (3) — Storage management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/storage/{path}` | Delete a saved file |  |
| `GET /api/v1/curl/storage/{path}` | Download a saved file |  |
| `GET /api/v1/curl/storage` | List all saved downloads | `?page` `?limit` |

**Param notes:**

- `path` — Relative path to file in storage
- `path` — Relative path to file in storage (supports nested paths)
- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)


### Body schemas

- `curl_CurlRequest` — `{ auth_method: string|null, auth_password: string|null, auth_user: string|null, bearer_token: string|null, cacert: string|null, cert: string|null, cert_type: string|null, compressed: bool|null, connect_timeout: int|null, cookie: string|null, data: string|null, follow_redirects: bool|null, form: { [key: string]: string }|null, headers: { [key: string]: string }|null, insecure: bool|null, job_name: string|null, json: any, keepalive: bool|null, keepalive_time: int|null, key: string|null, max_filesize: int|null, max_redirects: int|null, method: string|null, mode: null | curl_ExecutionMode, proxy: string|null, proxy_password: string|null, proxy_user: string|null, range: string|null, referer: string|null, response: null | curl_ResponseMode, retry_count: int|null, retry_delay: int|null, save: bool|null, save_path: string|null, schedule: string|null, session_id: string|null, speed_limit: int|null, speed_time: int|null, tcp_nodelay: bool|null, timeout: int|null, url*: string, user_agent: string|null }`
- `curl_CreateScheduleRequest` — `{ cron*: string, request*: curl_CurlRequest }`
- `curl_ExecutionMode` — `"sync" | "async"`
- `curl_ResponseMode` — `"transparent" | "json"`
