> _**CLI skill · `curl` namespace** · ~6,692 tokens · hoody-sdk v1.0.0-beta.15_

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
- `hoody curl schedules *` 404s if disabled.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

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

Combine with `hoody proxy aliases create --program curl` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

`hoody curl run` **executes** the request and prints the response (a text body as-is, a JSON body pretty-printed; with `--response json` that is the `{status_code, headers, body}` envelope); it does NOT just compose a URL string. The CLI has no command for the GET route: `curl run` sends the POST form. When the deployment enables the kit's response cache (it is off by default), an eligible request can be answered from the cache instead. To compose a URL without firing it, build it client-side or use `hoody proxy aliases create --program curl --target-path /api/v1/curl/request` to get a stable prefix.

For the imperative full-cURL surface (a headers map, `form` fields sent URL-encoded, cookies, auth, follow-redirects, `insecure`, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`hoody curl run` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `hoody curl run` with `mode:"async"` → `job_id`.
2. Poll `hoody curl jobs get` or subscribe `hoody curl jobs stream` (SSE) filtered by `job_id` (`hoody curl jobs stream --job-id <id>`; the CLI has no WebSocket form).
3. `hoody curl jobs result get`; `hoody curl jobs cancel` aborts.

### 4. Cookie-jar session

1. `hoody curl run` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `hoody curl sessions cookies list` / `hoody curl sessions delete`.

### 5. Save download

1. `hoody curl run` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `hoody curl storage list`/`hoody curl storage get`/`hoody curl storage delete` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `hoody curl schedules create` with `{cron,request}` → `schedule_id`.
2. `hoody curl schedules list`/`hoody curl schedules get`/`hoody curl schedules update` (`{"enabled":bool}` pauses or resumes)/`hoody curl schedules delete`.
3. Each admitted occurrence creates a job; inspect via `hoody curl jobs list`. An occurrence is skipped, with no job, while the previous run is still in flight or when the job queue rejects it.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **Save downloads with `--out-file`.** `curl storage get`, `curl jobs result get` and `curl run` write the body as received, never decoded: `--out-file <path>` saves it byte for byte, and without it the bytes go to stdout. A terminal refuses binary output (`--out-file -` prints it anyway), and `-o json` prints `{ saved_to, bytes, content_type }` with `--out-file` and is refused without it.
- **A saved download is stored under `by-job/{job_id}/<save_path>`, with best-effort index links** `by-date/<YYYY-MM-DD>/<job_id>` and `by-domain/<host>/<job_id>`. A URL whose host is an IP literal gets no `by-domain` link, and either link is skipped silently if it cannot be created, so expect one to three entries. `hoody curl storage list` returns one item per path; the bytes are the same file.
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `hoody curl schedules *` 404s if disabled.
- Pausing or resuming through `hoody curl schedules update` needs an explicit boolean `enabled`; else 400.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

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
# `hoody curl run` fires the request (it does not print a clickable URL). `--header NAME=VALUE`
# sets a request header and repeats once per header (the value may itself contain `=`);
# --json already sets Content-Type, and --bearer-token adds the Authorization header.
hoody --container "$C" curl run \
  --url 'https://my-api/events' --method POST \
  --json '{"event":"X"}' \
  --header 'X-Request-Id=evt-1' \
  --bearer-token "$API_TOKEN"
```

**Step 2 — hide the `containerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```bash
hoody proxy aliases create --container-id "$C" --alias webhook-bridge \
  --program curl --target-path /api/v1/curl/request --allow-path-override
```

### 2. Multi-step OAuth login — cookie jar reuse across hits

**Goal:** authenticate against an API that uses a CSRF token + session cookie, then issue an authorized call. Pick a unique `session_id` per flow — once deleted, the same id returns `404 Session not found: <id> (tombstoned)` until the tombstone is garbage-collected (~24 h), after which the id is reusable again.

**Step 1 — fetch CSRF.** The Set-Cookie / response cookies are stored in the kit's jar.

```bash
SID="oauth-$(date +%s)"
TOKEN=$(hoody --container "$C" curl run \
  --url https://api.example.com/csrf --method GET --response json \
  --session-id "$SID" -o json | jq -r '.body | fromjson | .csrf_token')   # --response json is REQUIRED for a .body envelope
```

**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar. Encode the token: `data` is sent as written, so a token holding `+`, `&` or `=` would be altered. The `form` field encodes each value and sets the form content type.

```bash
# --form NAME=VALUE repeats once per field and sends the body's `form` map; --session-id keeps the cookie jar.
hoody --container "$C" curl run \
  --url 'https://api.example.com/login' --method POST \
  --form username=alex --form password=secret --form csrf="$TOKEN" \
  --session-id "$SID"
```

**Step 3 — authorized call.** Stored cookie is auto-attached.

```bash
hoody --container "$C" curl run --url https://api.example.com/me \
  --method GET --response json --session-id "$SID" -o json | jq -r .body
hoody --container "$C" curl sessions cookies list "$SID"
hoody --container "$C" curl sessions delete "$SID" -y
```

### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```bash
JOBS=()
for URL in https://httpbin.org/delay/1 https://httpbin.org/delay/2 https://httpbin.org/get; do
  JID=$(hoody --container "$C" curl run --url "$URL" --method GET --mode async -o json | jq -r .job_id)
  JOBS+=("$JID")
done
```

**Step 2 — poll until every job is terminal.** A job ends `completed`, `failed` or `cancelled`; stop on the last two, on a failed status request, and at a deadline. The deadline is checked between polls, so each status request is also capped (10 s here) to keep one stalled request from outliving it.

```bash
DEADLINE=$((SECONDS + 300))
while :; do
  pending=0
  for JID in "${JOBS[@]}"; do
    R=$(timeout 10 hoody --container "$C" curl jobs get "$JID" -o json) || { echo "status check failed: $JID" >&2; exit 1; }
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

**Step 3 — collect bodies.** `hoody curl jobs result get` returns just the upstream body.

```bash
# --out-file saves each body as received: JSON, text or binary.
for JID in "${JOBS[@]}"; do
  hoody --container "$C" curl jobs result get "$JID" --out-file "/tmp/$JID.json"
done
```

### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Status flips from `running` to `cancelled`, and the cancelled job's `error` field is set to `Cancelled`.

```bash
JID=$(hoody --container "$C" curl run --url https://httpbin.org/delay/30 \
  --method GET --mode async --timeout 60 -o json | jq -r .job_id)
sleep 1
hoody --container "$C" curl jobs cancel "$JID"
sleep 1
hoody --container "$C" curl jobs get "$JID" -o json | jq '{status, error}'
```

### 5. Schedule + drift detection — fire every 15 min, audit history

**Goal:** ping a health endpoint every 15 min, fast-find failures. ⚠ Scheduler uses **6-field** cron syntax (with seconds) — `*/15 * * * *` (5-field) is rejected as `Invalid cron expression`.

**Step 1 — create.**

```bash
SID=$(hoody --container "$C" curl schedules create \
  --cron '0 */15 * * * *' \
  --request-url 'https://prod.example.com/health' \
  --request-method GET \
  --request-job-name prod-health \
  -o json | jq -r .schedule_id)
```

**Step 2 — audit failures.** A job is `failed` when the request could not be completed (DNS, connect, timeout) or when processing after the response failed, such as saving a download. An upstream HTTP error status alone does not fail the job: an upstream that answers `500` still yields a `completed` job, so also read the `response.status_code` of completed runs (from `hoody curl jobs get`; the listing does not carry it).

```bash
hoody --container "$C" curl jobs list --limit 200 -o json \
  | jq -r '.items[] | select(.name=="prod-health") | "\(.id) \(.status)"' \
  | while read -r JID ST; do
      if [ "$ST" = failed ]; then echo "$JID failed"; continue; fi
      [ "$ST" = completed ] || continue
      CODE=$(hoody --container "$C" curl jobs get "$JID" -o json | jq -r '.response.status_code // empty')
      [ -n "$CODE" ] && [ "$CODE" -lt 400 ] || echo "$JID HTTP ${CODE:-?}"
    done
```

**Step 3 — pause during deploy** (set `enabled: false` and back, or `delete` to drop entirely):

```bash
hoody --container "$C" curl schedules update "$SID" --no-enabled
# Resume: update "$SID" --enabled. Drop entirely:
hoody --container "$C" curl schedules delete "$SID" -y
```

### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```bash
JID=$(hoody --container "$C" curl run --url https://example.com/big.iso \
  --method GET --mode async --save --save-path iso/ubuntu.iso --timeout 600 \
  -o json | jq -r .job_id)
```

**Step 2 — wait + inspect storage.** Stop on `failed` or `cancelled` and at a deadline instead of waiting for `completed` forever; the deadline is checked between polls, and each status request is capped at 10 s. Up to three entries point at the SAME bytes: `by-job/`, plus the best-effort `by-date/` and `by-domain/` links (no `by-domain/` for an IP-literal host).

```bash
DEADLINE=$((SECONDS + 1800))
while :; do
  S=$(timeout 10 hoody --container "$C" curl jobs get "$JID" -o json | jq -r .status) && [ -n "$S" ] || { echo "status check failed" >&2; exit 1; }
  case "$S" in completed) break ;; failed|cancelled) echo "job $S" >&2; exit 1 ;; esac
  [ "$SECONDS" -lt "$DEADLINE" ] || { echo "still downloading after 30 min" >&2; exit 1; }
  sleep 2
done
hoody --container "$C" curl storage list --limit 10
```

**Step 3 — fetch & delete.** A delete through ANY of the paths removes the shared file, so every entry stops serving it (the others return `404` afterwards); the remaining index links may be left behind, dangling.

```bash
hoody --container "$C" curl storage get "by-job/$JID/iso/ubuntu.iso" --out-file /tmp/ubuntu.iso
hoody --container "$C" curl storage delete "by-job/$JID/iso/ubuntu.iso" -y
```

### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Against `httpbin.org/bearer` it returns `{"authenticated":true,"token":"…"}`.

```bash
hoody --container "$C" curl run --url https://api.github.com/user --method GET \
  --bearer-token ghp_xxxxxxxxxxxx --response json -o json \
  | jq '{status_code, headers, body}'
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
hoody proxy aliases create --container-id "$C" --alias rebuild-main --no-allow-path-override \
  --program curl --target-path '/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ'
```

**Step 3 — gate it** — only your office IPs can fire it (uses `hoody containers proxy groups ip set`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Finished job records, response bodies included, are deleted by an hourly sweep once they are older than the retention period (7 days by default; the deployment can change it). Saved downloads are kept.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`). The listing is ordered by creation time, newest first, and runs do not necessarily complete in that order; a schedule firing every 15 minutes also leaves many runs with the same name. So read every page and select by completion time: here, the completed run with the latest `completed_at` at or before 18 hours ago. `completed_at` carries fractional seconds, which jq's `fromdate` rejects; strip them first.

```bash
CUTOFF=$(( $(date +%s) - 18 * 3600 )); : > /tmp/curl-runs.txt; page=1
while :; do
  body=$(hoody --container "$C" curl jobs list --page "$page" --limit 200 -o json) || exit 1
  # One "<completed epoch> <id>" line per completed prod-health run on this page.
  jq -r '.items[] | select(.status=="completed" and .name=="prod-health" and .completed_at != null)
      | "\(.completed_at | sub("\\.[0-9]+Z$"; "Z") | fromdate) \(.id)"' <<<"$body" >> /tmp/curl-runs.txt || exit 1
  [ $((page * 200)) -lt "$(jq -r .meta.total <<<"$body")" ] || break
  page=$((page + 1))
done
JID=$(awk -v c="$CUTOFF" '$1 <= c' /tmp/curl-runs.txt | sort -n | tail -1 | cut -d' ' -f2)
[ -n "$JID" ] || { echo "no completed prod-health run 18 h ago" >&2; exit 1; }
```

**Step 2 — fetch.** `hoody curl jobs result get` returns just the upstream body; `hoody curl jobs get` returns the full record (timing, headers, original request).

```bash
hoody --container "$C" curl jobs result get "$JID"
hoody --container "$C" curl jobs get "$JID"
```

### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path. The listing is newest first, so the old entries are on the last pages: collect every page before deleting anything, because each delete shifts the pages after it.

```bash
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%d)
: > /tmp/curl-purge.txt; page=1
while :; do
  body=$(hoody --container "$C" curl storage list --page "$page" --limit 200 -o json) || exit 1
  jq -r --arg c "$CUTOFF" '.items[] | select(.path | startswith("by-date/")) | select((.path | split("/")[1]) < $c) | .path' \
    <<<"$body" >> /tmp/curl-purge.txt
  [ $((page * 200)) -lt "$(jq -r .meta.total <<<"$body")" ] || break
  page=$((page + 1))
done
while IFS= read -r P; do
  hoody --container "$C" curl storage delete "$P" -y
done < /tmp/curl-purge.txt
```

## Reference

### `hoody curl` (21) — cURL jobs and schedules

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody curl health` |  | read | Service health check | `curl.kit.getHealth` | `hoody curl health` |
| `hoody curl jobs cancel` |  | destructive | Cancel a pending or running job; the record stays | `curl.jobs.cancel` | `hoody curl jobs cancel 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs delete` |  | destructive | Permanently delete a finished job's record and its saved downloads (a running job must be cancelled first) | `curl.jobs.delete` | `hoody curl jobs delete 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs get` |  | read | Get detailed job information | `curl.jobs.get` | `hoody curl jobs get 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs list` |  | read | List all async jobs | `curl.jobs.list` | `hoody curl jobs list --page 1 --limit 50` |
| `hoody curl jobs result get` |  | read | Get job response body | `curl.jobs.getResult` | `hoody curl jobs result get 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl jobs stream` |  | read | Stream job lifecycle events live | `curl.jobs.stream` | `hoody curl jobs stream --job-id 550e8400-e29b-41d4-a716-446655440000` |
| `hoody curl metrics` |  | read | Prometheus metrics | `curl.kit.getMetrics` | `hoody curl metrics` |
| `hoody curl run` |  | action | Execute HTTP request with full cURL capabilities | `curl.run` | `hoody curl run --compressed --connect-timeout 10 --url https://example.com` |
| `hoody curl schedules create` |  | write | Create a recurring scheduled job | `curl.schedules.create` | `hoody curl schedules create --cron '0 0 * * * *' --request-compressed --request-connect-timeout 10 --request-url https://example.com` |
| `hoody curl schedules delete` |  | destructive | Delete a schedule | `curl.schedules.delete` | `hoody curl schedules delete 770e8400-e29b-41d4-a716-446655440000 -y` |
| `hoody curl schedules get` |  | read | Get schedule details | `curl.schedules.get` | `hoody curl schedules get 770e8400-e29b-41d4-a716-446655440000` |
| `hoody curl schedules list` |  | read | List all scheduled jobs | `curl.schedules.list` | `hoody curl schedules list --page 1 --limit 50` |
| `hoody curl schedules update` |  | write | Change a schedule's cron expression, enabled state or request. Omitted fields keep their stored value; passing any request flag, such as --request-url, replaces the whole stored request | `curl.schedules.update` | `hoody curl schedules update 770e8400-e29b-41d4-a716-446655440000 --cron '0 */5 * * * *' --enabled` |
| `hoody curl sessions cookies list` |  | read | Get session cookies only | `curl.sessions.listCookies` | `hoody curl sessions cookies list user-session-123` |
| `hoody curl sessions delete` |  | destructive | Delete a session | `curl.sessions.delete` | `hoody curl sessions delete user-session-123 -y` |
| `hoody curl sessions get` |  | read | Get session details | `curl.sessions.get` | `hoody curl sessions get user-session-123` |
| `hoody curl sessions list` |  | read | List all cookie sessions | `curl.sessions.list` | `hoody curl sessions list --page 1 --limit 50` |
| `hoody curl storage delete` |  | destructive | Delete a saved file | `curl.storage.delete` | `hoody curl storage delete by-job/550e8400-e29b-41d4-a716-446655440000/report.pdf -y` |
| `hoody curl storage get` |  | read | Download a saved file | `curl.storage.get` | `hoody curl storage get by-job/550e8400-e29b-41d4-a716-446655440000/report.pdf` |
| `hoody curl storage list` |  | read | List all saved downloads | `curl.storage.list` | `hoody curl storage list --page 1 --limit 50` |

