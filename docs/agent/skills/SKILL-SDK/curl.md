> _**SDK skill · `curl` namespace** · ~10,863 tokens · hoody-sdk v1.0.0-beta.15_

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
- `schedules.*` 404s if disabled.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

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

Combine with `proxy.aliases.create({ program: 'curl' })` to give the bridge a brandable hostname like `https://api-bridge.{server_name}.containers.hoody.com/api/v1/curl/request?...` and hide the `containerId`.

`client.curl.run` **executes** the request and returns the envelope; it does NOT just compose a URL string. The SDK has no GET method for this route: `run` always sends the POST form. When the deployment enables the kit's response cache (it is off by default), an eligible request can be answered from the cache instead. To compose a URL without firing it, build it client-side or use `proxy.aliases.create({ program: 'curl', target_path: '/api/v1/curl/request' })` to get a stable prefix.

For the imperative full-cURL surface (a headers map, `form` fields sent URL-encoded, cookies, auth, follow-redirects, `insecure`, etc.) use the POST form below — though note the kit's request validator rejects `cacert`/`cert`/`key`/`proxy`/`proxy_user`/`proxy_password` (the rejected fields are limited to those six; all other body/auth/connection fields are accepted).

### 2. Sync request

`client.curl.run` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw).

### 3. Async job

1. `client.curl.run` with `mode:"async"` → `job_id`.
2. Poll `jobs.get` or subscribe `jobs.connect` (WebSocket) or `jobs.stream` (SSE) filtered by `job_id`.
3. `jobs.getResult`; `jobs.cancel` aborts.

### 4. Cookie-jar session

1. `client.curl.run` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `sessions.listCookies` / `sessions.delete`.

### 5. Save download

1. `client.curl.run` with `save:true` and optional relative `save_path` under `downloads/by-job/{job_id}/`.
2. `storage.list`/`storage.get`/`storage.delete` with relative path (e.g. `by-job/<uuid>/x.pdf`).

### 6. Scheduled request

1. `schedules.create` with `{cron,request}` → `schedule_id`.
2. `schedules.list`/`schedules.get`/`schedules.update` (`{"enabled":bool}` pauses or resumes)/`schedules.delete`.
3. Each admitted occurrence creates a job; inspect via `jobs.list`. An occurrence is skipped, with no job, while the previous run is still in flight or when the job queue rejects it.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files at `downloads/by-job/{job_id}/...`; pass relative path.
- `storage.get` resolves with `ApiResponse<ArrayBuffer>` — binary-safe, no text decoding. Write `response.data` straight to disk.
- **A saved download is stored under `by-job/{job_id}/<save_path>`, with best-effort index links** `by-date/<YYYY-MM-DD>/<job_id>` and `by-domain/<host>/<job_id>`. A URL whose host is an IP literal gets no `by-domain` link, and either link is skipped silently if it cannot be created, so expect one to three entries. `storage.list` returns one item per path; the bytes are the same file.
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `schedules.*` 404s if disabled.
- Pausing or resuming through `schedules.update` needs an explicit boolean `enabled`; else 400.
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

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

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

```typescript
const r = await client.curl.run({
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
await client.api.proxy.aliases.create({
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
const csrf = await client.curl.run({
  url: 'https://api.example.com/csrf', method: 'GET', session_id: sid, response: 'json',
});
const token = JSON.parse(csrf.data!.body).csrf_token;
```

**Step 2 — submit login.** The session cookie returned by the upstream is auto-stored in the same jar. Encode the token: `data` is sent as written, so a token holding `+`, `&` or `=` would be altered. The `form` field encodes each value and sets the form content type.

```typescript
await client.curl.run({
  url: 'https://api.example.com/login', method: 'POST',
  form: { username: 'alex', password: 'secret', csrf: token },   // URL-encoded by the kit
  session_id: sid,
});
```

**Step 3 — authorized call.** Stored cookie is auto-attached.

```typescript
const me = await client.curl.run({
  url: 'https://api.example.com/me', method: 'GET', session_id: sid, response: 'json',
});
console.log(me.data!.body);
const cookies = await client.curl.sessions.listCookies(sid);
await client.curl.sessions.delete(sid);
```

### 3. Fan-out — submit 3 async jobs, await all, collect results

**Goal:** fetch from 3 upstreams in parallel, combine the results.

**Step 1 — submit each, capture `job_id`s.**

```typescript
const urls = ['https://httpbin.org/delay/1', 'https://httpbin.org/delay/2', 'https://httpbin.org/get'];
const submits = await Promise.all(urls.map(url =>
  client.curl.run({ url, method: 'GET', mode: 'async' })
));
const jobIds = submits.map(s => {
  const id = s.data.job_id;   // typed string | null | undefined
  if (!id) throw new Error('async submit returned no job_id');
  return id;
});
```

**Step 2 — poll until every job is terminal.** A job ends `completed`, `failed` or `cancelled`; stop on the last two, on a failed status request, and at a deadline. The deadline is checked between polls, so each status request is also capped (10 s here) to keep one stalled request from outliving it.

```typescript
async function waitAll(ids: string[], timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  while (true) {
    const states = await Promise.all(ids.map(id => client.curl.jobs.get(id, undefined, { timeoutMs: 10_000 })));
    const ended = states.find(s => s.data.status === 'failed' || s.data.status === 'cancelled');
    if (ended) throw new Error(`job ${ended.data.id} ${ended.data.status}: ${ended.data.error ?? ''}`);
    if (states.every(s => s.data.status === 'completed')) return;
    if (Date.now() > deadline) throw new Error('jobs still running at the deadline');
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
const sub = await client.curl.run({
  url: 'https://httpbin.org/delay/30', method: 'GET', mode: 'async', timeout: 60,
});
const jid = sub.data!.job_id!;   // set in async mode
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
const created = await client.curl.schedules.create({
  cron: '0 */15 * * * *',
  request: { url: 'https://prod.example.com/health', method: 'GET', job_name: 'prod-health' },
});
const scheduleId = (created.data as { schedule_id: string }).schedule_id;   // the SDK declares this response as unknown
```

**Step 2 — audit failures.** A job is `failed` when the request could not be completed (DNS, connect, timeout) or when processing after the response failed, such as saving a download. An upstream HTTP error status alone does not fail the job: an upstream that answers `500` still yields a `completed` job, so also read the `response.status_code` of completed runs (from `jobs.get`; the listing does not carry it).

```typescript
const listed = await client.curl.jobs.list({ limit: 200 });
const runs = listed.data.items.filter(j => j.name === 'prod-health');
const phFailures: string[] = runs.filter(j => j.status === 'failed').map(j => j.id);
for (const j of runs.filter(j => j.status === 'completed')) {
  const full = await client.curl.jobs.get(j.id);
  // `response` is the upstream reply; read its status_code field.
  const code = (full.data.response as unknown as { status_code?: number } | null)?.status_code;
  if (code === undefined || code >= 400) phFailures.push(j.id);
}
```

**Step 3 — pause during deploy** (set `enabled: false` and back, or `delete` to drop entirely):

```typescript
await client.curl.schedules.update(scheduleId, { enabled: false });
// Resume:    await client.curl.schedules.update(scheduleId, { enabled: true });
// Drop:      await client.curl.schedules.delete(scheduleId);
```

### 6. Background download → kit storage → fetch later

**Goal:** pull a 1 GB ISO without blocking the caller; access bytes from elsewhere later.

**Step 1 — submit async + save.**

```typescript
const sub = await client.curl.run({
  url: 'https://example.com/big.iso', method: 'GET', mode: 'async',
  save: true, save_path: 'iso/ubuntu.iso', timeout: 600,
});
const jid = sub.data.job_id;
if (!jid) throw new Error('async submit returned no job_id');
```

**Step 2 — wait + inspect storage.** Stop on `failed` or `cancelled` and at a deadline instead of waiting for `completed` forever; the deadline is checked between polls, and each status request is capped at 10 s. Up to three entries point at the SAME bytes: `by-job/`, plus the best-effort `by-date/` and `by-domain/` links (no `by-domain/` for an IP-literal host).

```typescript
const deadline = Date.now() + 30 * 60_000;
for (;;) {
  const job = (await client.curl.jobs.get(jid, undefined, { timeoutMs: 10_000 })).data;
  if (job.status === 'completed') break;
  if (job.status === 'failed' || job.status === 'cancelled') throw new Error(`job ${job.status}: ${job.error ?? ''}`);
  if (Date.now() > deadline) throw new Error('still downloading after 30 min');
  await new Promise(r => setTimeout(r, 2000));
}
const idx = await client.curl.storage.list({ limit: 10 });
```

**Step 3 — fetch & delete.** A delete through ANY of the paths removes the shared file, so every entry stops serving it (the others return `404` afterwards); the remaining index links may be left behind, dangling.

```typescript
const bytes = await client.curl.storage.get(`by-job/${jid}/iso/ubuntu.iso`);
await client.curl.storage.delete(`by-job/${jid}/iso/ubuntu.iso`);
```

### 7. Bearer-authenticated upstream — header auto-injection

**Goal:** call the GitHub API with a token without composing the Authorization header. Against `httpbin.org/bearer` it returns `{"authenticated":true,"token":"…"}`.

```typescript
const r = await client.curl.run({
  url: 'https://api.github.com/user', method: 'GET',
  bearer_token: 'ghp_xxxxxxxxxxxx', response: 'json',
});
const remaining = r.data!.headers['x-ratelimit-remaining'];
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

```typescript
await client.api.proxy.aliases.create({
  container_id: C,
  alias: 'rebuild-main',
  program: 'curl',
  target_path: '/api/v1/curl/request?url=https%3A%2F%2Fci.example.com%2Fbuild&method=POST&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ',
  allow_path_override: false,
});
```

**Step 3 — gate it** — only your office IPs can fire it (uses `proxy.containerPermissions.setIpGroup`; see the `api` namespace).

### 9. Recover a result from yesterday's scheduled job

**Goal:** a scheduled scrape ran 18 hours ago; you want the body now. Finished job records, response bodies included, are deleted by an hourly sweep once they are older than the retention period (7 days by default; the deployment can change it). Saved downloads are kept.

**Step 1 — find the right job** (the schedule was created with `request.job_name: 'prod-health'`). The listing is ordered by creation time, newest first, and runs do not necessarily complete in that order; a schedule firing every 15 minutes also leaves many runs with the same name. So read every page and select by completion time: here, the completed run with the latest `completed_at` at or before 18 hours ago. 

```typescript
const cutoff = Date.now() - 18 * 3600_000;
let best: { id: string; at: number } | undefined;
for await (const j of client.curl.jobs.listIterator({ limit: 200 })) {   // every page
  if (j.status !== 'completed' || j.name !== 'prod-health' || !j.completed_at) continue;
  const at = Date.parse(j.completed_at);
  if (at <= cutoff && (!best || at > best.at)) best = { id: j.id, at };
}
if (!best) throw new Error('no completed prod-health run 18 h ago');
const jid = best.id;
```

**Step 2 — fetch.** `jobs.getResult` returns just the upstream body; `jobs.get` returns the full record (timing, headers, original request).

```typescript
const body = await client.curl.jobs.getResult(jid);
const full = await client.curl.jobs.get(jid);
```

### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. Use the `by-date/` index because the date is in the path. The listing is newest first, so the old entries are on the last pages: collect every page before deleting anything, because each delete shifts the pages after it.

```typescript
const cutoff = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
const all = await client.curl.storage.listAll({ limit: 200 });   // every page, read before deleting
const old = all.filter(i => {
  const day = i.path.split('/')[1];
  return i.path.startsWith('by-date/') && day !== undefined && day < cutoff;
});
await Promise.all(old.map(i => client.curl.storage.delete(i.path)));
```

## Reference

**Accessor:** `client.curl`  |  **Import:** `import * as curl from 'hoody-sdk/curl'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, containerId?, serviceIndex?, server? }`, which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are refused) and `cache` (a GET's response cache: `true`, a TTL in ms, or `false` to bypass) (no `_realm`: that one is control-plane only). When the signature shows an options object, the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`.

### `client.curl.channel` (1) — WebSocket event endpoints

#### `connect` — Open a {@link CurlChannel} against this client's container kit.

```typescript
client.curl.channel.connect(opts?: CurlChannelHelperOptions)
```

**Returns:** `Promise<CurlChannel>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.curl` (1) — cURL execution endpoints

#### `run` — Execute HTTP request with full cURL capabilities

```typescript
client.curl.run(data: CurlRunRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `CurlRunRequest` | body | Yes | Shape: `curl_CurlRequest` under Body schemas. |

**Returns:** `Promise<CurlRunResponse>`  |  **HTTP:** `POST /api/v1/curl/request`
**CLI:** `hoody curl run`

---

### `client.curl.jobs` (9) — Job management endpoints

#### `cancel` — Cancel a pending or running job, or delete a finished one

```typescript
client.curl.jobs.cancel(id: Parameters<JobsServiceBase['__cancelJob']>[0], options?: FacadeWithout<NonNullable<Parameters<JobsServiceBase['__cancelJob']>[1]>, "purge">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

**Returns:** `ReturnType<JobsServiceBase['__cancelJob']>`  |  **HTTP:** `DELETE /api/v1/curl/jobs/{id}`
**CLI:** `hoody curl jobs cancel`

---

#### `connect` — Subscribe to job events over WebSocket

```typescript
client.curl.jobs.connect(options?: { job_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | query | No | Optional job ID filter |

**Returns:** `Promise<CurlWsJobEventsWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/curl/ws`

---

#### `delete` — Cancel a pending or running job, or delete a finished one

```typescript
client.curl.jobs.delete(id: Parameters<JobsServiceBase['__cancelJob']>[0], options?: FacadeWithout<NonNullable<Parameters<JobsServiceBase['__cancelJob']>[1]>, "purge">)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

**Returns:** `ReturnType<JobsServiceBase['__cancelJob']>`  |  **HTTP:** `DELETE /api/v1/curl/jobs/{id}`
**CLI:** `hoody curl jobs delete`

---

#### `get` — Get detailed job information

```typescript
client.curl.jobs.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

**Returns:** `Promise<CurlJobsGetResponse>`  |  **HTTP:** `GET /api/v1/curl/jobs/{id}`
**CLI:** `hoody curl jobs get`

---

#### `getResult` — Get job response body

```typescript
client.curl.jobs.getResult(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /api/v1/curl/jobs/{id}/result`
**CLI:** `hoody curl jobs result get`

---

#### `list` — List all async jobs

```typescript
client.curl.jobs.list(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<CurlJobsListResponse>`  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `listAll` — List all async jobs (collect all pages)

```typescript
client.curl.jobs.listAll(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<(NonNullable<CurlJobsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `curl_JobSummary`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `listIterator` — List all async jobs (async iterator)

```typescript
client.curl.jobs.listIterator(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncGenerator<(NonNullable<CurlJobsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `curl_JobSummary`.  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `stream` — Subscribe to job events over Server-Sent Events

```typescript
client.curl.jobs.stream(options?: { job_id?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | query | No | Optional job ID filter |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /api/v1/curl/sse`
**CLI:** `hoody curl jobs stream`

---

### `client.curl.kit` (2) — Operational endpoints (health and metrics)

#### `getHealth` — Service health check

```typescript
client.curl.kit.getHealth()
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /api/v1/curl/health`
**CLI:** `hoody curl health`

---

#### `getMetrics` — Prometheus metrics

```typescript
client.curl.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /metrics`
**CLI:** `hoody curl metrics`

---

### `client.curl.schedules` (7) — Schedule management endpoints

#### `create` — Create a recurring scheduled job

```typescript
client.curl.schedules.create(data: CurlSchedulesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `CurlSchedulesCreateRequest` | body | Yes | Shape: `curl_CreateScheduleRequest` under Body schemas. |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `POST /api/v1/curl/schedule`
**CLI:** `hoody curl schedules create`

---

#### `delete` — Delete a schedule

```typescript
client.curl.schedules.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules delete`

---

#### `get` — Get schedule details

```typescript
client.curl.schedules.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier (UUID format) |

**Returns:** `Promise<CurlSchedulesGetResponse>`  |  **HTTP:** `GET /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules get`

---

#### `list` — List all scheduled jobs

```typescript
client.curl.schedules.list(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<CurlSchedulesListResponse>`  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `listAll` — List all scheduled jobs (collect all pages)

```typescript
client.curl.schedules.listAll(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<(NonNullable<CurlSchedulesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `curl_ScheduledJob`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `listIterator` — List all scheduled jobs (async iterator)

```typescript
client.curl.schedules.listIterator(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncGenerator<(NonNullable<CurlSchedulesListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `curl_ScheduledJob`.  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `update` — Update a schedule's cron expression, request or enabled state

```typescript
client.curl.schedules.update(id: string, data: CurlSchedulesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier |
| `data` | `CurlSchedulesUpdateRequest` | body | Yes | Shape: `curl_UpdateScheduleRequest` under Body schemas. |

**Returns:** `Promise<CurlSchedulesUpdateResponse>`  |  **HTTP:** `PATCH /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules update`

---

### `client.curl.sessions` (6) — Session management endpoints

#### `delete` — Delete a session

```typescript
client.curl.sessions.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier to delete |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/curl/sessions/{id}`
**CLI:** `hoody curl sessions delete`

---

#### `get` — Get session details

```typescript
client.curl.sessions.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier (caller-provided string) |

**Returns:** `Promise<CurlSessionsGetResponse>`  |  **HTTP:** `GET /api/v1/curl/sessions/{id}`
**CLI:** `hoody curl sessions get`

---

#### `list` — List all cookie sessions

```typescript
client.curl.sessions.list(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<CurlSessionsListResponse>`  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

#### `listAll` — List all cookie sessions (collect all pages)

```typescript
client.curl.sessions.listAll(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<(NonNullable<CurlSessionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `curl_Session`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

#### `listCookies` — Get session cookies only

```typescript
client.curl.sessions.listCookies(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /api/v1/curl/sessions/{id}/cookies`
**CLI:** `hoody curl sessions cookies list`

---

#### `listIterator` — List all cookie sessions (async iterator)

```typescript
client.curl.sessions.listIterator(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncGenerator<(NonNullable<CurlSessionsListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `curl_Session`.  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

### `client.curl.storage` (5) — Storage management endpoints

#### `delete` — Delete a saved file

```typescript
client.curl.storage.delete(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Relative path to file in storage |

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `DELETE /api/v1/curl/storage/{path}`
**CLI:** `hoody curl storage delete`

---

#### `get` — Download a saved file

```typescript
client.curl.storage.get(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Relative path to file in storage (supports nested paths) |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/curl/storage/{path}`
**CLI:** `hoody curl storage get`

---

#### `list` — List all saved downloads

```typescript
client.curl.storage.list(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<CurlStorageListResponse>`  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`

---

#### `listAll` — List all saved downloads (collect all pages)

```typescript
client.curl.storage.listAll(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `Promise<(NonNullable<CurlStorageListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown)[]>` — every item of `data.items`, all pages collected (`list()` fetches one page). Each item is `curl_StorageEntry`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`

---

#### `listIterator` — List all saved downloads (async iterator)

```typescript
client.curl.storage.listIterator(options?: { page?: number; limit?: number })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

**Returns:** `AsyncGenerator<(NonNullable<CurlStorageListResponse> extends { data?: infer T0 } ? (NonNullable<T0> extends { items?: infer T1 } ? (NonNullable<T1> extends readonly (infer TItem)[] ? TItem : unknown) : unknown) : unknown), void, unknown>` — one item of `data.items` per step, next page fetched on demand (`list()` fetches one page). Each item is `curl_StorageEntry`.  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`


### Body schemas

- `curl_CurlRequest` — `{ auth_method: string|null, auth_password: string|null, auth_user: string|null, bearer_token: string|null, cacert: string|null, cert: string|null, cert_type: string|null, compressed: bool|null, connect_timeout: int|null, cookie: string|null, data: string|null, follow_redirects: bool|null, form: { [key: string]: string }|null, headers: { [key: string]: string }|null, insecure: bool|null, job_name: string|null, json: any, keepalive: bool|null, keepalive_time: int|null, key: string|null, max_filesize: int|null, max_redirects: int|null, method: string|null, mode: null | curl_ExecutionMode, proxy: string|null, proxy_password: string|null, proxy_user: string|null, range: string|null, referer: string|null, response: null | curl_ResponseMode, retry_count: int|null, retry_delay: int|null, save: bool|null, save_path: string|null, schedule: string|null, session_id: string|null, speed_limit: int|null, speed_time: int|null, tcp_nodelay: bool|null, timeout: int|null, url*: string, user_agent: string|null }`
  - cURL request parameters A JSON body carrying any field not listed here is rejected with `400`. This protects against silently sending a removed or not-yet-released field that would otherwise slip past validation unnoticed.
  - `save_path` — Relative path under this job's download directory (downloads/by-job/{job_id}). Must not be absolute or contain `..`.
- `curl_CreateScheduleRequest` — `{ cron*: string, request*: curl_CurlRequest }`
- `curl_UpdateScheduleRequest` — `{ cron: string|null, enabled: bool|null, request: null | curl_CurlRequest }`
  - Partial update of a schedule. Every field is optional, at least one is required; absent fields keep their current value.
- `curl_ExecutionMode` — `"sync" | "async"`
- `curl_ResponseMode` — `"transparent" | "json"`

