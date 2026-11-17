> _**routing manifest (full INDEX with routing-hints appendix, on-demand)** · ~10,631 tokens · hoody-sdk v1.0.1_

# Hoody — surface index

Hoody is a remote-first computing platform: every workflow runs in account-owned
Linux computers reachable by URL. Three surfaces — typed **SDK** (`hoody-sdk`),
HTTP API at `https://api.hoody.com`, system **CLI** (`hoody`) — share one control plane.

For each namespace below: a one-line purpose, links to the agent-optimized **skill page**
(quick, opinionated, copy-pastable) and the canonical **docs page** (long-form, conceptual),
a representative snippet, and the operation list. Fetch the skill URL for fast tasks;
fetch the docs URL when you need to understand *why*.

**Onboarding a brand-new user?** Fetch **<https://hoody.com/SKILLS/ONBOARDING.md>** and
follow it — a guided playbook (sign-up → first computer → a live website + alias
→ Hoody Exec → a GUI app) that adapts to whether the user is technical. **Signing a user
in?** Use browser sign-in: the user approves on Hoody's own page and you never see a password
or need a pasted token — § Login in <https://hoody.com/SKILLS/SKILL-HTTP.md>. **Stuck on a
"how do I…"?** Ask the public docs assistant: `POST https://chatbot.hoody.com/mcp` (no auth;
JSON-RPC tool `search_hoody_docs`, answers with cited URLs) or the `POST /api/chat` SSE fallback.

## Auth & kit URLs (read once, applies everywhere)

A bearer token authenticates against `https://api.hoody.com`. Per-computer **kit URLs**
of shape `https://{P}-{C}-{slug}-{n}.{N}.computers.hoody.com` are the way in for every kit (`files`, `sqlite`, `exec`, `terminal`, `display`, `notifications`, `agent`, …).
Under the default allow policy, the kit URL is sufficient.
When proxy permissions protect a kit, supply the credential required by its authentication group;
in the SDK, configure `kitAuth` on `withComputer()`.
No kit (including `agent`) needs a computer claim. The credential is the one a configured proxy permission asks for; an `exec` script can also require its own token (`// @token`, or `// @remote-token` for remote operations) and answers `401` without a match (see the `exec` skill). Realm-scoped: prepend
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
**Gotcha**: the display APIs need a display that a terminal session (or a `daemon` program with `display`) has started; on a fresh computer they answer `503 DISPLAY_NOT_AVAILABLE` until one exists. Once started, the display keeps running after the session is deleted, so screenshots and input need no open terminal. To launch a GUI app, use a persistent terminal session created with `display: ":N"`, or a `daemon` program with `display: ":N"` when it should be supervised (ephemeral terminals strip `DISPLAY`). Pair `terminal_id=N` ↔ `display=:N` ↔ URL `display-N`.

---

## files — computer filesystem over HTTP, with Git-like change history

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/files.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/files.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/files.md>
- **Docs**: <https://docs.hoody.com/kit/files/>
- **Concepts**: <https://docs.hoody.com/foundation/computers/copy-sync/> (cross-host paths) · <https://docs.hoody.com/foundation/storage/>

```ts
// Read (plain values: readText → string, readJson → parsed, readBytes → Uint8Array), write, time-travel
const text = await box.files.readText('/etc/hostname');
await box.files.upload('/home/user/hello.txt', Buffer.from('hello'));   // the body is bytes
const old = await box.files.get('/home/user/hello.txt', { revision: 1 });   // history: revisions count from 1 for each path; one that does not exist is 404
const diff = await box.files.get('/home/user/hello.txt', { diff: '', from_seq: 1 });  // `diff` is a valueless flag: pass ''
```

**Client-level helper** (built on files): `box.agent.importLocalConfig(tool, opts)` pushes a
local agent CLI's config/credentials (`codex`/`claude`/`opencode`/`gemini`) into the
computer — pairs with the dev-kit AI CLIs. See SDK core-ops § "Sync agent config".

**Ops**: `files.{get, upload, update, delete, move, copy, glob, grep, stat, mkdir, touch, append, writeChunk, chmod, chown, zip, exists}` · `mounts.{create, list, get, update, delete}` (remote-backend FUSE mounts) · `journal.{list, flush, getStats}` (mutation log)
**Gotcha**: paths are absolute computer paths. Remote backends (`?backend=…`) work only where the deployment enables remote backends. Journal records local-FS only; remote-backend ops aren't replayable.

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
**Gotcha**: ephemeral terminals strip `DISPLAY`; launch GUI apps from a pinned session or a `daemon` program with `display`. A new session takes a `terminal_id` of 1–9999, and the proxy refuses any index above 9999. Use 1–1600 for your own sessions: with the default bands 1601–5000 back desktops and agents, ephemeral ids are allocated from 5001–7999, and 8001–9999 is reserved for program terminals.

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

**Ops**: `kv.{set, get, delete, increment, decrement, rollback, getSnapshot}` · `kv.arrays.{push, pop, remove}` · `sql.{query, run, runTransaction, queryReadOnly}` · `databases.{create, list, delete}` · `history.{list, getStats}` · TTL · JSON-path
**Gotcha**: SQL and KV calls select their database with the `db` query param (database creation takes a required `path`, listing an optional `dir`, health checks no selector): a bare name (`app` resolves to `/hoody/databases/app.db`) or an absolute path under `/hoody/databases` (other absolute paths are refused unless the deployment allows them). KV `get` over HTTP returns the stored bytes raw (no envelope); the SDK's default response mode decodes a JSON value into `r.data` (pass `responseType: 'text'` to get the string; a stored object shaped like an envelope, `{ statusCode, data }`, is unwrapped there, so use `kv.read` to get the value as stored).

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
**Gotcha**: each long-lived browser is its own `browser-N` host (`_templateVars.serviceIndex` or `browser_id` in the SDK); a `browser_id` that names another instance than the host is refused with 400 `INSTANCE_SELECTOR_CONFLICT`. The browser is headful by default. Chromium uses anti-fingerprint mode by default (`stealth=true`); Firefox ignores the option. To change a running instance's mode, stop it and start it again with the desired `stealth` value (changing it on a running instance is refused with `409 INSTANCE_BACKEND_MISMATCH`). Chromium ships `webSocketDebuggerUrl` ON by default.

## code — VS Code in a browser tab (and as an iframable single-extension surface)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/code.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/code.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/code.md>
- **Docs**: <https://docs.hoody.com/kit/code/>

```ts
// Open the full IDE — just visit the URL (iframable):
const url = `https://${P}-${C}-code-1.${N}.computers.hoody.com/`;
// Extension-only embed (no IDE chrome) — e.g. Cline-as-a-service:
const cline = `${url}?extension=saoudrizwan.claude-dev`;
// Programmatic: stage an extension for installation at the next code-instance start.
await box.code.extensions.install({ url: 'https://example.com/claude-dev.vsix' });
```

**Ops**: `extensions.{install, list}` · `ui.{getManifest, getFavicon, getRobots, getSecurityPolicy}` (static assets; the editor page is the kit URL itself) · `stop` (stop an editor instance) · `kit.{getHealth, getStatus, getVersion}`
**Gotcha**: this is mainly a *URL*, not an API. The methods configure the editor; day-to-day use is "open the URL". Multiple `code-N` instances run side-by-side for parallel extensions. `extensions.install` only stages a .vsix. Stage it before starting the instance, then use `extensions.list` to confirm installation before opening the `?extension=` URL.

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
// The SDK always sends the POST executor: `curl.run` executes the request and returns the upstream response (the envelope with `response: 'json'`).
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
if (!r.data.temporary_id) throw new Error(r.data.error ?? 'no temporary_id');
const logs = await box.daemon.ephemeralPrograms.getLogs(r.data.temporary_id);
// Durable: registered program (persists across kit restarts)
const prog = await box.daemon.programs.create({
  name: 'webhook-server', command: 'node server.js', user: 'user',
  enabled: true, boot: true, autorestart: 'unexpected',
});
await box.daemon.programs.start(prog.data!.program.id, { wait: true });  // the id is at data.program.id; start takes a numeric program id
```

**Ops**: `ephemeralPrograms.{start, getLogs, stop}` · `programs.{create, list, get, update, delete}` · `programs.{start, stop, enable, disable}` · `programs.{getStatus, getLogs}` · port-range fan-out · lazy-load
**Gotcha**: prefer `ephemeralPrograms` for one-offs (temporary configuration and tracking are written, then cleaned up), `programs` when the process should survive computer restarts. Ephemeral program status and logs stay readable through the daemon API for 10 minutes after the program finishes, then answer 404; the log files stay on disk, so save the output before the window ends or read the files through `files`.

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

**Ops**: PUT/POST sender, GET receiver, `?n=<count>` fan-out (≤256; sender and every receiver pass the same `n`), `?video` browser video player · `?live` live broadcast, `?progress` telemetry, `/noscript` browser UI
**Gotcha**: paths exist only while there's a pending sender or receiver. Zero on-disk staging — pure in-memory rendezvous.

## proxyLogs — per-computer reverse-proxy request log (read-only)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/proxyLogs.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/proxyLogs.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/proxyLogs.md>
- **Docs**: <https://docs.hoody.com/api/proxy-logs/>

```ts
// Query historical logs (the server applies these filters, serviceName included)
const logs = await box.proxyLogs.list({ kind: 'request', method: 'POST', serviceName: 'files', limit: 50 });
for (const e of logs.data?.entries ?? []) console.log(e);
// Live tail via SSE: `proxyLogs.stream` resolves to an async iterable of events.
for await (const ev of await box.proxyLogs.stream({ serviceName: 'files' })) {
  console.log(ev.event, ev.raw);   // ev.raw is the event's data payload
}
// Or poll list() with a numeric cursor:
let afterId: number | undefined;
const page = await box.proxyLogs.list({
  ...(afterId === undefined ? {} : { afterId }),
});
```

**Ops**: `proxyLogs.{list, getStats, stream}` (SSE) · filter by `kind`/`level`/`source`/`serviceName` (`method`, `traceId`, `path` and status on `list` and `getStats`, not on `stream`)
**Gotcha**: read-only — for write/inspect MITM, use the `computers.proxy` hooks (`createHook`, in the `api` control plane).

## egress — outbound HTTP proxy with a switchable exit IP

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/egress.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/egress.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/egress.md>
- **Docs**: <https://docs.hoody.com/kit/egress/>

```ts
// Set the upstream for requests sent THROUGH the egress proxy. Only clients that use the egress
// proxy URL as their HTTP(S) proxy go through it; other computer traffic is not rerouted.
const box = await client.withComputer(computer);
await box.egress.upstream.set('socks5h://user:pass@proxy.example:1080');
const now = await box.egress.upstream.get();   // credentials are never returned
await box.egress.upstream.disable();           // back to the computer's own IP
```

**Ops**: `upstream.{get, set, disable}` · `kit.getHealth` · four upstream schemes (`socks5h` resolves at the upstream, `socks5` resolves locally, `http`/`https` chain via CONNECT) · `startLocalExit({ client, computer })` (SDK, imported from the package root) / `hoody egress local start` (CLI) makes your own machine the exit
**Gotcha**: the endpoint authenticates nothing of its own — the computer URL IS the credential, so an unguarded egress URL is an open proxy. Set `computers.proxy` before sharing it. The `computers.proxy` hooks do NOT apply (egress is hook-rejected).

## tunnel — reverse tunnels (Hoody-native, ngrok-style, with proxy/auth/logs/MITM glued in)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/tunnel.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/tunnel.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/tunnel.md>
- **Docs**: <https://docs.hoody.com/kit/tunnel/>

```ts
const box = await hoody.withComputer({ id: C, project_id: P, server: N });
// EXPOSE: publish laptop :3000 at https://${P}-${C}-http-<port>.${N}.computers.hoody.com
const h = await box.tunnel.expose({ computerPort: 0, to: { host: 'localhost', port: 3000 } });
console.log(h.bind.computerPort);
// PULL: let in-computer code reach a service on YOUR machine — laptop :5432 appears at computer 127.0.0.1:5432
const p = await box.tunnel.pull({ computerPort: 5432, to: { host: 'localhost', port: 5432 } });
```

**Ops**: `box.tunnel.expose` / `pull` / `serve` (HTTP/1.1 + WS, TCP reverse; package-root `exposeTunnel` / `pullTunnel` / `serveTunnel` take an explicit URL) · namespace `tunnel.{bindings.list, sessions.list, sessions.close, list, kit.getMetrics}` · driver-managed long-lived WS
**Gotcha**: an EXPOSE or serve binding is reached through the proxy, so `computers.proxy` gates it, its `computers.proxy` hooks can MITM it and `proxyLogs` records its requests by default (logging can be turned off or filtered); a PULL connection is opened inside the computer (on 127.0.0.1) and passes none of these. Friendly aliases via `proxy.aliases` with `program: 'http'` and `index` = the exposed computer port (not `program: 'tunnel'`, which is the tunnel kit's own API).

## watch — Linux inotify file-change streams with replay

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/watch.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/watch.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/watch.md>
- **Docs**: <https://docs.hoody.com/api/watch/>

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

## notifications — desktop toasts inside a computer

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
**Gotcha**: targets an X display (`DISPLAY=:N`); the kit starts the requested display itself when it is missing, unless display ensuring is turned off. Accepts the bare kit URL. Kit slug is `n` (host segment `n-{serviceIndex}`).

## notes — collaborative notebooks (nodes, docs, databases)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/notes.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/notes.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/notes.md>
- **Docs**: <https://docs.hoody.com/api/notes/>

```ts
// whoami() resolves the current identity and its default notebook (auto-provisioned with a `Home` section + starter pages).
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
const r = await box.run.search({ selector: { app: 'firefox', kind: 'any' }, page_size: 5 });
// r.data → { set_id: '…', total_count, items: [{ candidate_id: '…', provider: 'nix', kind: 'any', shell_command: '…', … }, …] }
const r2 = await box.run.search({ selector: { app: 'owner/repo', source: ['oci'] } });
// Resolve to a command (preview)
const cmd = await box.run.resolve({ app: 'firefox', kind: 'any', pick: 'first' });
```

**Ops**: `run.search`, `run.resolve`, `run.resolveMany`, `run.test` (trusted-list + system-path + nixpkgs + pkgx + AppImage + OCI + manifests) · `profiles.*` · `recipes.*` · `print_curl`
**Gotcha**: returns ranked *candidates* with `shell_command` and a `kind` (`gui`/`cli`/`any`); resolve produces a command + preview, it doesn't launch — pair with `terminal` or `daemon` to actually execute. `set_id` is in `r.data.set_id` and stays valid for 300 s; an index pick (`pick: 'index'` + `pick_index`) naming a `set_id` that is unknown or older than 300 s and is not the freshly resolved set returns `409 SET_EXPIRED`, while a pick by `candidate_id` falls back to the fresh results (the id is a content hash).

## vm — virtual machines inside a computer (QEMU with KVM)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/vm.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/vm.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/vm.md>

```ts
const box = await hoody.withComputer({ id: C, project_id: P, server: N });
const caps = await box.vm.kit.getCapabilities();            // kvm_present: false → every start is refused (KvmUnavailable)
await box.vm.vms.create({ name: 'win', vcpus: 4, memory_mib: 8192, source: { type: 'template', id: T } }); // 202
const vm = await box.vm.vms.get('win');                  // poll progress.phase until committed or failed
const started = await box.vm.vms.start('win');           // 200 = accepted, or refused after acceptance (then read error.error.code); 409/507 refusals throw
```

**Ops**: `box.vm.{vms, snapshots, isos, imports, osinfo, templates, console, events, guestAgent, unidentifiedRuns, kit}`; ISO downloads are `box.vm.isos.downloads`, capabilities `box.vm.kit.getCapabilities()` · ISO and snapshot-import uploads go in parts, in order · `events.stream(name)` / `events.streamAll()` are SSE
**Gotcha**: a start refused after it was accepted (for example `KvmUnavailable`) still answers 200: the refusal is the populated `error`, with its code at `error.error.code`, even while `state` reads `Starting`. A start the VM's state does not allow is refused with 409 (`BadState`, `OperationInProgress`, `Orphaned`), and a share over its quota with 507. A snapshot needs the VM stopped.

## api — control plane (identity, projects, computers, billing, vault)

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/api.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/api.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/api.md>
- **Docs**: <https://docs.hoody.com/foundation/hoody-api/>
- **Concepts**: <https://docs.hoody.com/concepts/realms-projects/> · <https://docs.hoody.com/foundation/wallet/>

```ts
// Auth: browser sign-in (§ Login) — give the user the link + code, poll, adopt the session
const start = await hoody.api.auth.device.start({ client_name: 'my-agent', client: 'agent' });
// Computers
const cs = await hoody.api.computers.list();
const c = await hoody.api.computers.create(projectId, { server_id, name: 'box-1', hoody_kit: true });
// Auth tokens for unattended automation the user asked for (realm-scoped)
const tok = await hoody.api.auth.tokens.create({ alias: 'agent-x', realm_ids: [realmId] });
// Share an agent Bot through a public https://<label>.hoody.bot link, with a key per person
const bu = await hoody.api.botUrls.create({ computer_id: c.data!.id!, bot: { realm, id, uid } });
// Vault, wallet, rentals, pools, proxy permissions, …
```

**Ops**: `auth.*` (+ `auth.twoFactor.*`, `auth.tokens.*`, `auth.oauth.*`, `auth.device.*`) · `users.*` · `projects.*` · `computers.*` (+ `computers.env.*`) · `snapshots.*` · `network.*` · `firewall.*` · `images.*` · `storage.shares.*` · `projects.proxy.*` (permissions, groups) and `computers.proxy.*` (permissions, groups, settings, services, hooks) · `proxy.aliases.*` · `servers.*` (+ `servers.plans.*`, `servers.subscriptions.*`; offers, reservations, jobs and commands are `servers.{listOffers, reserveOffer, getReservation, getJob, listCommands, runCommand}`) · `wallet.*` · `vault.*` · `pools.*` · `realms.*` · `botUrls.*` (+ `botUrls.keys.*`: public URLs and keys for agent Bots) · `inbox.*` (account notifications) · `events.*` · `activity.*`
**Gotcha**: realm-scoping — most methods accept `_realm: realmId` (account-wide ones such as `support` and `auth.sessions` do not), or use `https://{realmId}.api.hoody.com` as `baseURL` to apply it globally. This namespace manages account authentication; kit access uses the kit URL and any credential required by configured proxy permissions.

---

## agent — the in-computer AI coding agent over HTTP

- **Skill**: SDK <https://hoody.com/SKILLS/SKILL-SDK/agent.md> · HTTP <https://hoody.com/SKILLS/SKILL-HTTP/agent.md> · CLI <https://hoody.com/SKILLS/SKILL-CLI/agent.md>
- **Docs**: <https://docs.hoody.com/kit/agent/>

```ts
// The agent kit is a normal kit — no computer claim; proxy permissions apply as to any kit.
const box = await hoody.withComputer(computer);
const s = await box.agent.sessions.create({});  // optional `model`; omitted = the agent's pinned model
await box.agent.sessions.turns.run(s.data!.session_id!, { text: 'Refactor src/parser.ts' });
```

**Ops**: `sessions.*` (+ `sessions.turns.{run, create, list, get, cancel}`) · `definitions.*` (agent definitions) · `models.*` · `providers.*` (provider accounts, API keys and OAuth) · `skills.*` (+ `skills.hub.*`) · `memory.*` · `todos.*` · `workflows.*` · `hooks.*` · `github.*` · `tools.*` · `logs.*` (incl. `logs.export`) · `headless.start` (`{ stream: true }` streams the run as SSE) · `login` (token bootstrap)
**Gotcha**: the agent kit's HTTP edge needs **no** computer claim and has no auth of its own. Under the default allow policy, the kit URL is sufficient. When proxy permissions protect a kit, supply the credential required by its authentication group; in the SDK, configure `kitAuth` on `withComputer()`. The bare `hoody agent` verb opens the Hub, like `hoody hub`; subcommands such as `hoody agent sessions turns run` are this namespace, and the two coexist. `todos.update` CAS uses the **todo's own** `revision` (from `todos.get`), not the store-wide `todos.getRevision`. A Bot (`bots.*`) gets a public URL and keys through `api` (`botUrls`), not through this namespace; see the agent notes, Example 4.

---

## Mode-blend overview (when to pick SDK vs HTTP vs CLI)

| You're … | Pick | Entry |
|---|---|---|
| TS/JS service or browser app | **SDK** | <https://hoody.com/SKILLS/SKILL-SDK.md> |
| Calling from Python/Rust/Go/… | **HTTP** | <https://hoody.com/SKILLS/SKILL-HTTP.md> |
| Web chat, web agent or throwaway sandbox (not a Hoody computer or the user's computer) | **HTTP**; never install or use the CLI here | <https://hoody.com/SKILLS/SKILL-HTTP.md> |
| Shell in a Hoody computer or on the user's own computer | **CLI**; if `command -v hoody` fails, use HTTP | <https://hoody.com/SKILLS/SKILL-CLI.md> |
| Need a GET-able URL for YOUR OWN logic/handler | **`exec` kit auto-mount** | see `exec` above |
| Drive ANY HTTP / Hoody call from a URL-only client (claude.ai fetch, webhook, `<img src>`) | **`curl` GET-bridge** | see `curl` above |

## Cross-cutting pitfalls (mode-agnostic)

- **Kit URL IS the credential** under the default allow policy (on every kit) — restart does NOT rotate it; only delete+recreate does. To gate access, replace `computers.proxy` (GET → PUT with `If-Match`) with a document whose groups have program access and whose `default` is `deny`; a group alone restricts nothing.
- **Kit auth is uniform.** Under the default allow policy, the kit URL is sufficient. When proxy permissions protect a kit, supply the credential required by its authentication group; in the SDK, configure `kitAuth` on `withComputer()`.
- **`server_name` is the routable host**, never `subserver_name`.
- **Computer ≠ Docker** — full Linux box (systemd, root, ssh, persistent disk).
- **Retryable**: `408 / 425 / 429 / 500 / 502 / 503 / 504`.

<!-- routing-hints-begin -->
## Routing hints (use these to disambiguate)

- **A user-bound port inside the computer is automatically reachable** at
  `https://{P}-{C}-http-<port>.{N}.computers.hoody.com` — no namespace call
  needed to "expose" it. If the user asks "how do I reach my app on port N
  from the internet?", the answer is "just use the auto-URL". For policy
  gating (passwords, IP, JWT, hide the URL behind an alias) → `api`
  (`computers.proxy`, `proxy.aliases`). Use `tunnel` for traffic
  between **their laptop** and the computer: EXPOSE a laptop HTTP service to
  the world through the computer, or PULL a laptop TCP service, such as a
  local database, onto the computer's loopback. Do not use it for something
  already running **inside** the computer.

- **`tunnel` vs `api`** — tunnel is laptop → computer (ngrok-style HTTP
  EXPOSE, plus PULL of laptop TCP services into the computer); api +
  the auto-URL is for code already running in the computer.

- **`curl` has built-in scheduling** (`curl.schedules.*`) — for recurring
  HTTP pings/scrapes/webhooks, prefer `curl` over `cron`. Use `cron` when
  the recurring task is a shell command, not an HTTP call.

- **`exec` vs `daemon` vs `terminal`** —
  - One HTTP-callable script you GET to trigger → `exec`.
  - A long-running supervised process (web server, queue worker, restart on
    crash) → `daemon` (`programs.create` + `programs.start`).
  - A one-off command, run once → `terminal.commands.run` with `ephemeral=true` (over HTTP,
    on the `terminal-0` host) when you only need the output in the response; `daemon.ephemeralPrograms` when the logs
    should be kept after the process exits.
  - An interactive REPL / TUI / multi-command session → `terminal.sessions`.

- **`browser` vs `display`** — `browser` controls an automation-driven
  browser, headful by default or headless (HTTP rendering); `display` controls the X11 GUI
  desktop (any GUI app, including a native browser window). If the task
  is "scrape a web page", use `browser`. If it's "click a window in an
  X session", use `display`.

- **`files` vs `pipe`** — `files` writes to the computer filesystem
  (persistent, journaled). `pipe` is in-memory zero-storage rendezvous
  for ephemeral bytes that never touch disk. Default to `files`; pick
  `pipe` only if the user explicitly does NOT want storage.

- **`agent` namespace → slug `agent` (`-agent-{index}`)** — anything about
  the in-computer AI coding agent over HTTP (sessions, prompting,
  models/providers, MCP tool servers, skills, memory, workflows) routes to
  `agent`. (The Hoody Agent browser GUI on the same `-agent-1` host is the
  human-facing surface over this namespace.) Agent Bots (long-lived assistants
  you create, message and follow) are `agent.bots.*` too: see the agent
  namespace notes, Bots section.

- **Share a Bot through a public link** ("public bot link", "give my Bot a URL",
  "let someone talk to my Bot", `hoody.bot`, "Bot key", `hbk_`) — a **Bot URL**:
  `api` (`botUrls`, `botUrls.keys`) creates `https://<label>.hoody.bot` for one agent
  Bot and mints named keys; a caller needs only the URL and a key (`BotUrlClient` in
  the SDK, `hoody boturls ask <url> "…"`, or plain HTTPS). It is not `agent` (the
  agent serves the Bot, it does not publish it) and not `proxy.aliases` (those name
  a computer's ports). Worked example: `agent` notes, Example 4; the `## Bot URLs`
  appendix section is the caller reference.

- **Code-embedded queries (`await box.X.method(...)` or `client.X.method(...)`)
  ALWAYS map to namespace X** — do NOT abstain just because the query has
  no prose. The SDK token is itself the answer.

- **Account/billing/realm/network-config** queries route to **`api`** —
  realms (`api.realms.list`), wallet/billing (`api.wallet.*`), and per-computer
  network config (`api.network.get`) are all real control-plane
  surfaces. Emit `NONE` (abstain) only for genuinely unsupported tasks (e.g. SSO
  provider setup, external DNS management) with no per-computer kit and no `api` method.

- **`watch` vs `proxyLogs`** — `watch` streams **filesystem** change events
  (inotify on a path); `proxyLogs` streams **HTTP request** events on the
  computer's reverse proxy. Pagination, history, SSE-tail exist in both
  surfaces; pick by what the user is watching: files → `watch`, HTTP → `proxyLogs`.

- **`daemon` logs vs `cron`** — `daemon.programs.getLogs` reads a
  registered program's stdout/stderr. `daemon.ephemeralPrograms.getLogs` reads an
  ephemeral program's logs until 10 minutes after it finished; afterwards it
  returns 404, although the log files stay on disk.
  `cron` schedules shell commands and records recent runs of managed jobs
  when run reporting is available (`cron.runs.list` includes status, exit
  code, and start and finish times; `cron.entries.run` starts an eligible
  entry now). It does not capture output, and its runs are not daemon
  programs. "Show me the log of my scheduled job" → read the file the
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
when you recover from a wrong path** (a hallucinated route, the wrong
namespace for a fuzzy query), **save it to
memory** under a short tag so the next call is cheap and accurate:

- `[Hoody/api]` — control-plane calls (`api.hoody.com/...`)
- `[Hoody/kit:<name>]` — per-kit URL shape + auth (`terminal`, `display`, `files`, `exec`, `notifications`, …)
- `[Hoody/mcp]` — `chatbot.hoody.com/mcp` (JSON-RPC) or `/api/chat` (SSE)
- `[Hoody/gotcha]` — surprising behaviour, wrong-path corrections

The point of the tag is **grep-findability**. A future agent (or future
you) sees the bracketed prefix in its memory index and jumps to the
verified call shape without re-reading the whole skill.
