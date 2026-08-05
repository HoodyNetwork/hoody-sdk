> _**SDK skill · `exec` namespace** · ~13,339 tokens · hoody-sdk v1.0.0-beta.11_

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To make a script **public**: create a `proxyAliases.create({ container_id: '<containerId>', program: 'exec', target_path: '/<your-script>', allow_path_override: false })` — get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` leak in the URL. Layer Password / Token / JWT / IP gates via `proxyPermissionsContainer.*` exactly like any other kit URL.

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

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `scripts.write`.
- **`require('hoody-sdk')` works with no install step** — the runtime auto-installs any `require()`d npm package on first execution (it is not pre-injected or bundled). Import from `'hoody-sdk'` (NOT `'hoody-sdk'`). The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the Hoody Proxy — no localhost bypass — so all the usual capability gates / request hooks / proxy logs apply (see § No local bypass in `SKILL-SDK.md`).
- The `hoody` CLI is also on `$PATH` if you'd rather shell out: `Bun.$\`hoody projects list\`` from the same script works end-to-end.

## Capability URL

→ See `SKILL-SDK.md § Proxy URLs`.

**Reaching a service you host on a container port** (any port, any namespace):

- `https://{projectId}-{containerId}-http-<port>.{node}.containers.hoody.com` — proxy speaks HTTP to `localhost:<port>`.
- `https://{projectId}-{containerId}-https-<port>.{node}.containers.hoody.com` — proxy speaks HTTPS to `localhost:<port>` (target needs TLS).

Edge is always `https://`. No alias, firewall edit, or proxy registration needed; capability-token gates still apply.

## Common workflows

### 1. Write, validate, invoke

1. `scripts.write` — `path`, `content`, `createDirs:true`, `validate:true` (default); 400 + `validation` on fail.
2. `scripts.read` — confirm bytes.
3. `POST {EXEC_BASE_URL}/<path-without-extension>` — body parsed, return auto-serialised, output streamed.
4. `scripts.list` — verify.

### 2. Pin deps, iterate

1. `dependencies.check` → `dependencies.install` → `package.pinVersions`.
2. `validate.validateScript` + `validateMagicComments` (`// @description`, `// @cors`, `// @timeout`).
3. `scripts.write` (auto-validates unless `validate:false`).
4. `cache.clear` — drop compiled cache; ephemeral runtime, no state across recompiles.

### 3. Debug + OpenAPI

1. `logs.list` / `logs.search` / `logs.read` (streamed `--lines`/`--tail`).
2. `monitor.getActiveRequests` / `monitor.getStats` / `monitor.getScriptPerformance`.
3. `openapi.listScripts` → `openapi.generate` → `openapi.merge` → `openapi.serve` → `openapi.validateSchema`.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. The stored file is ALWAYS kept verbatim; the pattern-normaliser rewrites the code at load time on every request, independent of `validate`.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `scripts.delete` needs literal `confirm=true`.
- `scripts.write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `proxyDiscovery.listContainerProxyServices` returning `[]` is normal.
- `scripts.write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every script gets pre-injected globals: `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`, default model **`hoody-ai/hoody-free`**). **No `require()`, no base URL, and no API key** — the key auto-defaults to `container-<hash>` and is a usage-tracking tag, NOT auth, so you specify nothing. **The default model is the free tier: it costs nothing and needs no wallet credit, so a script with no `// @ai-model` line runs on a brand-new account.** Overriding it with a catalog model (`GET https://api.hoody.com/api/v1/ai/models`) bills the wallet and is **refused outright** while `ai_limit` is `0.00` — check `GET /api/v1/wallet/balances/ai` before you name one. Override per-script with magic comments (`// @ai-model minimax/minimax-m3` — paid, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — recheck `safePath`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`system.restartServer` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Every step in every example was live-tested against a real `exec-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `containers.get` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST {KIT}/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when syntax + TS-transpile + dependency-check + magic-comment parse all pass.

```typescript
await client.exec.scripts.write({
  path: 'echo.js',
  content: 'module.exports = (req, res) => res.json({ ok: true, body: req.body });\n',
});
```
**Step 2 — invoke `POST /echo`** (bare path, NOT `/api/v1/exec/echo`). Body is auto-parsed; the return value of `res.json(...)` is the wire body.

```typescript
// `exec` kit accepts the bare kit URL as the bearer — NO Authorization header needed.
const r = await fetch(`https://${P}-${C}-exec-1.${N}.containers.hoody.com/echo`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ hello: 'world' }),
});
console.log(await r.json());
```
**Step 3 — read it back.** `scripts.read` returns the literal content + parsed `magicComments` + metadata.

```typescript
const r = await client.exec.scripts.read({ path: 'echo.js' });
console.log(r.data!.content);
```
### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `client.curl.execute(...)` / SDK calls.

```typescript
await client.exec.scripts.write({
  path: 'workflow.js',
  content: `module.exports = async (req, res) => {
  // Real version — the Hoody SDK is auto-loaded inside scripts:
  //   const { HoodyClient } = require('hoody-sdk');
  //   The kit injects NO HOODY_* variables — script env is process.env plus a `.env`
  //   companion file next to the script, so you must supply these yourself:
  //   const hoody = new HoodyClient({ baseURL: process.env.HOODY_API_URL!, token: process.env.HOODY_TOKEN });
  //   const c = await hoody.withContainer(process.env.HOODY_CONTAINER!);
  //   const a = await c.curl.execute({ url: 'https://agent-a/score', method: 'POST', data: req.body });
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
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const expect = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  let ok = false;
  try { ok = sig.length === expect.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect)); } catch {}
  if (!ok) return res.status(401).json({ error: 'bad sig' });
  res.json({ accepted: true, payload: req.body });
};
`;
await client.exec.scripts.write({ path: 'webhook.js', content: webhookCode });
```
**Step 2 — fire a signed request.** The Bun `req.body` is an *object* if Content-Type was JSON, so re-serialise before HMAC'ing on both sides for byte-stable signing.

### 4. Pin npm deps — `dependencies.check` → `dependencies.install` → `package.pinVersions`

**Goal:** add `lodash` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```typescript
const r = await client.exec.dependencies.check({ code: 'const _ = require("lodash");' });
console.log(r.data!.missing);
```
**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"lodash@4.17.21"`).

```typescript
await client.exec.dependencies.install({ modules: ['lodash'] });
```
**Step 3 — pin to exact versions** (drops the leading `^`/`~`).

```typescript
await client.exec.package.pinVersions({ packages: ['lodash'] });
```
### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```typescript
const code = `// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });`;
const v = await client.exec.validate.validateScript({ code });
const m = await client.exec.validate.validateMagicComments({ code });
console.log(v.data!.valid, m.data!.magicComments);
```
If `valid:true`, ship it via `scripts.write` (default `validate:true` will re-run the same checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies,magicComments}` slots tell you exactly which checker rejected it.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry (and inferred request/response shapes from any handler-attached schema) in a single OpenAPI 3.0 document the proxy can serve.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```typescript
const r = await client.exec.openapi.listScripts();
console.log(r.data!.scripts);
```
**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```typescript
const r = await client.exec.openapi.serve({ format: 'json' });
require('fs').writeFileSync('/tmp/user-scripts.openapi.json', JSON.stringify(r.data, null, 2));
```
**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `openapi.merge`. `openapi.generate` rebuilds the on-disk spec from current scripts; `openapi.validateSchema` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `logs.list` returns kit-wide log files; `logs.read` slices a specific one.

```typescript
const list = await client.exec.logs.list();
const tail = await client.exec.logs.read({ file: logName, lines: 200, tail: true }  // logName from logs.list().logs[].name);
```
Access logging is ON by default (`@log-level` defaults to `standard`); the magic comments opt *out* — `// @log-level none` disables it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `monitor.getStats` is a single snapshot; `monitor.getActiveRequests` lists in-flight HTTP/WS; `monitor.getScriptPerformance` aggregates by script.

```typescript
const stats = await client.exec.monitor.getStats();
const active = await client.exec.monitor.getActiveRequests();
const perf = await client.exec.monitor.getScriptPerformance({});
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
Same pattern works for `python3 -c "..."`, `ffmpeg`, native binaries, anything on `$PATH`. The script handler runs inside the container as a normal process.

### 10. In-process schedule via `@schedule` directive

**Goal:** fire a script every 5 minutes WITHOUT the `cron` namespace. The schedule lives inside the kit; if the kit restarts, the schedule re-registers from disk on boot. (For schedules that must survive a kit-down — use the `cron` namespace instead.)

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log; `res.json` is what an HTTP `triggerSchedule` call returns.

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
**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, and the absolute on-disk `scriptPath` you'll need to trigger it.

```typescript
const r = await client.exec.schedules.listSchedules();
console.log(r.data!.schedules);
```
**Step 3 — fire it on demand.** `scriptPath` accepts either the absolute path returned in step 2 OR a path relative to the kit's scripts dir (the handler resolves relative paths against `scriptDir`). `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only.

```typescript
await client.exec.schedules.triggerSchedule({
  scriptPath: '/hoody/storage/hoody-exec/scripts/default/1/tick.js',
  force: true,
});
const hist = await client.exec.schedules.scheduleHistory({ limit: 5 });
```
**Stop the schedule** by deleting the script (`scripts.delete?path=tick.js&confirm=true`) or by editing the file to remove the `// @schedule` directive and calling `schedules.reloadSchedules`.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. The runtime pre-injects `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key auto-defaults to `container-<hash>` (a usage-tracking tag, not auth). Default model is **`hoody-ai/hoody-free`**, the free tier — no wallet credit needed, so the script below works on a brand-new account with `ai_limit: "0.00"`. Override per-script with `// @ai-model <provider/model>` **only when you need a paid catalog model and have confirmed the wallet has AI credit**, and set a system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```typescript
await client.exec.scripts.write({
  path: 'summarize.js',
  content: `// @description One-line summary via built-in Hoody AI (free model by default)
module.exports = async (req, res) => {
  const text = metadata.query.q || 'Say hello in one sentence.';
  const result = await ai.generate('Summarize in one line: ' + text); // ai/model/generateText all pre-injected
  res.json({ summary: result.text });
};
`,
});
```
**Step 2 — invoke it** (bare path on the exec kit URL). No key anywhere in the call:

```
https://{P}-{C}-exec-1.{N}.containers.hoody.com/summarize?q=Hoody+is+a+remote-first+computing+platform
# → {"summary":"..."}
```

For structured output use `ai.object({ schema, prompt })` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`.

## Reference

**Accessor:** `client.exec`  |  **Import:** `import * as exec from 'hoody-sdk/exec'`

### `client.exec.cache` (1) — Cache

#### `clear` — Clear Cache

```typescript
client.exec.cache.clear(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ hostname: string, scriptPath: string, clearVm: bool=true, clearState: bool=false, clearAll: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/cache/clear`
**CLI:** `hoody exec system cache-clear`

---

### `client.exec.dependencies` (3) — Dependencies

#### `check` — Check Dependencies

```typescript
client.exec.dependencies.check(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ code: string, modules: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/dependencies/check`
**CLI:** `hoody exec packages check`

---

#### `install` — Install Dependencies

```typescript
client.exec.dependencies.install(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ modules*: string | string[], force: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/dependencies/install`
**CLI:** `hoody exec packages add-modules`

---

#### `listBundled` — List Bundled Dependencies

```typescript
client.exec.dependencies.listBundled()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/dependencies/bundled`
**CLI:** `hoody exec packages list`

---

### `client.exec.execution` (1) — Script Execution

#### `execute` — Execute Script (GET)

```typescript
client.exec.execution.execute(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | path | Yes | Script path (supports Next.js-style routing) |

**Returns:** `any`  |  **HTTP:** `GET /{path}`

---

### `client.exec.health` (1) — Health

#### `check` — Health Check

```typescript
client.exec.health.check()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/health`
**CLI:** `hoody exec health`

---

### `client.exec.ids` (1) — List

#### `list` — List All Exec Ids

```typescript
client.exec.ids.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/list`
**CLI:** `hoody exec namespaces list`

---

### `client.exec.logs` (5) — Logs

#### `clear` — Clear Logs

```typescript
client.exec.logs.clear(file?: string, type?: string, olderThanDays?: string, confirm?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `file` | `string` | query | No | File query parameter |
| `type` | `string` | query | No | Type query parameter |
| `olderThanDays` | `string` | query | No | OlderThanDays query parameter |
| `confirm` | `string` | query | No | Confirm query parameter |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/exec/logs/clear`
**CLI:** `hoody exec logs clear`

---

#### `list` — List Logs

```typescript
client.exec.logs.list(type?: string, limit?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `type` | `string` | query | No | Type query parameter |
| `limit` | `string` | query | No | Limit query parameter |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/logs/list`
**CLI:** `hoody exec logs list`

---

#### `read` — Read Log

```typescript
client.exec.logs.read(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ file: string, executionId: string, lines: int=100, tail: bool=true, search: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/logs/read`
**CLI:** `hoody exec logs read`

---

#### `search` — Search Logs

```typescript
client.exec.logs.search(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ query: string, regex: string, files: any[], limit: int=1000, caseSensitive: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/logs/search`
**CLI:** `hoody exec logs search`

---

#### `stream` — Stream Logs

```typescript
client.exec.logs.stream(file: string, follow?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `file` | `string` | query | Yes | File query parameter |
| `follow` | `string` | query | No | Follow query parameter |

**Returns:** `void`  |  **HTTP:** `GET /api/v1/exec/logs/stream`
**CLI:** `hoody exec logs stream`

---

### `client.exec.magic` (4) — Magic-comments

#### `bulkUpdate` — Bulk Update Magic Comments

```typescript
client.exec.magic.bulkUpdate(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ directory: string, execId: string, comments: string, extension: string=".ts", recursive: bool=true, dry_run: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/magic-comments/bulk-update`
**CLI:** `hoody exec magic-comments bulk-update`

---

#### `getSchema` — Get Magic Comments Schema

```typescript
client.exec.magic.getSchema()
```

**Returns:** `exec_MagicCommentSchemaDocument`  |  **HTTP:** `GET /api/v1/exec/magic-comments/schema`
**CLI:** `hoody exec magic-comments schema`

---

#### `read` — Read Magic Comments

```typescript
client.exec.magic.read(path: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Path query parameter |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/magic-comments/read`
**CLI:** `hoody exec magic-comments read`

---

#### `updateHandler` — Update Magic Comments Handler

```typescript
client.exec.magic.updateHandler(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ path*: string, comments: string, dry_run: bool=false }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/exec/magic-comments/update`
**CLI:** `hoody exec magic-comments update`

---

### `client.exec.monitor` (5) — Monitor

#### `getActiveRequests` — Get Active Requests

```typescript
client.exec.monitor.getActiveRequests()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/monitor/active-requests`
**CLI:** `hoody exec system active-requests`

---

#### `getScriptPerformance` — Get Script Performance

```typescript
client.exec.monitor.getScriptPerformance(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/monitor/script-performance`
**CLI:** `hoody exec scripts performance`

---

#### `getStats` — Get Stats

```typescript
client.exec.monitor.getStats()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/monitor/stats`
**CLI:** `hoody exec system stats`

---

#### `listMonitorScripts` — List Monitor Scripts

```typescript
client.exec.monitor.listMonitorScripts(limit?: integer, sort?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `limit` | `integer` | query | No | Max number of scripts to return. Clamped to [1, 500]. Default 100. |
| `sort` | `string` | query | No | Sort key. `lastActivity` (default) sorts by most recent activity; other keys sort descending by the matching metric. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/monitor/scripts`

---

#### `prometheusExport` — Prometheus Export

```typescript
client.exec.monitor.prometheusExport()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/monitor/metrics`
**CLI:** `hoody exec system prometheus`

---

### `client.exec.openapi` (6) — User-openapi

#### `generate` — Generate User Open A P I

```typescript
client.exec.openapi.generate(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/user-openapi/generate`
**CLI:** `hoody exec openapi generate`

---

#### `listScripts` — List User Scripts

```typescript
client.exec.openapi.listScripts(directory?: string, dir?: string, subdomain?: string, execId?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `directory` | `string` | query | No | Script directory to list (absolute or relative to scripts-dir). Default: `scripts`. |
| `dir` | `string` | query | No | Alias of `directory`. Ignored when `directory` is provided. |
| `subdomain` | `string` | query | No | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | query | No | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/user-openapi/list`
**CLI:** `hoody exec scripts list-user`

---

#### `merge` — Merge Open A P I Specs

```typescript
client.exec.openapi.merge(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/user-openapi/merge`
**CLI:** `hoody exec openapi merge`

---

#### `serve` — Serve Generated Spec

```typescript
client.exec.openapi.serve(dir?: string, directory?: string, format?: string, subdomain?: string, execId?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `dir` | `string` | query | No | Script directory to scan (absolute or relative to scripts-dir). Default: `scripts`. |
| `directory` | `string` | query | No | Alias of `dir`. Ignored when `dir` is provided. |
| `format` | `string` | query | No | Output format. `json` (default) or `yaml`. |
| `subdomain` | `string` | query | No | Limit scan to scripts under this subdomain. Falls back to the Host header when omitted. |
| `execId` | `string` | query | No | Limit scan to scripts under this execId. Falls back to the Host header when omitted. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/user-openapi/spec`
**CLI:** `hoody exec openapi serve`

---

#### `serveSchema` — Serve Schema File

```typescript
client.exec.openapi.serveSchema(file?: string, path?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `file` | `string` | query | No | Absolute or scripts-dir-relative path to the target script (e.g. `default/api/users/[id].ts`). Either `file` or `path` must be provided. |
| `path` | `string` | query | No | Alias of `file`. Either `file` or `path` must be provided. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/user-openapi/schema`
**CLI:** `hoody exec openapi serve-schema`

---

#### `validateSchema` — Validate User Schema

```typescript
client.exec.openapi.validateSchema(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/user-openapi/validate`
**CLI:** `hoody exec validate user-schema`

---

### `client.exec.package` (6) — Package

#### `compare` — Compare Packages

```typescript
client.exec.package.compare(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/package/compare`
**CLI:** `hoody exec packages compare`

---

#### `initJson` — Init Package Json

```typescript
client.exec.package.initJson(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ name: string="hoody-exec-project", version: string="1.0.0", description: string="Hoody Exec project", force: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/package/init`
**CLI:** `hoody exec packages json init`

---

#### `install` — Install Packages

```typescript
client.exec.package.install(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ packages: any[], dev: bool=false, save: bool=true, force: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/package/install`
**CLI:** `hoody exec packages install`

---

#### `pinVersions` — Pin Versions

```typescript
client.exec.package.pinVersions(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ packages: any[] }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/package/pin`
**CLI:** `hoody exec packages pin`

---

#### `readJson` — Read Package Json

```typescript
client.exec.package.readJson()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/package/read`
**CLI:** `hoody exec packages json read`

---

#### `updateJson` — Update Package Json

```typescript
client.exec.package.updateJson(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ dependencies: string, scripts: string, metadata: object, remove: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/package/update`
**CLI:** `hoody exec packages json update`

---

### `client.exec.route` (3) — Route

#### `discover` — Discover Routes

```typescript
client.exec.route.discover(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ baseDir: string="", includeMetadata: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/route/discover`
**CLI:** `hoody exec routes discover`

---

#### `resolve` — Resolve Route

```typescript
client.exec.route.resolve(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/route/resolve`
**CLI:** `hoody exec routes resolve`

---

#### `test` — Test Route

```typescript
client.exec.route.test(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/route/test`
**CLI:** `hoody exec routes test`

---

### `client.exec.schedules` (4) — Schedules

#### `listSchedules` — List Schedules

```typescript
client.exec.schedules.listSchedules()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/schedules/list`
**CLI:** `hoody exec schedules list`

---

#### `reloadSchedules` — Reload Schedules

```typescript
client.exec.schedules.reloadSchedules(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ dry_run: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/schedules/reload`
**CLI:** `hoody exec schedules reload`

---

#### `scheduleHistory` — Schedule History

```typescript
client.exec.schedules.scheduleHistory(scriptPath?: string, since?: string, limit?: integer, includeRotated?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `scriptPath` | `string` | query | No | Filter entries to a specific script (relative to scripts-dir). Optional. |
| `since` | `string` | query | No | ISO 8601 lower bound on `ts`. Optional. |
| `limit` | `integer` | query | No | Max entries to return. Default 100, hard max 1000. |
| `includeRotated` | `boolean` | query | No | When true, also scan rotated fires.log.* files (slower). |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/schedules/history`
**CLI:** `hoody exec schedules history`

---

#### `triggerSchedule` — Trigger Schedule

```typescript
client.exec.schedules.triggerSchedule(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ scriptPath*: string, force: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/schedules/trigger`
**CLI:** `hoody exec schedules trigger`

---

### `client.exec.scripts` (6) — Scripts

#### `delete` — Delete Script

```typescript
client.exec.scripts.delete(path: string, confirm?: string, execId?: string, exec_id?: string, subdomain?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Path query parameter |
| `confirm` | `string` | query | No | Confirm query parameter |
| `execId` | `string` | query | No | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | query | No | Alias for execId (snake_case). |
| `subdomain` | `string` | query | No | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/exec/scripts/delete`
**CLI:** `hoody exec scripts delete`

---

#### `getTree` — Get Script Tree

```typescript
client.exec.scripts.getTree(execId?: string, exec_id?: string, subdomain?: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `execId` | `string` | query | No | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | query | No | Alias for execId (snake_case). |
| `subdomain` | `string` | query | No | Optional subdomain namespace used with execId for path resolution. |
| `data` | `object` | body | No |  |

**Body:** `{ baseDir: string="", maxDepth: int=10, includeMetadata: bool=false, execId: string, exec_id: string, subdomain: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/scripts/tree`
**CLI:** `hoody exec scripts tree`

---

#### `list` — List Scripts

```typescript
client.exec.scripts.list(dir?: string, filter?: string, metadata?: string, label?: string, tags?: string, mode?: string, enabled?: string, websocket?: string, recursive?: string, include_comments?: string, execId?: string, exec_id?: string, subdomain?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `dir` | `string` | query | No | Dir query parameter |
| `filter` | `string` | query | No | Filter query parameter |
| `metadata` | `string` | query | No | Metadata query parameter |
| `label` | `string` | query | No | Label query parameter |
| `tags` | `string` | query | No | Tags query parameter |
| `mode` | `string` | query | No | Mode query parameter |
| `enabled` | `string` | query | No | Enabled query parameter |
| `websocket` | `string` | query | No | Websocket query parameter |
| `recursive` | `string` | query | No | Recursive query parameter |
| `include_comments` | `string` | query | No | Include_comments query parameter |
| `execId` | `string` | query | No | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | query | No | Alias for execId (snake_case). |
| `subdomain` | `string` | query | No | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/scripts/list`
**CLI:** `hoody exec scripts list`

---

#### `move` — Move Script

```typescript
client.exec.scripts.move(execId?: string, exec_id?: string, subdomain?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `execId` | `string` | query | No | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | query | No | Alias for execId (snake_case). |
| `subdomain` | `string` | query | No | Optional subdomain namespace used with execId for path resolution. |
| `data` | `object` | body | Yes |  |

**Body:** `{ from*: string, to*: string, overwrite: bool=false, execId: string, exec_id: string, subdomain: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/scripts/move`
**CLI:** `hoody exec scripts move`

---

#### `read` — Read Script

```typescript
client.exec.scripts.read(path: string, execId?: string, exec_id?: string, subdomain?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `path` | `string` | query | Yes | Path query parameter |
| `execId` | `string` | query | No | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | query | No | Alias for execId (snake_case). |
| `subdomain` | `string` | query | No | Optional subdomain namespace used with execId for path resolution. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/scripts/read`
**CLI:** `hoody exec scripts read`

---

#### `write` — Write Script

```typescript
client.exec.scripts.write(execId?: string, exec_id?: string, subdomain?: string, data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `execId` | `string` | query | No | Optional execution scope. When provided, relative paths resolve under default/{execId}/ unless subdomain is also set. Query value takes precedence over body. |
| `exec_id` | `string` | query | No | Alias for execId (snake_case). |
| `subdomain` | `string` | query | No | Optional subdomain namespace used with execId for path resolution. |
| `data` | `object` | body | Yes |  |

**Body:** `{ path*: string, content*: string, createDirs: bool=true, validate: bool=true, execId: string, exec_id: string, subdomain: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/scripts/write`
**CLI:** `hoody exec scripts write`

---

### `client.exec.sdk` (4) — Sdk

#### `delete` — Delete S D K

```typescript
client.exec.sdk.delete(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Id parameter |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/exec/sdk/:id`
**CLI:** `hoody exec sdks delete`

---

#### `get` — Get S D K

```typescript
client.exec.sdk.get(id: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `id` | `string` | path | Yes | Id parameter |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/sdk/:id`
**CLI:** `hoody exec sdks get`

---

#### `importSDK` — Import S D K

```typescript
client.exec.sdk.importSDK(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ execId*: string, source_url*: string, source_auth: string, middleware: string, magic_comments: string, force: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/sdk/import`
**CLI:** `hoody exec sdks import`

---

#### `list` — List S D Ks

```typescript
client.exec.sdk.list()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/sdk/list`
**CLI:** `hoody exec sdks list`

---

### `client.exec.state` (3) — Shared-state

#### `clear` — Clear Shared State

```typescript
client.exec.state.clear(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ hostname*: string, path: string, clearAll: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/shared-state/clear`
**CLI:** `hoody exec state clear`

---

#### `get` — Get Shared State

```typescript
client.exec.state.get(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ hostname*: string, path: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/shared-state/get`
**CLI:** `hoody exec state get`

---

#### `set` — Set Shared State

```typescript
client.exec.state.set(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ hostname*: string, path: string, value*: any, merge: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/shared-state/set`
**CLI:** `hoody exec state set`

---

### `client.exec.system` (4) — System

#### `getOpenApiJson` — Get OpenAPI Specification (JSON)

```typescript
client.exec.system.getOpenApiJson()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.json`

---

#### `getOpenApiYaml` — Get OpenAPI Specification (YAML)

```typescript
client.exec.system.getOpenApiYaml()
```

**Returns:** `any`  |  **HTTP:** `GET /openapi.yaml`

---

#### `getRestartStatus` — Get Restart Status

```typescript
client.exec.system.getRestartStatus()
```

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/system/restart-status`
**CLI:** `hoody exec system restart-status`

---

#### `restartServer` — Restart Server

```typescript
client.exec.system.restartServer(data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | No |  |

**Body:** `{ graceful: bool=true, drainTimeoutMs: int=5000, reason: string="API restart request" }`

**Returns:** `void`  |  **HTTP:** `POST /api/v1/exec/system/restart`
**CLI:** `hoody exec system restart`

---

### `client.exec.templates` (6) — Templates

#### `createCustom` — Create Custom Template

```typescript
client.exec.templates.createCustom(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/templates/create-custom`
**CLI:** `hoody exec templates create`

---

#### `deleteCustom` — Delete Custom Template

```typescript
client.exec.templates.deleteCustom(name: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Name parameter |

**Returns:** `any`  |  **HTTP:** `DELETE /api/v1/exec/templates/delete-custom/:name`
**CLI:** `hoody exec templates delete`

---

#### `generate` — Generate From Template

```typescript
client.exec.templates.generate(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ name*: string, variables: object, outputPath: string, saveFile: bool=false }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/templates/generate`
**CLI:** `hoody exec templates generate`

---

#### `list` — List Templates

```typescript
client.exec.templates.list(category?: string, includeBuiltin?: boolean, includeCustom?: boolean)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `category` | `string` | query | No | Filter templates to a single metadata category (e.g. `api`, `utility`). Omit to list all categories. |
| `includeBuiltin` | `boolean` | query | No | Include built-in templates in the result set. Default `true`. Accepts `true`/`false`/`1`/`0`. |
| `includeCustom` | `boolean` | query | No | Include user-supplied templates (from `_hoody/templates/`) in the result set. Default `true`. |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/templates/list`
**CLI:** `hoody exec templates list`

---

#### `preview` — Preview Template

```typescript
client.exec.templates.preview(name: string, variables?: string)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | query | Yes | Name query parameter |
| `variables` | `string` | query | No | Variables query parameter |

**Returns:** `any`  |  **HTTP:** `GET /api/v1/exec/templates/preview`
**CLI:** `hoody exec templates preview`

---

#### `updateCustom` — Update Custom Template

```typescript
client.exec.templates.updateCustom(name: string, data?: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `name` | `string` | path | Yes | Name parameter |
| `data` | `object` | body | No |  |

**Body:** `{ code: string, metadata: object }`

**Returns:** `any`  |  **HTTP:** `PUT /api/v1/exec/templates/update-custom/:name`
**CLI:** `hoody exec templates update`

---

### `client.exec.validate` (6) — Validate

#### `validateDependencies` — Validate Dependencies

```typescript
client.exec.validate.validateDependencies(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/validate/dependencies`
**CLI:** `hoody exec validate dependencies`

---

#### `validateMagicComments` — Validate Magic Comments

```typescript
client.exec.validate.validateMagicComments(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/validate/magic-comments`
**CLI:** `hoody exec validate magic-comments`

---

#### `validateReturnType` — Validate Return Type

```typescript
client.exec.validate.validateReturnType(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ typeDefinition*: string, value*: any }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/validate/return-type`
**CLI:** `hoody exec validate return-type`

---

#### `validateScript` — Validate Script

```typescript
client.exec.validate.validateScript(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/validate/script`
**CLI:** `hoody exec validate script`

---

#### `validateSyntax` — Validate Syntax

```typescript
client.exec.validate.validateSyntax(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/validate/syntax`
**CLI:** `hoody exec validate syntax`

---

#### `validateTypeScript` — Validate Type Script

```typescript
client.exec.validate.validateTypeScript(data: object)
```

| Parameter | Type | In | Required | Description |
|-----------|------|------|----------|-------------|
| `data` | `object` | body | Yes |  |

**Body:** `{ code*: string }`

**Returns:** `any`  |  **HTTP:** `POST /api/v1/exec/validate/typescript`
**CLI:** `hoody exec validate types`

