> _**SDK skill · `exec` namespace** · ~30,685 tokens · hoody-sdk v1.0.1_

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the computer.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To give a script a **public** address: create an alias with `proxy.aliases.create` (`client.api.proxy.aliases.create`) (`computer_id`, `program: 'exec'`, and `target_path: '/<your-script>'` as the landing page) and you get back `https://<alias>.{server_name}.computers.hoody.com` with no `computerId` in the URL. With the default `allow_path_override: true` the alias points at the WHOLE exec kit, not at one script: `target_path` only answers a request with no path, and every other path is forwarded as sent. That includes the kit's own management API under `/api/v1/exec/` (`scripts.write`, `scripts.delete`, …), so anyone holding the link may be able to write and run code in the computer. Set `allow_path_override: false` to serve only the script: it is served at the alias root AND at `/<your-script>`, while any other path (sub-paths, assets and the management API under `/api/v1/exec/` included) is refused with `404 ALIAS_PATH_PINNED`, and the visitor's method, body and query keys the target does not set still reach the script. Either way, before sharing the alias, gate it with `computers.proxy.*` (`client.api.computers.proxy`) (a password, token, JWT or IP group, plus a `default` policy that denies what the group does not allow), exactly as for any kit URL.

**Trust model — read carefully.** Scripts run inside the computer with full computer privileges. They are NOT a sandbox for untrusted user code. Anyone who can invoke a script can do everything the script can do (read files, hit other kits, spawn processes). Use them for *your* APIs / cron logic / webhooks / ETL — don't expose them as an arbitrary code-execution surface to anonymous internet users without thinking through the gate stack first.

## When to use

- "Write me an API endpoint that does X" — default to a `hoody-exec` script before reaching for a Node app + framework.
- **"Build a workflow"** — multi-step pipelines (call agent A → validate with agent B → trigger action C, fan-out / fan-in, retry logic, conditional branches). One script = one orchestrator; each step is a function call inside the same Bun process, so no inter-service plumbing. State between requests via `bun:sqlite` (`Database`), the `sqlite` kit or the `files` kit for durable state, or the injected `shared` object for in-memory state (one per deployment, lost when the kit restarts or evicts an idle deployment from its cache). Variables declared in the script body do not carry over: the body runs again on every request.
- Webhooks (GitHub / a payment provider / your CI), ETL pipelines, batch transformers, AI agent tools.
- Wrap a bash one-liner or Python helper as an HTTP API with zero scaffolding.
- Describe inputs / outputs in a companion `.openapi.json` file per script, auto-publish OpenAPI.
- Install and pin npm deps in the kit's one shared scripts-root `package.json` (every script uses the same versions), stream logs/metrics.

## When NOT to use

- **Untrusted-input code execution** — it's not sandboxed. Use a fresh computer (or a stricter runtime) per untrusted caller.
- Long-lived processes / supervisors → `daemon` (exec is request/response).
- Schedules outliving the kit → `cron` (`exec.schedules.*` is in-process and dies with the kit).
- File I/O outside the scripts dir → `files`. Interactive shells → `terminal`. Computer lifecycle → `api`. Headless web → `browser`.

## Prerequisites

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `scripts.write`.
- **`require('hoody-sdk')` works with no install step** — it loads the installed npm package from the scripts root's `node_modules`. Exec installs a missing SDK automatically (at startup, or on a script's first `require`), honors a version you declare in the scripts-root `package.json` (an exact version or a tag stops updates, a range keeps them inside it), and stages a newer stable release that `^` of the installed version (and your declaration, if any) allows, which the next kit startup swaps in; it never updates from or to a prerelease, and below 1.0.0 `^` can be narrower than a major. A running kit never replaces its live copy. (Other `require()`d npm packages are auto-installed on first execution.) Import from `'hoody-sdk'`. You rarely need to: a script has a global `hoody`, a client already scoped to the computer it runs on, so a call such as `hoody.files.readText(path)` or `hoody.curl.run({...})` needs no `require`, login or `withComputer()`, and no token under the default allow policy. The global needs SDK methods that older SDK versions lack: with such a copy (for example a 1.0.0-beta one, which is never updated automatically) the first use of `hoody` fails with `upgrade_required`, and the error names 1.0.1 as the version to install. Request it with `modules.install` (the package hoody-sdk at that version), which stages it, then `kit.restart`; when your scripts-root `package.json` declares a version that does not allow the one you request, the request is rejected, so change that declaration first. A kit protected by proxy permissions takes the credential its authentication group expects, passed explicitly as `kitAuth` (`hoody.withComputer(id, { kitAuth })`); none is read from the environment. For `hoody.api.*` the global reads `HOODY_TOKEN` from the script's `.env` companion. A script that declares its own `hoody` or builds `new HoodyClient(...)` keeps its own. The constructor takes an explicit config; `withComputer` is async and returns a computer-scoped client. Calls go through the edge proxy, so all the usual capability gates / request hooks / proxy logs apply (see § One URL form from everywhere in `SKILL-SDK.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out, but exec sets no account token and the CLI needs one (for a kit command too: it looks the computer up). Put `HOODY_TOKEN=<token>` in the script's `.env` companion and pass the script's env on: `Bun.$\`hoody projects list\`.env({ ...process.env })`.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a computer port** (any port, any namespace):

- `https://{projectId}-{computerId}-http-<port>.{node}.computers.hoody.com` — proxy speaks HTTP to `<port>` on the computer's network address. Bind `0.0.0.0:<port>`, which always works; a loopback-only listener is also reached on default computers.
- `https://{projectId}-{computerId}-https-<port>.{node}.computers.hoody.com` — proxy speaks HTTPS to `<port>` on the computer's network address (target needs TLS, bound to `0.0.0.0:<port>` too).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Write, validate, invoke

1. `scripts.write` — `path`, `content`, `createDirs:true`, `validate:true` (default); 400 + `validation` on fail.
2. `scripts.read` — confirm bytes.
3. `POST {EXEC_BASE_URL}/<path-without-extension>` — body parsed, return auto-serialised, output streamed.
4. `scripts.list` — verify.

### 2. Pin deps, iterate

1. `modules.test` → `modules.install` → `packages.pin`.
2. `scripts.validate` + `magicComments.validate` (`// @description`, `// @cors`, `// @timeout`).
3. `scripts.write` (auto-validates unless `validate:false`).
4. `cache.clear` — drop cached worker VMs, selected by `hostname` (optionally with `execId`) or `clearAll: true`; a call with neither is a 400. The `shared` state survives unless you also pass `clearState: true`.

### 3. Debug + OpenAPI

1. `logs.list` / `logs.search` / `logs.get` (one JSON response; `lines` and `tail` pick the slice). For a live tail use `logs.stream` (SSE).
2. `kit.listRequests` / `kit.getStats`; per script, `scripts.listStats` first, then `scripts.getStats` with one `scriptPath` from that listing (an empty body returns an empty `metrics` stub).
3. `openapi.listScripts`, then `openapi.generate` / `openapi.get` (a document built from the current scripts) or `openapi.merge`. Merge scans scripts only for the `directories` you name (`['scripts']` for the calling deployment's scripts directory — the `<subdomain|default>/<execId>` the kit URL names, unless you pass `subdomain` / `execId`) and otherwise merges just the `specs` you pass; it answers `{success, data}` with the document in `data`. None of the three writes anything to disk, so store a merge result yourself if you need to keep it. `openapi.validateSchema` checks one script's `.openapi.json` sidecar.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, `require` and `hoody` (a hoody-sdk client scoped to the computer the script runs on) are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. A script may instead export one function per HTTP method (`export async function GET(request)`, `POST`, …; the first argument is a Web `Request`): `HEAD` falls back to `GET`, `OPTIONS` is answered automatically, and any other method without an export answers 405 with `Allow`. The pattern-normaliser never rewrites the stored file; it rewrites the code at load time on every request, independent of `validate`.
- **Reads redact secrets.** `scripts.read` replaces the values of `// @token` and `// @ai-key` lines with `[REDACTED]`. Writing that content back keeps the stored secret for each placeholder; a placeholder with no stored secret to restore is refused.
- **`req.rawBody` holds the request bytes as received** (a Buffer), next to the parsed `req.body`, whenever the kit parses the body for you. Verify webhook signatures against `req.rawBody`; re-serialising `req.body` does not reproduce the sender's bytes. A script that declares `// @rawBody` (or `// @rawBody true`) gets neither field: `req` stays the raw request stream, so read and hash that stream yourself. `// @rawBody false` keeps normal parsing, so `req.body` and `req.rawBody` are set as usual. These three lines are the only accepted forms: with any other text after `// @rawBody` the line is ignored and the body is parsed. `GET` and `HEAD` bodies are never read.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `scripts.delete` needs literal `confirm=true` (the CLI sends it for you and asks for confirmation instead; pass `-y` when no one is at the terminal).
- `scripts.write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `computers.proxy.listServices` returning `[]` is normal (it lists only services named in proxy permission rules or hooks).
- `schedules.run` and `schedules.listHistory` scope a relative `scriptPath` by the kit URL you call, like `scripts.write`: through the `exec-1` kit URL, `tick.js` means `default/1/tick.js` (the `scriptRel` of `schedules.list`), and a path that already starts with `default/1/` is kept as is. An absolute `scriptPath` is used as given (history converts it to the root-relative form); a script at the scripts root, outside any deployment folder, is reachable from a deployment URL only by its absolute path.
- `scripts.write`/`delete` accept optional `execId` + `subdomain`; query wins.
- `magicComments.update` and `magicComments.get` resolve `path` like `scripts.write`: through the `exec-1` kit URL, `tick.js` is looked up as `default/1/tick.js` first (the `execId` / `subdomain` parameters pick another deployment), then as given relative to the scripts root, so the root-relative `default/1/tick.js` (the write's `resolvedPath`, or its `path` in `scripts.list`) also works; the first that exists is used, and none answers 404 `Script not found`.
- `magicComments.updateMany` with neither `directory` nor `execId` edits the calling deployment's own tree (`default/1` through `exec-1`); a `directory` resolves like a script path (under the calling deployment's tree first, then relative to the scripts root).
- `magicComments.update` sets `// @schedule` (`comments.schedule`; an empty string removes it). The value is a 5-field cron expression (`minute hour day month weekday`) or a nickname (`@hourly`, `@daily`, `@weekly`, `@monthly`, `@yearly`), always in UTC, one per file. `// @schedule-timeout <ms>` is the time limit of one scheduled run (the run is released, not stopped), as `@timeout` is for HTTP, where an unstarted response gets 504 and the script keeps running; HTTP requests keep `@timeout` (a scheduled run without it uses `@timeout`, else 30 s). The update starts the schedule refresh itself and does not wait for it to finish (no `schedules.reload` needed); confirm the registration with `schedules.list` and its `nextFire`.
- A `@schedule` fire bypasses the script's `@token`, and a script that also declares `@websocket` is not registered (`schedules.listHistory` records it as `incompatible`). The `curl` kit's schedules take 6 fields (seconds first); the `cron` namespace takes 5, in the computer's own crontab.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every endpoint gets these script-scoped bindings, enabled by default (off with `// @ai false`; not on `globalThis`; `pre.js` / `post.js` get none): `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1` unless the kit runs with another `--ai-url`; default model **`hoody-ai/hoody-free`** unless `--ai-default-model` changes it). **No `require()`, no base URL, and no API key**: the key defaults to `computer-<hash>`, and `// @ai-key` replaces it. Exec does not price, meter or refuse models; what a model costs and what happens without wallet credit is decided by the AI service. A token limited to realms cannot read the AI balance (403 `REALM_TOKEN_ACCOUNT_MONEY`): treat the credit as unknown, keep the free default, and let the AI service decide when the user asked for a paid model. Override per-script with magic comments (`// @ai-model <provider/model>`, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a default system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).
- **How the built-in AI is called.** `ai` is a name in the script's own scope, not a global: `globalThis.ai` is undefined, a module the script imports does not see it (pass `ai` in), and `pre.js` / `post.js` get no AI helpers. Every helper returns the SDK result object, never a bare string: `(await ai.generate(prompt)).text`, `return (await ai.stream(prompt)).textStream` (streamed as `text/plain`), `(await ai.object({ schema, prompt })).object`. `ai.generate` also takes `{ prompt, system, messages, model, temperature, maxTokens }`. `<script>.system.md` beside the script, else `_system.md` in the same directory, is the default `system` of `ai.generate` / `ai.stream` / `ai.object` (never read it yourself); an explicit `system` option replaces it, and the raw `generateText` / `streamText` / `generateObject` get none, so pass `system` to them yourself. `@ai-model`, `@ai-temperature` and `@ai-max-tokens` set the defaults of the `ai` helpers; `@ai-model` also picks the injected `model` that `generateText({ model, prompt })` takes.
- **State between requests.** The script body runs again on every request, so its top-level `let` / `const` / `Map` start empty each time. `shared` is one object per deployment (`<hostname>/<execId>`), the same object for every script of that deployment, kept between requests in both modes. `// @mode worker` additionally keeps `globalThis` values between requests (one VM per deployment, shared by its worker scripts); the default serverless mode builds a fresh VM per request. Both are memory only: lost on restart, and dropped together when the kit evicts an idle deployment from its bounded cache (`--vm-cache-cap`, default 1000 deployments). Keep anything that must last in `bun:sqlite` (`Database` is predefined), the `sqlite` kit or the `files` kit.
- **Request body.** `req.body` is parsed JSON, a urlencoded form as an object (a repeated key keeps its last value), or for `multipart/form-data` the text fields only; any other content type is a Buffer. Uploaded files are in `req.files`, one entry per file (empty files and repeated field names included): `{ fieldName, filename, type, size, data }` with `data` a Buffer and `type` the MIME type the runtime reports, which may differ from the part's declared Content-Type and can come from the filename (observed on Bun 1.4.2: `a.pdf` sent as `text/plain` gave `application/pdf`, `a.txt` gave `text/plain;charset=utf-8`, an unknown extension gave `""`), so check the bytes when the type matters.
- **`pre.js` / `post.js` are per directory.** They run around each HTTP request to a script in their own directory (its `index` included) and never for subdirectories or parent directories, so `admin/pre.js` does not guard `admin/deep/x.js`. `.ts` works too. They also run around each `@schedule` fire of a script in their directory: the fire has no client-supplied headers and `req.body` is `null`, so a header guard like the `X-Admin-Key` check in example 13 stops the scheduled script. To let scheduled fires through such a guard, test `metadata.trigger === 'cron'` before the header check, or keep scheduled scripts in a directory without the guard. A non-null return from `pre.js` (or a response it already ended) skips the script; to pass data on, set it on `req`. `post.js` receives the script's return value as `mainResult`, and a non-null return replaces the response. `post.js` still runs after a script that answered with `res.json()` / `res.send()`, but that answer stays as sent and `res.setHeader` then throws: check `res.headersSent` before touching the response. `post.js` also runs after a `pre.js` stop, with the `pre.js` value as `mainResult` (return nothing to keep it). A WebSocket connection runs `pre.js` once, before the handshake (never per message, never `post.js`): a non-null return or a started or ended `res` refuses the upgrade with that error status (else 403) and no socket opens (`req.body` is `null` on an upgrade, so body-reading checks must allow for it); what it sets on `req` reaches `ws.open(socket, req)`; `// @websocket-pre false` in the socket script skips it.
- **WebSocket scripts register handlers; they do not handle upgrades.** Both `// @websocket` and `// @mode worker` are required, or the socket is closed with `4400`. Assign `ws.open = (socket, req) => …`, `ws.message = (socket, data) => …`, `ws.close = (socket, code, reason) => …` (or `ws.on('message', …)`); never start a `ws` server or call `handleUpgrade`. The script body runs when the first socket connects, with `metadata.method === 'WEBSOCKET_INIT'`: once per script, or for a dynamic route once per route value while it has sockets (after that room's last socket closes, the next connection runs the body again with fresh variables; a changed script file serves new sockets from a fresh run with its own handler and connection pool, so a broadcast from one run does not reach the other; an HTTP request uses the pool currently registered for the script, and handlers it assigns replace that pool's handlers, so register them only when `metadata.method === 'WEBSOCKET_INIT'`). Its top-level variables are shared by all sockets of that run, and its `req` / `metadata` are the first socket's request (`metadata.query` its query string alone, `metadata.parameters` its route params), so read each socket's own query from `socket.data.query` (or the `req` that `ws.open(socket, req)` receives) and keep per-connection state on `socket.data` (which also holds `headers`, `ip`). `data` is a string for text frames and a Buffer for binary ones; `socket.send` / `ws.broadcast(data, exceptSocket?)` send a plain object or array as JSON text and a string, Buffer or other binary value as given. An HTTP request to the same script re-runs the body and sees the same `ws.connections` / `ws.broadcast`.
- **Helper files and other directives.** Load a file of your own with `await import('./lib/x.js')` (resolved from the script's file). The helper exports with `export function x` or `module.exports = { x }`, then `const { x } = await import(…)`; a bare `module.exports = fn` arrives as `.default`. The helper can `require('./sibling.js')`: a helper's relative paths count from the helper's own directory (a `./round.js` inside the helper `./lib/price.js` is the `round.js` next to that helper, not next to the script); `require('./lib/x.js')` from the script body works too (resolved from the script's file). A helper file runs in its deployment's context (the one `// @mode worker` scripts of that exec ID share): it sees the script's `fetch` and `process.env` (the script's `.env` values included), and its module-level state (`const items = []`, `globalThis.store ??= {}` in the helper) is kept between requests in both modes, separate per exec ID, in memory like `shared`. A relative helper path counted from the wrong directory (`require('../../lib/store.js')` one level too high) is looked up from each parent directory up to the deployment's own directory and loads the one file it matches, with a warning naming the path to write; several matches or none fail with the paths tried. The script's `process.env` is the kit's environment plus every `_default.env` from the scripts root down to the script's directory, then the script's own `<name>.env`, merged per variable (the nearest file wins). `__dirname` and `__filename` are not defined in the script itself (using one throws), and a relative path is not resolved from the script's directory: in the script and its helpers, `new Database('app.sqlite')`, `fs.writeFileSync('x.json', …)`, `Bun.write` and `process.cwd()` use the deployment's own data directory (persistent, separate per exec ID). Read a file that sits beside the script with `fs.readFileSync(require.resolve('./data.json'), 'utf8')`, or build its path from `import.meta.dirname`. A helper that is part of an import cycle between ES modules is the exception: the kit's own loader loads it, so it shares the kit's `globalThis` and `process.env` and is a single instance for every deployment. Break the cycle, or write that helper as CommonJS (`module.exports`). `// @description …`, `// @tags a,b` and `// @label x` only describe the script for `scripts.list` (which filters on `label` / `tags`) and change nothing at runtime. `// @enabled false` answers 404 without running the script; repeat `// @token` to accept several tokens; a caller sends the token as `Authorization: Bearer`, as the password of `Authorization: Basic`, as `X-Token` or as `?token=`, and only the first token found in that order is compared (a wrong Bearer token fails even beside a good `X-Token`; an `Authorization` header with another scheme, or a Basic value without a password, is skipped); `@token` takes one word (the rest of the line is ignored, with a warning). A returned object is always the JSON body: `return { status: 301, body }` answers 200 with that object, so set a status with `res.status()`.
- **`cookie` is v2.** `const { parseCookie, stringifySetCookie } = require('cookie')`: `parseCookie(req.headers.cookie ?? '')` reads cookies, `stringifySetCookie({ name: 'sid', value: 'abc', httpOnly: true, path: '/' })` writes one (`stringifySetCookie(name, value, options)` works too). The v1 `cookie.parse(header)` and `cookie.serialize(name, value, options)` also work in scripts (`require`, `import`, the preloaded `cookie`).
- **URL, query and CORS.** `req.url` is the path and query (`/x?a=1`), not a full URL. `metadata.query` is decoded like a form (`+` is a space) and keeps only the last value of a repeated key. On HTTP requests route params are merged into `metadata.query` and `metadata.parameters` (and a socket's `socket.data.query`) over query keys of the same name, so for the query string alone use `new URL(req.url, 'http://x').searchParams` (`.getAll('key')` for every value). By default each response reflects the caller's `Origin` and sends `Access-Control-Allow-Credentials: true`; `// @cors-credentials false` keeps the reflection without it. With any `@cors` line (`*` reflects any origin, `https://app.example` one origin, `none` blocks), credentials are sent only with `// @cors-credentials true`. For a literal `Access-Control-Allow-Origin: *`, call `res.setHeader('Access-Control-Allow-Origin', '*')` and add `// @cors-credentials false`: the policy is applied before the script runs, so the script's header is sent as set, but without that line `Access-Control-Allow-Credentials: true` goes out beside it and browsers refuse the pair on a credentialed request. These directives shape the script's own responses: an ordinary `OPTIONS` preflight is answered by the kit's global policy (reflected origin, credentials) and never reaches the script (platform hook dispatch is the exception).
- **`.md` URLs serve Markdown files, never scripts.** `/guide.md` serves the file `guide.md` as `text/markdown`, behind the `@token` of `guide.ts` / `guide.js` beside it; a script named `guide.md.ts` is never reached. (A proxy hook names its target script, so it can still run one for a `.md` URL.)

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — some segment of the path is a reserved directory name: `node_modules`, `.git`, `.hoody-cache`, `_sdk` or `_hoody`. The check is per segment and applies at any depth, so `api/node_modules/x.ts` is refused as surely as `node_modules/x.ts`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`kit.restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, computer id, server name) from `computers.get` (`client.api.computers.get(computerId)`) first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST https://{P}-{C}-exec-1.{N}.computers.hoody.com/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require`/`hoody` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when the syntax and TS-transpile checks pass. A missing dependency is only a warning (the runtime installs it on first execution), and magic comments are parsed but never fail the write.

```typescript
await client.exec.scripts.write({
  path: 'echo.js',
  content: 'module.exports = (req, res) => res.json({ ok: true, body: req.body });\n',
});
```

**Step 2 — invoke `POST /echo`** (bare path, NOT `/api/v1/exec/echo`). Body is auto-parsed; `res.json(value)` sends `value` as the JSON response body.

```typescript
// Under the default allow policy, the kit URL is sufficient: no Authorization header.
// When proxy permissions protect the kit, add the credential required by its authentication group.
const r = await fetch(`https://${P}-${C}-exec-1.${N}.computers.hoody.com/echo`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hello: 'world' }),
});
console.log(await r.json());
```

**Step 3 — read it back.** `scripts.read` returns the stored content (with `@token` / `@ai-key` values shown as `[REDACTED]`, see Quirks) + parsed `magicComments` + metadata.

```typescript
const r = await client.exec.scripts.read({ path: 'echo.js' });
console.log(r.data!.content);
```

### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `hoody.curl.run(...)` or other calls on the injected `hoody` client.

```typescript
await client.exec.scripts.write({
  path: 'workflow.js',
  content: `module.exports = async (req, res) => {
  // Real version — the global SDK client (hoody) is already scoped to this computer (under the default
  //   allow policy no token; a protected kit needs its group's credential as kitAuth):
  //   const a = await hoody.curl.run({ url: 'https://agent-a/score', method: 'POST', json: req.body });
  const callA = async () => ({ score: 0.91, label: 'spam' });
  const checkB = async (a) => ({ verdict: a.score > 0.8 ? 'block' : 'allow' });
  const actC  = async (v) => ({ executed: v === 'block' ? 'quarantined' : 'delivered' });
  const a = await callA();
  const b = await checkB(a);
  res.json({ a, b, c: await actC(b.verdict) });
};
`,
});
```

### 3. Webhook receiver with HMAC signature verification

**Goal:** GitHub-style `X-Hub-Signature-256` verification using `crypto.timingSafeEqual`. Reject 401 on bad sig.

**Step 1 — write the verifier.** No `npm install` needed — `crypto` is a runtime built-in.

```typescript
const webhookCode = `const crypto = require('crypto');
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
`;
await client.exec.scripts.write({ path: 'webhook.js', content: webhookCode });
```

### 4. Pin npm deps — `modules.test` → `modules.install` → `packages.pin`

**Goal:** install `left-pad`, make sure the kit's package.json declares it, then pin it to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```typescript
const r = await client.exec.modules.test({ code: 'const leftPad = require("left-pad");' });
console.log(r.data!.missing);
```

**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"left-pad@1.3.0"`).

```typescript
await client.exec.modules.install({ modules: ['left-pad'] });
```

**Step 3 — declare it.** `modules.install` skips npm when a usable copy already resolves, so it does not always add a declaration, and `packages.pin` pins only what `dependencies` declares. Read the manifest; when it has no `left-pad` entry, add a range for it.

```typescript
const m = await client.exec.packages.manifest.get();
if (!m.data!.dependencies?.['left-pad']) {
  await client.exec.packages.manifest.update({ dependencies: { 'left-pad': '^1.3.0' } });
}
```

**Step 4 — pin to exact versions.** Each declared range is replaced by the version actually installed, provided it satisfies the range. For a range, a package that is not installed, or whose installed version falls outside the range, is listed under `unpinnable` with the reason instead; so is a selected package that `dependencies` does not declare (`"not declared in dependencies"`). Read `unpinnable` in the answer rather than assuming the pin took. A declaration that is already an exact version is left as it is, without checking that it is installed.

```typescript
await client.exec.packages.pin({ packages: ['left-pad'] });
```

### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```typescript
const code = `// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });`;
const v = await client.exec.scripts.validate({ code });
const m = await client.exec.magicComments.validate({ code });
console.log(v.data!.valid, m.data!.magicComments);
```

If `valid:true`, ship it via `scripts.write` (default `validate:true` re-runs the checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies}` slots tell you which checker rejected it. Magic comments never make a script invalid: a directive whose value cannot be used is reported in `results.magicCommentWarnings` (or `warnings` from `magicComments.validate`) while `valid` stays `true`, so read those warnings separately. Most unusable values leave an earlier valid value or the default in effect, but an invalid `@enabled` value is treated as `false` and disables the script. The two paths differ on one point: `scripts.validate` counts a `require()`d module that is not installed yet as a failure, while `scripts.write` only warns about it and the runtime installs it on first execution. A `valid:false` whose only failing slot is `dependencies` can be written for the runtime to install when `results.dependencies.invalidModules` is empty, so the failure is only missing packages. A versioned import specifier such as `require('lodash@4')` is listed in `invalidModules` and refused at runtime: declare the version in the scripts-root `package.json` (`packages.manifest.update` with `dependencies`), install a copy that satisfies it (`packages.install`), optionally replace the range with the installed exact version (`packages.pin`), and import the bare package name (Example 4).

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script the runtime can route gets a route entry in a single OpenAPI 3.0 document the proxy can serve (test and spec files, symlinks and `pre.js` / `post.js` middleware are not routes, so they get none). Request/response shapes come only from a script's companion `.openapi.json` file; a script without one gets a generic `GET` entry, and a companion that cannot be read or parsed leaves that script out and is listed under `x-schema-errors` in the document.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```typescript
const r = await client.exec.openapi.listScripts();
console.log(r.data!.data.scripts);
```

**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```typescript
const r = await client.exec.openapi.get({ format: 'json' });
require('fs').writeFileSync('/tmp/user-scripts.openapi.json', JSON.stringify(r.data, null, 2));
```

**Step 3 — combine the auto-generated spec with hand-written documents** using `openapi.merge`. It is a union, not an overlay: the generated documents come first and the first definition of each path and method wins, so a later document cannot add auth or examples to a generated operation (its duplicate is listed in `x-merge-conflicts`); edit the returned document for that. Merge generates from the scripts only for the `directories` you name (`scripts` means the calling deployment's scripts directory, not every deployment's); without them it merges just the `specs` you pass. It answers `{success, data}` with the merged document in `data`.

```typescript
const layer = JSON.parse(require('fs').readFileSync('/tmp/layer.json', 'utf8'));
const merged = await client.exec.openapi.merge({ directories: ['scripts'], specs: [layer] });
const doc = merged.data!.data;   // the merged OpenAPI document
```

`openapi.merge` and `openapi.generate` only RETURN a document; neither writes anything, and `openapi.get` (step 2) regenerates from the scripts on every call, so it never shows a merge. Store the merged document yourself if you need to keep or publish it. `openapi.validateSchema` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `logs.list` returns kit-wide log files; `logs.get` slices a specific one.

```typescript
const list = await client.exec.logs.list();
const logName = list.data.logs[0]?.name;   // entries key on `name`, not `file`
if (typeof logName !== 'string') throw new Error('No log file available');
const tail = await client.exec.logs.get({ file: logName, lines: '200', tail: true });

// Live tail: stream() resolves to an async iterable of SSE events. A `message` event's data is {"line": "..."};
// a `gap` event ({reason, file} or {reason, skippedFiles}) reports log lines the follower could not deliver.
for await (const ev of await client.exec.logs.stream({ file: logName, follow: true })) {
  const data = JSON.parse(ev.raw);
  if (ev.event === 'gap') console.error('Log gap:', data);
  else console.log(data.line);
}
```

Per-request execution logging is ON by default (`@log-level` defaults to `standard`); `// @log-level none` turns that logging off for the script. The kit's separate access log still records the requests routed to scripts; it does not cover management API calls or CORS preflights, which are answered before it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `kit.getStats` is a single snapshot; `kit.listRequests` lists in-flight script HTTP requests and running `@schedule` fires (`method: "CRON"`) (for WebSocket counts use `kit.getStats` `websocket.active`, or each script's `activeWs` from `scripts.listStats`); `scripts.listStats` lists tracked scripts with traffic, with their request and error counters (100 by default, at most 500 per call, so compare `count` with `total` to detect truncation; sort by `requests`, `errors`, `p95`, `ws_active` or the default `lastActivity`); `scripts.getStats` then reports on ONE script, named by the `scriptPath` from that listing. An empty body returns the stub `{"metrics":{}}`. The same stub is returned when metrics are unavailable or `scriptPath` does not resolve to a tracked script, including a wrong path or a script with no recorded traffic yet. Take `scriptPath` verbatim from `scripts.listStats`.

```typescript
const stats = await client.exec.kit.getStats();
const active = await client.exec.kit.listRequests();
const hot = await client.exec.scripts.listStats({ sort: 'requests', limit: 10 });
const first = hot.data.scripts[0];  // scriptPath is root-relative, e.g. default/1/echo.js
const perf = first
  ? await client.exec.scripts.getStats({ scriptPath: first.scriptPath })
  : undefined;  // no script has run yet
```

For Prometheus scraping, `GET /api/v1/exec/monitor/metrics` returns text/plain in standard exposition format.

### 9. Wrap a bash one-liner as an HTTP API with `Bun.$`

**Goal:** turn `df -h /` into a JSON HTTP endpoint with no scaffolding. `Bun.$` is in scope inside any script.

```typescript
await client.exec.scripts.write({
  path: 'disk-usage.js',
  content: `module.exports = async (req, res) => {
  const out = await Bun.$\`df -h --output=source,size,used,avail,target /\`.text();
  res.json({ disk: out.trim().split('\\n').slice(1).map(l => l.split(/\\s+/)) });
};
`,
});
```

Same pattern works for `python3 -c "..."`, `ffmpeg`, native binaries, anything on `$PATH`. The script handler runs inside the computer as a normal process.

### 10. In-process schedule via `@schedule` directive

**Goal:** fire a script every 5 minutes WITHOUT the `cron` namespace. The schedule lives inside the kit; if the kit restarts, the schedule re-registers from disk on boot. (For schedules that must survive a kit-down — use the `cron` namespace instead.)

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log. A scheduled fire has no HTTP caller, so the script's `res.json` body goes nowhere; `schedules.run` (step 3) reports the fire outcome instead, not that body.

```typescript
await client.exec.scripts.write({
  path: 'tick.js',
  content: `// @schedule */5 * * * *
// @description Heartbeat — fires every 5 minutes
module.exports = async (req, res) => {
  console.log('[tick] fired at', new Date().toISOString());
  res.json({ ok: true, ts: Date.now() });
};
`,
});
```

**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, the absolute on-disk `scriptPath`, and `scriptRel`, the same path relative to the scripts root (e.g. `default/1/tick.js`). Either one is what step 3 needs.

```typescript
const r = await client.exec.schedules.list();
console.log(r.data!.schedules);
```

**Step 3 — fire it on demand.** `scriptPath` accepts the absolute `scriptPath` from step 2 or its root-relative `scriptRel` (`default/1/tick.js`). A relative path is scoped by the kit URL like `scripts.write`, so through the `exec-1` kit URL plain `tick.js` also names `default/1/tick.js`. `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only. The response is the fire outcome, `{triggered, scriptPath, runId, status, durationMs, error?}`.

```typescript
await client.exec.schedules.run({
  scriptPath: 'tick.js',
  force: true,
});
const hist = await client.exec.schedules.listHistory({ limit: 5 });
```

**Stop the schedule** by deleting the script (`client.exec.scripts.delete({ path: 'tick.js', confirm: 'true' })`) or by rewriting it through `scripts.write` without the `// @schedule` directive; every `scripts.write` re-registers that file's schedule, so no separate `schedules.reload` call is needed. Use `schedules.reload` only after changing files some other way.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. Every endpoint has, as script-scoped bindings enabled by default (`// @ai false` turns them off; not on `globalThis`), `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key defaults to `computer-<hash>`. Default model is **`hoody-ai/hoody-free`** (the kit's `--ai-default-model`). Override per-script with `// @ai-model <provider/model>`; what a model costs is up to the AI service, not exec. Set a default system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```typescript
await client.exec.scripts.write({
  path: 'summarize.js',
  content: `// @description One-line summary via built-in Hoody AI (no key or setup)
module.exports = async (req, res) => {
  const text = metadata.query.q || 'Say hello in one sentence.';
  const result = await ai.generate('Summarize in one line: ' + text); // ai, model, generateText: predefined in the script scope
  res.json({ summary: result.text });
};
`,
});
```

**Step 2 — invoke it** (bare path on the exec kit URL). No key anywhere in the call:

```
https://{P}-{C}-exec-1.{N}.computers.hoody.com/summarize?q=Hoody+is+a+remote-first+computing+platform
# → {"summary":"..."}
```

For structured output use `(await ai.object({ schema, prompt })).object` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`. The system prompt in `summarize.system.md` is the default for `ai.generate` / `ai.stream` / `ai.object` with no code; do not read the file yourself (the raw `generateText` and friends need an explicit `system`).

### 12. WebSocket endpoint — rooms with broadcast, plus HTTP on the same path

**Goal:** a chat room per URL (`/rooms/red`, `/rooms/blue`): every text message goes to everyone in that room, sender included, and a plain HTTP request to the same path posts into the room. A WebSocket script never handles the upgrade itself: it declares `// @websocket` and `// @mode worker` (without both the socket is closed with `4400`) and assigns handlers on the injected `ws`.

**Step 1 — write `rooms/[room].js`** with `scripts.write` as in example 1, path `rooms/[room].js`:

```javascript
// file: rooms/[room].js
// @mode worker
// @websocket
const room = metadata.parameters.room;   // the body also re-runs on every HTTP request; the socket run happens once per room in use
if (metadata.method === 'WEBSOCKET_INIT') {   // register handlers only here: an HTTP run would replace them
  ws.open = (socket, req) => { socket.data.count = 0; };   // per-connection state lives on socket.data
  ws.message = (socket, data) => {       // data: a string (a Buffer for binary frames)
    socket.data.count++;
    ws.broadcast(JSON.stringify({ room, text: data, n: socket.data.count }));   // this room only, sender included
  };
  ws.close = (socket, code, reason) => {};
  return;
}
// Plain HTTP on the same path: the body runs again per request and sees this room's sockets.
if (req.method === 'POST') ws.broadcast(JSON.stringify({ room, text: req.body.text, n: 0 }));
return { room, sockets: ws.connections.size };
```

**Step 2 — connect.** Top-level variables of the script are shared by every socket of the room; anything an HTTP request must share with the socket handlers goes in `shared`. `socket.send(data)` and `ws.broadcast(data, exceptSocket?)` send a plain object or an array as JSON text; strings, Buffers, typed arrays and `ArrayBuffer` values go out as given.

```javascript
const sock = new WebSocket(`wss://${P}-${C}-exec-1.${N}.computers.hoody.com/rooms/red`);
sock.onopen = () => sock.send('hi');
sock.onmessage = (e) => console.log(JSON.parse(e.data));   // → {"room":"red","text":"hi","n":1}
// From any HTTP client: POST /rooms/red {"text":"from http"} → {"room":"red","sockets":1}
```

### 13. Middleware — guard a directory with `pre.js`, wrap answers with `post.js`

**Goal:** every script in `admin/` requires `X-Admin-Key`, and every answer is wrapped in an envelope. `pre.js` / `post.js` act on HTTP requests and `@schedule` fires of the scripts of their OWN directory only: `admin/reports/x.js` is not guarded until `admin/reports/` gets its own `pre.js`, and `admin/pre.js` also guards the `@websocket` scripts in `admin/` (once per connection, before the handshake).

**Step 1 — write the three files and the key** with `scripts.write` (example 1): `admin/pre.js`, `admin/post.js`, `admin/users.js`, and `admin/_default.env` (its values show up in `process.env` of every script in `admin/`).

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
GET https://{P}-{C}-exec-1.{N}.computers.hoody.com/admin/users  with  X-Admin-Key: change-me → 200 {"ok":true,"data":{"users":[],"by":"admin"}}, X-Envelope: v1
GET https://{P}-{C}-exec-1.{N}.computers.hoody.com/admin/users  without the header           → 401 {"error":"unauthorized"}
```

### 14. File upload — `multipart/form-data` and `req.files`

**Goal:** accept a form with a `title` field and a `document` file. Text fields are in `req.body`; files are only in `req.files`, one `{ fieldName, filename, type, size, data }` entry per file (`data` is a Buffer; `type` is the MIME type the runtime reports, which may differ from the part's declared Content-Type and can come from the filename; empty files and repeated field names each get an entry).

**Step 1 — write `upload.js`** with `scripts.write` (example 1):

```javascript
// file: upload.js
const doc = (req.files ?? []).find((f) => f.fieldName === 'document');
if (!doc) { res.status(400); return { error: 'document missing' }; }
return { title: req.body.title, filename: doc.filename, type: doc.type, size: doc.size, text: doc.data.toString('utf8') };
```

**Step 2 — post a form.** Submit a `multipart/form-data` request to the script's `/upload` URL (`https://{P}-{C}-exec-1.{N}.computers.hoody.com/upload`) with the text field `title=notes` and a file field named `document`. Uploading `a.txt` containing the five bytes `hello` returns `title: "notes"`, `filename: "a.txt"`, `size: 5` and `text: "hello"`; `type` is the MIME type reported by the runtime (`text/plain;charset=utf-8` on Bun 1.4.2).

## Reference

**Accessor:** `client.exec`  |  **Import:** `import * as exec from 'hoody-sdk/exec'`

Every `…Response` type here, and `ApiResponse<T>`, is the envelope `{ statusCode: number; message: string; data: T }`: read the payload from `.data`. Signatures list only the operation's own parameters. Kit methods also take `_templateVars` — `{ projectId?, computerId?, serviceIndex?, serverName? }` (`server` is the older spelling of `serverName`, which wins when both are set), which retargets the call — as a positional argument these signatures omit, and the per-call transport options `signal`, `timeoutMs`, `retries`, `retryDelayMs`, `retryOnStatuses`, `rawResponse`, `responseType`, `authRetry`, `middlewareContext`, `headers` (extra request headers for this call; `Authorization`, `X-Hoody-Client-ID` and `X-Hoody-Client-Name` are set by the client and are refused with a `TypeError` before the call is sent: configure the token on the client, a kit credential as `kitAuth` on `withComputer()` or the client config (`middlewareContext.kitAuth` replaces the client's `kitAuth` for one call), and use another client for another identity), `cache` (ignored here: only an `api` GET is cached, never a GET to a kit host), `responseIsFinal` (`true`: never sent again once it may have reached the server), `keyedInProgressWait` (`false`: a 409 IDEMPOTENCY_REQUEST_IN_PROGRESS is the answer, not asked again), `redactBodyKeys` (body keys whose values an ApiError shows as [REDACTED]) and `maxResponseBytes` (a response body over this many bytes is refused with code RESPONSE_TOO_LARGE, and reading stops) (no `_realm`: that one is control-plane only). When the signature shows an options object (`options?: object` is one that takes the transport options only), the transport options go inside it and `_templateVars` is the argument right after it. When it does not, `_templateVars` is the next argument and the transport options an object after that — so pass `undefined` for the target you are not overriding: `method(…, undefined, { timeoutMs: 5000 })`. A signature that shows `_templateVars` itself keeps the argument order it displays. A `wsOptions` argument (WebSocket methods only) accepts just `reconnect`, `connectTimeoutMs` and `transport`; the other transport options (`timeoutMs`, `signal`, …) stay in the request options the signature shows, never in `wsOptions`.

**Reading a method.** A method that shows no **Returns:** returns the response type named after it, the words after `client.` joined in PascalCase plus `Response`: `client.exec.cache.clear()` returns `Promise<ExecCacheClearResponse>`. `data` is the request body; it has a row only where the row says more than the signature.

**Services** (the ones the notes and examples above call most come first):

- `client.exec.scripts`: delete, getStats, getSummary, getTree, getUsage, list, listDeleted, listHistory, listStats, move, read, readVersion, restore, validate, validateDependencies, validateReturnType, validateSyntax, validateTypes, write, listFiles, readFile, writeFile, deleteFile
- `client.exec.logs`: clear, get, list, listExecutions, search, stream
- `client.exec.openapi`: generate, get, getSchema, listScripts, merge, validateSchema
- `client.exec.schedules`: list, listHistory, reload, run
- `client.exec.kit`: getHealth, getMetrics, getStats, getStatus, listRequests, restart
- `client.exec.modules`: install, listBundled, test
- `client.exec.packages.manifest`: create, get, update
- `client.exec.magicComments`: get, getSchema, parse, print, update, updateMany, validate
- `client.exec.packages`: compare, install, pin
- `client.exec.cache`: clear
- `client.exec.env`: listKeys, updateKeys
- `client.exec`: run, listCallableScripts, call, remote
- `client.exec.namespaces`: list
- `client.exec.ops`: settle
- `client.exec.routes`: list, resolve, test
- `client.exec.sdkTypes`: list
- `client.exec.sdks`: delete, get, import, list
- `client.exec.store`: clear, get, set
- `client.exec.templates`: create, delete, generate, list, preview, update
- `client.exec.tests`: delete, list, set

**Shared parameters.** A parameter row that repeats is printed once. When a signature shows a parameter that the method's own table does not list, its row is in the table below: same type, wire location, required mark and description. A row in a method's own table always describes that method. An SDK helper (marked as one) has no table and takes nothing from these lists.

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `execId` | `string` | query | No | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400. |
| `subdomain` | `string` | query | No | Optional subdomain namespace used with execId for path resolution. |

### `client.exec.scripts` (19) — Script CRUD (read/write/move/delete), metadata and live traffic counters

#### `delete` — Delete Script

```typescript
client.exec.scripts.delete(options: { path: string; confirm: "true"; keepCopy?: boolean; ifRevision?: string; opId?: string; expectRoute?: string; note?: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Script path relative to the scripts directory, for example `api/users.js`. Under the call's scope (`execId` / `exec_id` / `subdomain`, else the Host's `[<subdomain>.]…-exec-<execId>`) it is read as `<subdomain\|default>/<execId>/<path>` unless it already starts with that prefix. Leading slashes are dropped (a path inside the scripts directory is made relative to it), so an absolute computer path such as `/home/user/file.txt` names a file under the scripts directory, not on the computer. |
| `confirm` | `"true"` | query | Yes | Safety confirmation; must be the literal `true` or the request is rejected with 400. `confirm=false` is refused too: the check is for the literal value, not for truthiness. |
| `keepCopy` | `boolean` | query | No | When true, keep a copy in Recently deleted (scripts/history/deleted) that scripts/restore can put back. Needs a regular file. |
| `ifRevision` | `string` | query | No | Delete only this revision (from scripts/read). A different current revision is 409 `REVISION_MISMATCH`, nothing deleted. |
| `opId` | `string` | query | No | Journals the change under this id (16-64 letters, digits, `_` or `-`). Resending the identical request with the same id after it finished answers the stored outcome without changing anything again. Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost. |
| `expectRoute` | `string` | query | No | JSON text of `{"route": "/path", "answeredBy": "<script path relative to the scripts root>" \| null}`: refuse the delete (409 `ROUTE_EFFECT_CHANGED`, nothing done) unless, after it, the route is answered by `answeredBy`. route/resolve with `omit` previews it. |
| `note` | `string` | query | No | A short note (one line, at most 120 printable characters). It is validated but not saved with the retained copy. |

**HTTP:** `DELETE /api/v1/exec/scripts/delete`
**CLI:** `hoody exec scripts delete <path>`

---

#### `getStats` — Get Script Performance

```typescript
client.exec.scripts.getStats(data?: ExecScriptsGetStatsRequest)
```

**Body:** `{ scriptPath: string|null }`

- `scriptPath` — Script to report on, as `/monitor/scripts` lists it (relative to the scripts directory) or as an absolute path. An unknown script returns `{"metrics": {}}`; a non-string value is refused with a 400.

**HTTP:** `POST /api/v1/exec/monitor/script-performance`
**CLI:** `hoody exec scripts stats get`

---

#### `getSummary` — Get Scripts Summary

```typescript
client.exec.scripts.getSummary(options?: { execId?: string; subdomain?: string })
```

**HTTP:** `GET /api/v1/exec/monitor/scripts-summary`

---

#### `getTree` — Get Script Tree

```typescript
client.exec.scripts.getTree(data?: ExecScriptsGetTreeRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ baseDir: string="", maxDepth: int=10, includeMetadata: bool=false, execId: string, exec_id: string, subdomain: string }`

- `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.

**HTTP:** `POST /api/v1/exec/scripts/tree`
**CLI:** `hoody exec scripts tree get`

---

#### `getUsage` — Get Script Usage

```typescript
client.exec.scripts.getUsage(options: { scriptPath: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scriptPath` | `string` | query | Yes | The script to report on, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |

**HTTP:** `GET /api/v1/exec/monitor/script-usage`

---

#### `list` — List Scripts

```typescript
client.exec.scripts.list(options?: { dir?: string; filter?: string; metadata?: string; label?: string; tags?: string; mode?: string; enabled?: string; websocket?: string; remote?: "any" | "none" | "messages" | "call" | "eval"; recursive?: string; include_comments?: string; exhaustive?: boolean; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `dir` | `string` | query | No | Dir query parameter |
| `filter` | `string` | query | No | Filter query parameter |
| `metadata` | `string` | query | No | Set `true` to include each entry's size, creation time and modification time (as `metadata`). Any non-empty value turns it on, `false` included. |
| `label` | `string` | query | No | Label query parameter |
| `tags` | `string` | query | No | Tags query parameter |
| `mode` | `string` | query | No | Mode query parameter |
| `enabled` | `string` | query | No | Enabled query parameter |
| `websocket` | `string` | query | No | Websocket query parameter |
| `remote` | `"any" \| "none" \| "messages" \| "call" \| "eval"` | query | No | Keep only scripts by their remote operations: `any` (at least one of `@remote-messages`, `@remote-call`, `@remote-eval` is on), `none` (all off), or `messages` / `call` / `eval` (that one is on). Lists recursively and adds each script's `magicComments` and `remote` summary, like the other filters. Any other value is refused with 400. |
| `recursive` | `string` | query | No | Recursive query parameter |
| `include_comments` | `string` | query | No | Include_comments query parameter |
| `exhaustive` | `boolean` | query | No | When true, list every entry below `dir` recursively with its `type` (file, directory, symlink, fifo, socket, block-device, character-device, unknown), in `entries` instead of `scripts`. Nothing is hidden (dot-files, node_modules, .git, .hoody-cache, _sdk, _hoody) and no symlink is followed. Combine only with `dir`, `execId`, `exec_id` and `subdomain` (other options are refused with 400). The answer is complete or an error, never partial: more than 10000 entries is 422 with `details.code` `TOO_MANY_ENTRIES`; a name or link target that is not valid UTF-8 is 422 with `details.code` `NAME_NOT_UTF8` (`details.parent`, and the raw name as `details.nameHex`); an entry or directory that disappears or is replaced during the scan, or a directory whose dev, inode, mtime or ctime changed after it was read (checked once the scan is done), restarts it, and a tree still changing after 3 restarts is 409 with `details.code` `TREE_CHANGED`. This is best effort, for a tree nobody mutates concurrently: a change undone within one timestamp tick, or on a filesystem without fine timestamps, can go unseen. |

**HTTP:** `GET /api/v1/exec/scripts/list`
**CLI:** `hoody exec scripts list`

---

#### `listDeleted` — Deleted Scripts

```typescript
client.exec.scripts.listDeleted(options?: { execId?: string; subdomain?: string })
```

**HTTP:** `GET /api/v1/exec/scripts/history/deleted`

---

#### `listHistory` — Script History

```typescript
client.exec.scripts.listHistory(options: { path: string; limit?: number; cursor?: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Path query parameter |
| `limit` | `number` | query | No | Versions per page, 1 to 50. Default 20. |
| `cursor` | `string` | query | No | The `next` value of the previous page. |

**HTTP:** `GET /api/v1/exec/scripts/history`

---

#### `listStats` — List Monitor Scripts

```typescript
client.exec.scripts.listStats(options?: { limit?: number; sort?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `number` | query | No | Maximum number of scripts to return. Default 100. A value below 1 is raised to 1 and a value above 500 is lowered to 500. Over raw HTTP a value with no leading number means 100 and nothing is refused. |
| `sort` | `string` | query | No | Sort key: `lastActivity` (default), `requests`, `errors`, `p95` or `ws_active`. `lastActivity` puts the most recent activity first; each other key sorts descending by the matching metric. Any other value is not refused: it sorts by last activity, like `lastActivity`. |

**HTTP:** `GET /api/v1/exec/monitor/scripts`
**CLI:** `hoody exec scripts stats list`

---

#### `move` — Move Script

```typescript
client.exec.scripts.move(data: ExecScriptsMoveRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ from*: string, to*: string, overwrite: bool=false, execId: string, exec_id: string, subdomain: string }`

- `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.

**HTTP:** `POST /api/v1/exec/scripts/move`
**CLI:** `hoody exec scripts move --from <from> --to <to>`

---

#### `read` — Read Script

```typescript
client.exec.scripts.read(options: { path: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Script path relative to the scripts directory, for example `api/users.js`. Under the call's scope (`execId` / `exec_id` / `subdomain`, else the Host's `[<subdomain>.]…-exec-<execId>`) it is read as `<subdomain\|default>/<execId>/<path>` unless it already starts with that prefix. Leading slashes are dropped (a path inside the scripts directory is made relative to it), so an absolute computer path such as `/home/user/file.txt` names a file under the scripts directory, not on the computer. |

**HTTP:** `GET /api/v1/exec/scripts/read`
**CLI:** `hoody exec scripts read <path>`

---

#### `readVersion` — Read Script Version

```typescript
client.exec.scripts.readVersion(options: { path: string; version: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Path query parameter |
| `version` | `string` | query | Yes | The version to read, from scripts/history or scripts/history/deleted. A version ID: `h-` (history) or `d-` (deleted copy), 1 to 12 lowercase letters or digits, `-`, then 8 hexadecimal digits, for example `h-mjuohs00-8d7c6b5a`. Use the ID the service returned. Unknown: 404 `VERSION_NOT_FOUND`. |

**HTTP:** `GET /api/v1/exec/scripts/history/read`

---

#### `restore` — Restore Script

```typescript
client.exec.scripts.restore(data: ExecScriptsRestoreRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ execId: string, exec_id: string, subdomain: string, path*: string, version*: string, ifRevision*: string|null, opId: string, expectRoute: { route*: string, answeredBy*: string|null }, note: string }`

- `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `ifRevision` — Required: the file's current revision, or null when it is absent (after a delete). A different current revision is 409 `REVISION_MISMATCH`, nothing changed.
- `opId` — … Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost.
- `expectRoute` — Refuse the change (409 `ROUTE_EFFECT_CHANGED`, nothing done) unless, after it, this URL path is still answered by `answeredBy`. route/resolve with `omit` previews a delete.
- `note` — A short note kept with the version this change writes (one line, at most 120 printable characters).

**HTTP:** `POST /api/v1/exec/scripts/restore`

---

#### `validate` — Validate Script

```typescript
client.exec.scripts.validate(data: ExecScriptsValidateRequest)
```

**Body:** `{ code*: string, language: string, extension: string, typecheck: bool=false }`

- `typecheck` — When true, also type-check the code with the TypeScript compiler against the hoody-sdk declarations in `<scripts>/node_modules` and the script globals (`hoody`, `req`, `res`, …). Imports TypeScript cannot resolve are not reported; types from relative helper files are not checked (`any`). …

**HTTP:** `POST /api/v1/exec/validate/script`
**CLI:** `hoody exec scripts validate --code <code>`

---

#### `validateDependencies` — Validate Dependencies

```typescript
client.exec.scripts.validateDependencies(data: ExecScriptsValidateDependenciesRequest)
```

**Body:** `{ code*: string }`

**HTTP:** `POST /api/v1/exec/validate/dependencies`
**CLI:** `hoody exec scripts dependencies validate --code <code>`

---

#### `validateReturnType` — Validate Return Type

```typescript
client.exec.scripts.validateReturnType(data: ExecScriptsValidateReturnTypeRequest)
```

**Body:** `{ typeDefinition*: string, value*: any }`

**HTTP:** `POST /api/v1/exec/validate/return-type`
**CLI:** `hoody exec scripts returntype validate --type-definition <type-definition> --value <value>`

---

#### `validateSyntax` — Validate Syntax

```typescript
client.exec.scripts.validateSyntax(data: ExecScriptsValidateSyntaxRequest)
```

**Body:** `{ code*: string }`

**HTTP:** `POST /api/v1/exec/validate/syntax`
**CLI:** `hoody exec scripts syntax validate --code <code>`

---

#### `validateTypes` — Validate Type Script

```typescript
client.exec.scripts.validateTypes(data: ExecScriptsValidateTypesRequest)
```

**Body:** `{ code*: string, typecheck: bool=false }`

- `typecheck` — When true, also type-check the code with the TypeScript compiler against the hoody-sdk declarations in `<scripts>/node_modules` and the script globals (`hoody`, `req`, `res`, …). Imports TypeScript cannot resolve are not reported; types from relative helper files are not checked (`any`). …

**HTTP:** `POST /api/v1/exec/validate/typescript`
**CLI:** `hoody exec scripts types validate --code <code>`

---

#### `write` — Write Script

```typescript
client.exec.scripts.write(data: ExecScriptsWriteRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ path*: string, content*: string, createDirs: bool=true, validate: bool=true, ifNotExists: bool=false, typecheck: bool=false, execId: string, exec_id: string, subdomain: string, ifRevision: string|null, opId: string, expectRoute: { route*: string, answeredBy*: string|null }, note: string }`

- `content` — Content. … In a `.js` / `.ts` script or a `.sdk.json` marker, a placeholder with no stored value (a new file, or no matching line) is refused with 400 and `details.code` `REDACTED_SECRET_UNRESOLVED`; the placeholder is never stored as a secret.
- `ifNotExists` — … When true and the name already exists as anything (a file, a directory, a live or dangling symlink, which is never followed), nothing is written and the answer is 409; a symlinked ancestor directory is still 403. The existence check and the create are one atomic step, so of several concurrent creates (from any process) exactly one succeeds. …
- `typecheck` — … Imports TypeScript cannot resolve are not reported; types from relative helper files are not checked (`any`). … Only with validation on, for a .js/.ts path: a type error refuses the write with 400 (`details.validation.typecheck.diagnostics`); a check that could not run does not.
- `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `ifRevision` — Write only over this revision (from scripts/read); null means create only (like `ifNotExists`). A different current revision is 409 `REVISION_MISMATCH`, nothing written. Not with `ifNotExists`.
- `opId` — … Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost.
- `expectRoute` — Refuse the change (409 `ROUTE_EFFECT_CHANGED`, nothing done) unless, after it, this URL path is still answered by `answeredBy`. route/resolve with `omit` previews a delete.
- `note` — A short note kept with the version this change writes (one line, at most 120 printable characters).

**HTTP:** `POST /api/v1/exec/scripts/write`
**CLI:** `hoody exec scripts write <path> --content <content>`

---

#### `listFiles` — SDK helper

```typescript
client.exec.scripts.listFiles(options?: ExecListFilesOptions, templateVars?: ExecScriptsTemplateVars)
```

**Returns:** `Promise<ExecScriptsListResponse>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `readFile` — SDK helper

```typescript
client.exec.scripts.readFile(path: string, options?: ExecReadFileOptions & { kind?: 'file' | 'markdown' }, templateVars?: ExecScriptsTemplateVars)
```

**Returns:** `Promise<ExecScriptsReadResponse>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `readFile` — SDK helper

```typescript
client.exec.scripts.readFile<TContent extends Record<string, unknown> = Record<string, unknown>>(path: string, options: ExecReadFileOptions & { kind: ExecScriptJsonKind }, templateVars?: ExecScriptsTemplateVars)
```

**Returns:** `Promise<ExecReadJsonFileResponse<TContent>>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `writeFile` — SDK helper

```typescript
client.exec.scripts.writeFile(path: string, content: string, options?: ExecWriteFileOptions, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars)
```

**Returns:** `Promise<ExecScriptsWriteResponse>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `writeFile` — SDK helper

```typescript
client.exec.scripts.writeFile<TContent extends Record<string, unknown> = Record<string, unknown>>(path: string, data: TContent, options: ExecWriteJsonFileOptions, requestOptions?: ExecScriptsRequestOptions, templateVars?: ExecScriptsTemplateVars)
```

**Returns:** `Promise<ExecScriptsWriteResponse>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `deleteFile` — SDK helper

```typescript
client.exec.scripts.deleteFile(path: string, options?: ExecDeleteFileOptions, templateVars?: ExecScriptsTemplateVars)
```

**Returns:** `Promise<ExecScriptsDeleteResponse>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.exec.logs` (6) — Script execution logs

#### `clear` — Clear Logs

```typescript
client.exec.logs.clear(options: { confirm: "true"; file?: string; type?: "all" | "request" | "access" | "cron" | "other"; olderThanDays?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `file` | `string` | query | No | File query parameter |
| `type` | `"all" \| "request" \| "access" \| "cron" \| "other"` | query | No | Which logs to clear: `all`, `request`, `access`, `cron` or `other`. Any other value is refused with 400. |
| `olderThanDays` | `string` | query | No | OlderThanDays query parameter |
| `confirm` | `"true"` | query | Yes | Safety confirmation; must be the literal `true` or the request is rejected with 400. |

**HTTP:** `DELETE /api/v1/exec/logs/clear`
**CLI:** `hoody exec logs clear`

---

#### `get` — Read Log

```typescript
client.exec.logs.get(data: ExecLogsGetRequest)
```

**Body:** `{ file: string|null, executionId: string|null, lines: int|null | string=100, tail: bool|null=true, search: string|null } (at least one of: file | executionId required)`

- `lines` — Maximum number of lines to return, 1 to 10000. Default 100. A string of digits in that range is also accepted (surrounding whitespace and leading zeros are ignored); any other value is refused with a 400.

**HTTP:** `POST /api/v1/exec/logs/read`
**CLI:** `hoody exec logs get`

---

#### `list` — List Logs

```typescript
client.exec.logs.list(options?: { type?: "all" | "request" | "access" | "cron" | "other"; limit?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `"all" \| "request" \| "access" \| "cron" \| "other"` | query | No | Which logs to list: `all`, `request` (execution files under `executions/`), `access`, `cron` or `other`. Any other value is refused with 400. |
| `limit` | `string` | query | No | Maximum number of log files to return, newest first, with no upper bound. Only the leading integer of the value is read, so `25abc` means 25 and `2.5` means 2 (a `0x` prefix is read as hexadecimal). When omitted, or when the value has no leading number, is zero or negative, up to 100 log files are returned. No value is refused. |

**HTTP:** `GET /api/v1/exec/logs/list`
**CLI:** `hoody exec logs list`

---

#### `listExecutions` — List Script Executions

```typescript
client.exec.logs.listExecutions(options: { scriptPath: string; status?: "all" | "failed"; since?: string; until?: string; limit?: number; before?: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scriptPath` | `string` | query | Yes | The script whose calls to list, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |
| `status` | `"all" \| "failed"` | query | No | `failed` lists only calls that failed. Default `all`. |
| `since` | `string` | query | No | ISO 8601 lower bound on `receivedAt`. Optional. |
| `until` | `string` | query | No | ISO 8601 upper bound on `receivedAt`. Optional. |
| `limit` | `number` | query | No | Calls per page, 1 to 100. Default 50. |
| `before` | `string` | query | No | The `next` value of the previous page. |

**HTTP:** `GET /api/v1/exec/logs/executions`

---

#### `search` — Search Logs

```typescript
client.exec.logs.search(data: ExecLogsSearchRequest)
```

**Body:** `{ query: string, regex: string, files: string[], limit: int=1000, caseSensitive: bool=false }`

- `query` — Literal text to search for. Send `query` or `regex`; with neither the call is refused with 400 `query or regex is required`.
- `regex` — Regular expression to search for, at most 64 characters (a longer one is refused with 400 `Invalid regex: pattern exceeds 64 chars`). Shapes that can make matching slow are refused with 400 too: a brace count above 50, nested repetition such as `(a+)+`, quantified alternation such as `(a|b)*`, and more than eight unbounded quantifiers (`*`, `+`, `{n,}`). …

**HTTP:** `POST /api/v1/exec/logs/search`
**CLI:** `hoody exec logs search`

---

#### `stream` — Stream Logs

```typescript
client.exec.logs.stream(options: { file: string; follow?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `file` | `string` | query | Yes | File query parameter |
| `follow` | `boolean` | query | No | Keep the stream open and send new lines as they are written. Default `true`. Over raw HTTP the query value may also be `1` or `0`. |

**Returns:** `Promise<IEventStream>`  |  **HTTP:** `GET /api/v1/exec/logs/stream`
**CLI:** `hoody exec logs stream --file <file>`

---

### `client.exec.openapi` (6) — OpenAPI spec generation and serving

#### `generate` — Generate User Open A P I

```typescript
client.exec.openapi.generate(data?: ExecOpenapiGenerateRequest)
```

**Body:** `{ directory: string|null="scripts", directories: string[]|null, subdomain: string|null, execId: string|null, recursive: bool|null=true, includePatterns: string[]|null, excludePatterns: string[]|null, title: string|null="Generated API", description: string|null="Auto-generated from user scripts", version: string|null="1.0.0", baseUrl: string|null }`

- What to scan and how to label the generated document. Every field is optional: `null` takes the default, as does an empty string for a text field, and a value of the wrong type is refused with a 400.
- `directories` — Alternative to `directory`. Only the first entry is scanned, and only when `directory` is not given; use `/user-openapi/merge` to combine several directories.
- `subdomain` — Subdomain namespace: letters, digits, dots, hyphens and underscores, not made only of dots and not a reserved directory name (`node_modules`, `.git`, `.hoody-cache`, `_sdk`, `_hoody`, in any case); it is lowercased. Surrounding whitespace is ignored. … Any other value is refused with a 400.
- `execId` — Exec ID namespace: 1 to 64 letters or digits, with no dots, hyphens or underscores (a hostname cannot carry them); it is lowercased. Surrounding whitespace is ignored. When omitted, `null` or empty, it is taken from the Host header. Any other value is refused with a 400.

**HTTP:** `POST /api/v1/exec/user-openapi/generate`
**CLI:** `hoody exec openapi generate`

---

#### `get` — Serve Generated Spec

```typescript
client.exec.openapi.get(options?: { dir?: string; directory?: string; format?: "json" | "yaml"; subdomain?: string; execId?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `dir` | `string` | query | No | Directory relative to the selected execution namespace, or already prefixed with that namespace. Default `scripts` selects the namespace root, or the scripts root when no namespace applies. Leading slashes are dropped, so an absolute filesystem path is not supported. |
| `directory` | `string` | query | No | Alias of `dir`. Ignored when `dir` is provided. |
| `format` | `"json" \| "yaml"` | query | No | Output format. `json` (default) or `yaml`. |
| `subdomain` | `string` | query | No | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | query | No | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

**HTTP:** `GET /api/v1/exec/user-openapi/spec`
**CLI:** `hoody exec openapi get`

---

#### `getSchema` — Serve Schema File

```typescript
client.exec.openapi.getSchema(options?: { file?: string; path?: string; subdomain?: string; execId?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `file` | `string` | query | No | Script path relative to the selected execution namespace (the scripts root when none applies), or already prefixed with that namespace, for example `default/1/api/users.ts`. Either `file` or `path` is required. Leading slashes are dropped, so an absolute filesystem path is not supported. |
| `path` | `string` | query | No | Alias of `file`. Either `file` or `path` must be provided. |
| `subdomain` | `string` | query | No | Resolve `file` under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | query | No | Resolve `file` under this execId. Falls back to the Host header when omitted. |

**HTTP:** `GET /api/v1/exec/user-openapi/schema`
**CLI:** `hoody exec openapi schema get`

---

#### `listScripts` — List User Scripts

```typescript
client.exec.openapi.listScripts(options?: { directory?: string; dir?: string; subdomain?: string; execId?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | query | No | Directory relative to the selected execution namespace, or already prefixed with that namespace. Default `scripts` selects the namespace root, or the scripts root when no namespace applies. Leading slashes are dropped, so an absolute filesystem path is not supported. |
| `dir` | `string` | query | No | Alias of `directory`. Ignored when `directory` is provided. |
| `subdomain` | `string` | query | No | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | query | No | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

**HTTP:** `GET /api/v1/exec/user-openapi/list`
**CLI:** `hoody exec openapi scripts list`

---

#### `merge` — Merge Open A P I Specs

```typescript
client.exec.openapi.merge(data?: ExecOpenapiMergeRequest)
```

**Body:** `{ directories: string[]|null, specs: object[]|null, title: string|null="Merged API", description: string|null="Combined OpenAPI specification", version: string|null="1.0.0", subdomain: string|null, execId: string|null }`

- The documents to merge: directories to generate from, documents to include, or both. Every field is optional: `null` takes the default, as does an empty string for a text field, and a value of the wrong type is refused with a 400.
- `specs` — OpenAPI documents to merge, as objects; any other entry is refused with a 400. A document without a `paths` object contributes no paths.
- `subdomain` — Subdomain namespace: letters, digits, dots, hyphens and underscores, not made only of dots and not a reserved directory name (`node_modules`, `.git`, `.hoody-cache`, `_sdk`, `_hoody`, in any case); it is lowercased. Surrounding whitespace is ignored. … Any other value is refused with a 400.
- `execId` — Exec ID namespace: 1 to 64 letters or digits, with no dots, hyphens or underscores (a hostname cannot carry them); it is lowercased. Surrounding whitespace is ignored. When omitted, `null` or empty, it is taken from the Host header. Any other value is refused with a 400.

**HTTP:** `POST /api/v1/exec/user-openapi/merge`
**CLI:** `hoody exec openapi merge`

---

#### `validateSchema` — Validate User Schema

```typescript
client.exec.openapi.validateSchema(data: ExecOpenapiValidateSchemaRequest)
```

**Body:** `{ file: string|null, path: string|null, subdomain: string|null, execId: string|null } (at least one of: file | path required)`

- `file` — Script path relative to the scripts directory, e.g. `default/api/users.ts`. Its `.openapi.json` companion is the file validated. A non-string is refused with a 400.
- `path` — Alias of `file`. Ignored when `file` is provided. A non-string is refused with a 400.
- `subdomain` — Subdomain namespace: letters, digits, dots, hyphens and underscores, not made only of dots and not a reserved directory name (`node_modules`, `.git`, `.hoody-cache`, `_sdk`, `_hoody`, in any case); it is lowercased. Surrounding whitespace is ignored. … Any other value is refused with a 400.
- `execId` — Exec ID namespace: 1 to 64 letters or digits, with no dots, hyphens or underscores (a hostname cannot carry them); it is lowercased. Surrounding whitespace is ignored. When omitted, `null` or empty, it is taken from the Host header. Any other value is refused with a 400.

**HTTP:** `POST /api/v1/exec/user-openapi/validate`
**CLI:** `hoody exec openapi schema validate`

---

### `client.exec.schedules` (4) — Script schedules

#### `list` — List Schedules

```typescript
client.exec.schedules.list()
```

**HTTP:** `GET /api/v1/exec/schedules/list`
**CLI:** `hoody exec schedules list`

---

#### `listHistory` — Schedule History

```typescript
client.exec.schedules.listHistory(options?: { scriptPath?: string; since?: string; limit?: number; includeRotated?: boolean; cursor?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scriptPath` | `string` | query | No | Filter entries to one script. An absolute path must be inside scripts-dir. A relative path is scoped like scripts/read: on a host that names an execId (`-exec-<id>`) or a subdomain, it is read as `<subdomain\|default>/<execId>/<path>` (`<subdomain>/<path>` when there is no execId) unless it already starts with that prefix; a `default.` subdomain counts as none. On any other host it is relative to scripts-dir. A path outside scripts-dir is 400. Optional. |
| `since` | `string` | query | No | ISO 8601 lower bound on `ts`. Optional. |
| `limit` | `number` | query | No | Max entries to return. Default 100, hard max 1000. |
| `includeRotated` | `boolean` | query | No | When true, also scan rotated fires.log.* files (slower). |
| `cursor` | `string` | query | No | Continuation token from a previous truncated response; resumes the backward scan where it stopped. Optional. |

**HTTP:** `GET /api/v1/exec/schedules/history`
**CLI:** `hoody exec schedules history list`

---

#### `reload` — Reload Schedules

```typescript
client.exec.schedules.reload(data?: ExecSchedulesReloadRequest)
```

**Body:** `{ dry_run: bool|null=false }`

- `dry_run` — When true, compute the diff against the filesystem but do not apply. … Must be a JSON boolean or `null`. … Other values, such as the string `"false"` or the number `0`, are refused with 400 `dry_run must be a boolean` and nothing is reloaded.

**HTTP:** `POST /api/v1/exec/schedules/reload`
**CLI:** `hoody exec schedules reload`

---

#### `run` — Trigger Schedule

```typescript
client.exec.schedules.run(data: ExecSchedulesRunRequest)
```

**Body:** `{ scriptPath*: string, force: bool=false }`

- `scriptPath` — Path of a script with a valid @schedule directive. An absolute path must be inside scripts-dir. … A path outside scripts-dir is 400.

**HTTP:** `POST /api/v1/exec/schedules/trigger`
**CLI:** `hoody exec schedules run --script-path <script-path>`

---

### `client.exec.kit` (6) — API

#### `getHealth` — Health Check

```typescript
client.exec.kit.getHealth()
```

**HTTP:** `GET /api/v1/exec/health`
**CLI:** `hoody exec health`

---

#### `getMetrics` — Prometheus Export

```typescript
client.exec.kit.getMetrics()
```

**Returns:** `Promise<ApiResponse<string>>`  |  **HTTP:** `GET /api/v1/exec/monitor/metrics`
**CLI:** `hoody exec metrics`

---

#### `getStats` — Get Stats

```typescript
client.exec.kit.getStats()
```

**HTTP:** `GET /api/v1/exec/monitor/stats`
**CLI:** `hoody exec stats`

---

#### `getStatus` — Get Restart Status

```typescript
client.exec.kit.getStatus()
```

**HTTP:** `GET /api/v1/exec/system/restart-status`
**CLI:** `hoody exec status`

---

#### `listRequests` — Get Active Requests

```typescript
client.exec.kit.listRequests()
```

**HTTP:** `GET /api/v1/exec/monitor/active-requests`
**CLI:** `hoody exec requests list`

---

#### `restart` — Restart Server

```typescript
client.exec.kit.restart(data?: ExecKitRestartRequest)
```

**Body:** `{ graceful: bool=true, drainTimeoutMs: int=5000, reason: string="API restart request" }`

**HTTP:** `POST /api/v1/exec/system/restart`
**CLI:** `hoody exec restart`

---

### `client.exec.modules` (3) — Bundled dependencies

#### `install` — Install Dependencies

```typescript
client.exec.modules.install(data: ExecModulesInstallRequest)
```

**Body:** `{ modules*: string | string[], force: bool=false }`

- `force` — When true, reinstall modules that are already present instead of reporting them as `already-installed`. The copy of `hoody-sdk` in use is never replaced live: `force` only skips that shortcut, and a newer version is staged for the next hoody-exec restart (a version that is not newer is `rejected`).

**HTTP:** `POST /api/v1/exec/dependencies/install`
**CLI:** `hoody exec modules install --modules <modules>`

---

#### `listBundled` — List Bundled Dependencies

```typescript
client.exec.modules.listBundled()
```

**HTTP:** `GET /api/v1/exec/dependencies/bundled`
**CLI:** `hoody exec modules bundled list`

---

#### `test` — Check Dependencies

```typescript
client.exec.modules.test(data: ExecModulesTestRequest)
```

**Body:** `{ code: string|null, modules: string[]|null } (at least one of: code | modules required)`

**HTTP:** `POST /api/v1/exec/dependencies/check`
**CLI:** `hoody exec modules test`

---

### `client.exec.packages.manifest` (3) — The package.json that lists the scripts' runtime dependencies

#### `create` — Init Package Json

```typescript
client.exec.packages.manifest.create(data?: ExecPackagesManifestCreateRequest)
```

**Body:** `{ name: string="hoody-exec-project", version: string="1.0.0", description: string="Hoody Exec project", force: bool=false }`

**HTTP:** `POST /api/v1/exec/package/init`
**CLI:** `hoody exec packages manifest create`

---

#### `get` — Read Package Json

```typescript
client.exec.packages.manifest.get()
```

**HTTP:** `GET /api/v1/exec/package/read`
**CLI:** `hoody exec packages manifest get`

---

#### `update` — Update Package Json

```typescript
client.exec.packages.manifest.update(data?: ExecPackagesManifestUpdateRequest)
```

**Body:** `{ dependencies: { [key: string]: string }|null, scripts: { [key: string]: string }|null, metadata: object|null, remove: string[]|null }`

- `dependencies` — Dependencies to add or change, as package name → version range, e.g. `{"lodash": "^4.17.21"}`. A version that is not a string, or an invalid spec, is refused with a 400.
- `scripts` — package.json `scripts` entries to add or change, as script name → command. A command that is not a string is refused with a 400.

**HTTP:** `POST /api/v1/exec/package/update`
**CLI:** `hoody exec packages manifest update`

---

### `client.exec.magicComments` (7) — API

#### `get` — Read Magic Comments

```typescript
client.exec.magicComments.get(options: { path: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | A script path resolved like scripts/read: under the call's scope first (`execId` / `exec_id` / `subdomain`, else the Host's `[<subdomain>.]…-exec-<execId>`), as `<subdomain\|default>/<execId>/<path>` unless it already starts with that prefix; when no file is there, relative to the scripts directory (so `default/1/x.ts` still works from any Host). An absolute path inside the scripts directory is read relative to it. `resolvedPath` in the answer names the file used. |

**HTTP:** `GET /api/v1/exec/magic-comments/read`
**CLI:** `hoody exec magiccomments get <path>`

---

#### `getSchema` — Get Magic Comments Schema

```typescript
client.exec.magicComments.getSchema()
```

**HTTP:** `GET /api/v1/exec/magic-comments/schema`
**CLI:** `hoody exec magiccomments schema get`

---

#### `parse` — Parse Magic Comments Text

```typescript
client.exec.magicComments.parse(data: ExecMagicCommentsParseRequest)
```

**Body:** `{ text*: string }`

**HTTP:** `POST /api/v1/exec/magic-comments/parse`

---

#### `print` — Print Magic Comments Text

```typescript
client.exec.magicComments.print(data: ExecMagicCommentsPrintRequest)
```

**Body:** `{ text*: string, set*: { enabled: bool|null, mode: "worker" | "serverless"|null, timeout: int|null | string, log-level: "none" | "minimal" | "standard" | "full" | "debug"|null, debug: bool|null, log-request-body: bool|null | "full" | "redacted" | "off", log-response-body: bool|null | "full" | "redacted" | "off", log-max-body-size: int|null | string, log-exclude-headers: string[]|null, log-retention-days: int|null, debug-instrument: bool|null, await-promises: bool|null, concurrent: bool|null | int, cors: string|null, cors-credentials: bool|null, cors-methods: string|null, cors-headers: string|null, cors-max-age: int|null, websocket: bool|null, websocket-pre: bool|null, ai: bool|null, ai-model: string|null, ai-temperature: number|null, ai-max-tokens: int|null, description: string|null, tags: string[]|null, label: string|null, schedule: string|null, schedule-timeout: int|null | string, remote-messages: bool|null, remote-call: bool|null, remote-eval: bool|null } }`

- `set` — … An empty string is refused: send null. A key that is not a directive is 400 `UNKNOWN_DIRECTIVE`; `token`, `tokens`, `ai-key` and `remote-token` are 400 `SECRET_DIRECTIVE` (edit their lines in the code); a value the schema refuses is 400 `INVALID_VALUE`, and so is a CORS sub-directive set next to `cors: "none"`.

**HTTP:** `POST /api/v1/exec/magic-comments/print`

---

#### `update` — Update Magic Comments Handler

```typescript
client.exec.magicComments.update(data: ExecMagicCommentsUpdateRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ path*: string, comments*: { enabled: bool|null, token: string|null | string[], mode: "worker" | "serverless"|null, timeout: int|null | string, log-level: "none" | "minimal" | "standard" | "full" | "debug"|null, debug: bool|null, log-request-body: bool|null | "full" | "redacted" | "off", log-response-body: bool|null | "full" | "redacted" | "off", log-max-body-size: int|null | string, log-exclude-headers: string[]|null, log-retention-days: int|null, debug-instrument: bool|null, await-promises: bool|null, concurrent: bool|null | int, cors: string|null, cors-credentials: bool|null, cors-methods: string|null, cors-headers: string|null, cors-max-age: int|null, websocket: bool|null, websocket-pre: bool|null, ai: bool|null, ai-model: string|null, ai-temperature: number|null, ai-max-tokens: int|null, ai-key: string|null, description: string|null, tags: string[]|null, label: string|null, schedule: string|null, schedule-timeout: int|null | string, remote-messages: bool|null, remote-call: bool|null, remote-eval: bool|null, remote-token: "[REDACTED]"|null | object | object[], tokens: string[]|null }, dry_run: bool|null=false, ifRevision: string, opId: string, execId: string, exec_id: string, subdomain: string }`

- `comments` — Directives to set, keyed by directive name. … Keys that are not directives are ignored. A value that would not read back from the script as sent is refused with a 400, and so is a CORS sub-directive set in the same request as `cors: none`, which the script would ignore.
- `ifRevision` — Update only over this revision (magic-comments/read `revision`). A different current revision is 409 `REVISION_MISMATCH`, nothing written. Optional.
- `opId` — … Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost.
- `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.

**HTTP:** `PUT /api/v1/exec/magic-comments/update`
**CLI:** `hoody exec magiccomments update <path>`

---

#### `updateMany` — Bulk Update Magic Comments

```typescript
client.exec.magicComments.updateMany(data: ExecMagicCommentsUpdateManyRequest)
```

**Body:** `{ directory: string|null, execId: string|null, comments*: { enabled: bool|null, token: string|null | string[], mode: "worker" | "serverless"|null, timeout: int|null | string, log-level: "none" | "minimal" | "standard" | "full" | "debug"|null, debug: bool|null, log-request-body: bool|null | "full" | "redacted" | "off", log-response-body: bool|null | "full" | "redacted" | "off", log-max-body-size: int|null | string, log-exclude-headers: string[]|null, log-retention-days: int|null, debug-instrument: bool|null, await-promises: bool|null, concurrent: bool|null | int, cors: string|null, cors-credentials: bool|null, cors-methods: string|null, cors-headers: string|null, cors-max-age: int|null, websocket: bool|null, websocket-pre: bool|null, ai: bool|null, ai-model: string|null, ai-temperature: number|null, ai-max-tokens: int|null, ai-key: string|null, description: string|null, tags: string[]|null, label: string|null, schedule: string|null, schedule-timeout: int|null | string, remote-messages: bool|null, remote-call: bool|null, remote-eval: bool|null, remote-token: "[REDACTED]"|null | object | object[], tokens: string[]|null }, extension: string|null=".ts", recursive: bool|null=true, dry_run: bool|null=false }`

- `comments` — Directives to set, keyed by directive name. … Keys that are not directives are ignored. A value that would not read back from the script as sent is refused with a 400, and so is a CORS sub-directive set in the same request as `cors: none`, which the script would ignore.

**HTTP:** `POST /api/v1/exec/magic-comments/bulk-update`
**CLI:** `hoody exec magiccomments batch update`

---

#### `validate` — Validate Magic Comments

```typescript
client.exec.magicComments.validate(data: ExecMagicCommentsValidateRequest)
```

**Body:** `{ code*: string }`

**HTTP:** `POST /api/v1/exec/validate/magic-comments`
**CLI:** `hoody exec magiccomments validate --code <code>`

---

### `client.exec.packages` (3) — Runtime dependency management

#### `compare` — Compare Packages

```typescript
client.exec.packages.compare(data?: ExecPackagesCompareRequest)
```

**HTTP:** `POST /api/v1/exec/package/compare`
**CLI:** `hoody exec packages compare`

---

#### `install` — Install Packages

```typescript
client.exec.packages.install(data?: ExecPackagesInstallRequest)
```

**Body:** `{ packages: string[], dev: bool=false, save: bool=true, force: bool=false }`

**HTTP:** `POST /api/v1/exec/package/install`
**CLI:** `hoody exec packages install`

---

#### `pin` — Pin Versions

```typescript
client.exec.packages.pin(data?: ExecPackagesPinRequest)
```

**Body:** `{ packages: string[], module: string }`

**HTTP:** `POST /api/v1/exec/package/pin`
**CLI:** `hoody exec packages pin`

---

### `client.exec.cache` (1) — Exec discovery cache

#### `clear` — Clear Cache

```typescript
client.exec.cache.clear(data: ExecCacheClearRequest)
```

**Body:** `{ hostname: string, execId: string, scriptPath: string, clearVm: bool=true, clearState: bool=false, clearAll: bool=false }`

- `execId` — Exec ID of one deployment: the `<id>` of the host's `-exec-<id>` segment, for example `1`. … Any other value must be lowercase letters and digits only, and cannot be sent with a `hostname` written as `<hostname>/<execId>`; otherwise the request is refused with 400.
- `scriptPath` — DEPRECATED: scriptPath-based clear returns HTTP 400. VM cache is keyed by hostname. Use hostname or clearAll=true instead.

**HTTP:** `POST /api/v1/exec/cache/clear`
**CLI:** `hoody exec cache clear`

---

### `client.exec.env` (2) — Env

#### `listKeys` — List Env Keys

```typescript
client.exec.env.listKeys(options: { scriptPath: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scriptPath` | `string` | query | Yes | The script whose env chain to list, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |

**HTTP:** `GET /api/v1/exec/env/keys`

---

#### `updateKeys` — Update Env Keys

```typescript
client.exec.env.updateKeys(data: ExecEnvUpdateKeysRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ scriptPath*: string, scope*: "script" | "folder" | "root", rel: string, set: { [key: string]: string }, unset: string[], ifRevision*: string|null, opId: string }`

- `ifRevision` — Required: the file's revision from env/keys, or null when it does not exist yet. A different current revision is 409 `REVISION_MISMATCH`, nothing changed.
- `opId` — … Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost.

**HTTP:** `POST /api/v1/exec/env/update`

---

### `client.exec` (1) — Script execution and templates

#### `run` — Run a user script with any method, a query, a body and headers, through the SDK transport (kitAuth, retries, middleware, ApiError).

```typescript
client.exec.run<TResponse = unknown>(path: string, options?: ExecScriptCallOptions)
```

**Returns:** `Promise<ApiResponse<TResponse>>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `listCallableScripts` — List the user scripts the connected exec computer can run by name.

```typescript
client.exec.listCallableScripts(options?: ListCallableScriptsOptions & { forceRefresh?: boolean; services?: ExecDynamicServices })
```

**Returns:** `Promise<CallableScript[]>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `call` — Call a user script by name, using the discovered HTTP method.

```typescript
client.exec.call<TResponse = unknown>(scriptNameOrPath: string, params?: Record<string, unknown>, options?: CallScriptOptions & { services?: ExecDynamicServices })
```

**Returns:** `Promise<ApiResponse<TResponse>>`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

#### `remote` — A handle on a live script's remote channel; nothing is sent until an op is called.

```typescript
client.exec.remote(urlOrPath: string, options?: ExecRemoteOptions)
```

**Returns:** `ExecRemoteConnection`  |  **SDK helper:** added by the SDK library, not generated from an HTTP operation.

---

### `client.exec.namespaces` (1) — Script namespaces on disk (exec-IDs and imported SDKs)

#### `list` — List All Exec Ids

```typescript
client.exec.namespaces.list()
```

**HTTP:** `GET /api/v1/exec/list`
**CLI:** `hoody exec namespaces list`

---

### `client.exec.ops` (1) — Ops

#### `settle` — Settle Op

```typescript
client.exec.ops.settle(data: ExecOpsSettleRequest)
```

**Body:** `{ opId*: string, sentAfter*: number }`

**HTTP:** `POST /api/v1/exec/ops/settle`

---

### `client.exec.routes` (3) — Route resolution, discovery, and testing

#### `list` — Discover Routes

```typescript
client.exec.routes.list(data?: ExecRoutesListRequest)
```

**Body:** `{ baseDir: string="", includeMetadata: bool=false, hostname: string, execId: string }`

**HTTP:** `POST /api/v1/exec/route/discover`
**CLI:** `hoody exec routes list`

---

#### `resolve` — Resolve Route

```typescript
client.exec.routes.resolve(data: ExecRoutesResolveRequest)
```

**Body:** `{ path*: string, hostname: string|null, execId: string|null, omit: string }`

- `path` — URL path to resolve, e.g. `/api/users/42`. A non-string is refused with a 400.
- `hostname` — Hostname namespace: letters, digits, dots, hyphens and underscores, not `.` or `..` and not a reserved directory name (`node_modules`, `.git`, `.hoody-cache`, `_sdk`, `_hoody`). Surrounding whitespace is ignored. … Any other value is refused with a 400.
- `execId` — Exec ID namespace: 1 to 64 letters or digits, with no dots, hyphens or underscores (a hostname cannot carry them). Surrounding whitespace is ignored. When omitted, `null` or empty, it is taken from the Host header. Any other value is refused with a 400.

**HTTP:** `POST /api/v1/exec/route/resolve`
**CLI:** `hoody exec routes resolve --path <path>`

---

#### `test` — Test Route

```typescript
client.exec.routes.test(data: ExecRoutesTestRequest)
```

**Body:** `{ paths*: string[], hostname: string|null, execId: string|null }`

- `paths` — URL paths to resolve, e.g. `["/api/users", "/api/users/42"]`. A non-string entry is refused with a 400.
- `hostname` — Hostname namespace: letters, digits, dots, hyphens and underscores, not `.` or `..` and not a reserved directory name (`node_modules`, `.git`, `.hoody-cache`, `_sdk`, `_hoody`). Surrounding whitespace is ignored. … Any other value is refused with a 400.
- `execId` — Exec ID namespace: 1 to 64 letters or digits, with no dots, hyphens or underscores (a hostname cannot carry them). Surrounding whitespace is ignored. When omitted, `null` or empty, it is taken from the Host header. Any other value is refused with a 400.

**HTTP:** `POST /api/v1/exec/route/test`
**CLI:** `hoody exec routes test --paths <paths>`

---

### `client.exec.sdkTypes` (1) — Sdk-types

#### `list` — Get Sdk Types

```typescript
client.exec.sdkTypes.list(options?: { kit?: string; q?: string; limit?: number; raw?: "true" | "false" | "1" | "0" })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `kit` | `string` | query | No | Kit to list: a client property (`files`, `api`, `exec`, `sqlite`, …), or `client` for the client's own methods (`withComputer`, `login`, …). Any letter case. An unknown kit is a 404 with `details.kits`. |
| `q` | `string` | query | No | Words, all of which must appear in the method's path, name or summary (any letter case). |
| `limit` | `number` | query | No | Most methods to return, 1 to 100 (default 20). `total` counts every match. |
| `raw` | `"true" \| "false" \| "1" \| "0"` | query | No | When true, also return the `.d.ts` text of the files declaring the returned methods (`dts`, at most 256 KB). Needs `kit` or `q`. |

**HTTP:** `GET /api/v1/exec/sdk-types`
**CLI:** `hoody exec sdktypes list`

---

### `client.exec.sdks` (4) — Imported SDK management

#### `delete` — Delete S D K

```typescript
client.exec.sdks.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The SDK ID: the exec ID it was imported under, for example `1`. Its directory is `default/<id>`. |

**HTTP:** `DELETE /api/v1/exec/sdk/{id}`
**CLI:** `hoody exec sdks delete <id>`

---

#### `get` — Get S D K

```typescript
client.exec.sdks.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | The SDK ID: the exec ID it was imported under, for example `1`. Its directory is `default/<id>`. |

**HTTP:** `GET /api/v1/exec/sdk/{id}`
**CLI:** `hoody exec sdks get <id>`

---

#### `import` — Import S D K

```typescript
client.exec.sdks.import(data: ExecSdksImportRequest)
```

**Body:** `{ execId: string|null, source_url*: string, source_auth: { type*: "bearer" | "basic", token: string, username: string, password: string } (at least one of: token | username+password required)|null, middleware: { pre: string|null, post: string|null }|null, magic_comments: { enabled: bool|null, token: string|null | string[], mode: "worker" | "serverless"|null, timeout: int|null | string, log-level: "none" | "minimal" | "standard" | "full" | "debug"|null, concurrent: bool|null | int, cors: string|null, websocket: bool|null }|null, force: bool|null=false }`

- `source_url` — HTTPS URL of the OpenAPI document to import. It must name a domain (not an IP address), use port 443, and end in `.json`, `.yaml`, `/documentation/json` or `/documentation/yaml`.
- `source_auth` — Credentials sent when fetching `source_url`: either `{"type": "bearer", "token": "…"}` or `{"type": "basic", "username": "…", "password": "…"}`. Credentials that could not be sent as given are refused with a 400, never dropped. Other members are ignored.
- `magic_comments` — Magic-comment directives written into every generated proxy file, keyed by directive name. Only the members listed here are accepted; any other key is refused with a 400, and so is a value that would not read back from the generated file as sent. …
- `force` — Overwrite conflicting files (untracked files, and files changed since the last import) instead of answering 409 with a dry-run report.

**HTTP:** `POST /api/v1/exec/sdk/import`
**CLI:** `hoody exec sdks import --source-url <source-url>`

---

#### `list` — List S D Ks

```typescript
client.exec.sdks.list()
```

**HTTP:** `GET /api/v1/exec/sdk/list`
**CLI:** `hoody exec sdks list`

---

### `client.exec.store` (3) — Shared state store

#### `clear` — Clear Shared State

```typescript
client.exec.store.clear(data: ExecStoreClearRequest)
```

**Body:** `{ hostname: string, execId: string, path: string, clearAll: bool=false }`

- `execId` — Exec ID of one deployment: the `<id>` of the host's `-exec-<id>` segment, for example `1`. … Any other value must be lowercase letters and digits only, and cannot be sent with a `hostname` written as `<hostname>/<execId>`; otherwise the request is refused with 400.

**HTTP:** `POST /api/v1/exec/shared-state/clear`
**CLI:** `hoody exec store clear`

---

#### `get` — Get Shared State

```typescript
client.exec.store.get(data: ExecStoreGetRequest)
```

**Body:** `{ hostname*: string, execId: string, path: string }`

- `execId` — Exec ID of one deployment: the `<id>` of the host's `-exec-<id>` segment, for example `1`. … Any other value must be lowercase letters and digits only, and cannot be sent with a `hostname` written as `<hostname>/<execId>`; otherwise the request is refused with 400.

**HTTP:** `POST /api/v1/exec/shared-state/get`
**CLI:** `hoody exec store get --hostname <hostname>`

---

#### `set` — Set Shared State

```typescript
client.exec.store.set(data: ExecStoreSetRequest)
```

**Body:** `{ hostname*: string, execId: string, path: string, value*: any, merge: bool=false }`

- `execId` — Exec ID of one deployment: the `<id>` of the host's `-exec-<id>` segment, for example `1`. … Any other value must be lowercase letters and digits only, and cannot be sent with a `hostname` written as `<hostname>/<execId>`; otherwise the request is refused with 400.

**HTTP:** `POST /api/v1/exec/shared-state/set`
**CLI:** `hoody exec store set --hostname <hostname> --value <value>`

---

### `client.exec.templates` (6) — Script templates

#### `create` — Create Custom Template

```typescript
client.exec.templates.create(data: ExecTemplatesCreateRequest)
```

**Body:** `{ name*: string, code*: string, metadata: { category: string="custom", tags: string[], description: string="Custom template", params: string[], version: string="1.0.0", author: string="User" }|null }`

- `name` — Template name: letters, digits, dots, hyphens and underscores, at most 64 characters, starting with a letter or digit and never containing `..`. A name already taken by a built-in template is refused with a 409.
- `code` — Template source. It is stored after a generated metadata header. A non-string is refused with a 400.
- `metadata` — Template metadata. An omitted or null `metadata` takes the defaults, as does an omitted member; a member of the wrong type, or a metadata value that is neither an object nor null, is refused with a 400.

**HTTP:** `POST /api/v1/exec/templates/create-custom`
**CLI:** `hoody exec templates create --name <name> --code <code>`

---

#### `delete` — Delete Custom Template

```typescript
client.exec.templates.delete(name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Name parameter |

**HTTP:** `DELETE /api/v1/exec/templates/delete-custom/{name}`
**CLI:** `hoody exec templates delete <name>`

---

#### `generate` — Generate From Template

```typescript
client.exec.templates.generate(data: ExecTemplatesGenerateRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ name*: string, variables: object, outputPath: string, saveFile: bool=false, execId: string, exec_id: string, subdomain: string }`

- `outputPath` — Where to save the script when `saveFile` is true, as scripts/write takes a path: under the call's scope (`execId` / `exec_id` / `subdomain`, else the Host's `[<subdomain>.]…-exec-<execId>`), as `<subdomain|default>/<execId>/<outputPath>` unless it already starts with that prefix; relative to the scripts directory only when the call has no scope. …
- `saveFile` — When true, write the generated script to `outputPath` (required then). When false (the default), only return the code.
- `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided. Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.
- `exec_id` — Alias for execId (snake_case). Lowercase alphanumeric, no hyphens: the `-exec-` part of a hostname cannot carry one, so a hyphenated execId names a tree no request could route to and is rejected with 400.

**HTTP:** `POST /api/v1/exec/templates/generate`
**CLI:** `hoody exec templates generate <name>`

---

#### `list` — List Templates

```typescript
client.exec.templates.list(options?: { category?: string; includeBuiltin?: boolean; includeCustom?: boolean })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter templates to a single metadata category (e.g. `api`, `utility`). Omit to list all categories. |
| `includeBuiltin` | `boolean` | query | No | Include built-in templates in the result set. Default `true`. Over raw HTTP the query value may also be `1` or `0`. |
| `includeCustom` | `boolean` | query | No | Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`. |

**HTTP:** `GET /api/v1/exec/templates/list`
**CLI:** `hoody exec templates list`

---

#### `preview` — Preview Template

```typescript
client.exec.templates.preview(options: { name: string; variables?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | query | Yes | Name query parameter |
| `variables` | `string` | query | No | Variables query parameter |

**HTTP:** `GET /api/v1/exec/templates/preview`
**CLI:** `hoody exec templates preview <name>`

---

#### `update` — Update Custom Template

```typescript
client.exec.templates.update(name: string, data?: ExecTemplatesUpdateRequest)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Name parameter |

**Body:** `{ code: string, metadata: object }`

**HTTP:** `PUT /api/v1/exec/templates/update-custom/{name}`
**CLI:** `hoody exec templates update <name>`

---

### `client.exec.tests` (3) — Tests

#### `delete` — Delete Script Tests

```typescript
client.exec.tests.delete(options: { scriptPath: string; ifRevision: string; opId?: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scriptPath` | `string` | query | Yes | The script whose saved cases to remove, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |
| `ifRevision` | `string` | query | Yes | The saved set's revision from tests/list. A different current revision is 409 `REVISION_MISMATCH`, nothing removed. |
| `opId` | `string` | query | No | Journals the change under this id (16-64 letters, digits, `_` or `-`). Resending the identical request with the same id after it finished answers the stored outcome without changing anything again. Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost. |

**HTTP:** `DELETE /api/v1/exec/tests/delete`

---

#### `list` — List Script Tests

```typescript
client.exec.tests.list(options: { scriptPath: string; execId?: string; subdomain?: string })
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scriptPath` | `string` | query | Yes | The script whose saved cases to list, scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix. |

**HTTP:** `GET /api/v1/exec/tests/list`

---

#### `set` — Put Script Tests

```typescript
client.exec.tests.set(data: ExecTestsSetRequest, options?: { execId?: string; subdomain?: string })
```

**Body:** `{ scriptPath*: string, cases*: object[], ifRevision*: string|null, opId: string }`

- `scriptPath` — The script the cases belong to (it must exist), scoped like scripts/read: under the call's execId / subdomain unless it already starts with that prefix.
- `ifRevision` — Required: the saved set's revision from tests/list, or null when none is saved. A different current revision is 409 `REVISION_MISMATCH`, nothing changed.
- `opId` — … Reusing the id for a different request is 409 `OP_ID_REUSED`; an operation not yet finished answers 409 `OP_IN_PROGRESS` or `OP_OUTCOME_UNKNOWN`, and one ops/settle settled as never received answers 409 `OP_FENCED`. ops/settle tells what became of it when the answer was lost.

**HTTP:** `PUT /api/v1/exec/tests/put`

