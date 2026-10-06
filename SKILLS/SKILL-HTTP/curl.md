> _**HTTP skill · `curl` namespace** · ~7,536 tokens · hoody-sdk v1.0.0-beta.15_

# `curl` — full HTTP client gateway + REST-as-GET-URL bridge

## Purpose

Full HTTP client gateway. Sync/async jobs, cookie jars, bodies to storage, cron schedules. **Killer use case: turn any REST request — POST / PUT / PATCH / DELETE with bodies and headers — into a single GET-able URL** that works in a browser tab, a webhook field that only takes a URL, an LLM tool with web-search-only access, an `<img src>` / `<a href>`, or any environment that can't issue a non-GET request. The kit takes care of the actual HTTP call; the caller just hits a query-string URL.

## When to use

- **REST-as-GET bridge** — any environment that can only do GET (browsers, restricted webhooks, agents with only "fetch URL" capability, RSS-style schedulers, copy-pasteable links). See workflow #1 for the URL recipe.
- A server-side HTTP client (redirect following, TLS verification control, retries, cookie sessions) when you can't / don't want to use `fetch()`. Client certificates, custom CA files and outbound proxies are rejected over the API, and there is no HTTP-version option.
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

### 1. Convert any REST call into a single GET-able URL (HTTP only)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }`. Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; standard OR URL-safe base64, padding optional; takes precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Only the `form` field (URL-encoded fields) and a headers map are POST-only. Neither form sends a multipart upload or reads a file from disk (`--data-binary @file`); send a binary body as `data_base64`.

Live examples (verified — replace the kit URL with your container's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `POST /api/v1/proxy/aliases` with `{ program: 'curl' }` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

Every hit on `GET /api/v1/curl/request` **executes** the upstream request. When the deployment enables the kit's response cache (it is off by default), an eligible request can be answered from the cache instead. To compose a URL without firing it, build it client-side or use `POST /api/v1/proxy/aliases` with `{ program: 'curl', target_path: '/api/v1/curl/request' }` to get a stable prefix.

For the imperative full-cURL surface (a headers map, `form` fields sent URL-encoded, cookies, auth, follow-redirects, `insecure`, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`POST /api/v1/curl/request` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `POST /api/v1/curl/request` with `mode:"async"` → `job_id`.
2. Poll `GET /api/v1/curl/jobs/{id}` or subscribe `GET /api/v1/curl/sse` (SSE) filtered by `job_id`.
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
2. `GET /api/v1/curl/schedule`/`GET /api/v1/curl/schedule/{id}`/`PATCH /api/v1/curl/schedule/{id}` (`{"enabled":bool}` pauses or resumes)/`DELETE /api/v1/curl/schedule/{id}`.
3. Each admitted occurrence creates a job; inspect via `GET /api/v1/curl/jobs`. An occurrence is skipped, with no job, while the previous run is still in flight or when the job queue rejects it.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **A saved download is stored under `by-job/{job_id}/<save_path>`, with best-effort index links** `by-date/<YYYY-MM-DD>/<job_id>` and `by-domain/<host>/<job_id>`. A URL whose host is an IP literal gets no `by-domain` link, and either link is skipped silently if it cannot be created, so expect one to three entries. `GET /api/v1/curl/storage` returns one item per path; the bytes are the same file.
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `* /api/v1/curl/schedule*` 404s if disabled.
- Pausing or resuming through `PATCH /api/v1/curl/schedule/{id}` needs an explicit boolean `enabled`; else 400.
- **`schedules.create.cron` is 6-field (with seconds), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- Job events stream over a WebSocket at `/api/v1/curl/ws`; filter by `job_id`.

## Common errors

- `504` — the upstream request timed out (libcurl timeout); raise `timeout`. An async job does not wait on the caller's connection, but the same `timeout` still applies to the upstream request. The kit itself does not answer `408`; a transparent response passes the upstream's own status through, so an upstream `408` arrives as `408`.
- `410 cancelled`.
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

### 1. Webhook receiver bridge — outbound system can only fire GETs

**Goal:** your CRM can fire URLs but not POST. Translate a click → real upstream POST with JSON body + bearer.

**Step 1 — compose the bridge URL — body and headers go right in the query string.** The GET bridge takes `url`, `method`, the timing/session/response flags (`response`, `mode`, `session_id`, `timeout`, `bearer_token`, …), **plus the request body + headers**: `data` (raw body), `json` (JSON body; sets `Content-Type: application/json`), `data_base64` (binary-safe base64, standard or URL-safe, precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the method GET→POST.** So a real `POST … {json} + headers` becomes one GET-able link a CRM/webhook can fire:

```
# Full POST as ONE GET URL (json body + header; method auto-upgrades to POST):
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&json=%7B%22event%22%3A%22X%22%7D&header=Authorization:%20Bearer%20XYZ
# For payloads with &, quotes, newlines, or binary, prefer data_base64 (URL-safe base64) to dodge escaping:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<target>&data_base64=eyJldmVudCI6IlgifQ&header=Content-Type:%20application/json
```

(`form` fields, sent URL-encoded, are POST-only — use the POST form below for those. Neither form sends multipart uploads.)

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

**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar. Encode the token: `data` is sent as written, so a token holding `+`, `&` or `=` would be altered. The `form` field encodes each value and sets the form content type.

```bash
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg sid "$SID" --arg t "$TOKEN" '{
    url:"https://api.example.com/login", method:"POST",
    form:{username:"alex", password:"secret", csrf:$t},
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

**Step 2 — poll until every job is terminal.** A job ends `completed`, `failed` or `cancelled`; stop on the last two, on a failed status request, and at a deadline. The deadline is checked between polls, so each status request is also capped (10 s here) to keep one stalled request from outliving it.

```bash
DEADLINE=$((SECONDS + 300))
while :; do
  pending=0
  for JID in "${JOBS[@]}"; do
    R=$(curl -sf --max-time 10 "$KIT/api/v1/curl/jobs/$JID") || { echo "status check failed: $JID" >&2; exit 1; }
    case "$(jq -r .status <<<"$R")" in
      completed) ;;
      failed|cancelled) echo "job $JID: $(jq -r '.status + " " + (.error // "")' <<<"$R")" >&2; exit 1 ;;
      *) pending=1 ;;
    esac
  done
  [ "$pending" = 0 ] && break
  [ "$SECONDS" -lt "$DEADLINE" ] || { echo "jobs still running after 300 s" >&2; exit 1; }
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

**Step 2 — audit failures.** A job is `failed` when the request could not be completed (DNS, connect, timeout) or when processing after the response failed, such as saving a download. An upstream HTTP error status alone does not fail the job: an upstream that answers `500` still yields a `completed` job, so also read the `response.status_code` of completed runs (from `GET /api/v1/curl/jobs/{id}`; the listing does not carry it).

```bash
curl -sf "$KIT/api/v1/curl/jobs?limit=200" \
  | jq -r '.items[] | select(.name=="prod-health") | "\(.id) \(.status)"' \
  | while read -r JID ST; do
      if [ "$ST" = failed ]; then echo "$JID failed"; continue; fi
      [ "$ST" = completed ] || continue
      CODE=$(curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq -r '.response.status_code // empty')
      [ -n "$CODE" ] && [ "$CODE" -lt 400 ] || echo "$JID HTTP ${CODE:-?}"
    done
```

**Step 3 — pause during deploy** (set `enabled: false` and back, or `delete` to drop entirely):

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

**Step 2 — wait + inspect storage.** Stop on `failed` or `cancelled` and at a deadline instead of waiting for `completed` forever; the deadline is checked between polls, and each status request is capped at 10 s. Up to three entries point at the SAME bytes: `by-job/`, plus the best-effort `by-date/` and `by-domain/` links (no `by-domain/` for an IP-literal host).

```bash
DEADLINE=$((SECONDS + 1800))
while :; do
  S=$(curl -sf --max-time 10 "$KIT/api/v1/curl/jobs/$JID" | jq -r .status) && [ -n "$S" ] || { echo "status check failed" >&2; exit 1; }
  case "$S" in completed) break ;; failed|cancelled) echo "job $S" >&2; exit 1 ;; esac
  [ "$SECONDS" -lt "$DEADLINE" ] || { echo "still downloading after 30 min" >&2; exit 1; }
  sleep 2
done
curl -sf "$KIT/api/v1/curl/storage?limit=10" | jq '.items[] | .path'
```

**Step 3 — fetch & delete.** A delete through ANY of the paths removes the shared file, so every entry stops serving it (the others return `404` afterwards); the remaining index links may be left behind, dangling.

```bash
curl -sf "$KIT/api/v1/curl/storage/by-job/$JID/iso/ubuntu.iso" > /tmp/ubuntu.iso
curl -sX DELETE "$KIT/api/v1/curl/storage/by-job/$JID/iso/ubuntu.iso"
```

### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Against `httpbin.org/bearer` it returns `{"authenticated":true,"token":"…"}`.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/curl/request" \
  -H 'Content-Type: application/json' \
  -d '{
    "url":"https://api.github.com/user","method":"GET",
    "bearer_token":"ghp_xxxxxxxxxxxx","response":"json"
  }' | jq '{status_code, headers: .headers | {x_ratelimit_remaining: .["x-ratelimit-remaining"], x_ratelimit_reset: .["x-ratelimit-reset"]}, body}'
```

**HTTP Basic alternative** — swap the auth fields. Body `{ url, method, auth_user, auth_password, auth_method: 'basic' }`. Against `httpbin.org/basic-auth/alex/secret` it returns `{"authenticated":true,"user":"alex"}`.

### 8. REST→GET bridge for chat-channel embedding

**Goal:** drop a one-liner URL into Slack so a teammate can re-trigger a build by clicking. URL pattern + alias + IP gate.

**Step 1 — compose** (no kit call — URL pattern). The GET bridge carries the full request in the query string — `url`, `method`, body via `data`/`json`/`data_base64`, and repeatable `header=Name: Value` (a body auto-upgrades the method to POST). So a build-trigger that needs a JSON body + auth header is still one clickable link.

```
# GET-bridge URL — a real POST (json body + bearer header) as a single clickable link:
https://${P}-${C}-curl-1.${N}.containers.hoody.com/api/v1/curl/request?url=<url-encoded-build-trigger>&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ
```

**Step 2 — wrap with an alias** so the public URL hides `containerId`. The alias target must be the complete query from step 1, `json` and `header` included: the bridge reads the body and headers only from the query string, so an alias carrying just `url` and `method` sends an empty, unauthenticated POST. The token then lives in the alias configuration, so gate the alias (step 3).

```bash
ENCODED='/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ'
curl -sX POST "https://api.hoody.com/api/v1/proxy/aliases" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg cid "$C" --arg p "$ENCODED" \
    '{container_id:$cid, alias:"rebuild-main", program:"curl", target_path:$p, allow_path_override:false}')"
```

**Step 3 — gate it** — only your office IPs can fire it (uses `PUT /api/v1/containers/{id}/proxy/permissions/groups/{groupName}/ip`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Finished job records, response bodies included, are deleted by an hourly sweep once they are older than the retention period (7 days by default; the deployment can change it). Saved downloads are kept.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`). The listing is ordered by creation time, newest first, and runs do not necessarily complete in that order; a schedule firing every 15 minutes also leaves many runs with the same name. So read every page and select by completion time: here, the completed run with the latest `completed_at` at or before 18 hours ago. `completed_at` carries fractional seconds, which jq's `fromdate` rejects; strip them first.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
CUTOFF=$(( $(date +%s) - 18 * 3600 )); : > /tmp/curl-runs.txt; page=1
while :; do
  body=$(curl -sf "$KIT/api/v1/curl/jobs?page=$page&limit=200") || exit 1
  # One "<completed epoch> <id>" line per completed prod-health run on this page.
  jq -r '.items[] | select(.status=="completed" and .name=="prod-health" and .completed_at != null)
      | "\(.completed_at | sub("\\.[0-9]+Z$"; "Z") | fromdate) \(.id)"' <<<"$body" >> /tmp/curl-runs.txt || exit 1
  [ $((page * 200)) -lt "$(jq -r .meta.total <<<"$body")" ] || break
  page=$((page + 1))
done
JID=$(awk -v c="$CUTOFF" '$1 <= c' /tmp/curl-runs.txt | sort -n | tail -1 | cut -d' ' -f2)
[ -n "$JID" ] || { echo "no completed prod-health run 18 h ago" >&2; exit 1; }
```

**Step 2 — fetch.** `GET /api/v1/curl/jobs/{id}/result` returns just the upstream body; `GET /api/v1/curl/jobs/{id}` returns the full record (timing, headers, original request).

```bash
curl -sf "$KIT/api/v1/curl/jobs/$JID/result"   # body only
curl -sf "$KIT/api/v1/curl/jobs/$JID" | jq '.' # full record
```

### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path. The listing is newest first, so the old entries are on the last pages: collect every page before deleting anything, because each delete shifts the pages after it.

```bash
KIT="https://${P}-${C}-curl-1.${N}.containers.hoody.com"
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%d)
: > /tmp/curl-purge.txt; page=1
while :; do
  body=$(curl -sf "$KIT/api/v1/curl/storage?page=$page&limit=200") || exit 1
  jq -r --arg c "$CUTOFF" '.items[] | select(.path | startswith("by-date/")) | select((.path | split("/")[1]) < $c) | .path' \
    <<<"$body" >> /tmp/curl-purge.txt
  [ $((page * 200)) -lt "$(jq -r .meta.total <<<"$body")" ] || break
  page=$((page + 1))
done
while IFS= read -r P; do
  curl -sX DELETE "$KIT/api/v1/curl/storage/$P"
done < /tmp/curl-purge.txt
# Deleting one mirror path removes the shared file; the other 2 paths stop serving it.
```

## Reference

### `channel` (1) — WebSocket event endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/curl/channel` | Execute cURL requests over a WebSocket channel | `?max_concurrent` `?max_concurrent_streams` `?max_pool` `?max_queue` `?max_frame_bytes` `?max_request_bytes` `?chunk_bytes` `?stream_timeout_secs` `?idle_timeout_secs` `?max_outbound_messages` `?binary` |

**Param notes:**

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
- `binary` — `true` negotiates binary frames: response bodies arrive as binary BODY frames and request.start may set binary_body (see x-async-api x-binary-frames). Default false

### `curl` (1) — cURL execution endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/curl/request` | Execute HTTP request with full cURL capabilities | `body*:curl_CurlRequest` |

### `jobs` (6) — Job management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/jobs/{id}` | Cancel a pending or running job, or delete a finished one |  |
| `GET /api/v1/curl/ws` | Subscribe to job events over WebSocket | `?job_id` |
| `GET /api/v1/curl/jobs/{id}` | Get detailed job information |  |
| `GET /api/v1/curl/jobs/{id}/result` | Get job response body |  |
| `GET /api/v1/curl/jobs` | List all async jobs | `?page` `?limit` |
| `GET /api/v1/curl/sse` | Subscribe to job events over Server-Sent Events | `?job_id` |

**Param notes:**

- `job_id` — Optional job ID filter
- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

### `kit` (2) — Operational endpoints (health and metrics)

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/curl/health` | Service health check |  |
| `GET /metrics` | Prometheus metrics |  |

### `schedules` (5) — Schedule management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/curl/schedule` | Create a recurring scheduled job | `body*:curl_CreateScheduleRequest` |
| `DELETE /api/v1/curl/schedule/{id}` | Delete a schedule |  |
| `GET /api/v1/curl/schedule/{id}` | Get schedule details |  |
| `GET /api/v1/curl/schedule` | List all scheduled jobs | `?page` `?limit` |
| `PATCH /api/v1/curl/schedule/{id}` | Update a schedule's cron expression, request or enabled state | `body*:curl_UpdateScheduleRequest` |

**Param notes:**

- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)

### `sessions` (4) — Session management endpoints

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/curl/sessions/{id}` | Delete a session |  |
| `GET /api/v1/curl/sessions/{id}` | Get session details |  |
| `GET /api/v1/curl/sessions` | List all cookie sessions | `?page` `?limit` |
| `GET /api/v1/curl/sessions/{id}/cookies` | Get session cookies only |  |

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

- `path` — Relative path to file in storage _(on `DELETE /api/v1/curl/storage/{path}`)_
- `path` — Relative path to file in storage (supports nested paths) _(on `GET /api/v1/curl/storage/{path}`)_
- `page` — 1-based page number (optional)
- `limit` — Items per page (optional; current handler returns all items when omitted)


### Body schemas

- `curl_CurlRequest` — `{ auth_method: string|null, auth_password: string|null, auth_user: string|null, bearer_token: string|null, cacert: string|null, cert: string|null, cert_type: string|null, compressed: bool|null, connect_timeout: int|null, cookie: string|null, data: string|null, follow_redirects: bool|null, form: { [key: string]: string }|null, headers: { [key: string]: string }|null, insecure: bool|null, job_name: string|null, json: any, keepalive: bool|null, keepalive_time: int|null, key: string|null, max_filesize: int|null, max_redirects: int|null, method: string|null, mode: null | curl_ExecutionMode, proxy: string|null, proxy_password: string|null, proxy_user: string|null, range: string|null, referer: string|null, response: null | curl_ResponseMode, retry_count: int|null, retry_delay: int|null, save: bool|null, save_path: string|null, schedule: string|null, session_id: string|null, speed_limit: int|null, speed_time: int|null, tcp_nodelay: bool|null, timeout: int|null, url*: string, user_agent: string|null }`
  - cURL request parameters A JSON body carrying any field not listed here is rejected with `400`. This protects against silently sending a removed or not-yet-released field that would otherwise slip past validation unnoticed.
  - `save_path` — Relative path under this job's download directory (downloads/by-job/{job_id}). Must not be absolute or contain `..`.
- `curl_CreateScheduleRequest` — `{ cron*: string, request*: curl_CurlRequest }`
- `curl_UpdateScheduleRequest` — `{ cron: string|null, enabled: bool|null, request: null | curl_CurlRequest }`
  - Partial update of a schedule. Every field is optional, at least one is required; absent fields keep their current value.
- `curl_ExecutionMode` — `"sync" | "async"`
- `curl_ResponseMode` — `"transparent" | "json"`
