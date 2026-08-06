> _**CLI skill · `exec` namespace** · ~7,891 tokens · hoody-sdk v1.0.0-beta.12_

# `exec` — micro-services: any script or API as an instant HTTP endpoint

## Purpose

**Default tool when the user asks "write me an API" or "expose this script".** Drop a `.ts` / `.js` file in the scripts dir and it becomes a live HTTP handler — no framework, no build step, no deploy. The kit keeps it loaded and ready: each request is fast, supervised, schematized via magic comments / OpenAPI, log-streamed, metric-instrumented, and updateable by overwriting the file. Treat each script like a tiny microservice — single responsibility, simple in spirit, but it can shell out to anything (curl, ffmpeg, Python, native binaries, …) since it runs as a normal process inside the container.

**Routes only auto-mount for `.ts` / `.js` files.** Bare `.sh` / `.py` files dropped in the scripts dir are NOT exposed as HTTP — wrap them by writing a thin `.ts` handler that shells out via `Bun.$`. From a `.ts` handler you can run anything on `$PATH` (curl, ffmpeg, Python, native binaries) in one line.

To make a script **public**: create a `hoody proxy create` — get back `https://<alias>.{server_name}.containers.hoody.com` with no `containerId` leak in the URL. Layer Password / Token / JWT / IP gates via `proxyPermissionsContainer.*` exactly like any other kit URL.

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

- Scripts dir `/hoody/storage/hoody-exec/scripts/{subdomain}/{instanceId}/` (subdomain defaults to `default`, e.g. `…/scripts/default/1/`) is service-managed; write only via `hoody exec scripts write`.
- **`require('hoody-sdk')` works with no install step** — the runtime auto-installs any `require()`d npm package on first execution (it is not pre-injected or bundled). Import from `'hoody-sdk'` (NOT `'hoody-sdk'`). The constructor takes an explicit config; `withContainer` is async and returns a container-scoped client. Calls go through the Hoody Proxy — no localhost bypass — so all the usual capability gates / request hooks / proxy logs apply (see § No local bypass in `SKILL-CLI.md`).
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

1. `hoody exec packages check` → `hoody exec packages add-modules` → `hoody exec packages pin`.
2. `hoody exec validate script` + `hoody exec validate magic-comments` (`// @description`, `// @cors`, `// @timeout`).
3. `hoody exec scripts write` (auto-validates unless `validate:false`).
4. `hoody exec system cache-clear` — drop compiled cache; ephemeral runtime, no state across recompiles.

### 3. Debug + OpenAPI

1. `hoody exec logs list` / `hoody exec logs search` / `hoody exec logs read` (streamed `--lines`/`--tail`).
2. `hoody exec system active-requests` / `hoody exec system stats` / `hoody exec scripts performance`.
3. `hoody exec scripts list-user` → `hoody exec openapi generate` → `hoody exec openapi merge` → `hoody exec openapi serve` → `hoody exec validate user-schema`.

## Quirks & gotchas

- **Direct execution / top-level `return` is the canonical script shape**; `req`, `res`, `metadata`, `shared`, `console`, and `require` are auto-injected. `module.exports = handler` and many `export default` forms are accepted as compatibility inputs. The stored file is ALWAYS kept verbatim; the pattern-normaliser rewrites the code at load time on every request, independent of `validate`.
- Prefer top-level code with auto-injected `req`/`res` (or just `return …` from the script body); use `module.exports = handler` only as a compatibility style.
- `hoody exec scripts delete` needs literal `confirm=true`.
- `hoody exec scripts write` defaults `createDirs:true`, `validate:true`. `.md`/`.yaml`/`.env`/any other non-`.ts`/`.js`/`.json` extension skip; `.json` JSON.parse; only `.ts`/`.js` full pipeline.
- Invocation = bare path (`POST /greeting`), NOT `/api/v1/exec/...`.
- Proxy-alias uses `program: 'exec'`; `hoody containers proxy discovery services list` returning `[]` is normal.
- `hoody exec scripts write`/`delete` accept optional `execId` (alias `exec_id`) + `subdomain`; query wins.
- **Built-in AI, zero setup — never wire up your own provider/key for AI in a script.** Every script gets pre-injected globals: `ai` (`ai.generate(prompt)` / `ai.stream(prompt)` / `ai.object({ schema, prompt })`), plus `openai` (provider factory), `model` (the default model instance), and `generateText`/`streamText`/`generateObject`. They are already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`, default model **`hoody-ai/hoody-free`**). **No `require()`, no base URL, and no API key** — the key auto-defaults to `container-<hash>` and is a usage-tracking tag, NOT auth, so you specify nothing. **The default model is the free tier: it costs nothing and needs no wallet credit, so a script with no `// @ai-model` line runs on a brand-new account.** Overriding it with a catalog model (`GET https://api.hoody.com/api/v1/ai/models`) bills the wallet and is **refused outright** while `ai_limit` is `0.00` — check `GET /api/v1/wallet/balances/ai` before you name one. Override per-script with magic comments (`// @ai-model minimax/minimax-m3` — paid, `// @ai-temperature 0.7`, `// @ai-max-tokens 2048`, `// @ai-key <custom-tag>`); set a system prompt via a sibling `<script>.system.md` (or directory-level `_system.md`).

## Common errors

- `400 Script validation failed` — fix or `validate:false`.
- `400 confirm=true parameter required for safety`.
- `403 Path is excluded from access` — recheck `safePath`.
- `400 Invalid JSON` on `.json` — `validate:false` bypasses.

## Related namespaces

- `files` (FS outside scripts dir), `cron` (outlives kit; `exec.schedules.*` is in-process), `terminal`, `daemon` (`hoody exec system restart` = kit only), `proxyLogs` (edge vs kit logs).

## Examples

Every step in every example was live-tested against a real `exec-1` kit. Each step has a copy-pasteable code block in the mode you're reading (curl for HTTP, `hoody` for CLI, TypeScript for SDK). Set `P`, `C`, `N` (project id, container id, server name) from `hoody containers get` first.

Two facts to keep in mind across every example:

- **Script invocation is bare path** — `POST /<basename-without-extension>`, NOT `/api/v1/exec/...`. Writing `echo.js` exposes `POST {KIT}/echo`.
- **Canonical shape: top-level code with auto-injected `req`/`res`/`metadata`/`shared`/`console`/`require` and `return …`.** `module.exports = (req, res) => res.json(...)` is also accepted (compatibility style, normalised at load time on every request regardless of `validate`). `req.query` does NOT exist on the raw request object — read query/route params from the auto-injected `metadata.query` (or `metadata.parameters`) instead.

### 1. One-line echo handler — write, invoke, read back

**Goal:** prove the loop end-to-end. Drop a 1-line CommonJS handler, hit its bare path, read it back to confirm the bytes.

**Step 1 — write `echo.js`.** `validate:true` is the default; the kit returns `validated:true` in the response when syntax + TS-transpile + dependency-check + magic-comment parse all pass.

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
**Step 3 — read it back.** `hoody exec scripts read` returns the literal content + parsed `magicComments` + metadata.

```bash
hoody --container "$C" exec scripts read --path echo.js -o json | jq .content
```
### 2. Multi-step workflow — agent A → check with B → action C

**Goal:** one script orchestrates three steps as plain async functions. State lives in script-local closures, no inter-service plumbing. The externals are stubbed inline; in a real script swap them for `hoody curl exec` / SDK calls.

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
  const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
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
**Step 2 — fire a signed request.** The Bun `req.body` is an *object* if Content-Type was JSON, so re-serialise before HMAC'ing on both sides for byte-stable signing.

### 4. Pin npm deps — `hoody exec packages check` → `hoody exec packages add-modules` → `hoody exec packages pin`

**Goal:** add `lodash` to the kit's package.json, install it, then pin to an exact version so future installs are deterministic.

**Step 1 — check.** Returns `installed[]` and `missing[]` per module so you can decide what to install.

```bash
hoody --container "$C" exec packages check --code 'const _ = require("lodash");'
```
**Step 2 — install.** `modules` accepts a string or array; specs may pin (`"lodash@4.17.21"`).

```bash
hoody --container "$C" exec packages add-modules --modules lodash
```
**Step 3 — pin to exact versions** (drops the leading `^`/`~`).

```bash
hoody --container "$C" exec packages pin --packages '["lodash"]'   # --packages takes a JSON array blob today; repeatable scalar flags planned
```
### 5. Validate-only flow + magic comments

**Goal:** lint a script (and its magic comments — `@cors`, `@timeout`, `@description`, `@schedule`, `@token`, `@websocket`, …) BEFORE writing it. Useful in CI / pre-commit / LLM-output gating. (`@method` / `@route` are not directives — HTTP method dispatch is per-handler logic.)

```bash
CODE='// @cors *
// @timeout 5000
// @description Greeting handler
module.exports = (req, res) => res.json({ hi: 1 });'
hoody --container "$C" exec validate script --code "$CODE"
hoody --container "$C" exec validate magic-comments --code "$CODE"
```
If `valid:true`, ship it via `hoody exec scripts write` (default `validate:true` will re-run the same checks server-side). If `valid:false`, the `results.{syntax,typescript,dependencies,magicComments}` slots tell you exactly which checker rejected it.

### 6. Auto-publish OpenAPI for your scripts

**Goal:** every script gets a route entry (and inferred request/response shapes from any handler-attached schema) in a single OpenAPI 3.0 document the proxy can serve.

**Step 1 — list what would be in the spec** (route paths derived from filenames):

```bash
hoody --container "$C" exec scripts list-user
```
**Step 2 — fetch the served spec** (what an OpenAPI viewer / SDK generator will see). `format=json|yaml`.

```bash
hoody --container "$C" exec openapi serve --format json > /tmp/user-scripts.openapi.json
```
**Step 3 — merge a hand-written spec layer** (auth / examples / hosts) on top of the auto-generated one with `hoody exec openapi merge`. `hoody exec openapi generate` rebuilds the on-disk spec from current scripts; `hoody exec validate user-schema` validates a script's companion `.openapi.json` file (the per-script schema sidecar in the `openapi-json` format), not the merged/served spec.

### 7. Tail script logs in real time

**Goal:** watch what your handler logged for the last N requests. Default `hoody exec logs list` returns kit-wide log files; `hoody exec logs read` slices a specific one.

```bash
hoody --container "$C" exec logs list
hoody --container "$C" exec logs read --file "$LOGNAME"   # from `exec logs list` → .logs[].name --lines 200 --tail
hoody --container "$C" exec logs stream --file "$LOGNAME"   # from `exec logs list` → .logs[].name --follow true
```
Access logging is ON by default (`@log-level` defaults to `standard`); the magic comments opt *out* — `// @log-level none` disables it.

### 8. Monitor active requests + per-script stats

**Goal:** "is anything stuck?" + "which script is the hot path?". `hoody exec system stats` is a single snapshot; `hoody exec system active-requests` lists in-flight HTTP/WS; `hoody exec scripts performance` aggregates by script.

```bash
hoody --container "$C" exec system stats
hoody --container "$C" exec system active-requests
hoody --container "$C" exec scripts performance --body '{}'
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

**Step 1 — write a script with `// @schedule`** (5-field cron or a nickname like `@daily`, UTC, one per file). `console.log` lines go to the kit log; `res.json` is what an HTTP `hoody exec schedules trigger` call returns.

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
**Step 2 — confirm it registered.** Listing the schedules shows the parsed expression, the in-process timer state, and the absolute on-disk `scriptPath` you'll need to trigger it.

```bash
hoody --container "$C" exec schedules list
```
**Step 3 — fire it on demand.** `scriptPath` accepts either the absolute path returned in step 2 OR a path relative to the kit's scripts dir (the handler resolves relative paths against `scriptDir`). `force:true` bypasses the `// @token` refusal so you can manually exercise scripts that gate cron-only.

```bash
hoody --container "$C" exec schedules trigger \
  --script-path /hoody/storage/hoody-exec/scripts/default/1/tick.js --force
hoody --container "$C" exec schedules history --limit 5
```
**Stop the schedule** by deleting the script (`scripts.delete?path=tick.js&confirm=true`) or by editing the file to remove the `// @schedule` directive and calling `hoody exec schedules reload`.

### 11. Use the built-in AI — zero setup (no key, no import)

**Goal:** call an LLM from a script with **zero AI boilerplate**. The runtime pre-injects `ai` (`ai.generate` / `ai.stream` / `ai.object`), plus `openai`, `model`, `generateText`, `streamText`, `generateObject` — already wired to **Hoody AI** (`https://ai.hoody.com/api/v1`). You never import anything, set a base URL, or pass an API key — the key auto-defaults to `container-<hash>` (a usage-tracking tag, not auth). Default model is **`hoody-ai/hoody-free`**, the free tier — no wallet credit needed, so the script below works on a brand-new account with `ai_limit: "0.00"`. Override per-script with `// @ai-model <provider/model>` **only when you need a paid catalog model and have confirmed the wallet has AI credit**, and set a system prompt with a sibling `summarize.system.md`.

**Step 1 — write the script. The only "AI" line is `ai.generate(...)`.** (Read query params from `metadata.query`, not `req.query`.)

```bash
SUM=$(cat <<'JS'
// @description One-line summary via built-in Hoody AI (no key/setup, free model by default)
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

For structured output use `ai.object({ schema, prompt })` (Zod), and to stream just `return (await ai.stream(prompt)).textStream`.

## Reference

### `hoody exec` (66) — Script execution and templates

| Command | Aliases | Category | Summary | SDK Link | Example |
|---------|---------|----------|---------|----------|---------|
| `hoody exec health` |  | read | Health Check | `exec.health.check` | `hoody exec health` |
| `hoody exec logs clear` |  | destructive | Clear Logs | `exec.logs.clear` | `hoody exec logs clear --file /home/user/file.txt --type default --older-than-days <older_than_days> --confirm <confirm>` |
| `hoody exec logs list` |  | read | List Logs | `exec.logs.list` | `hoody exec logs list --type default --limit 10` |
| `hoody exec logs read` |  | read | Read Log | `exec.logs.read` | `hoody exec logs read --file /home/user/file.txt --execution-id abc-123 --lines 100 --tail --search "my search"` |
| `hoody exec logs search` |  | read | Search Logs | `exec.logs.search` | `hoody exec logs search --query "my search" --regex <regex> --files <files> --limit 1000 --case-sensitive` |
| `hoody exec logs stream` |  | read | Stream Logs | `exec.logs.stream` | `hoody exec logs stream --file /home/user/file.txt --follow <follow>` |
| `hoody exec magic-comments bulk-update` |  | write | Bulk Update Magic Comments | `exec.magic.bulkUpdate` | `hoody exec magic-comments bulk-update --directory /home/user/src --exec-id abc-123 --comments <comments> --extension .ts --recursive --dry-run` |
| `hoody exec magic-comments read` |  | read | Read Magic Comments | `exec.magic.read` | `hoody exec magic-comments read --path /home/user/file.txt` |
| `hoody exec magic-comments schema` |  | read | Get Magic Comments Schema | `exec.magic.getSchema` | `hoody exec magic-comments schema` |
| `hoody exec magic-comments update` |  | write | Update Magic Comments Handler | `exec.magic.updateHandler` | `hoody exec magic-comments update --path /home/user/file.txt --comments <comments> --dry-run` |
| `hoody exec namespaces list` |  | read | List All Exec Ids | `exec.ids.list` | `hoody exec namespaces list` |
| `hoody exec open` |  | action | Open the Exec kit service (script runner UI) in your browser |  | `hoody exec open [index] [--url]` |
| `hoody exec openapi generate` |  | action | Generate User Open A P I | `exec.openapi.generate` | `hoody exec openapi generate --body '{}'` |
| `hoody exec openapi merge` |  | write | Merge Open A P I Specs | `exec.openapi.merge` | `hoody exec openapi merge --body '{}'` |
| `hoody exec openapi serve` |  | read | Serve Generated Spec | `exec.openapi.serve` | `hoody exec openapi serve --dir scripts --directory /home/user/src --format json --subdomain my-app --exec-id abc-123` |
| `hoody exec openapi serve-schema` |  | read | Serve Schema File | `exec.openapi.serveSchema` | `hoody exec openapi serve-schema --file /home/user/file.txt --path /home/user/file.txt` |
| `hoody exec packages add-modules` |  | write | Install Dependencies | `exec.dependencies.install` | `hoody exec packages add-modules --modules <modules> --force` |
| `hoody exec packages check` |  | read | Check Dependencies | `exec.dependencies.check` | `hoody exec packages check --code <code> --modules <modules>` |
| `hoody exec packages compare` |  | read | Compare Packages | `exec.package.compare` | `hoody exec packages compare --body '{}'` |
| `hoody exec packages install` |  | write | Install Packages | `exec.package.install` | `hoody exec packages install --packages <packages> --dev --save --force` |
| `hoody exec packages json init` |  | write | Init Package Json | `exec.package.initJson` | `hoody exec packages json init --name hoody-exec-project --version 1.0.0 --description "Hoody Exec project" --force` |
| `hoody exec packages json read` |  | read | Read Package Json | `exec.package.readJson` | `hoody exec packages json read` |
| `hoody exec packages json update` |  | write | Update Package Json | `exec.package.updateJson` | `hoody exec packages json update --dependencies <dependencies> --scripts <scripts> --remove <remove>` |
| `hoody exec packages list` |  | read | List Bundled Dependencies | `exec.dependencies.listBundled` | `hoody exec packages list` |
| `hoody exec packages pin` |  | write | Pin Versions | `exec.package.pinVersions` | `hoody exec packages pin --packages <packages>` |
| `hoody exec routes discover` |  | read | Discover Routes | `exec.route.discover` | `hoody exec routes discover --base-dir <base_dir> --include-metadata` |
| `hoody exec routes resolve` |  | read | Resolve Route | `exec.route.resolve` | `hoody exec routes resolve --body '{}'` |
| `hoody exec routes test` |  | read | Test Route | `exec.route.test` | `hoody exec routes test --body '{}'` |
| `hoody exec schedules history` |  | read | Schedule History | `exec.schedules.scheduleHistory` | `hoody exec schedules history --script-path /home/user/file.txt --since 2026-01-01T00:00:00Z --limit 100 --include-rotated` |
| `hoody exec schedules list` |  | read | List Schedules | `exec.schedules.listSchedules` | `hoody exec schedules list` |
| `hoody exec schedules reload` |  | action | Reload Schedules | `exec.schedules.reloadSchedules` | `hoody exec schedules reload --dry-run` |
| `hoody exec schedules trigger` |  | action | Trigger Schedule | `exec.schedules.triggerSchedule` | `hoody exec schedules trigger --script-path /home/user/file.txt --force` |
| `hoody exec scripts delete` |  | destructive | Delete Script | `exec.scripts.delete` | `hoody exec scripts delete --path /home/user/file.txt --confirm <confirm> --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts list` |  | read | List Scripts (system scripts only — see `scripts list-user` for user scripts) | `exec.scripts.list` | `hoody exec scripts list --dir <dir> --filter <filter> --metadata '{}' --label my-label --tags "tag1,tag2" --mode stable --enabled true --websocket <websocket> --recursive true --include-comments <include_comments> --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts list-user` |  | read | List User Scripts | `exec.openapi.listScripts` | `hoody exec scripts list-user --directory scripts --dir <dir> --subdomain my-app --exec-id abc-123` |
| `hoody exec scripts move` |  | write | Move Script | `exec.scripts.move` | `hoody exec scripts move --exec-id abc-123 --subdomain my-app --from <from> --to <to> --overwrite` |
| `hoody exec scripts performance` |  | read | Get Script Performance | `exec.monitor.getScriptPerformance` | `hoody exec scripts performance --body '{}'` |
| `hoody exec scripts read` |  | read | Read Script | `exec.scripts.read` | `hoody exec scripts read --path /home/user/file.txt --exec-id abc-123 --subdomain my-app` |
| `hoody exec scripts tree` |  | read | Get Script Tree | `exec.scripts.getTree` | `hoody exec scripts tree --exec-id abc-123 --subdomain my-app --base-dir <base_dir> --max-depth 10 --include-metadata` |
| `hoody exec scripts write` |  | write | Write Script | `exec.scripts.write` | `hoody exec scripts write --exec-id abc-123 --subdomain my-app --path /home/user/file.txt --content "Hello" --create-dirs --validate` |
| `hoody exec sdks delete` |  | destructive | Delete S D K | `exec.sdk.delete` | `hoody exec sdks delete --id abc-123` |
| `hoody exec sdks get` |  | read | Get S D K | `exec.sdk.get` | `hoody exec sdks get --id abc-123` |
| `hoody exec sdks import` |  | write | Import S D K | `exec.sdk.importSDK` | `hoody exec sdks import --exec-id abc-123 --source-url https://example.com --source-auth <source_auth> --middleware <middleware> --magic-comments <magic_comments> --force` |
| `hoody exec sdks list` |  | read | List S D Ks | `exec.sdk.list` | `hoody exec sdks list` |
| `hoody exec state clear` |  | destructive | Clear Shared State | `exec.state.clear` | `hoody exec state clear --hostname example.com --path /home/user/file.txt --clear-all` |
| `hoody exec state get` |  | read | Get Shared State | `exec.state.get` | `hoody exec state get --hostname example.com --path /home/user/file.txt` |
| `hoody exec state set` |  | write | Set Shared State | `exec.state.set` | `hoody exec state set --hostname example.com --path /home/user/file.txt --value "hello" --merge` |
| `hoody exec system active-requests` |  | read | Get Active Requests | `exec.monitor.getActiveRequests` | `hoody exec system active-requests` |
| `hoody exec system cache-clear` |  | destructive | Clear Cache | `exec.cache.clear` | `hoody exec system cache-clear --hostname example.com --script-path /home/user/file.txt --clear-vm --clear-state --clear-all` |
| `hoody exec system prometheus` |  | read | Prometheus Export | `exec.monitor.prometheusExport` | `hoody exec system prometheus` |
| `hoody exec system restart` |  | destructive | Restart Server | `exec.system.restartServer` | `hoody exec system restart --graceful --drain-timeout-ms 5000 --reason "API restart request"` |
| `hoody exec system restart-status` |  | read | Get Restart Status | `exec.system.getRestartStatus` | `hoody exec system restart-status` |
| `hoody exec system stats` |  | read | Get Stats | `exec.monitor.getStats` | `hoody exec system stats` |
| `hoody exec templates create` | new, add | write | Create Custom Template | `exec.templates.createCustom` | `hoody exec templates create --body '{}'` |
| `hoody exec templates delete` |  | destructive | Delete Custom Template | `exec.templates.deleteCustom` | `hoody exec templates delete --name my-resource` |
| `hoody exec templates generate` |  | action | Generate From Template | `exec.templates.generate` | `hoody exec templates generate --name my-resource --variables <variables> --output-path /home/user/file.txt --save-file` |
| `hoody exec templates list` |  | read | List Templates | `exec.templates.list` | `hoody exec templates list --category general --include-builtin --include-custom` |
| `hoody exec templates preview` |  | read | Preview Template | `exec.templates.preview` | `hoody exec templates preview --name my-resource --variables <variables>` |
| `hoody exec templates update` |  | write | Update Custom Template | `exec.templates.updateCustom` | `hoody exec templates update --name my-resource --code <code>` |
| `hoody exec validate dependencies` |  | read | Validate Dependencies | `exec.validate.validateDependencies` | `hoody exec validate dependencies --code <code>` |
| `hoody exec validate magic-comments` |  | read | Validate Magic Comments | `exec.validate.validateMagicComments` | `hoody exec validate magic-comments --code <code>` |
| `hoody exec validate return-type` |  | read | Validate Return Type | `exec.validate.validateReturnType` | `hoody exec validate return-type --type-definition <type_definition> --value "hello"` |
| `hoody exec validate script` |  | read | Validate Script | `exec.validate.validateScript` | `hoody exec validate script --code <code>` |
| `hoody exec validate syntax` |  | read | Validate Syntax | `exec.validate.validateSyntax` | `hoody exec validate syntax --code <code>` |
| `hoody exec validate types` |  | read | Validate Type Script | `exec.validate.validateTypeScript` | `hoody exec validate types --code <code>` |
| `hoody exec validate user-schema` |  | read | Validate User Schema | `exec.openapi.validateSchema` | `hoody exec validate user-schema --body '{}'` |

