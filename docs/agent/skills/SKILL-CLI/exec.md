> _**CLI skill · `exec` namespace** · ~13,374 tokens · hoody-sdk v1.0.0-beta.16_

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To give a script a **public** address: create an alias with `hoody proxy aliases create` (`program: 'exec'`, and `target_path: '/<your-script>'` as the landing page) and you get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` in the URL. With the default `allow_path_override: true` the alias points at the WHOLE exec kit, not at one script: `target_path` only answers a request with no path, and every other path is forwarded as sent. That includes the kit's own management API under `/api/v1/exec/` (`hoody exec scripts write`, `hoody exec scripts delete`, …), so anyone holding the link may be able to write and run code in the container. Set `allow_path_override: false` to serve only the script: it is served at the alias root AND at `/<your-script>`, while any other path (sub-paths, assets and the management API under `/api/v1/exec/` included) is refused with `404 ALIAS_PATH_PINNED`, and the visitor's method, body and query keys the target does not set still reach the script. Either way, before sharing the alias, gate it with `hoody containers proxy *` (a password, token, JWT or IP group, plus a `default` policy that denies what the group does not allow), exactly as for any kit URL.

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
- File I/O outside the scripts dir → `files`. Interactive shells → `terminal`. Container lifecycle → `daemon`. Headless web → `browser`.

## Prerequisites

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `hoody exec scripts write`.
- **`require('hoody-sdk')` works with no install step** — it loads the installed npm package from the scripts root's `node_modules`. Exec installs a missing SDK automatically (at startup, or on a script's first `require`), honors a version you declare in the scripts-root `package.json` (an exact version or a tag stops updates, a range keeps them inside it), and stages a newer registry release that the next kit startup swaps in; a running kit never replaces its live copy. (Other `require()`d npm packages are auto-installed on first execution.) Import from `'hoody-sdk'`. The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the edge proxy, so all the usual capability gates / request hooks / proxy logs apply (see § Source IP Guard in `SKILL-CLI.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out: `Bun.$\`hoody projects list\`` from the same script works end-to-end.

## Capability URL

→ See `SKILL-CLI.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Write, validate, invoke

1. `hoody exec scripts write` — `path`, `content`, `createDirs:true`, `validate:true` (default); 400 + `validation` on fail.
2. `hoody exec scripts read` — confirm bytes.
3. `POST {EXEC_BASE_URL}/<path-without-extension>` — body parsed, return auto-serialised, output streamed.
4. `hoody exec scripts list` — verify.

### 2. Pin deps, iterate

1. `hoody exec modules test` → `hoody exec modules install` → `hoody exec packages pin`.
2. `hoody exec scripts validate` + `hoody exec magic comments validate` (`// @description`, `// @cors`, `// @timeout`).
3. `hoody exec scripts write` (auto-validates unless `validate:false`).
4. `hoody exec cache clear` — drop cached worker VMs, selected by `hostname` (optionally with `execId`) or `clearAll:true`; a call with neither is a 400. The `shared` state survives unless you also pass `clearState:true`.

### 3. Debug + OpenAPI

1. `hoody exec logs list` / `hoody exec logs search` / `hoody exec logs get` (one JSON response; `lines` and `tail` pick the slice). For a live tail use `hoody exec logs stream` (SSE).
2. `hoody exec requests list` / `hoody exec stats`; per script, `hoody exec scripts stats list` first, then `hoody exec scripts stats get` with one `scriptPath` from that listing (an empty body returns an empty `metrics` stub).
3. `hoody exec openapi scripts list`, then `hoody exec openapi generate` / `hoody exec openapi get` (a document built from the current scripts) or `hoody exec openapi merge`. Merge scans scripts only for the `directories` you name (`['scripts']` for the calling deployment's scripts directory — the `<subdomain|default>/<execId>` the kit URL names, unless you pass `subdomain` / `execId`) and otherwise merges just the `specs` you pass; it answers `{success, data, meta}` with the document in `data`. None of the three writes anything to disk, so store a merge result yourself if you need to keep it. `hoody exec openapi schema validate` checks one script's `.openapi.json` sidecar.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. The pattern-normaliser never rewrites the stored file; it rewrites the code at load time on every request, independent of `validate`.
- **Reads redact secrets.** `hoody exec scripts read` replaces the values of `// @token` and `// @ai-key` lines with `[REDACTED]`. Writing that content back keeps the stored secret for each placeholder; a placeholder with no stored secret to restore is refused.
- **`req.rawBody` holds the request bytes as received** (a Buffer), next to the parsed `req.body`, whenever the kit parses the body for you. Verify webhook signatures against `req.rawBody`; re-serialising `req.body` does not reproduce the sender's bytes. A script that declares `// @rawBody` gets neither field: `req` stays the raw request stream, so read and hash that stream yourself. `GET` and `HEAD` bodies are never read.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `hoody exec scripts delete` needs literal `confirm=true`.
- `hoody exec scripts write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `hoody containers proxy services list` returning `[]` is normal (it lists only services named in proxy permission rules or hooks).
- `hoody exec schedules run` and `hoody exec schedules history list` scope a relative `scriptPath` by the kit URL you call, like `hoody exec scripts write`: through the `exec-1` kit URL, `tick.js` means `default/1/tick.js` (the `scriptRel` of `hoody exec schedules list`), and a path that already starts with `default/1/` is kept as is. An absolute `scriptPath` is used as given (history converts it to the root-relative form); a script at the scripts root, outside any deployment folder, is reachable from a deployment URL only by its absolute path.
- `hoody exec scripts write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- `hoody exec magic comments update` and `hoody exec magic comments get` resolve `path` like `hoody exec scripts write`: through the `exec-1` kit URL, `tick.js` is looked up as `default/1/tick.js` first (the `execId` / `subdomain` parameters pick another deployment), then as given relative to the scripts root, so the root-relative `default/1/tick.js` (the write's `resolvedPath`, or its `path` in `hoody exec scripts list`) also works; the first that exists is used, and none answers 404 `Script not found`.
- `hoody exec magic comments batch update` with neither `directory` nor `execId` edits the calling deployment's own tree (`default/1` through `exec-1`); a `directory` resolves like a script path (under the calling deployment's tree first, then relative to the scripts root).
- `hoody exec magic comments update` sets `// @schedule` (`comments.schedule`; an empty string removes it). The value is a 5-field cron expression (`minute hour day month weekday`) or a nickname (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`), always in UTC, one per file. `// @schedule-timeout <ms>` is the max run time of one scheduled run; HTTP requests keep `@timeout` (a scheduled run without it uses `@timeout`, else 30 s). It is registered at once, as by a write whose header has the line (no `hoody exec schedules reload`); `hoody exec schedules list` shows its `nextFire`.
- A `@schedule` fire bypasses the script's `@token`, and a script that also declares `@websocket` is not registered (`hoody exec schedules history list` records it as `incompatible`). The `curl` kit's schedules take 6 fields (seconds first); the `cron` namespace takes 5, in the container's own crontab.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every endpoint gets these script-scoped bindings, enabled by default (off with `// @ai false`; not on `globalThis`; `pre.js` / `post.js` get none): `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1` unless the kit runs with another `--ai-url`; default model **`hoody-ai/hoody-free`** unless `--ai-default-model` changes it). **No `require()`, no base URL, and no API key**: the key defaults to `container-<hash>`, and `// @ai-key` replaces it. Exec does not price, meter or refuse models; what a model costs and what happens without wallet credit is decided by the AI service. Override per-script with magic comments (`// @ai-model <provider/model>`, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a default system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).
- **How the built-in AI is called.** `ai` is a name in the script's own scope, not a global: `globalThis.ai` is undefined, a module the script imports does not see it (pass `ai` in), and `pre.js` / `post.js` get no AI helpers. Every helper returns the SDK result object, never a bare string: `(await ai.generate(prompt)).text`, `return (await ai.stream(prompt)).textStream` (streamed as `text/plain`), `(await ai.object({ schema, prompt })).object`. `ai.generate` also takes `{ prompt, system, messages, model, temperature, maxTokens }`. `<script>.system.md` beside the script, else `_system.md` in the same directory, is the default `system` of `ai.generate` / `ai.stream` / `ai.object` (never read it yourself); an explicit `system` option replaces it, and the raw `generateText` / `streamText` / `generateObject` get none, so pass `system` to them yourself. `@ai-model`, `@ai-temperature` and `@ai-max-tokens` set the defaults of the `ai` helpers; `@ai-model` also picks the injected `model` that `generateText({ model, prompt })` takes.
- **State between requests.** The script body runs again on every request, so its top-level `let` / `const` / `Map` start empty each time. `shared` is one object per deployment (`<hostname>/<execId>`), the same object for every script of that deployment, kept between requests in both modes. `// @mode worker` additionally keeps `globalThis` values between requests (one VM per deployment, shared by its worker scripts); the default serverless mode builds a fresh VM per request. Both are memory only: lost on restart, and dropped together when the kit evicts an idle deployment from its bounded cache (`--vm-cache-cap`, default 1000 deployments). Keep anything that must last in `bun:sqlite` (`Database` is predefined), the `sqlite` kit or the `files` kit.
- **Request body.** `req.body` is parsed JSON, a urlencoded form as an object (a repeated key keeps its last value), or for `multipart/form-data` the text fields only; any other content type is a Buffer. Uploaded files are in `req.files`, one entry per file (empty files and repeated field names included): `{ fieldName, filename, type, size, data }` with `data` a Buffer and `type` the MIME type the runtime reports, which may differ from the part's declared Content-Type and can come from the filename (observed on Bun 1.4.2: `a.pdf` sent as `text/plain` gave `application/pdf`, `a.txt` gave `text/plain;charset=utf-8`, an unknown extension gave `""`), so check the bytes when the type matters.
- **`pre.js` / `post.js` are per directory.** They run around each HTTP request to a script in their own directory (its `index` included) and never for subdirectories or parent directories, so `admin/pre.js` does not guard `admin/deep/x.js`. `.ts` works too. A non-null return from `pre.js` (or a response it already ended) skips the script; to pass data on, set it on `req`. `post.js` receives the script's return value as `mainResult`, and a non-null return replaces the response. `post.js` still runs after a script that answered with `res.json()` / `res.send()`, but that answer stays as sent and `res.setHeader` then throws: check `res.headersSent` before touching the response. `post.js` also runs after a `pre.js` stop, with the `pre.js` value as `mainResult` (return nothing to keep it). A WebSocket connection runs `pre.js` once, before the handshake (never per message, never `post.js`): a non-null return or a started or ended `res` refuses the upgrade with that error status (else 403) and no socket opens (`req.body` is `null` on an upgrade, so body-reading checks must allow for it); what it sets on `req` reaches `ws.open(socket, req)`; `// @websocket-pre false` in the socket script skips it.
- **WebSocket scripts register handlers; they do not handle upgrades.** Both `// @websocket` and `// @mode worker` are required, or the socket is closed with `4400`. Assign `ws.open = (socket, req) => …`, `ws.message = (socket, data) => …`, `ws.close = (socket, code, reason) => …` (or `ws.on('message', …)`); never start a `ws` server or call `handleUpgrade`. The script body runs when the first socket connects, with `metadata.method === 'WEBSOCKET_INIT'`: once per script, or for a dynamic route once per route value while it has sockets (after that room's last socket closes, the next connection runs the body again with fresh variables; a changed script file serves new sockets from a fresh run, while sockets already open keep the old handlers and connection pool, so a broadcast from one run does not reach the other). Its top-level variables are shared by all sockets of that run, and its `req` / `metadata` are the first socket's request (`metadata.query` its query string alone, `metadata.parameters` its route params), so read each socket's own query from `socket.data.query` (or the `req` that `ws.open(socket, req)` receives) and keep per-connection state on `socket.data` (which also holds `headers`, `ip`). `data` is a string for text frames and a Buffer for binary ones; `socket.send` / `ws.broadcast(data, exceptSocket?)` send a plain object or array as JSON text and a string, Buffer or other binary value as given. An HTTP request to the same script re-runs the body and sees the same `ws.connections` / `ws.broadcast`.
- **Helper files and other directives.** Load a file of your own with `await import('./lib/x.js')` (resolved from the script's file). The helper exports with `export function x` or `module.exports = { x }`, then `const { x } = await import(…)`; a bare `module.exports = fn` arrives as `.default`. The helper can `require('./sibling.js')`; `require('./lib/x.js')` from the script body works too (resolved from the script's file). A helper file the script loads with `require` or an ES import statement sees the server's own `process.env`, not the script's `.env` values, so a key that only `quote.env` sets is `undefined` inside `./lib/rates.js`. Read the value in the script and pass it in (`const { rate } = await import('./lib/rates.js'); return { eur: await rate(process.env.RATES_KEY, 'USD', 'EUR') };`). The script's `process.env` is the kit's environment plus every `_default.env` from the scripts root down to the script's directory, then the script's own `<name>.env`, merged per variable (the nearest file wins). `__dirname` and `__filename` are not defined. `// @description …`, `// @tags a,b` and `// @label x` only describe the script for `hoody exec scripts list` (which filters on `label` / `tags`) and change nothing at runtime. `// @enabled false` answers 404 without running the script; repeat `// @token` to accept several tokens; `@token` takes one word (the rest of the line is ignored, with a warning). A returned object is always the JSON body: `return { status: 301, body }` answers 200 with that object, so set a status with `res.status()`.
- **URL, query and CORS.** `req.url` is the path and query (`/x?a=1`), not a full URL. `metadata.query` is decoded like a form (`+` is a space) and keeps only the last value of a repeated key. On HTTP requests route params are merged into `metadata.query` and `metadata.parameters` (and a socket's `socket.data.query`) over query keys of the same name, so for the query string alone use `new URL(req.url, 'http://x').searchParams` (`.getAll('key')` for every value). By default each response reflects the caller's `Origin` and sends `Access-Control-Allow-Credentials: true`; `// @cors-credentials false` keeps the reflection without it. With any `@cors` line (`*` reflects any origin, `https://app.example` one origin, `none` blocks), credentials are sent only with `// @cors-credentials true`. These directives shape the script's own responses: an ordinary `OPTIONS` preflight is answered by the kit's global policy (reflected origin, credentials) and never reaches the script (platform hook dispatch is the exception).
- **`.md` URLs serve Markdown files, never scripts.** `/guide.md` serves the file `guide.md` as `text/markdown`, behind the `@token` of `guide.ts` / `guide.js` beside it; a script named `guide.md.ts` is never reached. (A proxy hook names its target script, so it can still run one for a `.md` URL.)

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — some segment of the path is a reserved directory name: `node_modules`, `.git`, `.hoody-cache`, `_sdk` or `_hoody`. The check is per segment and applies at any depth, so `api/node_modules/x.ts` is refused as surely as `node_modules/x.ts`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`hoody exec restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST https://{P}-{C}-exec-1.{N}.containers.hoody.com/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when the syntax and TS-transpile checks pass. A missing dependency is only a warning (the runtime installs it on first execution), and magic comments are parsed but never fail the write.

```bash
hoody --container "$C" exec scripts write \
  --path echo.js \
  --content 'module.exports = (req, res) => res.json({ ok: true, body: req.body });'
```

**Step 2 — invoke `POST /echo`** (bare path, NOT `/api/v1/exec/echo`). Body is auto-parsed; the return value of `res.json(...)` is the wire body.

```bash
# Use any HTTP client of your choice — exec scripts are bare HTTP endpoints.
curl -sX POST "https://${P}-${C}-exec-1.${N}.containers.hoody.com/echo" \
  -H 'Content-Type: application/json' -d '{"hello":"world"}'
```

**Step 3 — read it back.** `hoody exec scripts read` returns the stored content (with `@token` / `@ai-key` values shown as `[REDACTED]`, see Quirks) + parsed `magicComments` + metadata.

```bash
hoody --container "$C" exec scripts read --path echo.js -o json | jq .content
```

### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `hoody curl run` / SDK calls.

```bash
hoody --container "$C" exec scripts write --path workflow.js --content "$(cat <<'JS'
module.exports = async (req, res) => {
  const callA = async () => ({ score: 0.91, label: 'spam' });
  const checkB = async (a) => ({ verdict: a.score > 0.8 ? 'block' : 'allow' });
  const actC  = async (v) => ({ executed: v === 'block' ? 'quarantined' : 'delivered' });
  const a = await callA();
  const b = await checkB(a);
  res.json({ a, b, c: await actC(b.verdict) });
};
JS
)"
```

### 3. Webhook receiver with HMAC signature verification

**Goal:** GitHub-style `X-Hub-Signature-256` verification using `crypto.timingSafeEqual`. Reject 401 on bad sig.

**Step 1 — write the verifier.** No `npm install` needed — `crypto` is a runtime built-in.

```bash
WEBHOOK=$(cat <<'JS'
const crypto = require('crypto');
const SECRET = process.env.WEBHOOK_SECRET || 'shhh-test';
module.exports = async (req, res) => {
  const sig = req.headers['x-hub-signature-256'] || '';
  const body = req.rawBody || Buffer.alloc(0);  // the bytes as received
  const expect = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  let ok = false;
  try { ok = sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch {}
  if (!ok) return res.status(401).json({ error: 'bad sig' });
  res.json({ accepted: true, payload: req.body });
};
JS
)
hoody --container "$C" exec scripts write --path webhook.js --content "$WEBHOOK"
```

### 4. Pin npm deps — `hoody exec modules test` → `hoody exec modules install` → `hoody exec packages pin`

**Goal:** add `left-pad` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```bash
hoody --container "$C" exec modules test --code 'const leftPad = require("left-pad");'
```

**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"left-pad@1.3.0"`).

```bash
hoody --container "$C" exec modules install --modules left-pad
```

**Step 3 — pin to exact versions.** Each declared range is replaced by the version actually installed, provided it satisfies the range. For a range, a package that is not installed, or whose installed version falls outside the range, is listed under `unpinnable` with the reason instead. A declaration that is already an exact version is left as it is, without checking that it is installed.

```bash
hoody --container "$C" exec packages pin --packages left-pad   # repeat --packages, or comma-separate, for several packages
```

### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```bash
CODE='// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });'
hoody --container "$C" exec scripts validate --code "$CODE"
hoody --container "$C" exec magic comments validate --code "$CODE"
```

If `valid:true`, ship it via `hoody exec scripts write` (default `validate:true` re-runs the checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies}` slots tell you which checker rejected it. Magic comments never make a script invalid: a directive whose value cannot be used falls back to its default and is reported in `results.magicCommentWarnings` (or `warnings` from `hoody exec magic comments validate`) while `valid` stays `true`, so read those warnings separately. The two paths differ on one point: `hoody exec scripts validate` counts a `require()`d module that is not installed yet as a failure, while `hoody exec scripts write` only warns about it and the runtime installs it on first execution. A `valid:false` whose only failing slot is `dependencies` can be written for the runtime to install when `results.dependencies.invalidModules` is empty, so the failure is only missing packages. A versioned import specifier such as `require('lodash@4')` is listed in `invalidModules` and refused at runtime: pin the version in the scripts-root `package.json` (`hoody exec packages pin`) and import the bare package name.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry in a single OpenAPI 3.0 document the proxy can serve. Request/response shapes come only from a script's companion `.openapi.json` file; a script without one gets a generic `GET` entry, and a companion that cannot be read or parsed leaves that script out and is listed under `x-schema-errors` in the document.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```bash
hoody --container "$C" exec openapi scripts list
```

**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```bash
hoody --container "$C" exec openapi get --format json > /tmp/user-scripts.openapi.json
```

**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `hoody exec openapi merge`. Merge generates from the scripts only for the `directories` you name (`scripts` means the calling deployment's scripts directory, not every deployment's); without them it merges just the `specs` you pass. It answers `{success, data, meta}` with the merged document in `data`.

```bash
# --specs takes a file holding an ARRAY of document objects. Without -o json the
# command prints only a success line, so ask for the body and keep its .data.
jq -s . /tmp/layer.json > /tmp/specs.json
hoody --container "$C" exec openapi merge --directories scripts --specs @/tmp/specs.json -o json \
  | jq .data > /tmp/merged.openapi.json
```

`hoody exec openapi merge` and `hoody exec openapi generate` only RETURN a document; neither writes anything, and `hoody exec openapi get` (step 2) regenerates from the scripts on every call, so it never shows a merge. Store the merged document yourself if you need to keep or publish it. `hoody exec openapi schema validate` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `hoody exec logs list` returns kit-wide log files; `hoody exec logs get` slices a specific one.

```bash
hoody --container "$C" exec logs list
hoody --container "$C" exec logs get --file "$LOGNAME" --lines 200 --tail   # $LOGNAME from `exec logs list` → .logs[].name
# Live tail: prints each event as it arrives until you stop it (Ctrl-C).
hoody --container "$C" exec logs stream --file "$LOGNAME"
# One-shot dump of the whole file; the command exits when the server closes the stream.
hoody --container "$C" exec logs stream --file "$LOGNAME" --no-follow
```

Per-request execution logging is ON by default (`@log-level` defaults to `standard`); `// @log-level none` turns that logging off for the script. The kit's separate access log still records every request to it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `hoody exec stats` is a single snapshot; `hoody exec requests list` lists in-flight HTTP/WS; `hoody exec scripts stats list` lists every script with traffic, with its request and error counters (sort by `requests`, `errors`, `p95`, `ws_active` or the default `lastActivity`); `hoody exec scripts stats get` then reports on ONE script, named by the `scriptPath` from that listing. An empty body returns the stub `{"metrics":{}}`, which means "no script asked for", not "no traffic".

```bash
hoody --container "$C" exec stats
hoody --container "$C" exec requests list
hoody --container "$C" exec scripts stats list --sort requests --limit 10
hoody --container "$C" exec scripts stats get --script-path default/1/echo.js
```

For Prometheus scraping, `GET /api/v1/exec/monitor/metrics` returns text/plain in standard exposition format.

### 9. Wrap a bash one-liner as an HTTP API with `Bun.$`

**Goal:** turn `df -h /` into a JSON HTTP endpoint with no scaffolding. `Bun.$` is in scope inside any script.

```bash
DU=$(cat <<'JS'
module.exports = async (req, res) => {
  const out = await Bun.$`df -h --output=source,size,used,avail,target /`.text();
  res.json({ disk: out.trim().split('\n').slice(1).map(l => l.split(/\s+/)) });
};
JS
)
hoody --container "$C" exec scripts write --path disk-usage.js --content "$DU"
```

Same pattern works for `python3 -c "..."`, `ffmpeg`, native binaries, anything on `$PATH`. The script handler runs inside the container as a normal process.

### 10. In-process schedule via `@schedule` directive

**Goal:** fire a script every 5 minutes WITHOUT the `cron` namespace. The schedule lives inside the kit; if the kit restarts, the schedule re-registers from disk on boot. (For schedules that must survive a kit-down — use the `cron` namespace instead.)

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log. A scheduled fire has no HTTP caller, so the script's `res.json` body goes nowhere; `hoody exec schedules run` (step 3) reports the fire outcome instead, not that body.

```bash
TICK=$(cat <<'JS'
// @schedule */5 * * * *
// @description Heartbeat — fires every 5 minutes
module.exports = async (req, res) => {
  console.log('[tick] fired at', new Date().toISOString());
  res.json({ ok: true, ts: Date.now() });
};
JS
)
hoody --container "$C" exec scripts write --path tick.js --content "$TICK"
```

**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, the absolute on-disk `scriptPath`, and `scriptRel`, the same path relative to the scripts root (e.g. `default/1/tick.js`). Either one is what step 3 needs.

```bash
hoody --container "$C" exec schedules list
```

**Step 3 — fire it on demand.** `scriptPath` accepts the absolute `scriptPath` from step 2 or its root-relative `scriptRel` (`default/1/tick.js`). A relative path is scoped by the kit URL like `hoody exec scripts write`, so through the `exec-1` kit URL plain `tick.js` also names `default/1/tick.js`. `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only. The response is the fire outcome, `{triggered, scriptPath, runId, status, durationMs, error?}`.

```bash
hoody --container "$C" exec schedules run \
  --script-path /hoody/storage/hoody-exec/scripts/default/1/tick.js --force
hoody --container "$C" exec schedules history list --limit 5
```

**Stop the schedule** by deleting the script (`hoody exec scripts delete --path tick.js --confirm true`) or by rewriting it through `hoody exec scripts write` without the `// @schedule` directive; every `hoody exec scripts write` re-registers that file's schedule, so no separate `hoody exec schedules reload` call is needed. Use `hoody exec schedules reload` only after changing files some other way.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. Every endpoint has, as script-scoped bindings enabled by default (`// @ai false` turns them off; not on `globalThis`), `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key defaults to `container-<hash>`. Default model is **`hoody-ai/hoody-free`** (the kit's `--ai-default-model`). Override per-script with `// @ai-model <provider/model>`; what a model costs is up to the AI service, not exec. Set a default system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```bash
SUM=$(cat <<'JS'
// @description One-line summary via built-in Hoody AI (no key or setup)
module.exports = async (req, res) => {
  const text = metadata.query.q || 'Say hello in one sentence.';
  const result = await ai.generate('Summarize in one line: ' + text);
  res.json({ summary: result.text });
};
JS
)
hoody --container "$C" exec scripts write --path summarize.js --content "$SUM"
```

**Step 2 — invoke it** (bare path on the exec kit URL). No key anywhere in the call:

```
https://{P}-{C}-exec-1.{N}.containers.hoody.com/summarize?q=Hoody+is+a+remote-first+computing+platform
# → {"summary":"..."}
```

For structured output use `(await ai.object({ schema, prompt })).object` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`. The system prompt in `summarize.system.md` is the default for `ai.generate` / `ai.stream` / `ai.object` with no code; do not read the file yourself (the raw `generateText` and friends need an explicit `system`).

### 12. WebSocket endpoint — rooms with broadcast, plus HTTP on the same path

**Goal:** a chat room per URL (`/rooms/red`, `/rooms/blue`): every text message goes to everyone in that room, sender included, and a plain HTTP request to the same path posts into the room. A WebSocket script never handles the upgrade itself: it declares `// @websocket` and `// @mode worker` (without both the socket is closed with `4400`) and assigns handlers on the injected `ws`.

**Step 1 — write `rooms/[room].js`** with `hoody exec scripts write` as in example 1, path `rooms/[room].js`:

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

**Step 1 — write the three files and the key** with `hoody exec scripts write` (example 1): `admin/pre.js`, `admin/post.js`, `admin/users.js`, and `admin/_default.env` (its values show up in `process.env` of every script in `admin/`).

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

**Step 1 — write `upload.js`** with `hoody exec scripts write` (example 1):

```javascript
// file: upload.js
const doc = (req.files ?? []).find((f) => f.fieldName === 'document');
if (!doc) { res.status(400); return { error: 'document missing' }; }
return { title: req.body.title, filename: doc.filename, type: doc.type, size: doc.size, text: doc.data.toString('utf8') };
```

**Step 2 — post a form** (any HTTP client; here curl with a 5-byte `a.txt` holding `hello`):

```
curl -s "https://{P}-{C}-exec-1.{N}.containers.hoody.com/upload" -F title=notes -F 'document=@a.txt;type=text/plain'
# → {"title":"notes","filename":"a.txt","type":"text/plain;charset=utf-8","size":5,"text":"hello"}   (the type observed for a .txt file on Bun 1.4.2)
```

## Reference

### `hoody exec` (67) — Script execution and templates

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody exec cache clear` |  | destructive | Clear Cache | `exec.cache.clear` | `hoody exec cache clear --hostname example.com --clear-vm` |
| `hoody exec health` |  | read | Health Check | `exec.kit.getHealth` | `hoody exec health` |
| `hoody exec logs clear` |  | destructive | Clear Logs | `exec.logs.clear` | `hoody exec logs clear --file /home/user/file.txt --confirm true` |
| `hoody exec logs get` |  | read | Read Log | `exec.logs.get` | `hoody exec logs get --file execution.log --lines 100 --tail` |
| `hoody exec logs list` |  | read | List Logs | `exec.logs.list` | `hoody exec logs list --limit 10` |
| `hoody exec logs search` |  | read | Search Logs | `exec.logs.search` | `hoody exec logs search --query 'my search' --limit 1000` |
| `hoody exec logs stream` |  | read | Stream Logs | `exec.logs.stream` | `hoody exec logs stream --file /home/user/file.txt --follow` |
| `hoody exec magic comments batch update` |  | write | Bulk Update Magic Comments | `exec.magicComments.updateMany` | `hoody exec magic comments batch update --directory /home/user/src --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec magic comments get` |  | read | Read Magic Comments | `exec.magicComments.get` | `hoody exec magic comments get --path reports/report.pdf --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec magic comments schema get` |  | read | Get Magic Comments Schema | `exec.magicComments.getSchema` | `hoody exec magic comments schema get` |
| `hoody exec magic comments update` |  | write | Update Magic Comments Handler | `exec.magicComments.update` | `hoody exec magic comments update --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --path reports/report.pdf --comments-enabled` |
| `hoody exec magic comments validate` |  | read | Validate Magic Comments | `exec.magicComments.validate` | `hoody exec magic comments validate --code <code>` |
| `hoody exec metrics` |  | read | Prometheus Export | `exec.kit.getMetrics` | `hoody exec metrics` |
| `hoody exec modules install` |  | write | Install Dependencies | `exec.modules.install` | `hoody exec modules install --modules <modules>` |
| `hoody exec modules list` |  | read | List Bundled Dependencies | `exec.modules.listBundled` | `hoody exec modules list` |
| `hoody exec modules test` |  | read | Check Dependencies | `exec.modules.test` | `hoody exec modules test --code <code>` |
| `hoody exec namespaces list` |  | read | List All Exec Ids | `exec.namespaces.list` | `hoody exec namespaces list` |
| `hoody exec open` |  | action | Open the page a script serves (runs the script) in your browser |  | `hoody exec open --path /my-script` |
| `hoody exec openapi generate` |  | action | Generate User Open A P I | `exec.openapi.generate` | `hoody exec openapi generate --directory scripts --subdomain my-app` |
| `hoody exec openapi get` |  | read | Serve Generated Spec | `exec.openapi.get` | `hoody exec openapi get --dir scripts --format json` |
| `hoody exec openapi merge` |  | write | Merge Open A P I Specs | `exec.openapi.merge` | `hoody exec openapi merge --directories /home/user/src --specs @path.json` |
| `hoody exec openapi schema get` |  | read | Serve Schema File | `exec.openapi.getSchema` | `hoody exec openapi schema get --file reports/report.pdf --subdomain my-app` |
| `hoody exec openapi schema validate` |  | read | Validate User Schema | `exec.openapi.validateSchema` | `hoody exec openapi schema validate --file reports/report.pdf --subdomain my-app --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec openapi scripts list` |  | read | List User Scripts | `exec.openapi.listScripts` | `hoody exec openapi scripts list --directory scripts --subdomain my-app` |
| `hoody exec packages compare` |  | read | Compare Packages | `exec.packages.compare` | `hoody exec packages compare` |
| `hoody exec packages install` |  | write | Install Packages | `exec.packages.install` | `hoody exec packages install --packages axios --dev` |
| `hoody exec packages manifest create` |  | write | Init Package Json | `exec.packages.createManifest` | `hoody exec packages manifest create --name hoody-exec-project --version 1.0.0` |
| `hoody exec packages manifest get` |  | read | Read Package Json | `exec.packages.getManifest` | `hoody exec packages manifest get` |
| `hoody exec packages manifest update` |  | write | Update Package Json | `exec.packages.updateManifest` | `hoody exec packages manifest update --dependencies key=hello --scripts key=hello` |
| `hoody exec packages pin` |  | write | Pin Versions | `exec.packages.pin` | `hoody exec packages pin --packages axios` |
| `hoody exec requests list` |  | read | Get Active Requests | `exec.kit.listRequests` | `hoody exec requests list` |
| `hoody exec restart` |  | destructive | Restart Server | `exec.kit.restart` | `hoody exec restart --graceful --drain-timeout-ms 5000 -y` |
| `hoody exec routes list` |  | read | Discover Routes | `exec.routes.list` | `hoody exec routes list --include-metadata --hostname example.com` |
| `hoody exec routes resolve` |  | read | Resolve Route | `exec.routes.resolve` | `hoody exec routes resolve --path /home/user/file.txt --hostname default` |
| `hoody exec routes test` |  | read | Test Route | `exec.routes.test` | `hoody exec routes test --paths /home/user/src --hostname default` |
| `hoody exec schedules history list` |  | read | Schedule History | `exec.schedules.listHistory` | `hoody exec schedules history list --script-path reports/report.pdf --since 2026-01-01T00:00:00Z` |
| `hoody exec schedules list` |  | read | List Schedules | `exec.schedules.list` | `hoody exec schedules list` |
| `hoody exec schedules reload` |  | action | Reload Schedules | `exec.schedules.reload` | `hoody exec schedules reload --dry-run` |
| `hoody exec schedules run` |  | action | Trigger Schedule | `exec.schedules.run` | `hoody exec schedules run --script-path reports/report.pdf --force` |
| `hoody exec scripts delete` |  | destructive | Delete Script | `exec.scripts.delete` | `hoody exec scripts delete --path /home/user/file.txt --confirm true --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 -y` |
| `hoody exec scripts dependencies validate` |  | read | Validate Dependencies | `exec.scripts.validateDependencies` | `hoody exec scripts dependencies validate --code <code>` |
| `hoody exec scripts list` |  | read | List scripts in the caller's scripts directory (one level; --recursive true descends) | `exec.scripts.list` | `hoody exec scripts list --metadata '{}' --label my-label` |
| `hoody exec scripts move` |  | write | Move Script | `exec.scripts.move` | `hoody exec scripts move --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --from <from> --to <to> --overwrite` |
| `hoody exec scripts read` |  | read | Read Script | `exec.scripts.read` | `hoody exec scripts read --path /home/user/file.txt --exec-id 64f1a2b3c4d5e6f7a8b9c0d1` |
| `hoody exec scripts returns validate` |  | read | Validate Return Type | `exec.scripts.validateReturnType` | `hoody exec scripts returns validate --type-definition <type_definition> --value @path.json` |
| `hoody exec scripts stats get` |  | read | Get Script Performance | `exec.scripts.getStats` | `hoody exec scripts stats get --script-path reports/report.pdf` |
| `hoody exec scripts stats list` |  | read | List tracked scripts with their request, error and latency counters | `exec.scripts.listStats` | `hoody exec scripts stats list --limit 100 --sort lastActivity` |
| `hoody exec scripts syntax validate` |  | read | Validate Syntax | `exec.scripts.validateSyntax` | `hoody exec scripts syntax validate --code <code>` |
| `hoody exec scripts tree get` |  | read | Get Script Tree | `exec.scripts.getTree` | `hoody exec scripts tree get --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --max-depth 10` |
| `hoody exec scripts types validate` |  | read | Validate Type Script | `exec.scripts.validateTypes` | `hoody exec scripts types validate --code <code>` |
| `hoody exec scripts validate` |  | read | Validate Script | `exec.scripts.validate` | `hoody exec scripts validate --code <code>` |
| `hoody exec scripts write` |  | write | Write Script | `exec.scripts.write` | `hoody exec scripts write --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --path /home/user/file.txt --content Hello --create-dirs` |
| `hoody exec sdks delete` |  | destructive | Delete S D K | `exec.sdks.delete` | `hoody exec sdks delete --id abc-123 -y` |
| `hoody exec sdks get` |  | read | Get S D K | `exec.sdks.get` | `hoody exec sdks get --id abc-123` |
| `hoody exec sdks import` |  | write | Import S D K | `exec.sdks.import` | `hoody exec sdks import --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --source-url https://example.com/openapi.json --source-auth-type bearer --source-auth-token <source_auth.token>` |
| `hoody exec sdks list` |  | read | List S D Ks | `exec.sdks.list` | `hoody exec sdks list` |
| `hoody exec stats` |  | read | Get Stats | `exec.kit.getStats` | `hoody exec stats` |
| `hoody exec status` |  | read | Get Restart Status | `exec.kit.getStatus` | `hoody exec status` |
| `hoody exec store clear` |  | destructive | Clear Shared State | `exec.store.clear` | `hoody exec store clear --hostname example.com --path /home/user/file.txt -y` |
| `hoody exec store get` |  | read | Get Shared State | `exec.store.get` | `hoody exec store get --hostname example.com --path /home/user/file.txt` |
| `hoody exec store set` |  | write | Set Shared State | `exec.store.set` | `hoody exec store set --hostname example.com --path /home/user/file.txt --value @path.json --merge` |
| `hoody exec templates create` |  | write | Create Custom Template | `exec.templates.create` | `hoody exec templates create --name my-resource --code <code> --metadata-category custom --metadata-tags tag1,tag2` |
| `hoody exec templates delete` |  | destructive | Delete Custom Template | `exec.templates.delete` | `hoody exec templates delete --name my-resource -y` |
| `hoody exec templates generate` |  | action | Generate From Template | `exec.templates.generate` | `hoody exec templates generate --exec-id 64f1a2b3c4d5e6f7a8b9c0d1 --name my-resource --save-file` |
| `hoody exec templates list` |  | read | List Templates | `exec.templates.list` | `hoody exec templates list --category api --include-builtin` |
| `hoody exec templates preview` |  | read | Preview Template | `exec.templates.preview` | `hoody exec templates preview --name my-resource` |
| `hoody exec templates update` |  | write | Update Custom Template | `exec.templates.update` | `hoody exec templates update --name my-resource` |

