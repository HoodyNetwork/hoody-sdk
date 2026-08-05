> _**CLI skill · `curl` namespace** · ~5,770 tokens · hoody-sdk v1.0.0-beta.11_

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
- `hoody curl schedules *` 404s if disabled.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Convert any REST call into a single GET-able URL (`hoody curl get-url`)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }`. Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; standard OR URL-safe base64, padding optional; takes precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Only `form`/multipart and binary `--data-binary @file` uploads remain POST-only.

Live examples (verified — replace the kit URL with your container's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `hoody proxy create` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

The CLI command and the SDK accessor `hoody curl get-url` **execute** the request and return the envelope; they do NOT just compose a URL string. To compose a URL without firing it, build it client-side or use `hoody proxy create` to get a stable prefix.

For the imperative full-cURL surface (binary uploads, `--data-binary @file`, multipart, follow-redirects, custom TLS, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`hoody curl exec` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `hoody curl exec` with `mode:"async"` → `job_id`.
2. Poll `hoody curl jobs get` or subscribe `hoody curl jobs events` filtered by `job_id`.
3. `hoody curl jobs result`; `hoody curl jobs cancel` aborts.

### 4. Cookie-jar session

1. `hoody curl exec` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `hoody curl sessions cookies` / `hoody curl sessions delete`.

### 5. Save download

1. `hoody curl exec` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `hoody curl storage list`/`hoody curl storage get`/`hoody curl storage delete` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `hoody curl schedules create` with `{cron,request}` → `schedule_id`.
2. `hoody curl schedules list`/`hoody curl schedules get`/`hoody curl schedules toggle` (`{"enabled":bool}`)/`hoody curl schedules delete`.
3. Each firing creates a job; inspect via `hoody curl jobs list`.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **Each saved download is mirrored under three indexes** for navigation: `by-job/{job_id}/<save_path>`, `by-domain/<host>/<job_id>`, `by-date/<YYYY-MM-DD>/<job_id>`. `hoody curl storage list` returns one item per index path; the bytes are the same file (live-verified — `storage.list?limit=5` after one save returns 3 items pointing to the same content).
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `hoody curl schedules *` 404s if disabled.
- `hoody curl schedules toggle` needs explicit boolean `enabled`; else 400.
- **`schedules.create.cron` is 6-field (with seconds), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- `hoody curl jobs events` is WebSocket `/api/v1/curl/ws`; filter by `job_id`.

## Common errors

- `408 timeout` — raise timeout or use async (upstream libcurl timeouts surface as `504` instead).
- `410 cancelled`.
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Every step in every example was live-tested against a real `curl-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

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
# `hoody curl get-url` fires the request (it does not print a clickable URL) and is the
# only CLI form that can send headers: `curl exec` registers NO --headers/--form flag.
hoody --container "$C" curl get-url \
  --url 'https://my-api/events' --method POST \
  --json '{"event":"X"}' \
  --header 'Content-Type: application/json'   # --header is repeatable, `Name: Value`
```
**Step 2 — hide the `containerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```bash
hoody proxy create --container-id "$C" --alias webhook-bridge \
  --program curl --target-path /api/v1/curl/request --allow-path-override
```
### 2. Multi-step OAuth login — cookie jar reuse across hits

**Goal:** authenticate against an API that uses a CSRF token + session cookie, then issue an authorized call. Pick a unique `session_id` per flow — once deleted, the same id returns `404 Session not found: <id> (tombstoned)` until the tombstone is garbage-collected (~24 h), after which the id is reusable again.

**Step 1 — fetch CSRF.** The Set-Cookie / response cookies are stored in the kit's jar.

```bash
SID="oauth-$(date +%s)"
TOKEN=$(hoody --container "$C" curl exec \
  --url https://api.example.com/csrf --method GET --response json \
  --session-id "$SID" -o json | jq -r '.body | fromjson | .csrf_token')   # --response json is REQUIRED for a .body envelope
```
**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar.

```bash
hoody --container "$C" curl get-url \
  --url https://api.example.com/login --method POST \
  --data "username=alex&password=secret&csrf=$TOKEN" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --session-id "$SID"
```
**Step 3 — authorized call.** Stored cookie is auto-attached.

```bash
hoody --container "$C" curl exec --url https://api.example.com/me \
  --method GET --response json --session-id "$SID" -o json | jq -r .body
hoody --container "$C" curl sessions cookies "$SID"
hoody --container "$C" curl sessions delete "$SID"
```
### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```bash
JOBS=()
for URL in https://httpbin.org/delay/1 https://httpbin.org/delay/2 https://httpbin.org/get; do
  JID=$(hoody --container "$C" curl exec --url "$URL" --method GET --mode async -o json | jq -r .job_id)
  JOBS+=("$JID")
done
```
**Step 2 — poll until all complete.** Live-verified — 3 httpbin jobs reached `completed/200` within ~4 s.

```bash
while :; do
  done=true
  for JID in "${JOBS[@]}"; do
    S=$(hoody --container "$C" curl jobs get "$JID" -o json | jq -r .status)
    [ "$S" = "completed" ] || done=false
  done
  $done && break; sleep 1
done
```
**Step 3 — collect bodies.** `hoody curl jobs result` returns just the upstream body.

```bash
for JID in "${JOBS[@]}"; do
  hoody --container "$C" curl jobs result "$JID" > "/tmp/$JID.json"
done
```
### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Status flips from `running` to `cancelled`, and the cancelled job's `error` field is set to `Cancelled`.

```bash
JID=$(hoody --container "$C" curl exec --url https://httpbin.org/delay/30 \
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
**Step 2 — audit failures.**

```bash
hoody --container "$C" curl jobs list --limit 200 -o json \
  | jq '.items[] | select(.status=="failed") | select(.name=="prod-health")'
```
**Step 3 — pause during deploy** (toggle `enabled: false` and back, or `delete` to drop entirely):

```bash
hoody --container "$C" curl schedules toggle "$SID" --body '{"enabled":false}'
# Resume: --body '{"enabled":true}'. Drop entirely:
hoody --container "$C" curl schedules delete "$SID"
```
### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```bash
JID=$(hoody --container "$C" curl exec --url https://example.com/big.iso \
  --method GET --mode async --save --save-path iso/ubuntu.iso --timeout 600 \
  -o json | jq -r .job_id)
```
**Step 2 — wait + inspect storage.** Three index entries point at the SAME bytes (`by-job/`, `by-domain/`, `by-date/`).

```bash
while [ "$(hoody --container "$C" curl jobs get "$JID" -o json | jq -r .status)" != "completed" ]; do sleep 2; done
hoody --container "$C" curl storage list --limit 10
```
**Step 3 — fetch & delete.** Single delete on ANY of the three mirror paths removes all three (live-verified — others return `404` afterwards).

```bash
hoody --container "$C" curl storage get "by-job/$JID/iso/ubuntu.iso" > /tmp/ubuntu.iso
hoody --container "$C" curl storage delete "by-job/$JID/iso/ubuntu.iso"
```
### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Live-verified against `httpbin.org/bearer` (`{"authenticated":true,"token":"…"}`).

```bash
hoody --container "$C" curl exec --url https://api.github.com/user --method GET \
  --bearer-token ghp_xxxxxxxxxxxx --response json -o json \
  | jq '{status_code, headers, body}'
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
hoody proxy create --container-id "$C" --alias rebuild-main --no-allow-path-override \
  --program curl --target-path '/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST'
```
**Step 3 — gate it** — only your office IPs can fire it (uses `hoody containers proxy groups ip set`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Job records are NOT auto-expired by the kit — they persist until the container's storage is cleared.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`):

```bash
JID=$(hoody --container "$C" curl jobs list --limit 200 -o json \
  | jq -r '.items[] | select(.status=="completed" and .name=="prod-health") | .id' | head -1)
```
**Step 2 — fetch.** `hoody curl jobs result` returns just the upstream body; `hoody curl jobs get` returns the full record (timing, headers, original request).

```bash
hoody --container "$C" curl jobs result "$JID"
hoody --container "$C" curl jobs get "$JID"
```
### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path.

```bash
CUTOFF=$(date -u -d '30 days ago' +%Y-%m-%d)
hoody --container "$C" curl storage list --limit 200 -o json \
  | jq -r --arg c "$CUTOFF" '.items[] | select(.path | startswith("by-date/")) | select((.path | split("/")[1]) < $c) | .path' \
  | while IFS= read -r P; do
      hoody --container "$C" curl storage delete "$P"
    done
```

## Reference

### `hoody curl` (21) — cURL jobs and schedules

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody curl exec` |  | action | Execute HTTP request with full cURL capabilities | `curl.execute` | `hoody --proxy <proxy> curl exec --auth-method <auth_method> --auth-password <auth_password> --auth-user <auth_user> --bearer-token <bearer_token> --cacert <cacert> --cert <cert> --cert-type <cert_type> --compressed --connect-timeout 10 --cookie <cookie> --data <data> --follow-redirects --insecure --job-name <job_name> --json '{}' --keepalive --keepalive-time 10 --key <key> --max-filesize 100 --max-redirects 10 --method GET --mode sync --proxy-password <proxy_password> --proxy-user <proxy_user> --range <range> --referer <referer> --response transparent --retry-count 100 --retry-delay 10 --save --save-path /home/user/file.txt --schedule "0 * * * *" --session-id abc-123 --speed-limit 10 --speed-time 10 --tcp-nodelay --timeout 10 --url https://example.com --user-agent "Mozilla/5.0"` |
| `hoody curl get-url` |  | action | Execute simple HTTP request via query parameters | `curl.executeCurlRequestGet` | `hoody curl get-url --url https://example.com --method GET --response <response> --mode stable --session-id abc-123 --follow-redirects --timeout 10 --user-agent "Mozilla/5.0" --referer <referer> --bearer-token <bearer_token> --save --save-path /home/user/file.txt --insecure --compressed --job-name <job_name> --data <data> --json '{}' --header <header> --data-base64 <data_base64>` |
| `hoody curl health` |  | read | Service health check | `curl.health.check` | `hoody curl health` |
| `hoody curl jobs cancel` |  | destructive | Cancel a pending or running job | `curl.jobs.cancel` | `hoody curl jobs cancel abc-123` |
| `hoody curl jobs events` |  | read | Subscribe to job events over WebSocket | `curl.events.streamWs` | `hoody curl jobs events --job-id abc-123` |
| `hoody curl jobs get` |  | read | Get detailed job information | `curl.jobs.get` | `hoody curl jobs get abc-123` |
| `hoody curl jobs list` |  | read | List all async jobs | `curl.jobs.listIterator` | `hoody curl jobs list --page 10 --limit 10` |
| `hoody curl jobs result` |  | read | Get job response body | `curl.jobs.getResult` | `hoody curl jobs result abc-123` |
| `hoody curl metrics` |  | read | Prometheus metrics | `curl.ops.metrics` | `hoody curl metrics` |
| `hoody curl schedules create` | new, add | write | Create a recurring scheduled job | `curl.schedules.create` | `hoody curl schedules create --cron "0 * * * *" --request-auth-method <request.auth_method> --request-auth-password <request.auth_password> --request-auth-user <request.auth_user> --request-bearer-token <request.bearer_token> --request-cacert <request.cacert> --request-cert <request.cert> --request-cert-type <request.cert_type> --request-compressed --request-connect-timeout <request.connect_timeout> --request-cookie <request.cookie> --request-data <request.data> --request-follow-redirects --request-form <request.form> --request-headers <request.headers> --request-insecure --request-job-name <request.job_name> --request-json <request.json> --request-keepalive --request-keepalive-time <request.keepalive_time> --request-key <request.key> --request-max-filesize <request.max_filesize> --request-max-redirects <request.max_redirects> --request-method <request.method> --request-mode <request.mode> --request-proxy <request.proxy> --request-proxy-password <request.proxy_password> --request-proxy-user <request.proxy_user> --request-range <request.range> --request-referer <request.referer> --request-response <request.response> --request-retry-count 100 --request-retry-delay <request.retry_delay> --request-save --request-save-path /home/user/file.txt --request-schedule <request.schedule> --request-session-id abc-123 --request-speed-limit <request.speed_limit> --request-speed-time <request.speed_time> --request-tcp-nodelay --request-timeout <request.timeout> --request-url <request.url> --request-user-agent <request.user_agent>` |
| `hoody curl schedules delete` |  | destructive | Delete a schedule | `curl.schedules.delete` | `hoody curl schedules delete abc-123` |
| `hoody curl schedules get` |  | read | Get schedule details | `curl.schedules.get` | `hoody curl schedules get abc-123` |
| `hoody curl schedules list` |  | read | List all scheduled jobs | `curl.schedules.listIterator` | `hoody curl schedules list --page 10 --limit 10` |
| `hoody curl schedules toggle` |  | action | Enable or disable a schedule | `curl.schedules.toggle` | `hoody curl schedules toggle abc-123 --body '{}'` |
| `hoody curl sessions cookies` |  | read | Get session cookies only | `curl.sessions.getCookies` | `hoody curl sessions cookies abc-123` |
| `hoody curl sessions delete` |  | destructive | Delete a session | `curl.sessions.delete` | `hoody curl sessions delete abc-123` |
| `hoody curl sessions get` |  | read | Get session details | `curl.sessions.get` | `hoody curl sessions get abc-123` |
| `hoody curl sessions list` |  | read | List all cookie sessions | `curl.sessions.listIterator` | `hoody curl sessions list --page 10 --limit 10` |
| `hoody curl storage delete` |  | destructive | Delete a saved file | `curl.storage.deleteFile` | `hoody curl storage delete /home/user/file.txt` |
| `hoody curl storage get` |  | read | Download a saved file | `curl.storage.getFile` | `hoody curl storage get /home/user/file.txt` |
| `hoody curl storage list` |  | read | List all saved downloads | `curl.storage.listIterator` | `hoody curl storage list --page 10 --limit 10` |

