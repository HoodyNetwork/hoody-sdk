> _**routing manifest (full INDEX with routing-hints appendix; ~7k tokens, on-demand)** · ~7,629 tokens · hoody-sdk v1.0.0-beta.11_

# Hoody — surface index

Hoody is a remote-first computing platform: every workflow runs in account-owned
Linux containers reachable by URL. Three surfaces — typed **SDK** (`hoody-sdk`),
HTTP API at `https://api.hoody.com`, system **CLI** (`hoody`) — share one control plane.

For each namespace below: a one-line purpose, links to the agent-optimized **skill page**
(quick, opinionated, copy-pastable) and the canonical **docs page** (long-form, conceptual),
a representative snippet, and the operation list. Fetch the skill URL for fast tasks;
fetch the docs URL when you need to understand *why*.

**Onboarding a brand-new user?** Fetch **<https://hoody.com/SKILLS/ONBOARDING.md>** and
follow it — a guided playbook (sign-up → first container/workspace → a live website + alias
→ Hoody Exec → a GUI app) that adapts to whether the user is technical. **Stuck on a
"how do I…"?** Ask the public docs assistant: `POST https://chatbot.hoody.com/mcp` (no auth;
JSON-RPC tool `search_hoody_docs`, answers with cited URLs) or the `POST /api/chat` SSE fallback.

## Auth & kit URLs (read once, applies everywhere)

A bearer token authenticates against `https://api.hoody.com`. Per-container **kit URLs**
of shape `https://{P}-{C}-{slug}-{n}.{N}.containers.hoody.com` are themselves the credential —
the URL IS bearer for every kit (`files`, `sqlite`, `exec`, `terminal`, `display`, `notifications`, `agent`, …).
No kit (including `agent`) requires `X-Hoody-Container-Claim` / `X-Hoody-Token` headers — every kit
accepts the bare per-container URL directly. Realm-scoped: prepend
`{realmId}.` to the API host. **Full reference**: <https://hoody.com/SKILLS/SKILL-SDK.md#auth-model>
· <https://docs.hoody.com/concepts/security/> · <https://docs.hoody.com/concepts/proxy/>

---

## display — programmatic GUI desktops (screenshots, input, windows)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/display.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/display.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/display.md>
- **Docs**: <https://docs.hoody.com/kit/displays/>
- **Concepts**: <https://docs.hoody.com/concepts/everything-is-a-url/> (display-N kit URL)

```ts
// Screenshot display :1, then click + type
const shot = await box.display.screenshots.capture({ base64: true, displayId: 1 });
await box.display.input.clickAt({ x: 640, y: 360, button: 1 }, { displayId: 1 });
await box.display.input.typeAt({ x: 640, y: 360, text: 'hello' }, { displayId: 1 });
```

**Ops**: `screenshots.{capture, captureMetadata, getLatest, getByTimestamp}` · `thumbnails.{capture, getLatest}` · `input.{clickAt, typeAt, mouseMove, drag, select, mouseScroll, keyboardKey, windowFocus, windowSearch, windowGeometry, windowActive, reset}` · `display.{listWindows, getWindowProperties, getClipboard, setClipboard}`
**Gotcha**: needs a persistent terminal session with `display: ":N"` to render — ephemeral terminals strip `DISPLAY`. Pair `terminal_id=N` ↔ `display=:N` ↔ URL `display-N`.

---

## files — container filesystem over HTTP, with Git-like change history

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/files.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/files.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/files.md>
- **Docs**: <https://docs.hoody.com/kit/files/>
- **Concepts**: <https://docs.hoody.com/foundation/containers/copy-sync/> (cross-host paths) · <https://docs.hoody.com/foundation/storage/>

```ts
// Read, write, time-travel
const r = await box.files.get('/etc/hostname', { responseType: 'text', rawResponse: true });
await box.files.put('/workspace/hello.txt', Buffer.from('hello'));
const old = await box.files.get('/workspace/hello.txt', { revision: 12 });   // history
const diff = await box.files.get('/workspace/hello.txt', { diff: 1, from_seq: 12 });
```

**Client-level helper** (built on files): `box.syncAgentConfig(tool, opts)` pushes a
local agent CLI's config/credentials (`codex`/`claude`/`opencode`/`gemini`) into the
container — pairs with the dev-kit AI CLIs. See SDK core-ops § "Sync agent config".

**Ops**: `files.{get, put, delete, move, copy, listDirectory, glob, grep, stat, operate, append, chmod, chown}` · `mounts.{create, list, getDetails, update, unmount}` (remote-backend FUSE mounts) · `journal.{query, flush}` (mutation log)
**Gotcha**: paths are absolute container paths. Remote backends (`?backend=…`) need `--allow-remote` on the kit. Journal records local-FS only; remote-backend ops aren't replayable.

---

## terminal — persistent PTY sessions over HTTP/WS

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/terminal.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/terminal.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/terminal.md>
- **Docs**: <https://docs.hoody.com/kit/terminals/>

```ts
// One-off command (ephemeral)
await box.terminal.execution.execute({ command: 'uname -a' }, { ephemeral: true });
// Persistent session
await box.terminal.sessions.create({ terminal_id: '1', shell: 'bash', user: 'user' });
await box.terminal.execution.execute({ command: 'cd /workspace && ls' }, { terminal_id: '1' });
```

**Ops**: `sessions.{create, list, delete}` · `execution.execute` · WS stream
**Gotcha**: ephemeral terminals strip `DISPLAY`; use a pinned session for GUI launches. `terminal_id` numeric 1–39999; 40000+ reserved for ephemeral.

---

## exec — micro-services: write any .js/.ts script and it auto-becomes a webhook URL

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/exec.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/exec.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/exec.md>
- **Docs**: <https://docs.hoody.com/kit/exec/>

```ts
// Write → auto-mount → reachable at exec-kit-URL/build
await box.exec.scripts.write({
  path: 'build.js',
  content: 'module.exports = (req, res) => res.json({ ok: true });\n',
});
const r = await box.exec.execution.execute('build');  // r: ApiResponse<unknown> — body in r.data
```

**Ops**: `scripts.{write, read, list, delete}` · `execution.execute` · auto-mount at `{kit-url}/<bare-path>`
**Gotcha**: scripts use CommonJS. Accessor URL-encodes `/`, so multi-segment routes (`api/build`) must be hit by fetching the bare kit URL.

---

## sqlite — SQL transactions, JSON KV, time-travel history

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/sqlite.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/sqlite.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/sqlite.md>
- **Docs**: <https://docs.hoody.com/kit/sqlite/>

```ts
await box.sqlite.kvStore.set('user:42', JSON.stringify({ name: 'Ada' }), {
  db: '/data/app.db', create_db_if_missing: true,
});
const r = await box.sqlite.kvStore.get('user:42', { db: '/data/app.db' });
// Multi-statement transaction + time-travel rollback:
await box.sqlite.database.executeTransaction({ db: '/data/app.db', statements: ['BEGIN', '…', 'COMMIT'] });
```

**Ops**: `kvStore.{set, get, delete, incr, decr, push, pop, rollback, getSnapshot}` · `database.executeTransaction` · `query.executeShareable` · `history.{list, getStats}` · TTL · JSON-path
**Gotcha**: keyed by `db` query param — every call needs an absolute db path. KV `get` returns the body raw (no envelope); JSON-encode/decode yourself.

## browser — Chromium/Firefox automation with a stealth (anti-fingerprint) mode

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/browser.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/browser.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/browser.md>
- **Docs**: <https://docs.hoody.com/kit/browser/>

```ts
const b = await box.browser.instances.start({ stealth: false });
await box.browser.interaction.browse({ browser_id: b.data!.browser_id, url: 'https://example.com' });
const shot = await box.browser.interaction.takeScreenshot({ browser_id: b.data!.browser_id });
const val = await box.browser.interaction.evalGet({ browser_id: b.data!.browser_id, script: 'document.title' });
```

**Ops**: `instances.{start, stop, restart}` · `interaction.{browse, browsePost, takeScreenshot, evalGet, evalPost}` · `page.{getHtml, getText, exportPdf}` · `cookies.{get, set, clear}` · `debugging.{getConsoleLogs, getNetworkLogs}` · CDP via `introspection.getDevtoolsUrl`
**Gotcha**: long-lived browsers keyed by `browser_id`. `stealth=true` switches to the anti-fingerprint engine. Chromium ships `webSocketDebuggerUrl` ON by default.

## code — VS Code in a browser tab (and as an iframable single-extension surface)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/code.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/code.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/code.md>
- **Docs**: <https://docs.hoody.com/kit/code/>

```ts
// Open the full IDE — just visit the URL (iframable):
const url = `https://${P}-${C}-code-1.${N}.containers.hoody.com/`;
// Extension-only embed (no IDE chrome) — e.g. Cline-as-a-service:
const cline = `${url}?extension=saoudrizwan.claude-dev`;
// Programmatic: install/list extensions, mint path-proxy URLs.
await box.code.extensions.install({ url: 'https://example.com/claude-dev.vsix' });
```

**Ops**: `extensions.{install, list}` · `auth` · `vscode` · `static` · `proxy` · `health`
**Gotcha**: this is mainly a *URL*, not an API. The methods configure the editor; day-to-day use is "open the URL". Multiple `code-N` instances run side-by-side for parallel extensions.

## cron — managed crontab(1) entries per system user

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/cron.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/cron.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/cron.md>
- **Docs**: <https://docs.hoody.com/kit/cron/>

```ts
await box.cron.entries.create({
  user: 'user', name: 'nightly-build',
  schedule: '0 3 * * *', command: 'bash /workspace/build.sh',
  expires_at: '2026-12-31T00:00:00Z',
});
const list = await box.cron.entries.list({ user: 'user' });
```

**Ops**: `entries.{create, list, get, update, delete}` · UUID-keyed, coexists with hand-written lines
**Gotcha**: managed entries are UUID-tagged and carry an `expires_at`; pass it on `create` to bound an entry's lifetime. Hand-written lines outside the managed block are preserved.

## curl — full HTTP client gateway + REST-as-GET-URL bridge

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/curl.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/curl.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/curl.md>
- **Docs**: <https://docs.hoody.com/kit/curl/>

**When to reach for it:** any time the caller can **only fetch a URL** — a fetch-only client (the claude.ai web-fetch UI), a webhook/CRM field that takes a link, an `<img src>`/`<a href>`, an RSS scheduler, an LLM tool with web-search-only access. It turns *any* HTTP call (to any API, or to Hoody's own control plane via `&bearer_token=`) into one GET-able URL. (Extends to any use case — it's a general HTTP client gateway with sessions, async jobs, and schedules.)

```ts
// GET bridge: fire a request from any GET-only environment. The ENTIRE request —
// body AND headers — fits in the query string; supplying a body auto-upgrades GET→POST.
// Bare URL form: …/api/v1/curl/request?url=<enc>&json=<enc>&header=...&bearer_token=…
const r = await box.curl.executeCurlRequestGet({
  url: 'https://api.example.com/foo',
  json: '{"hello":"world"}',              // raw body via `data`, binary via `data_base64`
  header: ['Authorization: Bearer XYZ'],  // string[] (repeatable); a body auto-upgrades to POST
});
// (POST executor `box.curl.execute({...})` remains for multipart/binary `--data-binary @file`.)
```

**Ops**: `curl.{execute, executeCurlRequestGet}` (GET-URL bridge) · `jobs.{list, get, cancel, getResult}` · `sessions.*` (cookie jars) · `schedules.*` · `storage.*`
**Gotcha**: the killer feature is the GET-URL bridge — any environment that can only issue GETs (browser tab, webhook URL field, LLM web-fetch tool) can do arbitrary HTTP — **including POST/PUT with a body + headers** (`data`/`json`/`data_base64` + repeatable `header=`) — via this kit.

## daemon — supervised program lifecycle (default for "spawn a process")

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/daemon.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/daemon.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/daemon.md>
- **Docs**: <https://docs.hoody.com/kit/daemons/>

```ts
// Ephemeral: launch + capture logs
const r = await box.daemon.quickStart.launch({
  command: 'python build.py', user: 'user', wait: true, timeout: 60,
});
const logs = await box.daemon.quickStart.getEphemeralLogs(r.data!.temporary_id);
// Durable: registered program (persists across kit restarts)
const prog = await box.daemon.programs.add({
  name: 'webhook-server', command: 'node server.js', user: 'user',
  enabled: true, boot: true, autorestart: 'unexpected',
});
await box.daemon.control.start(prog.data!.id, { wait: true });   // start takes a numeric program id
```

**Ops**: `quickStart.{launch, getEphemeralLogs, stop}` · `programs.{add, list, get, edit, remove}` · `control.{start, stop, enable, disable}` · `status.{get, getLogs}` · port-range fan-out · lazy-load
**Gotcha**: prefer `quickStart` for one-offs (no config write), `programs` when the process should survive container restarts. Logs always persist even after the process exits.

## pipe — zero-storage streaming HTTP rendezvous

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/pipe.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/pipe.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/pipe.md>
- **Docs**: <https://docs.hoody.com/kit/pipe/>

```ts
// Sender:
await fetch(`${pipeUrl}/myfile.bin?n=3`, { method: 'PUT', body: largeBlob });
// Receivers (up to N): just GET the same URL — bytes fan out in-memory, no server storage.
const stream = await fetch(`${pipeUrl}/myfile.bin`);
```

**Ops**: PUT/POST sender, GET receiver, `?n=<count>` fan-out (≤256), `?video` live stream, `?progress` telemetry, `/noscript` browser UI
**Gotcha**: paths exist only while there's a pending sender or receiver. Zero on-disk staging — pure in-memory rendezvous.

## proxyLogs — per-container reverse-proxy request log (read-only)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/proxyLogs.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/proxyLogs.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/proxyLogs.md>
- **Docs**: <https://docs.hoody.com/kit/proxy-logs/>

```ts
// Query historical logs
const logs = await box.proxyLogs.logs.list({
  kind: 'request', method: 'POST', serviceName: 'files', limit: 50,
});
// Live tail via SSE
// streamLogs returns Promise<ApiResponse<unknown>> — NOT an async iterator, and it
// takes no serviceName. Poll list() with a cursor, or use EventSource on the SSE URL.
let afterId: string | undefined;
const page = await box.proxyLogs.logs.list({ serviceName: 'files', afterId });
```

**Ops**: `logs.{list, getStats, streamLogs}` (SSE) · filter by `kind`/`level`/`method`/`serviceName`/`source`
**Gotcha**: read-only — for write/inspect MITM, use `proxyHooks` (in the `api` control plane).

## tunnel — reverse tunnels (ngrok built-in, with proxy/auth/logs/MITM glued in)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/tunnel.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/tunnel.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/tunnel.md>
- **Docs**: <https://docs.hoody.com/kit/tunnel/>

```ts
import { tunnelExpose, tunnelPull } from 'hoody-sdk';
// EXPOSE: publish laptop :3000 on the container's public domain
const h = await tunnelExpose({ container: containerWsUrl, token, containerPort: 0, to: { host: 'localhost', port: 3000 } });
console.log(h.publicUrl);
// PULL: project container :5432 onto laptop loopback
const p = await tunnelPull({ container: containerWsUrl, token, containerPort: 5432, to: { host: 'localhost', port: 5432 } });
```

**Ops**: top-level helpers `tunnelExpose` / `tunnelPull` / `tunnelServe` (HTTP/1.1 + WS, TCP reverse) · namespace `tunnel.{listBindings, listSessions, listTunnels, killSession, getMetrics, tunnelConnect}` · driver-managed long-lived WS
**Gotcha**: tunnels inherit the full proxy stack — `proxyPermissionsContainer` gates them, `proxyHooks` can MITM them, `proxyLogs` captures every request. Friendly aliases via `proxyAliases`.

## watch — Linux inotify file-change streams with replay

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/watch.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/watch.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/watch.md>
- **Docs**: <https://docs.hoody.com/kit/watch/>

```ts
const w = await box.watch.watchers.create({
  paths: ['/workspace'], include: ['**/*.ts'], exclude: ['node_modules/**'],
  coalesce_ms: 100, kinds: ['created', 'modified'],
});
// Stream events (SSE/WS)
const stream = box.watch.streams.streamSse(w.data!.id, { since_id: lastSeen });
// Or paginated history + resume
const page = await box.watch.streams.listEvents(w.id, { since_id: lastSeen });
```

**Ops**: `watchers.{create, list, get, delete}` · `streams.{listEvents, streamSse, streamWs}` (SSE/WS) · bounded replay buffer with `since_id` resume
**Gotcha**: bounded in-memory buffer — long disconnects may lose events past the ring. Coalesce window dedupes bursts.

## notifications — desktop toasts inside a container

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/notifications.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/notifications.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/notifications.md>
- **Docs**: <https://docs.hoody.com/api/kit/notification-server/>

```ts
await box.notifications.notify.trigger({ display: ':1', summary: 'Build done', body: '12 passed' });
const log = await box.notifications.list(':1', { limit: 10 });
// Stream new entries
const stream = await box.notifications.connectStream({ displays: 'all' });
```

**Ops**: `notify.trigger` (`notify-send`) · `list`/`dismiss` (log) · `connectStream` (WS/SSE) · `icons.get`
**Gotcha**: requires a `DISPLAY=:N` X session (same constraint as `display` kit). Accepts the bare kit URL — no `X-Hoody-Container-Claim` header needed. Kit slug is `n-{serviceIndex}`.

## notes — collaborative notebooks (nodes, docs, databases)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/notes.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/notes.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/notes.md>
- **Docs**: <https://docs.hoody.com/kit/notes/>

```ts
// identity.get auto-provisions a notebook + a `Home` section + starter pages.
const me = (await box.notes.identity.get()).data as any;         // { notebookId, userId, ... }
const sections = await box.notes.nodes.list(me.notebookId, { type: 'section' });
const home = sections.data.nodes.find(n => n.attributes.name === 'Home');
// nodes use `parentId` + `attributes`; a page needs name + parentId (cannot be root)
const page = await box.notes.nodes.create(me.notebookId, { type: 'page', parentId: home.id, attributes: { name: 'Day 1' } });
// write content via append — the server assigns block id/parentId/index
await box.notes.documents.appendDocument(me.notebookId, page.data.id, { type: 'heading1', text: 'Day 1' });
await box.notes.comments.create(me.notebookId, page.data.id, { content: 'looks good' });
// a database node holds typed columns under attributes.fields; records via databases.create
const db = await box.notes.nodes.create(me.notebookId, { type: 'database', parentId: home.id, attributes: { name: 'Tasks', fields: { /* … */ } } });
```

**Ops**: `nodes.{create, get, list, update, delete}` (sections/pages/channels/messages/databases/records) · `documents.{appendDocument, put, patch, get}` · `databases.{create, list, update, delete}` (records) · `comments.*` · `reactions.*` · `versions.*` · `collaborators.*` · `files.tus*` (TUS attachments) · WS mutation feed
**Gotcha**: hierarchical — every node has a `parentId` chain; pages need a parent (use the auto-created `Home` section). Documents attach only to `page`/`record` nodes. To write a doc prefer `documents.appendDocument` (server assigns block id/parentId/index); building `documents.put` blocks by hand requires the real block-type strings and the `attrs` key, and container blocks (lists/tables) hold their text in a child `paragraph`.

## run — resolve apps to shell commands (Hoody Run, cross-source package resolver)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/run.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/run.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/run.md>
- **Docs**: <https://docs.hoody.com/api/run/>

```ts
const r = await box.run.searchCandidates({ app: 'firefox', kind: 'any', limit: 5 });
// → { candidates: [{ source: 'nixpkgs', kind: 'gui', shell_command: '…', set_id: '…' }, …] }
const r2 = await box.run.searchCandidates({ app: 'owner/repo', source: ['oci'] });
// Resolve to a command (preview)
const cmd = await box.run.resolve({ app: 'firefox', kind: 'any', pick: 'first' });
```

**Ops**: `searchCandidates`, `resolve`, `runBatch`, `preflight` (trusted-list + system-path + nixpkgs + pkgx + AppImage + OCI + manifests) · `profiles.*` · `recipes.*` · `print_curl`
**Gotcha**: returns ranked *candidates* with `shell_command` and a `kind` (`gui`/`cli`/`any`); resolve produces a command + preview, it doesn't launch — pair with `terminal` or `daemon` to actually execute. `set_id` is stable across calls.

## api — control plane (identity, projects, containers, billing, vault)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/api.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/api.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/api.md>
- **Docs**: <https://docs.hoody.com/foundation/hoody-api/>
- **Concepts**: <https://docs.hoody.com/concepts/realms-projects/> · <https://docs.hoody.com/foundation/wallet/>

```ts
// Auth
await hoody.api.authentication.login({ username: 'alex', password: '…' });
// Containers
const cs = await hoody.api.containers.list();
const c = await hoody.api.containers.create(projectId, { server_id, name: 'box-1', hoody_kit: true });
// Auth tokens for headless agents (realm-scoped)
const tok = await hoody.api.authTokens.create({ alias: 'agent-x', realm_ids: [realmId] });
// Vault, wallet, rentals, pools, proxy permissions, …
```

**Ops**: `authentication.*` · `tfa.*` · `users.*` · `authTokens.*` · `projects.*` · `containers.*` (incl. snapshot + network-config methods) · `env.*` · `firewall.*` · `images.*` · `storageShares.*` · `proxyPermissionsContainer.*` · `proxyHooks.*` · `proxyAliases.*` · `rentals.*` · `serverRental.*` · `wallet.*` · `vault.*` · `pools.*` · `realms.*` · `notifications.*` (account) · `events.*` · `activity.*`
**Gotcha**: realm-scoping — every method accepts `_realm: realmId`, or use `https://{realmId}.api.hoody.com` as `baseURL` to apply globally. This namespace mints the tokens every other namespace depends on.

---

## agent — the in-container AI coding agent over HTTP

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/agent.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/agent.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/agent.md>
- **Docs**: <https://docs.hoody.com/kit/agent/>

```ts
// The agent kit is a normal kit — no container claim, no extra auth headers.
const box = hoody.withContainer(container);
const s = await box.agent.sessions.create({ model: 'claude-opus-5' });
await box.agent.sessions.prompt(s.data!.id, { text: 'Refactor src/parser.ts' });
```

**Ops**: 21 services — `sessions.*` (create/list/prompt/prompt-stream/tools) · `agents.*` · `models.*` · `providers.*` · `skills.*` · `memory.*` · `todos.*` · `workflows.*` · `hooks.*` · `github.*` · `tools.*` · `logs.*` · `hoody.*` (token bootstrap) · plus a namespace-root `exportLogs`
**Gotcha**: the agent kit's HTTP edge needs **no** auth headers — **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` and never returns `401 CLAIM_REQUIRED`. The bare `hoody agent` verb is a hand-written TUI launcher over the terminal-kit WebSocket; the generated `hoody agent sessions|prompt|…` subcommands are this namespace, and the two coexist. `updateTodo` CAS uses the **todo's own** `revision` (from `getTodo`), not the store-wide `getTodosRevision`.

---

## Mode-blend overview (when to pick SDK vs HTTP vs CLI)

| You're … | Pick | Entry |
|---|---|---|
| TS/JS service or browser app | **SDK** | <https://hoody.com/SKILLS/SKILL-SDK.md> |
| Calling from Python/Rust/Go/… | **HTTP** | <https://hoody.com/SKILLS/SKILL-HTTP.md> |
| Shell / CI / SSH | **CLI** | <https://hoody.com/SKILLS/SKILL-CLI.md> |
| Need a GET-able URL for YOUR OWN logic/handler | **`exec` kit auto-mount** | see `exec` above |
| Drive ANY HTTP / Hoody call from a URL-only client (claude.ai fetch, webhook, `<img src>`) | **`curl` GET-bridge** | see `curl` above |

## Cross-cutting pitfalls (mode-agnostic)

- **Kit URL IS the credential** — restart does NOT rotate it; only delete+recreate does. To gate access, replace `proxyPermissionsContainer` (GET → PUT with `If-Match`).
- **Kit auth is uniform — the URL is the credential.** No kit (including `agent`) needs `X-Hoody-Container-Claim` / `X-Hoody-Token`; every kit accepts the bare per-container URL directly, through the same edge as the other kits and with no extra heaxy.
- **`server_name` is the routable host**, never `subserver_name`.
- **Container ≠ Docker** — full Linux box (systemd, root, ssh, persistent disk).
- **Retryable**: `408 / 425 / 429 / 500 / 502 / 503 / 504`.

<!-- routing-hints-begin -->
## Routing hints (use these to disambiguate)

- **A user-bound port inside the container is automatically reachable** at
  `https://{P}-{C}-http-<port>.{N}.containers.hoody.com` — no namespace call
  needed to "expose" it. If the user asks "how do I reach my app on port N
  from the internet?", the answer is "just use the auto-URL". For policy
  gating (passwords, IP, JWT, hide the URL behind an alias) → `api`
  (`proxyPermissionsContainer`, `proxyAliases`). Use `tunnel` only when the
  user wants to expose something running on **their laptop** to the world
  via the container, not something already running **inside** the container.

- **`tunnel` vs `api`** — tunnel is laptop → container (ngrok-style); api +
  the auto-URL is for code already running in the container.

- **`curl` has built-in scheduling** (`curl.schedules.*`) — for recurring
  HTTP pings/scrapes/webhooks, prefer `curl` over `cron`. Use `cron` when
  the recurring task is a shell command, not an HTTP call.

- **`exec` vs `daemon` vs `terminal`** —
  - One HTTP-callable script you GET to trigger → `exec`.
  - A long-running supervised process (web server, queue worker, restart on
    crash) → `daemon` (`programs.add` + `control.start`).
  - A one-off command, ephemeral, capture output once → `daemon.quickStart`
    (preferred, persists logs) or `terminal.execute(ephemeral)`.
  - An interactive REPL / TUI / multi-command session → `terminal.sessions`.

- **`browser` vs `display`** — `browser` controls a Playwright-driven
  headless browser (HTTP rendering); `display` controls the X11 GUI
  desktop (any GUI app, including a native browser window). If the task
  is "scrape a web page", use `browser`. If it's "click a window in an
  X session", use `display`.

- **`files` vs `pipe`** — `files` writes to the container filesystem
  (persistent, journaled). `pipe` is in-memory zero-storage rendezvous
  for ephemeral bytes that never touch disk. Default to `files`; pick
  `pipe` only if the user explicitly does NOT want storage.

- **`agent` namespace → slug `agent` (`-agent-{index}`)** — anything about
  the in-container AI coding agent over HTTP (sessions, prompting,
  models/providers, MCP tool servers, skills, memory, workflows) routes to
  `agent`. (The Hoody Agent browser GUI on the same `-agent-1` host is the
  human-facing surface over this namespace.)

- **Code-embedded queries (`await box.X.method(...)` or `client.X.method(...)`)
  ALWAYS map to namespace X** — do NOT abstain just because the query has
  no prose. The SDK token is itself the answer.

- **Account/billing/realm/network-config** queries route to **`api`** —
  realms (`api.realms.list`), wallet/billing (`api.wallet.*`), and per-container
  network config (`api.containers.getNetworkConfig`) are all real control-plane
  surfaces. Emit `NONE` (abstain) only for genuinely unsupported tasks (e.g. SSO
  provider setup, external DNS management) with no per-container kit and no `api` method.

- **`watch` vs `proxyLogs`** — `watch` streams **filesystem** change events
  (inotify on a path); `proxyLogs` streams **HTTP request** events on the
  container's reverse proxy. Pagination, history, SSE-tail exist in both
  surfaces; pick by what the user is watching: files → `watch`, HTTP → `proxyLogs`.

- **`daemon` logs vs `cron`** — `daemon.status.getLogs` and
  `daemon.quickStart.getEphemeralLogs` retain stdout/stderr per program.
  `cron` only schedules — it does not capture logs. "Show me the log of my
  scheduled job" → `daemon`.
<!-- routing-hints-end -->


## Long-tail concept search

For questions outside the 19 namespaces above (SSO, realms vs projects, snapshots,
billing, networking model, …), search the canonical docs:
**`POST https://chatbot.hoody.com/api/chat` `{ "message":"..." }` → SSE-streamed answer with cited URLs.**
(Same retrieval + LLM substrate as the docs chat widget; one HTTP call, no tool-call wrapping.)

Or call the **MCP Streamable-HTTP** variant at `https://chatbot.hoody.com/mcp` —
JSON-RPC over POST, one tool `search_hoody_docs(question)`, returns the answer
with cited source URLs in one text block. Same pipeline, agent-friendly framing,
public + unauthenticated. Wire it once into any MCP client (Claude Desktop,
opencode, Cursor) or call raw via `curl` — see `SKILL.lite.md` for one-liner examples.

## Build accuracy over time — remember what worked

When a Hoody call succeeds (correct endpoint + headers + body shape) **or
when you recover from a wrong path** (a hallucinated route, a missing
claim header, the wrong namespace for a fuzzy query), **save it to
memory** under a short tag so the next call is cheap and accurate:

- `[Hoody/api]` — control-plane calls (`api.hoody.com/...`)
- `[Hoody/kit:<name>]` — per-kit URL shape + auth (`terminal`, `display`, `files`, `exec`, `notifications`, …)
- `[Hoody/mcp]` — `chatbot.hoody.com/mcp` (JSON-RPC) or `/api/chat` (SSE)
- `[Hoody/gotcha]` — surprising behaviour, wrong-path corrections

The point of the tag is **grep-findability**. A future agent (or future
you) sees the bracketed prefix in its memory index and jumps to the
verified call shape without re-reading the whole skill. Concrete write
recipes (which fields a memory should record per category) live in the
per-namespace `SKILL-{MODE}/<ns>.md` tier-2 pages.
