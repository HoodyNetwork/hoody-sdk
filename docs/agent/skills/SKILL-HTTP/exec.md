> _**HTTP skill · `exec` namespace** · ~21,547 tokens · hoody-sdk v1.0.0-beta.17_

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To give a script a **public** address: create an alias with `POST /api/v1/proxy/aliases` (`program: 'exec'`, and `target_path: '/<your-script>'` as the landing page) and you get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` in the URL. With the default `allow_path_override: true` the alias points at the WHOLE exec kit, not at one script: `target_path` only answers a request with no path, and every other path is forwarded as sent. That includes the kit's own management API under `/api/v1/exec/` (`POST /api/v1/exec/scripts/write`, `DELETE /api/v1/exec/scripts/delete`, …), so anyone holding the link may be able to write and run code in the container. Set `allow_path_override: false` to serve only the script: it is served at the alias root AND at `/<your-script>`, while any other path (sub-paths, assets and the management API under `/api/v1/exec/` included) is refused with `404 ALIAS_PATH_PINNED`, and the visitor's method, body and query keys the target does not set still reach the script. Either way, before sharing the alias, gate it with `* /api/v1/containers/{id}/proxy/permissions*` (a password, token, JWT or IP group, plus a `default` policy that denies what the group does not allow), exactly as for any kit URL.

**Trust model — read carefully.** Scripts run inside the container with full container privileges. They are NOT a sandbox for untrusted user code. Anyone who can invoke a script can do everything the script can do (read files, hit other kits, spawn processes). Use them for *your* APIs / cron logic / webhooks / ETL — don't expose them as an arbitrary code-execution surface to anonymous internet users without thinking through the gate stack first.

## When to use

- "Write me an API endpoint that does X" — default to a `hoody-exec` script before reaching for a Node app + framework.
- **"Build a workflow"** — multi-step pipelines (call agent A → validate with agent B → trigger action C, fan-out / fan-in, retry logic, conditional branches). One script = one orchestrator; each step is a function call inside the same Bun process, so no inter-service plumbing. State between requests via `bun:sqlite` (`Database`), the `sqlite` kit or the `files` kit for durable state, or the injected `shared` object for in-memory state (one per deployment, lost when the kit restarts or evicts an idle deployment from its cache). Variables declared in the script body do not carry over: the body runs again on every request.
- Webhooks (GitHub / Stripe / your CI), ETL pipelines, batch transformers, AI agent tools.
- Wrap a bash one-liner or Python helper as an HTTP API with zero scaffolding.
- Describe inputs / outputs in a companion `.openapi.json` file per script, auto-publish OpenAPI.
- Install and pin npm deps in the kit's one shared scripts-root `package.json` (every script uses the same versions), stream logs/metrics.

## When NOT to use

- **Untrusted-input code execution** — it's not sandboxed. Use a fresh container (or a stricter runtime) per untrusted caller.
- Long-lived processes / supervisors → `daemon` (exec is request/response).
- Schedules outliving the kit → `cron` (`exec.schedules.*` is in-process and dies with the kit).
- File I/O outside the scripts dir → `files`. Interactive shells → `terminal`. Container lifecycle → `api`. Headless web → `browser`.

## Prerequisites

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `POST /api/v1/exec/scripts/write`.
- **`require('hoody-sdk')` works with no install step** — it loads the installed npm package from the scripts root's `node_modules`. Exec installs a missing SDK automatically (at startup, or on a script's first `require`), honors a version you declare in the scripts-root `package.json` (an exact version or a tag stops updates, a range keeps them inside it), and stages a newer registry release that the next kit startup swaps in; a running kit never replaces its live copy. (Other `require()`d npm packages are auto-installed on first execution.) Import from `'hoody-sdk'`. The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the edge proxy, so all the usual capability gates / request hooks / proxy logs apply (see § Source IP Guard in `SKILL-HTTP.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out, but exec sets no account token and the CLI needs one (for a kit command too: it looks the container up). Put `HOODY_TOKEN=<token>` in the script's `.env` companion and pass the script's env on: `Bun.$\`hoody projects list\`.env({ ...process.env })`.

## Capability URL

→ See `SKILL-HTTP.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Write, validate, invoke

1. `POST /api/v1/exec/scripts/write` — `path`, `content`, `createDirs:true`, `validate:true` (default); 400 + `validation` on fail.
2. `GET /api/v1/exec/scripts/read` — confirm bytes.
3. `POST {EXEC_BASE_URL}/<path-without-extension>` — body parsed, return auto-serialised, output streamed.
4. `GET /api/v1/exec/scripts/list` — verify.

### 2. Pin deps, iterate

1. `POST /api/v1/exec/dependencies/check` → `POST /api/v1/exec/dependencies/install` → `POST /api/v1/exec/package/pin`.
2. `POST /api/v1/exec/validate/script` + `POST /api/v1/exec/validate/magic-comments` (`// @description`, `// @cors`, `// @timeout`).
3. `POST /api/v1/exec/scripts/write` (auto-validates unless `validate:false`).
4. `POST /api/v1/exec/cache/clear` — drop cached worker VMs, selected by `hostname` (optionally with `execId`) or `clearAll:true`; a call with neither is a 400. The `shared` state survives unless you also pass `clearState:true`.

### 3. Debug + OpenAPI

1. `GET /api/v1/exec/logs/list` / `POST /api/v1/exec/logs/search` / `POST /api/v1/exec/logs/read` (one JSON response; `lines` and `tail` pick the slice). For a live tail use `GET /api/v1/exec/logs/stream` (SSE).
2. `GET /api/v1/exec/monitor/active-requests` / `GET /api/v1/exec/monitor/stats`; per script, `GET /api/v1/exec/monitor/scripts` first, then `POST /api/v1/exec/monitor/script-performance` with one `scriptPath` from that listing (an empty body returns an empty `metrics` stub).
3. `GET /api/v1/exec/user-openapi/list`, then `POST /api/v1/exec/user-openapi/generate` / `GET /api/v1/exec/user-openapi/spec` (a document built from the current scripts) or `POST /api/v1/exec/user-openapi/merge`. Merge scans scripts only for the `directories` you name (`['scripts']` for the calling deployment's scripts directory — the `<subdomain|default>/<execId>` the kit URL names, unless you pass `subdomain` / `execId`) and otherwise merges just the `specs` you pass; it answers `{success, data}` with the document in `data`. None of the three writes anything to disk, so store a merge result yourself if you need to keep it. `POST /api/v1/exec/user-openapi/validate` checks one script's `.openapi.json` sidecar.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. A script may instead export one function per HTTP method (`export async function GET(request)`, `POST`, …; the first argument is a Web `Request`): `HEAD` falls back to `GET`, `OPTIONS` is answered automatically, and any other method without an export answers 405 with `Allow`. The pattern-normaliser never rewrites the stored file; it rewrites the code at load time on every request, independent of `validate`.
- **Reads redact secrets.** `GET /api/v1/exec/scripts/read` replaces the values of `// @token` and `// @ai-key` lines with `[REDACTED]`. Writing that content back keeps the stored secret for each placeholder; a placeholder with no stored secret to restore is refused.
- **`req.rawBody` holds the request bytes as received** (a Buffer), next to the parsed `req.body`, whenever the kit parses the body for you. Verify webhook signatures against `req.rawBody`; re-serialising `req.body` does not reproduce the sender's bytes. A script that declares `// @rawBody` gets neither field: `req` stays the raw request stream, so read and hash that stream yourself. The line must be exactly `// @rawBody` (or `// @rawBody true` / `false`): with any other text after it the line is ignored and the body is parsed. `GET` and `HEAD` bodies are never read.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `DELETE /api/v1/exec/scripts/delete` needs literal `confirm=true`.
- `POST /api/v1/exec/scripts/write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `GET /api/v1/containers/{id}/proxy/services` returning `[]` is normal (it lists only services named in proxy permission rules or hooks).
- `POST /api/v1/exec/schedules/trigger` and `GET /api/v1/exec/schedules/history` scope a relative `scriptPath` by the kit URL you call, like `POST /api/v1/exec/scripts/write`: through the `exec-1` kit URL, `tick.js` means `default/1/tick.js` (the `scriptRel` of `GET /api/v1/exec/schedules/list`), and a path that already starts with `default/1/` is kept as is. An absolute `scriptPath` is used as given (history converts it to the root-relative form); a script at the scripts root, outside any deployment folder, is reachable from a deployment URL only by its absolute path.
- `POST /api/v1/exec/scripts/write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- `PUT /api/v1/exec/magic-comments/update` and `GET /api/v1/exec/magic-comments/read` resolve `path` like `POST /api/v1/exec/scripts/write`: through the `exec-1` kit URL, `tick.js` is looked up as `default/1/tick.js` first (the `execId` / `subdomain` parameters pick another deployment), then as given relative to the scripts root, so the root-relative `default/1/tick.js` (the write's `resolvedPath`, or its `path` in `GET /api/v1/exec/scripts/list`) also works; the first that exists is used, and none answers 404 `Script not found`.
- `POST /api/v1/exec/magic-comments/bulk-update` with neither `directory` nor `execId` edits the calling deployment's own tree (`default/1` through `exec-1`); a `directory` resolves like a script path (under the calling deployment's tree first, then relative to the scripts root).
- `PUT /api/v1/exec/magic-comments/update` sets `// @schedule` (`comments.schedule`; an empty string removes it). The value is a 5-field cron expression (`minute hour day month weekday`) or a nickname (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`), always in UTC, one per file. `// @schedule-timeout <ms>` is the time limit of one scheduled run (the run is released, not stopped), as `@timeout` is for HTTP, where an unstarted response gets 504 and the script keeps running; HTTP requests keep `@timeout` (a scheduled run without it uses `@timeout`, else 30 s). It is registered at once, as by a write whose header has the line (no `POST /api/v1/exec/schedules/reload`); `GET /api/v1/exec/schedules/list` shows its `nextFire`.
- A `@schedule` fire bypasses the script's `@token`, and a script that also declares `@websocket` is not registered (`GET /api/v1/exec/schedules/history` records it as `incompatible`). The `curl` kit's schedules take 6 fields (seconds first); the `cron` namespace takes 5, in the container's own crontab.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every endpoint gets these script-scoped bindings, enabled by default (off with `// @ai false`; not on `globalThis`; `pre.js` / `post.js` get none): `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1` unless the kit runs with another `--ai-url`; default model **`hoody-ai/hoody-free`** unless `--ai-default-model` changes it). **No `require()`, no base URL, and no API key**: the key defaults to `container-<hash>`, and `// @ai-key` replaces it. Exec does not price, meter or refuse models; what a model costs and what happens without wallet credit is decided by the AI service. Override per-script with magic comments (`// @ai-model <provider/model>`, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a default system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).
- **How the built-in AI is called.** `ai` is a name in the script's own scope, not a global: `globalThis.ai` is undefined, a module the script imports does not see it (pass `ai` in), and `pre.js` / `post.js` get no AI helpers. Every helper returns the SDK result object, never a bare string: `(await ai.generate(prompt)).text`, `return (await ai.stream(prompt)).textStream` (streamed as `text/plain`), `(await ai.object({ schema, prompt })).object`. `ai.generate` also takes `{ prompt, system, messages, model, temperature, maxTokens }`. `<script>.system.md` beside the script, else `_system.md` in the same directory, is the default `system` of `ai.generate` / `ai.stream` / `ai.object` (never read it yourself); an explicit `system` option replaces it, and the raw `generateText` / `streamText` / `generateObject` get none, so pass `system` to them yourself. `@ai-model`, `@ai-temperature` and `@ai-max-tokens` set the defaults of the `ai` helpers; `@ai-model` also picks the injected `model` that `generateText({ model, prompt })` takes.
- **State between requests.** The script body runs again on every request, so its top-level `let` / `const` / `Map` start empty each time. `shared` is one object per deployment (`<hostname>/<execId>`), the same object for every script of that deployment, kept between requests in both modes. `// @mode worker` additionally keeps `globalThis` values between requests (one VM per deployment, shared by its worker scripts); the default serverless mode builds a fresh VM per request. Both are memory only: lost on restart, and dropped together when the kit evicts an idle deployment from its bounded cache (`--vm-cache-cap`, default 1000 deployments). Keep anything that must last in `bun:sqlite` (`Database` is predefined), the `sqlite` kit or the `files` kit.
- **Request body.** `req.body` is parsed JSON, a urlencoded form as an object (a repeated key keeps its last value), or for `multipart/form-data` the text fields only; any other content type is a Buffer. Uploaded files are in `req.files`, one entry per file (empty files and repeated field names included): `{ fieldName, filename, type, size, data }` with `data` a Buffer and `type` the MIME type the runtime reports, which may differ from the part's declared Content-Type and can come from the filename (observed on Bun 1.4.2: `a.pdf` sent as `text/plain` gave `application/pdf`, `a.txt` gave `text/plain;charset=utf-8`, an unknown extension gave `""`), so check the bytes when the type matters.
- **`pre.js` / `post.js` are per directory.** They run around each HTTP request to a script in their own directory (its `index` included) and never for subdirectories or parent directories, so `admin/pre.js` does not guard `admin/deep/x.js`. `.ts` works too. A non-null return from `pre.js` (or a response it already ended) skips the script; to pass data on, set it on `req`. `post.js` receives the script's return value as `mainResult`, and a non-null return replaces the response. `post.js` still runs after a script that answered with `res.json()` / `res.send()`, but that answer stays as sent and `res.setHeader` then throws: check `res.headersSent` before touching the response. `post.js` also runs after a `pre.js` stop, with the `pre.js` value as `mainResult` (return nothing to keep it). A WebSocket connection runs `pre.js` once, before the handshake (never per message, never `post.js`): a non-null return or a started or ended `res` refuses the upgrade with that error status (else 403) and no socket opens (`req.body` is `null` on an upgrade, so body-reading checks must allow for it); what it sets on `req` reaches `ws.open(socket, req)`; `// @websocket-pre false` in the socket script skips it.
- **WebSocket scripts register handlers; they do not handle upgrades.** Both `// @websocket` and `// @mode worker` are required, or the socket is closed with `4400`. Assign `ws.open = (socket, req) => …`, `ws.message = (socket, data) => …`, `ws.close = (socket, code, reason) => …` (or `ws.on('message', …)`); never start a `ws` server or call `handleUpgrade`. The script body runs when the first socket connects, with `metadata.method === 'WEBSOCKET_INIT'`: once per script, or for a dynamic route once per route value while it has sockets (after that room's last socket closes, the next connection runs the body again with fresh variables; a changed script file serves new sockets from a fresh run, while sockets already open keep the old handlers and connection pool, so a broadcast from one run does not reach the other). Its top-level variables are shared by all sockets of that run, and its `req` / `metadata` are the first socket's request (`metadata.query` its query string alone, `metadata.parameters` its route params), so read each socket's own query from `socket.data.query` (or the `req` that `ws.open(socket, req)` receives) and keep per-connection state on `socket.data` (which also holds `headers`, `ip`). `data` is a string for text frames and a Buffer for binary ones; `socket.send` / `ws.broadcast(data, exceptSocket?)` send a plain object or array as JSON text and a string, Buffer or other binary value as given. An HTTP request to the same script re-runs the body and sees the same `ws.connections` / `ws.broadcast`.
- **Helper files and other directives.** Load a file of your own with `await import('./lib/x.js')` (resolved from the script's file). The helper exports with `export function x` or `module.exports = { x }`, then `const { x } = await import(…)`; a bare `module.exports = fn` arrives as `.default`. The helper can `require('./sibling.js')`: a helper's relative paths count from the helper's own directory (a `./round.js` inside the helper `./lib/price.js` is the `round.js` next to that helper, not next to the script); `require('./lib/x.js')` from the script body works too (resolved from the script's file). A helper file runs in its deployment's context (the one `// @mode worker` scripts of that exec ID share): it sees the script's `fetch` and `process.env` (the script's `.env` values included), and its module-level state (`const items = []`, `globalThis.store ??= {}` in the helper) is kept between requests in both modes, separate per exec ID, in memory like `shared`. A relative helper path counted from the wrong directory (`require('../../lib/store.js')` one level too high) is looked up from each parent directory up to the deployment's own directory and loads the one file it matches, with a warning naming the path to write; several matches or none fail with the paths tried. The script's `process.env` is the kit's environment plus every `_default.env` from the scripts root down to the script's directory, then the script's own `<name>.env`, merged per variable (the nearest file wins). `__dirname` and `__filename` are not defined in the script itself (using one throws), and a relative path is not resolved from the script's directory: in the script and its helpers, `new Database('app.sqlite')`, `fs.writeFileSync('x.json', …)`, `Bun.write` and `process.cwd()` use the deployment's own data directory (persistent, separate per exec ID). Read a file that sits beside the script with `fs.readFileSync(require.resolve('./data.json'), 'utf8')`, or build its path from `import.meta.dirname`. `// @description …`, `// @tags a,b` and `// @label x` only describe the script for `GET /api/v1/exec/scripts/list` (which filters on `label` / `tags`) and change nothing at runtime. `// @enabled false` answers 404 without running the script; repeat `// @token` to accept several tokens; a caller sends the token as `Authorization: Bearer`, as the password of `Authorization: Basic`, as `X-Token` or as `?token=`, and only the first token found in that order is compared (a wrong Bearer token fails even beside a good `X-Token`; an `Authorization` header with another scheme, or a Basic value without a password, is skipped); `@token` takes one word (the rest of the line is ignored, with a warning). A returned object is always the JSON body: `return { status: 301, body }` answers 200 with that object, so set a status with `res.status()`.
- **`cookie` is v2.** `const { parseCookie, stringifySetCookie } = require('cookie')`: `parseCookie(req.headers.cookie ?? '')` reads cookies, `stringifySetCookie({ name: 'sid', value: 'abc', httpOnly: true, path: '/' })` writes one (`stringifySetCookie(name, value, options)` works too). The v1 `cookie.parse(header)` and `cookie.serialize(name, value, options)` also work in scripts (`require`, `POST /api/v1/exec/sdk/import`, the preloaded `cookie`).
- **URL, query and CORS.** `req.url` is the path and query (`/x?a=1`), not a full URL. `metadata.query` is decoded like a form (`+` is a space) and keeps only the last value of a repeated key. On HTTP requests route params are merged into `metadata.query` and `metadata.parameters` (and a socket's `socket.data.query`) over query keys of the same name, so for the query string alone use `new URL(req.url, 'http://x').searchParams` (`.getAll('key')` for every value). By default each response reflects the caller's `Origin` and sends `Access-Control-Allow-Credentials: true`; `// @cors-credentials false` keeps the reflection without it. With any `@cors` line (`*` reflects any origin, `https://app.example` one origin, `none` blocks), credentials are sent only with `// @cors-credentials true`. For a literal `Access-Control-Allow-Origin: *`, call `res.setHeader('Access-Control-Allow-Origin', '*')` and add `// @cors-credentials false`: the policy is applied before the script runs, so the script's header is sent as set, but without that line `Access-Control-Allow-Credentials: true` goes out beside it and browsers refuse the pair on a credentialed request. These directives shape the script's own responses: an ordinary `OPTIONS` preflight is answered by the kit's global policy (reflected origin, credentials) and never reaches the script (platform hook dispatch is the exception).
- **`.md` URLs serve Markdown files, never scripts.** `/guide.md` serves the file `guide.md` as `text/markdown`, behind the `@token` of `guide.ts` / `guide.js` beside it; a script named `guide.md.ts` is never reached. (A proxy hook names its target script, so it can still run one for a `.md` URL.)

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — some segment of the path is a reserved directory name: `node_modules`, `.git`, `.hoody-cache`, `_sdk` or `_hoody`. The check is per segment and applies at any depth, so `api/node_modules/x.ts` is refused as surely as `node_modules/x.ts`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`POST /api/v1/exec/system/restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST https://{P}-{C}-exec-1.{N}.containers.hoody.com/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when the syntax and TS-transpile checks pass. A missing dependency is only a warning (the runtime installs it on first execution), and magic comments are parsed but never fail the write.

```bash
KIT="https://${P}-${C}-exec-1.${N}.containers.hoody.com"
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  -d '{
    "path": "echo.js",
    "content": "module.exports = (req, res) => res.json({ ok: true, body: req.body });\n"
  }'
```

**Step 2 — invoke `POST /echo`** (bare path, NOT `/api/v1/exec/echo`). Body is auto-parsed; the return value of `res.json(...)` is the wire body.

```bash
curl -sX POST "$KIT/echo" \
  -H 'Content-Type: application/json' \
  -d '{"hello":"world"}'
# → {"ok":true,"body":{"hello":"world"}}
```

**Step 3 — read it back.** `GET /api/v1/exec/scripts/read` returns the stored content (with `@token` / `@ai-key` values shown as `[REDACTED]`, see Quirks) + parsed `magicComments` + metadata.

```bash
curl -sf "$KIT/api/v1/exec/scripts/read?path=echo.js" | jq .content
```

### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `POST /api/v1/curl/request` / SDK calls.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "workflow.js",
  "content": "module.exports = async (req, res) => {\n  const callA = async () => ({ score: 0.91, label: 'spam' });\n  const checkB = async (a) => ({ verdict: a.score > 0.8 ? 'block' : 'allow' });\n  const actC  = async (v) => ({ executed: v === 'block' ? 'quarantined' : 'delivered' });\n  const a = await callA();\n  const b = await checkB(a);\n  const c = await actC(b.verdict);\n  res.json({ a, b, c });\n};\n"
}
JSON
curl -sX POST "$KIT/workflow" -H 'Content-Type: application/json' -d '{}'
# → {"a":{"score":0.91,"label":"spam"},"b":{"verdict":"block"},"c":{"executed":"quarantined"}}
```

### 3. Webhook receiver with HMAC signature verification

**Goal:** GitHub-style `X-Hub-Signature-256` verification using `crypto.timingSafeEqual`. Reject 401 on bad sig.

**Step 1 — write the verifier.** No `npm install` needed — `crypto` is a runtime built-in.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "webhook.js",
  "content": "const crypto = require('crypto');\nconst SECRET = process.env.WEBHOOK_SECRET || 'shhh-test';\nmodule.exports = async (req, res) => {\n  const sig = req.headers['x-hub-signature-256'] || '';\n  const body = req.rawBody || Buffer.alloc(0);  // the bytes as received\n  const expect = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');\n  let ok = false;\n  try { ok = sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch {}\n  if (!ok) return res.status(401).json({ error: 'bad sig' });\n  res.json({ accepted: true, payload: req.body });\n};\n"
}
JSON
```

**Step 2 — fire a signed request.** Verify against `req.rawBody`, the request bytes exactly as received: `req.body` is already parsed (an object for JSON), and re-serialising it changes the bytes whenever the sender's spacing or number spelling differs, which breaks the signature. Use `req.body` only after the check passes.

```bash
BODY='{"event":"push","ref":"main"}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'shhh-test' | awk '{print $2}')"
curl -sX POST "$KIT/webhook" \
  -H 'Content-Type: application/json' \
  -H "X-Hub-Signature-256: $SIG" \
  -d "$BODY"
# → {"accepted":true,"payload":{"event":"push","ref":"main"}}
```

### 4. Pin npm deps — `POST /api/v1/exec/dependencies/check` → `POST /api/v1/exec/dependencies/install` → `POST /api/v1/exec/package/pin`

**Goal:** add `left-pad` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```bash
curl -sX POST "$KIT/api/v1/exec/dependencies/check" \
  -H 'Content-Type: application/json' \
  -d '{"code":"const leftPad = require(\"left-pad\");"}'
# → {"missing":["left-pad"], ...}
```

**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"left-pad@1.3.0"`).

```bash
curl -sX POST "$KIT/api/v1/exec/dependencies/install" \
  -H 'Content-Type: application/json' \
  -d '{"modules":["left-pad"]}'
```

**Step 3 — pin to exact versions.** Each declared range is replaced by the version actually installed, provided it satisfies the range. For a range, a package that is not installed, or whose installed version falls outside the range, is listed under `unpinnable` with the reason instead. A declaration that is already an exact version is left as it is, without checking that it is installed.

```bash
curl -sX POST "$KIT/api/v1/exec/package/pin" \
  -H 'Content-Type: application/json' \
  -d '{"packages":["left-pad"]}'
# → {"pinned":["left-pad: ^<version> → <version>"], ...}
```

### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```bash
CODE='// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });'

# Full validation: syntax + TS transpile + deps + magic comments
curl -sX POST "$KIT/api/v1/exec/validate/script" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$CODE" '{code:$c}')"

# Just the magic-comment parser
curl -sX POST "$KIT/api/v1/exec/validate/magic-comments" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --arg c "$CODE" '{code:$c}')"
```

If `valid:true`, ship it via `POST /api/v1/exec/scripts/write` (default `validate:true` re-runs the checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies}` slots tell you which checker rejected it. Magic comments never make a script invalid: a directive whose value cannot be used falls back to its default and is reported in `results.magicCommentWarnings` (or `warnings` from `POST /api/v1/exec/validate/magic-comments`) while `valid` stays `true`, so read those warnings separately. The two paths differ on one point: `POST /api/v1/exec/validate/script` counts a `require()`d module that is not installed yet as a failure, while `POST /api/v1/exec/scripts/write` only warns about it and the runtime installs it on first execution. A `valid:false` whose only failing slot is `dependencies` can be written for the runtime to install when `results.dependencies.invalidModules` is empty, so the failure is only missing packages. A versioned import specifier such as `require('lodash@4')` is listed in `invalidModules` and refused at runtime: pin the version in the scripts-root `package.json` (`POST /api/v1/exec/package/pin`) and import the bare package name.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry in a single OpenAPI 3.0 document the proxy can serve. Request/response shapes come only from a script's companion `.openapi.json` file; a script without one gets a generic `GET` entry, and a companion that cannot be read or parsed leaves that script out and is listed under `x-schema-errors` in the document.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```bash
curl -sf "$KIT/api/v1/exec/user-openapi/list" | jq '.data.scripts[] | {path, routePath, hasSchema}'
```

**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```bash
curl -sf "$KIT/api/v1/exec/user-openapi/spec?format=json" > /tmp/user-scripts.openapi.json
```

**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `POST /api/v1/exec/user-openapi/merge`. Merge generates from the scripts only for the `directories` you name (`scripts` means the calling deployment's scripts directory, not every deployment's); without them it merges just the `specs` you pass. It answers `{success, data}` with the merged document in `data`.

```bash
# /tmp/layer.json holds one hand-written OpenAPI document object
curl -sX POST "$KIT/api/v1/exec/user-openapi/merge" \
  -H 'Content-Type: application/json' \
  -d "$(jq -nc --slurpfile l /tmp/layer.json '{directories:["scripts"], specs:$l}')" \
  | jq .data > /tmp/merged.openapi.json
```

`POST /api/v1/exec/user-openapi/merge` and `POST /api/v1/exec/user-openapi/generate` only RETURN a document; neither writes anything, and `GET /api/v1/exec/user-openapi/spec` (step 2) regenerates from the scripts on every call, so it never shows a merge. Store the merged document yourself if you need to keep or publish it. `POST /api/v1/exec/user-openapi/validate` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `GET /api/v1/exec/logs/list` returns kit-wide log files; `POST /api/v1/exec/logs/read` slices a specific one.

```bash
# Discover available log files
curl -sf "$KIT/api/v1/exec/logs/list" | jq '.logs[] | {name, size, modified}'   # entries key on `name`, not `file`

# Read last 200 lines of a specific file
curl -sX POST "$KIT/api/v1/exec/logs/read" \
  -H 'Content-Type: application/json' \
  -d '{"file":"<name-from-logs/list>","lines":"200","tail":true}'

# Live-stream (SSE)
curl -N "$KIT/api/v1/exec/logs/stream?file=<name-from-logs/list>&follow=true"
```

Per-request execution logging is ON by default (`@log-level` defaults to `standard`); `// @log-level none` turns that logging off for the script. The kit's separate access log still records every request to it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `GET /api/v1/exec/monitor/stats` is a single snapshot; `GET /api/v1/exec/monitor/active-requests` lists in-flight script HTTP requests (for WebSocket counts use `GET /api/v1/exec/monitor/stats` `websocket.active`, or each script's `activeWs` from `GET /api/v1/exec/monitor/scripts`); `GET /api/v1/exec/monitor/scripts` lists every script with traffic, with its request and error counters (sort by `requests`, `errors`, `p95`, `ws_active` or the default `lastActivity`); `POST /api/v1/exec/monitor/script-performance` then reports on ONE script, named by the `scriptPath` from that listing. An empty body returns the stub `{"metrics":{}}`, which means "no script asked for", not "no traffic".

```bash
curl -sf "$KIT/api/v1/exec/monitor/stats" \
  | jq '{uptime, requests, websocket, cron, cache}'

curl -sf "$KIT/api/v1/exec/monitor/active-requests" | jq .

# Hottest scripts first; scriptPath is root-relative (e.g. default/1/echo.js)
curl -sf "$KIT/api/v1/exec/monitor/scripts?sort=requests&limit=10" \
  | jq '.scripts[] | {scriptPath, total: .http.total, errors: .http.errors}'

curl -sX POST "$KIT/api/v1/exec/monitor/script-performance" \
  -H 'Content-Type: application/json' -d '{"scriptPath":"default/1/echo.js"}' | jq .
```

For Prometheus scraping, `GET /api/v1/exec/monitor/metrics` returns text/plain in standard exposition format.

### 9. Wrap a bash one-liner as an HTTP API with `Bun.$`

**Goal:** turn `df -h /` into a JSON HTTP endpoint with no scaffolding. `Bun.$` is in scope inside any script.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "disk-usage.js",
  "content": "module.exports = async (req, res) => {\n  const out = await Bun.$`df -h --output=source,size,used,avail,target /`.text();\n  res.json({ disk: out.trim().split('\\n').slice(1).map(l => l.split(/\\s+/)) });\n};\n"
}
JSON
curl -sf "$KIT/disk-usage"
# → {"disk":[["/dev/<device>","<size>","<used>","<avail>","/"]]}
```

Same pattern works for `python3 -c "..."`, `ffmpeg`, native binaries, anything on `$PATH`. The script handler runs inside the container as a normal process.

### 10. In-process schedule via `@schedule` directive

**Goal:** fire a script every 5 minutes WITHOUT the `cron` namespace. The schedule lives inside the kit; if the kit restarts, the schedule re-registers from disk on boot. (For schedules that must survive a kit-down — use the `cron` namespace instead.)

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log. A scheduled fire has no HTTP caller, so the script's `res.json` body goes nowhere; `POST /api/v1/exec/schedules/trigger` (step 3) reports the fire outcome instead, not that body.

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "path": "tick.js",
  "content": "// @schedule */5 * * * *\n// @description Heartbeat — fires every 5 minutes\nmodule.exports = async (req, res) => {\n  console.log('[tick] fired at', new Date().toISOString());\n  res.json({ ok: true, ts: Date.now() });\n};\n"
}
JSON
```

**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, the absolute on-disk `scriptPath`, and `scriptRel`, the same path relative to the scripts root (e.g. `default/1/tick.js`). Either one is what step 3 needs.

```bash
curl -sf "$KIT/api/v1/exec/schedules/list" \
  | jq '.schedules[] | {scriptPath, scriptRel, expression, registeredAt}'
```

**Step 3 — fire it on demand.** `scriptPath` accepts the absolute `scriptPath` from step 2 or its root-relative `scriptRel` (`default/1/tick.js`). A relative path is scoped by the kit URL like `POST /api/v1/exec/scripts/write`, so through the `exec-1` kit URL plain `tick.js` also names `default/1/tick.js`. `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only. The response is the fire outcome, `{triggered, scriptPath, runId, status, durationMs, error?}`.

```bash
curl -sX POST "$KIT/api/v1/exec/schedules/trigger" \
  -H 'Content-Type: application/json' \
  -d '{"scriptPath":"/hoody/storage/hoody-exec/scripts/default/1/tick.js","force":true}'
# → {"triggered":true,"runId":"...","status":"ok","durationMs":14}

curl -sf "$KIT/api/v1/exec/schedules/history?limit=5" | jq '.entries[]'
```

**Stop the schedule** by deleting the script (`DELETE /api/v1/exec/scripts/delete?path=tick.js&confirm=true`) or by rewriting it through `POST /api/v1/exec/scripts/write` without the `// @schedule` directive; every `POST /api/v1/exec/scripts/write` re-registers that file's schedule, so no separate `POST /api/v1/exec/schedules/reload` call is needed. Use `POST /api/v1/exec/schedules/reload` only after changing files some other way.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. Every endpoint has, as script-scoped bindings enabled by default (`// @ai false` turns them off; not on `globalThis`), `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key defaults to `container-<hash>`. Default model is **`hoody-ai/hoody-free`** (the kit's `--ai-default-model`). Override per-script with `// @ai-model <provider/model>`; what a model costs is up to the AI service, not exec. Set a default system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "path": "summarize.js",
  "content": "// @description One-line summary via built-in Hoody AI (no key or setup)\nmodule.exports = async (req, res) => {\n  const text = metadata.query.q || 'Say hello in one sentence.';\n  const result = await ai.generate('Summarize in one line: ' + text);\n  res.json({ summary: result.text });\n};\n"
}
JSON
```

**Step 2 — invoke it** (bare path on the exec kit URL). No key anywhere in the call:

```
https://{P}-{C}-exec-1.{N}.containers.hoody.com/summarize?q=Hoody+is+a+remote-first+computing+platform
# → {"summary":"..."}
```

For structured output use `(await ai.object({ schema, prompt })).object` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`. The system prompt in `summarize.system.md` is the default for `ai.generate` / `ai.stream` / `ai.object` with no code; do not read the file yourself (the raw `generateText` and friends need an explicit `system`).

### 12. WebSocket endpoint — rooms with broadcast, plus HTTP on the same path

**Goal:** a chat room per URL (`/rooms/red`, `/rooms/blue`): every text message goes to everyone in that room, sender included, and a plain HTTP request to the same path posts into the room. A WebSocket script never handles the upgrade itself: it declares `// @websocket` and `// @mode worker` (without both the socket is closed with `4400`) and assigns handlers on the injected `ws`.

**Step 1 — write `rooms/[room].js`** with `POST /api/v1/exec/scripts/write` as in example 1, path `rooms/[room].js`:

```javascript
// file: rooms/[room].js
// @mode worker
// @websocket
const room = metadata.parameters.room;   // runs ONCE per room in use (again after the room empties)
ws.open = (socket, req) => { socket.data.count = 0; };   // per-connection state lives on socket.data
ws.message = (socket, data) => {         // data: a string (a Buffer for binary frames)
  socket.data.count++;
  ws.broadcast(JSON.stringify({ room, text: data, n: socket.data.count }));   // this room only, sender included
};
ws.close = (socket, code, reason) => {};
if (metadata.method === 'WEBSOCKET_INIT') return;
// Plain HTTP on the same path: the body runs again per request and sees this room's sockets.
if (req.method === 'POST') ws.broadcast(JSON.stringify({ room, text: req.body.text, n: 0 }));
return { room, sockets: ws.connections.size };
```

**Step 2 — connect.** Top-level variables of the script are shared by every socket of the room; anything an HTTP request must share with the socket handlers goes in `shared`. Send objects as JSON text: `socket.send` and `ws.broadcast(text, exceptSocket)` take a string or a Buffer.

```javascript
const sock = new WebSocket(`wss://${P}-${C}-exec-1.${N}.containers.hoody.com/rooms/red`);
sock.onopen = () => sock.send('hi');
sock.onmessage = (e) => console.log(JSON.parse(e.data));   // → {"room":"red","text":"hi","n":1}
// From any HTTP client: POST /rooms/red {"text":"from http"} → {"room":"red","sockets":1}
```

### 13. Middleware — guard a directory with `pre.js`, wrap answers with `post.js`

**Goal:** every script in `admin/` requires `X-Admin-Key`, and every answer is wrapped in an envelope. `pre.js` / `post.js` act on HTTP requests to the scripts of their OWN directory only: `admin/reports/x.js` is not guarded until `admin/reports/` gets its own `pre.js`, and `admin/pre.js` also guards the `@websocket` scripts in `admin/` (once per connection, before the handshake).

**Step 1 — write the three files and the key** with `POST /api/v1/exec/scripts/write` (example 1): `admin/pre.js`, `admin/post.js`, `admin/users.js`, and `admin/_default.env` (its values show up in `process.env` of every script in `admin/`).

```
# file: admin/_default.env
ADMIN_KEY=change-me
```

```javascript
// file: admin/pre.js
const key = process.env.ADMIN_KEY;
if (!key || req.headers['x-admin-key'] !== key) {   // no key configured: refuse as well
  res.status(401);
  return { error: 'unauthorized' };   // a non-null return stops here: admin/users.js does not run
}
req.user = 'admin';                   // returning nothing continues; req carries data to the script
```

```javascript
// file: admin/post.js
if (res.statusCode >= 400 || res.headersSent) return;   // post.js also runs after a pre.js stop or a res.json() answer; returning nothing keeps it
res.setHeader('X-Envelope', 'v1');
return { ok: true, data: mainResult };   // mainResult = what the script returned
```

```javascript
// file: admin/users.js
return { users: [], by: req.user };   // return the value so post.js can wrap it; a res.json() answer is already sent
```

**Step 2 — call it.**

```
GET https://{P}-{C}-exec-1.{N}.containers.hoody.com/admin/users  with  X-Admin-Key: change-me → 200 {"ok":true,"data":{"users":[],"by":"admin"}}, X-Envelope: v1
GET https://{P}-{C}-exec-1.{N}.containers.hoody.com/admin/users  without the header           → 401 {"error":"unauthorized"}
```

### 14. File upload — `multipart/form-data` and `req.files`

**Goal:** accept a form with a `title` field and a `document` file. Text fields are in `req.body`; files are only in `req.files`, one `{ fieldName, filename, type, size, data }` entry per file (`data` is a Buffer; `type` is the MIME type the runtime reports, which may differ from the part's declared Content-Type and can come from the filename; empty files and repeated field names each get an entry).

**Step 1 — write `upload.js`** with `POST /api/v1/exec/scripts/write` (example 1):

```javascript
// file: upload.js
const doc = (req.files ?? []).find((f) => f.fieldName === 'document');
if (!doc) { res.status(400); return { error: 'document missing' }; }
return { title: req.body.title, filename: doc.filename, type: doc.type, size: doc.size, text: doc.data.toString('utf8') };
```

**Step 2 — post a form.** Submit a `multipart/form-data` request to the script's `/upload` URL (`https://{P}-{C}-exec-1.{N}.containers.hoody.com/upload`) with the text field `title=notes` and a file field named `document`. Uploading `a.txt` containing the five bytes `hello` returns `title: "notes"`, `filename: "a.txt"`, `size: 5` and `text: "hello"`; `type` is the MIME type reported by the runtime (`text/plain;charset=utf-8` on Bun 1.4.2).

## Reference

### `cache` (1) — Cache

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/cache/clear` | Clear Cache | `body` |

**Body shapes:**

- `POST /api/v1/exec/cache/clear` body — `{ hostname: string, execId: string, scriptPath: string, clearVm: bool=true, clearState: bool=false, clearAll: bool=false }`
  - `execId` — Exec Id
  - `scriptPath` — DEPRECATED: scriptPath-based clear returns HTTP 400. VM cache is keyed by hostname. Use hostname or clearAll=true instead.
  - `clearVm` — Clear Vm
  - `clearState` — Clear State
  - `clearAll` — Clear All

### `exec` (1) — Script Execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}` | Run a user script with any HTTP method (GET by default), a query, a body and headers | `?method` `?query` `?body` `?headers` |

**Param notes:**

- `path` — Script path (supports Next.js-style routing). Each segment is percent-encoded once; a leading / is optional.
- `method` — HTTP method; defaults to GET. Lowercase is accepted.
- `query` — Query parameters, sent as a real query string (never folded into the path).
- `body` — Request body (ignored for GET and HEAD). Objects are sent as JSON.
- `headers` — Per-request headers.

### `kit` (6) — API

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/health` | Health Check |  |
| `GET /api/v1/exec/monitor/metrics` | Prometheus Export |  |
| `GET /api/v1/exec/monitor/stats` | Get Stats |  |
| `GET /api/v1/exec/system/restart-status` | Get Restart Status |  |
| `GET /api/v1/exec/monitor/active-requests` | Get Active Requests |  |
| `POST /api/v1/exec/system/restart` | Restart Server | `body` |

**Body shapes:**

- `POST /api/v1/exec/system/restart` body — `{ graceful: bool=true, drainTimeoutMs: int=5000, reason: string="API restart request" }`
  - `drainTimeoutMs` — Drain Timeout Ms

### `logs` (5) — Logs

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/logs/clear` | Clear Logs | `?file` `?type` `?olderThanDays` `?confirm*` |
| `POST /api/v1/exec/logs/read` | Read Log | `body*` |
| `GET /api/v1/exec/logs/list` | List Logs | `?type` `?limit` |
| `POST /api/v1/exec/logs/search` | Search Logs | `body` |
| `GET /api/v1/exec/logs/stream` | Stream Logs | `?file*` `?follow` |

**Param notes:**

- `file` — File query parameter
- `type` — Which logs to clear. Any other value is refused with 400. _(on `DELETE /api/v1/exec/logs/clear`)_
- `olderThanDays` — OlderThanDays query parameter
- `confirm` — Safety confirmation; must be the literal `true` or the request is rejected with 400.
- `type` — Which logs to list. Any other value is refused with 400. _(on `GET /api/v1/exec/logs/list`)_
- `limit` — Limit query parameter
- `follow` — Keep the stream open and send new lines as they are written. Default `true`. Accepts `true`/`false`/`1`/`0`.

**Body shapes:**

- `POST /api/v1/exec/logs/read` body — `{ file: string|null, executionId: string|null, lines: int|null | string=100, tail: bool|null=true, search: string|null } (at least one of: file | executionId required)`
  - `file` — Log file to read, as `logs/list` names it: a file at the top of the logs directory, `access/access.log` or `cron/fires.log` (or a rotated `.…` copy), or `executions/<id>/<file>`. …
  - `executionId` — Execution whose log to read: 1 to 64 letters, digits, hyphens or underscores. An empty string is the same as omitting it.
  - `lines` — Maximum number of lines to return, 1 to 10000. Default 100. A string of digits in that range is also accepted (surrounding whitespace and leading zeros are ignored); any other value is refused with a 400.
- `POST /api/v1/exec/logs/search` body — `{ query: string, regex: string, files: string[], limit: int=1000, caseSensitive: bool=false }`
  - `regex` — Regular expression to search for, at most 64 characters (a longer one is refused with 400 `Invalid regex: pattern exceeds 64 chars`). Takes the place of `query` when both are sent.
  - `caseSensitive` — Case Sensitive

### `magicComments` (5) — API

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/magic-comments/read` | Read Magic Comments | `?path*` `?execId` `?exec_id` `?subdomain` |
| `GET /api/v1/exec/magic-comments/schema` | Get Magic Comments Schema |  |
| `PUT /api/v1/exec/magic-comments/update` | Update Magic Comments Handler | `?execId` `?exec_id` `?subdomain` `body*` |
| `POST /api/v1/exec/magic-comments/bulk-update` | Bulk Update Magic Comments | `body*` |
| `POST /api/v1/exec/validate/magic-comments` | Validate Magic Comments | `body*` |

**Param notes:**

- `path` — A script path resolved like scripts/read: under the call's scope first (`execId` / `exec_id` / `subdomain`, else the Host's `[<subdomain>.]…-exec-<execId>`), as `<subdomain|default>/<execId>/<path>` unless it already starts with that prefix; when no file is there, relative to the scripts directory (so `default/1/x.ts` still works from any Host). An absolute path inside the scripts directory is read relative to it. `resolvedPath` in the answer names the file used.
- `execId` — Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `subdomain` — Optional subdomain namespace used with execId for path resolution.

**Body shapes:**

- `PUT /api/v1/exec/magic-comments/update` body — `{ path*: string, comments*: { enabled: bool|null, token: string|null | string[], mode: "worker" | "serverless"|null, timeout: int|null | string, log-level: "none" | "minimal" | "standard" | "full" | "debug"|null, debug: bool|null, log-request-body: bool|null | "full" | "redacted" | "off", log-response-body: bool|null | "full" | "redacted" | "off", log-max-body-size: int|null | string, log-exclude-headers: string[]|null, log-retention-days: int|null, debug-instrument: bool|null, await-promises: bool|null, concurrent: bool|null | int, cors: string|null, cors-credentials: bool|null, cors-methods: string|null, cors-headers: string|null, cors-max-age: int|null, websocket: bool|null, websocket-pre: bool|null, ai: bool|null, ai-model: string|null, ai-temperature: number|null, ai-max-tokens: int|null, ai-key: string|null, description: string|null, tags: string[]|null, label: string|null, schedule: string|null, schedule-timeout: int|null | string, remote-messages: bool|null, remote-call: bool|null, remote-eval: bool|null, remote-token: "[REDACTED]"|null | object | object[], tokens: string[]|null }, dry_run: bool|null=false, execId: string, exec_id: string, subdomain: string }`
  - `comments` — Directives to set, keyed by directive name. … Keys that are not directives are ignored. A value that would not read back from the script as sent is refused with a 400, and so is a CORS sub-directive set in the same request as `cors: none`, which the script would ignore.
  - `dry_run` — When true, the file is not written: the response returns its `current` and `proposed` magic comments. When false (the default), the change is written and the response returns `previous` and `updated`.
  - `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `POST /api/v1/exec/magic-comments/bulk-update` body — `{ directory: string|null, execId: string|null, comments*: { enabled: bool|null, token: string|null | string[], mode: "worker" | "serverless"|null, timeout: int|null | string, log-level: "none" | "minimal" | "standard" | "full" | "debug"|null, debug: bool|null, log-request-body: bool|null | "full" | "redacted" | "off", log-response-body: bool|null | "full" | "redacted" | "off", log-max-body-size: int|null | string, log-exclude-headers: string[]|null, log-retention-days: int|null, debug-instrument: bool|null, await-promises: bool|null, concurrent: bool|null | int, cors: string|null, cors-credentials: bool|null, cors-methods: string|null, cors-headers: string|null, cors-max-age: int|null, websocket: bool|null, websocket-pre: bool|null, ai: bool|null, ai-model: string|null, ai-temperature: number|null, ai-max-tokens: int|null, ai-key: string|null, description: string|null, tags: string[]|null, label: string|null, schedule: string|null, schedule-timeout: int|null | string, remote-messages: bool|null, remote-call: bool|null, remote-eval: bool|null, remote-token: "[REDACTED]"|null | object | object[], tokens: string[]|null }, extension: string|null=".ts", recursive: bool|null=true, dry_run: bool|null=false }`
  - `directory` — Directory to edit, resolved like a script path: under the scope scripts/write would use for the same call first (the body `execId`, with the Host's subdomain and execId filling what the body leaves out: `<subdomain|default>/<execId>`), as `<scope>/<directory>` unless it already starts with that …
  - `execId` — Without `directory`: edits the whole `default/<execId>` tree (or `<subdomain>/<execId>` when taken from the Host). With `directory`: the execId of the scope `directory` resolves under first (`<subdomain|default>/<execId>/<directory>`, the subdomain from the Host). …
  - `dry_run` — When true, no file is written: the response lists every matching file under `would_affect`, each with its `current` and `proposed` magic comments, or with an `error` in their place when that file could not be processed. …
- `POST /api/v1/exec/validate/magic-comments` body — `{ code*: string }`

### `modules` (3) — Dependencies

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/dependencies/install` | Install Dependencies | `body*` |
| `GET /api/v1/exec/dependencies/bundled` | List Bundled Dependencies |  |
| `POST /api/v1/exec/dependencies/check` | Check Dependencies | `body*` |

**Body shapes:**

- `POST /api/v1/exec/dependencies/install` body — `{ modules*: string | string[], force: bool=false }`
  - `modules` — One npm module spec (e.g. `"lodash"`, `"axios@1.2.3"`) or an array of specs. Array form installs every module in sequence.
  - `force` — When true, reinstall modules that are already present instead of reporting them as `already-installed`.
- `POST /api/v1/exec/dependencies/check` body — `{ code: string|null, modules: string[]|null } (at least one of: code | modules required)`
  - `code` — Script source whose imports are checked. Used when `modules` is not given.
  - `modules` — Module specs to check (e.g. `"lodash"`, `"axios@1.2.3"`). When omitted or `null`, the modules imported by `code` are checked.

### `namespaces` (1) — List

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/list` | List All Exec Ids |  |

### `openapi` (6) — User-openapi

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/user-openapi/generate` | Generate User Open A P I | `body` |
| `GET /api/v1/exec/user-openapi/spec` | Serve Generated Spec | `?dir` `?directory` `?format` `?subdomain` `?execId` |
| `GET /api/v1/exec/user-openapi/schema` | Serve Schema File | `?file` `?path` `?subdomain` `?execId` |
| `GET /api/v1/exec/user-openapi/list` | List User Scripts | `?directory` `?dir` `?subdomain` `?execId` |
| `POST /api/v1/exec/user-openapi/merge` | Merge Open A P I Specs | `body` |
| `POST /api/v1/exec/user-openapi/validate` | Validate User Schema | `body*` |

**Param notes:**

- `dir` — Script directory to scan (absolute or relative to scripts-dir). Default: `scripts`. _(on `GET /api/v1/exec/user-openapi/spec`)_
- `directory` — Alias of `dir`. Ignored when `dir` is provided. _(on `GET /api/v1/exec/user-openapi/spec`)_
- `format` — Output format. `json` (default) or `yaml`.
- `subdomain` — Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. _(on `GET /api/v1/exec/user-openapi/spec`, `GET /api/v1/exec/user-openapi/list`)_
- `execId` — Limit scan to scripts under this execId. Falls back to the Host header when omitted. _(on `GET /api/v1/exec/user-openapi/spec`, `GET /api/v1/exec/user-openapi/list`)_
- `file` — Absolute or scripts-dir-relative path to the target script (e.g. `default/api/users/[id].ts`). Either `file` or `path` must be provided.
- `path` — Alias of `file`. Either `file` or `path` must be provided.
- `subdomain` — Resolve `file` under this subdomain. Falls back to the Host header when omitted. _(on `GET /api/v1/exec/user-openapi/schema`)_
- `execId` — Resolve `file` under this execId. Falls back to the Host header when omitted. _(on `GET /api/v1/exec/user-openapi/schema`)_
- `directory` — Script directory to list (absolute or relative to scripts-dir). Default: `scripts`. _(on `GET /api/v1/exec/user-openapi/list`)_
- `dir` — Alias of `directory`. Ignored when `directory` is provided. _(on `GET /api/v1/exec/user-openapi/list`)_

**Body shapes:**

- `POST /api/v1/exec/user-openapi/generate` body — `{ directory: string|null="scripts", directories: string[]|null, subdomain: string|null, execId: string|null, recursive: bool|null=true, includePatterns: string[]|null, excludePatterns: string[]|null, title: string|null="Generated API", description: string|null="Auto-generated from user scripts", version: string|null="1.0.0", baseUrl: string|null="http://localhost:8081" }` — What to scan and how to label the generated document. Every field is optional: `null` takes the default, as does an empty string for a text field, and a value of the wrong type is refused with a 400.
  - `directory` — Directory to scan, relative to the scripts directory. Default: the whole scripts directory, or the namespace when one applies.
  - `directories` — Alternative to `directory`. Only the first entry is scanned, and only when `directory` is not given; use `/user-openapi/merge` to combine several directories.
  - `subdomain` — Subdomain namespace: letters, digits, dots, hyphens and underscores, not made only of dots and not a reserved directory name (`node_modules`, `.git`, `.hoody-cache`, `_sdk`, `_hoody`, in any case); it is lowercased. Surrounding whitespace is ignored. … Any other value is refused with a 400.
  - `execId` — Exec ID namespace: 1 to 64 letters or digits, with no dots, hyphens or underscores (a hostname cannot carry them); it is lowercased. Surrounding whitespace is ignored. When omitted, `null` or empty, it is taken from the Host header. Any other value is refused with a 400.
  - `recursive` — Scan subdirectories.
  - `includePatterns` — File-name globs to include. Default `["*.js", "*.ts"]`.
  - `excludePatterns` — File-name globs to skip. Default `["*.test.js", "*.spec.ts", "*.test.ts", "*.spec.js"]`.
  - `title` — Document `info.title`.
  - `description` — Document `info.description`.
  - `version` — Document `info.version`.
  - `baseUrl` — URL of the document's only `servers` entry.
- `POST /api/v1/exec/user-openapi/merge` body — `{ directories: string[]|null, specs: object[]|null, title: string|null="Merged API", description: string|null="Combined OpenAPI specification", version: string|null="1.0.0", subdomain: string|null, execId: string|null }` — The documents to merge: directories to generate from, documents to include, or both. Every field is optional: `null` takes the default, as does an empty string for a text field, and a value of the wrong type is refused with a 400.
  - `directories` — Directories to generate a document from and merge, relative to the scripts directory.
  - `specs` — OpenAPI documents to merge, as objects; any other entry is refused with a 400. A document without a `paths` object contributes no paths.
  - `title` — Merged document `info.title`.
  - `description` — Merged document `info.description`.
  - `version` — Merged document `info.version`.
- `POST /api/v1/exec/user-openapi/validate` body — `{ file: string|null, path: string|null, subdomain: string|null, execId: string|null } (at least one of: file | path required)` — The script whose schema file to validate. Give `file` or `path` as a non-empty string; `null` or an empty string is the same as omitting it.
  - `file` — Script path relative to the scripts directory, e.g. `default/api/users.ts`. Its `.openapi.json` companion is the file validated. A non-string is refused with a 400.
  - `path` — Alias of `file`. Ignored when `file` is provided. A non-string is refused with a 400.

### `packages` (6) — Package

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/package/compare` | Compare Packages | `body` |
| `POST /api/v1/exec/package/init` | Init Package Json | `body` |
| `GET /api/v1/exec/package/read` | Read Package Json |  |
| `POST /api/v1/exec/package/install` | Install Packages | `body` |
| `POST /api/v1/exec/package/pin` | Pin Versions | `body` |
| `POST /api/v1/exec/package/update` | Update Package Json | `body` |

**Body shapes:**

- `POST /api/v1/exec/package/compare` body — `object` — Not read: the comparison takes no input. Send no body or `{}`.
- `POST /api/v1/exec/package/init` body — `{ name: string="hoody-exec-project", version: string="1.0.0", description: string="Hoody Exec project", force: bool=false }`
- `POST /api/v1/exec/package/install` body — `{ packages: string[], dev: bool=false, save: bool=true, force: bool=false }`
- `POST /api/v1/exec/package/pin` body — `{ packages: string[], module: string }`
- `POST /api/v1/exec/package/update` body — `{ dependencies: { [key: string]: string }|null, scripts: { [key: string]: string }|null, metadata: object|null, remove: string[]|null }`
  - `dependencies` — Dependencies to add or change, as package name → version range, e.g. `{"lodash": "^4.17.21"}`. A version that is not a string, or an invalid spec, is refused with a 400.
  - `scripts` — package.json `scripts` entries to add or change, as script name → command. A command that is not a string is refused with a 400.
  - `metadata` — Top-level package.json fields to set, as field → JSON value (`name`, `version`, `description`, …). `dependencies`, `devDependencies` and `scripts` here are ignored; use the fields of the same name. `null` for any field of this body is the same as omitting it.
  - `remove` — Package names to remove from `dependencies`.

### `routes` (3) — Route

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/route/discover` | Discover Routes | `body` |
| `POST /api/v1/exec/route/resolve` | Resolve Route | `body*` |
| `POST /api/v1/exec/route/test` | Test Route | `body*` |

**Body shapes:**

- `POST /api/v1/exec/route/discover` body — `{ baseDir: string="", includeMetadata: bool=false, hostname: string, execId: string }`
  - `baseDir` — Base Dir
  - `includeMetadata` — Include Metadata
  - `execId` — Exec Id
- `POST /api/v1/exec/route/resolve` body — `{ path*: string, hostname: string|null, execId: string|null }` — The URL path to resolve and the namespace to resolve it in.
  - `path` — URL path to resolve, e.g. `/api/users/42`. A non-string is refused with a 400.
  - `hostname` — Hostname namespace: letters, digits, dots, hyphens and underscores, not `.` or `..` and not a reserved directory name (`node_modules`, `.git`, `.hoody-cache`, `_sdk`, `_hoody`). Surrounding whitespace is ignored. … Any other value is refused with a 400.
  - `execId` — Exec ID namespace: 1 to 64 letters or digits, with no dots, hyphens or underscores (a hostname cannot carry them). Surrounding whitespace is ignored. When omitted, `null` or empty, it is taken from the Host header. Any other value is refused with a 400.
- `POST /api/v1/exec/route/test` body — `{ paths*: string[], hostname: string|null, execId: string|null }` — The URL paths to resolve and the namespace to resolve them in.
  - `paths` — URL paths to resolve, e.g. `["/api/users", "/api/users/42"]`. A non-string entry is refused with a 400.

### `schedules` (4) — Schedules

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/schedules/list` | List Schedules |  |
| `GET /api/v1/exec/schedules/history` | Schedule History | `?scriptPath` `?since` `?limit` `?includeRotated` `?cursor` |
| `POST /api/v1/exec/schedules/reload` | Reload Schedules | `body` |
| `POST /api/v1/exec/schedules/trigger` | Trigger Schedule | `body*` |

**Param notes:**

- `scriptPath` — Filter entries to one script. An absolute path must be inside scripts-dir. A relative path is scoped like scripts/read: on a host that names an execId (`-exec-<id>`) or a subdomain, it is read as `<subdomain|default>/<execId>/<path>` (`<subdomain>/<path>` when there is no execId) unless it already starts with that prefix; a `default.` subdomain counts as none. On any other host it is relative to scripts-dir. A path outside scripts-dir is 400. Optional.
- `since` — ISO 8601 lower bound on `ts`. Optional.
- `limit` — Max entries to return. Default 100, hard max 1000.
- `includeRotated` — When true, also scan rotated fires.log.* files (slower).
- `cursor` — Continuation token from a previous truncated response; resumes the backward scan where it stopped. Optional.

**Body shapes:**

- `POST /api/v1/exec/schedules/reload` body — `{ dry_run: bool=false }` — Request payload
  - `dry_run` — When true, compute the diff against the filesystem but do not apply. Returns the same shape with {added, kept, removed} lists.
- `POST /api/v1/exec/schedules/trigger` body — `{ scriptPath*: string, force: bool=false }`
  - `scriptPath` — Path of a script with a valid @schedule directive. An absolute path must be inside scripts-dir. … A path outside scripts-dir is 400.
  - `force` — When true, bypass the @token refusal. Use with care — this fires the script as cron (no token auth).

### `scripts` (13) — API

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/scripts/delete` | Delete Script | `?path*` `?confirm*` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/monitor/script-performance` | Get Script Performance | `body` |
| `POST /api/v1/exec/scripts/tree` | Get Script Tree | `?execId` `?exec_id` `?subdomain` `body` |
| `GET /api/v1/exec/scripts/list` | List Scripts | `?dir` `?filter` `?metadata` `?label` `?tags` `?mode` `?enabled` `?websocket` `?remote` `?recursive` `?include_comments` `?exhaustive` `?execId` `?exec_id` `?subdomain` |
| `GET /api/v1/exec/monitor/scripts` | List Monitor Scripts | `?limit` `?sort` |
| `POST /api/v1/exec/scripts/move` | Move Script | `?execId` `?exec_id` `?subdomain` `body*` |
| `GET /api/v1/exec/scripts/read` | Read Script | `?path*` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/validate/script` | Validate Script | `body*` |
| `POST /api/v1/exec/validate/dependencies` | Validate Dependencies | `body*` |
| `POST /api/v1/exec/validate/return-type` | Validate Return Type | `body*` |
| `POST /api/v1/exec/validate/syntax` | Validate Syntax | `body*` |
| `POST /api/v1/exec/validate/typescript` | Validate Type Script | `body*` |
| `POST /api/v1/exec/scripts/write` | Write Script | `?execId` `?exec_id` `?subdomain` `body*` |

**Param notes:**

- `path` — Path query parameter
- `confirm` — Safety confirmation; must be the literal `true` or the request is rejected with 400. `confirm=false` is refused too: the check is for the literal value, not for truthiness.
- `execId` — Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `subdomain` — Optional subdomain namespace used with execId for path resolution.
- `dir` — Dir query parameter
- `filter` — Filter query parameter
- `metadata` — Metadata query parameter
- `label` — Label query parameter
- `tags` — Tags query parameter
- `mode` — Mode query parameter
- `enabled` — Enabled query parameter
- `websocket` — Websocket query parameter
- `remote` — Keep only scripts by their remote operations: `any` (at least one of `@remote-messages`, `@remote-call`, `@remote-eval` is on), `none` (all off), or `messages` / `call` / `eval` (that one is on). Lists recursively and adds each script's `magicComments` and `remote` summary, like the other filters. Any other value is refused with 400.
- `recursive` — Recursive query parameter
- `include_comments` — Include_comments query parameter
- `exhaustive` — When true, list every entry below `dir` recursively with its `type` (file, directory, symlink, fifo, socket, block-device, character-device, unknown), in `entries` instead of `scripts`. Nothing is hidden (dot-files, node_modules, .git, .hoody-cache, _sdk, _hoody) and no symlink is followed. Combine only with `dir`, `execId` and `subdomain` (other options are refused with 400). The answer is complete or an error, never partial: more than 10000 entries is 422 with `details.code` `TOO_MANY_ENTRIES`; a name or link target that is not valid UTF-8 is 422 with `details.code` `NAME_NOT_UTF8` (`details.parent`, and the raw name as `details.nameHex`); an entry or directory that disappears or is replaced during the scan, or a directory whose dev, inode, mtime or ctime changed after it was read (checked once the scan is done), restarts it, and a tree still changing after 3 restarts is 409 with `details.code` `TREE_CHANGED`. This is best effort, for a tree nobody mutates concurrently: a change undone within one timestamp tick, or on a filesystem without fine timestamps, can go unseen.
- `limit` — Max number of scripts to return. Clamped to [1, 500]. Default 100.
- `sort` — Sort key. `lastActivity` (default) sorts by most recent activity; other keys sort descending by the matching metric.

**Body shapes:**

- `POST /api/v1/exec/monitor/script-performance` body — `{ scriptPath: string|null }` — The script to report on. Without `scriptPath` the response is `{"metrics": {}}`.
  - `scriptPath` — Script to report on, as `/monitor/scripts` lists it (relative to the scripts directory) or as an absolute path. An unknown script returns `{"metrics": {}}`; a non-string value is refused with a 400.
- `POST /api/v1/exec/scripts/tree` body — `{ baseDir: string="", maxDepth: int=10, includeMetadata: bool=false, execId: string, exec_id: string, subdomain: string }`
  - `baseDir` — Base Dir
  - `maxDepth` — Max Depth
  - `includeMetadata` — Include Metadata
  - `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `POST /api/v1/exec/scripts/move` body — `{ from*: string, to*: string, overwrite: bool=false, execId: string, exec_id: string, subdomain: string }`
- `POST /api/v1/exec/validate/script` body — `{ code*: string, language: string, extension: string, typecheck: bool=false }`
  - `typecheck` — When true, also type-check the code with the TypeScript compiler against the hoody-sdk declarations in `<scripts>/node_modules` and the script globals (`hoody`, `req`, `res`, …). Imports TypeScript cannot resolve are not reported; types from relative helper files are not checked (`any`). …
- `POST /api/v1/exec/validate/dependencies` body — `{ code*: string }`
- `POST /api/v1/exec/validate/return-type` body — `{ typeDefinition*: string, value*: any }`
  - `typeDefinition` — Type Definition
  - `value` — Arbitrary JSON value to validate against the declared return type
- `POST /api/v1/exec/validate/syntax` body — `{ code*: string }`
- `POST /api/v1/exec/validate/typescript` body — `{ code*: string, typecheck: bool=false }`
  - `typecheck` — When true, also type-check the code with the TypeScript compiler against the hoody-sdk declarations in `<scripts>/node_modules` and the script globals (`hoody`, `req`, `res`, …). Imports TypeScript cannot resolve are not reported; types from relative helper files are not checked (`any`). …
- `POST /api/v1/exec/scripts/write` body — `{ path*: string, content*: string, createDirs: bool=true, validate: bool=true, ifNotExists: bool=false, typecheck: bool=false, execId: string, exec_id: string, subdomain: string }`
  - `content` — Content. … In a `.js` / `.ts` script or a `.sdk.json` marker, a placeholder with no stored value (a new file, or no matching line) is refused with 400 and `details.code` `REDACTED_SECRET_UNRESOLVED`; the placeholder is never stored as a secret.
  - `createDirs` — Create Dirs
  - `ifNotExists` — … When true and the name already exists as anything (a file, a directory, a live or dangling symlink, which is never followed), nothing is written and the answer is 409; a symlinked ancestor directory is still 403. The existence check and the create are one atomic step, so of several concurrent creates (from any process) exactly one succeeds. …
  - `typecheck` — … Imports TypeScript cannot resolve are not reported; types from relative helper files are not checked (`any`). … Only with validation on, for a .js/.ts path: a type error refuses the write with 400 (`details.validation.typecheck.diagnostics`); a check that could not run does not.

### `sdkTypes` (1) — Sdk-types

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/sdk-types` | Get Sdk Types | `?kit` `?q` `?limit` `?raw` |

**Param notes:**

- `kit` — Kit to list: a client property (`files`, `api`, `exec`, `sqlite`, …), or `client` for the client's own methods (`withContainer`, `login`, …). Any letter case. An unknown kit is a 404 with `details.kits`.
- `q` — Words, all of which must appear in the method's path, name or summary (any letter case).
- `limit` — Most methods to return, 1 to 100 (default 20). `total` counts every match.
- `raw` — When true, also return the `.d.ts` text of the files declaring the returned methods (`dts`, at most 256 KB). Needs `kit` or `q`.

### `sdks` (4) — Sdk

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/sdk/{id}` | Delete S D K |  |
| `GET /api/v1/exec/sdk/{id}` | Get S D K |  |
| `POST /api/v1/exec/sdk/import` | Import S D K | `body*` |
| `GET /api/v1/exec/sdk/list` | List S D Ks |  |

**Param notes:**

- `id` — Id parameter

**Body shapes:**

- `POST /api/v1/exec/sdk/import` body — `{ execId: string|null, source_url*: string, source_auth: { type*: "bearer" | "basic", token: string, username: string, password: string } (at least one of: token | username+password required)|null, middleware: { pre: string|null, post: string|null }|null, magic_comments: { enabled: bool|null, token: string|null | string[], mode: "worker" | "serverless"|null, timeout: int|null | string, log-level: "none" | "minimal" | "standard" | "full" | "debug"|null, concurrent: bool|null | int, cors: string|null, websocket: bool|null }|null, force: bool|null=false }`
  - `execId` — Exec ID the SDK is imported under: 1 to 64 lowercase letters or digits. When omitted, it is taken from the Host header.
  - `source_url` — HTTPS URL of the OpenAPI document to import. It must name a domain (not an IP address), use port 443, and end in `.json`, `.yaml`, `/documentation/json` or `/documentation/yaml`.
  - `source_auth` — Credentials sent when fetching `source_url`: either `{"type": "bearer", "token": "…"}` or `{"type": "basic", "username": "…", "password": "…"}`. Credentials that could not be sent as given are refused with a 400, never dropped. Other members are ignored.
  - `middleware` — Middleware written next to the generated proxy files. Each member is JavaScript source, written as `pre.js` or `post.js` into every directory that receives a proxy. …
  - `magic_comments` — Magic-comment directives written into every generated proxy file, keyed by directive name. Only the members listed here are accepted; any other key is refused with a 400, and so is a value that would not read back from the generated file as sent. …

### `store` (3) — Shared-state

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/shared-state/clear` | Clear Shared State | `body` |
| `POST /api/v1/exec/shared-state/get` | Get Shared State | `body*` |
| `POST /api/v1/exec/shared-state/set` | Set Shared State | `body*` |

**Body shapes:**

- `POST /api/v1/exec/shared-state/clear` body — `{ hostname: string, execId: string, path: string, clearAll: bool=false }`
  - `execId` — Exec Id
  - `clearAll` — Clear All
- `POST /api/v1/exec/shared-state/get` body — `{ hostname*: string, execId: string, path: string }`
- `POST /api/v1/exec/shared-state/set` body — `{ hostname*: string, execId: string, path: string, value*: any, merge: bool=false }`
  - `value` — Arbitrary JSON value to store

### `templates` (6) — Templates

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/templates/create-custom` | Create Custom Template | `body*` |
| `DELETE /api/v1/exec/templates/delete-custom/{name}` | Delete Custom Template |  |
| `POST /api/v1/exec/templates/generate` | Generate From Template | `?execId` `?exec_id` `?subdomain` `body*` |
| `GET /api/v1/exec/templates/list` | List Templates | `?category` `?includeBuiltin` `?includeCustom` |
| `GET /api/v1/exec/templates/preview` | Preview Template | `?name*` `?variables` |
| `PUT /api/v1/exec/templates/update-custom/{name}` | Update Custom Template | `body` |

**Param notes:**

- `name` — Name parameter _(on `DELETE /api/v1/exec/templates/delete-custom/{name}`, `PUT /api/v1/exec/templates/update-custom/{name}`)_
- `execId` — Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `subdomain` — Optional subdomain namespace used with execId for path resolution.
- `category` — Filter templates to a single metadata category (e.g. `api`, `utility`). Omit to list all categories.
- `includeBuiltin` — Include built-in templates in the result set. Default `true`. Accepts `true`/`false`/`1`/`0`.
- `includeCustom` — Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`.
- `name` — Name query parameter _(on `GET /api/v1/exec/templates/preview`)_
- `variables` — Variables query parameter

**Body shapes:**

- `POST /api/v1/exec/templates/create-custom` body — `{ name*: string, code*: string, metadata: { category: string="custom", tags: string[], description: string="Custom template", params: string[], version: string="1.0.0", author: string="User" }|null }` — The template to create.
  - `name` — Template name: letters, digits, dots, hyphens and underscores, at most 64 characters, starting with a letter or digit and never containing `..`. A name already taken by a built-in template is refused with a 409.
  - `code` — Template source. It is stored after a generated metadata header. A non-string is refused with a 400.
  - `metadata` — Template metadata. An omitted member takes its default; a member of the wrong type, or a metadata value that is not an object, is refused with a 400.
- `POST /api/v1/exec/templates/generate` body — `{ name*: string, variables: object, outputPath: string, saveFile: bool=false, execId: string, exec_id: string, subdomain: string }`
  - `name` — Template name: a built-in one or a custom template's (see templates/list).
  - `variables` — Values for the template's `params`, substituted into its code.
  - `outputPath` — Where to save the script when `saveFile` is true, as scripts/write takes a path: under the call's scope (`execId` / `exec_id` / `subdomain`, else the Host's `[<subdomain>.]…-exec-<execId>`), as `<subdomain|default>/<execId>/<outputPath>` unless it already starts with that prefix; relative to the scripts directory only when the call has no scope. …
  - `saveFile` — When true, write the generated script to `outputPath` (required then). When false (the default), only return the code.
  - `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens — the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `PUT /api/v1/exec/templates/update-custom/{name}` body — `{ code: string, metadata: object }`

