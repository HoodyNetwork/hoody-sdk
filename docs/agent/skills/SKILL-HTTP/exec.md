> _**HTTP skill · `exec` namespace** · ~9,654 tokens · hoody-sdk v1.0.0-beta.12_

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To make a script **public**: create a `POST /api/v1/proxy/aliases` — get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` leak in the URL. Layer Password / Token / JWT / IP gates via `proxyPermissionsContainer.*` exactly like any other kit URL.

**Trust model — read carefully.** Scripts run inside the container with full container privileges. They are NOT a sandbox for untrusted user code. Anyone who can invoke a script can do everything the script can do (read files, hit other kits, spawn processes). Use them for *your* APIs / cron logic / webhooks / ETL — don't expose them as an arbitrary code-execution surface to anonymous internet users without thinking through the gate stack first.

## When to use

- "Write me an API endpoint that does X" — default to a `hoody-exec` script before reaching for a Node app + framework.
- **"Build a workflow"** — multi-step pipelines (call agent A → validate with agent B → trigger action C, fan-out / fan-in, retry logic, conditional branches). One script = one orchestrator; each step is a function call inside the same Bun process, so no inter-service plumbing. State between requests via `bun:sqlite` (`Database`), the `sqlite` kit, the `files` kit, or in-process module-scope.
- Webhooks (GitHub / Stripe / your CI), ETL pipelines, batch transformers, AI agent tools.
- Wrap a bash one-liner or Python helper as an HTTP API with zero scaffolding.
- Schematize inputs / outputs via magic-comment annotations, auto-publish OpenAPI.
- Pin npm deps per script, stream logs/metrics, drop a `package.json` like any normal JS project.

## When NOT to use

- **Untrusted-input code execution** — it's not sandboxed. Use a fresh container (or a stricter runtime) per untrusted caller.
- Long-lived processes / supervisors → `daemon` (exec is request/response).
- Schedules outliving the kit → `cron` (`exec.schedules.*` is in-process and dies with the kit).
- File I/O outside the scripts dir → `files`. Interactive shells → `terminal`. Container lifecycle → `daemon`. Headless web → `browser`.

## Prerequisites

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `POST /api/v1/exec/scripts/write`.
- **`require('hoody-sdk')` works with no install step** — the runtime auto-installs any `require()`d npm package on first execution (it is not pre-injected or bundled). Import from `'hoody-sdk'` (NOT `'hoody-sdk'`). The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the Hoody Proxy — no localhost bypass — so all the usual capability gates / request hooks / proxy logs apply (see § No local bypass in `SKILL-HTTP.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out: `Bun.$\`hoody projects list\`` from the same script works end-to-end.

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
4. `POST /api/v1/exec/cache/clear` — drop compiled cache; ephemeral runtime, no state across recompiles.

### 3. Debug + OpenAPI

1. `GET /api/v1/exec/logs/list` / `POST /api/v1/exec/logs/search` / `POST /api/v1/exec/logs/read` (streamed `--lines`/`--tail`).
2. `GET /api/v1/exec/monitor/active-requests` / `GET /api/v1/exec/monitor/stats` / `POST /api/v1/exec/monitor/script-performance`.
3. `GET /api/v1/exec/user-openapi/list` → `POST /api/v1/exec/user-openapi/generate` → `POST /api/v1/exec/user-openapi/merge` → `GET /api/v1/exec/user-openapi/spec` → `POST /api/v1/exec/user-openapi/validate`.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. The stored file is ALWAYS kept verbatim; the pattern-normaliser rewrites the code at load time on every request, independent of `validate`.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `DELETE /api/v1/exec/scripts/delete` needs literal `confirm=true`.
- `POST /api/v1/exec/scripts/write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `GET /api/v1/containers/{id}/proxy/services` returning `[]` is normal.
- `POST /api/v1/exec/scripts/write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every script gets pre-injected globals: `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`, default model **`hoody-ai/hoody-free`**). **No `require()`, no base URL, and no API key** — the key auto-defaults to `container-<hash>` and is a usage-tracking tag, NOT auth, so you specify nothing. **The default model is the free tier: it costs nothing and needs no wallet credit, so a script with no `// @ai-model` line runs on a brand-new account.** Overriding it with a catalog model (`GET https://api.hoody.com/api/v1/ai/models`) bills the wallet and is **refused outright** while `ai_limit` is `0.00` — check `GET /api/v1/wallet/balances/ai` before you name one. Override per-script with magic comments (`// @ai-model minimax/minimax-m3` — paid, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — recheck `safePath`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`POST /api/v1/exec/system/restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Every step in every example was live-tested against a real `exec-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `GET /api/v1/containers/{id}` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST {KIT}/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when syntax + TS-transpile + dependency-check + magic-comment parse all pass.

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
**Step 3 — read it back.** `GET /api/v1/exec/scripts/read` returns the literal content + parsed `magicComments` + metadata.

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
  "content": "const crypto = require('crypto');\nconst SECRET = process.env.WEBHOOK_SECRET || 'shhh-test';\nmodule.exports = async (req, res) => {\n  const sig = req.headers['x-hub-signature-256'] || '';\n  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});\n  const expect = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');\n  let ok = false;\n  try { ok = sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch {}\n  if (!ok) return res.status(401).json({ error: 'bad sig' });\n  res.json({ accepted: true, payload: req.body });\n};\n"
}
JSON
```
**Step 2 — fire a signed request.** The Bun `req.body` is an *object* if Content-Type was JSON, so re-serialise before HMAC'ing on both sides for byte-stable signing.

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

**Goal:** add `lodash` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```bash
curl -sX POST "$KIT/api/v1/exec/dependencies/check" \
  -H 'Content-Type: application/json' \
  -d '{"code":"const _ = require(\"lodash\");"}'
# → {"missing":["lodash"], ...}
```
**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"lodash@4.17.21"`).

```bash
curl -sX POST "$KIT/api/v1/exec/dependencies/install" \
  -H 'Content-Type: application/json' \
  -d '{"modules":["lodash"]}'
```
**Step 3 — pin to exact versions** (drops the leading `^`/`~`).

```bash
curl -sX POST "$KIT/api/v1/exec/package/pin" \
  -H 'Content-Type: application/json' \
  -d '{"packages":["lodash"]}'
# → {"pinned":["lodash: ^4.17.21 → 4.17.21"], ...}
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
If `valid:true`, ship it via `POST /api/v1/exec/scripts/write` (default `validate:true` will re-run the same checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies,magicComments}` slots tell you exactly which checker rejected it.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry (and inferred request/response shapes from any handler-attached schema) in a single OpenAPI 3.0 document the proxy can serve.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```bash
curl -sf "$KIT/api/v1/exec/user-openapi/list" | jq '.data.scripts[] | {path, routePath, hasSchema}'
```
**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```bash
curl -sf "$KIT/api/v1/exec/user-openapi/spec?format=json" > /tmp/user-scripts.openapi.json
```
**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `POST /api/v1/exec/user-openapi/merge`. `POST /api/v1/exec/user-openapi/generate` rebuilds the on-disk spec from current scripts; `POST /api/v1/exec/user-openapi/validate` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `GET /api/v1/exec/logs/list` returns kit-wide log files; `POST /api/v1/exec/logs/read` slices a specific one.

```bash
# Discover available log files
curl -sf "$KIT/api/v1/exec/logs/list" | jq '.logs[] | {name, size, modified}'   # entries key on `name`, not `file`

# Read last 200 lines of a specific file
curl -sX POST "$KIT/api/v1/exec/logs/read" \
  -H 'Content-Type: application/json' \
  -d '{"file":"<name-from-logs/list>","lines":200,"tail":true}'

# Live-stream (SSE)
curl -N "$KIT/api/v1/exec/logs/stream?file=<name-from-logs/list>&follow=true"
```
Access logging is ON by default (`@log-level` defaults to `standard`); the magic comments opt *out* — `// @log-level none` disables it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `GET /api/v1/exec/monitor/stats` is a single snapshot; `GET /api/v1/exec/monitor/active-requests` lists in-flight HTTP/WS; `POST /api/v1/exec/monitor/script-performance` aggregates by script.

```bash
curl -sf "$KIT/api/v1/exec/monitor/stats" \
  | jq '{uptime, requests, websocket, cron, cache}'

curl -sf "$KIT/api/v1/exec/monitor/active-requests" | jq .

curl -sX POST "$KIT/api/v1/exec/monitor/script-performance" \
  -H 'Content-Type: application/json' -d '{}' | jq .
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

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log; `res.json` is what an HTTP `POST /api/v1/exec/schedules/trigger` call returns.

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
**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, and the absolute on-disk `scriptPath` you'll need to trigger it.

```bash
curl -sf "$KIT/api/v1/exec/schedules/list" \
  | jq '.schedules[] | {scriptRel, expression, registeredAt}'
```
**Step 3 — fire it on demand.** `scriptPath` accepts either the absolute path returned in step 2 OR a path relative to the kit's scripts dir (the handler resolves relative paths against `scriptDir`). `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only.

```bash
curl -sX POST "$KIT/api/v1/exec/schedules/trigger" \
  -H 'Content-Type: application/json' \
  -d '{"scriptPath":"/hoody/storage/hoody-exec/scripts/default/1/tick.js","force":true}'
# → {"triggered":true,"runId":"...","status":"ok","durationMs":14}

curl -sf "$KIT/api/v1/exec/schedules/history?limit=5" | jq '.entries[]'
```
**Stop the schedule** by deleting the script (`scripts.delete?path=tick.js&confirm=true`) or by editing the file to remove the `// @schedule` directive and calling `POST /api/v1/exec/schedules/reload`.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. The runtime pre-injects `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key auto-defaults to `container-<hash>` (a usage-tracking tag, not auth). Default model is **`hoody-ai/hoody-free`**, the free tier — no wallet credit needed, so the script below works on a brand-new account with `ai_limit: "0.00"`. Override per-script with `// @ai-model <provider/model>` **only when you need a paid catalog model and have confirmed the wallet has AI credit**, and set a system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```bash
curl -sX POST "$KIT/api/v1/exec/scripts/write" -H 'Content-Type: application/json' --data-binary @- <<'JSON'
{
  "path": "summarize.js",
  "content": "// @description One-line summary via built-in Hoody AI (no key/setup, free model by default)\nmodule.exports = async (req, res) => {\n  const text = metadata.query.q || 'Say hello in one sentence.';\n  const result = await ai.generate('Summarize in one line: ' + text);\n  res.json({ summary: result.text });\n};\n"
}
JSON
```
**Step 2 — invoke it** (bare path on the exec kit URL). No key anywhere in the call:

```
https://{P}-{C}-exec-1.{N}.containers.hoody.com/summarize?q=Hoody+is+a+remote-first+computing+platform
# → {"summary":"..."}
```

For structured output use `ai.object({ schema, prompt })` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`.

## Reference

### `cache` (1) — Cache

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/cache/clear` | Clear Cache | `body` |

**Body shapes:**

- `POST /api/v1/exec/cache/clear` body — `{ hostname: string, scriptPath: string, clearVm: bool=true, clearState: bool=false, clearAll: bool=false }`
  - `scriptPath` — DEPRECATED: scriptPath-based clear returns HTTP 400. VM cache is keyed by hostname. Use hostname or clearAll=true instead.
  - `clearVm` — Clear Vm
  - `clearState` — Clear State
  - `clearAll` — Clear All

### `dependencies` (3) — Dependencies

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/dependencies/check` | Check Dependencies | `body` |
| `POST /api/v1/exec/dependencies/install` | Install Dependencies | `body*` |
| `GET /api/v1/exec/dependencies/bundled` | List Bundled Dependencies |  |

**Body shapes:**

- `POST /api/v1/exec/dependencies/check` body — `{ code: string, modules: string }`
- `POST /api/v1/exec/dependencies/install` body — `{ modules*: string | string[], force: bool=false }`
  - `modules` — One npm module spec (e.g. `"lodash"`, `"axios@1.2.3"`) or an array of specs. Array form installs every module in sequence.
  - `force` — When true, reinstall modules that are already present instead of reporting them as `already-installed`.

### `execution` (1) — Script Execution

| Method | Summary | Params |
|--------|---------|--------|
| `GET /{path}` | Execute Script (GET) |  |

**Param notes:**

- `path` — Script path (supports Next.js-style routing)

### `health` (1) — Health

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/health` | Health Check |  |

### `ids` (1) — List

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/list` | List All Exec Ids |  |

### `logs` (5) — Logs

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/logs/clear` | Clear Logs | `?file` `?type` `?olderThanDays` `?confirm` |
| `GET /api/v1/exec/logs/list` | List Logs | `?type` `?limit` |
| `POST /api/v1/exec/logs/read` | Read Log | `body` |
| `POST /api/v1/exec/logs/search` | Search Logs | `body` |
| `GET /api/v1/exec/logs/stream` | Stream Logs | `?file*` `?follow` |

**Param notes:**

- `file` — File query parameter
- `type` — Type query parameter
- `olderThanDays` — OlderThanDays query parameter
- `confirm` — Confirm query parameter
- `limit` — Limit query parameter
- `follow` — Follow query parameter

**Body shapes:**

- `POST /api/v1/exec/logs/read` body — `{ file: string, executionId: string, lines: int=100, tail: bool=true, search: string }`
  - `executionId` — Execution Id
- `POST /api/v1/exec/logs/search` body — `{ query: string, regex: string, files: any[], limit: int=1000, caseSensitive: bool=false }`
  - `caseSensitive` — Case Sensitive

### `magic` (4) — Magic-comments

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/magic-comments/bulk-update` | Bulk Update Magic Comments | `body` |
| `GET /api/v1/exec/magic-comments/schema` | Get Magic Comments Schema |  |
| `GET /api/v1/exec/magic-comments/read` | Read Magic Comments | `?path*` |
| `PUT /api/v1/exec/magic-comments/update` | Update Magic Comments Handler | `body*` |

**Param notes:**

- `path` — Path query parameter

**Body shapes:**

- `POST /api/v1/exec/magic-comments/bulk-update` body — `{ directory: string, execId: string, comments: string, extension: string=".ts", recursive: bool=true, dry_run: bool=false }`
  - `execId` — Exec Id
  - `dry_run` — Dry_run
- `PUT /api/v1/exec/magic-comments/update` body — `{ path*: string, comments: string, dry_run: bool=false }`

### `monitor` (5) — Monitor

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/monitor/active-requests` | Get Active Requests |  |
| `POST /api/v1/exec/monitor/script-performance` | Get Script Performance | `body` |
| `GET /api/v1/exec/monitor/stats` | Get Stats |  |
| `GET /api/v1/exec/monitor/scripts` | List Monitor Scripts | `?limit` `?sort` |
| `GET /api/v1/exec/monitor/metrics` | Prometheus Export |  |

**Param notes:**

- `limit` — Max number of scripts to return. Clamped to [1, 500]. Default 100.
- `sort` — Sort key. `lastActivity` (default) sorts by most recent activity; other keys sort descending by the matching metric.

**Body shapes:**

- `POST /api/v1/exec/monitor/script-performance` body — `object` — Request payload

### `openapi` (6) — User-openapi

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/user-openapi/generate` | Generate User Open A P I | `body*` |
| `GET /api/v1/exec/user-openapi/list` | List User Scripts | `?directory` `?dir` `?subdomain` `?execId` |
| `POST /api/v1/exec/user-openapi/merge` | Merge Open A P I Specs | `body*` |
| `GET /api/v1/exec/user-openapi/spec` | Serve Generated Spec | `?dir` `?directory` `?format` `?subdomain` `?execId` |
| `GET /api/v1/exec/user-openapi/schema` | Serve Schema File | `?file` `?path` |
| `POST /api/v1/exec/user-openapi/validate` | Validate User Schema | `body*` |

**Param notes:**

- `directory` — Script directory to list (absolute or relative to scripts-dir). Default: `scripts`.
- `dir` — Alias of `directory`. Ignored when `directory` is provided.
- `subdomain` — Limit scan to scripts under this subdomain. Falls back to the Host header when omitted.
- `execId` — Limit scan to scripts under this execId. Falls back to the Host header when omitted.
- `dir` — Script directory to scan (absolute or relative to scripts-dir). Default: `scripts`.
- `directory` — Alias of `dir`. Ignored when `dir` is provided.
- `format` — Output format. `json` (default) or `yaml`.
- `file` — Absolute or scripts-dir-relative path to the target script (e.g. `default/api/users/[id].ts`). Either `file` or `path` must be provided.
- `path` — Alias of `file`. Either `file` or `path` must be provided.

**Body shapes:**

- `POST /api/v1/exec/user-openapi/generate` body — `object` — Request payload
- `POST /api/v1/exec/user-openapi/merge` body — `object` — Request payload
- `POST /api/v1/exec/user-openapi/validate` body — `object` — Request payload

### `package` (6) — Package

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/package/compare` | Compare Packages | `body*` |
| `POST /api/v1/exec/package/init` | Init Package Json | `body` |
| `POST /api/v1/exec/package/install` | Install Packages | `body` |
| `POST /api/v1/exec/package/pin` | Pin Versions | `body` |
| `GET /api/v1/exec/package/read` | Read Package Json |  |
| `POST /api/v1/exec/package/update` | Update Package Json | `body` |

**Body shapes:**

- `POST /api/v1/exec/package/compare` body — `object` — Request payload
- `POST /api/v1/exec/package/init` body — `{ name: string="hoody-exec-project", version: string="1.0.0", description: string="Hoody Exec project", force: bool=false }`
- `POST /api/v1/exec/package/install` body — `{ packages: any[], dev: bool=false, save: bool=true, force: bool=false }`
- `POST /api/v1/exec/package/pin` body — `{ packages: any[] }`
- `POST /api/v1/exec/package/update` body — `{ dependencies: string, scripts: string, metadata: object, remove: string }`

### `route` (3) — Route

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/route/discover` | Discover Routes | `body` |
| `POST /api/v1/exec/route/resolve` | Resolve Route | `body*` |
| `POST /api/v1/exec/route/test` | Test Route | `body*` |

**Body shapes:**

- `POST /api/v1/exec/route/discover` body — `{ baseDir: string="", includeMetadata: bool=false }`
  - `baseDir` — Base Dir
  - `includeMetadata` — Include Metadata
- `POST /api/v1/exec/route/resolve` body — `object` — Request payload
- `POST /api/v1/exec/route/test` body — `object` — Request payload

### `schedules` (4) — Schedules

| Method | Summary | Params |
|--------|---------|--------|
| `GET /api/v1/exec/schedules/list` | List Schedules |  |
| `POST /api/v1/exec/schedules/reload` | Reload Schedules | `body` |
| `GET /api/v1/exec/schedules/history` | Schedule History | `?scriptPath` `?since` `?limit` `?includeRotated` |
| `POST /api/v1/exec/schedules/trigger` | Trigger Schedule | `body*` |

**Param notes:**

- `scriptPath` — Filter entries to a specific script (relative to scripts-dir). Optional.
- `since` — ISO 8601 lower bound on `ts`. Optional.
- `limit` — Max entries to return. Default 100, hard max 1000.
- `includeRotated` — When true, also scan rotated fires.log.* files (slower).

**Body shapes:**

- `POST /api/v1/exec/schedules/reload` body — `{ dry_run: bool=false }` — Request payload
  - `dry_run` — When true, compute the diff against the filesystem but do not apply. Returns the same shape with {added, kept, removed} lists.
- `POST /api/v1/exec/schedules/trigger` body — `{ scriptPath*: string, force: bool=false }`
  - `scriptPath` — Script path (absolute or relative to scripts-dir) of a script with a valid @schedule directive.
  - `force` — When true, bypass the @token refusal. Use with care — this fires the script as cron (no token auth).

### `scripts` (6) — Scripts

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/scripts/delete` | Delete Script | `?path*` `?confirm` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/scripts/tree` | Get Script Tree | `?execId` `?exec_id` `?subdomain` `body` |
| `GET /api/v1/exec/scripts/list` | List Scripts | `?dir` `?filter` `?metadata` `?label` `?tags` `?mode` `?enabled` `?websocket` `?recursive` `?include_comments` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/scripts/move` | Move Script | `?execId` `?exec_id` `?subdomain` `body*` |
| `GET /api/v1/exec/scripts/read` | Read Script | `?path*` `?execId` `?exec_id` `?subdomain` |
| `POST /api/v1/exec/scripts/write` | Write Script | `?execId` `?exec_id` `?subdomain` `body*` |

**Param notes:**

- `path` — Path query parameter
- `confirm` — Confirm query parameter
- `execId` — Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body.
- `exec_id` — Alias for execId (snake_case).
- `subdomain` — Optional subdomain namespace used with execId for path resolution.
- `dir` — Dir query parameter
- `filter` — Filter query parameter
- `metadata` — Metadata query parameter
- `label` — Label query parameter
- `tags` — Tags query parameter
- `mode` — Mode query parameter
- `enabled` — Enabled query parameter
- `websocket` — Websocket query parameter
- `recursive` — Recursive query parameter
- `include_comments` — Include_comments query parameter

**Body shapes:**

- `POST /api/v1/exec/scripts/tree` body — `{ baseDir: string="", maxDepth: int=10, includeMetadata: bool=false, execId: string, exec_id: string, subdomain: string }`
  - `baseDir` — Base Dir
  - `maxDepth` — Max Depth
  - `includeMetadata` — Include Metadata
  - `execId` — Optional execution scope in request body. Query execId/exec_id takes precedence when both are provided.
- `POST /api/v1/exec/scripts/move` body — `{ from*: string, to*: string, overwrite: bool=false, execId: string, exec_id: string, subdomain: string }`
- `POST /api/v1/exec/scripts/write` body — `{ path*: string, content*: string, createDirs: bool=true, validate: bool=true, execId: string, exec_id: string, subdomain: string }`
  - `createDirs` — Create Dirs

### `sdk` (4) — Sdk

| Method | Summary | Params |
|--------|---------|--------|
| `DELETE /api/v1/exec/sdk/:id` | Delete S D K |  |
| `GET /api/v1/exec/sdk/:id` | Get S D K |  |
| `POST /api/v1/exec/sdk/import` | Import S D K | `body*` |
| `GET /api/v1/exec/sdk/list` | List S D Ks |  |

**Param notes:**

- `id` — Id parameter

**Body shapes:**

- `POST /api/v1/exec/sdk/import` body — `{ execId*: string, source_url*: string, source_auth: string, middleware: string, magic_comments: string, force: bool=false }`
  - `execId` — Exec Id
  - `source_url` — Source_url
  - `source_auth` — Source_auth
  - `magic_comments` — Magic_comments

### `state` (3) — Shared-state

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/shared-state/clear` | Clear Shared State | `body*` |
| `POST /api/v1/exec/shared-state/get` | Get Shared State | `body*` |
| `POST /api/v1/exec/shared-state/set` | Set Shared State | `body*` |

**Body shapes:**

- `POST /api/v1/exec/shared-state/clear` body — `{ hostname*: string, path: string, clearAll: bool=false }`
  - `clearAll` — Clear All
- `POST /api/v1/exec/shared-state/get` body — `{ hostname*: string, path: string }`
- `POST /api/v1/exec/shared-state/set` body — `{ hostname*: string, path: string, value*: any, merge: bool=false }`
  - `value` — Arbitrary JSON value to store

### `system` (4) — System

| Method | Summary | Params |
|--------|---------|--------|
| `GET /openapi.json` | Get OpenAPI Specification (JSON) |  |
| `GET /openapi.yaml` | Get OpenAPI Specification (YAML) |  |
| `GET /api/v1/exec/system/restart-status` | Get Restart Status |  |
| `POST /api/v1/exec/system/restart` | Restart Server | `body` |

**Body shapes:**

- `POST /api/v1/exec/system/restart` body — `{ graceful: bool=true, drainTimeoutMs: int=5000, reason: string="API restart request" }`
  - `drainTimeoutMs` — Drain Timeout Ms

### `templates` (6) — Templates

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/templates/create-custom` | Create Custom Template | `body*` |
| `DELETE /api/v1/exec/templates/delete-custom/:name` | Delete Custom Template |  |
| `POST /api/v1/exec/templates/generate` | Generate From Template | `body*` |
| `GET /api/v1/exec/templates/list` | List Templates | `?category` `?includeBuiltin` `?includeCustom` |
| `GET /api/v1/exec/templates/preview` | Preview Template | `?name*` `?variables` |
| `PUT /api/v1/exec/templates/update-custom/:name` | Update Custom Template | `body` |

**Param notes:**

- `name` — Name parameter
- `category` — Filter templates to a single metadata category (e.g. `api`, `utility`). Omit to list all categories.
- `includeBuiltin` — Include built-in templates in the result set. Default `true`. Accepts `true`/`false`/`1`/`0`.
- `includeCustom` — Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`.
- `name` — Name query parameter
- `variables` — Variables query parameter

**Body shapes:**

- `POST /api/v1/exec/templates/create-custom` body — `object` — Request payload
- `POST /api/v1/exec/templates/generate` body — `{ name*: string, variables: object, outputPath: string, saveFile: bool=false }`
  - `outputPath` — Output Path
  - `saveFile` — Save File
- `PUT /api/v1/exec/templates/update-custom/:name` body — `{ code: string, metadata: object }`

### `validate` (6) — Validate

| Method | Summary | Params |
|--------|---------|--------|
| `POST /api/v1/exec/validate/dependencies` | Validate Dependencies | `body*` |
| `POST /api/v1/exec/validate/magic-comments` | Validate Magic Comments | `body*` |
| `POST /api/v1/exec/validate/return-type` | Validate Return Type | `body*` |
| `POST /api/v1/exec/validate/script` | Validate Script | `body*` |
| `POST /api/v1/exec/validate/syntax` | Validate Syntax | `body*` |
| `POST /api/v1/exec/validate/typescript` | Validate Type Script | `body*` |

**Body shapes:**

- `POST /api/v1/exec/validate/dependencies` body — `{ code*: string }`
- `POST /api/v1/exec/validate/magic-comments` body — `{ code*: string }`
- `POST /api/v1/exec/validate/return-type` body — `{ typeDefinition*: string, value*: any }`
  - `typeDefinition` — Type Definition
  - `value` — Arbitrary JSON value to validate against the declared return type
- `POST /api/v1/exec/validate/script` body — `{ code*: string }`
- `POST /api/v1/exec/validate/syntax` body — `{ code*: string }`
- `POST /api/v1/exec/validate/typescript` body — `{ code*: string }`

