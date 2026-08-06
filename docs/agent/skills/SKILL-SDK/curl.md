> _**SDK skill · `curl` namespace** · ~9,068 tokens · hoody-sdk v1.0.0-beta.12_

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
- `schedules.*` 404s if disabled.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Convert any REST call into a single GET-able URL (`executeCurlRequestGet`)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }`. Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; standard OR URL-safe base64, padding optional; takes precedence over `data`/`json`), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Only `form`/multipart and binary `--data-binary @file` uploads remain POST-only.

Live examples (verified — replace the kit URL with your container's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.containers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `proxyAliases.create({ program: 'curl' })` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

The CLI command and the SDK accessor `client.curl.executeCurlRequestGet` **execute** the request and return the envelope; they do NOT just compose a URL string. To compose a URL without firing it, build it client-side or use `proxyAliases.create({ program: 'curl', target_path: '/api/v1/curl/request' })` to get a stable prefix.

For the imperative full-cURL surface (binary uploads, `--data-binary @file`, multipart, follow-redirects, custom TLS, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`execute` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `execute` with `mode:"async"` → `job_id`.
2. Poll `jobs.get` or subscribe `events.streamWs` filtered by `job_id`.
3. `jobs.getResult`; `jobs.cancel` aborts.

### 4. Cookie-jar session

1. `execute` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `sessions.getCookies` / `sessions.delete`.

### 5. Save download

1. `execute` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `storage.list`/`getFile`/`deleteFile` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `schedules.create` with `{cron,request}` → `schedule_id`.
2. `schedules.list`/`schedules.get`/`schedules.toggle` (`{"enabled":bool}`)/`schedules.delete`.
3. Each firing creates a job; inspect via `jobs.list`.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- **Each saved download is mirrored under three indexes** for navigation: `by-job/{job_id}/<save_path>`, `by-domain/<host>/<job_id>`, `by-date/<YYYY-MM-DD>/<job_id>`. `storage.list` returns one item per index path; the bytes are the same file (live-verified — `storage.list?limit=5` after one save returns 3 items pointing to the same content).
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `schedules.*` 404s if disabled.
- `schedules.toggle` needs explicit boolean `enabled`; else 400.
- **`schedules.create.cron` is 6-field (with seconds), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- `events.streamWs` is WebSocket `/api/v1/curl/ws`; filter by `job_id`.

## Common errors

- `408 timeout` — raise timeout or use async (upstream libcurl timeouts surface as `504` instead).
- `410 cancelled`.
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Every step in every example was live-tested against a real `curl-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

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

```typescript
const r = await client.curl.execute({
  url: 'https://my-api/events',
  method: 'POST',
  data: JSON.stringify({ event: 'X' }),
  headers: { 'Content-Type': 'application/json' },
  response: 'json',   // POST defaults to TRANSPARENT — without this, r.data is the raw
});                   // upstream body and status_code is undefined
console.log(r.data!.status_code);
```
**Step 2 — hide the `containerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```typescript
await client.api.proxyAliases.create({
  container_id: C,
  alias: 'webhook-bridge',
  program: 'curl',
  target_path: '/api/v1/curl/request',
  allow_path_override: true,
});
```
### 2. Multi-step OAuth login — cookie jar reuse across hits

**Goal:** authenticate against an API that uses a CSRF token + session cookie, then issue an authorized call. Pick a unique `session_id` per flow — once deleted, the same id returns `404 Session not found: <id> (tombstoned)` until the tombstone is garbage-collected (~24 h), after which the id is reusable again.

**Step 1 — fetch CSRF.** The Set-Cookie / response cookies are stored in the kit's jar.

```typescript
const sid = `oauth-${Date.now()}`;
const csrf = await client.curl.execute({
  url: 'https://api.example.com/csrf', method: 'GET', session_id: sid, response: 'json',
});
const token = JSON.parse(csrf.data!.body).csrf_token;
```
**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar.

```typescript
await client.curl.execute({
  url: 'https://api.example.com/login', method: 'POST',
  data: `username=alex&password=secret&csrf=${token}`,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  session_id: sid,
});
```
**Step 3 — authorized call.** Stored cookie is auto-attached.

```typescript
const me = await client.curl.execute({
  url: 'https://api.example.com/me', method: 'GET', session_id: sid, response: 'json',
});
console.log(me.data!.body);
const cookies = await client.curl.sessions.getCookies(sid);
await client.curl.sessions.delete(sid);
```
### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```typescript
const urls = ['https://httpbin.org/delay/1', 'https://httpbin.org/delay/2', 'https://httpbin.org/get'];
const submits = await Promise.all(urls.map(url =>
  client.curl.execute({ url, method: 'GET', mode: 'async' })
));
const jobIds = submits.map(s => s.data!.job_id);
```
**Step 2 — poll until all complete.** Live-verified — 3 httpbin jobs reached `completed/200` within ~4 s.

```typescript
async function waitAll(ids: string[]) {
  while (true) {
    const states = await Promise.all(ids.map(id => client.curl.jobs.get(id)));
    if (states.every(s => s.data.status === 'completed')) return;
    await new Promise(r => setTimeout(r, 1000));
  }
}
await waitAll(jobIds);
```
**Step 3 — collect bodies.** `jobs.getResult` returns just the upstream body.

```typescript
const bodies = await Promise.all(jobIds.map(id => client.curl.jobs.getResult(id)));
```
### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Status flips from `running` to `cancelled`, and the cancelled job's `error` field is set to `Cancelled`.

```typescript
const sub = await client.curl.execute({
  url: 'https://httpbin.org/delay/30', method: 'GET', mode: 'async', timeout: 60,
});
const jid = sub.data!.job_id;
await new Promise(r => setTimeout(r, 1000));
await client.curl.jobs.cancel(jid);
await new Promise(r => setTimeout(r, 1000));
const status = await client.curl.jobs.get(jid);
// status.data.status === 'cancelled', status.data.error === 'Cancelled'
```
### 5. Schedule + drift detection — fire every 15 min, audit history

**Goal:** ping a health endpoint every 15 min, fast-find failures. ⚠ Scheduler uses **6-field** cron syntax (with seconds) — `*/15 * * * *` (5-field) is rejected as `Invalid cron expression`.

**Step 1 — create.**

```typescript
const r = await client.curl.schedules.create({
  cron: '0 */15 * * * *',
  request: { url: 'https://prod.example.com/health', method: 'GET', job_name: 'prod-health' },
});
const scheduleId = r.data!.schedule_id;
```
**Step 2 — audit failures.**

```typescript
const r = await client.curl.jobs.list({ limit: 200 });
const phFailures = r.data.items.filter(j => j.status === 'failed' && j.name === 'prod-health');
```
**Step 3 — pause during deploy** (toggle `enabled: false` and back, or `delete` to drop entirely):

```typescript
await client.curl.schedules.toggle(scheduleId, { enabled: false });
// Resume:    await client.curl.schedules.toggle(scheduleId, { enabled: true });
// Drop:      await client.curl.schedules.delete(scheduleId);
```
### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```typescript
const sub = await client.curl.execute({
  url: 'https://example.com/big.iso', method: 'GET', mode: 'async',
  save: true, save_path: 'iso/ubuntu.iso', timeout: 600,
});
const jid = sub.data!.job_id;
```
**Step 2 — wait + inspect storage.** Three index entries point at the SAME bytes (`by-job/`, `by-domain/`, `by-date/`).

```typescript
while ((await client.curl.jobs.get(jid)).data.status !== 'completed') {
  await new Promise(r => setTimeout(r, 2000));
}
const idx = await client.curl.storage.list({ limit: 10 });
```
**Step 3 — fetch & delete.** Single delete on ANY of the three mirror paths removes all three (live-verified — others return `404` afterwards).

```typescript
const bytes = await client.curl.storage.getFile(`by-job/${jid}/iso/ubuntu.iso`);
await client.curl.storage.deleteFile(`by-job/${jid}/iso/ubuntu.iso`);
```
### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Live-verified against `httpbin.org/bearer` (`{"authenticated":true,"token":"…"}`).

```typescript
const r = await client.curl.execute({
  url: 'https://api.github.com/user', method: 'GET',
  bearer_token: 'ghp_xxxxxxxxxxxx', response: 'json',
});
const remaining = r.data!.headers['x-ratelimit-remaining'];
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

```typescript
await client.api.proxyAliases.create({
  container_id: C,
  alias: 'rebuild-main',
  program: 'curl',
  target_path: '/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST',
  allow_path_override: false,
});
```
**Step 3 — gate it** — only your office IPs can fire it (uses `proxyPermissionsContainer.setIpGroup`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Job records are NOT auto-expired by the kit — they persist until the container's storage is cleared.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`):

```typescript
const list = await client.curl.jobs.list({ limit: 200 });
const jid = list.data.items.find(j => j.status === 'completed' && j.name === 'prod-health')!.id;
```
**Step 2 — fetch.** `jobs.getResult` returns just the upstream body; `jobs.get` returns the full record (timing, headers, original request).

```typescript
const body = await client.curl.jobs.getResult(jid);
const full = await client.curl.jobs.get(jid);
```
### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path.

```typescript
const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
const r = await client.curl.storage.list({ limit: 200 });
const old = r.data.items.filter(i => i.path.startsWith('by-date/') && i.path.split('/')[1] < cutoff);
await Promise.all(old.map(i => client.curl.storage.deleteFile(i.path)));
```

## Reference

**Accessor:** `client.curl`  |  **Import:** `import * as curl from 'hoody-sdk/curl'`

### `client.curl` (2) — cURL execution endpoints

#### `execute` — Execute HTTP request with full cURL capabilities

```typescript
client.curl.execute(data: curl_CurlRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `curl_CurlRequest` | body | Yes |  |

**Returns:** `curl_JsonResponse`  |  **HTTP:** `POST /api/v1/curl/request`
**CLI:** `hoody curl exec`

---

#### `executeCurlRequestGet` — Execute simple HTTP request via query parameters

```typescript
client.curl.executeCurlRequestGet(url: string, method?: string, response?: string, mode?: string, session_id?: string, follow_redirects?: boolean, timeout?: integer, user_agent?: string, referer?: string, bearer_token?: string, save?: boolean, save_path?: string, insecure?: boolean, compressed?: boolean, job_name?: string, data?: string, json?: string, header?: array, data_base64?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `url` | `string` | query | Yes | Target URL (required) |
| `method` | `string` | query | No | HTTP method (default: GET) |
| `response` | `string` | query | No | Response mode: transparent or json (default: json) |
| `mode` | `string` | query | No | Execution mode: sync or async (default: sync) |
| `session_id` | `string` | query | No | Session ID for cookie persistence |
| `follow_redirects` | `boolean` | query | No | Follow redirects (default: true) |
| `timeout` | `integer` | query | No | Timeout in seconds |
| `user_agent` | `string` | query | No | User-Agent header |
| `referer` | `string` | query | No | Referer header |
| `bearer_token` | `string` | query | No | Bearer token |
| `save` | `boolean` | query | No | Save to storage |
| `save_path` | `string` | query | No | Custom save path, relative to downloads/by-job/{job_id} (no absolute paths or `..`) |
| `insecure` | `boolean` | query | No | Allow insecure SSL |
| `compressed` | `boolean` | query | No | Request compressed |
| `job_name` | `string` | query | No | Job name for async |
| `data` | `string` | query | No | Raw request body (curl --data); alias `body`; presence upgrades default method to POST |
| `json` | `string` | query | No | JSON request body, sent with Content-Type: application/json (curl --json); upgrades default method to POST |
| `header` | `array` | query | No | Custom header as `Name: Value`. Repeatable — supply once per header |
| `data_base64` | `string` | query | No | Base64 request body (binary-safe; standard or URL-safe); alias `body_base64`. Takes precedence over data/json; upgrades default method to POST |

**Returns:** `curl_JsonResponse`  |  **HTTP:** `GET /api/v1/curl/request`
**CLI:** `hoody curl get-url`

---

### `client.curl.events` (3) — WebSocket event endpoints

#### `sseJobEvents` — Subscribe to job events over Server-Sent Events

```typescript
client.curl.events.sseJobEvents(job_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | query | No | Optional job ID filter |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/curl/sse`

---

#### `streamWs` — Subscribe to job events over WebSocket

```typescript
client.curl.events.streamWs(job_id?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | query | No | Optional job ID filter |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/curl/ws`
**CLI:** `hoody curl jobs events`

---

#### `wsRequestChannel` — Execute cURL requests over a WebSocket channel

```typescript
client.curl.events.wsRequestChannel(max_concurrent?: integer, max_concurrent_streams?: integer, max_pool?: integer, max_queue?: integer, max_frame_bytes?: integer, max_request_bytes?: integer, chunk_bytes?: integer, stream_timeout_secs?: integer, idle_timeout_secs?: integer, max_outbound_messages?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `max_concurrent` | `integer` | query | No | Alias for max concurrent streams on this channel connection |
| `max_concurrent_streams` | `integer` | query | No | Maximum concurrently executing streams on this channel connection |
| `max_pool` | `integer` | query | No | Alias for max_concurrent; does not configure outbound libcurl connection pooling |
| `max_queue` | `integer` | query | No | Maximum queued streams waiting for a per-connection execution slot |
| `max_frame_bytes` | `integer` | query | No | Maximum inbound WebSocket text frame size in bytes |
| `max_request_bytes` | `integer` | query | No | Maximum assembled request JSON size in bytes |
| `chunk_bytes` | `integer` | query | No | Maximum upstream response bytes encoded into one channel body frame |
| `stream_timeout_secs` | `integer` | query | No | Per-stream execution timeout in seconds |
| `idle_timeout_secs` | `integer` | query | No | Idle channel timeout in seconds |
| `max_outbound_messages` | `integer` | query | No | Maximum queued outbound channel messages |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/curl/channel`

---

### `client.curl.health` (1) — Health

#### `check` — Service health check

```typescript
client.curl.health.check()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/curl/health`
**CLI:** `hoody curl health`

---

### `client.curl.jobs` (6) — Job management endpoints

#### `cancel` — Cancel a pending or running job

```typescript
client.curl.jobs.cancel(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/curl/jobs/{id}`
**CLI:** `hoody curl jobs cancel`

---

#### `get` — Get detailed job information

```typescript
client.curl.jobs.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

**Returns:** `curl_Job`  |  **HTTP:** `GET /api/v1/curl/jobs/{id}`
**CLI:** `hoody curl jobs get`

---

#### `getResult` — Get job response body

```typescript
client.curl.jobs.getResult(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/curl/jobs/{id}/result`
**CLI:** `hoody curl jobs result`

---

#### `list` — List all async jobs

```typescript
client.curl.jobs.list(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedJobSummaries`  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `listAll` — List all async jobs (collect all pages)

```typescript
client.curl.jobs.listAll(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedJobSummaries[]`  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `listIterator` — List all async jobs (async iterator)

```typescript
client.curl.jobs.listIterator(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<curl_PaginatedJobSummaries>`  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

### `client.curl.ops` (1) — Operational endpoints (health and metrics)

#### `metrics` — Prometheus metrics

```typescript
client.curl.ops.metrics()
```

**Returns:** `any`  |  **HTTP:** `GET /metrics`
**CLI:** `hoody curl metrics`

---

### `client.curl.schedules` (7) — Schedule management endpoints

#### `create` — Create a recurring scheduled job

```typescript
client.curl.schedules.create(data: curl_CreateScheduleRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `curl_CreateScheduleRequest` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/curl/schedule`
**CLI:** `hoody curl schedules create`

---

#### `delete` — Delete a schedule

```typescript
client.curl.schedules.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules delete`

---

#### `get` — Get schedule details

```typescript
client.curl.schedules.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier (UUID format) |

**Returns:** `curl_ScheduledJob`  |  **HTTP:** `GET /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules get`

---

#### `list` — List all scheduled jobs

```typescript
client.curl.schedules.list(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedSchedules`  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `listAll` — List all scheduled jobs (collect all pages)

```typescript
client.curl.schedules.listAll(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedSchedules[]`  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `listIterator` — List all scheduled jobs (async iterator)

```typescript
client.curl.schedules.listIterator(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<curl_PaginatedSchedules>`  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `toggle` — Enable or disable a schedule

```typescript
client.curl.schedules.toggle(id: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier |
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `PATCH /api/v1/curl/schedule/{id}/toggle`
**CLI:** `hoody curl schedules toggle`

---

### `client.curl.sessions` (6) — Session management endpoints

#### `delete` — Delete a session

```typescript
client.curl.sessions.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier to delete |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/curl/sessions/{id}`
**CLI:** `hoody curl sessions delete`

---

#### `get` — Get session details

```typescript
client.curl.sessions.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier (caller-provided string) |

**Returns:** `curl_Session`  |  **HTTP:** `GET /api/v1/curl/sessions/{id}`
**CLI:** `hoody curl sessions get`

---

#### `getCookies` — Get session cookies only

```typescript
client.curl.sessions.getCookies(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/curl/sessions/{id}/cookies`
**CLI:** `hoody curl sessions cookies`

---

#### `list` — List all cookie sessions

```typescript
client.curl.sessions.list(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedSessions`  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

#### `listAll` — List all cookie sessions (collect all pages)

```typescript
client.curl.sessions.listAll(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedSessions[]`  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

#### `listIterator` — List all cookie sessions (async iterator)

```typescript
client.curl.sessions.listIterator(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<curl_PaginatedSessions>`  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

### `client.curl.storage` (5) — Storage management endpoints

#### `deleteFile` — Delete a saved file

```typescript
client.curl.storage.deleteFile(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Relative path to file in storage |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/curl/storage/{path}`
**CLI:** `hoody curl storage delete`

---

#### `getFile` — Download a saved file

```typescript
client.curl.storage.getFile(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Relative path to file in storage (supports nested paths) |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/curl/storage/{path}`
**CLI:** `hoody curl storage get`

---

#### `list` — List all saved downloads

```typescript
client.curl.storage.list(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedStorageEntries`  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`

---

#### `listAll` — List all saved downloads (collect all pages)

```typescript
client.curl.storage.listAll(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `curl_PaginatedStorageEntries[]`  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`

---

#### `listIterator` — List all saved downloads (async iterator)

```typescript
client.curl.storage.listIterator(page?: integer, limit?: integer)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `integer` | query | No | 1-based page number (optional) |
| `limit` | `integer` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncIterableIterator<curl_PaginatedStorageEntries>`  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`


### Body schemas

- `curl_CurlRequest` — `{ auth_method: string|null, auth_password: string|null, auth_user: string|null, bearer_token: string|null, cacert: string|null, cert: string|null, cert_type: string|null, compressed: bool|null, connect_timeout: int|null, cookie: string|null, data: string|null, follow_redirects: bool|null, form: { [key: string]: string }|null, headers: { [key: string]: string }|null, insecure: bool|null, job_name: string|null, json: any, keepalive: bool|null, keepalive_time: int|null, key: string|null, max_filesize: int|null, max_redirects: int|null, method: string|null, mode: null | curl_ExecutionMode, proxy: string|null, proxy_password: string|null, proxy_user: string|null, range: string|null, referer: string|null, response: null | curl_ResponseMode, retry_count: int|null, retry_delay: int|null, save: bool|null, save_path: string|null, schedule: string|null, session_id: string|null, speed_limit: int|null, speed_time: int|null, tcp_nodelay: bool|null, timeout: int|null, url*: string, user_agent: string|null }`
- `curl_CreateScheduleRequest` — `{ cron*: string, request*: curl_CurlRequest }`
- `curl_ExecutionMode` — `"sync" | "async"`
- `curl_ResponseMode` — `"transparent" | "json"`

