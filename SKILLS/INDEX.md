> _**routing manifest (full INDEX with routing-hints appendix, on-demand)** · ~9,218 tokens · hoody-sdk v1.0.0-beta.16_

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
the URL IS bearer for every kit (`files`, `sqlite`, `exec`, `terminal`, `display`, `notifications`, `agent`, `bot`, …);
gate a kit URL with proxy permissions.
No kit (including `agent`) requires `X-Hoody-Container-Claim` / `X-Hoody-Token` headers. Realm-scoped: prepend
`{realmId}.` to the API host. **Full reference**: <https://hoody.com/SKILLS/SKILL-SDK.md> § Auth model
· <https://docs.hoody.com/concepts/security/> · <https://docs.hoody.com/concepts/proxy/>

---

## display — programmatic GUI desktops (screenshots, input, windows)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/display.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/display.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/display.md>
- **Docs**: <https://docs.hoody.com/kit/displays/>
- **Concepts**: <https://docs.hoody.com/concepts/everything-is-a-url/> (display-N kit URL)

```ts
// Screenshot display :1, then click + type
const shot = await box.display.screenshots.capture({ base64: true, displayId: 1 });
await box.display.input.click({ x: 640, y: 360, button: 1 }, { displayId: 1 });
await box.display.input.type({ x: 640, y: 360, text: 'hello' }, { displayId: 1 });
```

**Ops**: `screenshots.{get, list, capture, getLatest}` · `thumbnails.{capture, getLatest, get}` · `input.{click, type, drag, select, act, wait, actMany, reset}` · `mouse.*` · `keyboard.*` · `windows.*` · `clipboard.{get, set}`
**Gotcha**: needs a persistent terminal session with `display: ":N"` to render — ephemeral terminals strip `DISPLAY`. Pair `terminal_id=N` ↔ `display=:N` ↔ URL `display-N`.

---

## files — container filesystem over HTTP, with Git-like change history

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/files.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/files.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/files.md>
- **Docs**: <https://docs.hoody.com/kit/files/>
- **Concepts**: <https://docs.hoody.com/foundation/containers/copy-sync/> (cross-host paths) · <https://docs.hoody.com/foundation/storage/>

```ts
// Read (plain values: readText → string, readJson → parsed, readBytes → Uint8Array), write, time-travel
const text = await box.files.readText('/etc/hostname');
await box.files.upload('/home/user/hello.txt', Buffer.from('hello'));   // the body is bytes
const old = await box.files.get('/home/user/hello.txt', { revision: 12 });   // history
const diff = await box.files.get('/home/user/hello.txt', { diff: '', from_seq: 12 });  // `diff` is a valueless flag: pass ''
```

**Client-level helper** (built on files): `box.agent.importLocalConfig(tool, opts)` pushes a
local agent CLI's config/credentials (`codex`/`claude`/`opencode`/`gemini`) into the
container — pairs with the dev-kit AI CLIs. See SDK core-ops § "Sync agent config".

**Ops**: `files.{get, upload, update, delete, move, copy, glob, grep, stat, mkdir, touch, append, writeChunk, chmod, chown, zip, exists}` · `mounts.{create, list, get, update, delete}` (remote-backend FUSE mounts) · `journal.{list, flush, getStats}` (mutation log)
**Gotcha**: paths are absolute container paths. Remote backends (`?backend=…`) work only where the deployment enables remote backends. Journal records local-FS only; remote-backend ops aren't replayable.

---

## terminal — persistent PTY sessions over HTTP/WS

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/terminal.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/terminal.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/terminal.md>
- **Docs**: <https://docs.hoody.com/kit/terminals/>

```ts
// One-off command (ephemeral) — on the terminal-0 host; the host index is the session
await box.terminal.commands.run({ command: 'uname -a' }, { ephemeral: true }, { serviceIndex: 0 });
// Persistent session
await box.terminal.sessions.create({ terminal_id: '1', shell: 'bash', user: 'user' });
await box.terminal.commands.run({ command: 'cd /home/user && ls' }, { terminal_id: '1' });
```

**Ops**: `sessions.{create, list, delete, read, write}` · `commands.{run, get, list, cancel}` · WS stream
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
const r = await box.exec.run('build');  // r: ApiResponse<unknown> — body in r.data
```

**Ops**: `scripts.{write, read, list, delete}` · `exec.run` · auto-mount at `{kit-url}/<bare-path>`
**Gotcha**: a script is top-level code with `req`/`res` injected (the canonical form, `return` works) or a `module.exports = (req, res) => …` handler; `export default` forms are normalised at load time. Multi-segment routes (`api/build`) work through the accessor — separators are preserved; `.`/`..` segments are rejected.

---

## sqlite — SQL transactions, JSON KV, time-travel history

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/sqlite.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/sqlite.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/sqlite.md>
- **Docs**: <https://docs.hoody.com/kit/sqlite/>

```ts
await box.sqlite.kv.set('user:42', { name: 'Ada' }, {   // objects are JSON-encoded by the SDK
  db: '/hoody/databases/app.db', create_db_if_missing: true,
});
const r = await box.sqlite.kv.get('user:42', { db: '/hoody/databases/app.db' });  // JSON value → decoded object in r.data
// One statement, plain values: query → { rows, columns, truncated }; run → { rowsUpdated }
await box.sqlite.sql.run({ db: 'app', create_db_if_missing: true, sql: 'CREATE TABLE IF NOT EXISTS t (v INTEGER)' });
const { rows } = await box.sqlite.sql.query({ db: 'app', sql: 'SELECT v FROM t WHERE v > ?', params: [0] });
// Multi-statement transaction (body = statements, options = db). Prefer `statement`
// for writes and `query` for SELECTs. SQL producing columns returns resultSet under either item kind.
await box.sqlite.sql.runTransaction(
  { transaction: [
    { statement: 'CREATE TABLE IF NOT EXISTS t (v INTEGER)' },
    { statement: 'INSERT INTO t (v) VALUES (?)', values: [1] },
    { query: 'SELECT count(*) AS n FROM t' },
  ] },
  { db: '/hoody/databases/app.db' },
);
```

**Ops**: `kv.{set, get, delete, increment, decrement, push, pop, rollback, getSnapshot}` · `sql.{query, run, runTransaction, queryReadOnly}` · `databases.{create, list, delete}` · `history.{list, getStats}` · TTL · JSON-path
**Gotcha**: keyed by the `db` query param, which every call needs: a bare name (`app` resolves to `/hoody/databases/app.db`) or an absolute path under `/hoody/databases` (other absolute paths are refused unless the deployment allows them). KV `get` over HTTP returns the stored bytes raw (no envelope); the SDK's default response mode decodes a JSON value into `r.data` (pass `responseType: 'text'` to get the string).

## browser — Chromium/Firefox automation with a stealth (anti-fingerprint) mode

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/browser.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/browser.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/browser.md>
- **Docs**: <https://docs.hoody.com/kit/browser/>

```ts
// The browser-N kit host picks the instance (default browser-1); a `browser_id` option picks it too.
await box.browser.instances.start();
await box.browser.page.navigate({ url: 'https://example.com' });
const snap = await box.browser.page.getSnapshot();   // accessibility tree with [ref=eN] markers
const shot = await box.browser.page.captureScreenshot({ format: 'png' });
const val = await box.browser.page.evaluate({ script: 'document.title' });
// A second, separate browser: pass the host index as _templateVars (the browser-2 host).
await box.browser.page.navigate({ url: 'https://example.org' }, {}, { serviceIndex: 2 });
```

**Ops**: `instances.{start, stop, restart, get, shutdown, getDevtoolsUrls}` · `page.{navigate, evaluate, captureScreenshot, getSnapshot, act, wait, getHtml, getText, exportPdf}` · `cookies.{list, setMany, clear}` · `history.{list, clear}` · `logs.{listConsole, listNetwork}` · CDP via `instances.getDevtoolsUrls`
**Gotcha**: each long-lived browser is its own `browser-N` host (`_templateVars.serviceIndex` or `browser_id` in the SDK); a `browser_id` that names another instance than the host is refused with 400 `INSTANCE_SELECTOR_CONFLICT`. The browser is headful by default. `stealth=true` switches to the anti-fingerprint engine. Chromium ships `webSocketDebuggerUrl` ON by default.

## code — VS Code in a browser tab (and as an iframable single-extension surface)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/code.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/code.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/code.md>
- **Docs**: <https://docs.hoody.com/kit/code/>

```ts
// Open the full IDE — just visit the URL (iframable):
const url = `https://${P}-${C}-code-1.${N}.containers.hoody.com/`;
// Extension-only embed (no IDE chrome) — e.g. Cline-as-a-service:
const cline = `${url}?extension=saoudrizwan.claude-dev`;
// Programmatic: install/list extensions.
await box.code.extensions.install({ url: 'https://example.com/claude-dev.vsix' });
```

**Ops**: `extensions.{install, list}` · `ui.*` (editor page and assets) · `kit.{getHealth, getStatus, getVersion}`
**Gotcha**: this is mainly a *URL*, not an API. The methods configure the editor; day-to-day use is "open the URL". Multiple `code-N` instances run side-by-side for parallel extensions.

## cron — managed crontab(1) entries per system user

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/cron.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/cron.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/cron.md>
- **Docs**: <https://docs.hoody.com/kit/cron/>

```ts
// The system user is the first argument; the entry is the second.
await box.cron.entries.create('user', {
  name: 'nightly-build',
  schedule: '0 3 * * *', command: 'bash /home/user/build.sh',
  // optional; RFC 3339, must be in the future (here: 30 days from now)
  expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
});
const list = await box.cron.entries.list('user');
```

**Ops**: `entries.{create, list, get, update, delete}` (UUID-keyed managed entries) · `crontabs.{list, get, set}` (the raw crontab text)
**Gotcha**: each managed entry is an ordinary cron line with a `# hoody-cron:` metadata comment above it carrying its UUID; hand-written lines in the same crontab are preserved. `expires_at` is optional; once it passes, the kit drops the entry from the crontab.

## curl — full HTTP client gateway + REST-as-GET-URL bridge

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/curl.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/curl.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/curl.md>
- **Docs**: <https://docs.hoody.com/kit/curl/>

**When to reach for it:** any time the caller can **only fetch a URL** — a fetch-only client (the claude.ai web-fetch UI), a webhook/CRM field that takes a link, an `<img src>`/`<a href>`, an RSS scheduler, an LLM tool with web-search-only access. It turns *any* HTTP call (to any API, or to Hoody's own control plane via `&bearer_token=`) into one GET-able URL. (Extends to any use case — it's a general HTTP client gateway with sessions, async jobs, and schedules.)

```ts
// The SDK always sends the POST executor: `curl.run` executes the request and returns the envelope.
// (The GET-URL form of the bridge is a plain HTTP route, `GET …/api/v1/curl/request?url=<enc>&json=<enc>&header=…`;
// the SDK has no method for it.)
const r = await box.curl.run({
  url: 'https://api.example.com/foo',
  method: 'POST',
  json: { hello: 'world' },                          // raw body via `data`, form via `form`
  headers: { Authorization: 'Bearer XYZ' },
});
```

**Ops**: `curl.run` · `jobs.{list, get, cancel, delete, getResult, stream}` · `sessions.*` (cookie jars) · `schedules.*` · `storage.*`
**Gotcha**: the killer feature is the GET-URL bridge — any environment that can only issue GETs (browser tab, webhook URL field, LLM web-fetch tool) can do arbitrary HTTP — **including POST/PUT with a body + headers** (`data`/`json`/`data_base64` + repeatable `header=`) — via this kit.

## daemon — supervised program lifecycle (default for "spawn a process")

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/daemon.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/daemon.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/daemon.md>
- **Docs**: <https://docs.hoody.com/kit/daemons/>

```ts
// Ephemeral: launch + capture logs
const r = await box.daemon.ephemeralPrograms.start({
  command: 'python build.py', user: 'user', wait: true, timeout: 60,
});
const logs = await box.daemon.ephemeralPrograms.getLogs(r.data!.temporary_id);
// Durable: registered program (persists across kit restarts)
const prog = await box.daemon.programs.create({
  name: 'webhook-server', command: 'node server.js', user: 'user',
  enabled: true, boot: true, autorestart: 'unexpected',
});
await box.daemon.programs.start(prog.data!.id!, { wait: true });  // start takes a numeric program id
```

**Ops**: `ephemeralPrograms.{start, getLogs, stop}` · `programs.{create, list, get, update, delete}` · `programs.{start, stop, enable, disable}` · `programs.{getStatus, getLogs}` · port-range fan-out · lazy-load
**Gotcha**: prefer `ephemeralPrograms` for one-offs (temporary configuration and tracking are written, then cleaned up), `programs` when the process should survive container restarts. Logs always persist even after the process exits.

## pipe — zero-storage streaming HTTP rendezvous

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/pipe.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/pipe.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/pipe.md>
- **Docs**: <https://docs.hoody.com/kit/pipe/>

```ts
// Sender:
await fetch(`${pipeUrl}/myfile.bin?n=3`, { method: 'PUT', body: largeBlob });
// Receivers: exactly N of them, each GETting the same URL WITH the same ?n=3 — the transfer
// starts once all 3 have joined; bytes fan out in-memory, no server storage.
const stream = await fetch(`${pipeUrl}/myfile.bin?n=3`);
```

**Ops**: PUT/POST sender, GET receiver, `?n=<count>` fan-out (≤256; sender and every receiver pass the same `n`), `?video` live stream, `?progress` telemetry, `/noscript` browser UI
**Gotcha**: paths exist only while there's a pending sender or receiver. Zero on-disk staging — pure in-memory rendezvous.

## proxyLogs — per-container reverse-proxy request log (read-only)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/proxyLogs.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/proxyLogs.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/proxyLogs.md>
- **Docs**: <https://docs.hoody.com/kit/proxy-logs/>

```ts
// Query historical logs
const logs = await box.proxyLogs.list({
  kind: 'request', method: 'POST', serviceName: 'files', limit: 50,
});
// Live tail via SSE: `proxyLogs.stream` resolves to an async iterable of events.
for await (const ev of await box.proxyLogs.stream({ serviceName: 'files' })) {
  console.log(ev.event, ev.raw);   // ev.raw is the event's data payload
}
// Or poll list() with a numeric cursor:
let afterId: number | undefined;
const page = await box.proxyLogs.list({ serviceName: 'files', afterId });
```

**Ops**: `proxyLogs.{list, getStats, stream}` (SSE) · filter by `kind`/`level`/`method`/`serviceName`/`source`
**Gotcha**: read-only — for write/inspect MITM, use `proxy.hooks` (in the `api` control plane).

## egress — outbound HTTP proxy with a switchable exit IP

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/egress.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/egress.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/egress.md>
- **Docs**: <https://docs.hoody.com/kit/egress/>

```ts
// Set the upstream for requests sent THROUGH the egress proxy. Only clients that use the egress
// proxy URL as their HTTP(S) proxy go through it; other container traffic is not rerouted.
const box = await client.withContainer(container);
await box.egress.upstream.set('socks5h://user:pass@proxy.example:1080');
const now = await box.egress.upstream.get();   // credentials are never returned
await box.egress.upstream.disable();           // back to the container's own IP
```

**Ops**: `upstream.{get, set, disable}` · `kit.getHealth` · four upstream schemes (`socks5h` resolves at the upstream, `socks5` resolves locally, `http`/`https` chain via CONNECT) · `startLocalExit()` / `hoody egress local start` makes your own machine the exit
**Gotcha**: the endpoint authenticates nothing of its own — the container URL IS the credential, so an unguarded egress URL is an open proxy. Set `proxy.containerPermissions` before sharing it. `proxy.hooks` do NOT apply (egress is hook-rejected).

## tunnel — reverse tunnels (ngrok built-in, with proxy/auth/logs/MITM glued in)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/tunnel.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/tunnel.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/tunnel.md>
- **Docs**: <https://docs.hoody.com/kit/tunnel/>

```ts
const box = await hoody.withContainer({ id: C, project_id: P, server: N });
// EXPOSE: publish laptop :3000 at https://${P}-${C}-http-<port>.${N}.containers.hoody.com
const h = await box.tunnel.expose({ containerPort: 0, to: { host: 'localhost', port: 3000 } });
console.log(h.bind.containerPort);
// PULL: let in-container code reach a service on YOUR machine — laptop :5432 appears at container 127.0.0.1:5432
const p = await box.tunnel.pull({ containerPort: 5432, to: { host: 'localhost', port: 5432 } });
```

**Ops**: `box.tunnel.expose` / `pull` / `serve` (HTTP/1.1 + WS, TCP reverse; package-root `tunnelExpose` / `tunnelPull` / `tunnelServe` take an explicit URL) · namespace `tunnel.{bindings.list, sessions.list, sessions.close, list, kit.getMetrics}` · driver-managed long-lived WS
**Gotcha**: tunnels inherit the full proxy stack — `proxy.containerPermissions` gates them, `proxy.hooks` can MITM them, `proxyLogs` captures every request. Friendly aliases via `proxy.aliases` with `program: 'http'` and `index` = the exposed container port (not `program: 'tunnel'`, which is the tunnel kit's own API).

## watch — Linux inotify file-change streams with replay

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/watch.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/watch.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/watch.md>
- **Docs**: <https://docs.hoody.com/kit/watch/>

```ts
const w = await box.watch.watchers.create({
  // globs match the absolute path, so lead with `**/`
  paths: ['/home/user'], include: ['**/*.ts'], exclude: ['**/node_modules/**'],
  coalesce_ms: 100, kinds: ['created', 'modified'],
});
// Paginated history + resume from the last event id you processed
const page = await box.watch.events.list(w.data!.id, { since_id: lastSeen });
// Live stream: an async iterable of events, resumable from since_id
for await (const ev of await box.watch.events.stream(w.data!.id, { since_id: lastSeen })) { /* ev.event, ev.raw */ }
```

**Ops**: `watchers.{create, list, get, update, delete}` · `events.{list, stream, connect}` (SSE/WS) · bounded replay buffer with `since_id` resume
**Gotcha**: bounded in-memory buffer — long disconnects may lose events past the ring. Coalesce window dedupes bursts.

## notifications — desktop toasts inside a container

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/notifications.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/notifications.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/notifications.md>
- **Docs**: <https://docs.hoody.com/api/kit/notification-server/>

```ts
await box.notifications.send({ display: ':1', summary: 'Build done', body: '12 passed' });
const log = await box.notifications.list(':1', { limit: 10 });
// Stream new entries: the wrapper opens only when you call connect()
const stream = await box.notifications.connect({ displays: 'all' });
stream.onNotification(n => console.log(n));
await stream.connect();
```

**Ops**: `notifications.send` (`notify-send`) · `list`/`dismiss`/`restore` (log) · `connect` (WebSocket only) · `icons.get`
**Gotcha**: targets an X display (`DISPLAY=:N`); the kit starts the requested display itself when it is missing, unless display ensuring is turned off. Accepts the bare kit URL — no `X-Hoody-Container-Claim` header needed. Kit slug is `n-{serviceIndex}`.

## notes — collaborative notebooks (nodes, docs, databases)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/notes.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/notes.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/notes.md>
- **Docs**: <https://docs.hoody.com/kit/notes/>

```ts
// identity.get auto-provisions a notebook + a `Home` section + starter pages.
const me = (await box.notes.whoami()).data as any;         // { notebookId, userId, ... }
const sections = await box.notes.nodes.list(me.notebookId, { type: 'section' });
// listed nodes are flat: attributes such as `name` sit at the top level of each node
const home = (sections.data as any).nodes.find((n: any) => n.name === 'Home');
// create takes `parentId` + `attributes`; a page needs name + parentId (cannot be root)
const page = await box.notes.nodes.create(me.notebookId, { type: 'page', parentId: home.id, attributes: { name: 'Day 1' } });
const pageId = (page.data as any).id as string;
// write content via append — the server assigns block id/parentId/index
await box.notes.document.append(me.notebookId, pageId, { type: 'heading1', text: 'Day 1' });
await box.notes.comments.create(me.notebookId, pageId, { content: 'looks good' });
// a database node holds typed columns under attributes.fields; records via `box.notes.records.create(notebookId, databaseId, body)`
const db = await box.notes.nodes.create(me.notebookId, { type: 'database', parentId: home.id, attributes: { name: 'Tasks', fields: { /* … */ } } });
```

**Ops**: `nodes.{create, get, list, update, delete}` (sections/pages/channels/messages/databases/records) · `document.{get, set, update, append}` · `records.{create, list, get, update, delete, search}` · `comments.*` · `reactions.*` · `versions.*` · `collaborators.*` · `files.uploads.*` (TUS attachments) · WS mutation feed
**Gotcha**: hierarchical — every node has a `parentId` chain; pages need a parent (use the auto-created `Home` section). Documents attach only to `page`/`record` nodes. To write a doc prefer `document.append` (server assigns block id/parentId/index); building `box.notes.document.set` blocks by hand requires the real block-type strings and the `attrs` key, and container blocks (lists/tables) hold their text in a child `paragraph`.

## run — resolve apps to shell commands (Hoody Run, cross-source package resolver)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/run.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/run.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/run.md>
- **Docs**: <https://docs.hoody.com/api/run/>

```ts
const r = await box.run.search({ selector: { app: 'firefox', kind: 'any', limit: 5 } });
// r.data → { set_id: '…', total_count, items: [{ candidate_id: '…', provider: 'nix', kind: 'any', shell_command: '…', … }, …] }
const r2 = await box.run.search({ selector: { app: 'owner/repo', source: ['oci'] } });
// Resolve to a command (preview)
const cmd = await box.run.resolve({ app: 'firefox', kind: 'any', pick: 'first' });
```

**Ops**: `run.search`, `run.resolve`, `run.resolveMany`, `run.test` (trusted-list + system-path + nixpkgs + pkgx + AppImage + OCI + manifests) · `profiles.*` · `recipes.*` · `print_curl`
**Gotcha**: returns ranked *candidates* with `shell_command` and a `kind` (`gui`/`cli`/`any`); resolve produces a command + preview, it doesn't launch — pair with `terminal` or `daemon` to actually execute. `set_id` is in `r.data.set_id` and stays valid for 300 s; an index pick (`pick: 'index'` + `pick_index`) from an expired set returns `409 SET_EXPIRED`, while a pick by `candidate_id` falls back to the fresh results (the id is a content hash).

## api — control plane (identity, projects, containers, billing, vault)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/api.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/api.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/api.md>
- **Docs**: <https://docs.hoody.com/foundation/hoody-api/>
- **Concepts**: <https://docs.hoody.com/concepts/realms-projects/> · <https://docs.hoody.com/foundation/wallet/>

```ts
// Auth
await hoody.api.auth.login({ username: 'alex', password: '…' });
// Containers
const cs = await hoody.api.containers.list();
const c = await hoody.api.containers.create(projectId, { server_id, name: 'box-1', hoody_kit: true });
// Auth tokens for headless agents (realm-scoped)
const tok = await hoody.api.auth.tokens.create({ alias: 'agent-x', realm_ids: [realmId] });
// Vault, wallet, rentals, pools, proxy permissions, …
```

**Ops**: `auth.*` (+ `auth.twoFactor.*`, `auth.tokens.*`, `auth.oauth.*`, `auth.device.*`) · `users.*` · `projects.*` · `containers.*` (+ `containers.env.*`) · `snapshots.*` · `network.*` · `firewall.*` · `images.*` · `storage.shares.*` · `proxy.*` (`projectPermissions`, `containerPermissions`, `hooks`, `settings`, `groups`, `services`, `aliases`) · `servers.*` (`plans`, `subscriptions`, `offers`, `reservations`, `jobs`, `commands`) · `wallet.*` · `vault.*` · `pools.*` · `realms.*` · `inbox.*` (account notifications) · `events.*` · `activity.*`
**Gotcha**: realm-scoping — every method accepts `_realm: realmId`, or use `https://{realmId}.api.hoody.com` as `baseURL` to apply globally. This namespace mints the tokens every other namespace depends on.

---

## bot — chat-app control of a container (Telegram first)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/bot.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/bot.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/bot.md>
- **Docs**: <https://docs.hoody.com/kit/bot/>

```ts
// Management routes take no account token: the kit URL is the credential, so gate it with proxy permissions.
const reg = await box.bot.registrations.create({ channel: 'telegram', token: telegramBotToken, label: 'ops' });
await box.bot.registrations.start(reg.data.id);  // begin long-polling
```

**Ops**: `registrations.{create, list, get, start, stop, delete, getPolicy, updatePolicy, syncCommands, updateProfile, listLogs, purgeLogs, revokeSession, revokeAllTokens}` · `kit.{getHealth, rotateKeys, getManifest}`
**Gotcha**: like every other kit, holding the URL is enough — management routes ask for no account token, so on an ungated container anyone with the URL can register, start, stop and delete bots. Gate it with proxy permissions. A null user allowlist admits everyone, a null chat allowlist means direct messages only.

## agent — the in-container AI coding agent over HTTP

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/agent.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/agent.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/agent.md>
- **Docs**: <https://docs.hoody.com/kit/agent/>

```ts
// The agent kit is a normal kit — no container claim, no extra auth headers.
const box = await hoody.withContainer(container);
const s = await box.agent.sessions.create({});  // optional `model`; omitted = the agent's pinned model
await box.agent.sessions.turns.run(s.data!.session_id!, { text: 'Refactor src/parser.ts' });
```

**Ops**: `sessions.*` (+ `sessions.turns.{run, create, list, get, cancel}`) · `definitions.*` (agent definitions) · `models.*` · `providers.*` (provider accounts, API keys and OAuth) · `skills.*` (+ `skills.hub.*`) · `memory.*` · `todos.*` · `workflows.*` · `hooks.*` · `github.*` · `tools.*` · `logs.*` (incl. `logs.export`) · `headless.{start, stream}` · `platform.bootstrapToken` (token bootstrap)
**Gotcha**: the agent kit's HTTP edge needs **no** auth headers — **no** `X-Hoody-Container-Claim` / `X-Hoody-Token` and never returns `401 CLAIM_REQUIRED`. The bare `hoody agent` verb opens the in-container Agent TUI over the terminal kit; the `hoody agent sessions|prompt|…` subcommands are this namespace, and the two coexist. `todos.update` CAS uses the **todo's own** `revision` (from `todos.get`), not the store-wide `todos.getRevision`.

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

- **Kit URL IS the credential** (on every kit, `bot` included) — restart does NOT rotate it; only delete+recreate does. To gate access, replace `proxy.containerPermissions` (GET → PUT with `If-Match`) with a document whose groups have program access and whose `default` is `deny`; a group alone restricts nothing.
- **Kit auth is uniform — the URL is the credential.** No kit (including `agent`) needs `X-Hoody-Container-Claim` / `X-Hoody-Token`; every kit accepts the bare per-container URL directly, through the same edge and with no extra headers, `bot` management included; configure proxy permissions to restrict access.
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
  (`proxy.containerPermissions`, `proxy.aliases`). Use `tunnel` only when the
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
    crash) → `daemon` (`programs.create` + `programs.start`).
  - A one-off command, run once → `terminal.commands.run` with `ephemeral=true` when you
    only need the output in the response; `daemon.ephemeralPrograms` when the logs
    should be kept after the process exits.
  - An interactive REPL / TUI / multi-command session → `terminal.sessions`.

- **`browser` vs `display`** — `browser` controls an automation-driven
  browser, headful by default or headless (HTTP rendering); `display` controls the X11 GUI
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
  network config (`api.network.get`) are all real control-plane
  surfaces. Emit `NONE` (abstain) only for genuinely unsupported tasks (e.g. SSO
  provider setup, external DNS management) with no per-container kit and no `api` method.

- **`watch` vs `proxyLogs`** — `watch` streams **filesystem** change events
  (inotify on a path); `proxyLogs` streams **HTTP request** events on the
  container's reverse proxy. Pagination, history, SSE-tail exist in both
  surfaces; pick by what the user is watching: files → `watch`, HTTP → `proxyLogs`.

- **`daemon` logs vs `cron`** — `daemon.programs.getLogs` and
  `daemon.ephemeralPrograms.getLogs` retain stdout/stderr per program.
  `cron` only schedules — it does not capture logs, and its runs are not
  daemon programs. "Show me the log of my scheduled job" → read the file the
  job's command redirects its output to through `files`; `daemon` logs only
  when the job starts a daemon-managed program. With no redirect, past output
  is gone.
<!-- routing-hints-end -->


## Long-tail concept search

For questions outside the 21 namespaces above (SSO, realms vs projects, snapshots,
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
per-namespace `SKILL-{SDK|HTTP|CLI}/<ns>.md` tier-2 pages.
