> _**SDK skill · `curl` namespace** · ~13,032 tokens · hoody-sdk v1.0.1_

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

- The default instance is `1` (`curl-1`).
- `schedules.*` 404s if disabled.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Convert any REST call into a single GET-able URL (HTTP only)

`GET /api/v1/curl/request?url=<TARGET>&method=<VERB>` on the curl kit URL. The kit executes the upstream request and by default returns a JSON envelope `{ success, job_id, status_code, headers, body, is_binary, timing, metadata }` for a buffered response (`response=transparent` returns the upstream response as is; `mode=async` returns a `202` job acceptance) (an eligible `text/event-stream` response is streamed instead, see section 2). Useful when the caller can only emit a GET (browser, webhook, sandboxed agent, RSS-ish puller, link in an email).

Note: the GET bridge accepts `url` + `method` + the 13 timing/follow/session/response/save flags (`response`, `mode`, `session_id`, `follow_redirects`, `timeout`, `user_agent`, `referer`, `bearer_token`, `save`, `save_path`, `insecure`, `compressed`, `job_name`) **AND a full request body + headers right in the query string**: `data` (raw body, curl `--data`), `json` (parsed JSON; sets `Content-Type: application/json`), `data_base64` (binary-safe; URL-safe base64 (standard base64 also decodes, but percent-encode each `+` as `%2B`, or the query turns it into a space and the kit answers 400), padding optional; takes precedence over `data`/`json`), the aliases `body` and `body_base64` (for `data` and `data_base64`; the canonical name wins when both are given), and repeatable `header=Name: Value`. **Supplying a body auto-upgrades the default method GET→POST** — so a body-bearing POST/PUT/PATCH (with headers) is expressible as a single GET URL. Every other request field is POST-only: a headers map, `form` (URL-encoded fields), `cookie`, `auth_user` / `auth_password` / `auth_method`, `connect_timeout`, `max_redirects`, `max_filesize`, `tcp_nodelay`, `keepalive`, `keepalive_time`, `range`, `speed_limit`, `speed_time`, `retry_count` and `retry_delay`. The GET bridge ignores any of them in the query string without an error, so the request is sent without it. Neither form sends a multipart upload or reads a file from disk (`--data-binary @file`). To send arbitrary binary bytes, use `data_base64` on the GET bridge; the POST JSON form rejects a `data_base64` field with 400 (it refuses any unknown field).

Live examples (verified — replace the kit URL with your computer's):

- Plain GET upstream: `https://{P}-{C}-curl-1.{N}.computers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get`
- HEAD upstream: `https://{P}-{C}-curl-1.{N}.computers.hoody.com/api/v1/curl/request?url=https://httpbin.org/get&method=HEAD`

Combine with `proxy.aliases.create({ computer_id: C, program: 'curl', alias: 'api-bridge' })`, where `C` is the target computer's id, to give the bridge a brandable hostname like `https://api-bridge.{server_name}.computers.hoody.com/api/v1/curl/request?...` and hide the `computerId`. Without `alias` the hostname is a generated 48-character hex name.

`client.curl.run` **executes** the request and returns the upstream response (the `{status_code, headers, body}` envelope with `response: 'json'` for a buffered response); it does NOT just compose a URL string. The SDK has no GET method for this route: `run` always sends the POST form. When the deployment enables the kit's response cache (it is off by default), an eligible request can be answered from the cache instead. To compose a URL without firing it, build it client-side or create a proxy alias with `program: 'curl'`: an alias created with `allow_path_override: true` forwards a request that carries its own path, such as `/api/v1/curl/request?...`, as sent, while `target_path` only sets what the bare root URL serves. On a pinned alias (`allow_path_override: false`) any path other than its root and target path is refused with `404 ALIAS_PATH_PINNED`.

For the imperative full-cURL surface (a headers map, `form` fields sent URL-encoded, cookies, auth, follow-redirects, `insecure`, etc.) use the POST form below — though note the kit refuses client-certificate files and an upstream proxy (an SSRF guard; the request schema no longer lists them), and accepts every other body, auth and connection field.

### 2. Sync request

`client.curl.run` with `mode:"sync"` (default), `response:"json"` (envelope) or `"transparent"` (raw). The envelope applies to buffered responses. While SSE support is on (the default), a body-bearing 2xx `text/event-stream` response is streamed through as SSE even with `response:"json"`; non-2xx responses, HEAD/204/205 responses and SSE whose content stays encoded remain buffered. `client.curl.run` reads the whole response and exposes no response headers, so use it for finite responses and read an event stream with a streaming HTTP client against the kit URL.

### 3. Async job

1. `client.curl.run` with `mode:"async"` → `job_id`.
2. Poll `jobs.get` or subscribe `jobs.connect` (WebSocket) or `jobs.stream` (SSE) filtered by `job_id`.
3. `jobs.getResult`; `jobs.cancel` aborts. `jobs.get` reports `retry_attempts`: 1 for a job that ran once, plus one per retry after a transfer error.

### 4. Cookie-jar session

1. `client.curl.run` with `session_id:"<id>"` auto-creates jar.
2. Reuse same `session_id` on follow-ups.
3. `sessions.listCookies` / `sessions.delete`.

### 5. Save download

1. `client.curl.run` with `save:true`, `mode:"async"` and an optional relative `save_path` returns a `job_id`. Wait for the job to complete successfully before retrieving the file. It is stored at `downloads/by-job/{job_id}/<save_path>`; if `save_path` is omitted, the filename is the URL's last path segment or `download`.
2. Use `storage.list`/`storage.get`/`storage.delete` with a relative path such as `by-job/<job_id>/x.pdf`.

A synchronous save, the default mode, uses a storage-only UUID that is not returned in the response (a buffered JSON envelope has `job_id: null`); use `storage.list` to find the saved path.

### 6. Scheduled request

1. `schedules.create` with `{cron,request}` → `schedule_id`. Add `enabled: false` to create it paused: it never fires until `schedules.update` sets `enabled: true`.
2. `schedules.list`/`schedules.get`/`schedules.update` (`{"enabled":bool}` pauses or resumes)/`schedules.delete`.
3. Each admitted occurrence creates a job; inspect via `jobs.list`. An occurrence is skipped, with no job, while the previous run is still in flight or when the job queue rejects it.

## Quirks & gotchas

- Default `response`: POST→`transparent`, GET→`json`.
- Default `mode:"sync"`; pass `"async"` for `job_id`.
- `save_path` rejected if empty, absolute, rooted, or has `..`.
- Saved files are at `downloads/by-job/{id}/...`, where `id` is the async job ID or, for a synchronous save, a storage-only UUID discoverable through `storage.list`; pass a relative path.
- `storage.get` resolves with `ApiResponse<ArrayBuffer>` — binary-safe, no text decoding. Write `response.data` straight to disk.
- **A saved download is stored under `by-job/{job_id}/<save_path>`, with best-effort index links** `by-date/<YYYY-MM-DD>/<job_id>` and `by-domain/<host>/<job_id>`. A URL whose host is an IP literal gets no `by-domain` link, and a symlink that cannot be created is skipped silently (failing to create an index directory fails the save), so expect one to three entries. `storage.list` returns one item per path; the bytes are the same file.
- `*.list` returns ALL when `limit` omitted; always pass `limit`.
- `schedules.*` 404s if disabled.
- `schedules.update` changes any of `cron`, `request` and `enabled`; omitted fields keep their current value, so pause or resume by sending `enabled: false` or `enabled: true` alone.
- `schedules.create` takes `enabled` (default `true`). A schedule created with `enabled: false` has no `next_run` and does not fire; its `cron` must still parse but need not have a future occurrence yet. Any field other than `cron`, `request` and `enabled` is refused with 400 `INVALID_PARAMETER`.
- `bearer_token` sends `Authorization: Bearer <token>`, but an `Authorization` entry in `headers` wins: the token is then not sent, so the request carries one `Authorization` header.
- `jobs.getResult` always answers `200` with the target's body and headers, whatever the target answered; the target's status code is in the `X-Curl-Status` header (and in `response.status_code` from `jobs.get`). A stored `429` or `503` is therefore not retried as a kit failure.
- **`schedules.create.cron` is 6-field (with seconds; an optional seventh `year` field is also accepted), NOT the standard 5-field crontab.** `*/15 * * * *` is rejected as `Invalid cron expression`; use `0 */15 * * * *` (at second 0 every 15 min). The standard @-nicknames (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`) ARE accepted (expanded internally to 6-field), but Go-style `@every 15m` is NOT — for anything else use explicit 6-field expressions. Different syntax from the `cron` namespace, which uses Vixie 5-field.
- `session_id` is caller-provided.
- Job events stream over a WebSocket at `/api/v1/curl/ws`; filter by `job_id`. SDK `client.curl.jobs.connect`.

## Common errors

- `504` — the upstream request timed out (libcurl timeout); raise `timeout`. An async job does not wait on the caller's connection, but the same `timeout` still applies to the upstream request. The kit itself does not answer `408`; a transparent `run` response passes the upstream's own status through (`jobs.getResult` does not: it answers 200 with `X-Curl-Status`), so an upstream `408` arrives as `408`.
- Cancelling a job answers `200`; the kit itself never answers `410` (a transparent `run` passes an upstream `410` through, like any upstream status). Read `jobs.get` for `status: "cancelled"`, and stop waiting once a job is `failed` or `cancelled`. `jobs.getResult` answers `404 JOB_RESULT_NOT_READY` when the job has no response body (still pending or running, or finished without an upstream response).
- `503 queue full` (also SSE capacity exhausted) — back off.

## Related namespaces

`browser` (JS/DOM), `exec` (shell), `cron` (timers), `files` (general IO), `sqlite` (parsed data).

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first.

### 1. Webhook receiver bridge — outbound system can only fire GETs

**Goal:** your CRM can fire URLs but not POST. Translate a click → real upstream POST with JSON body + bearer.

**Step 1 — compose the bridge URL — body and headers go right in the query string.** The GET bridge takes `url`, `method`, the timing/session/response flags (`response`, `mode`, `session_id`, `timeout`, `bearer_token`, …), **plus the request body + headers**: `data` (raw body), `json` (JSON body; sets `Content-Type: application/json`), `data_base64` (binary-safe; URL-safe base64 (standard base64 also decodes, but percent-encode each `+` as `%2B`, or the query turns it into a space and the kit answers 400), precedence over `data`/`json`), and repeatable `header=Name: Value`. **When `method` is omitted, supplying a body changes the default method from GET to POST. An explicit method is preserved.** So a real `POST … {json} + headers` becomes one GET-able link a CRM/webhook can fire:

```
# Full POST as ONE GET URL (json body + header; method auto-upgrades to POST):
https://${P}-${C}-curl-1.${N}.computers.hoody.com/api/v1/curl/request?url=<urlencoded-target>&json=%7B%22event%22%3A%22X%22%7D&header=Authorization:%20Bearer%20XYZ
# For payloads with &, quotes, newlines, or binary, prefer data_base64 (URL-safe base64) to dodge escaping:
https://${P}-${C}-curl-1.${N}.computers.hoody.com/api/v1/curl/request?url=<target>&data_base64=eyJldmVudCI6IlgifQ&header=Content-Type:%20application/json&bearer_token=<token>
```

(`form` fields, sent URL-encoded, cookies, Basic auth, retries, ranges and the connection limits are POST-only, and the GET bridge drops them without an error — use the POST form below for those. Neither form sends multipart uploads.)

```typescript
const r = await client.curl.run({
  url: 'https://my-api/events',
  method: 'POST',
  data: JSON.stringify({ event: 'X' }),
  headers: { 'Content-Type': 'application/json' },
  response: 'json',   // POST defaults to TRANSPARENT — without this, r.data is the upstream body
});                   // itself (parsed by its Content-Type), not the envelope with status_code
console.log(r.data!.status_code);
```

**Step 2 — hide the `computerId` behind a proxy alias.** Now `https://webhook-bridge.{server_name}.computers.hoody.com/api/v1/curl/request?...` becomes the public URL.

```typescript
await client.api.proxy.aliases.create({
  computer_id: C,
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
    const states = await Promise.all(ids.map(id =>
  // timeoutMs alone is a header/idle budget: the abort signal is what caps the whole request
  client.curl.jobs.get(id, undefined, { timeoutMs: 10_000, retries: 0, signal: AbortSignal.timeout(10_000) })
));
    const ended = states.find(s => s.data.status === 'failed' || s.data.status === 'cancelled');
    if (ended) throw new Error(`job ${ended.data.id} ${ended.data.status}: ${ended.data.error ?? ''}`);
    if (states.every(s => s.data.status === 'completed')) return;
    if (Date.now() > deadline) throw new Error('jobs still running at the deadline');
    await new Promise(r => setTimeout(r, 1000));
  }
}
await waitAll(jobIds);
```

**Step 3 — collect bodies.** `jobs.getResult` returns just the upstream body, always with status 200; the upstream's status is in `X-Curl-Status`. In the SDK the body is the call's `.data` (typed `unknown`).

```typescript
const results = await Promise.all(jobIds.map(id => client.curl.jobs.getResult(id)));
const bodies = results.map((r) => r.data);  // the upstream body is under .data
```

### 4. Cancel a runaway long-poll mid-flight

**Goal:** kill a hung async request, free the queue slot. Cancel only requests it: the worker notices the request and finalises the job later, and a job that already finished is left as it is. Poll until the job reaches a terminal state, with a deadline. When the cancel wins, `status` becomes `cancelled` and `error` is `Cancelled`; `completed` and `failed` are the other possible ends.

```typescript
const sub = await client.curl.run({
  url: 'https://httpbin.org/delay/30', method: 'GET', mode: 'async', timeout: 60,
});
const jid = sub.data!.job_id!;   // set in async mode
await new Promise(r => setTimeout(r, 1000));
await client.curl.jobs.cancel(jid);       // requests the cancel; the worker finalises later
const deadline = Date.now() + 60_000;
let job;
for (;;) {
  job = (await client.curl.jobs.get(jid, undefined, { timeoutMs: 10_000, retries: 0, signal: AbortSignal.timeout(10_000) })).data;
  if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') break;
  if (Date.now() > deadline) throw new Error('job not finished after 60 s');
  await new Promise(r => setTimeout(r, 1000));
}
// job.status === 'cancelled' and job.error === 'Cancelled' when the cancel won;
// 'completed' or 'failed' means the job ended before the cancel took effect.
```

### 5. Schedule + drift detection — fire every 15 min, audit history

**Goal:** ping a health endpoint every 15 min, fast-find failures. Warning: Scheduler uses **6-field** cron syntax (with seconds; an optional seventh `year` field is accepted) — `*/15 * * * *` (5-field) is rejected as `Invalid cron expression`.

**Step 1 — create.**

```typescript
const created = await client.curl.schedules.create({
  cron: '0 */15 * * * *',
  request: { url: 'https://prod.example.com/health', method: 'GET', job_name: 'prod-health' },
});
const scheduleId = created.data.schedule_id;
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
  const job = (await client.curl.jobs.get(jid, undefined, { timeoutMs: 10_000, retries: 0, signal: AbortSignal.timeout(10_000) })).data;
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

**HTTP Basic alternative** — swap the auth fields. Pass `{ url, method, auth_user, auth_password, auth_method: 'basic' }`. Against `httpbin.org/basic-auth/alex/secret` it returns `{"authenticated":true,"user":"alex"}`.

### 8. REST→GET bridge for chat-channel embedding

**Goal:** drop a one-liner URL into Slack so a teammate can re-trigger a build by clicking. URL pattern + alias + IP gate.

**Step 1 — compose** (no kit call — URL pattern). The GET bridge carries the full request in the query string — `url`, `method`, body via `data`/`json`/`data_base64`, and repeatable `header=Name: Value` (when `method` is omitted, supplying a body changes the default method from GET to POST; an explicit method is preserved). So a build-trigger that needs a JSON body + auth header is still one clickable link.

```
# GET-bridge URL — a real POST (json body + bearer header) as a single clickable link:
https://${P}-${C}-curl-1.${N}.computers.hoody.com/api/v1/curl/request?url=<url-encoded-build-trigger>&json=%7B%22ref%22%3A%22main%22%7D&header=Authorization:%20Bearer%20XYZ
```

**Step 2 — wrap with an alias** so the public URL hides `computerId`. The alias target must carry the whole request, body and auth included: the bridge reads the body and headers only from the query string, so an alias carrying just `url` and `method` sends an empty, unauthenticated POST. `target_path` refuses percent escapes (and spaces, double quotes, braces and `#`), so the step 1 query cannot be pasted as is: write the target URL unescaped (a pinned target URL can contain a simple query, but the bridge splits the query on `&` and reads `+` as a space, so an unescaped `&` starts another bridge parameter: `https://ci.example.com/build?a=1&b=2` reaches the kit as `url=https://ci.example.com/build?a=1`, with `b=2` as a separate bridge key; because `target_path` rejects percent escapes, use a query-free target or another approach when its query needs `&` or `+`), send the JSON body (here `{"ref":"main"}`) as URL-safe base64 in `data_base64` (`eyJyZWYiOiJtYWluIn0` below, the encoding of that body) with a `Content-Type:application/json` header, and pass the token as `bearer_token`. The token then lives in the alias configuration, so gate the alias (step 3). Keep `allow_path_override: false`: the alias then serves only this `target_path`, at its root and at `/api/v1/curl/request` (both with the target's query), and any other path is refused with `404 ALIAS_PATH_PINNED`. For a GET, a query key written in `target_path` wins over the visitor's value for that key, so a visitor's value for a key the target pins (`url`, `method`, `data_base64`, `bearer_token`, `header`) cannot replace the pinned one. The protection is per key, and several keys feed one request field: the body can come from `data_base64` (alias `body_base64`), `data` (alias `body`) or `json`, and `data_base64` beats `data`, which beats `json`; the bearer token is dropped when a `header=Authorization: ...` is present. Keys the target does not set (for example `timeout`, `save`, `json`, `data`, `body_base64`) still pass from the visitor. Pin every key that can change what you want fixed: pinning `data` or `json` alone does not fix the body (a visitor's `data_base64` wins), and pinning `bearer_token` alone does not fix authorization (a visitor's `header=Authorization: ...` wins), so pin the highest-precedence body key (`data_base64`) and a `header` key too, as the recipe below does. The pin does NOT constrain a POST: the alias forwards the visitor's HTTP method and body as on an open alias, and the kit's POST handler executes the JSON body it receives instead of the pinned query, so an admitted visitor can send a request of their own through the alias. Grant alias access (step 3) only to callers you would trust with arbitrary curl requests.

```typescript
await client.api.proxy.aliases.create({
  computer_id: C,
  alias: 'rebuild-main',
  program: 'curl',
  target_path: '/api/v1/curl/request?url=https://ci.example.com/build&method=POST&data_base64=eyJyZWYiOiJtYWluIn0&header=Content-Type:application/json&bearer_token=XYZ',
  allow_path_override: false,
});
```

**Step 3 — gate it** so only your office IPs can fire it: the link carries the upstream token. An IP group alone admits and refuses nothing (a new group has no permissions, and a call no group cell decides goes to the default, which may be allow). Define the office ranges with `computers.proxy.setIpGroup` (`client.api.computers.proxy.setIpGroup`), grant that group `curl` with `computers.proxy.setGroupPermission`, set the default to `deny` with `computers.proxy.setDefault`, and check that a call from outside the office is refused before you share the link (see the `api` namespace). The default applies computer-wide, so setting it to `deny` also blocks access to other programs when no group grants access. Before changing it, grant the programs you still use to appropriate groups, or run the bridge on a computer that serves nothing else. Review existing group permissions, including wildcard grants: another group may still grant access to curl outside the office. Office-group callers can reach the whole curl kit, not only this alias.

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

**Step 2 — fetch.** `jobs.getResult` returns just the upstream body (under `.data` of the SDK result); `jobs.get` returns the full record (timing, headers, and the request as run, with credentials shown as `[REDACTED]`).

```typescript
const { data: body } = await client.curl.jobs.getResult(jid);
const full = await client.curl.jobs.get(jid);
```

### 10. Storage triage — purge files older than N days

**Goal:** keep storage tidy by deleting old downloads. These examples purge date-indexed downloads older than the cutoff, read from the `by-date/` index because the date is in the path, and can leave downloads without a date link (the link is best-effort). Also review `by-job/` entries before deletion. Their `created_at` values come from filesystem creation time and fall back to the current listing time when unavailable, so those values alone cannot guarantee a complete age-based purge. The listing is newest first, so the old entries are on the last pages: collect every page before deleting anything, because each delete shifts the pages after it.

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

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.curl.jobs.cancel()` returns `Promise<CurlJobsCancelResponse>`. `Item<R>` in a pagination helper's Returns is shorthand on this page, not an exported type: the element type of the item array the helper reads from response `R`, at the path the same line names. A pagination helper written `xAll(/* the arguments of x */)` takes exactly the arguments of `x`, described under `x`.

**Services** (the ones the notes and examples above call most come first):

- `client.curl`: run
- `client.curl.jobs`: cancel, connect, delete, get, getResult, list, listAll, listIterator, stream
- `client.curl.storage`: delete, get, list, listAll, listIterator
- `client.curl.schedules`: create, delete, get, list, listAll, listIterator, update
- `client.curl.sessions`: delete, get, list, listAll, listCookies, listIterator
- `client.curl.channel`: connect
- `client.curl.kit`: getHealth, getMetrics

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the "Shared parameters" table of the method's service section when the name is there, else in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `page` | `number` | query | No | 1-based page number (optional) |
| `limit` | `number` | query | No | Items per page (optional; current handler returns all items when omitted) |

### `client.curl` (1) — cURL execution endpoints

#### `run` — Run one HTTP request through the curl service. `mode: 'async'` answers 202 with the job; `response: 'json'` answers the response wrapped in JSON with timing; otherwise `data` is the upstream body, parsed by its Content-Type (JSON to a value, text to a string, binary to an ArrayBuffer).

```typescript
client.curl.run(data: Omit<NonNullable<CurlRunRequest> & Required<Pick<NonNullable<CurlRunRequest>, "mode">>, "mode"> & { mode: "async" }, options?: object)  // → Promise<ApiResponse<AsyncJobAccepted>>
client.curl.run(data: Omit<NonNullable<CurlRunRequest> & Required<Pick<NonNullable<CurlRunRequest>, "response">>, "response"> & { response: "json" }, options?: object)  // → Promise<ApiResponse<JsonResponse>>
client.curl.run(data: NonNullable<CurlRunRequest>, options?: object)  // → Promise<ApiResponse<unknown>>
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `Omit<NonNullable<CurlRunRequest> & Required<Pick<NonNullable<CurlRunRequest>, "mode">>, "mode"> & { mode: "async" }` | body | Yes | Shape: `CurlRequest` under Body schemas. |

**Returns:** see each form above  |  **HTTP:** `POST /api/v1/curl/request`
**CLI:** `hoody curl run --url <url>`

---

### `client.curl.jobs` (9) — Job management endpoints

**Shared parameters of `client.curl.jobs`:**

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique job identifier (UUID format) |

#### `cancel` — Cancel a pending or running job; the record stays. A job that has already finished is left unchanged.

```typescript
client.curl.jobs.cancel(id: string, options?: object)
```

**HTTP:** `DELETE /api/v1/curl/jobs/{id}`
**CLI:** `hoody curl jobs cancel <id>`

---

#### `connect` — Subscribe to job events over WebSocket

```typescript
client.curl.jobs.connect(options?: { job_id?: string; since?: number; incarnation?: string }, _templateVars?: { projectId?: string; computerId?: string; serviceIndex?: string | number; serverName?: string; server?: string }, wsOptions?: { reconnect?: boolean; connectTimeoutMs?: number; transport?: 'auto' | 'ws' })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | query | No | Optional job ID filter |
| `since` | `number` | query | No | Resume cursor: the last `seq` (or `replay_boundary.max_seq`) received; `0` for everything still kept. The lifecycle events after it are replayed first, then a `replay_boundary` frame |
| `incarnation` | `string` | query | No | The `incarnation` of the last control frame received; a different one means the server restarted since |

**Returns:** `Promise<CurlJobsConnectWebSocket>` — an unconnected wrapper: register handlers, then `await ws.connect()`  |  **HTTP:** `GET /api/v1/curl/ws`

---

#### `delete` — Permanently delete a finished job's record and its saved downloads. A pending or running job is refused with 409 JOB_NOT_FINISHED: cancel it first.

```typescript
client.curl.jobs.delete(id: string, options?: object)
```

**HTTP:** `DELETE /api/v1/curl/jobs/{id}?purge=true`
**CLI:** `hoody curl jobs delete <id>`

---

#### `get` — Get detailed job information

```typescript
client.curl.jobs.get(id: string)
```

**HTTP:** `GET /api/v1/curl/jobs/{id}`
**CLI:** `hoody curl jobs get <id>`

---

#### `getResult` — Get job response body

```typescript
client.curl.jobs.getResult(id: string)
```

**Returns:** `Promise<ApiResponse<unknown>>`  |  **HTTP:** `GET /api/v1/curl/jobs/{id}/result`
**CLI:** `hoody curl jobs result get <id>`

---

#### `list` — List all async jobs

```typescript
client.curl.jobs.list(options?: { page?: number; limit?: number })
```

**HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `listAll` — List all async jobs (collect all pages)

```typescript
client.curl.jobs.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<CurlJobsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `JobSummary`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `listIterator` — List all async jobs (async iterator)

```typescript
client.curl.jobs.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<CurlJobsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `JobSummary`.  |  **HTTP:** `GET /api/v1/curl/jobs`
**CLI:** `hoody curl jobs list`

---

#### `stream` — Subscribe to job events over Server-Sent Events

```typescript
client.curl.jobs.stream(options?: { job_id?: string; since?: number; incarnation?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `job_id` | `string` | query | No | Optional job ID filter |
| `since` | `number` | query | No | Resume cursor: the last `seq` (SSE `id:`) received; `0` for everything still kept. Wins over `Last-Event-ID` |
| `incarnation` | `string` | query | No | The `incarnation` of the last `lagged` event received; a different one means the server restarted since |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /api/v1/curl/sse`
**CLI:** `hoody curl jobs stream`

---

### `client.curl.storage` (5) — Storage management endpoints

#### `delete` — Delete a saved file or directory

```typescript
client.curl.storage.delete(path: string, options?: { recursive?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Relative path to a file or directory in storage |
| `recursive` | `boolean` | query | No | `true` deletes a directory and everything in it (default false) |

**HTTP:** `DELETE /api/v1/curl/storage/{path}`
**CLI:** `hoody curl storage delete <path>`

---

#### `get` — Download a saved file

```typescript
client.curl.storage.get(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Relative path to file in storage (supports nested paths) |

**Returns:** `Promise<ApiResponse<ArrayBuffer>>`  |  **HTTP:** `GET /api/v1/curl/storage/{path}`
**CLI:** `hoody curl storage get <path>`

---

#### `list` — List all saved downloads

```typescript
client.curl.storage.list(options?: { page?: number; limit?: number })
```

**HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`

---

#### `listAll` — List all saved downloads (collect all pages)

```typescript
client.curl.storage.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<CurlStorageListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `StorageEntry`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`

---

#### `listIterator` — List all saved downloads (async iterator)

```typescript
client.curl.storage.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<CurlStorageListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `StorageEntry`.  |  **HTTP:** `GET /api/v1/curl/storage`
**CLI:** `hoody curl storage list`

---

### `client.curl.schedules` (7) — Schedule management endpoints

#### `create` — Create a recurring scheduled job

```typescript
client.curl.schedules.create(data: CurlSchedulesCreateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `CurlSchedulesCreateRequest` | body | Yes | Shape: `CurlCreateScheduleRequest` under Body schemas. |

**HTTP:** `POST /api/v1/curl/schedule`
**CLI:** `hoody curl schedules create --cron <cron> --request-url <request-url>`

---

#### `delete` — Delete a schedule

```typescript
client.curl.schedules.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier |

**HTTP:** `DELETE /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules delete <id>`

---

#### `get` — Get schedule details

```typescript
client.curl.schedules.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier (UUID format) |

**HTTP:** `GET /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules get <id>`

---

#### `list` — List all scheduled jobs

```typescript
client.curl.schedules.list(options?: { page?: number; limit?: number })
```

**HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `listAll` — List all scheduled jobs (collect all pages)

```typescript
client.curl.schedules.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<CurlSchedulesListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `ScheduledJob`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `listIterator` — List all scheduled jobs (async iterator)

```typescript
client.curl.schedules.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<CurlSchedulesListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `ScheduledJob`.  |  **HTTP:** `GET /api/v1/curl/schedule`
**CLI:** `hoody curl schedules list`

---

#### `update` — Update a schedule's cron expression, request or enabled state

```typescript
client.curl.schedules.update(id: string, data: CurlSchedulesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Unique schedule identifier |
| `data` | `CurlSchedulesUpdateRequest` | body | Yes | Shape: `CurlUpdateScheduleRequest` under Body schemas. |

**HTTP:** `PATCH /api/v1/curl/schedule/{id}`
**CLI:** `hoody curl schedules update <id>`

---

### `client.curl.sessions` (6) — Session management endpoints

#### `delete` — Delete a session

```typescript
client.curl.sessions.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier to delete |

**HTTP:** `DELETE /api/v1/curl/sessions/{id}`
**CLI:** `hoody curl sessions delete <id>`

---

#### `get` — Get session details

```typescript
client.curl.sessions.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier (caller-provided string) |

**HTTP:** `GET /api/v1/curl/sessions/{id}`
**CLI:** `hoody curl sessions get <id>`

---

#### `list` — List all cookie sessions

```typescript
client.curl.sessions.list(options?: { page?: number; limit?: number })
```

**HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

#### `listAll` — List all cookie sessions (collect all pages)

```typescript
client.curl.sessions.listAll(/* the arguments of list */)
```

**Returns:** `Promise<Item<CurlSessionsListResponse>[]>` — every item of `data.items`, pages collected from the page you pass, the first by default (`list()` fetches one page). Each item is `Session`. `listIterator()` streams the same items instead of collecting them.  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

#### `listCookies` — Get session cookies only

```typescript
client.curl.sessions.listCookies(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Session identifier |

**HTTP:** `GET /api/v1/curl/sessions/{id}/cookies`
**CLI:** `hoody curl sessions cookies list <id>`

---

#### `listIterator` — List all cookie sessions (async iterator)

```typescript
client.curl.sessions.listIterator(/* the arguments of list */)
```

**Returns:** `AsyncGenerator<Item<CurlSessionsListResponse>, void, unknown>` — one item of `data.items` per step, the next page fetched on demand from the page you pass, the first by default (`list()` fetches one page). Each item is `Session`.  |  **HTTP:** `GET /api/v1/curl/sessions`
**CLI:** `hoody curl sessions list`

---

### `client.curl.channel` (1) — WebSocket event endpoints

#### `connect` — Open a {@link CurlChannel} against this client's computer kit.

```typescript
client.curl.channel.connect(opts?: CurlChannelHelperOptions)
```

**Returns:** `Promise<CurlChannel>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.curl.kit` (2) — Operational endpoints (health and metrics)

#### `getHealth` — Service health check

```typescript
client.curl.kit.getHealth()
```

**HTTP:** `GET /api/v1/curl/health`
**CLI:** `hoody curl health`

---

#### `getMetrics` — Prometheus metrics

```typescript
client.curl.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /metrics`
**CLI:** `hoody curl metrics`


### Body schemas

- `CurlCreateScheduleRequest` — `{ cron*: string, enabled: bool|null, request*: CurlRequest }`
- `CurlUpdateScheduleRequest` — `{ cron: string|null, enabled: bool|null, request: CurlRequest|null }`
  - Partial update of a schedule. Every field is optional, at least one is required; absent fields keep their current value.
- `CurlRequest` — `{ auth_method: string|null, auth_password: string|null, auth_user: string|null, bearer_token: string|null, compressed: bool|null, connect_timeout: int|null, cookie: string|null, data: string|null, follow_redirects: bool|null, form: { [key: string]: string }|null, headers: { [key: string]: string }|null, insecure: bool|null, job_name: string|null, json: any, keepalive: bool|null, keepalive_time: int|null, max_filesize: int|null, max_redirects: int|null, method: string|null, mode: CurlExecutionMode|null, range: string|null, referer: string|null, response: ResponseMode|null, retry_count: int|null, retry_delay: int|null, save: bool|null, save_path: string|null, session_id: string|null, speed_limit: int|null, speed_time: int|null, tcp_nodelay: bool|null, timeout: int|null, url*: string, user_agent: string|null }`
  - cURL request parameters A JSON body carrying any field not listed here is rejected with `400`. This protects against silently sending a removed or not-yet-released field that would otherwise slip past validation unnoticed.
  - `max_redirects` — Maximum number of redirects to follow (at most 50).
  - `retry_count` — Number of retries after a failed attempt (at most 5).
  - `retry_delay` — Retry delay, in seconds (at most 60; default 1). The nth retry waits n times this value. Requires `retry_count` greater than 0. The total backoff must not exceed the server's cap, 300 seconds by default.
  - `save_path` — Relative path under this job's download directory (downloads/by-job/{job_id}). Must not be absolute or contain `..`.
- `CurlExecutionMode` — `"sync" | "async"`
- `ResponseMode` — `"transparent" | "json"`

